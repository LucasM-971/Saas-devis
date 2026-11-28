import smtplib
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import select

from app.api.deps import ActiveMembership, DbSession
from app.email.sender import EmailNotConfigured
from app.models import Company, Quote, QuoteLine
from app.schemas.quote import (
    QuoteCreate,
    QuoteDraftLine,
    QuoteDraftOut,
    QuoteLineOut,
    QuoteOut,
    StatusUpdate,
)
from app.services import audit_service, quote_import
from app.services.permissions import require_writer
from app.services.pricing_engine import LineInput, compute_quote
from app.services.quota import quote_quota
from app.services.quote_mailer import send_quote_email
from app.services.quote_pdf import PdfUnavailable, render_quote_pdf
from app.services.company_setup import primary_metier
from app.services.sample_quote import build_sample_quote
from app.services.quote_state_machine import InvalidTransition, assert_transition, can_transition
from app.services.quote_status import to_en, to_fr
from app.services.references import next_quote_reference

# Taille maximale d'un fichier importé (5 Mo) : borne l'usage mémoire du parsing.
MAX_IMPORT_BYTES = 5 * 1024 * 1024

router = APIRouter(prefix="/api/v1/quotes", tags=["quotes"])

# Libellé d'audit par statut cible.
_STATUS_AUDIT_LABELS = {
    "pending": "a mis en attente le devis",
    "validated": "a validé le devis",
    "sent": "a envoyé le devis",
    "accepted": "a marqué accepté le devis",
    "rejected": "a marqué refusé le devis",
    "expired": "a marqué expiré le devis",
}


def _serialize(quote: Quote) -> QuoteOut:
    client_name = " ".join(
        p for p in [quote.customer_first_name, quote.customer_last_name] if p
    )
    return QuoteOut(
        id=str(quote.id),
        reference=quote.reference,
        clientName=client_name,
        clientEmail=quote.customer_email,
        status=to_fr(quote.status),
        emailStatus=quote.email_status,
        vatRate=float(quote.tax_rate) / 100,
        discountType=quote.discount_type,
        discountValue=float(quote.discount_value or 0),
        notes=quote.notes,
        createdAt=quote.created_at.date().isoformat(),
        conversationId=str(quote.conversation_id) if quote.conversation_id else None,
        lines=[
            QuoteLineOut(
                id=str(line.id),
                label=line.label,
                quantity=float(line.quantity),
                unitPrice=float(line.unit_price),
                unit=line.unit,
            )
            for line in sorted(quote.lines, key=lambda x: x.position)
        ],
    )


# Recalcule les montants du devis à partir du payload (source de vérité serveur).
def _apply_computation(quote: Quote, payload: QuoteCreate) -> None:
    tax_rate = Decimal(str(payload.vatRate * 100))
    computed = compute_quote(
        [
            LineInput(l.label, l.unit, Decimal(str(l.unitPrice)), Decimal(str(l.quantity)))
            for l in payload.lines
        ],
        tax_rate,
        discount_type=payload.discountType,
        discount_value=Decimal(str(payload.discountValue)),
    )
    # Découpe le nom complet en prénom/nom, tronqué à 100 caractères
    first, _, last = payload.clientName.strip().partition(" ")
    quote.customer_first_name = first[:100]
    quote.customer_last_name = last[:100] or None
    quote.customer_email = payload.clientEmail
    quote.tax_rate = tax_rate
    quote.discount_type = payload.discountType
    quote.discount_value = Decimal(str(payload.discountValue))
    quote.notes = payload.notes
    quote.subtotal = computed.subtotal
    quote.total = computed.total
    quote.lines = [
        QuoteLine(
            label=c.label,
            unit=c.unit,
            quantity=c.quantity,
            unit_price=c.unit_price,
            line_total=c.line_total,
            position=i,
        )
        for i, c in enumerate(computed.lines)
    ]


@router.get("", response_model=list[QuoteOut])
def list_quotes(db: DbSession, membership: ActiveMembership) -> list[QuoteOut]:
    quotes = db.scalars(
        select(Quote).where(Quote.company_id == membership.company_id).order_by(Quote.created_at.desc())
    ).all()
    return [_serialize(q) for q in quotes]


# Verrou de ligne : évite qu'un PATCH concurrent modifie un devis déjà envoyé
def _get_owned_quote(db: DbSession, membership: ActiveMembership, quote_id: int) -> Quote:
    quote = db.get(Quote, quote_id, with_for_update=True)
    if quote is None or quote.company_id != membership.company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Devis introuvable")
    return quote


# Refuse la création si le quota mensuel de devis est atteint (plan gratuit).
def _assert_quota(db: DbSession, membership: ActiveMembership) -> None:
    company = db.get(Company, membership.company_id)
    quota = quote_quota(db, membership.company_id, company.plan if company else "free")
    if quota.exhausted:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Quota atteint ({quota.limit} devis/mois en plan gratuit). "
            "Passez au plan Premium pour créer des devis en illimité.",
        )


# Persiste un devis brouillon à partir d'un payload (création manuelle ou exemple).
def _create_draft(
    db: DbSession, membership: ActiveMembership, payload: QuoteCreate, audit_action: str
) -> QuoteOut:
    quote = Quote(
        company_id=membership.company_id,
        reference=next_quote_reference(db, membership.company_id),
        status="draft",
        created_by=membership.user_id,
    )
    _apply_computation(quote, payload)
    db.add(quote)
    audit_service.record(
        db, company_id=membership.company_id, type_="quote",
        action=audit_action, target=quote.reference, actor_user_id=membership.user_id,
    )
    db.commit()
    db.refresh(quote)
    return _serialize(quote)


# Statuts dont le contenu n'est plus modifiable
_LOCKED_STATUSES = ("sent", "accepted", "rejected", "expired")


# Extrait un brouillon depuis un fichier (PDF/DOCX/texte), sans rien enregistrer.
@router.post("/import", response_model=QuoteDraftOut)
def import_quote(
    membership: ActiveMembership,
    file: UploadFile = File(...),
) -> QuoteDraftOut:
    require_writer(membership)
    content = file.file.read(MAX_IMPORT_BYTES + 1)
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Fichier vide.")
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "Fichier trop volumineux (5 Mo maximum).",
        )
    try:
        draft = quote_import.build_draft(file.filename or "", content)
    except quote_import.UnsupportedFile as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    return QuoteDraftOut(
        clientName=draft.client_name,
        clientEmail=draft.client_email,
        vatRate=draft.vat_rate,
        notes=draft.notes,
        lines=[
            QuoteDraftLine(
                label=l.label,
                quantity=l.quantity,
                unitPrice=l.unit_price,
                unit=l.unit,
            )
            for l in draft.lines
        ],
        parsed=bool(draft.lines),
    )


@router.post("", response_model=QuoteOut, status_code=status.HTTP_201_CREATED)
def create_quote(payload: QuoteCreate, db: DbSession, membership: ActiveMembership) -> QuoteOut:
    require_writer(membership)
    _assert_quota(db, membership)
    return _create_draft(db, membership, payload, "a créé le devis")


# Importe un devis « exemple » prêt à modifier, adapté au métier de l'entreprise.
@router.post("/sample", response_model=QuoteOut, status_code=status.HTTP_201_CREATED)
def create_sample_quote(db: DbSession, membership: ActiveMembership) -> QuoteOut:
    require_writer(membership)
    _assert_quota(db, membership)
    company = db.get(Company, membership.company_id)
    payload = build_sample_quote(primary_metier(company.metier) if company else None)
    return _create_draft(db, membership, payload, "a importé un devis exemple")


@router.patch("/{quote_id}", response_model=QuoteOut)
def update_quote(
    quote_id: int, payload: QuoteCreate, db: DbSession, membership: ActiveMembership
) -> QuoteOut:
    require_writer(membership)
    quote = _get_owned_quote(db, membership, quote_id)
    if quote.status in _LOCKED_STATUSES:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Ce devis a été envoyé ou clôturé : son contenu ne peut plus être modifié.",
        )
    _apply_computation(quote, payload)
    # Retouché par l'artisan : le chat ne l'écrasera plus
    quote.artisan_edited = True
    audit_service.record(
        db, company_id=membership.company_id, type_="quote",
        action="a modifié le devis", target=quote.reference, actor_user_id=membership.user_id,
    )
    db.commit()
    db.refresh(quote)
    return _serialize(quote)


@router.patch("/{quote_id}/status", response_model=QuoteOut)
def update_status(
    quote_id: int, payload: StatusUpdate, db: DbSession, membership: ActiveMembership
) -> QuoteOut:
    require_writer(membership)
    quote = _get_owned_quote(db, membership, quote_id)
    target = to_en(payload.status)
    try:
        assert_transition(quote.status, target)
    except InvalidTransition as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    quote.status = target
    audit_service.record(
        db, company_id=membership.company_id, type_="quote",
        action=_STATUS_AUDIT_LABELS.get(target, "a changé le statut du devis"),
        target=quote.reference, actor_user_id=membership.user_id,
    )
    db.commit()
    db.refresh(quote)
    return _serialize(quote)


# Envoie le devis en PDF au client (synchrone) et stocke le PDF envoyé.
@router.post("/{quote_id}/send", response_model=QuoteOut)
def send_quote(quote_id: int, db: DbSession, membership: ActiveMembership) -> QuoteOut:
    require_writer(membership)
    quote = _get_owned_quote(db, membership, quote_id)
    if not quote.customer_email:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Renseignez l'e-mail du client avant d'envoyer le devis.",
        )
    if not can_transition(quote.status, "sent"):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Le devis doit être validé avant d'être envoyé au client.",
        )

    company = db.get(Company, membership.company_id)
    try:
        pdf = render_quote_pdf(quote, company)
    except PdfUnavailable as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Génération du PDF indisponible sur ce serveur (WeasyPrint).",
        ) from exc

    try:
        send_quote_email(quote, company, pdf)
    except EmailNotConfigured as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Envoi d'e-mails non configuré sur ce serveur (SMTP).",
        ) from exc
    except (smtplib.SMTPException, OSError) as exc:
        # Échec d'envoi : statut inchangé
        quote.email_status = "failed"
        db.commit()
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "L'envoi de l'e-mail a échoué. Vérifiez l'adresse du client ou réessayez.",
        ) from exc

    quote.email_status = "sent"
    quote.sent_pdf = pdf
    quote.status = "sent"
    quote.sent_at = datetime.now(timezone.utc).replace(tzinfo=None)
    audit_service.record(
        db, company_id=membership.company_id, type_="quote",
        action="a envoyé le devis par e-mail", target=quote.reference,
        actor_user_id=membership.user_id,
    )
    db.commit()
    db.refresh(quote)
    return _serialize(quote)


# Supprime un brouillon (les devis engagés se clôturent via les statuts).
@router.delete("/{quote_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quote(quote_id: int, db: DbSession, membership: ActiveMembership) -> None:
    require_writer(membership)
    quote = _get_owned_quote(db, membership, quote_id)
    if quote.status != "draft":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Seul un brouillon peut être supprimé — marquez plutôt le devis refusé ou expiré.",
        )
    audit_service.record(
        db, company_id=membership.company_id, type_="quote",
        action="a supprimé le brouillon", target=quote.reference,
        actor_user_id=membership.user_id,
    )
    db.delete(quote)
    db.commit()

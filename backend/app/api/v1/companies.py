import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.api.deps import ActiveMembership, CurrentUser, DbSession
from app.models import Company, Membership
from app.schemas.company import CompanyCreateIn, CompanyDetailOut, CompanyUpdateIn
from app.services.company_setup import (
    is_known_metier,
    parse_metiers,
    primary_metier,
    sync_service_with_metier,
    sync_services_with_metiers,
)
from app.services.features import FREE_MAX_OWNED_COMPANIES, has_feature
from app.services.permissions import require_admin
from app.services.slugs import unique_company_slug

router = APIRouter(prefix="/api/v1/companies", tags=["companies"])


def serialize_company(company: Company) -> CompanyDetailOut:
    return CompanyDetailOut(
        id=str(company.id),
        publicId=company.public_id,
        name=company.name,
        siret=company.siret,
        address=company.address,
        contactEmail=company.contact_email,
        contactPhone=company.contact_phone,
        defaultVatRate=float(company.default_vat_rate),
        metier=primary_metier(company.metier),
        metiers=parse_metiers(company.metier),
        plan=company.plan,
        legalForm=company.legal_form,
        shareCapital=company.share_capital,
        rcsRm=company.rcs_rm,
        apeCode=company.ape_code,
        vatNumber=company.vat_number,
        vatExempt=company.vat_exempt,
        insuranceName=company.insurance_name,
        insuranceContract=company.insurance_contract,
        insuranceCoverage=company.insurance_coverage,
        mediatorName=company.mediator_name,
        mediatorUrl=company.mediator_url,
    )


@router.get("/current", response_model=CompanyDetailOut)
def get_current_company(db: DbSession, membership: ActiveMembership) -> CompanyDetailOut:
    company = db.get(Company, membership.company_id)
    if company is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entreprise introuvable")
    return serialize_company(company)


@router.patch("/current", response_model=CompanyDetailOut)
def update_current_company(
    payload: CompanyUpdateIn, db: DbSession, membership: ActiveMembership
) -> CompanyDetailOut:
    require_admin(membership)
    company = db.get(Company, membership.company_id)
    if company is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entreprise introuvable")

    if payload.name is not None:
        company.name = payload.name
    if payload.siret is not None:
        company.siret = payload.siret or None
    if payload.address is not None:
        company.address = payload.address or None
    if payload.contactEmail is not None:
        company.contact_email = payload.contactEmail or None
    if payload.contactPhone is not None:
        company.contact_phone = payload.contactPhone or None
    if payload.defaultVatRate is not None:
        company.default_vat_rate = payload.defaultVatRate
    if payload.metiers is not None:
        metiers = list(dict.fromkeys(payload.metiers))
        if any(not is_known_metier(m) for m in metiers):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Métier inconnu")
        company.metier = ",".join(metiers) or None
        sync_services_with_metiers(db, company.id, metiers)
    elif payload.metier is not None:
        if payload.metier and not is_known_metier(payload.metier):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Métier inconnu")
        company.metier = payload.metier or None
        # Le métier définit le service chiffrable par le chat
        if company.metier:
            sync_service_with_metier(db, company.id, company.metier)

    # Champs vides → NULL
    _LEGAL_TEXT_FIELDS = {
        "legalForm": "legal_form",
        "shareCapital": "share_capital",
        "rcsRm": "rcs_rm",
        "apeCode": "ape_code",
        "vatNumber": "vat_number",
        "insuranceName": "insurance_name",
        "insuranceContract": "insurance_contract",
        "insuranceCoverage": "insurance_coverage",
        "mediatorName": "mediator_name",
        "mediatorUrl": "mediator_url",
    }
    for field, column in _LEGAL_TEXT_FIELDS.items():
        value = getattr(payload, field)
        if value is not None:
            setattr(company, column, value or None)
    if payload.vatExempt is not None:
        company.vat_exempt = payload.vatExempt

    db.commit()
    db.refresh(company)
    return serialize_company(company)


# Crée un espace entreprise supplémentaire (gate premium : multi_company).
@router.post("", response_model=CompanyDetailOut, status_code=status.HTTP_201_CREATED)
def create_company(
    payload: CompanyCreateIn, db: DbSession, current_user: CurrentUser
) -> CompanyDetailOut:
    owned = (
        db.scalar(
            select(func.count())
            .select_from(Membership)
            .join(Company, Membership.company_id == Company.id)
            .where(
                Membership.user_id == current_user.id,
                Membership.role == "owner",
                Company.is_active.is_(True),
            )
        )
        or 0
    )
    # Multi-entreprises réservé au premium
    if owned >= FREE_MAX_OWNED_COMPANIES:
        plans = db.scalars(
            select(Company.plan)
            .join(Membership, Membership.company_id == Company.id)
            .where(Membership.user_id == current_user.id, Membership.role == "owner")
        ).all()
        if not any(has_feature(p, "multi_company") for p in plans):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Fonctionnalité premium : passez au plan Premium pour gérer plusieurs entreprises.",
            )

    if payload.metier and not is_known_metier(payload.metier):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Métier inconnu")

    company = Company(
        public_id=str(uuid.uuid4()),
        name=payload.name,
        slug=unique_company_slug(db, payload.name),
        siret=payload.siret,
        address=payload.address,
        contact_email=payload.contactEmail,
        contact_phone=payload.contactPhone,
        metier=payload.metier,
    )
    db.add(company)
    db.flush()
    db.add(Membership(user_id=current_user.id, company_id=company.id, role="owner"))
    if company.metier:
        sync_service_with_metier(db, company.id, company.metier)
    db.commit()
    db.refresh(company)
    return serialize_company(company)

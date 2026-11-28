from decimal import Decimal

from sqlalchemy import CHAR, Enum, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import IdMixin, TimestampMixin

# Tiers d'abonnement (Stripe gelé : le passage premium est simulé côté API).
PLANS = ("free", "premium")


class Company(IdMixin, TimestampMixin, Base):
    __tablename__ = "companies"

    public_id: Mapped[str] = mapped_column(CHAR(36), unique=True)
    name: Mapped[str] = mapped_column(String(150))
    slug: Mapped[str] = mapped_column(String(150), unique=True)
    siret: Mapped[str | None] = mapped_column(String(20))
    address: Mapped[str | None] = mapped_column(String(255))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(30))
    # TVA par défaut en ratio (0.200 = 20 %), alignée sur le front.
    default_vat_rate: Mapped[Decimal] = mapped_column(Numeric(4, 3), default=Decimal("0.200"))
    # Métiers du bâtiment, séparés par des virgules ; le premier est le principal.
    metier: Mapped[str | None] = mapped_column(String(120))
    plan: Mapped[str] = mapped_column(Enum(*PLANS), default="free")
    is_active: Mapped[bool] = mapped_column(default=True)

    # ── Mentions légales (facultatives) ──
    legal_form: Mapped[str | None] = mapped_column(String(60))  # SARL, SASU, auto-entrepreneur…
    share_capital: Mapped[str | None] = mapped_column(String(40))  # capital social (ex. « 5 000 € »)
    rcs_rm: Mapped[str | None] = mapped_column(String(120))  # immatriculation RCS ou RM (+ ville)
    ape_code: Mapped[str | None] = mapped_column(String(10))  # code APE / NAF
    vat_number: Mapped[str | None] = mapped_column(String(30))  # n° TVA intracommunautaire
    # Franchise en base de TVA (art. 293 B du CGI)
    vat_exempt: Mapped[bool] = mapped_column(default=False)
    # Assurance décennale (obligatoire pour les métiers du bâtiment, loi n° 2014-344).
    insurance_name: Mapped[str | None] = mapped_column(String(120))  # assureur
    insurance_contract: Mapped[str | None] = mapped_column(String(80))  # n° de contrat / police
    insurance_coverage: Mapped[str | None] = mapped_column(String(160))  # couverture géographique
    # Médiateur de la consommation (obligatoire en B2C, art. L612-1 code de la conso).
    mediator_name: Mapped[str | None] = mapped_column(String(120))
    mediator_url: Mapped[str | None] = mapped_column(String(255))

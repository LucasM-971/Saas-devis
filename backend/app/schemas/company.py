from pydantic import BaseModel, Field

# Schémas alignés sur le type Company du front (camelCase, TVA en ratio 0..1).


class CompanyDetailOut(BaseModel):
    id: str
    publicId: str
    name: str
    siret: str | None = None
    address: str | None = None
    contactEmail: str | None = None
    contactPhone: str | None = None
    defaultVatRate: float = 0.2
    metier: str | None = None  # métier principal
    metiers: list[str] = []
    plan: str = "free"
    # Mentions légales françaises (affichées sur les devis).
    legalForm: str | None = None
    shareCapital: str | None = None
    rcsRm: str | None = None
    apeCode: str | None = None
    vatNumber: str | None = None
    vatExempt: bool = False
    insuranceName: str | None = None
    insuranceContract: str | None = None
    insuranceCoverage: str | None = None
    mediatorName: str | None = None
    mediatorUrl: str | None = None


# Longueurs alignées sur les colonnes
class CompanyUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    siret: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=255)
    contactEmail: str | None = Field(default=None, max_length=255)
    contactPhone: str | None = Field(default=None, max_length=30)
    defaultVatRate: float | None = Field(default=None, ge=0, le=1)
    metier: str | None = Field(default=None, max_length=30)
    metiers: list[str] | None = Field(default=None, max_length=6)
    # Mentions légales françaises (facultatives, mise à jour partielle).
    legalForm: str | None = Field(default=None, max_length=60)
    shareCapital: str | None = Field(default=None, max_length=40)
    rcsRm: str | None = Field(default=None, max_length=120)
    apeCode: str | None = Field(default=None, max_length=10)
    vatNumber: str | None = Field(default=None, max_length=30)
    vatExempt: bool | None = None
    insuranceName: str | None = Field(default=None, max_length=120)
    insuranceContract: str | None = Field(default=None, max_length=80)
    insuranceCoverage: str | None = Field(default=None, max_length=160)
    mediatorName: str | None = Field(default=None, max_length=120)
    mediatorUrl: str | None = Field(default=None, max_length=255)


class CompanyCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    siret: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=255)
    contactEmail: str | None = Field(default=None, max_length=255)
    contactPhone: str | None = Field(default=None, max_length=30)
    metier: str | None = Field(default=None, max_length=30)

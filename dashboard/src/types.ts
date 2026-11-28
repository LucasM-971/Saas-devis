// Modèle de domaine partagé côté front (aligné sur le futur backend).

import type { TradeId } from '@/lib/trades';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export type QuoteStatus =
  | 'brouillon' // généré par l'IA, non revu
  | 'en_attente' // en attente de traitement
  | 'pret' // prêt à être validé
  | 'envoye' // envoyé au client
  | 'accepte' // accepté par le client
  | 'refuse' // refusé par le client
  | 'expire'; // expiré

export type User = {
  id: string;
  name: string;
  email: string;
};

export type Plan = 'free' | 'premium';

export type Company = {
  id: string;
  publicId?: string; // identifiant public (UUID) — lien de chat partageable & widget
  name: string;
  siret?: string;
  address?: string;
  contactEmail?: string; // email de contact affiché sur les devis
  contactPhone?: string; // téléphone de contact
  defaultVatRate?: number; // ex. 0.20
  metier?: TradeId; // métier principal (pilote le catalogue de prestations)
  metiers?: TradeId[]; // tous les métiers exercés (le premier est le principal)
  plan?: Plan; // tier d'abonnement (gates premium)
  // ── Mentions légales françaises affichées sur les devis ──────────────────
  legalForm?: string; // forme juridique (SARL, SASU, auto-entrepreneur…)
  shareCapital?: string; // capital social (ex. « 5 000 € »)
  rcsRm?: string; // immatriculation RCS ou RM (+ ville)
  apeCode?: string; // code APE / NAF
  vatNumber?: string; // n° TVA intracommunautaire
  vatExempt?: boolean; // franchise en base de TVA (art. 293 B du CGI)
  insuranceName?: string; // assureur (décennale)
  insuranceContract?: string; // n° de contrat / police d'assurance
  insuranceCoverage?: string; // couverture géographique de l'assurance
  mediatorName?: string; // médiateur de la consommation
  mediatorUrl?: string; // site du médiateur
};

// Réponse de GET /api/v1/billing/plan : drapeaux + quota du mois.
export type PlanInfo = {
  plan: Plan;
  features: Record<string, boolean>;
  quoteQuota: { used: number; limit: number | null };
};

// Offre du catalogue public (GET /api/v1/billing/plans) — section Tarifs de la landing.
export type PublicPlan = {
  id: Plan;
  name: string;
  tagline: string;
  features: string[];
  quoteLimit: number | null; // devis / mois ; null = illimité
  featured: boolean;
};

// Compteurs réels de la plateforme (GET /api/v1/stats/platform) — landing.
export type PlatformStats = {
  quotesGenerated: number;
  companiesRegistered: number;
  leadsCaptured: number;
};

export type Membership = {
  company: Company;
  role: Role;
};

// Membre d'une équipe (page Réglages › Membres).
export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'active' | 'invited';
};

export type QuoteLine = {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number; // en euros HT
  unit?: string; // m2, ml, m3, unit, hour, flat
};

export type DiscountType = 'percent' | 'amount';

export type Quote = {
  id: string;
  reference: string;
  clientName: string;
  clientEmail?: string;
  status: QuoteStatus;
  emailStatus?: 'none' | 'sent' | 'failed'; // résultat du dernier envoi au client
  lines: QuoteLine[];
  vatRate: number; // ex. 0.20 pour 20 %
  discountType?: DiscountType | null; // remise globale (null = aucune)
  discountValue?: number; // % ou € selon discountType
  notes?: string | null; // conditions / mentions libres du devis
  createdAt: string; // ISO
  conversationId?: string; // chat qui a généré ce devis (transcription consultable)
};

// Brouillon renvoyé par POST /api/v1/quotes/import (non enregistré).
export type QuoteDraft = {
  clientName: string;
  clientEmail?: string | null;
  vatRate: number;
  notes?: string | null;
  lines: { label: string; quantity: number; unitPrice: number; unit: string }[];
  parsed: boolean; // au moins une ligne exploitable a été extraite
};

export type Lead = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  source: string;
  createdAt: string;
  quoteId?: string; // renseigné une fois le prospect converti en devis
  conversationId?: string; // chat qui a capté ce prospect (transcription consultable)
};

// Un message de la transcription du chat (client ↔ chatbot).
export type ChatTranscriptMessage = {
  role: 'user' | 'assistant';
  content: string;
};

// Transcription complète d'une conversation rattachée à un devis ou un prospect.
export type Conversation = {
  id: string;
  status: string;
  createdAt: string;
  completedAt?: string | null;
  messages: ChatTranscriptMessage[];
};

export type CanvasElType =
  | 'logo'
  | 'company_name'
  | 'quote_label'
  | 'meta_block'
  | 'client_block'
  | 'table'
  | 'totals_block'
  | 'company_details' // identité légale de l'émetteur (SIRET, forme juridique…)
  | 'conditions' // conditions / mentions du devis (notes)
  | 'legal_block' // mentions légales obligatoires (assurance, TVA, médiation)
  | 'signature' // cadre « Bon pour accord » à faire signer
  | 'footer_text'
  | 'custom_text'
  | 'shape_rect'
  | 'shape_ellipse'
  | 'shape_triangle'
  | 'shape_line'
  | 'image';

export type CanvasEl = {
  id: string;
  type: CanvasElType;
  x: number;       // points PDF (0-595)
  y: number;       // points PDF (0-842)
  w: number;
  h: number;
  content?: string;    // texte libre uniquement
  fontSize?: number;
  bold?: boolean;
  color?: string;      // hex
  align?: 'left' | 'center' | 'right';
  italic?: boolean;
  underline?: boolean;
  fill?: string;        // formes : couleur de remplissage ('' = aucun)
  stroke?: string;      // formes : couleur du contour
  strokeWidth?: number; // formes : épaisseur du contour (pt)
  radius?: number;      // rectangle : arrondi des coins (pt)
  dashed?: boolean;     // contour / ligne en pointillés
  fontFamily?: 'helvetica' | 'times' | 'courier';
  lineHeight?: number;  // interligne (×taille)
  uppercase?: boolean;
  opacity?: number;     // 0-1
  src?: string;         // image : data URL
  locked?: boolean;
  visible: boolean;
  // Blocs de données : personnalisation du rendu.
  accent?: string;      // couleur d'accent (titre DEVIS, total TTC, filet)
  textScale?: number;   // multiplicateur de taille du texte (1 = défaut)
  tableStyle?: TableStyle;
};

export type TableColumnKey = 'label' | 'quantity' | 'unit' | 'unitPrice' | 'total';

export type TableColumn = { key: TableColumnKey; label: string; visible: boolean };

export type TableStyle = {
  columns?: TableColumn[];   // ordre, libellés et visibilité
  headBg?: string;           // fond de l'en-tête
  headColor?: string;        // texte de l'en-tête
  textColor?: string;        // texte des lignes
  stripe?: string;           // couleur des lignes alternées ('' = aucune)
  border?: string;           // couleur des bordures ('' = aucune)
  showHead?: boolean;
};

// Catégorie d'événement du journal d'activité (pilote l'icône et la couleur).
export type QuoteTemplate = {
  accentColor: string;
  logoDataUrl: string | null;
  logoPosition: 'left' | 'center' | 'right';
  showReference: boolean;
  showDate: boolean;
  showClientEmail: boolean;
  showCompanyDetails: boolean; // identité légale de l'émetteur en en-tête
  showLegal: boolean;          // bloc de mentions légales obligatoires
  footerText: string;
  // Design importé : image (papier à en-tête / modèle) posée en fond de page A4.
  backgroundImageUrl?: string | null;
  canvasLayout?: CanvasEl[];  // mise en page libre (éditeur canvas)
};

export type AuditType = 'quote' | 'ai' | 'pricing' | 'lead' | 'member';

export type AuditEntry = {
  id: string;
  type: AuditType;
  actor: string;
  action: string;
  target: string;
  createdAt: string;
};

// Métiers supportés et prestations types par métier.

import {
  DoorOpen,
  Droplets,
  KeyRound,
  Leaf,
  PaintRoller,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export type TradeId =
  | 'reno'
  | 'plomberie'
  | 'electricite'
  | 'menuiserie'
  | 'peinture'
  | 'serrurerie';

// Prestation de la grille tarifaire (unit = clé d'unité, voir lib/units.ts).
export type CatalogItem = { id: string; label: string; unit: string; unitPrice: number };
export type CatalogSeed = Omit<CatalogItem, 'id'>;

export type Trade = {
  id: TradeId;
  label: string;
  tagline: string;
  icon: LucideIcon;
  vatRate: number; // TVA conseillée pour le métier
  tint: { icon: string; active: string }; // classes Tailwind (littérales pour le JIT)
  catalog: CatalogSeed[];
  // Catégories de tarif au m² proposées à l'assistant ; absent = métier non chiffré au m².
  m2Categories?: string[];
  // Boutons du message « Je veux un devis » du modèle de départ de l'assistant.
  projectTypes: string[];
};

export const TRADES: Trade[] = [
  {
    id: 'reno',
    label: 'Rénovation énergétique',
    tagline: 'Isolation, pompes à chaleur, panneaux solaires',
    icon: Leaf,
    vatRate: 0.055,
    tint: { icon: 'bg-emerald-100 text-emerald-700', active: 'border-emerald-500 bg-emerald-50' },
    m2Categories: ['Isolation', 'Toiture', 'Façade', 'Plancher'],
    projectTypes: ['Isolation', 'Chauffage / PAC', 'Solaire', 'Autre projet'],
    catalog: [
      { label: 'Isolation des combles perdus', unit: 'm2', unitPrice: 25 },
      { label: "Isolation des murs par l'extérieur (ITE)", unit: 'm2', unitPrice: 130 },
      { label: 'Pompe à chaleur air/eau', unit: 'flat', unitPrice: 12000 },
      { label: 'Pompe à chaleur air/air', unit: 'flat', unitPrice: 6500 },
      { label: 'Chauffe-eau thermodynamique', unit: 'unit', unitPrice: 2800 },
      { label: 'Panneaux solaires photovoltaïques 3 kWc', unit: 'flat', unitPrice: 8500 },
      { label: 'VMC double flux', unit: 'flat', unitPrice: 4500 },
      { label: 'Remplacement fenêtres double vitrage', unit: 'unit', unitPrice: 480 },
    ],
  },
  {
    id: 'plomberie',
    label: 'Plomberie / chauffage',
    tagline: 'Sanitaire, chauffage, dépannage',
    icon: Droplets,
    vatRate: 0.1,
    tint: { icon: 'bg-sky-100 text-sky-700', active: 'border-sky-500 bg-sky-50' },
    projectTypes: ['Dépannage / fuite', 'Chauffe-eau / chaudière', 'Salle de bain', 'Autre projet'],
    catalog: [
      { label: 'Recherche de fuite', unit: 'flat', unitPrice: 90 },
      { label: 'Remplacement chauffe-eau électrique', unit: 'unit', unitPrice: 650 },
      { label: 'Installation WC suspendu', unit: 'unit', unitPrice: 450 },
      { label: 'Pose de robinetterie', unit: 'unit', unitPrice: 120 },
      { label: 'Débouchage de canalisation', unit: 'flat', unitPrice: 150 },
      { label: 'Installation chaudière gaz à condensation', unit: 'flat', unitPrice: 3800 },
      { label: 'Rénovation complète salle de bain', unit: 'flat', unitPrice: 6500 },
      { label: "Main-d'œuvre plombier", unit: 'hour', unitPrice: 55 },
    ],
  },
  {
    id: 'electricite',
    label: 'Électricité',
    tagline: 'Mise aux normes, installations, dépannage',
    icon: Zap,
    vatRate: 0.1,
    tint: { icon: 'bg-amber-100 text-amber-700', active: 'border-amber-500 bg-amber-50' },
    projectTypes: ['Dépannage', 'Mise aux normes', 'Nouvelle installation', 'Autre projet'],
    catalog: [
      { label: 'Mise aux normes du tableau électrique', unit: 'flat', unitPrice: 1200 },
      { label: 'Remplacement tableau électrique', unit: 'unit', unitPrice: 850 },
      { label: 'Pose de prise ou interrupteur', unit: 'unit', unitPrice: 45 },
      { label: "Installation d'un point lumineux", unit: 'unit', unitPrice: 75 },
      { label: 'Diagnostic électrique', unit: 'flat', unitPrice: 120 },
      { label: 'Tirage de ligne / câblage', unit: 'ml', unitPrice: 25 },
      { label: 'Installation borne de recharge véhicule', unit: 'flat', unitPrice: 1300 },
      { label: "Main-d'œuvre électricien", unit: 'hour', unitPrice: 50 },
    ],
  },
  {
    id: 'menuiserie',
    label: 'Menuiserie / fenêtres',
    tagline: 'Fenêtres, portes, volets, parquet',
    icon: DoorOpen,
    vatRate: 0.1,
    tint: { icon: 'bg-orange-100 text-orange-700', active: 'border-orange-500 bg-orange-50' },
    m2Categories: ['Parquet', 'Baie vitrée', 'Terrasse'],
    projectTypes: ['Fenêtres', 'Portes', 'Volets', 'Autre projet'],
    catalog: [
      { label: 'Fenêtre PVC double vitrage', unit: 'unit', unitPrice: 480 },
      { label: 'Fenêtre aluminium', unit: 'unit', unitPrice: 720 },
      { label: "Porte d'entrée", unit: 'unit', unitPrice: 1500 },
      { label: 'Porte de garage sectionnelle', unit: 'unit', unitPrice: 1800 },
      { label: 'Volet roulant électrique', unit: 'unit', unitPrice: 650 },
      { label: 'Baie vitrée coulissante', unit: 'm2', unitPrice: 850 },
      { label: 'Pose de parquet', unit: 'm2', unitPrice: 45 },
      { label: 'Placard sur mesure', unit: 'ml', unitPrice: 550 },
    ],
  },
  {
    id: 'peinture',
    label: 'Peinture / revêtements',
    tagline: 'Peinture, sols et murs, au m²',
    icon: PaintRoller,
    vatRate: 0.1,
    tint: { icon: 'bg-violet-100 text-violet-700', active: 'border-violet-500 bg-violet-50' },
    m2Categories: ['Mur', 'Plafond', 'Sol', 'Façade'],
    projectTypes: ['Peinture', 'Sols', 'Papier peint', 'Autre projet'],
    catalog: [
      { label: 'Peinture murs (2 couches)', unit: 'm2', unitPrice: 28 },
      { label: 'Peinture plafond', unit: 'm2', unitPrice: 32 },
      { label: 'Enduit de lissage', unit: 'm2', unitPrice: 18 },
      { label: 'Pose de papier peint', unit: 'm2', unitPrice: 25 },
      { label: 'Pose de carrelage sol', unit: 'm2', unitPrice: 55 },
      { label: 'Pose de parquet stratifié', unit: 'm2', unitPrice: 35 },
      { label: 'Ragréage de sol', unit: 'm2', unitPrice: 22 },
      { label: 'Préparation et protection des surfaces', unit: 'flat', unitPrice: 250 },
    ],
  },
  {
    id: 'serrurerie',
    label: 'Serrurerie / dépannage',
    tagline: 'Ouverture, serrures, blindage',
    icon: KeyRound,
    vatRate: 0.2,
    tint: { icon: 'bg-slate-200 text-slate-700', active: 'border-slate-500 bg-slate-100' },
    projectTypes: ['Porte claquée / bloquée', 'Changer une serrure', 'Blindage', 'Autre besoin'],
    catalog: [
      { label: 'Ouverture de porte claquée', unit: 'flat', unitPrice: 90 },
      { label: 'Ouverture de porte fermée à clé', unit: 'flat', unitPrice: 150 },
      { label: 'Remplacement de cylindre (barillet)', unit: 'unit', unitPrice: 120 },
      { label: 'Installation serrure multipoints', unit: 'unit', unitPrice: 350 },
      { label: 'Blindage de porte', unit: 'flat', unitPrice: 900 },
      { label: 'Installation porte blindée', unit: 'unit', unitPrice: 2200 },
      { label: 'Reproduction de clé', unit: 'unit', unitPrice: 15 },
      { label: "Dépannage d'urgence (déplacement)", unit: 'flat', unitPrice: 130 },
    ],
  },
];

export function getTrade(id: TradeId | null | undefined): Trade | undefined {
  return TRADES.find((t) => t.id === id);
}

import type { CanvasEl, CanvasElType, TableColumn, TableStyle } from '@/types';

export const ELEMENT_META: Record<CanvasElType, { label: string; color: string }> = {
  logo:            { label: 'Logo',                color: '#8b5cf6' },
  company_name:    { label: 'Nom entreprise',      color: '#3b82f6' },
  company_details: { label: 'Coordonnées légales', color: '#0891b2' },
  quote_label:     { label: 'Titre « DEVIS »',     color: '#6366f1' },
  meta_block:      { label: 'Référence / Date',    color: '#0ea5e9' },
  client_block:    { label: 'Bloc client',         color: '#10b981' },
  table:           { label: 'Tableau des postes',  color: '#f59e0b' },
  totals_block:    { label: 'Totaux HT/TTC',       color: '#f97316' },
  conditions:      { label: 'Conditions',          color: '#14b8a6' },
  legal_block:     { label: 'Mentions légales',    color: '#dc2626' },
  signature:       { label: 'Signature client',    color: '#a855f7' },
  footer_text:     { label: 'Pied de page',        color: '#64748b' },
  custom_text:     { label: 'Texte libre',         color: '#ec4899' },
  shape_rect:      { label: 'Rectangle',           color: '#ec4899' },
  shape_ellipse:   { label: 'Cercle',              color: '#ec4899' },
  shape_triangle:  { label: 'Triangle',            color: '#ec4899' },
  shape_line:      { label: 'Ligne',               color: '#ec4899' },
  image:           { label: 'Image',               color: '#ec4899' },
};

// Éléments créés par l'utilisateur (supprimables, rendus tels quels).
export const CUSTOM_TYPES: ReadonlySet<CanvasElType> = new Set([
  'custom_text', 'shape_rect', 'shape_ellipse', 'shape_triangle', 'shape_line', 'image',
]);

export const DEFAULT_CANVAS_LAYOUT: CanvasEl[] = [
  { id: 'logo',            type: 'logo',            x: 40,  y: 28,  w: 110, h: 46,  visible: true },
  { id: 'company_name',    type: 'company_name',    x: 40,  y: 80,  w: 260, h: 16,  visible: true },
  { id: 'company_details', type: 'company_details', x: 40,  y: 98,  w: 270, h: 74,  visible: true },
  { id: 'quote_label',     type: 'quote_label',     x: 380, y: 32,  w: 175, h: 30,  visible: true },
  { id: 'meta_block',      type: 'meta_block',      x: 355, y: 72,  w: 200, h: 40,  visible: true },
  { id: 'client_block',    type: 'client_block',    x: 340, y: 120, w: 215, h: 64,  visible: true },
  { id: 'table',           type: 'table',           x: 40,  y: 196, w: 515, h: 120, visible: true },
  { id: 'totals_block',    type: 'totals_block',    x: 360, y: 440, w: 195, h: 82,  visible: true },
  { id: 'conditions',      type: 'conditions',      x: 40,  y: 560, w: 300, h: 60,  visible: true },
  { id: 'signature',       type: 'signature',       x: 375, y: 646, w: 180, h: 88,  visible: true },
  { id: 'legal_block',     type: 'legal_block',     x: 40,  y: 748, w: 515, h: 50,  visible: true },
  { id: 'footer_text',     type: 'footer_text',     x: 40,  y: 812, w: 515, h: 16,  visible: true },
];

// Ajoute les blocs manquants aux anciennes mises en page.
export function withDefaultElements(layout: CanvasEl[]): CanvasEl[] {
  const present = new Set(layout.map((e) => e.type));
  const missing = DEFAULT_CANVAS_LAYOUT.filter(
    (e) => !CUSTOM_TYPES.has(e.type) && !present.has(e.type),
  );
  return missing.length ? [...layout, ...missing.map((e) => ({ ...e }))] : layout;
}

// ── Tableau des postes : colonnes et style par défaut ─────────────────────────
export const DEFAULT_TABLE_COLUMNS: TableColumn[] = [
  { key: 'label', label: 'Désignation', visible: true },
  { key: 'quantity', label: 'Qté', visible: true },
  { key: 'unit', label: 'Unité', visible: true },
  { key: 'unitPrice', label: 'PU HT', visible: true },
  { key: 'total', label: 'Total HT', visible: true },
];

export const COLUMN_ALIGN: Record<TableColumn['key'], 'left' | 'center' | 'right'> = {
  label: 'left', quantity: 'right', unit: 'center', unitPrice: 'right', total: 'right',
};

export const COLUMN_WIDTH: Record<TableColumn['key'], number | 'auto'> = {
  label: 'auto', quantity: 44, unit: 52, unitPrice: 78, total: 78,
};

export type ResolvedTableStyle = Required<Omit<TableStyle, 'columns'>> & { columns: TableColumn[] };

export function resolveTableStyle(st: TableStyle | undefined, accent: string): ResolvedTableStyle {
  // Complète les colonnes manquantes (anciens modèles) en gardant l'ordre choisi.
  const cols = st?.columns?.length ? [...st.columns] : DEFAULT_TABLE_COLUMNS.map((c) => ({ ...c }));
  for (const d of DEFAULT_TABLE_COLUMNS) if (!cols.some((c) => c.key === d.key)) cols.push({ ...d });
  return {
    columns: cols,
    headBg: st?.headBg || accent,
    headColor: st?.headColor || '#ffffff',
    textColor: st?.textColor || '#3c3c3c',
    stripe: st?.stripe ?? '#f5f5f5',
    border: st?.border ?? '',
    showHead: st?.showHead ?? true,
  };
}

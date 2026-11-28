import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { computeQuoteTotals } from './quote-math';
import { formatDate, formatPercent } from './format';
import { unitLabel } from './units';
import { COLUMN_ALIGN, COLUMN_WIDTH, DEFAULT_CANVAS_LAYOUT, resolveTableStyle, withDefaultElements } from './canvas-layout';
import type { CanvasEl, Company, Quote, QuoteTemplate } from '@/types';

// Infos entreprise pour le PDF ; seul le nom est requis.
export type PdfCompany = Partial<Company> & { name: string };

function eur(value: number): string {
  return `${value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`;
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [isNaN(r) ? 79 : r, isNaN(g) ? 70 : g, isNaN(b) ? 229 : b];
}

const DEFAULT_TEMPLATE: QuoteTemplate = {
  accentColor: '#4f46e5',
  logoDataUrl: null,
  logoPosition: 'left',
  showReference: true,
  showDate: true,
  showClientEmail: true,
  showCompanyDetails: true,
  showLegal: true,
  footerText: "Devis valable 30 jours à compter de sa date d'émission.",
  backgroundImageUrl: null,
};

// Format A4 en points (unité du document).
const A4 = { w: 595.28, h: 841.89 };

function getEl(layout: CanvasEl[], type: CanvasEl['type']): CanvasEl | null {
  return layout.find((e) => e.type === type && e.visible) ?? null;
}

// Style d'un bloc de données : couleur personnalisée sinon gris par défaut.
function ink(doc: jsPDF, el: CanvasEl, gray: number) {
  if (el.color) doc.setTextColor(...hexToRgb(el.color));
  else doc.setTextColor(gray);
}
const fsz = (el: CanvasEl | null, n: number) => n * (el?.textScale ?? 1);
function blockBg(doc: jsPDF, el: CanvasEl | null) {
  if (!el?.fill) return;
  doc.setFillColor(...hexToRgb(el.fill));
  if (el.radius) doc.roundedRect(el.x, el.y, el.w, el.h, el.radius, el.radius, 'F');
  else doc.rect(el.x, el.y, el.w, el.h, 'F');
}

// Identité légale de l'émetteur (en-tête).
export function companyIdentityLines(c: PdfCompany): string[] {
  const lines: string[] = [];

  const statut = [c.legalForm, c.shareCapital && `au capital de ${c.shareCapital}`]
    .filter(Boolean)
    .join(' ');
  if (statut) lines.push(statut);

  if (c.address) lines.push(c.address);

  const ident = [c.siret && `SIRET ${c.siret}`, c.apeCode && `APE ${c.apeCode}`]
    .filter(Boolean)
    .join(' · ');
  if (ident) lines.push(ident);

  if (c.rcsRm) lines.push(c.rcsRm);
  if (c.vatNumber) lines.push(`N° TVA ${c.vatNumber}`);

  const contact = [c.contactPhone && `Tél. ${c.contactPhone}`, c.contactEmail]
    .filter(Boolean)
    .join(' · ');
  if (contact) lines.push(contact);

  return lines;
}

// Mentions légales obligatoires du devis.
export function legalMentions(c: PdfCompany): string[] {
  const mentions: string[] = [];

  if (c.vatExempt) mentions.push('TVA non applicable, art. 293 B du CGI.');

  if (c.insuranceName) {
    // Séparateur « · » (et non tiret cadratin) : la police PDF n'a pas le glyphe —.
    const detail = [c.insuranceContract && `contrat ${c.insuranceContract}`, c.insuranceCoverage]
      .filter(Boolean)
      .join(' · ');
    mentions.push(`Assurance décennale : ${c.insuranceName}${detail ? ` (${detail})` : ''}.`);
  }

  // Apostrophe droite (') : la police PDF standard ne rend pas l'apostrophe typographique.
  mentions.push(
    "Devis reçu avant l'exécution des travaux, à retourner daté et signé avec la mention « Bon pour accord ».",
  );

  if (c.mediatorName) {
    mentions.push(
      `Médiation de la consommation : en cas de litige, recours gratuit au médiateur ${c.mediatorName}${c.mediatorUrl ? ` (${c.mediatorUrl})` : ''}.`,
    );
  }

  return mentions;
}

export function buildQuotePdf(
  quote: Quote,
  company: PdfCompany | string,
  tpl: QuoteTemplate = DEFAULT_TEMPLATE,
): jsPDF {
  // Rétro-compatibilité : certains appels historiques passaient le seul nom.
  const comp: PdfCompany = typeof company === 'string' ? { name: company } : company;
  const companyName = comp.name || 'Mon entreprise';

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const totals = computeQuoteTotals(quote);
  const layout = withDefaultElements(tpl.canvasLayout ?? DEFAULT_CANVAS_LAYOUT);

  // ── Design importé : image de fond couvrant toute la page A4 ───────────────
  if (tpl.backgroundImageUrl) {
    try {
      doc.addImage(tpl.backgroundImageUrl, 0, 0, A4.w, A4.h);
    } catch { /* image invalide : on continue sans fond */ }
  }

  // ── Formes et images libres (sous le contenu, dans l'ordre des calques) ───
  for (const el of layout) {
    if (!el.visible) continue;
    if (!['shape_rect', 'shape_ellipse', 'shape_triangle', 'shape_line', 'image'].includes(el.type)) continue;
    withOpacity(doc, el.opacity, () => drawDecor(doc, el));
  }

  // ── Fonds colorés des blocs de données ────────────────────────────────────
  for (const el of layout) {
    if (el.visible && !['shape_rect', 'shape_ellipse', 'shape_triangle', 'shape_line', 'image', 'custom_text'].includes(el.type)) blockBg(doc, el);
  }

  // ── Logo (maintien du ratio) ──────────────────────────────────────────────
  const logoEl = getEl(layout, 'logo');
  if (logoEl && tpl.logoDataUrl) {
    try {
      const props = doc.getImageProperties(tpl.logoDataUrl);
      const aspect = props.width / props.height;
      let imgW = logoEl.w;
      let imgH = imgW / aspect;
      if (imgH > logoEl.h) { imgH = logoEl.h; imgW = imgH * aspect; }
      const imgX = logoEl.x + (logoEl.w - imgW) / 2;
      const imgY = logoEl.y + (logoEl.h - imgH) / 2;
      doc.addImage(tpl.logoDataUrl, imgX, imgY, imgW, imgH);
    } catch { /* image invalide */ }
  }

  // ── Nom entreprise ────────────────────────────────────────────────────────
  const compEl = getEl(layout, 'company_name');
  if (compEl) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fsz(compEl, 16));
    ink(doc, compEl, 20);
    doc.text(companyName, compEl.x, compEl.y + compEl.h * 0.8);
  }

  // ── Coordonnées légales de l'émetteur (SIRET, forme juridique, TVA…) ───────
  const detailsEl = getEl(layout, 'company_details');
  if (detailsEl && tpl.showCompanyDetails) {
    const identity = companyIdentityLines(comp);
    if (identity.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fsz(detailsEl, 7.5));
      ink(doc, detailsEl, 110);
      let dy = detailsEl.y + fsz(detailsEl, 9);
      for (const l of identity) {
        doc.text(l, detailsEl.x, dy, { maxWidth: detailsEl.w });
        dy += fsz(detailsEl, 10);
      }
    }
  }

  // ── Titre DEVIS ───────────────────────────────────────────────────────────
  const labelEl = getEl(layout, 'quote_label');
  if (labelEl) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fsz(labelEl, 26));
    doc.setTextColor(...hexToRgb(labelEl.accent || labelEl.color || tpl.accentColor));
    doc.text('DEVIS', labelEl.x + labelEl.w, labelEl.y + labelEl.h * 0.8, { align: 'right' });
  }

  // ── Référence / Date ──────────────────────────────────────────────────────
  const metaEl = getEl(layout, 'meta_block');
  if (metaEl) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fsz(metaEl, 9));
    ink(doc, metaEl, 110);
    let my = metaEl.y + fsz(metaEl, 13);
    if (tpl.showReference) {
      doc.text(`Référence : ${quote.reference}`, metaEl.x + metaEl.w, my, { align: 'right' });
      my += fsz(metaEl, 13);
    }
    if (tpl.showDate) {
      doc.text(`Date : ${formatDate(quote.createdAt)}`, metaEl.x + metaEl.w, my, { align: 'right' });
    }
  }

  // ── Bloc client ───────────────────────────────────────────────────────────
  const clientEl = getEl(layout, 'client_block');
  if (clientEl) {
    const k = clientEl.textScale ?? 1;
    if (clientEl.accent) doc.setTextColor(...hexToRgb(clientEl.accent)); else ink(doc, clientEl, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9 * k);
    doc.text('ADRESSÉ À', clientEl.x, clientEl.y + 12 * k);
    ink(doc, clientEl, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10 * k);
    doc.text(quote.clientName, clientEl.x, clientEl.y + 26 * k);
    if (tpl.showClientEmail && quote.clientEmail) {
      if (!clientEl.color) doc.setTextColor(110);
      doc.text(quote.clientEmail, clientEl.x, clientEl.y + 39 * k);
    }
  }

  // ── Tableau des postes ────────────────────────────────────────────────────
  const tableEl = getEl(layout, 'table');
  const startY = tableEl?.y ?? 196;
  const marginLeft = tableEl?.x ?? 40;

  const ts = resolveTableStyle(tableEl?.tableStyle, tpl.accentColor);
  const cols = ts.columns.filter((c) => c.visible);
  const tableW = tableEl?.w ?? A4.w - 80;
  const cellOf = (line: Quote['lines'][number], key: string) =>
    key === 'label' ? line.label
      : key === 'quantity' ? String(line.quantity)
      : key === 'unit' ? unitLabel(line.unit)
      : key === 'unitPrice' ? eur(line.unitPrice)
      : eur(line.quantity * line.unitPrice);
  const tSize = fsz(tableEl, 9);
  const lineStyle = ts.border ? { lineColor: hexToRgb(ts.border), lineWidth: 0.5 } : { lineWidth: 0 };

  autoTable(doc, {
    startY,
    head: ts.showHead ? [cols.map((c) => c.label)] : undefined,
    body: quote.lines.map((line) => cols.map((c) => cellOf(line, c.key))),
    theme: 'plain',
    headStyles: { fillColor: hexToRgb(ts.headBg), textColor: hexToRgb(ts.headColor), fontSize: tSize, fontStyle: 'bold' },
    styles: { fontSize: tSize, cellPadding: 5, textColor: hexToRgb(ts.textColor), ...lineStyle },
    alternateRowStyles: ts.stripe ? { fillColor: hexToRgb(ts.stripe) } : {},
    columnStyles: Object.fromEntries(cols.map((c, i) => [i, { halign: COLUMN_ALIGN[c.key], cellWidth: COLUMN_WIDTH[c.key] }])),
    tableWidth: tableW,
    margin: { left: marginLeft, right: Math.max(0, A4.w - marginLeft - tableW) },
  });

  // ── Totaux (HT, remise éventuelle, TVA, TTC) ──────────────────────────────
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const totalsEl = getEl(layout, 'totals_block');
  const ty = Math.max(totalsEl?.y ?? 0, finalY + 20);
  const tx = totalsEl?.x ?? 370;
  const tRight = totalsEl ? totalsEl.x + totalsEl.w : 555;

  const tk = totalsEl?.textScale ?? 1;
  const tAccent = hexToRgb(totalsEl?.accent || tpl.accentColor);
  doc.setFontSize(9 * tk);
  if (totalsEl?.color) doc.setTextColor(...hexToRgb(totalsEl.color)); else doc.setTextColor(90);
  doc.setFont('helvetica', 'normal');
  let line = ty;
  doc.text('Total HT', tx, line);
  doc.text(eur(totals.subtotal), tRight, line, { align: 'right' });
  if (totals.discount > 0) {
    line += 14;
    const label =
      quote.discountType === 'percent'
        ? `Remise (${quote.discountValue ?? 0} %)`
        : 'Remise';
    doc.text(label, tx, line);
    doc.text(`−${eur(totals.discount)}`, tRight, line, { align: 'right' });
    line += 14;
    doc.text('HT après remise', tx, line);
    doc.text(eur(totals.netSubtotal), tRight, line, { align: 'right' });
  }
  line += 14;
  if (comp.vatExempt) {
    // Franchise en base : pas de TVA, mention réglementaire à la place.
    doc.text('TVA non applicable (art. 293 B du CGI)', tx, line);
  } else {
    doc.text(`TVA (${formatPercent(quote.vatRate)})`, tx, line);
    doc.text(eur(totals.vat), tRight, line, { align: 'right' });
  }

  doc.setDrawColor(...tAccent);
  doc.setLineWidth(0.5);
  doc.line(tx, line + 6 * tk, tRight, line + 6 * tk);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11 * tk);
  doc.setTextColor(...tAccent);
  doc.text(comp.vatExempt ? 'Total' : 'Total TTC', tx, line + 20 * tk);
  doc.text(eur(totals.total), tRight, line + 20 * tk, { align: 'right' });

  // ── Conditions / mentions du devis ────────────────────────────────────────
  const condEl = getEl(layout, 'conditions');
  if (condEl && quote.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fsz(condEl, 9));
    if (condEl.accent) doc.setTextColor(...hexToRgb(condEl.accent)); else ink(doc, condEl, 20);
    doc.text('CONDITIONS', condEl.x, condEl.y + fsz(condEl, 11));
    doc.setFont('helvetica', 'normal');
    ink(doc, condEl, 90);
    doc.text(quote.notes, condEl.x, condEl.y + fsz(condEl, 25), { maxWidth: condEl.w });
  }

  // ── Cadre signature (« Bon pour accord ») ─────────────────────────────────
  const signEl = getEl(layout, 'signature');
  if (signEl) {
    if (signEl.accent) doc.setDrawColor(...hexToRgb(signEl.accent)); else doc.setDrawColor(180);
    doc.setLineWidth(0.5);
    doc.roundedRect(signEl.x, signEl.y, signEl.w, signEl.h, 3, 3);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fsz(signEl, 8));
    ink(doc, signEl, 90);
    doc.text('BON POUR ACCORD', signEl.x + 8, signEl.y + fsz(signEl, 14));
    doc.setFont('helvetica', 'normal');
    ink(doc, signEl, 140);
    doc.text('Date et signature du client', signEl.x + 8, signEl.y + fsz(signEl, 26));
  }

  // ── Mentions légales obligatoires (assurance, TVA, médiation) ──────────────
  const legalEl = getEl(layout, 'legal_block');
  if (legalEl && tpl.showLegal) {
    const mentions = legalMentions(comp);
    if (mentions.length) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fsz(legalEl, 7));
      ink(doc, legalEl, 120);
      doc.text('MENTIONS LÉGALES', legalEl.x, legalEl.y + fsz(legalEl, 7));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fsz(legalEl, 6.8));
      ink(doc, legalEl, 140);
      // Mentions séparées par « · », repliées sur la largeur du bloc.
      const wrapped = doc.splitTextToSize(mentions.join('  ·  '), legalEl.w) as string[];
      doc.text(wrapped, legalEl.x, legalEl.y + 17);
    }
  }

  // ── Textes libres personnalisés ───────────────────────────────────────────
  const customEls = layout.filter((e) => e.type === 'custom_text' && e.visible);
  for (const el of customEls) {
    withOpacity(doc, el.opacity, () => {
      const style = el.bold && el.italic ? 'bolditalic' : el.bold ? 'bold' : el.italic ? 'italic' : 'normal';
      doc.setFont(el.fontFamily ?? 'helvetica', style);
      const size = el.fontSize ?? 10;
      doc.setFontSize(size);
      const [r, g, b] = hexToRgb(el.color ?? '#111111');
      doc.setTextColor(r, g, b);
      const textX =
        el.align === 'right' ? el.x + el.w : el.align === 'center' ? el.x + el.w / 2 : el.x;
      const text = el.uppercase ? (el.content ?? '').toUpperCase() : (el.content ?? '');
      const lines = doc.splitTextToSize(text, el.w) as string[];
      const lh = size * (el.lineHeight ?? 1.2);
      lines.forEach((line, i) => {
        const y = el.y + size * 0.95 + i * lh;
        doc.text(line, textX, y, { align: el.align ?? 'left' });
        if (el.underline) {
          const lw = doc.getTextWidth(line);
          const lx = el.align === 'right' ? textX - lw : el.align === 'center' ? textX - lw / 2 : textX;
          doc.setDrawColor(r, g, b);
          doc.setLineWidth(Math.max(0.4, size / 16));
          doc.line(lx, y + size * 0.12, lx + lw, y + size * 0.12);
        }
      });
    });
  }

  // ── Pied de page ─────────────────────────────────────────────────────────
  const footerEl = getEl(layout, 'footer_text');
  const footerY = footerEl?.y ?? 810;
  const footerX = footerEl?.x ?? 40;
  const footerRight = footerEl ? footerEl.x + footerEl.w : 555;

  if (tpl.footerText) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fsz(footerEl, 8));
    if (footerEl?.color) doc.setTextColor(...hexToRgb(footerEl.color)); else doc.setTextColor(160);
    doc.text(tpl.footerText, footerX, footerY);
  }
  if (footerEl?.color) doc.setTextColor(...hexToRgb(footerEl.color)); else doc.setTextColor(160);
  doc.setFontSize(fsz(footerEl, 8));
  doc.text(companyName, footerRight, footerY, { align: 'right' });

  return doc;
}


function withOpacity(doc: jsPDF, opacity: number | undefined, draw: () => void) {
  const o = opacity ?? 1;
  if (o >= 1) { draw(); return; }
  try {
    doc.saveGraphicsState();
    doc.setGState(new (doc as unknown as { GState: new (o: object) => unknown }).GState({ opacity: o, 'stroke-opacity': o }) as never);
    draw();
    doc.restoreGraphicsState();
  } catch { draw(); }
}

function drawDecor(doc: jsPDF, el: CanvasEl) {
  if (el.type === 'image') {
    if (el.src) { try { doc.addImage(el.src, el.x, el.y, el.w, el.h); } catch { /* image invalide */ } }
    return;
  }
  const sw = el.strokeWidth ?? 0;
  const hasFill = !!el.fill;
  const hasStroke = !!el.stroke && sw > 0;
  if (hasFill) { const [r, g, b] = hexToRgb(el.fill!); doc.setFillColor(r, g, b); }
  if (hasStroke) { const [r, g, b] = hexToRgb(el.stroke!); doc.setDrawColor(r, g, b); doc.setLineWidth(sw); }
  if (el.type === 'shape_line') {
    const [r, g, b] = hexToRgb(el.stroke || el.fill || '#111111');
    doc.setDrawColor(r, g, b);
    const lw = Math.max(0.5, sw || el.h);
    doc.setLineWidth(lw);
    if (el.dashed) doc.setLineDashPattern([lw * 3, lw * 2], 0);
    doc.line(el.x, el.y + el.h / 2, el.x + el.w, el.y + el.h / 2);
    if (el.dashed) doc.setLineDashPattern([], 0);
    return;
  }
  const style = hasFill && hasStroke ? 'FD' : hasFill ? 'F' : hasStroke ? 'S' : null;
  if (!style) return;
  if (hasStroke && el.dashed) doc.setLineDashPattern([sw * 3, sw * 2], 0);
  if (el.type === 'shape_triangle') {
    doc.triangle(el.x + el.w / 2, el.y, el.x + el.w, el.y + el.h, el.x, el.y + el.h, style);
  } else if (el.type === 'shape_ellipse') {
    doc.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, el.h / 2, style);
  } else if (el.radius) {
    const r = Math.min(el.radius, el.w / 2, el.h / 2);
    doc.roundedRect(el.x, el.y, el.w, el.h, r, r, style);
  } else {
    doc.rect(el.x, el.y, el.w, el.h, style);
  }
  if (hasStroke && el.dashed) doc.setLineDashPattern([], 0);
}

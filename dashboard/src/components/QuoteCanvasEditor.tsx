import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter, AlignCenterHorizontal, AlignCenterVertical,
  AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceAround, AlignLeft, AlignRight,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceAround,
  ArrowDownToLine, ArrowUpToLine, Bold, CaseUpper, ChevronDown, ChevronUp, Circle, ClipboardPaste, Copy, Eye, EyeOff,
  GripVertical, ImagePlus, Italic, Layers, Lock, Maximize, Minus, Paintbrush, Plus, Redo2, RotateCcw, Shapes, Square,
  Trash2, Triangle, Type, Underline, Undo2, Unlock, Upload, ZoomIn, ZoomOut,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { COLUMN_ALIGN, CUSTOM_TYPES, DEFAULT_CANVAS_LAYOUT, ELEMENT_META, resolveTableStyle, withDefaultElements } from '@/lib/canvas-layout';
import { companyIdentityLines, legalMentions, type PdfCompany } from '@/lib/quote-pdf';
import type { CanvasEl, QuoteTemplate, TableStyle } from '@/types';

// ─── Dimensions PDF ───────────────────────────────────────────────────────────
const A4_W = 595;
const A4_H = 842;
const MARGIN = 40;
const SNAP = 6;
const BASE_PX = 560;
const Z_MIN = 0.3;
const Z_MAX = 3;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const PALETTE = [
  '#000000', '#475569', '#94a3b8', '#e2e8f0', '#ffffff',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#10b981', '#14b8a6', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#78350f',
];

const FONTS = {
  helvetica: { label: 'Helvetica', css: 'Helvetica, Arial, sans-serif' },
  times: { label: 'Times', css: '"Times New Roman", Times, serif' },
  courier: { label: 'Courier', css: '"Courier New", Courier, monospace' },
} as const;

const SHAPES = new Set(['shape_rect', 'shape_ellipse', 'shape_triangle']);

// ─── Géométrie & magnétisme ───────────────────────────────────────────────────
type Box = { x: number; y: number; w: number; h: number };
type Targets = { v: number[]; h: number[] };

const bbox = (list: Box[]): Box => {
  const x = Math.min(...list.map((e) => e.x));
  const y = Math.min(...list.map((e) => e.y));
  return { x, y, w: Math.max(...list.map((e) => e.x + e.w)) - x, h: Math.max(...list.map((e) => e.y + e.h)) - y };
};
const intersects = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function buildTargets(els: CanvasEl[], exclude: Set<string>): Targets {
  const v = [MARGIN, A4_W / 2, A4_W - MARGIN];
  const h = [MARGIN, A4_H / 2, A4_H - MARGIN];
  for (const e of els) {
    if (exclude.has(e.id) || !e.visible) continue;
    v.push(e.x, e.x + e.w / 2, e.x + e.w);
    h.push(e.y, e.y + e.h / 2, e.y + e.h);
  }
  return { v, h };
}

function snap1D(pos: number, size: number, targets: number[]) {
  const points = [pos, pos + size / 2, pos + size];
  let best = { pos, guide: null as number | null, d: SNAP + 1 };
  for (const p of points) for (const t of targets) {
    const d = Math.abs(p - t);
    if (d < best.d) best = { pos: t - (p - pos), guide: t, d };
  }
  return best.d <= SNAP ? best : { pos, guide: null };
}

function snapEdge(v: number, targets: number[]) {
  for (const t of targets) if (Math.abs(v - t) <= SNAP) return { v: t, guide: t };
  return { v, guide: null as number | null };
}

// Distances aux voisins les plus proches (repères roses façon Canva).
type Gap = { x1: number; y1: number; x2: number; y2: number; d: number };
function nearestGaps(b: Box, els: CanvasEl[], exclude: Set<string>): Gap[] {
  const out: Gap[] = [];
  let left: Gap | null = null, right: Gap | null = null, up: Gap | null = null, down: Gap | null = null;
  for (const e of els) {
    if (exclude.has(e.id) || !e.visible) continue;
    const vOverlap = e.y < b.y + b.h && e.y + e.h > b.y;
    const hOverlap = e.x < b.x + b.w && e.x + e.w > b.x;
    if (vOverlap) {
      const midY = (Math.max(b.y, e.y) + Math.min(b.y + b.h, e.y + e.h)) / 2;
      const dl = b.x - (e.x + e.w);
      if (dl >= 0 && (!left || dl < left.d)) left = { x1: e.x + e.w, x2: b.x, y1: midY, y2: midY, d: dl };
      const dr = e.x - (b.x + b.w);
      if (dr >= 0 && (!right || dr < right.d)) right = { x1: b.x + b.w, x2: e.x, y1: midY, y2: midY, d: dr };
    }
    if (hOverlap) {
      const midX = (Math.max(b.x, e.x) + Math.min(b.x + b.w, e.x + e.w)) / 2;
      const du = b.y - (e.y + e.h);
      if (du >= 0 && (!up || du < up.d)) up = { x1: midX, x2: midX, y1: e.y + e.h, y2: b.y, d: du };
      const dd = e.y - (b.y + b.h);
      if (dd >= 0 && (!down || dd < down.d)) down = { x1: midX, x2: midX, y1: b.y + b.h, y2: e.y, d: dd };
    }
  }
  for (const g of [left, right, up, down]) if (g && g.d > 0 && g.d < 160) out.push(g);
  return out;
}

// ─── Image : réduite pour garder un template léger ────────────────────────────
function readImage(file: File, max = 1200): Promise<{ src: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        const png = file.type === 'image/png';
        resolve({ src: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.88), w: c.width, h: c.height });
      };
      img.src = fr.result as string;
    };
    fr.readAsDataURL(file);
  });
}

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_POS: Record<Handle, { left: string; top: string; cursor: string }> = {
  nw: { left: '0%', top: '0%', cursor: 'nwse-resize' },
  n: { left: '50%', top: '0%', cursor: 'ns-resize' },
  ne: { left: '100%', top: '0%', cursor: 'nesw-resize' },
  e: { left: '100%', top: '50%', cursor: 'ew-resize' },
  se: { left: '100%', top: '100%', cursor: 'nwse-resize' },
  s: { left: '50%', top: '100%', cursor: 'ns-resize' },
  sw: { left: '0%', top: '100%', cursor: 'nesw-resize' },
  w: { left: '0%', top: '50%', cursor: 'ew-resize' },
};

type Gesture =
  | { kind: 'move'; ids: string[]; mx: number; my: number; o: Record<string, CanvasEl>; box: Box; targets: Targets; moved: boolean }
  | { kind: 'resize'; id: string; handle: Handle; mx: number; my: number; o: CanvasEl; targets: Targets }
  | { kind: 'marquee'; x0: number; y0: number; additive: string[] }
  | { kind: 'pan'; mx: number; my: number; sl: number; st: number }
  | null;

type Tab = 'elements' | 'text' | 'uploads' | 'layers';
type Props = { tpl: QuoteTemplate; company?: PdfCompany; onChange: (layout: CanvasEl[]) => void };

export function QuoteCanvasEditor({ tpl, company = { name: 'Mon entreprise' }, onChange }: Props) {
  const [els, setEls] = useState<CanvasEl[]>(() => withDefaultElements(tpl.canvasLayout ?? DEFAULT_CANVAS_LAYOUT));
  const [sel, setSel] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [guides, setGuides] = useState<Targets>({ v: [], h: [] });
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [badge, setBadge] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [tab, setTab] = useState<Tab>('elements');
  const [zoom, setZoom] = useState(1);
  const [spaceDown, setSpaceDown] = useState(false);
  const [dragLayer, setDragLayer] = useState<string | null>(null);
  const [, force] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [basePx, setBasePx] = useState(BASE_PX);
  const [boardH, setBoardH] = useState(700);

  useEffect(() => {
    const fit = () => {
      const el = boardRef.current;
      if (!el) return;
      const avail = Math.max(420, window.innerHeight - el.getBoundingClientRect().top - 24);
      setBoardH(avail);
      setBasePx(Math.max(280, Math.min(BASE_PX, ((avail - 64) * A4_W) / A4_H)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const scale = (basePx / A4_W) * zoom;
  const px = (pt: number) => pt * scale;

  const gesture = useRef<Gesture>(null);
  const elsRef = useRef(els);
  elsRef.current = els;
  const past = useRef<CanvasEl[][]>([]);
  const future = useRef<CanvasEl[][]>([]);
  const lastPush = useRef<{ key: string; t: number }>({ key: '', t: 0 });
  const clip = useRef<CanvasEl[]>([]);
  const styleClip = useRef<Partial<CanvasEl> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastEmitted = useRef<CanvasEl[] | undefined>(tpl.canvasLayout);

  // Sync seulement si le layout vient de l'extérieur (chargement API).
  useEffect(() => {
    if (tpl.canvasLayout && tpl.canvasLayout !== lastEmitted.current) {
      setEls(withDefaultElements(tpl.canvasLayout));
      past.current = [];
      future.current = [];
    }
  }, [tpl.canvasLayout]);

  const emit = useCallback((next: CanvasEl[]) => { lastEmitted.current = next; onChange(next); }, [onChange]);

  // Historique : regroupe les modifs rapides d'une même propriété (frappe, curseur).
  const record = (key = '') => {
    const now = Date.now();
    if (key && lastPush.current.key === key && now - lastPush.current.t < 800) { lastPush.current.t = now; return; }
    past.current.push(elsRef.current);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    lastPush.current = { key, t: now };
    force((n) => n + 1);
  };

  const commit = (next: CanvasEl[], key = '') => { record(key); elsRef.current = next; setEls(next); emit(next); };
  const update = (id: string, p: Partial<CanvasEl>, key = '') =>
    commit(elsRef.current.map((e) => (e.id === id ? { ...e, ...p } : e)), key ? `${id}:${key}` : '');
  const updateMany = (ids: string[], fn: (e: CanvasEl) => Partial<CanvasEl>, key = '') => {
    const s = new Set(ids);
    commit(elsRef.current.map((e) => (s.has(e.id) ? { ...e, ...fn(e) } : e)), key ? `${ids.join(',')}:${key}` : '');
  };

  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(elsRef.current);
    lastPush.current = { key: '', t: 0 };
    setEls(prev); emit(prev); force((n) => n + 1);
  };
  const redo = () => {
    const nxt = future.current.pop();
    if (!nxt) return;
    past.current.push(elsRef.current);
    setEls(nxt); emit(nxt); force((n) => n + 1);
  };

  const selSet = useMemo(() => new Set(sel), [sel]);
  const selEls = els.filter((e) => selSet.has(e.id) && e.visible);
  const selected = selEls.length === 1 ? selEls[0] : null;
  const multi = selEls.length > 1;
  const isCustom = (e: CanvasEl) => CUSTOM_TYPES.has(e.type);
  const selBox = selEls.length ? bbox(selEls) : null;

  const docColors = useMemo(() => {
    const s = new Set<string>();
    if (tpl.accentColor) s.add(tpl.accentColor.toLowerCase());
    for (const e of els) for (const c of [e.color, e.fill, e.stroke]) if (c) s.add(c.toLowerCase());
    return [...s].slice(0, 12);
  }, [els, tpl.accentColor]);
  const uploads = useMemo(() => [...new Set(els.filter((e) => e.type === 'image' && e.src).map((e) => e.src!))], [els]);

  // ── Création ─────────────────────────────────────────────────────────────
  const addMany = (items: Omit<CanvasEl, 'id' | 'visible'>[], prefix: string) => {
    const full = items.map((el) => ({ ...el, id: uid(prefix), visible: true }) as CanvasEl);
    commit([...elsRef.current, ...full]);
    setSel(full.map((f) => f.id));
    setEditing(null);
    return full;
  };
  const add = (el: Omit<CanvasEl, 'id' | 'visible'>, prefix: string) => addMany([el], prefix)[0];
  const center = (w: number, h: number) => ({ x: Math.round((A4_W - w) / 2), y: Math.round((A4_H - h) / 2), w, h });
  const accent = tpl.accentColor || '#3b82f6';

  const addText = (preset: 'title' | 'subtitle' | 'body') => {
    const cfg = {
      title: { content: 'Ajouter un titre', fontSize: 26, bold: true, w: 320, h: 34 },
      subtitle: { content: 'Ajouter un sous-titre', fontSize: 16, bold: true, w: 260, h: 22 },
      body: { content: 'Ajouter du texte', fontSize: 11, bold: false, w: 220, h: 16 },
    }[preset];
    add({ type: 'custom_text', ...center(cfg.w, cfg.h), content: cfg.content, fontSize: cfg.fontSize, bold: cfg.bold, color: '#111111', align: 'left' }, 'txt');
  };

  const TEXT_COMBOS: { label: string; render: React.ReactNode; items: () => Omit<CanvasEl, 'id' | 'visible'>[] }[] = [
    {
      label: 'Remerciement',
      render: <div><p className="text-sm font-bold text-slate-800">Merci pour votre confiance</p><p className="text-[10px] text-slate-500">Nous restons à votre disposition.</p></div>,
      items: () => [
        { type: 'custom_text', x: 40, y: 640, w: 300, h: 20, content: 'Merci pour votre confiance', fontSize: 16, bold: true, color: '#111111', align: 'left' },
        { type: 'custom_text', x: 40, y: 664, w: 300, h: 14, content: 'Nous restons à votre disposition pour toute question.', fontSize: 9, color: '#64748b', align: 'left' },
      ],
    },
    {
      label: 'Pastille validité',
      render: <span className="inline-block rounded-full px-3 py-1 text-[10px] font-bold text-white" style={{ background: accent }}>OFFRE VALABLE 30 JOURS</span>,
      items: () => [
        { type: 'shape_rect', x: 395, y: 600, w: 160, h: 24, fill: accent, stroke: '', strokeWidth: 0, radius: 12 },
        { type: 'custom_text', x: 395, y: 607, w: 160, h: 12, content: 'Offre valable 30 jours', fontSize: 8, bold: true, uppercase: true, color: '#ffffff', align: 'center' },
      ],
    },
    {
      label: 'Section titrée',
      render: <div><p className="text-[9px] font-bold tracking-wide" style={{ color: accent }}>À PROPOS</p><div className="my-1 h-0.5 w-8" style={{ background: accent }} /><p className="text-[10px] text-slate-500">Artisan depuis 2008…</p></div>,
      items: () => [
        { type: 'custom_text', x: 40, y: 340, w: 200, h: 12, content: 'À propos', fontSize: 9, bold: true, uppercase: true, color: accent, align: 'left' },
        { type: 'shape_line', x: 40, y: 354, w: 40, h: 6, stroke: accent, strokeWidth: 2 },
        { type: 'custom_text', x: 40, y: 364, w: 260, h: 28, content: 'Artisan depuis 2008, nous intervenons dans toute la région.', fontSize: 9, color: '#475569', align: 'left', lineHeight: 1.4 },
      ],
    },
    {
      label: 'Citation',
      render: <p className="font-serif text-xs italic text-slate-600">« Un travail soigné, livré dans les temps. »</p>,
      items: () => [
        { type: 'custom_text', x: 120, y: 420, w: 355, h: 20, content: '« Un travail soigné, livré dans les temps. »', fontSize: 14, italic: true, fontFamily: 'times', color: '#334155', align: 'center' },
      ],
    },
  ];

  const addShape = (type: 'shape_rect' | 'shape_ellipse' | 'shape_triangle' | 'shape_line', opts: { rounded?: boolean; dashed?: boolean; outline?: boolean } = {}) => {
    if (type === 'shape_line') add({ type, ...center(200, 6), stroke: '#111111', strokeWidth: 2, dashed: opts.dashed }, 'shp');
    else add({
      type, ...center(120, 120),
      fill: opts.outline ? '' : accent, stroke: opts.outline ? '#111111' : '', strokeWidth: opts.outline ? 2 : 0,
      radius: opts.rounded ? 14 : 0,
    }, 'shp');
  };
  const addBanner = (where: 'top' | 'bottom' | 'side') => {
    const box = where === 'top' ? { x: 0, y: 0, w: A4_W, h: 14 } : where === 'bottom' ? { x: 0, y: A4_H - 14, w: A4_W, h: 14 } : { x: 0, y: 0, w: 14, h: A4_H };
    add({ type: 'shape_rect', ...box, fill: accent, stroke: '', strokeWidth: 0, radius: 0 }, 'shp');
  };
  const addImageSrc = (src: string, iw: number, ih: number) => {
    const w = Math.min(220, iw);
    const h = Math.round((w * ih) / iw);
    add({ type: 'image', ...center(w, h), src }, 'img');
  };
  const onImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    for (const f of files) { const img = await readImage(f); addImageSrc(img.src, img.w, img.h); }
  };
  const reuseImage = (src: string) => {
    const img = new Image();
    img.onload = () => addImageSrc(src, img.width, img.height);
    img.src = src;
  };

  // ── Actions sur la sélection ─────────────────────────────────────────────
  const copySel = () => { clip.current = selEls.filter(isCustom).map((e) => ({ ...e })); };
  const paste = () => {
    if (!clip.current.length) return;
    const items = clip.current.map(({ id: _id, visible: _v, ...rest }) => ({ ...rest, x: clamp(rest.x + 14, 0, A4_W - rest.w), y: clamp(rest.y + 14, 0, A4_H - rest.h) }));
    addMany(items, 'cp');
    clip.current = clip.current.map((c) => ({ ...c, x: c.x + 14, y: c.y + 14 }));
  };
  const duplicate = () => {
    const src = selEls.filter(isCustom);
    if (!src.length) return;
    addMany(src.map(({ id: _id, visible: _v, ...rest }) => ({ ...rest, locked: false, x: clamp(rest.x + 14, 0, A4_W - rest.w), y: clamp(rest.y + 14, 0, A4_H - rest.h) })), 'cp');
  };
  const removeSel = () => {
    const targets = selEls.filter((e) => !e.locked);
    if (!targets.length) return;
    const ids = new Set(targets.map((e) => e.id));
    // Les blocs du devis reviendraient au rechargement : on les masque.
    commit(elsRef.current.flatMap((e) => (!ids.has(e.id) ? [e] : isCustom(e) ? [] : [{ ...e, visible: false }])));
    setSel([]);
  };
  const copyStyle = () => {
    if (!selected) return;
    const { fontSize, bold, italic, underline, color, align, fill, stroke, strokeWidth, radius, opacity, dashed, fontFamily, lineHeight, uppercase } = selected;
    styleClip.current = { fontSize, bold, italic, underline, color, align, fill, stroke, strokeWidth, radius, opacity, dashed, fontFamily, lineHeight, uppercase };
  };
  const pasteStyle = () => {
    const st = styleClip.current;
    if (!st) return;
    updateMany(selEls.filter(isCustom).map((e) => e.id), (e) => {
      const out: Partial<CanvasEl> = { opacity: st.opacity };
      if (e.type === 'custom_text') Object.assign(out, { fontSize: st.fontSize, bold: st.bold, italic: st.italic, underline: st.underline, color: st.color ?? e.color, align: st.align, fontFamily: st.fontFamily, lineHeight: st.lineHeight, uppercase: st.uppercase });
      else Object.assign(out, { fill: st.fill ?? e.fill, stroke: st.stroke ?? e.stroke, strokeWidth: st.strokeWidth ?? e.strokeWidth, radius: st.radius, dashed: st.dashed });
      return out;
    });
  };
  const toggleLock = () => {
    const lock = !selEls.every((e) => e.locked);
    updateMany(selEls.map((e) => e.id), () => ({ locked: lock }));
  };
  const reorder = (dir: 'up' | 'down' | 'top' | 'bottom') => {
    if (!selEls.length) return;
    const ids = selSet;
    let list = [...elsRef.current];
    if (dir === 'top' || dir === 'bottom') {
      const moving = list.filter((e) => ids.has(e.id));
      const rest = list.filter((e) => !ids.has(e.id));
      list = dir === 'top' ? [...rest, ...moving] : [...moving, ...rest];
    } else {
      const order = dir === 'up' ? [...list.keys()].reverse() : [...list.keys()];
      for (const i of order) {
        const j = dir === 'up' ? i + 1 : i - 1;
        if (!ids.has(list[i].id) || j < 0 || j >= list.length || ids.has(list[j].id)) continue;
        [list[i], list[j]] = [list[j], list[i]];
      }
    }
    commit(list);
  };
  type AlignKind = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
  // Un élément seul s'aligne sur la page ; plusieurs s'alignent entre eux.
  const align = (kind: AlignKind) => {
    if (!selEls.length) return;
    const ref: Box = multi ? bbox(selEls) : { x: MARGIN, y: MARGIN, w: A4_W - 2 * MARGIN, h: A4_H - 2 * MARGIN };
    updateMany(selEls.filter((e) => !e.locked).map((e) => e.id), (e) => ({
      left: { x: ref.x }, hcenter: { x: Math.round(ref.x + (ref.w - e.w) / 2) }, right: { x: ref.x + ref.w - e.w },
      top: { y: ref.y }, vcenter: { y: Math.round(ref.y + (ref.h - e.h) / 2) }, bottom: { y: ref.y + ref.h - e.h },
    }[kind]));
  };
  const distribute = (axis: 'h' | 'v') => {
    if (selEls.length < 3) return;
    const k = axis === 'h' ? 'x' : 'y';
    const s = axis === 'h' ? 'w' : 'h';
    const sorted = [...selEls].sort((a, b) => a[k] - b[k]);
    const total = sorted.reduce((n, e) => n + e[s], 0);
    const b = bbox(sorted);
    const gap = ((axis === 'h' ? b.w : b.h) - total) / (sorted.length - 1);
    let cur = b[k];
    const pos: Record<string, number> = {};
    for (const e of sorted) { pos[e.id] = Math.round(cur); cur += e[s] + gap; }
    updateMany(sorted.map((e) => e.id), (e) => ({ [k]: pos[e.id] }));
  };
  const selectAll = () => setSel(elsRef.current.filter((e) => e.visible && !e.locked).map((e) => e.id));

  const setZoomClamped = (z: number) => setZoom(clamp(Math.round(z * 100) / 100, Z_MIN, Z_MAX));

  // ── Souris : déplacement / redimensionnement / lasso / panoramique ───────
  const toPt = (cx: number, cy: number) => {
    const r = pageRef.current!.getBoundingClientRect();
    return { x: (cx - r.left) / scale, y: (cy - r.top) / scale };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const g = gesture.current;
      if (!g) return;
      if (g.kind === 'pan') {
        const b = boardRef.current!;
        b.scrollLeft = g.sl - (e.clientX - g.mx);
        b.scrollTop = g.st - (e.clientY - g.my);
        return;
      }
      if (g.kind === 'marquee') {
        const p = toPt(e.clientX, e.clientY);
        const box = { x: Math.min(g.x0, p.x), y: Math.min(g.y0, p.y), w: Math.abs(p.x - g.x0), h: Math.abs(p.y - g.y0) };
        setMarquee(box);
        const hit = elsRef.current.filter((el) => el.visible && !el.locked && intersects(box, el)).map((el) => el.id);
        setSel([...new Set([...g.additive, ...hit])]);
        return;
      }
      const dx = (e.clientX - g.mx) / scale;
      const dy = (e.clientY - g.my) / scale;
      if (g.kind === 'move') {
        if (!g.moved && Math.abs(dx) + Math.abs(dy) < 1.5) return;
        if (!g.moved) { g.moved = true; record(); }
        let nx = clamp(g.box.x + dx, 0, A4_W - g.box.w);
        let ny = clamp(g.box.y + dy, 0, A4_H - g.box.h);
        const sx = e.altKey ? { pos: nx, guide: null } : snap1D(nx, g.box.w, g.targets.v);
        const sy = e.altKey ? { pos: ny, guide: null } : snap1D(ny, g.box.h, g.targets.h);
        nx = Math.round(clamp(sx.pos, 0, A4_W - g.box.w));
        ny = Math.round(clamp(sy.pos, 0, A4_H - g.box.h));
        const ddx = nx - g.box.x, ddy = ny - g.box.y;
        setGuides({ v: sx.guide != null ? [sx.guide] : [], h: sy.guide != null ? [sy.guide] : [] });
        setGaps(nearestGaps({ ...g.box, x: nx, y: ny }, elsRef.current, new Set(g.ids)));
        setBadge(`X ${nx} · Y ${ny}`);
        setEls((prev) => prev.map((el) => (g.o[el.id] ? { ...el, x: g.o[el.id].x + ddx, y: g.o[el.id].y + ddy } : el)));
        return;
      }
      const { o, handle } = g;
      let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      let gv: number | null = null, gh: number | null = null;
      const sv = (v: number) => { if (e.altKey) return v; const r = snapEdge(v, g.targets.v); if (r.guide != null) gv = r.guide; return r.v; };
      const shh = (v: number) => { if (e.altKey) return v; const r = snapEdge(v, g.targets.h); if (r.guide != null) gh = r.guide; return r.v; };
      if (handle.includes('w')) x1 = sv(clamp(o.x + dx, 0, x2 - 12));
      if (handle.includes('e')) x2 = sv(clamp(o.x + o.w + dx, x1 + 12, A4_W));
      if (handle.includes('n')) y1 = shh(clamp(o.y + dy, 0, y2 - 4));
      if (handle.includes('s')) y2 = shh(clamp(o.y + o.h + dy, y1 + 4, A4_H));
      // Coins : ratio conservé pour les images et le texte (qui grossit), ou avec Maj.
      const keepRatio = handle.length === 2 && (o.type === 'image' || o.type === 'custom_text' || e.shiftKey);
      if (keepRatio) {
        const ratio = o.w / o.h;
        const w = x2 - x1;
        const h = w / ratio;
        if (handle.includes('n')) y1 = y2 - h; else y2 = y1 + h;
      }
      const next: Partial<CanvasEl> = { x: Math.round(x1), y: Math.round(y1), w: Math.round(x2 - x1), h: Math.round(y2 - y1) };
      // Texte : un coin agrandit la police, comme dans Canva.
      if (o.type === 'custom_text' && handle.length === 2) {
        next.fontSize = clamp(Math.round(((o.fontSize ?? 10) * (x2 - x1)) / o.w * 2) / 2, 6, 120);
      }
      setGuides({ v: gv != null ? [gv] : [], h: gh != null ? [gh] : [] });
      setBadge(next.fontSize && o.type === 'custom_text' && handle.length === 2 ? `${next.fontSize} pt` : `${next.w} × ${next.h}`);
      setEls((prev) => prev.map((el) => (el.id === g.id ? { ...el, ...next } : el)));
    };
    const onUp = () => {
      const g = gesture.current;
      if (g && (g.kind === 'resize' || (g.kind === 'move' && g.moved))) emit(elsRef.current);
      gesture.current = null;
      setGuides({ v: [], h: [] });
      setGaps([]);
      setBadge(null);
      setMarquee(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  });

  // Ctrl/⌘ + molette : zoom centré ; molette seule : défilement.
  useEffect(() => {
    const b = boardRef.current;
    if (!b) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => clamp(Math.round(z * Math.exp(-e.deltaY * 0.01) * 100) / 100, Z_MIN, Z_MAX));
    };
    b.addEventListener('wheel', onWheel, { passive: false });
    return () => b.removeEventListener('wheel', onWheel);
  }, []);

  // ── Clavier ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (e.key === ' ' && !spaceDown) { e.preventDefault(); setSpaceDown(true); return; }
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); redo(); return; }
      if (mod && (k === '=' || k === '+')) { e.preventDefault(); setZoomClamped(zoom * 1.2); return; }
      if (mod && k === '-') { e.preventDefault(); setZoomClamped(zoom / 1.2); return; }
      if (mod && k === '0') { e.preventDefault(); setZoom(1); return; }
      if (mod && k === 'a') { e.preventDefault(); selectAll(); return; }
      if (mod && e.altKey && k === 'c') { e.preventDefault(); copyStyle(); return; }
      if (mod && e.altKey && k === 'v') { e.preventDefault(); pasteStyle(); return; }
      if (mod && k === 'v') { e.preventDefault(); paste(); return; }
      if (e.key === 'Escape') { setSel([]); setMenu(null); return; }
      if (!selEls.length) return;
      if (mod && k === 'd') { e.preventDefault(); duplicate(); return; }
      if (mod && k === 'c') { copySel(); return; }
      if (mod && k === 'x') { copySel(); removeSel(); return; }
      if (mod && k === 'l') { e.preventDefault(); toggleLock(); return; }
      if (mod && e.key === ']') { e.preventDefault(); reorder(e.altKey ? 'top' : 'up'); return; }
      if (mod && e.key === '[') { e.preventDefault(); reorder(e.altKey ? 'bottom' : 'down'); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel(); return; }
      if (selected?.type === 'custom_text' && !selected.locked) {
        if (e.key === 'Enter') { e.preventDefault(); setEditing(selected.id); return; }
        if (mod && k === 'b') { e.preventDefault(); update(selected.id, { bold: !selected.bold }); return; }
        if (mod && k === 'i') { e.preventDefault(); update(selected.id, { italic: !selected.italic }); return; }
        if (mod && k === 'u') { e.preventDefault(); update(selected.id, { underline: !selected.underline }); return; }
      }
      const step = e.shiftKey ? 10 : 1;
      const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
      if (!d) return;
      e.preventDefault();
      const movable = selEls.filter((el) => !el.locked);
      if (!movable.length) return;
      const b = bbox(movable);
      const ddx = clamp(b.x + d[0], 0, A4_W - b.w) - b.x;
      const ddy = clamp(b.y + d[1], 0, A4_H - b.h) - b.y;
      updateMany(movable.map((el) => el.id), (el) => ({ x: el.x + ddx, y: el.y + ddy }), 'nudge');
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === ' ') setSpaceDown(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  });

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('scroll', close, true); };
  }, [menu]);

  const startPan = (e: React.MouseEvent) => {
    const b = boardRef.current!;
    gesture.current = { kind: 'pan', mx: e.clientX, my: e.clientY, sl: b.scrollLeft, st: b.scrollTop };
  };

  const startMove = (e: React.MouseEvent, el: CanvasEl) => {
    if (spaceDown || e.button === 1) { e.preventDefault(); e.stopPropagation(); startPan(e); return; }
    e.stopPropagation();
    setMenu(null);
    const inSel = selSet.has(el.id);
    if (e.button === 2) { if (!inSel) setSel([el.id]); return; }
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      setSel(inSel ? sel.filter((s) => s !== el.id) : [...sel, el.id]);
      setEditing(null);
      return;
    }
    const ids = inSel ? sel : [el.id];
    if (!inSel) setSel(ids);
    if (editing !== el.id) setEditing(null);
    if (editing === el.id) return;
    const movable = elsRef.current.filter((x) => ids.includes(x.id) && !x.locked && x.visible);
    if (!movable.length) return;
    gesture.current = {
      kind: 'move', ids: movable.map((m) => m.id), mx: e.clientX, my: e.clientY,
      o: Object.fromEntries(movable.map((m) => [m.id, m])), box: bbox(movable),
      targets: buildTargets(els, new Set(movable.map((m) => m.id))), moved: false,
    };
  };
  const startResize = (e: React.MouseEvent, el: CanvasEl, handle: Handle) => {
    e.stopPropagation();
    record();
    gesture.current = { kind: 'resize', id: el.id, handle, mx: e.clientX, my: e.clientY, o: el, targets: buildTargets(els, new Set([el.id])) };
  };
  const startMarquee = (e: React.MouseEvent) => {
    if (spaceDown || e.button === 1) { e.preventDefault(); startPan(e); return; }
    if (e.button !== 0) return;
    setMenu(null);
    setEditing(null);
    const p = toPt(e.clientX, e.clientY);
    const additive = e.shiftKey ? sel : [];
    if (!e.shiftKey) setSel([]);
    gesture.current = { kind: 'marquee', x0: p.x, y0: p.y, additive };
  };

  const handles = (el: CanvasEl): Handle[] =>
    el.type === 'shape_line' ? ['w', 'e'] : el.type === 'custom_text' ? ['nw', 'ne', 'e', 'se', 'sw', 'w'] : HANDLES;

  // Barre contextuelle : propriétés partagées par toute la sélection de même type.
  const textSel = selEls.length > 0 && selEls.every((e) => e.type === 'custom_text') ? selEls : null;
  const shapeSel = selEls.length > 0 && selEls.every((e) => SHAPES.has(e.type)) ? selEls : null;
  const lineSel = selEls.length > 0 && selEls.every((e) => e.type === 'shape_line') ? selEls : null;
  const customSel = selEls.length > 0 && selEls.every(isCustom) ? selEls : null;
  const first = selEls[0];
  const ids = selEls.map((e) => e.id);
  const allLocked = selEls.length > 0 && selEls.every((e) => e.locked);

  // ── Rendu ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3" style={{ userSelect: 'none' }}>
      {/* Barre d'outils contextuelle */}
      <div className="flex min-h-12 flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
        <ToolBtn title="Annuler (⌘Z)" onClick={undo} disabled={!past.current.length}><Undo2 className="size-4" /></ToolBtn>
        <ToolBtn title="Rétablir (⌘⇧Z)" onClick={redo} disabled={!future.current.length}><Redo2 className="size-4" /></ToolBtn>
        <Sep />
        {textSel && first && (
          <>
            <select
              value={first.fontFamily ?? 'helvetica'}
              onChange={(e) => updateMany(ids, () => ({ fontFamily: e.target.value as CanvasEl['fontFamily'] }))}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-brand-400 focus:outline-none"
              style={{ fontFamily: FONTS[first.fontFamily ?? 'helvetica'].css }}
              title="Police"
            >
              {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k} style={{ fontFamily: f.css }}>{f.label}</option>)}
            </select>
            <div className="flex items-center rounded-md border border-slate-200">
              <button type="button" title="Réduire" className="grid size-7 place-items-center hover:bg-slate-100" onClick={() => updateMany(ids, (e) => ({ fontSize: Math.max(6, (e.fontSize ?? 10) - 1) }), 'fs')}><Minus className="size-3" /></button>
              <input
                type="number" value={first.fontSize ?? 10}
                onChange={(e) => { const v = clamp(Number(e.target.value) || 10, 6, 120); updateMany(ids, () => ({ fontSize: v }), 'fs'); }}
                className="w-10 border-x border-slate-200 text-center text-xs tabular-nums focus:outline-none"
              />
              <button type="button" title="Agrandir" className="grid size-7 place-items-center hover:bg-slate-100" onClick={() => updateMany(ids, (e) => ({ fontSize: Math.min(120, (e.fontSize ?? 10) + 1) }), 'fs')}><Plus className="size-3" /></button>
            </div>
            <ColorPick title="Couleur du texte" value={first.color ?? '#111111'} docColors={docColors} onChange={(c) => updateMany(ids, () => ({ color: c }), 'color')} letter />
            <ToolBtn title="Gras (⌘B)" active={!!first.bold} onClick={() => updateMany(ids, () => ({ bold: !first.bold }))}><Bold className="size-4" /></ToolBtn>
            <ToolBtn title="Italique (⌘I)" active={!!first.italic} onClick={() => updateMany(ids, () => ({ italic: !first.italic }))}><Italic className="size-4" /></ToolBtn>
            <ToolBtn title="Souligné (⌘U)" active={!!first.underline} onClick={() => updateMany(ids, () => ({ underline: !first.underline }))}><Underline className="size-4" /></ToolBtn>
            <ToolBtn title="Majuscules" active={!!first.uppercase} onClick={() => updateMany(ids, () => ({ uppercase: !first.uppercase }))}><CaseUpper className="size-4" /></ToolBtn>
            <ToolBtn
              title="Alignement du texte"
              onClick={() => { const nx = ({ left: 'center', center: 'right', right: 'left' } as const)[first.align ?? 'left']; updateMany(ids, () => ({ align: nx })); }}
            >
              {first.align === 'center' ? <AlignCenter className="size-4" /> : first.align === 'right' ? <AlignRight className="size-4" /> : <AlignLeft className="size-4" />}
            </ToolBtn>
            <Slider label="Interligne" min={8} max={30} value={Math.round((first.lineHeight ?? 1.2) * 10)} format={(v) => (v / 10).toFixed(1)} onChange={(v) => updateMany(ids, () => ({ lineHeight: v / 10 }), 'lh')} />
            <Sep />
          </>
        )}
        {shapeSel && first && (
          <>
            <ColorPick title="Remplissage" value={first.fill || '#ffffff'} empty={!first.fill} docColors={docColors} onChange={(c) => updateMany(ids, () => ({ fill: c }), 'fill')} onClear={() => updateMany(ids, () => ({ fill: '' }))} />
            <ColorPick title="Contour" value={first.stroke || '#111111'} ring empty={!first.stroke || !first.strokeWidth} docColors={docColors} onChange={(c) => updateMany(ids, (e) => ({ stroke: c, strokeWidth: e.strokeWidth || 2 }), 'stroke')} onClear={() => updateMany(ids, () => ({ strokeWidth: 0 }))} />
            <Slider label="Contour" min={0} max={12} value={first.strokeWidth ?? 0} onChange={(v) => updateMany(ids, (e) => ({ strokeWidth: v, stroke: e.stroke || '#111111' }), 'sw')} />
            <ToolBtn title="Contour en pointillés" active={!!first.dashed} onClick={() => updateMany(ids, () => ({ dashed: !first.dashed }))}><DashIcon /></ToolBtn>
            {selEls.every((e) => e.type === 'shape_rect') && <Slider label="Arrondi" min={0} max={60} value={first.radius ?? 0} onChange={(v) => updateMany(ids, () => ({ radius: v }), 'radius')} />}
            <Sep />
          </>
        )}
        {lineSel && first && (
          <>
            <ColorPick title="Couleur" value={first.stroke || '#111111'} docColors={docColors} onChange={(c) => updateMany(ids, () => ({ stroke: c }), 'stroke')} />
            <Slider label="Épaisseur" min={1} max={12} value={first.strokeWidth ?? 2} onChange={(v) => updateMany(ids, () => ({ strokeWidth: v }), 'sw')} />
            <ToolBtn title="Pointillés" active={!!first.dashed} onClick={() => updateMany(ids, () => ({ dashed: !first.dashed }))}><DashIcon /></ToolBtn>
            <Sep />
          </>
        )}
        {customSel && first && (
          <>
            <Slider label="Transparence" min={10} max={100} value={Math.round((first.opacity ?? 1) * 100)} format={(v) => `${v}%`} onChange={(v) => updateMany(ids, () => ({ opacity: v / 100 }), 'op')} />
            <Sep />
          </>
        )}
        {multi && (
          <>
            <span className="px-1 text-xs font-medium text-slate-500">{selEls.length} éléments</span>
            <ToolBtn title="Aligner à gauche" onClick={() => align('left')}><AlignStartVertical className="size-4" /></ToolBtn>
            <ToolBtn title="Centrer horizontalement" onClick={() => align('hcenter')}><AlignCenterVertical className="size-4" /></ToolBtn>
            <ToolBtn title="Aligner à droite" onClick={() => align('right')}><AlignEndVertical className="size-4" /></ToolBtn>
            <ToolBtn title="Aligner en haut" onClick={() => align('top')}><AlignStartHorizontal className="size-4" /></ToolBtn>
            <ToolBtn title="Centrer verticalement" onClick={() => align('vcenter')}><AlignCenterHorizontal className="size-4" /></ToolBtn>
            <ToolBtn title="Aligner en bas" onClick={() => align('bottom')}><AlignEndHorizontal className="size-4" /></ToolBtn>
            <ToolBtn title="Répartir horizontalement" disabled={selEls.length < 3} onClick={() => distribute('h')}><AlignHorizontalSpaceAround className="size-4" /></ToolBtn>
            <ToolBtn title="Répartir verticalement" disabled={selEls.length < 3} onClick={() => distribute('v')}><AlignVerticalSpaceAround className="size-4" /></ToolBtn>
            <Sep />
          </>
        )}
        {selEls.length > 0 && (
          <>
            <ToolBtn title="Copier le style (⌘⌥C)" onClick={copyStyle} disabled={!selected || !isCustom(selected)}><Paintbrush className="size-4" /></ToolBtn>
            <ToolBtn title={allLocked ? 'Déverrouiller (⌘L)' : 'Verrouiller (⌘L)'} active={allLocked} onClick={toggleLock}>{allLocked ? <Lock className="size-4" /> : <Unlock className="size-4" />}</ToolBtn>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <ToolBtn title="Zoom arrière (⌘−)" onClick={() => setZoomClamped(zoom / 1.2)}><ZoomOut className="size-4" /></ToolBtn>
          <button type="button" title="Ajuster à l'écran (⌘0)" onClick={() => setZoom(1)} className="h-8 w-12 rounded-md text-center text-xs tabular-nums text-slate-500 hover:bg-slate-100">{Math.round(zoom * 100)}%</button>
          <ToolBtn title="Zoom avant (⌘+)" onClick={() => setZoomClamped(zoom * 1.2)}><ZoomIn className="size-4" /></ToolBtn>
          <ToolBtn title="Ajuster à l'écran (⌘0)" onClick={() => setZoom(1)}><Maximize className="size-4" /></ToolBtn>
        </div>
      </div>

      <div className="flex items-start gap-3">
        {/* ── Rail + panneau gauche façon Canva ──────────────────────────── */}
        <div className="sticky top-4 flex shrink-0 gap-2" style={{ height: boardH }}>
          <nav className="flex w-16 flex-col gap-1">
            {([
              ['elements', 'Éléments', Shapes],
              ['text', 'Texte', Type],
              ['uploads', 'Imports', Upload],
              ['layers', 'Calques', Layers],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id} type="button" onClick={() => setTab(id)}
                className={cn('flex flex-col items-center gap-1 rounded-lg py-2.5 text-[10px] font-medium transition-colors', tab === id ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700')}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </nav>

          <div className="w-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
            {tab === 'elements' && (
              <div className="space-y-4">
                <Section title="Formes">
                  <div className="grid grid-cols-4 gap-1.5">
                    <ShapeBtn title="Rectangle" onClick={() => addShape('shape_rect')}><div className="size-6 bg-current" /></ShapeBtn>
                    <ShapeBtn title="Rectangle arrondi" onClick={() => addShape('shape_rect', { rounded: true })}><div className="size-6 rounded-md bg-current" /></ShapeBtn>
                    <ShapeBtn title="Cercle" onClick={() => addShape('shape_ellipse')}><div className="size-6 rounded-full bg-current" /></ShapeBtn>
                    <ShapeBtn title="Triangle" onClick={() => addShape('shape_triangle')}><Triangle className="size-6 fill-current" /></ShapeBtn>
                    <ShapeBtn title="Cadre" onClick={() => addShape('shape_rect', { outline: true })}><Square className="size-6" /></ShapeBtn>
                    <ShapeBtn title="Cadre arrondi" onClick={() => addShape('shape_rect', { outline: true, rounded: true })}><div className="size-6 rounded-md border-2 border-current" /></ShapeBtn>
                    <ShapeBtn title="Anneau" onClick={() => addShape('shape_ellipse', { outline: true })}><Circle className="size-6" /></ShapeBtn>
                    <ShapeBtn title="Triangle (contour)" onClick={() => addShape('shape_triangle', { outline: true })}><Triangle className="size-6" /></ShapeBtn>
                  </div>
                </Section>
                <Section title="Lignes">
                  <div className="grid grid-cols-2 gap-1.5">
                    <ShapeBtn title="Ligne" onClick={() => addShape('shape_line')}><div className="h-0.5 w-12 bg-current" /></ShapeBtn>
                    <ShapeBtn title="Ligne pointillée" onClick={() => addShape('shape_line', { dashed: true })}><div className="h-0.5 w-12" style={{ background: 'repeating-linear-gradient(90deg,currentColor 0 6px,transparent 6px 10px)' }} /></ShapeBtn>
                  </div>
                </Section>
                <Section title="Bandeaux">
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['top', 'bottom', 'side'] as const).map((w) => (
                      <button key={w} type="button" title={{ top: 'Bandeau haut', bottom: 'Bandeau bas', side: 'Bande latérale' }[w]} onClick={() => addBanner(w)} className="relative aspect-[3/4] overflow-hidden rounded-md border border-slate-200 bg-white hover:border-brand-400">
                        <span className="absolute" style={{ background: accent, ...(w === 'top' ? { left: 0, right: 0, top: 0, height: 5 } : w === 'bottom' ? { left: 0, right: 0, bottom: 0, height: 5 } : { left: 0, top: 0, bottom: 0, width: 5 }) }} />
                      </button>
                    ))}
                  </div>
                </Section>
                <Section title="Couleurs du document">
                  <div className="flex flex-wrap gap-1.5">
                    {docColors.map((c) => (
                      <button key={c} type="button" title={`Ajouter une pastille ${c}`} onClick={() => add({ type: 'shape_ellipse', ...center(60, 60), fill: c, stroke: '', strokeWidth: 0 }, 'shp')} className="size-7 rounded-full border border-slate-200 transition-transform hover:scale-110" style={{ background: c }} />
                    ))}
                  </div>
                </Section>
              </div>
            )}

            {tab === 'text' && (
              <div className="space-y-4">
                <button type="button" onClick={() => addText('body')} className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                  <Type className="size-4" /> Ajouter une zone de texte
                </button>
                <Section title="Styles par défaut">
                  <button type="button" onClick={() => addText('title')} className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-xl font-bold text-slate-800 hover:border-brand-400 hover:bg-brand-50/50">Ajouter un titre</button>
                  <button type="button" onClick={() => addText('subtitle')} className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-left text-sm font-semibold text-slate-700 hover:border-brand-400 hover:bg-brand-50/50">Ajouter un sous-titre</button>
                  <button type="button" onClick={() => addText('body')} className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-left text-xs text-slate-600 hover:border-brand-400 hover:bg-brand-50/50">Ajouter un corps de texte</button>
                </Section>
                <Section title="Combinaisons">
                  <div className="space-y-1.5">
                    {TEXT_COMBOS.map((c) => (
                      <button key={c.label} type="button" title={c.label} onClick={() => addMany(c.items(), 'cmb')} className="w-full rounded-md border border-slate-200 bg-slate-50/60 px-3 py-3 text-left hover:border-brand-400 hover:bg-brand-50/40">
                        {c.render}
                      </button>
                    ))}
                  </div>
                </Section>
              </div>
            )}

            {tab === 'uploads' && (
              <div className="space-y-4">
                <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                  <ImagePlus className="size-4" /> Importer des images
                </button>
                <p className="text-[11px] leading-relaxed text-slate-400">PNG ou JPG. Glissez aussi vos fichiers directement sur la page.</p>
                {uploads.length > 0 && (
                  <Section title="Déjà utilisées">
                    <div className="grid grid-cols-2 gap-1.5">
                      {uploads.map((src) => (
                        <button key={src.slice(-40)} type="button" title="Réutiliser" onClick={() => reuseImage(src)} className="grid aspect-square place-items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-1 hover:border-brand-400">
                          <img src={src} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
                        </button>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            )}

            {tab === 'layers' && (
              <div className="space-y-2">
                <ul className="space-y-0.5">
                  {[...els].reverse().map((el) => {
                    const meta = ELEMENT_META[el.type];
                    const on = selSet.has(el.id);
                    return (
                      <li
                        key={el.id}
                        draggable
                        onDragStart={() => setDragLayer(el.id)}
                        onDragEnd={() => setDragLayer(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (!dragLayer || dragLayer === el.id) return;
                          const list = elsRef.current.filter((x) => x.id !== dragLayer);
                          const moving = elsRef.current.find((x) => x.id === dragLayer)!;
                          const j = list.findIndex((x) => x.id === el.id);
                          const from = elsRef.current.findIndex((x) => x.id === dragLayer);
                          const to = elsRef.current.findIndex((x) => x.id === el.id);
                          list.splice(from < to ? j + 1 : j, 0, moving);
                          commit(list);
                          setDragLayer(null);
                        }}
                        onClick={(e) => setSel(e.shiftKey || e.metaKey ? (on ? sel.filter((s) => s !== el.id) : [...sel, el.id]) : [el.id])}
                        className={cn(
                          'group flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[11px] transition-colors',
                          on ? 'bg-brand-50 font-semibold text-brand-700 ring-1 ring-brand-300' : 'text-slate-600 hover:bg-slate-100',
                          !el.visible && 'opacity-40',
                          dragLayer === el.id && 'opacity-30',
                        )}
                      >
                        <GripVertical className="size-3 shrink-0 cursor-grab text-slate-300" />
                        <LayerThumb el={el} color={meta.color} />
                        <span className="flex-1 truncate">{el.type === 'custom_text' && el.content ? el.content : meta.label}</span>
                        <button
                          type="button" aria-label="Verrouiller"
                          onClick={(e) => { e.stopPropagation(); update(el.id, { locked: !el.locked }); }}
                          className={cn('shrink-0', el.locked ? 'text-slate-500' : 'text-slate-300 opacity-0 group-hover:opacity-100 hover:text-slate-500')}
                        >
                          {el.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                        </button>
                        <button
                          type="button" aria-label="Visibilité"
                          onClick={(e) => { e.stopPropagation(); update(el.id, { visible: !el.visible }); }}
                          className="shrink-0 text-slate-300 hover:text-slate-500"
                        >
                          {el.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" onClick={() => { commit(DEFAULT_CANVAS_LAYOUT); setSel([]); }} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600">
                  <RotateCcw className="size-3" /> Réinitialiser la mise en page
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" multiple className="hidden" onChange={onImage} />
          </div>
        </div>

        {/* ── Plan de travail ────────────────────────────────────────────── */}
        <div
          ref={boardRef}
          className={cn('relative min-w-0 flex-1 overflow-auto rounded-lg bg-slate-100', spaceDown && 'cursor-grab')}
          style={{ height: boardH }}
          onMouseDown={startMarquee}
          onContextMenu={(e) => e.preventDefault()}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
          onDrop={async (e) => {
            const files = [...e.dataTransfer.files].filter((f) => /image\/(png|jpe?g)/.test(f.type));
            if (!files.length) return;
            e.preventDefault();
            for (const f of files) { const img = await readImage(f); addImageSrc(img.src, img.w, img.h); }
          }}
        >
          <div className="flex min-h-full min-w-full items-center justify-center p-8" style={{ width: 'max-content' }}>
            <div
              ref={pageRef}
              className="relative shrink-0 bg-white shadow-lg ring-1 ring-slate-200"
              style={{
                width: px(A4_W), height: px(A4_H),
                backgroundImage: tpl.backgroundImageUrl ? `url(${tpl.backgroundImageUrl})` : undefined,
                backgroundSize: '100% 100%',
              }}
            >
              <div className="pointer-events-none absolute border border-dashed border-slate-200" style={{ left: px(MARGIN), top: px(MARGIN), right: px(MARGIN), bottom: px(MARGIN) }} />

              {els.map((el, idx) => {
                if (!el.visible) return null;
                const on = selSet.has(el.id);
                const custom = isCustom(el);
                const meta = ELEMENT_META[el.type];
                return (
                  <div
                    key={el.id}
                    className={cn('absolute', spaceDown ? 'cursor-grab' : el.locked ? 'cursor-default' : 'cursor-move', !on && 'hover:outline hover:outline-2 hover:outline-violet-400/70')}
                    style={{ left: px(el.x), top: px(el.y), width: px(el.w), height: px(el.h), zIndex: custom && el.type !== 'custom_text' ? idx : 100 + idx }}
                    onMouseDown={(e) => startMove(e, el)}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (!selSet.has(el.id)) setSel([el.id]); setMenu({ x: e.clientX, y: e.clientY }); }}
                    onDoubleClick={() => { if (el.type === 'custom_text' && !el.locked) { setSel([el.id]); setEditing(el.id); } }}
                  >
                    {custom ? (
                      <CustomRender el={el} scale={scale} editing={editing === el.id} onText={(v) => update(el.id, { content: v }, 'content')} onDone={() => setEditing(null)} />
                    ) : (
                      <BlockRender el={el} tpl={tpl} company={company} scale={scale} color={meta.color} label={meta.label} hover={!on} />
                    )}
                  </div>
                );
              })}

              {/* Contours des éléments d'une multi-sélection */}
              {multi && selEls.map((el) => (
                <div key={`o${el.id}`} className="pointer-events-none absolute z-[499]" style={{ left: px(el.x), top: px(el.y), width: px(el.w), height: px(el.h), outline: '1px solid #8b5cf6' }} />
              ))}

              {/* Cadre de sélection + poignées */}
              {selBox && (
                <div
                  className="pointer-events-none absolute z-[500]"
                  style={{ left: px(selBox.x), top: px(selBox.y), width: px(selBox.w), height: px(selBox.h), outline: multi ? '1.5px dashed #7c3aed' : '2px solid #7c3aed', outlineOffset: multi ? 3 : 1 }}
                >
                  {selected && !selected.locked && editing !== selected.id && !gesture.current && handles(selected).map((h) => (
                    <div
                      key={h}
                      className="pointer-events-auto absolute rounded-full border border-violet-600 bg-white shadow"
                      style={{
                        left: HANDLE_POS[h].left, top: HANDLE_POS[h].top, cursor: HANDLE_POS[h].cursor,
                        width: h.length === 2 ? 11 : h === 'n' || h === 's' ? 18 : 6,
                        height: h.length === 2 ? 11 : h === 'n' || h === 's' ? 6 : 18,
                        transform: 'translate(-50%, -50%)',
                      }}
                      onMouseDown={(e) => startResize(e, selected, h)}
                    />
                  ))}
                  {/* Barre flottante contextuelle */}
                  {!badge && (
                    <div
                      className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-1 py-0.5 shadow-md"
                      style={{ top: selBox.y < 50 ? '100%' : undefined, bottom: selBox.y < 50 ? undefined : '100%', margin: '10px 0' }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {customSel && <MiniBtn title="Dupliquer (⌘D)" onClick={duplicate}><Copy className="size-3.5" /></MiniBtn>}
                      <MiniBtn title={allLocked ? 'Déverrouiller' : 'Verrouiller'} onClick={toggleLock}>
                        {allLocked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                      </MiniBtn>
                      <MiniBtn title="Supprimer (Suppr)" onClick={removeSel} danger><Trash2 className="size-3.5" /></MiniBtn>
                      <MiniBtn title="Plus d'options" onClick={() => {
                        const r = pageRef.current!.getBoundingClientRect();
                        setMenu({ x: r.left + px(selBox.x + selBox.w / 2), y: r.top + px(selBox.y) });
                      }}><span className="text-base leading-none">⋯</span></MiniBtn>
                    </div>
                  )}
                  {badge && (
                    <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white shadow">{badge}</div>
                  )}
                </div>
              )}

              {guides.v.map((g, i) => <div key={`v${i}`} className="pointer-events-none absolute top-0 bottom-0 z-[600]" style={{ left: px(g), width: 1, background: '#ec4899' }} />)}
              {guides.h.map((g, i) => <div key={`h${i}`} className="pointer-events-none absolute left-0 right-0 z-[600]" style={{ top: px(g), height: 1, background: '#ec4899' }} />)}
              {gaps.map((g, i) => {
                const horiz = g.y1 === g.y2;
                return (
                  <div key={`g${i}`} className="pointer-events-none absolute z-[600]" style={horiz
                    ? { left: px(g.x1), top: px(g.y1), width: px(g.x2 - g.x1), height: 0, borderTop: '1px dashed #ec4899' }
                    : { left: px(g.x1), top: px(g.y1), height: px(g.y2 - g.y1), width: 0, borderLeft: '1px dashed #ec4899' }}
                  >
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-pink-500 px-1 text-[9px] font-semibold tabular-nums text-white">{Math.round(g.d)}</span>
                  </div>
                );
              })}
              {marquee && (
                <div className="pointer-events-none absolute z-[700] border border-violet-500 bg-violet-500/10" style={{ left: px(marquee.x), top: px(marquee.y), width: px(marquee.w), height: px(marquee.h) }} />
              )}
            </div>
          </div>
        </div>

        {/* ── Panneau droit : position & disposition ─────────────────────── */}
        <div className="sticky top-4 w-52 shrink-0 space-y-4 overflow-y-auto text-[11px]" style={{ maxHeight: boardH }}>
          {selEls.length ? (
            <>
              {selected?.type === 'custom_text' && (
                <Section title="Texte">
                  <textarea
                    value={selected.content ?? ''}
                    onChange={(e) => update(selected.id, { content: e.target.value }, 'content')}
                    rows={3}
                    className="w-full resize-none rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-brand-400 focus:outline-none"
                  />
                </Section>
              )}
              {selected && !isCustom(selected) && selected.type !== 'logo' && (
                <BlockStylePanel el={selected} tpl={tpl} docColors={docColors} onChange={(p, key) => update(selected.id, p, key)} />
              )}
              {(textSel || shapeSel) && (
                <Section title={textSel ? 'Couleur du texte' : 'Remplissage'}>
                  <Swatches docColors={docColors} onPick={(c) => updateMany(ids, () => (textSel ? { color: c } : { fill: c }))} />
                </Section>
              )}

              <Section title={multi ? 'Aligner les éléments' : 'Aligner sur la page'}>
                <div className="grid grid-cols-3 gap-1">
                  <AlignBtn title="Gauche" onClick={() => align('left')}><AlignStartVertical className="size-3.5" /></AlignBtn>
                  <AlignBtn title="Centre" onClick={() => align('hcenter')}><AlignCenterVertical className="size-3.5" /></AlignBtn>
                  <AlignBtn title="Droite" onClick={() => align('right')}><AlignEndVertical className="size-3.5" /></AlignBtn>
                  <AlignBtn title="Haut" onClick={() => align('top')}><AlignStartHorizontal className="size-3.5" /></AlignBtn>
                  <AlignBtn title="Milieu" onClick={() => align('vcenter')}><AlignCenterHorizontal className="size-3.5" /></AlignBtn>
                  <AlignBtn title="Bas" onClick={() => align('bottom')}><AlignEndHorizontal className="size-3.5" /></AlignBtn>
                </div>
              </Section>

              <Section title="Disposition">
                <div className="grid grid-cols-4 gap-1">
                  <AlignBtn title="Premier plan (⌘⌥])" onClick={() => reorder('top')}><ArrowUpToLine className="size-3.5" /></AlignBtn>
                  <AlignBtn title="Avancer (⌘])" onClick={() => reorder('up')}><ChevronUp className="size-3.5" /></AlignBtn>
                  <AlignBtn title="Reculer (⌘[)" onClick={() => reorder('down')}><ChevronDown className="size-3.5" /></AlignBtn>
                  <AlignBtn title="Arrière-plan (⌘⌥[)" onClick={() => reorder('bottom')}><ArrowDownToLine className="size-3.5" /></AlignBtn>
                </div>
                {selected && (
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <NumField label="X" value={selected.x} onChange={(v) => update(selected.id, { x: clamp(v, 0, A4_W - selected.w) }, 'x')} />
                    <NumField label="Y" value={selected.y} onChange={(v) => update(selected.id, { y: clamp(v, 0, A4_H - selected.h) }, 'y')} />
                    <NumField label="L" value={selected.w} onChange={(v) => update(selected.id, { w: clamp(v, 12, A4_W - selected.x) }, 'w')} />
                    <NumField label="H" value={selected.h} onChange={(v) => update(selected.id, { h: clamp(v, 4, A4_H - selected.y) }, 'h')} />
                  </div>
                )}
              </Section>
            </>
          ) : (
            <Section title="Raccourcis">
              <ul className="space-y-1 text-[10px] leading-relaxed text-slate-400">
                <li>Glisser sur la page : sélection multiple</li>
                <li>Maj + clic : ajouter à la sélection</li>
                <li>Double-clic : modifier un texte</li>
                <li>Clic droit : plus d'actions</li>
                <li>⌘Z / ⌘⇧Z : annuler / rétablir</li>
                <li>⌘D dupliquer · ⌘C / ⌘X / ⌘V</li>
                <li>⌘⌥C / ⌘⌥V : copier / coller le style</li>
                <li>⌘A : tout sélectionner · ⌘L : verrouiller</li>
                <li>⌘] / ⌘[ : avancer / reculer</li>
                <li>Flèches : déplacer (Maj = ×10)</li>
                <li>Coin d'un texte : agrandir la police</li>
                <li>Maj + coin : garder les proportions</li>
                <li>Alt en glissant : sans magnétisme</li>
                <li>⌘ + molette : zoom · Espace : main</li>
              </ul>
            </Section>
          )}
        </div>
      </div>

      {/* Menu contextuel */}
      {menu && (
        <div
          className="fixed z-[1000] w-56 rounded-lg border border-slate-200 bg-white py-1 text-xs text-slate-700 shadow-xl"
          style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 380) }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {([
            [Copy, 'Copier', '⌘C', copySel, !customSel],
            [ClipboardPaste, 'Coller', '⌘V', paste, !clip.current.length],
            [Copy, 'Dupliquer', '⌘D', duplicate, !customSel],
            null,
            [Paintbrush, 'Copier le style', '⌘⌥C', copyStyle, !selected || !isCustom(selected)],
            [Paintbrush, 'Coller le style', '⌘⌥V', pasteStyle, !styleClip.current || !customSel],
            null,
            [ArrowUpToLine, 'Premier plan', '⌘⌥]', () => reorder('top'), !selEls.length],
            [ChevronUp, 'Avancer', '⌘]', () => reorder('up'), !selEls.length],
            [ChevronDown, 'Reculer', '⌘[', () => reorder('down'), !selEls.length],
            [ArrowDownToLine, 'Arrière-plan', '⌘⌥[', () => reorder('bottom'), !selEls.length],
            null,
            [allLocked ? Unlock : Lock, allLocked ? 'Déverrouiller' : 'Verrouiller', '⌘L', toggleLock, !selEls.length],
            [Trash2, 'Supprimer', 'Suppr', removeSel, !selEls.length || allLocked],
          ] as const).map((item, i) => item === null ? (
            <div key={i} className="my-1 h-px bg-slate-100" />
          ) : (
            <button
              key={i} type="button" disabled={item[4]}
              onClick={() => { item[3](); setMenu(null); }}
              className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 disabled:opacity-35 disabled:hover:bg-transparent', item[1] === 'Supprimer' && 'text-rose-600')}
            >
              {(() => { const I = item[0]; return <I className="size-3.5" />; })()}
              <span className="flex-1">{item[1]}</span>
              <span className="text-[10px] text-slate-400">{item[2]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Rendu des éléments ───────────────────────────────────────────────────────
function CustomRender({ el, scale, editing, onText, onDone }: {
  el: CanvasEl; scale: number; editing: boolean; onText: (v: string) => void; onDone: () => void;
}) {
  const op = el.opacity ?? 1;
  if (el.type === 'image') {
    return el.src ? <img src={el.src} alt="" draggable={false} className="size-full" style={{ opacity: op }} /> : null;
  }
  if (el.type === 'shape_line') {
    const t = Math.max(1, (el.strokeWidth ?? 2) * scale);
    const c = el.stroke || '#111';
    return (
      <div
        className="absolute left-0 right-0 top-1/2 -translate-y-1/2"
        style={{ height: t, opacity: op, background: el.dashed ? `repeating-linear-gradient(90deg, ${c} 0 ${t * 3}px, transparent ${t * 3}px ${t * 5}px)` : c }}
      />
    );
  }
  if (el.type === 'shape_triangle') {
    const sw = el.stroke ? (el.strokeWidth ?? 0) : 0;
    return (
      <svg className="size-full overflow-visible" viewBox={`0 0 ${el.w} ${el.h}`} preserveAspectRatio="none" style={{ opacity: op }}>
        <polygon
          points={`${el.w / 2},0 ${el.w},${el.h} 0,${el.h}`}
          fill={el.fill || 'none'} stroke={sw ? el.stroke : 'none'} strokeWidth={sw}
          strokeDasharray={el.dashed && sw ? `${sw * 3} ${sw * 2}` : undefined} vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: sw * scale }}
        />
      </svg>
    );
  }
  if (el.type === 'shape_rect' || el.type === 'shape_ellipse') {
    const sw = el.stroke ? (el.strokeWidth ?? 0) * scale : 0;
    return (
      <div
        className="size-full"
        style={{
          background: el.fill || 'transparent',
          border: sw ? `${sw}px ${el.dashed ? 'dashed' : 'solid'} ${el.stroke}` : undefined,
          borderRadius: el.type === 'shape_ellipse' ? '50%' : (el.radius ?? 0) * scale,
          opacity: op,
        }}
      />
    );
  }
  const fs = (el.fontSize ?? 10) * scale;
  const style: React.CSSProperties = {
    fontFamily: FONTS[el.fontFamily ?? 'helvetica'].css,
    fontSize: fs,
    lineHeight: el.lineHeight ?? 1.2,
    fontWeight: el.bold ? 700 : 400,
    fontStyle: el.italic ? 'italic' : 'normal',
    textDecoration: el.underline ? 'underline' : 'none',
    textTransform: el.uppercase ? 'uppercase' : 'none',
    color: el.color ?? '#111',
    textAlign: el.align ?? 'left',
    opacity: op,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };
  if (editing) {
    return (
      <textarea
        autoFocus
        value={el.content ?? ''}
        onChange={(e) => onText(e.target.value)}
        onBlur={onDone}
        onKeyDown={(e) => { if (e.key === 'Escape') onDone(); e.stopPropagation(); }}
        onMouseDown={(e) => e.stopPropagation()}
        onFocus={(e) => e.currentTarget.select()}
        className="absolute inset-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
        style={{ ...style, userSelect: 'text' }}
      />
    );
  }
  return <div className="size-full overflow-visible" style={style}>{el.content || ' '}</div>;
}

// Aperçu fidèle au PDF : mêmes tailles (pt), mêmes couleurs, données d'exemple.
const SAMPLE_LINES = [
  ['Dépose et évacuation ancien carrelage', '24', 'm²', '18,00 €', '432,00 €'],
  ['Fourniture et pose carrelage 60×60', '24', 'm²', '62,00 €', '1 488,00 €'],
  ['Ragréage autolissant', '24', 'm²', '14,50 €', '348,00 €'],
  ['Plinthes assorties', '18', 'ml', '9,00 €', '162,00 €'],
];

function BlockRender({ el, tpl, company, scale, color, label, hover }: {
  el: CanvasEl; tpl: QuoteTemplate; company: PdfCompany; scale: number; color: string; label: string; hover: boolean;
}) {
  const accent = el.accent || tpl.accentColor || '#f97316';
  const k = el.textScale ?? 1;
  const pt = (n: number) => n * scale;
  const t = (size: number, extra: React.CSSProperties = {}): React.CSSProperties => ({ fontSize: pt(size * k), lineHeight: 1.2, ...extra });
  const gray = (v: number) => el.color || `rgb(${v},${v},${v})`;
  const off = (
    <div className="flex size-full items-center justify-center rounded-sm border border-dashed text-center" style={{ borderColor: `${color}66`, color: `${color}aa`, fontSize: Math.max(8, pt(8)) }}>
      {label} · masqué
    </div>
  );

  let body: React.ReactNode;
  switch (el.type) {
    case 'logo':
      body = tpl.logoDataUrl
        ? <img src={tpl.logoDataUrl} alt="" draggable={false} className="size-full object-contain object-left" />
        : (
          <div className="flex size-full items-center gap-[0.4em] rounded-sm border border-dashed border-slate-300 bg-slate-50 px-[0.6em] text-slate-400" style={t(9)}>
            <ImagePlus style={{ width: pt(14), height: pt(14) }} /> Votre logo
          </div>
        );
      break;
    case 'company_name':
      body = <div className="truncate font-bold" style={t(16, { color: gray(20) })}>{company.name}</div>;
      break;
    case 'company_details': {
      if (!tpl.showCompanyDetails) { body = off; break; }
      const lines = companyIdentityLines(company);
      const shown = lines.length ? lines : ['SAS au capital de 10 000 €', 'SIRET 123 456 789 00012', '12 rue des Artisans, 69000 Lyon', 'TVA FR12 123456789'];
      body = (
        <div style={{ color: gray(110), opacity: lines.length ? 1 : 0.55 }}>
          {shown.map((l) => <div key={l} className="truncate" style={{ fontSize: pt(7.5 * k), lineHeight: `${pt(10 * k)}px` }}>{l}</div>)}
        </div>
      );
      break;
    }
    case 'quote_label':
      body = <div className="text-right font-bold" style={t(26, { color: el.accent || el.color || tpl.accentColor, lineHeight: 1 })}>DEVIS</div>;
      break;
    case 'meta_block':
      body = (
        <div className="text-right" style={t(9, { color: gray(110), lineHeight: `${pt(13 * k)}px` })}>
          {tpl.showReference && <div>Référence : DEV-2026-0042</div>}
          {tpl.showDate && <div>Date : {new Date().toLocaleDateString('fr-FR')}</div>}
        </div>
      );
      break;
    case 'client_block':
      body = (
        <div style={{ color: gray(20) }}>
          <div className="font-bold" style={t(9, { color: el.accent || undefined })}>ADRESSÉ À</div>
          <div style={t(10, { marginTop: pt(3) })}>Marie Lambert</div>
          {tpl.showClientEmail && <div style={t(10, { color: gray(110), marginTop: pt(2) })}>marie.lambert@email.fr</div>}
        </div>
      );
      break;
    case 'table': {
      const ts = resolveTableStyle(el.tableStyle, tpl.accentColor);
      const cols = ts.columns.map((c, i) => ({ ...c, i })).filter((c) => c.visible);
      const idx = ['label', 'quantity', 'unit', 'unitPrice', 'total'];
      const bd = ts.border ? `${Math.max(0.5, pt(0.5))}px solid ${ts.border}` : undefined;
      body = (
        <table className="w-full border-collapse" style={t(9, { color: ts.textColor })}>
          {ts.showHead && (
            <thead>
              <tr style={{ background: ts.headBg, color: ts.headColor }}>
                {cols.map((c) => (
                  <th key={c.key} className="font-bold" style={{ padding: pt(5), textAlign: COLUMN_ALIGN[c.key], border: bd }}>{c.label}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {SAMPLE_LINES.map((r, ri) => (
              <tr key={ri} style={{ background: ri % 2 && ts.stripe ? ts.stripe : 'transparent' }}>
                {cols.map((c) => (
                  <td key={c.key} className={c.key === 'label' ? 'truncate' : 'whitespace-nowrap'} style={{ padding: pt(5), textAlign: COLUMN_ALIGN[c.key], border: bd, maxWidth: c.key === 'label' ? pt(el.w - 252) : undefined }}>{r[idx.indexOf(c.key)]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
      break;
    }
    case 'totals_block':
      body = (
        <div style={t(9, { color: gray(90) })}>
          <div className="flex justify-between" style={{ height: pt(14) }}><span>Total HT</span><span>2 430,00 €</span></div>
          {company.vatExempt
            ? <div style={{ height: pt(14) }}>TVA non applicable (art. 293 B du CGI)</div>
            : <div className="flex justify-between" style={{ height: pt(14) }}><span>TVA (10 %)</span><span>243,00 €</span></div>}
          <div style={{ borderTop: `${Math.max(0.5, pt(0.5))}px solid ${accent}`, margin: `${pt(2)}px 0 ${pt(4)}px` }} />
          <div className="flex justify-between font-bold" style={t(11, { color: accent })}>
            <span>{company.vatExempt ? 'Total' : 'Total TTC'}</span><span>{company.vatExempt ? '2 430,00 €' : '2 673,00 €'}</span>
          </div>
        </div>
      );
      break;
    case 'conditions':
      body = (
        <div>
          <div className="font-bold" style={t(9, { color: el.accent || gray(20) })}>CONDITIONS</div>
          <div style={t(9, { color: gray(90), marginTop: pt(4) })}>Acompte de 30 % à la signature. Solde à la fin du chantier. Devis valable 30 jours.</div>
        </div>
      );
      break;
    case 'signature':
      body = (
        <div className="size-full" style={{ border: `${Math.max(0.5, pt(0.5))}px solid ${el.accent || 'rgb(180,180,180)'}`, borderRadius: pt(3), padding: `${pt(6)}px ${pt(8)}px` }}>
          <div className="font-bold" style={t(8, { color: gray(90) })}>BON POUR ACCORD</div>
          <div style={t(8, { color: gray(140), marginTop: pt(3) })}>Date et signature du client</div>
        </div>
      );
      break;
    case 'legal_block': {
      if (!tpl.showLegal) { body = off; break; }
      const m = legalMentions(company);
      const shown = m.length ? m : ['Assurance décennale : AXA n° 0000000', 'Médiateur de la consommation : CM2C', 'Pénalités de retard : 3 × taux légal'];
      body = (
        <div style={{ opacity: m.length ? 1 : 0.55 }}>
          <div className="font-bold" style={t(7, { color: gray(120) })}>MENTIONS LÉGALES</div>
          <div className="overflow-hidden" style={t(6.8, { color: gray(140), marginTop: pt(3) })}>{shown.join('  ·  ')}</div>
        </div>
      );
      break;
    }
    case 'footer_text':
      body = (
        <div className="flex justify-between gap-2" style={t(8, { color: gray(160) })}>
          <span className="truncate">{tpl.footerText}</span><span className="shrink-0">{company.name}</span>
        </div>
      );
      break;
    default:
      body = null;
  }

  return (
    <div className="group/blk relative size-full" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div className="size-full overflow-hidden" style={{ background: el.fill || undefined, borderRadius: el.radius ? pt(el.radius) : undefined }}>{body}</div>
      {hover && (
        <span
          className="pointer-events-none absolute -top-[18px] left-0 hidden whitespace-nowrap rounded px-1.5 py-px text-[10px] font-semibold text-white group-hover/blk:block"
          style={{ background: '#8b5cf6' }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

function LayerThumb({ el, color }: { el: CanvasEl; color: string }) {
  const base = 'grid size-6 shrink-0 place-items-center overflow-hidden rounded border border-slate-200 bg-white';
  if (el.type === 'image' && el.src) return <span className={base}><img src={el.src} alt="" className="max-h-full max-w-full" draggable={false} /></span>;
  if (el.type === 'custom_text') return <span className={base} style={{ color: el.color, fontFamily: FONTS[el.fontFamily ?? 'helvetica'].css }}><span className="text-[10px] font-bold">T</span></span>;
  if (el.type === 'shape_line') return <span className={base}><span className="h-0.5 w-4" style={{ background: el.stroke || '#111' }} /></span>;
  if (el.type === 'shape_triangle') return <span className={base}><Triangle className="size-3.5" style={{ color: el.fill || el.stroke, fill: el.fill || 'none' }} /></span>;
  if (el.type === 'shape_rect' || el.type === 'shape_ellipse') {
    return <span className={base}><span className="size-3.5" style={{ background: el.fill || 'transparent', border: el.strokeWidth ? `1.5px solid ${el.stroke}` : undefined, borderRadius: el.type === 'shape_ellipse' ? '50%' : el.radius ? 3 : 0 }} /></span>;
  }
  return <span className={base}><span className="size-2 rounded-full" style={{ background: color }} /></span>;
}

function DashIcon() {
  return <span className="h-0.5 w-4" style={{ background: 'repeating-linear-gradient(90deg,currentColor 0 3px,transparent 3px 5px)' }} />;
}

// ─── Petits composants UI ─────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-slate-500">{title}</p>
      {children}
    </div>
  );
}
function Sep() { return <div className="mx-1 h-5 w-px bg-slate-200" />; }

function ToolBtn({ title, onClick, active, disabled, children }: { title: string; onClick: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled}
      className={cn('grid size-8 place-items-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent', active && 'bg-brand-50 text-brand-700')}
    >
      {children}
    </button>
  );
}

function Swatches({ docColors, onPick, value }: { docColors: string[]; onPick: (c: string) => void; value?: string }) {
  const sw = (c: string) => (
    <button
      key={c} type="button" title={c} onClick={() => onPick(c)}
      className={cn('size-6 rounded-full border border-slate-300 transition-transform hover:scale-110', value?.toLowerCase() === c.toLowerCase() && 'ring-2 ring-brand-500 ring-offset-1')}
      style={{ background: c }}
    />
  );
  return (
    <div className="space-y-2">
      {docColors.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] text-slate-400">Couleurs du document</p>
          <div className="flex flex-wrap gap-1.5">{docColors.map(sw)}</div>
        </div>
      )}
      <div>
        <p className="mb-1 text-[10px] text-slate-400">Couleurs par défaut</p>
        <div className="grid grid-cols-5 gap-1.5">{PALETTE.map(sw)}</div>
      </div>
    </div>
  );
}

function ColorPick({ title, value, onChange, onClear, letter, ring, empty, docColors }: {
  title: string; value: string; onChange: (c: string) => void; onClear?: () => void; letter?: boolean; ring?: boolean; empty?: boolean; docColors: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" title={title} aria-label={title} onClick={() => setOpen((o) => !o)} className={cn('grid size-8 place-items-center rounded-md hover:bg-slate-100', open && 'bg-slate-100')}>
        {letter ? (
          <span className="flex flex-col items-center text-sm font-bold leading-none text-slate-700">
            A<span className="mt-0.5 h-1 w-4 rounded-sm" style={{ background: value }} />
          </span>
        ) : (
          <span
            className="size-5 rounded"
            style={ring
              ? { border: `3px solid ${empty ? '#cbd5e1' : value}` }
              : { background: empty ? 'repeating-conic-gradient(#e2e8f0 0 25%, #fff 0 50%) 0 0/8px 8px' : value, border: '1px solid #cbd5e1' }}
          />
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[900] mt-1 w-56 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <p className="text-[11px] font-semibold text-slate-600">{title}</p>
          <Swatches docColors={docColors} value={empty ? undefined : value} onPick={onChange} />
          <div className="flex items-center gap-2 border-t border-slate-100 pt-2">
            <label className="relative grid size-6 cursor-pointer place-items-center rounded-full border border-slate-300" style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }} title="Couleur personnalisée">
              <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
            <input
              key={value} defaultValue={value}
              onBlur={(e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="w-20 rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[11px] uppercase focus:border-brand-400 focus:outline-none"
            />
            {onClear && (
              <button type="button" onClick={() => { onClear(); setOpen(false); }} className="ml-auto text-[11px] text-slate-400 hover:text-rose-500">Aucune</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Slider({ label, min, max, value, onChange, format }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="flex items-center gap-1.5 px-1 text-[11px] text-slate-500">
      {label}
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-20 accent-brand-600" />
      <span className="w-8 tabular-nums text-slate-400">{format ? format(value) : value}</span>
    </label>
  );
}

function ShapeBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className="grid aspect-square place-items-center rounded-md bg-slate-50 text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-500">
      {children}
    </button>
  );
}

function MiniBtn({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className={cn('grid size-7 place-items-center rounded-md hover:bg-slate-100', danger ? 'text-rose-500' : 'text-slate-600')}>
      {children}
    </button>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1 rounded border border-slate-200 px-1.5 focus-within:border-brand-400">
      <span className="text-slate-400">{label}</span>
      <input type="number" value={Math.round(value)} onChange={(e) => onChange(Number(e.target.value))} className="w-full bg-transparent py-0.5 text-right text-[11px] focus:outline-none" />
    </label>
  );
}

function AlignBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className="grid h-7 place-items-center rounded border border-slate-200 text-slate-500 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600">
      {children}
    </button>
  );
}

// ─── Style des blocs de données (couleurs, taille, tableau) ─────────────────
function BlockStylePanel({ el, tpl, docColors, onChange }: {
  el: CanvasEl; tpl: QuoteTemplate; docColors: string[]; onChange: (p: Partial<CanvasEl>, key?: string) => void;
}) {
  const hasAccent = ['quote_label', 'totals_block', 'client_block', 'conditions', 'signature'].includes(el.type);
  const isTable = el.type === 'table';
  const ts = resolveTableStyle(el.tableStyle, tpl.accentColor);
  const setTs = (p: Partial<TableStyle>, key?: string) => onChange({ tableStyle: { ...ts, ...el.tableStyle, columns: ts.columns, ...p } }, key);
  const moveCol = (i: number, d: number) => {
    const c = [...ts.columns]; const j = i + d; if (j < 0 || j >= c.length) return;
    [c[i], c[j]] = [c[j], c[i]]; setTs({ columns: c });
  };
  const row = (label: string, node: React.ReactNode) => (
    <div className="flex items-center justify-between gap-2"><span className="text-slate-500">{label}</span>{node}</div>
  );
  return (
    <>
      <Section title="Style du bloc">
        <div className="space-y-1">
          {!isTable && row('Texte', <ColorPick title="Couleur du texte" value={el.color || '#3c3c3c'} empty={!el.color} docColors={docColors} onChange={(c) => onChange({ color: c }, 'color')} onClear={() => onChange({ color: undefined })} letter />)}
          {hasAccent && row('Accent', <ColorPick title="Couleur d'accent" value={el.accent || tpl.accentColor} empty={!el.accent} docColors={docColors} onChange={(c) => onChange({ accent: c }, 'accent')} onClear={() => onChange({ accent: undefined })} />)}
          {row('Fond', <ColorPick title="Fond du bloc" value={el.fill || '#ffffff'} empty={!el.fill} docColors={docColors} onChange={(c) => onChange({ fill: c }, 'fill')} onClear={() => onChange({ fill: '' })} />)}
          <Slider label="Taille" min={60} max={180} value={Math.round((el.textScale ?? 1) * 100)} format={(v) => `${v}%`} onChange={(v) => onChange({ textScale: v / 100 }, 'ts')} />
          {el.fill && <Slider label="Arrondi" min={0} max={30} value={el.radius ?? 0} onChange={(v) => onChange({ radius: v }, 'radius')} />}
        </div>
      </Section>
      {isTable && (
        <>
          <Section title="Couleurs du tableau">
            <div className="space-y-1">
              {row('En-tête', <ColorPick title="Fond de l'en-tête" value={ts.headBg} docColors={docColors} onChange={(c) => setTs({ headBg: c }, 'hb')} />)}
              {row('Texte en-tête', <ColorPick title="Texte de l'en-tête" value={ts.headColor} docColors={docColors} onChange={(c) => setTs({ headColor: c }, 'hc')} letter />)}
              {row('Texte lignes', <ColorPick title="Texte des lignes" value={ts.textColor} docColors={docColors} onChange={(c) => setTs({ textColor: c }, 'tc')} letter />)}
              {row('Lignes alternées', <ColorPick title="Lignes alternées" value={ts.stripe || '#f5f5f5'} empty={!ts.stripe} docColors={docColors} onChange={(c) => setTs({ stripe: c }, 'st')} onClear={() => setTs({ stripe: '' })} />)}
              {row('Bordures', <ColorPick title="Bordures" value={ts.border || '#dddddd'} ring empty={!ts.border} docColors={docColors} onChange={(c) => setTs({ border: c }, 'bd')} onClear={() => setTs({ border: '' })} />)}
              <label className="flex items-center gap-2 pt-1 text-slate-600">
                <input type="checkbox" checked={ts.showHead} onChange={(e) => setTs({ showHead: e.target.checked })} /> Afficher l'en-tête
              </label>
            </div>
          </Section>
          <Section title="Colonnes">
            <div className="space-y-1">
              {ts.columns.map((c, i) => (
                <div key={c.key} className="flex items-center gap-1">
                  <input type="checkbox" checked={c.visible} title="Afficher la colonne"
                    disabled={c.visible && ts.columns.filter((x) => x.visible).length === 1}
                    onChange={(e) => setTs({ columns: ts.columns.map((x) => x.key === c.key ? { ...x, visible: e.target.checked } : x) })} />
                  <input value={c.label}
                    onChange={(e) => setTs({ columns: ts.columns.map((x) => x.key === c.key ? { ...x, label: e.target.value } : x) }, `col-${c.key}`)}
                    className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] focus:border-brand-400 focus:outline-none" />
                  <button type="button" title="Monter" disabled={i === 0} onClick={() => moveCol(i, -1)} className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30"><ChevronUp className="size-3" /></button>
                  <button type="button" title="Descendre" disabled={i === ts.columns.length - 1} onClick={() => moveCol(i, 1)} className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30"><ChevronDown className="size-3" /></button>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </>
  );
}

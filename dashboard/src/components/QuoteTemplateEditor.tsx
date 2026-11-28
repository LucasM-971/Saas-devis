import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crown, FileUp, ImagePlus, Pipette, RotateCcw, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { QuoteCanvasEditor } from '@/components/QuoteCanvasEditor';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { buildQuotePdf, type PdfCompany } from '@/lib/quote-pdf';
import { cn } from '@/lib/cn';
import type { CanvasEl, QuoteTemplate } from '@/types';

// Devis fictif pour l'aperçu du modèle.
const SAMPLE_QUOTE = {
  id: 'sample',
  reference: 'DEV-2026-0042',
  clientName: 'Marie Lefèvre',
  clientEmail: 'marie.lefevre@email.fr',
  status: 'en_attente' as const,
  vatRate: 0.1,
  discountType: 'percent' as const,
  discountValue: 5,
  notes: 'Acompte de 30 % à la commande. Solde à la fin du chantier.',
  createdAt: new Date().toISOString().slice(0, 10),
  lines: [
    { id: '1', label: 'Peinture murs (2 couches)', unit: 'm2', quantity: 45, unitPrice: 28 },
    { id: '2', label: 'Enduit de lissage', unit: 'm2', quantity: 45, unitPrice: 18 },
    { id: '3', label: 'Préparation et protection des surfaces', unit: 'flat', quantity: 1, unitPrice: 250 },
  ],
};

const ACCENT_PRESETS = [
  { label: 'Orange', value: '#ea580c' },
  { label: 'Indigo', value: '#4f46e5' },
  { label: 'Bleu', value: '#2563eb' },
  { label: 'Vert BTP', value: '#16a34a' },
  { label: 'Ardoise', value: '#475569' },
  { label: 'Rouge', value: '#dc2626' },
];

const LOGO_POSITIONS = [
  { value: 'left', label: 'Gauche' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Droite' },
] as const;

const DEFAULTS: QuoteTemplate = {
  accentColor: '#ea580c',
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

type EditorTab = 'style' | 'layout';

export function QuoteTemplateEditor() {
  const { activeMembership } = useAuth();
  const company = activeMembership?.company.name ?? 'Mon entreprise';
  // Émetteur issu de la fiche entreprise
  const companyForPdf: PdfCompany = useMemo(
    () => activeMembership?.company ?? { name: company },
    [activeMembership, company],
  );
  // Vrai si des mentions légales sont renseignées (sinon on invite à les remplir).
  const hasLegalInfo = Boolean(
    activeMembership?.company &&
      (activeMembership.company.siret ||
        activeMembership.company.legalForm ||
        activeMembership.company.insuranceName ||
        activeMembership.company.vatNumber),
  );
  // Personnalisation réservée au premium
  const isPremium = activeMembership?.company.plan === 'premium';
  const { data: savedTpl } = useApi<QuoteTemplate>('/api/v1/quote-templates');

  const [tab, setTab] = useState<EditorTab>('style');
  const [tpl, setTpl] = useState<QuoteTemplate>(DEFAULTS);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved_, setSaved_] = useState(false);
  const [saveError, setSaveError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (savedTpl) {
      setTpl({ ...DEFAULTS, ...savedTpl });
    }
  }, [savedTpl]);

  const baseline = useMemo(() => ({ ...DEFAULTS, ...(savedTpl ?? {}) }), [savedTpl]);
  const dirty = JSON.stringify(tpl) !== JSON.stringify(baseline);

  // Regénère l'aperçu PDF à chaque changement (onglet Style uniquement)
  useEffect(() => {
    if (tab !== 'style') return;
    const url = buildQuotePdf(SAMPLE_QUOTE, companyForPdf, tpl).output('bloburl').toString();
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [tpl, companyForPdf, tab]);

  const set = (patch: Partial<QuoteTemplate>) => setTpl((t) => ({ ...t, ...patch }));

  const onLayoutChange = (layout: CanvasEl[]) => set({ canvasLayout: layout });

  // Image de fond, 4 Mo max.
  const onBackground = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setSaveError('Image trop lourde (max 4 Mo). Compressez votre modèle avant de l’importer.');
      return;
    }
    setSaveError('');
    const reader = new FileReader();
    reader.onload = () => set({ backgroundImageUrl: reader.result as string });
    reader.readAsDataURL(file);
  };

  const onLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set({ logoDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await api.patch('/api/v1/quote-templates', tpl);
      setSaved_(true);
      setTimeout(() => setSaved_(false), 2000);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const status = saved_
    ? 'Enregistré'
    : !isPremium
      ? 'Enregistrement avec le plan Premium'
      : dirty
        ? 'Modifications non enregistrées'
        : 'Aucune modification';

  const actionsBar = (
    <div className="flex items-center gap-3 text-sm">
      {saveError ? (
        <span className="text-rose-600">{saveError}</span>
      ) : (
        <span className="flex items-center gap-2 text-slate-500">
          {!isPremium ? (
            <Crown className="size-4 text-amber-600" />
          ) : (
            <span className={cn('size-2 rounded-full', dirty && !saved_ ? 'bg-brand-600' : 'bg-slate-300')} />
          )}
          {status}
        </span>
      )}
      {dirty && (
        <Button variant="ghost" size="sm" onClick={() => setTpl(baseline)}>
          <RotateCcw className="size-4" /> Annuler
        </Button>
      )}
      <Button
        size="sm"
        onClick={save}
        loading={saving}
        disabled={!isPremium || (!dirty && !saved_)}
        title={isPremium ? undefined : 'Plan Premium requis'}
      >
        {saved_ ? (
          <>
            <Check className="size-4" /> Enregistré
          </>
        ) : (
          'Enregistrer'
        )}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {tab === 'layout' && (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          options={[
            { value: 'style', label: 'Réglages rapides' },
            { value: 'layout', label: 'Éditeur libre' },
          ]}
          onChange={setTab}
        />
        <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3">
              {tpl.backgroundImageUrl && (
                <button
                  type="button"
                  onClick={() => set({ backgroundImageUrl: null })}
                  className="flex items-center gap-1 text-sm text-rose-600 transition-colors hover:text-rose-700"
                >
                  <Trash2 className="size-4" /> Retirer le fond
                </button>
              )}
              <Button variant="secondary" size="sm" onClick={() => bgRef.current?.click()}>
                <FileUp className="size-4" /> {tpl.backgroundImageUrl ? 'Remplacer le fond' : 'Importer un fond A4'}
              </Button>
              <input ref={bgRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={onBackground} />
            </div>
          {actionsBar}
        </div>
      </div>
      )}

      {tab === 'style' && (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          options={[
            { value: 'style', label: 'Réglages rapides' },
            { value: 'layout', label: 'Éditeur libre' },
          ]}
          onChange={setTab}
        />
              <div className="lg:hidden">{actionsBar}</div>
            </div>
            <Step n={1} title="Logo">
              {tpl.logoDataUrl ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={tpl.logoDataUrl}
                      alt="Logo"
                      className="h-12 max-w-[120px] rounded-lg border border-slate-200 bg-white object-contain p-1"
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="text-sm text-slate-600 transition-colors hover:text-slate-900"
                    >
                      Remplacer
                    </button>
                    <button
                      type="button"
                      onClick={() => set({ logoDataUrl: null })}
                      className="text-sm text-rose-600 transition-colors hover:text-rose-700"
                    >
                      Supprimer
                    </button>
                  </div>
                  <Segmented
                    value={tpl.logoPosition}
                    options={LOGO_POSITIONS}
                    onChange={(v) => set({ logoPosition: v })}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700"
                >
                  <ImagePlus className="size-4" />
                  Ajouter un logo
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onLogo} />
            </Step>

            <Step n={2} title="Couleur">
              <div className="flex flex-wrap items-center gap-2">
                {ACCENT_PRESETS.map((c) => {
                  const active = tpl.accentColor.toLowerCase() === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      title={c.label}
                      aria-label={c.label}
                      aria-pressed={active}
                      onClick={() => set({ accentColor: c.value })}
                      className={cn(
                        'grid size-8 place-items-center rounded-full ring-offset-2 transition-shadow',
                        active ? 'ring-2 ring-slate-900' : 'hover:ring-2 hover:ring-slate-300',
                      )}
                      style={{ backgroundColor: c.value }}
                    >
                      {active && <Check className="size-4 text-white" />}
                    </button>
                  );
                })}
                <label
                  className={cn(
                    'relative flex h-8 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition-colors',
                    ACCENT_PRESETS.some((c) => c.value === tpl.accentColor.toLowerCase())
                      ? 'border-slate-200 text-slate-600 hover:border-slate-300'
                      : 'border-slate-900 text-slate-900',
                  )}
                >
                  <Pipette className="size-4" /> Autre
                  <input
                    type="color"
                    value={tpl.accentColor}
                    onChange={(e) => set({ accentColor: e.target.value })}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                </label>
              </div>
            </Step>

            <Step n={3} title="Informations affichées">
              <div className="grid overflow-hidden rounded-card border border-slate-200 bg-surface sm:grid-cols-2 [&>label]:border-b [&>label]:border-slate-100 sm:[&>label:nth-child(odd)]:border-r">
                {(
                  [
                    { key: 'showReference', label: 'Référence du devis' },
                    { key: 'showDate', label: "Date d'émission" },
                    { key: 'showClientEmail', label: 'Email du client' },
                    { key: 'showCompanyDetails', label: 'Coordonnées légales' },
                    { key: 'showLegal', label: 'Mentions obligatoires' },
                  ] as { key: ToggleKey; label: string; hint?: string }[]
                ).map(({ key, label, hint }) => (
                  <Toggle
                    key={key}
                    label={label}
                    hint={hint}
                    checked={tpl[key]}
                    onChange={(v) => set({ [key]: v })}
                  />
                ))}
              </div>
              {!hasLegalInfo && (
                <p className="text-xs text-slate-500">
                  À compléter dans{' '}
                  <Link to="/app/settings?tab=entreprise" className="font-medium text-slate-700 underline">
                    Réglages › Entreprise
                  </Link>
                </p>
              )}
            </Step>

            <Step n={4} title="Pied de page">
              <Input
                value={tpl.footerText}
                onChange={(e) => set({ footerText: e.target.value })}
                placeholder="Devis valable 30 jours"
              />
            </Step>
          </div>

          {/* Aperçu, reste visible pendant le défilement */}
          <div className="lg:sticky lg:top-0 lg:self-start">
            <div className="mb-3 hidden justify-end lg:flex">{actionsBar}</div>
            <div className="h-[calc(100vh-140px)] min-h-[400px] overflow-hidden rounded-card border border-slate-200 bg-slate-100">
              {pdfUrl && (
                <iframe
                  key={pdfUrl}
                  src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`}
                  title="Aperçu du modèle de devis"
                  className="size-full"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'layout' && (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <QuoteCanvasEditor tpl={tpl} company={companyForPdf} onChange={onLayoutChange} />
          </div>
        </div>
      )}
    </div>
  );
}

type ToggleKey = 'showReference' | 'showDate' | 'showClientEmail' | 'showCompanyDetails' | 'showLegal';

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex gap-4">
      <span className="grid size-6 shrink-0 place-items-center rounded-full border border-slate-300 font-mono text-xs text-slate-500">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <h2 className="text-sm font-medium text-slate-900">{title}</h2>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 transition-colors hover:bg-slate-50">
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-slate-700">{label}</span>
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500',
          checked ? 'bg-brand-600' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </span>
    </label>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1 text-sm transition-colors',
            value === o.value ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

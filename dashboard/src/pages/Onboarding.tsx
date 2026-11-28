import { useRef, useState, type KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { presetCatalog } from '@/lib/catalog';
import { getTrade, TRADES, type CatalogItem, type TradeId } from '@/lib/trades';
import { unitLabel } from '@/lib/units';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { z } from 'zod';
import { companySchema, newCompanySchema } from '@/lib/validation/settings';

// Mêmes champs que Réglages > Entreprise, + email/téléphone déjà gérés par l'onboarding.
const onboardingSchema = companySchema.extend({
  contactEmail: newCompanySchema.shape.contactEmail,
  contactPhone: newCompanySchema.shape.contactPhone,
});
type OnboardingInput = z.input<typeof onboardingSchema>;
type OnboardingValues = z.infer<typeof onboardingSchema>;

const PLACEHOLDER_NAME = 'Mon entreprise';

// « Autre métier » : pas de métier enregistré ni de grille pré-remplie (aucun changement backend).
type Choice = TradeId | 'autre';
const STEPS = ['Votre métier', 'Votre entreprise'] as const;

// Onboarding : choix du métier puis infos entreprise.
export default function Onboarding() {
  const { user, activeMembership, refreshSession } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [metier, setMetier] = useState<Choice | null>(
    activeMembership?.company.metier ?? null,
  );
  const [savingMetier, setSavingMetier] = useState(false);
  const [error, setError] = useState('');

  const co = activeMembership?.company;
  const currentName = co?.name ?? '';
  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingInput, unknown, OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: currentName === PLACEHOLDER_NAME ? '' : currentName,
      siret: co?.siret ?? '',
      address: co?.address ?? '',
      defaultVatRate: co?.defaultVatRate ?? 0.2,
      legalForm: co?.legalForm ?? '',
      shareCapital: co?.shareCapital ?? '',
      rcsRm: co?.rcsRm ?? '',
      apeCode: co?.apeCode ?? '',
      vatNumber: co?.vatNumber ?? '',
      vatExempt: co?.vatExempt ?? false,
      insuranceName: co?.insuranceName ?? '',
      insuranceContract: co?.insuranceContract ?? '',
      insuranceCoverage: co?.insuranceCoverage ?? '',
      mediatorName: co?.mediatorName ?? '',
      mediatorUrl: co?.mediatorUrl ?? '',
      contactEmail: co?.contactEmail ?? user?.email ?? '',
      contactPhone: co?.contactPhone ?? '',
    },
  });



  // Étape 1 → 2 : enregistre le métier et pré-remplit le catalogue s'il est vide.
  const confirmMetier = async () => {
    if (!metier) return;
    if (metier === 'autre') {
      setError('');
      setStep(2);
      return;
    }
    setSavingMetier(true);
    setError('');
    try {
      const existing = await api.get<CatalogItem[]>('/api/v1/pricing/items');
      if (existing.length === 0) {
        const seed = presetCatalog(metier).map(({ label, unit, unitPrice }) => ({
          label,
          unit,
          unitPrice,
        }));
        await api.put('/api/v1/pricing/items', seed);
      }
      await api.patch('/api/v1/companies/current', { metier });
      await refreshSession();
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingMetier(false);
    }
  };

  // Étape 2 : « Plus tard » n'envoie que la raison sociale ; « Terminer » envoie les champs remplis.
  const saveCompany = async (v: OnboardingValues | null) => {
    if (!v && !(await trigger('name'))) return;
    setError('');
    const name = (v?.name ?? getValues('name')).trim();
    const payload: Record<string, string | number | boolean> = { name };
    if (v) {
      const { name: _n, defaultVatRate, vatExempt, ...texts } = v;
      for (const [k, val] of Object.entries(texts)) {
        if (typeof val === 'string' && val.trim()) payload[k] = val.trim();
      }
      payload.defaultVatRate = Number(defaultVatRate);
      if (vatExempt) payload.vatExempt = true;
    }
    try {
      await api.patch('/api/v1/companies/current', payload);
      await refreshSession();
      navigate('/app');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Échec de validation : ouvre le bloc replié concerné puis focus le premier champ invalide (ordre du DOM).
  const focusFirstError = (errs: Partial<Record<string, unknown>>) => {
    const el = Array.from(document.querySelectorAll<HTMLInputElement>('form input[name]')).find(
      (i) => i.name in errs,
    );
    if (!el) return;
    const details = el.closest('details');
    if (details) details.open = true;
    requestAnimationFrame(() => {
      el.scrollIntoView({
        block: 'center',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
      el.focus({ preventScroll: true });
    });
  };

  const hasPreview = step === 1 && !!metier && metier !== 'autre';

  return (
    <div className="min-h-dvh bg-canvas text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <Stepper step={step} />
        </div>
      </header>

      <main
        className={cn(
          'mx-auto w-full px-4 py-8 sm:px-6 lg:py-12',
          hasPreview ? 'max-w-6xl' : 'max-w-3xl',
        )}
      >
        {error && (
          <p role="alert" className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className={cn('grid gap-8', hasPreview && 'lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12')}>
          {step === 1 && (
            <section aria-labelledby="ob-step1">
              <h1 id="ob-step1" className="text-2xl font-semibold tracking-tight text-slate-900">
                Quel est votre métier&nbsp;?
              </h1>
              <p className="mt-1.5 text-sm text-slate-600">Pour pré-remplir vos tarifs.</p>

              <TradeChoices value={metier} onChange={setMetier} onConfirm={() => void confirmMetier()} />

              <p className="sr-only" aria-live="polite">
                {metier ? `${CHOICES.find((c) => c.id === metier)?.label} sélectionné` : ''}
              </p>

              <div className="mt-6 lg:hidden">
                <Prices choice={metier} />
              </div>

              <div className="mt-6 flex justify-end">
                <Button size="lg" disabled={!metier} loading={savingMetier} onClick={confirmMetier} className="w-full sm:w-auto">
                  Continuer
                </Button>
              </div>
            </section>
          )}

          {step === 2 && (
            <section aria-labelledby="ob-step2">
              <div className="mb-4 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Retour
                </button>
                <button
                  type="button"
                  onClick={() => saveCompany(null)}
                  className="rounded-md text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  Plus tard
                </button>
              </div>
              <h1 id="ob-step2" className="text-2xl font-semibold tracking-tight text-slate-900">
                Votre entreprise
              </h1>
              <p className="mt-1.5 text-sm text-slate-600">Affiché sur vos devis.</p>

              <form onSubmit={handleSubmit((v) => saveCompany(v), focusFirstError)} className="mt-6 flex flex-col gap-3" noValidate>
              <fieldset className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
                <legend className="sr-only">Entreprise</legend>
                <p aria-hidden="true" className="text-sm font-semibold text-slate-900 sm:col-span-2">Entreprise</p>
                  <Field label="Raison sociale" htmlFor="name" required className="sm:col-span-2" error={errors.name?.message}>
                    <Input id="name" autoFocus placeholder="Plomberie Martin" invalid={!!errors.name} {...register('name')} />
                  </Field>
                  <Field label="SIRET" htmlFor="siret" error={errors.siret?.message}>
                    <Input id="siret" inputMode="numeric" placeholder="123 456 789 00012" invalid={!!errors.siret} {...register('siret')} />
                  </Field>
                  <Field label="TVA par défaut" htmlFor="defaultVatRate" error={errors.defaultVatRate?.message}>
                    <Input id="defaultVatRate" type="number" step="0.01" min="0" max="1" placeholder="0.2" invalid={!!errors.defaultVatRate} {...register('defaultVatRate')} />
                  </Field>
                  <Field label="Adresse" htmlFor="address" className="sm:col-span-2" error={errors.address?.message}>
                    <Input id="address" autoComplete="street-address" placeholder="12 rue des Artisans, 69003 Lyon" invalid={!!errors.address} {...register('address')} />
                  </Field>
                  <Field label="Email" htmlFor="contactEmail" error={errors.contactEmail?.message}>
                    <Input id="contactEmail" type="email" autoComplete="email" placeholder="contact@entreprise.fr" invalid={!!errors.contactEmail} {...register('contactEmail')} />
                  </Field>
                  <Field label="Téléphone" htmlFor="contactPhone" error={errors.contactPhone?.message}>
                    <Input id="contactPhone" type="tel" autoComplete="tel" placeholder="06 12 34 56 78" invalid={!!errors.contactPhone} {...register('contactPhone')} />
                  </Field>
              </fieldset>

              <details className="group rounded-xl border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
                  <span>Mentions légales <span className="ml-1 font-normal text-slate-500">· facultatif</span></span>
                  <ChevronDown className="size-4 text-slate-500 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </summary>
                <div className="grid gap-4 border-t border-slate-200 px-5 pb-5 pt-4 sm:grid-cols-2">
                  <Field label="Forme juridique" htmlFor="legalForm">
                    <Input id="legalForm" placeholder="SARL, SASU, auto-entrepreneur…" {...register('legalForm')} />
                  </Field>
                  <Field label="Capital social" htmlFor="shareCapital">
                    <Input id="shareCapital" placeholder="5 000 €" {...register('shareCapital')} />
                  </Field>
                  <Field label="RCS / RM" htmlFor="rcsRm">
                    <Input id="rcsRm" placeholder="RCS Lyon 900 123 456" {...register('rcsRm')} />
                  </Field>
                  <Field label="Code APE / NAF" htmlFor="apeCode">
                    <Input id="apeCode" placeholder="4322A" {...register('apeCode')} />
                  </Field>
                  <Field label="N° TVA intracommunautaire" htmlFor="vatNumber" className="sm:col-span-2">
                    <Input id="vatNumber" placeholder="FR12900123456" {...register('vatNumber')} />
                  </Field>
                  <label className="flex items-center gap-2.5 text-sm text-slate-800 sm:col-span-2">
                    <input type="checkbox" className="size-4 rounded accent-brand-600" {...register('vatExempt')} />
                    Franchise en base de TVA (art. 293 B du CGI)
                  </label>
                </div>
              </details>

              <details className="group rounded-xl border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
                  <span>Assurance décennale <span className="ml-1 font-normal text-slate-500">· facultatif</span></span>
                  <ChevronDown className="size-4 text-slate-500 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </summary>
                <div className="grid gap-4 border-t border-slate-200 px-5 pb-5 pt-4 sm:grid-cols-2">
                  <Field label="Assureur" htmlFor="insuranceName">
                    <Input id="insuranceName" placeholder="AXA France" {...register('insuranceName')} />
                  </Field>
                  <Field label="N° de contrat" htmlFor="insuranceContract">
                    <Input id="insuranceContract" placeholder="123456789" {...register('insuranceContract')} />
                  </Field>
                  <Field label="Couverture géographique" htmlFor="insuranceCoverage" className="sm:col-span-2">
                    <Input id="insuranceCoverage" placeholder="France métropolitaine" {...register('insuranceCoverage')} />
                  </Field>
                </div>
              </details>

              <details className="group rounded-xl border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
                  <span>Médiation de la consommation <span className="ml-1 font-normal text-slate-500">· facultatif</span></span>
                  <ChevronDown className="size-4 text-slate-500 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </summary>
                <div className="grid gap-4 border-t border-slate-200 px-5 pb-5 pt-4 sm:grid-cols-2">
                  <Field label="Médiateur" htmlFor="mediatorName">
                    <Input id="mediatorName" placeholder="CM2C" {...register('mediatorName')} />
                  </Field>
                  <Field label="Site du médiateur" htmlFor="mediatorUrl" error={errors.mediatorUrl?.message}>
                    <Input id="mediatorUrl" type="url" placeholder="https://cm2c.net" invalid={!!errors.mediatorUrl} {...register('mediatorUrl')} />
                  </Field>
                </div>
              </details>

                <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center justify-between gap-4 sm:justify-start">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                    >
                      <ArrowLeft className="size-4" aria-hidden="true" />
                      Retour
                    </button>
                    <button
                      type="button"
                      onClick={() => saveCompany(null)}
                      className="rounded-md text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                    >
                      Plus tard
                    </button>
                  </div>
                  <Button type="submit" size="lg" loading={isSubmitting}>
                    Terminer
                  </Button>
                </div>
              </form>
            </section>
          )}

          {hasPreview && (
            <aside aria-label="Aperçu de vos tarifs" className="hidden lg:sticky lg:top-8 lg:block lg:self-start">
              <Prices choice={metier} />
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

// Indicateur d'étapes libellé.
function Stepper({ step }: { step: 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2 text-xs sm:gap-3" aria-label="Progression">
      {STEPS.map((label, i) => {
        const n = (i + 1) as 1 | 2;
        const state = step > n ? 'done' : step === n ? 'current' : 'todo';
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-3" aria-current={state === 'current' ? 'step' : undefined}>
            {i > 0 && <span aria-hidden="true" className="h-px w-4 bg-slate-300 sm:w-8" />}
            <span
              className={cn(
                'grid size-6 place-items-center rounded-full text-[11px] font-semibold',
                state === 'todo' ? 'border border-slate-300 text-slate-500' : 'bg-brand-600 text-white',
              )}
            >
              {state === 'done' ? <Check className="size-3.5" aria-hidden="true" /> : n}
            </span>
            <span
              className={cn(
                state === 'current' ? 'font-medium text-slate-900' : 'text-slate-500',
                state === 'current' ? 'inline' : 'hidden sm:inline',
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}


// Libellés courts pour l'affichage (les ids restent inchangés).
const SHORT_LABELS: Partial<Record<TradeId, string>> = {
  reno: 'Rénovation énergétique',
  plomberie: 'Plomberie',
  electricite: 'Électricité',
  menuiserie: 'Menuiserie',
  peinture: 'Peinture',
  serrurerie: 'Serrurerie',
};

const CHOICES: { id: Choice; label: string; Icon: typeof HelpCircle }[] = [
  ...TRADES.map((t) => ({ id: t.id as Choice, label: SHORT_LABELS[t.id] ?? t.label, Icon: t.icon })),
  { id: 'autre', label: 'Autre métier', Icon: HelpCircle },
];

// Groupe radio des métiers : flèches pour se déplacer, Entrée / double-clic pour valider.
function TradeChoices({
  value,
  onChange,
  onConfirm,
}: {
  value: Choice | null;
  onChange: (c: Choice) => void;
  onConfirm: () => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = CHOICES.findIndex((c) => c.id === value);
  const tabIndexOf = (i: number) => (current === -1 ? (i === 0 ? 0 : -1) : i === current ? 0 : -1);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (delta) {
      e.preventDefault();
      const next = (i + delta + CHOICES.length) % CHOICES.length;
      onChange(CHOICES[next].id);
      refs.current[next]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (value === CHOICES[i].id) onConfirm();
      else onChange(CHOICES[i].id);
    } else if (e.key === ' ') {
      e.preventDefault();
      onChange(CHOICES[i].id);
    }
  };

  return (
    <div role="radiogroup" aria-label="Votre métier" className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {CHOICES.map((c, i) => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={tabIndexOf(i)}
            onClick={() => onChange(c.id)}
            onDoubleClick={onConfirm}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'relative flex min-h-12 items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-left transition-[border-color,background-color] duration-150 motion-reduce:transition-none',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
              active ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 hover:border-slate-300',
            )}
          >
            <c.Icon className={cn('size-[18px] shrink-0', active ? 'text-brand-600' : 'text-slate-600')} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-sm font-medium leading-tight text-slate-900">{c.label}</span>
            {active && <Check className="size-4 shrink-0 text-brand-600" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

// Aperçu minimal : 3 prestations du métier choisi.
function Prices({ choice }: { choice: Choice | null }) {
  const trade = choice && choice !== 'autre' ? getTrade(choice) : undefined;
  if (!trade) return null;
  return (
    <div key={trade.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white motion-safe:animate-[fade-in-up_180ms_cubic-bezier(0.16,1,0.3,1)_both]">
      <p className="border-b border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-900">Vos tarifs</p>
      <ul className="divide-y divide-slate-100">
        {presetCatalog(trade.id).slice(0, 3).map((it) => (
          <li key={it.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0 truncate text-slate-800">{it.label}</span>
            <span className="shrink-0 tabular-nums text-slate-900">
              {formatCurrency(it.unitPrice)}
              <span className="ml-1 text-xs text-slate-500">/ {unitLabel(it.unit)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

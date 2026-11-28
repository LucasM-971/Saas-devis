import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Bell,
  Building2,
  Check,
  ClipboardList,
  Plus,
  Trash2,
  UserRound,
  Wand2,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, type Tab } from '@/components/Tabs';
import { TradePicker } from '@/components/TradePicker';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { useAuth } from '@/hooks/useAuth';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { mergeCatalog, presetCatalog } from '@/lib/catalog';
import { getTrade, type CatalogItem, type TradeId } from '@/lib/trades';
import { UNIT_OPTIONS, unitLabel } from '@/lib/units';
import {
  companySchema,
  profileSchema,
  type CompanyFormInput,
  type CompanyValues,
  type ProfileValues,
} from '@/lib/validation/settings';

const TABS: Tab[] = [
  { id: 'profil', label: 'Profil', icon: UserRound },
  { id: 'entreprise', label: 'Entreprise', icon: Building2 },
  { id: 'catalogue', label: 'Catalogue', icon: ClipboardList },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export default function Settings() {
  // Onglet piloté par ?tab=
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = TABS.some((t) => t.id === requested) ? (requested as string) : 'profil';
  const setTab = (id: string) => setParams(id === 'profil' ? {} : { tab: id }, { replace: true });
  const { activeMembership } = useAuth();
  // Remonte les sections liées à l'entreprise quand on change d'espace actif.
  const companyKey = activeMembership?.company.id ?? 'none';

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Réglages" />
      <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-6" />

      {tab === 'profil' && <ProfileSection />}
      {tab === 'entreprise' && <CompanySection key={companyKey} />}
      {tab === 'catalogue' && (
        <div className="flex flex-col gap-6">
          <CatalogSection key={companyKey} />
          <ZoneSection key={`z-${companyKey}`} />
        </div>
      )}
      {tab === 'notifications' && <NotificationsSection />}
    </div>
  );
}

// État de sauvegarde partagé par les formulaires (appel API réel + confirmation).
function useSave(action: () => Promise<void>) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setSaved(false);
    setError('');
    setSaving(true);
    try {
      await action();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return { saving, saved, error, save };
}

function SaveRow({ saved, saving, error }: { saved: boolean; saving: boolean; error: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" loading={saving}>
        Enregistrer
      </Button>
      {saved && (
        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
          <Check className="size-4" />
          Modifications enregistrées
        </span>
      )}
      {error && <span className="text-sm text-rose-600">{error}</span>}
    </div>
  );
}

function ProfileSection() {
  const { user, refreshSession } = useAuth();
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? '', email: user?.email ?? '' },
  });

  const { saving, saved, error, save } = useSave(async () => {
    // Le nom complet saisi est découpé en prénom + nom pour l'API.
    const [first, ...rest] = getValues('name').trim().split(/\s+/);
    await api.patch('/api/v1/auth/me', { first_name: first ?? '', last_name: rest.join(' ') });
    await refreshSession();
  });

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader title="Profil" subtitle="Vos informations personnelles." />
      <form onSubmit={handleSubmit(save)} className="flex flex-col gap-4" noValidate>
        <Field label="Nom complet" htmlFor="name" required error={errors.name?.message}>
          <Input id="name" invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field
          label="Email"
          htmlFor="email"
          required
          error={errors.email?.message}
          hint="L'email de connexion ne peut pas être modifié pour le moment."
        >
          <Input id="email" type="email" disabled invalid={!!errors.email} {...register('email')} />
        </Field>
        <SaveRow saved={saved} saving={saving} error={error} />
      </form>
    </Card>
  );
}

function CompanySection() {
  const { activeMembership, refreshSession } = useAuth();
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<CompanyFormInput, unknown, CompanyValues>({
    resolver: zodResolver(companySchema),
    // `values` (et non `defaultValues`) pour que le formulaire suive l'entreprise active.
    values: {
      name: activeMembership?.company.name ?? '',
      siret: activeMembership?.company.siret ?? '',
      address: activeMembership?.company.address ?? '',
      defaultVatRate: activeMembership?.company.defaultVatRate ?? 0.2,
      legalForm: activeMembership?.company.legalForm ?? '',
      shareCapital: activeMembership?.company.shareCapital ?? '',
      rcsRm: activeMembership?.company.rcsRm ?? '',
      apeCode: activeMembership?.company.apeCode ?? '',
      vatNumber: activeMembership?.company.vatNumber ?? '',
      vatExempt: activeMembership?.company.vatExempt ?? false,
      insuranceName: activeMembership?.company.insuranceName ?? '',
      insuranceContract: activeMembership?.company.insuranceContract ?? '',
      insuranceCoverage: activeMembership?.company.insuranceCoverage ?? '',
      mediatorName: activeMembership?.company.mediatorName ?? '',
      mediatorUrl: activeMembership?.company.mediatorUrl ?? '',
    },
  });

  const { saving, saved, error, save } = useSave(async () => {
    const v = getValues();
    await api.patch('/api/v1/companies/current', {
      name: v.name,
      siret: v.siret ?? '',
      address: v.address ?? '',
      defaultVatRate: Number(v.defaultVatRate),
      legalForm: v.legalForm ?? '',
      shareCapital: v.shareCapital ?? '',
      rcsRm: v.rcsRm ?? '',
      apeCode: v.apeCode ?? '',
      vatNumber: v.vatNumber ?? '',
      vatExempt: Boolean(v.vatExempt),
      insuranceName: v.insuranceName ?? '',
      insuranceContract: v.insuranceContract ?? '',
      insuranceCoverage: v.insuranceCoverage ?? '',
      mediatorName: v.mediatorName ?? '',
      mediatorUrl: v.mediatorUrl ?? '',
    });
    await refreshSession();
  });

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader title="Entreprise" subtitle="Informations affichées sur vos devis." />
      <form onSubmit={handleSubmit(save)} className="flex flex-col gap-4" noValidate>
        <Field label="Raison sociale" htmlFor="cname" required error={errors.name?.message}>
          <Input id="cname" invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field label="SIRET" htmlFor="siret" error={errors.siret?.message}>
          <Input id="siret" invalid={!!errors.siret} {...register('siret')} />
        </Field>
        <Field label="Adresse" htmlFor="address" error={errors.address?.message}>
          <Input id="address" {...register('address')} />
        </Field>
        <Field
          label="TVA par défaut"
          htmlFor="vat"
          error={errors.defaultVatRate?.message}
          hint="Ratio appliqué aux nouveaux devis (ex. 0.2 pour 20 %)."
        >
          <Input
            id="vat"
            type="number"
            step="0.01"
            invalid={!!errors.defaultVatRate}
            {...register('defaultVatRate')}
          />
        </Field>

        {/* ── Mentions légales (obligatoires sur les devis en France) ──────── */}
        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-900">Mentions légales</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Informations obligatoires sur un devis. Elles apparaissent automatiquement sur vos
            PDF (personnalisables dans « Personnaliser le devis »).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Forme juridique" htmlFor="legalForm" hint="Ex. SARL, SASU, auto-entrepreneur">
            <Input id="legalForm" placeholder="SASU" {...register('legalForm')} />
          </Field>
          <Field label="Capital social" htmlFor="shareCapital">
            <Input id="shareCapital" placeholder="5 000 €" {...register('shareCapital')} />
          </Field>
          <Field label="RCS / RM" htmlFor="rcsRm" hint="Immatriculation + ville">
            <Input id="rcsRm" placeholder="RCS Paris 900 123 456" {...register('rcsRm')} />
          </Field>
          <Field label="Code APE / NAF" htmlFor="apeCode">
            <Input id="apeCode" placeholder="4334Z" {...register('apeCode')} />
          </Field>
          <Field label="N° TVA intracommunautaire" htmlFor="vatNumber" className="sm:col-span-2">
            <Input id="vatNumber" placeholder="FR12900123456" {...register('vatNumber')} />
          </Field>
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
          <input type="checkbox" className="size-4 rounded accent-brand-600" {...register('vatExempt')} />
          <span className="text-sm text-slate-700">
            Franchise en base de TVA (auto-entrepreneur) — mention « TVA non applicable, art. 293 B
            du CGI »
          </span>
        </label>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-900">Assurance décennale</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Obligatoire pour les métiers du bâtiment (loi n° 2014-344).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assureur" htmlFor="insuranceName">
            <Input id="insuranceName" placeholder="AXA France" {...register('insuranceName')} />
          </Field>
          <Field label="N° de contrat" htmlFor="insuranceContract">
            <Input id="insuranceContract" placeholder="N° 123456789" {...register('insuranceContract')} />
          </Field>
          <Field label="Couverture géographique" htmlFor="insuranceCoverage" className="sm:col-span-2">
            <Input id="insuranceCoverage" placeholder="France métropolitaine" {...register('insuranceCoverage')} />
          </Field>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-900">Médiation de la consommation</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Obligatoire pour les devis aux particuliers (art. L612-1 du code de la consommation).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Médiateur" htmlFor="mediatorName">
            <Input id="mediatorName" placeholder="CM2C" {...register('mediatorName')} />
          </Field>
          <Field label="Site du médiateur" htmlFor="mediatorUrl" error={errors.mediatorUrl?.message}>
            <Input id="mediatorUrl" placeholder="https://cm2c.net" invalid={!!errors.mediatorUrl} {...register('mediatorUrl')} />
          </Field>
        </div>

        <SaveRow saved={saved} saving={saving} error={error} />
      </form>
    </Card>
  );
}

// Choix du métier + grille tarifaire (persistés via l'API : company.metier + price_items).
function CatalogSection() {
  const { activeMembership, refreshSession } = useAuth();
  const company = activeMembership?.company;
  // Repli sur `metier` pour les sessions enregistrées avant le multi-métiers.
  const companyMetiers = company?.metiers ?? (company?.metier ? [company.metier] : []);

  const { data: apiItems, loading, error: loadError } = useApi<CatalogItem[]>('/api/v1/pricing/items');
  const [metiers, setMetiers] = useState<TradeId[]>(companyMetiers);
  const [draftMetiers, setDraftMetiers] = useState<TradeId[]>(companyMetiers);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editingMetier, setEditingMetier] = useState(false);

  // Initialise la grille depuis l'API (une fois chargée).
  useEffect(() => {
    if (apiItems) setItems(apiItems);
  }, [apiItems]);

  const touch = () => {
    setSaved(false);
    setSaveError('');
    setDirty(true);
  };

  // Valide les métiers cochés et ajoute les prix courants des métiers nouvellement choisis.
  const applyMetiers = () => {
    const added = draftMetiers.filter((id) => !metiers.includes(id));
    setMetiers(draftMetiers);
    setItems((prev) => added.reduce((acc, id) => mergeCatalog(acc, presetCatalog(id)), prev));
    setEditingMetier(false);
    touch();
  };

  const loadPreset = () => {
    setItems((prev) => metiers.reduce((acc, id) => mergeCatalog(acc, presetCatalog(id)), prev));
    touch();
  };

  const updateItem = (id: string, patch: Partial<CatalogItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    touch();
  };
  const addItem = () => {
    setItems((prev) => [...prev, { id: uid(), label: '', unit: 'unit', unitPrice: 0 }]);
    touch();
  };
  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    touch();
  };

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const body = items
        .filter((it) => it.label.trim())
        .map(({ label, unit, unitPrice }) => ({ label, unit, unitPrice }));
      const savedItems = await api.put<CatalogItem[]>('/api/v1/pricing/items', body);
      setItems(savedItems);
      setDirty(false);
      if (metiers.join() !== companyMetiers.join()) {
        await api.patch('/api/v1/companies/current', { metiers });
        await refreshSession();
      }
      setSaved(true);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-400">Chargement du catalogue…</p>;
  }
  if (loadError) {
    return (
      <p className="py-10 text-center text-sm text-rose-600">
        Impossible de charger le catalogue : {loadError}
      </p>
    );
  }

  if (metiers.length === 0 || editingMetier) {
    return (
      <Card padded={false}>
        <div className="px-5 pt-5 pb-4">
          <h2 className="text-base font-semibold text-slate-900">Vos métiers</h2>
        </div>
        <div className="px-5 pb-5">
          <TradePicker value={draftMetiers} onChange={setDraftMetiers} />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          {metiers.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraftMetiers(metiers);
                setEditingMetier(false);
              }}
            >
              Annuler
            </Button>
          )}
          <Button size="sm" disabled={draftMetiers.length === 0} onClick={applyMetiers}>
            Valider{draftMetiers.length > 1 ? ` (${draftMetiers.length})` : ''}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Vos prix</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraftMetiers(metiers);
            setEditingMetier(true);
          }}
          className="flex max-w-full flex-wrap items-center justify-end gap-1.5 rounded-lg p-1 text-sm hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          {metiers.map((id) => (
            <span key={id} className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">
              {getTrade(id)?.label}
            </span>
          ))}
          <span className="px-1 text-brand-600 underline underline-offset-2">modifier</span>
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border-t border-slate-100 px-5 py-10 text-center">
          <p className="text-sm text-slate-600">Votre liste est vide.</p>
          <Button size="sm" variant="secondary" onClick={loadPreset}>
            <Wand2 className="size-4" aria-hidden="true" />
            Remplir avec les prix courants
          </Button>
        </div>
      ) : (
        <div role="table" aria-label="Vos prix" className="px-5">
          <div
            role="row"
            className="hidden grid-cols-[minmax(0,1fr)_6.5rem_8rem_2.5rem] gap-2 border-b border-slate-100 pb-2 text-xs font-medium text-slate-500 sm:grid"
          >
            <span role="columnheader">Prestation</span>
            <span role="columnheader">Unité</span>
            <span role="columnheader" className="text-right pr-7">Prix HT</span>
            <span role="columnheader" className="sr-only">Supprimer</span>
          </div>
          {items.map((it) => (
            <div
              key={it.id}
              role="row"
              className="grid grid-cols-[minmax(0,1fr)_6.5rem_2.5rem] gap-2 border-b border-slate-100 py-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_8rem_2.5rem]"
            >
              <div role="cell" className="col-span-3 sm:col-span-1">
                <Input
                  value={it.label}
                  onChange={(e) => updateItem(it.id, { label: e.target.value })}
                  placeholder="Ex. Pose de robinetterie"
                  aria-label="Prestation"
                />
              </div>
              <div role="cell">
                <Select
                  value={it.unit}
                  onChange={(e) => updateItem(it.id, { unit: e.target.value })}
                  aria-label="Unité"
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>
                      {unitLabel(u)}
                    </option>
                  ))}
                </Select>
              </div>
              <div role="cell" className="relative">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={it.unitPrice || ''}
                  onChange={(e) => updateItem(it.id, { unitPrice: Number(e.target.value) || 0 })}
                  placeholder="0"
                  aria-label="Prix HT en euros"
                  className="pr-7 text-right tabular-nums"
                />
                <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">€</span>
              </div>
              <div role="cell">
                <button
                  type="button"
                  aria-label={`Supprimer ${it.label || 'la prestation'}`}
                  title="Supprimer"
                  onClick={() => removeItem(it.id)}
                  className="grid size-10 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
          <div className="py-2">
            <Button size="sm" variant="ghost" onClick={addItem}>
              <Plus className="size-4" aria-hidden="true" />
              Ajouter une ligne
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-5 py-4">
        <Button onClick={save} loading={saving} disabled={!dirty && !saving}>
          Enregistrer
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700" role="status">
            <Check className="size-4" aria-hidden="true" />
            Enregistré
          </span>
        )}
        {saveError && <span className="text-sm text-rose-600" role="alert">{saveError}</span>}
      </div>
    </Card>
  );
}

type Zone = { id: string; postalCode: string; label: string };

// Zone d'intervention : les codes postaux desservis (filtre d'éligibilité du chat).
function ZoneSection() {
  const { data: apiZones, loading, error } = useApi<Zone[]>('/api/v1/zones');
  const [codes, setCodes] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (apiZones) setCodes(apiZones.map((z) => z.postalCode));
  }, [apiZones]);

  const persist = async (next: string[]) => {
    const prev = codes;
    setCodes(next);
    setSaved(false);
    setSaveError('');
    setSaving(true);
    try {
      await api.put('/api/v1/zones', next.map((postalCode) => ({ postalCode })));
      setSaved(true);
    } catch (e) {
      setCodes(prev);
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const addCode = () => {
    const code = draft.trim();
    if (!/^\d{5}$/.test(code)) {
      setSaveError('Un code postal fait 5 chiffres.');
      return;
    }
    setDraft('');
    if (!codes.includes(code)) persist([...codes, code].sort());
  };

  const removeCode = (code: string) => persist(codes.filter((c) => c !== code));

  if (loading || error) return null; // la grille au-dessus affiche déjà l'état d'erreur

  return (
    <Card>
      <CardHeader
        title="Zone d’intervention"
      />

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addCode();
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Code postal"
          aria-label="Code postal à ajouter"
          inputMode="numeric"
          maxLength={5}
          className="max-w-[140px]"
        />
        <Button type="submit" size="sm" variant="secondary">
          <Plus className="size-4" aria-hidden="true" /> Ajouter
        </Button>
        <span className="text-sm" role="status">
          {saving && <span className="text-slate-500">Enregistrement…</span>}
          {saved && !saving && (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <Check className="size-4" aria-hidden="true" /> Enregistré
            </span>
          )}
        </span>
      </form>
      {saveError && <p className="mt-2 text-sm text-rose-600" role="alert">{saveError}</p>}

      {codes.length === 0 ? (
        <p className="mt-4 text-sm text-amber-700">Aucun code postal.</p>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Codes postaux couverts">
          {codes.map((code) => (
            <li
              key={code}
              className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 py-0.5 pl-2 pr-0.5 text-sm tabular-nums text-slate-700"
            >
              {code}
              <button
                type="button"
                aria-label={`Retirer ${code}`}
                onClick={() => removeCode(code)}
                className="grid size-6 place-items-center rounded text-slate-400 hover:bg-slate-200 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}


const NOTIFICATIONS = [
  { id: 'new_lead', label: 'Nouveau prospect', desc: 'Un prospect remplit votre widget.' },
  { id: 'quote_accepted', label: 'Devis accepté', desc: 'Un client accepte un devis envoyé.' },
  { id: 'quote_refused', label: 'Devis refusé', desc: 'Un client refuse un devis envoyé.' },
  { id: 'weekly', label: 'Récapitulatif hebdomadaire', desc: 'Un résumé de votre activité chaque lundi.' },
];

function NotificationsSection() {
  // Préférences persistées sur le profil (GET /me → PATCH /me).
  const { data: me, loading } = useApi<{ notification_prefs: Record<string, boolean> }>(
    '/api/v1/auth/me',
  );
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (me) setEnabled(me.notification_prefs);
  }, [me]);

  const toggle = async (id: string, value: boolean) => {
    const next = { ...enabled, [id]: value };
    setEnabled(next);
    setSaveState('saving');
    try {
      await api.patch('/api/v1/auth/me', { notification_prefs: next });
      setSaveState('saved');
    } catch {
      setSaveState('error');
      setEnabled(enabled); // revient à l'état précédent
    }
  };

  if (loading) return <p className="py-10 text-center text-sm text-slate-400">Chargement…</p>;

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader
        title="Notifications par email"
        subtitle="Choisissez ce que vous recevez. Vos préférences sont enregistrées automatiquement."
      />
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {NOTIFICATIONS.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-medium text-slate-800">{item.label}</p>
              <p className="text-xs text-slate-400">{item.desc}</p>
            </div>
            <Toggle
              checked={enabled[item.id] ?? false}
              onChange={(v) => toggle(item.id, v)}
              label={item.label}
            />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs">
        {saveState === 'saved' && <span className="text-emerald-600">Préférences enregistrées ✓</span>}
        {saveState === 'error' && (
          <span className="text-rose-600">Échec de l'enregistrement, réessayez.</span>
        )}
      </p>
    </Card>
  );
}

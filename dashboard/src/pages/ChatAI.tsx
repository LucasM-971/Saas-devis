import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  Bot,
  Bug,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  GripVertical,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Ruler,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, type Tab } from '@/components/Tabs';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/SearchInput';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { ChatThread } from '@/components/chat/ChatThread';
import { accentStyle } from '@/components/chat/accent';
import { starterSuggestions, uid, useChatConversation } from '@/lib/chat-engine';
import { DEFAULT_QAS, defaultBlocsFor } from '@/lib/chat-defaults';
import { getTrade, type Trade } from '@/lib/trades';
import { blocLabel, type MatchSource, type MessageBloc, type QA, type TarifM2 } from '@/lib/chat-match';

// ─── Constantes ──────────────────────────────────────────────────────────────

const PAGE_TABS: Tab[] = [
  { id: 'knowledge', label: 'Base de connaissances', icon: BookOpen },
  { id: 'preview', label: 'Tester le chat', icon: MessageSquare },
  { id: 'share', label: 'Partager & intégrer', icon: Share2 },
];

// Réponse de GET/PUT /api/v1/widget/settings.
type WidgetSettings = {
  primary_color: string;
  greeting_message: string | null;
  avatar_url: string | null;
  qas: { question: string; answer: string }[];
  blocs: { trigger: string; label?: string | null; text: string; buttons: string[] }[];
  prix_m2: string | null;
  tarifs_m2?: { categorie: string; zone: string; prix: string }[];
};

// Sérialise la base de connaissances pour l'API (mêmes champs que WidgetSettingsIn).
function toSettingsBody(qas: QA[], blocs: MessageBloc[], prixM2: string, tarifs: TarifM2[], primaryColor: string) {
  return {
    primary_color: primaryColor,
    qas: qas.map(({ question, answer }) => ({ question, answer })),
    blocs: blocs.map(({ trigger, label, text, buttons }) => ({ trigger, label, text, buttons })),
    prix_m2: prixM2 || null,
    tarifs_m2: tarifs
      .filter((t) => t.categorie.trim() && t.prix.trim())
      .map(({ categorie, zone, prix }) => ({ categorie: categorie.trim(), zone: zone.trim(), prix: prix.trim() })),
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChatAI() {
  const { activeMembership } = useAuth();
  // Onglet piloté par l'URL (?tab=) : liens profonds depuis la checklist de démarrage.
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = PAGE_TABS.some((t) => t.id === requested) ? (requested as string) : 'knowledge';
  const setTab = (id: string) =>
    setParams(id === 'knowledge' ? {} : { tab: id }, { replace: true });

  // Base de connaissances chargée depuis l'API (persistée dans widget_settings).
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [qas, setQas] = useState<QA[]>([]);
  const [blocs, setBlocs] = useState<MessageBloc[]>([]);
  const [prixM2, setPrixM2] = useState('');
  const [tarifs, setTarifs] = useState<TarifM2[]>([]);
  const [primaryColor, setPrimaryColor] = useState('#EA580C');
  const [dirty, setDirty] = useState(false);

  const companyId = activeMembership?.company.id;
  const trade = getTrade(activeMembership?.company.metier);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    api
      .get<WidgetSettings>('/api/v1/widget/settings')
      .then((s) => {
        if (cancelled) return;
        setQas(s.qas.map((q) => ({ id: uid(), ...q })));
        setBlocs(s.blocs.map((b) => ({ id: uid(), trigger: b.trigger, label: b.label ?? undefined, text: b.text, buttons: b.buttons })));
        setPrixM2(s.prix_m2 ?? '');
        setTarifs((s.tarifs_m2 ?? []).map((t) => ({ id: uid(), ...t })));
        setPrimaryColor(s.primary_color || '#EA580C');
        setDirty(false);
        setLoadState('ready');
      })
      .catch(() => !cancelled && setLoadState('error'));
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  // Toute édition marque la base « à publier ».
  const markDirty = <T,>(setter: React.Dispatch<React.SetStateAction<T>>): React.Dispatch<React.SetStateAction<T>> =>
    ((action) => {
      setDirty(true);
      setter(action);
    }) as React.Dispatch<React.SetStateAction<T>>;

  const save = async () => {
    await api.put('/api/v1/widget/settings', toSettingsBody(qas, blocs, prixM2, tarifs, primaryColor));
    setDirty(false);
  };

  const companyName = activeMembership?.company.name ?? 'votre entreprise';
  const publicId = activeMembership?.company.publicId;

  return (
    <>
      <PageHeader
        title="Chat AI"
        subtitle="Configurez les réponses de votre assistant, puis testez-le et partagez-le."
      />
      <Tabs tabs={PAGE_TABS} active={tab} onChange={setTab} className="mb-6" />
      {loadState === 'loading' && (
        <p className="py-12 text-center text-sm text-slate-400">Chargement de votre assistant…</p>
      )}
      {loadState === 'error' && (
        <p className="py-12 text-center text-sm text-rose-600">
          Impossible de charger la configuration de l'assistant. Vérifiez que l'API est démarrée puis rechargez la page.
        </p>
      )}
      {loadState === 'ready' && tab === 'knowledge' && (
        <KnowledgeTab
          qas={qas} setQas={markDirty(setQas)}
          blocs={blocs} setBlocs={markDirty(setBlocs)}
          prixM2={prixM2} setPrixM2={markDirty(setPrixM2)}
          tarifs={tarifs} setTarifs={markDirty(setTarifs)}
          dirty={dirty} onSave={save} trade={trade}
        />
      )}
      {loadState === 'ready' && tab === 'preview' && (
        <PreviewTab qas={qas} blocs={blocs} companyName={companyName} prixM2={prixM2} tarifs={tarifs} />
      )}
      {loadState === 'ready' && tab === 'share' && (
        <ShareTab qas={qas} blocs={blocs} prixM2={prixM2} tarifs={tarifs} primaryColor={primaryColor} publicId={publicId} onSaved={() => setDirty(false)} />
      )}
    </>
  );
}

// ─── Onglet Base de connaissances ─────────────────────────────────────────────

function KnowledgeTab({
  qas, setQas, blocs, setBlocs, prixM2, setPrixM2, tarifs, setTarifs, dirty, onSave, trade,
}: {
  qas: QA[];
  setQas: React.Dispatch<React.SetStateAction<QA[]>>;
  blocs: MessageBloc[];
  setBlocs: React.Dispatch<React.SetStateAction<MessageBloc[]>>;
  prixM2: string;
  setPrixM2: React.Dispatch<React.SetStateAction<string>>;
  tarifs: TarifM2[];
  setTarifs: React.Dispatch<React.SetStateAction<TarifM2[]>>;
  dirty: boolean;
  onSave: () => Promise<void>;
  trade?: Trade;
}) {
  const isEmpty = qas.length === 0 && blocs.length === 0 && !prixM2 && tarifs.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">

      {isEmpty && (
        <Card className="border-dashed">
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-sm text-slate-500">
              Votre base de connaissances est vide. Démarrez avec le modèle proposé, puis adaptez-le à votre activité.
            </p>
            <Button
              size="sm"
              onClick={() => {
                setQas(DEFAULT_QAS.map((q) => ({ ...q, id: uid() })));
                setBlocs(defaultBlocsFor(trade).map((b) => ({ ...b, id: uid() })));
              }}
            >
              <Sparkles className="size-4" /> Charger le modèle de départ
            </Button>
          </div>
        </Card>
      )}

      <KnowledgeToolbar qas={qas} setQas={setQas} blocs={blocs} setBlocs={setBlocs} prixM2={prixM2} setPrixM2={setPrixM2} tarifs={tarifs} setTarifs={setTarifs} dirty={dirty} onSave={onSave} trade={trade} />
      {/* Tarif au m² : seulement pour les métiers chiffrés au m² (ou si déjà renseigné). */}
      {(!trade || trade.m2Categories || prixM2 || tarifs.length > 0) && (
        <MesureSection prixM2={prixM2} setPrixM2={setPrixM2} tarifs={tarifs} setTarifs={setTarifs} categories={trade?.m2Categories ?? CATEGORIES_SUGGEREES} />
      )}
      <QASection qas={qas} setQas={setQas} />
      <BlocsSection blocs={blocs} setBlocs={setBlocs} />
    </div>
  );
}

// ── Barre d'actions : export / import / réinitialisation de la base ───────────

type KnowledgeBackup = { version: number; prixM2: string; tarifs?: TarifM2[]; qas: QA[]; blocs: MessageBloc[] };

function KnowledgeToolbar({
  qas, setQas, blocs, setBlocs, prixM2, setPrixM2, tarifs, setTarifs, dirty, onSave, trade,
}: {
  qas: QA[];
  setQas: React.Dispatch<React.SetStateAction<QA[]>>;
  blocs: MessageBloc[];
  setBlocs: React.Dispatch<React.SetStateAction<MessageBloc[]>>;
  prixM2: string;
  setPrixM2: React.Dispatch<React.SetStateAction<string>>;
  tarifs: TarifM2[];
  setTarifs: React.Dispatch<React.SetStateAction<TarifM2[]>>;
  dirty: boolean;
  onSave: () => Promise<void>;
  trade?: Trade;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const flash = (tone: 'ok' | 'error', text: string) => {
    setNotice({ tone, text });
    setTimeout(() => setNotice(null), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
      flash('ok', 'Base publiée : le widget et le lien de chat sont à jour.');
    } catch {
      flash('error', "Échec de l'enregistrement. Vérifiez votre connexion puis réessayez.");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const backup: KnowledgeBackup = { version: 1, prixM2, tarifs, qas, blocs };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'base-connaissances-chat.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de réimporter le même fichier
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as Partial<KnowledgeBackup>;
      if (!Array.isArray(data.qas) || !Array.isArray(data.blocs)) {
        throw new Error('format');
      }
      // Réattribue des ids pour éviter les collisions avec l'existant.
      setQas(data.qas.map((q) => ({ id: uid(), question: String(q.question ?? ''), answer: String(q.answer ?? '') })));
      setBlocs(data.blocs.map((b) => ({ id: uid(), trigger: String(b.trigger ?? ''), label: b.label != null ? String(b.label) : undefined, text: String(b.text ?? ''), buttons: Array.isArray(b.buttons) ? b.buttons.map(String) : [] })));
      setPrixM2(typeof data.prixM2 === 'string' ? data.prixM2 : '');
      setTarifs(Array.isArray(data.tarifs) ? data.tarifs.map((t) => ({ id: uid(), categorie: String(t.categorie ?? ''), zone: String(t.zone ?? ''), prix: String(t.prix ?? '') })) : []);
      flash('ok', 'Base de connaissances importée.');
    } catch {
      flash('error', 'Fichier invalide : importez un export JSON de cette page.');
    }
  };

  const handleReset = () => {
    if (!window.confirm('Réinitialiser la base de connaissances aux valeurs par défaut ? Vos Q&R et messages personnalisés seront remplacés.')) return;
    setQas(DEFAULT_QAS);
    setBlocs(defaultBlocsFor(trade));
    setPrixM2('');
    setTarifs([]);
    flash('ok', 'Base réinitialisée aux valeurs par défaut.');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={handleSave} loading={saving} disabled={!dirty && !saving}>
        <Check className="size-4" /> {dirty ? 'Enregistrer et publier' : 'Publié'}
      </Button>
      <Button size="sm" variant="secondary" onClick={handleExport}>
        <Download className="size-4" /> Exporter
      </Button>
      <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
        <Upload className="size-4" /> Importer
      </Button>
      <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />
      <Button size="sm" variant="ghost" onClick={handleReset} className="text-slate-500 hover:text-red-600">
        <RotateCcw className="size-4" /> Réinitialiser
      </Button>
      {notice && (
        <span className={`text-xs font-medium ${notice.tone === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
          {notice.text}
        </span>
      )}
    </div>
  );
}

// ── Section Mesure ───────────────────────────────────────────────────────────

const CATEGORIES_SUGGEREES = ['Sol', 'Mur', 'Plafond', 'Toiture', 'Façade', 'Isolation'];

function MesureSection({
  prixM2, setPrixM2, tarifs, setTarifs, categories,
}: {
  categories: string[];
  prixM2: string;
  setPrixM2: React.Dispatch<React.SetStateAction<string>>;
  tarifs: TarifM2[];
  setTarifs: React.Dispatch<React.SetStateAction<TarifM2[]>>;
}) {
  const updateTarif = (id: string, patch: Partial<TarifM2>) =>
    setTarifs((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const addTarif = () =>
    setTarifs((list) => [...list, { id: uid(), categorie: '', zone: '', prix: '' }]);
  const removeTarif = (id: string) => setTarifs((list) => list.filter((t) => t.id !== id));

  const [draft, setDraft] = useState(prixM2);
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setPrixM2(draft.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Card padded={false}>
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <Ruler className="size-4 text-slate-400" />
        <div>
          <h2 className="text-base font-medium text-slate-900">Tarifs au m²</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            L'assistant s'en sert pour répondre aux questions de prix au m².
          </p>
        </div>
      </div>
      <form onSubmit={handleSave} className="px-5 py-4">
        <Field label="Tarif de base au m²" htmlFor="prix-m2" hint="Facultatif : utilisé quand aucune catégorie ne correspond.">
          <div className="flex items-center gap-3">
            <Input
              id="prix-m2"
              type="number"
              min="0"
              step="0.01"
              placeholder="Ex. 45"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setSaved(false); }}
              className="max-w-36 font-mono tabular-nums"
            />
            <span className="shrink-0 whitespace-nowrap text-sm text-slate-500">€ / m²</span>
            <Button type="submit" size="sm" variant={saved ? 'secondary' : 'primary'}>
              {saved ? 'Enregistré' : 'Enregistrer'}
            </Button>
          </div>
        </Field>
        {prixM2 && !saved && (
          <p className="mt-3 text-sm text-slate-500">
            Tarif actuel <span className="font-mono tabular-nums text-slate-900">{prixM2} €/m²</span>
          </p>
        )}
      </form>
      <div className="border-t border-slate-100 px-5 py-4">
        <div className="mb-3">
          <h3 className="text-sm font-medium text-slate-900">Tarifs par catégorie</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Le prix au m² varie selon la surface traitée (sol, mur…) et la zone géographique.
          </p>
        </div>
        <datalist id="categories-m2">
          {categories.map((c) => <option key={c} value={c} />)}
        </datalist>
        {tarifs.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="hidden grid-cols-[1fr_1fr_8rem_2rem] gap-2 text-xs font-medium text-slate-500 sm:grid">
              <span>Catégorie</span><span>Zone géographique</span><span>€ / m²</span><span />
            </div>
            {tarifs.map((t) => (
              <div key={t.id} className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[1fr_1fr_8rem_2rem]">
                <Input
                  aria-label="Catégorie"
                  list="categories-m2"
                  placeholder="Ex. Sol"
                  maxLength={80}
                  value={t.categorie}
                  onChange={(e) => updateTarif(t.id, { categorie: e.target.value })}
                />
                <Input
                  aria-label="Zone géographique"
                  placeholder="Toutes zones"
                  maxLength={80}
                  value={t.zone}
                  onChange={(e) => updateTarif(t.id, { zone: e.target.value })}
                />
                <Input
                  aria-label="Prix au m²"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex. 45"
                  value={t.prix}
                  onChange={(e) => updateTarif(t.id, { prix: e.target.value })}
                  className="font-mono tabular-nums"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Supprimer ce tarif"
                  onClick={() => removeTarif(t.id)}
                  className="text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <Button type="button" size="sm" variant="secondary" onClick={addTarif} className="mt-3">
          <Plus className="size-4" /> Ajouter un tarif
        </Button>
      </div>
    </Card>
  );
}

// ── Section Q&R ──────────────────────────────────────────────────────────────

type QAModalState = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; qa: QA };

function QASection({
  qas, setQas,
}: {
  qas: QA[];
  setQas: React.Dispatch<React.SetStateAction<QA[]>>;
}) {
  const [modal, setModal] = useState<QAModalState>({ mode: 'closed' });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const toggleExpanded = (id: string) =>
    setExpanded((p) => {
      const s = new Set(p);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const save = (question: string, answer: string) => {
    if (modal.mode === 'add') setQas((p) => [...p, { id: uid(), question, answer }]);
    else if (modal.mode === 'edit') setQas((p) => p.map((q) => q.id === modal.qa.id ? { ...q, question, answer } : q));
    setModal({ mode: 'closed' });
  };

  const remove = (id: string) => {
    setQas((p) => p.filter((q) => q.id !== id));
    setExpanded((p) => { const s = new Set(p); s.delete(id); return s; });
  };

  // Insère une copie juste après l'entrée d'origine.
  const duplicate = (id: string) =>
    setQas((p) => {
      const idx = p.findIndex((q) => q.id === id);
      if (idx < 0) return p;
      const copy = { ...p[idx], id: uid(), question: `${p[idx].question} (copie)` };
      return [...p.slice(0, idx + 1), copy, ...p.slice(idx + 1)];
    });

  const move = (id: string, dir: -1 | 1) =>
    setQas((p) => {
      const idx = p.findIndex((q) => q.id === id);
      const next = [...p];
      const t = idx + dir;
      if (t < 0 || t >= next.length) return p;
      [next[idx], next[t]] = [next[t], next[idx]];
      return next;
    });

  const q = query.trim().toLowerCase();
  const filtered = q
    ? qas.filter((qa) => qa.question.toLowerCase().includes(q) || qa.answer.toLowerCase().includes(q))
    : qas;
  const searching = q.length > 0;

  return (
    <>
      <Card padded={false}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-medium text-slate-900">Questions-réponses</h2>
            <p className="mt-0.5 text-sm text-slate-500">{qas.length} entrée{qas.length !== 1 ? 's' : ''}</p>
          </div>
          <Button size="sm" onClick={() => setModal({ mode: 'add' })}>
            <Plus className="size-4" /> Ajouter
          </Button>
        </div>

        {qas.length > 3 && (
          <div className="border-b border-slate-100 px-4 py-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Rechercher une question…" />
          </div>
        )}

        {qas.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
            <MessageSquarePlus className="size-8" />
            <p className="text-sm">Aucune question configurée.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
            <p className="text-sm">Aucune question ne correspond à « {query} ».</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((qa, idx) => {
              const open = expanded.has(qa.id);
              return (
                <li key={qa.id} className="group flex items-start gap-2 px-4 py-3.5">
                  {!searching && (
                    <div className="mt-1 hidden shrink-0 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
                      <button onClick={() => move(qa.id, -1)} disabled={idx === 0} className="text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="size-3.5" /></button>
                      <button onClick={() => move(qa.id, 1)} disabled={idx === filtered.length - 1} className="text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="size-3.5" /></button>
                    </div>
                  )}
                  <GripVertical className="mt-1 hidden size-4 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
                  <div className="flex-1 min-w-0">
                    <button onClick={() => toggleExpanded(qa.id)} className="flex w-full items-center justify-between gap-2 text-left">
                      <span className="text-sm font-medium text-slate-800 truncate">{qa.question}</span>
                      <ChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && <p className="mt-2 text-sm text-slate-500 leading-relaxed whitespace-pre-wrap">{qa.answer}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <button onClick={() => duplicate(qa.id)} className="p-1.5 rounded text-slate-400 hover:text-brand-600 hover:bg-brand-50" aria-label="Dupliquer"><Copy className="size-3.5" /></button>
                    <button onClick={() => setModal({ mode: 'edit', qa })} className="p-1.5 rounded text-slate-400 hover:text-brand-600 hover:bg-brand-50" aria-label="Modifier"><Pencil className="size-3.5" /></button>
                    <button onClick={() => remove(qa.id)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label="Supprimer"><Trash2 className="size-3.5" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {modal.mode !== 'closed' && (
        <QAModal
          initial={modal.mode === 'edit' ? modal.qa : undefined}
          onSave={save}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}
    </>
  );
}

// ── Section Messages avec boutons ─────────────────────────────────────────────

type BlocModalState = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; bloc: MessageBloc };

function BlocsSection({
  blocs, setBlocs,
}: {
  blocs: MessageBloc[];
  setBlocs: React.Dispatch<React.SetStateAction<MessageBloc[]>>;
}) {
  const [modal, setModal] = useState<BlocModalState>({ mode: 'closed' });

  const save = (trigger: string, text: string, buttons: string[], label: string) => {
    const labelValue = label.trim() || undefined;
    if (modal.mode === 'add') setBlocs((p) => [...p, { id: uid(), trigger, label: labelValue, text, buttons }]);
    else if (modal.mode === 'edit') setBlocs((p) => p.map((b) => b.id === modal.bloc.id ? { ...b, trigger, label: labelValue, text, buttons } : b));
    setModal({ mode: 'closed' });
  };

  const remove = (id: string) => setBlocs((p) => p.filter((b) => b.id !== id));

  const duplicate = (id: string) =>
    setBlocs((p) => {
      const idx = p.findIndex((b) => b.id === id);
      if (idx < 0) return p;
      const copy = { ...p[idx], id: uid(), buttons: [...p[idx].buttons] };
      return [...p.slice(0, idx + 1), copy, ...p.slice(idx + 1)];
    });

  const move = (id: string, dir: -1 | 1) =>
    setBlocs((p) => {
      const idx = p.findIndex((b) => b.id === id);
      const next = [...p];
      const t = idx + dir;
      if (t < 0 || t >= next.length) return p;
      [next[idx], next[t]] = [next[t], next[idx]];
      return next;
    });

  return (
    <>
      <Card padded={false}>
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-medium text-slate-900">Messages avec boutons</h2>
              <span className="text-xs text-slate-500">Prioritaire</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Déclenchés en priorité quand un client dit quelque chose d'approchant. Idéal pour guider vers un choix
            </p>
          </div>
          <Button size="sm" onClick={() => setModal({ mode: 'add' })}>
            <Plus className="size-4" /> Ajouter
          </Button>
        </div>

        {blocs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
            <Zap className="size-6" />
            <p className="text-sm">Aucun message configuré</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {blocs.map((bloc, idx) => (
              <li key={bloc.id} className="group flex items-start gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex min-w-0 items-center gap-2 text-xs text-slate-500">
                    <Zap className="size-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">« {bloc.trigger} »</span>
                    <span className="shrink-0 text-slate-300">·</span>
                    <span className="truncate font-medium text-slate-700">{blocLabel(bloc)}</span>
                  </div>
                  <p className="mb-3 text-sm leading-relaxed text-slate-800">{bloc.text}</p>
                  {bloc.buttons.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {bloc.buttons.map((btn) => (
                        <span key={btn} className="rounded-lg border border-brand-200 px-3 py-1 text-xs font-medium text-brand-700">
                          {btn}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                  <button onClick={() => move(bloc.id, -1)} disabled={idx === 0} className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" aria-label="Monter"><ChevronUp className="size-3.5" /></button>
                  <button onClick={() => move(bloc.id, 1)} disabled={idx === blocs.length - 1} className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" aria-label="Descendre"><ChevronDown className="size-3.5" /></button>
                  <button onClick={() => duplicate(bloc.id)} className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Dupliquer"><Copy className="size-3.5" /></button>
                  <button onClick={() => setModal({ mode: 'edit', bloc })} className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Modifier"><Pencil className="size-3.5" /></button>
                  <button onClick={() => remove(bloc.id)} className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" aria-label="Supprimer"><Trash2 className="size-3.5" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {modal.mode !== 'closed' && (
        <BlocModal
          initial={modal.mode === 'edit' ? modal.bloc : undefined}
          onSave={save}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}
    </>
  );
}

// ─── Onglet Aperçu chat ───────────────────────────────────────────────────────

function PreviewTab({
  qas, blocs, companyName, prixM2, tarifs,
}: {
  qas: QA[];
  blocs: MessageBloc[];
  companyName: string;
  prixM2: string;
  tarifs: TarifM2[];
}) {
  // Sans companyPublicId : aperçu sur la BDC non sauvegardée
  const cfg = useMemo(
    () => ({ companyName, qas, blocs, prixM2: prixM2 || undefined, tarifs }),
    [companyName, qas, blocs, prixM2, tarifs],
  );
  const { messages, busy, send, reset } = useChatConversation(cfg);
  const [input, setInput] = useState('');
  const [debug, setDebug] = useState(false);
  const starters = useMemo(() => starterSuggestions(qas, blocs, prixM2 || undefined, tarifs), [qas, blocs, prixM2, tarifs]);

  const handleSend = (text: string) => {
    setInput('');
    send(text);
  };

  return (
    <div className="flex max-w-5xl flex-col gap-6 lg:flex-row">
      <div className="flex flex-1 flex-col">
        <Card padded={false} className="flex flex-col overflow-hidden" style={{ ...accentStyle('#EA580C'), height: 560 }}>
          {/* Header */}
          <div className="flex items-center justify-between bg-[var(--chat-accent)] px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-full bg-white/20">
                <Bot className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold leading-none">Assistant</p>
                <p className="mt-0.5 text-xs text-white/70">Répond instantanément</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setDebug((d) => !d)}
                title="Mode debug : afficher la règle déclenchée et le score"
                className={`grid size-7 place-items-center rounded-md transition-colors ${debug ? 'bg-white/25 text-white' : 'text-white/70 hover:bg-white/15 hover:text-white'}`}
              >
                <Bug className="size-4" />
              </button>
              <button onClick={() => { reset(); setInput(''); }} title="Réinitialiser" className="grid size-7 place-items-center rounded-md text-white/70 transition-colors hover:bg-white/15 hover:text-white">
                <RefreshCw className="size-4" />
              </button>
            </div>
          </div>

          <ChatThread
            messages={messages}
            busy={busy}
            input={input}
            onInput={setInput}
            onSend={handleSend}
            starters={starters}
            renderAfterBot={(msg) =>
              debug && msg.source ? (
                <div className="ml-9">
                  <DebugBadge via={msg.via} source={msg.source} score={msg.score} />
                </div>
              ) : null
            }
          />
        </Card>
      </div>

      {/* Panneau latéral — horizontal sur mobile/tablette, vertical sur desktop */}
      <div className="flex shrink-0 flex-row flex-wrap gap-4 lg:w-60 lg:flex-col">
        <Card>
          <CardHeader title="Comment tester" />
          <ul className="flex flex-col gap-3 text-sm text-slate-600">
            <li className="flex gap-2">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-slate-100 font-mono text-xs font-medium text-slate-600">1</span>
              Tapez n'importe quoi, même avec des fautes.
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-slate-100 font-mono text-xs font-medium text-slate-600">2</span>
              Les messages avec boutons sont déclenchés en priorité.
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-slate-100 font-mono text-xs font-medium text-slate-600">3</span>
              Activez le mode debug pour voir quelle règle répond et son score.
            </li>
          </ul>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-700">Base active</p>
          <p className="mt-1 text-xs text-slate-500">{qas.length} Q&R · {blocs.length} message{blocs.length !== 1 ? 's' : ''} avec boutons</p>
        </Card>
      </div>
    </div>
  );
}

// ─── Composants utilitaires ───────────────────────────────────────────────────

// Libellés lisibles des sources de matching (mode debug).
const SOURCE_LABELS: Record<MatchSource, string> = {
  greeting: 'Salutation',
  thanks: 'Remerciement',
  price: 'Tarif au m²',
  bloc: 'Message à boutons',
  qa: 'Question-réponse',
  fallback: 'Aucune correspondance',
};

// Petit badge affichant l'origine de la réponse + le score local (mode debug).
function DebugBadge({ via, source, score }: { via?: 'api' | 'local'; source: MatchSource; score?: number }) {
  const tone = source === 'fallback' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium ${tone}`}>
        {via === 'api' ? <Sparkles className="size-2.5" /> : <Bug className="size-2.5" />}
        {via === 'api' ? 'Claude' : 'Local'} · {SOURCE_LABELS[source]}
      </span>
      {via === 'local' && typeof score === 'number' && source !== 'greeting' && source !== 'thanks' && source !== 'price' && (
        <span className="text-slate-400">score {Math.round(score * 100)}%</span>
      )}
    </div>
  );
}

// ─── Onglet Partager & intégrer ───────────────────────────────────────────────

const WIDGET_SRC = 'https://cdn.devis-ai.fr/widget.js';
// VITE_API_URL vide (proxy Vite) : le snippet embarqué a besoin d'une URL absolue.
const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.VITE_API_URL === '' ? window.location.origin : 'http://localhost:8000');

// Champ en lecture seule + bouton copier (lien ou snippet).
function CopyRow({ value, mono }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* presse-papiers indisponible */
    }
  };
  return (
    <div className="flex items-stretch gap-2">
      <pre className={`flex-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 ${mono ? 'text-xs whitespace-pre' : 'text-sm whitespace-pre-wrap break-all'}`}>
        {value}
      </pre>
      <Button size="sm" variant="secondary" onClick={copy} className="shrink-0">
        {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
        {copied ? 'Copié' : 'Copier'}
      </Button>
    </div>
  );
}

function ShareTab({
  qas, blocs, prixM2, tarifs, primaryColor, publicId, onSaved,
}: {
  qas: QA[];
  blocs: MessageBloc[];
  prixM2: string;
  tarifs: TarifM2[];
  primaryColor: string;
  publicId?: string;
  onSaved: () => void;
}) {
  const canPublish = Boolean(publicId);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const link = `${origin}/c/${publicId ?? 'VOTRE_ID'}`;
  const snippet =
    `<script type="module" src="${WIDGET_SRC}"\n` +
    `        data-company="${publicId ?? 'VOTRE_ID'}"\n` +
    `        data-api="${API_BASE}"></script>`;

  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');

  const publish = async () => {
    if (!canPublish) return;
    setStatus('saving');
    try {
      await api.put('/api/v1/widget/settings', toSettingsBody(qas, blocs, prixM2, tarifs, primaryColor));
      onSaved();
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="grid max-w-6xl grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      {/* Étape 1 — publier */}
      <Card padded={false} className="lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 font-mono text-sm text-slate-400 tabular-nums">1</span>
          <div>
            <h2 className="text-base font-medium text-slate-900">Publier votre assistant</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Rendez votre base de connaissances accessible en ligne pour le widget et le lien partageable.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={publish} disabled={!canPublish || status === 'saving'}>
            {status === 'saving' ? 'Publication…' : 'Publier maintenant'}
          </Button>
          {status === 'ok' && <span className="text-sm font-medium text-emerald-600">Assistant publié</span>}
          {status === 'error' && <span className="text-sm font-medium text-red-600">Échec de la publication</span>}
        </div>
        </div>
      </Card>

      {/* Étape 2 — lien partageable (sans site web) */}
      <Card padded={false}>
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <span className="mt-0.5 font-mono text-sm text-slate-400 tabular-nums">2</span>
          <div>
            <h2 className="text-base font-medium text-slate-900">Lien à donner à vos clients</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Pas de site web ? Envoyez ce lien (SMS, e-mail, réseaux, QR code) : vos clients arrivent directement sur le chat.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <CopyRow value={link} />
          <a href={link} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-600 hover:text-brand-800">
            Ouvrir le chat →
          </a>
        </div>
      </Card>

      {/* Étape 3 — widget embarqué (site web) */}
      <Card padded={false}>
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <span className="mt-0.5 font-mono text-sm text-slate-400 tabular-nums">3</span>
          <div>
            <h2 className="text-base font-medium text-slate-900">Widget sur votre site</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Collez ce code juste avant <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">&lt;/body&gt;</code> : une bulle de chat apparaît en bas à droite.
            </p>
          </div>
        </div>
        <div className="px-5 py-4">
          <CopyRow value={snippet} mono />
        </div>
      </Card>
    </div>
  );
}

// ─── Modale Q&R ──────────────────────────────────────────────────────────────

function QAModal({ initial, onSave, onClose }: { initial?: QA; onSave: (q: string, a: string) => void; onClose: () => void }) {
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [errors, setErrors] = useState<{ question?: string; answer?: string }>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!question.trim()) e.question = 'La question est requise.';
    if (!answer.trim()) e.answer = 'La réponse est requise.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (validate()) onSave(question.trim(), answer.trim());
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Modifier la question' : 'Nouvelle question'} size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="qa-form">{initial ? 'Enregistrer' : 'Ajouter'}</Button>
        </div>
      }
    >
      <form id="qa-form" onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Question" htmlFor="qa-q" required error={errors.question}>
          <Input id="qa-q" placeholder="Ex. Comment obtenir un devis ?" value={question} onChange={(e) => setQuestion(e.target.value)} invalid={!!errors.question} autoFocus />
        </Field>
        <Field label="Réponse" htmlFor="qa-a" required error={errors.answer}>
          <textarea id="qa-a" rows={5} placeholder="Rédigez la réponse que l'assistant donnera…" value={answer} onChange={(e) => setAnswer(e.target.value)}
            className={`w-full resize-y rounded-lg border px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 ${errors.answer ? 'border-red-400' : 'border-slate-300'}`}
          />
          {errors.answer && <p className="mt-1 text-xs text-red-500">{errors.answer}</p>}
        </Field>
      </form>
    </Modal>
  );
}

// ─── Modale Message avec boutons ─────────────────────────────────────────────

function BlocModal({
  initial, onSave, onClose,
}: {
  initial?: MessageBloc;
  onSave: (trigger: string, text: string, buttons: string[], label: string) => void;
  onClose: () => void;
}) {
  const [trigger, setTrigger] = useState(initial?.trigger ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [buttons, setButtons] = useState<string[]>(initial?.buttons ?? ['']);
  const [errors, setErrors] = useState<{ trigger?: string; text?: string; buttons?: string }>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!trigger.trim()) e.trigger = 'Le déclencheur est requis.';
    if (!text.trim()) e.text = 'Le message est requis.';
    const filledButtons = buttons.filter((b) => b.trim());
    if (filledButtons.length === 0) e.buttons = 'Ajoutez au moins un bouton.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (validate()) onSave(trigger.trim(), text.trim(), buttons.filter((b) => b.trim()), label.trim());
  };

  const updateButton = (idx: number, value: string) =>
    setButtons((p) => p.map((b, i) => (i === idx ? value : b)));
  const addButton = () => setButtons((p) => [...p, '']);
  const removeButton = (idx: number) => setButtons((p) => p.filter((_, i) => i !== idx));

  return (
    <Modal open onClose={onClose} title={initial ? 'Modifier le message' : 'Nouveau message avec boutons'} size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="bloc-form">{initial ? 'Enregistrer' : 'Ajouter'}</Button>
        </div>
      }
    >
      <form id="bloc-form" onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>

        {/* Trigger */}
        <Field
          label="Déclencheur"
          htmlFor="bloc-trigger"
          required
          error={errors.trigger}
          hint="Mots-clés que le client pourrait dire pour déclencher ce message (ex. « je veux démarrer un devis »)."
        >
          <Input
            id="bloc-trigger"
            placeholder="Ex. je veux un devis commencer projet"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            invalid={!!errors.trigger}
            autoFocus
          />
        </Field>

        {/* Libellé du bouton (ce que voit le prospect) */}
        <Field
          label="Libellé du bouton"
          htmlFor="bloc-label"
          hint="Texte affiché au prospect pour lancer ce message (ex. « Je veux un devis »). À défaut, les mots-clés du déclencheur sont utilisés."
        >
          <Input
            id="bloc-label"
            placeholder="Ex. Je veux un devis"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>

        {/* Message */}
        <Field label="Message du bot" htmlFor="bloc-text" required error={errors.text}>
          <textarea
            id="bloc-text"
            rows={4}
            placeholder="Ex. Super ! Quel type de projet avez-vous ?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={`w-full resize-y rounded-lg border px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 ${errors.text ? 'border-red-400' : 'border-slate-300'}`}
          />
          {errors.text && <p className="mt-1 text-xs text-red-500">{errors.text}</p>}
        </Field>

        {/* Boutons */}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">
            Boutons <span className="text-red-500">*</span>
          </p>
          <div className="flex flex-col gap-2">
            {buttons.map((btn, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  placeholder={`Bouton ${idx + 1} — ex. Travaux neufs`}
                  value={btn}
                  onChange={(e) => updateButton(idx, e.target.value)}
                  invalid={!!errors.buttons && !btn.trim()}
                />
                {buttons.length > 1 && (
                  <button type="button" onClick={() => removeButton(idx)} className="shrink-0 p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50">
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {errors.buttons && <p className="mt-1 text-xs text-red-500">{errors.buttons}</p>}
          {buttons.length < 5 && (
            <button type="button" onClick={addButton} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-800">
              <Plus className="size-3.5" /> Ajouter un bouton
            </button>
          )}
        </div>

        {/* Aperçu */}
        {(text.trim() || buttons.some((b) => b.trim())) && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-1.5 text-xs font-medium text-slate-400">Aperçu</p>
            {text.trim() && (
              <div className="mb-2 inline-block rounded-2xl rounded-bl-sm bg-white border border-slate-200 px-3 py-2 shadow-sm">
                <p className="text-sm text-slate-800">{text}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {buttons.filter((b) => b.trim()).map((btn) => (
                <span key={btn} className="rounded-full border border-brand-200 bg-white px-2.5 py-1 text-xs font-medium text-brand-700">
                  {btn}
                </span>
              ))}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { Company, Membership, Plan, Role, User } from '@/types';
import type { TradeId } from '@/lib/trades';
import { AuthContext, type AuthContextValue, type NewCompanyInput } from './auth-context';

const STORAGE_KEY = 'devis-ai-auth';
// Compte démo public en lecture seule.
const DEMO_CREDENTIALS = { email: 'demo@devis-ai.fr', password: 'demo1234' };

// Fiche entreprise renvoyée par l'API (camelCase, cf. CompanyDetailOut).
type ApiCompany = {
  id: string;
  publicId: string;
  name: string;
  siret: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  defaultVatRate: number;
  metier: string | null;
  metiers?: string[];
  plan: Plan;
};

type MeResponse = {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  memberships: { company: ApiCompany; role: Role }[];
};

type Persisted = { token: string; user: User; memberships: Membership[]; activeCompanyId: string };

function toCompany(c: ApiCompany): Company {
  return {
    id: c.id,
    publicId: c.publicId,
    name: c.name,
    siret: c.siret ?? undefined,
    address: c.address ?? undefined,
    contactEmail: c.contactEmail ?? undefined,
    contactPhone: c.contactPhone ?? undefined,
    defaultVatRate: c.defaultVatRate,
    metier: (c.metier as TradeId | null) ?? undefined,
    metiers: (c.metiers ?? (c.metier ? [c.metier] : [])) as TradeId[],
    plan: c.plan,
  };
}

function load(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

// Authentification réelle contre l'API (token JWT + profil /me, persistés en localStorage).
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted | null>(() => load());

  const persist = useCallback((next: Persisted | null) => {
    setState(next);
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Charge /me ; `keepActive` conserve l'entreprise active.
  const loadSession = useCallback(
    async (token: string, keepActive?: string | null) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token }));
      const me = await api.get<MeResponse>('/api/v1/auth/me');
      const user: User = {
        id: String(me.id),
        name: [me.first_name, me.last_name].filter(Boolean).join(' ') || me.email,
        email: me.email,
      };
      const memberships: Membership[] = me.memberships.map((m) => ({
        company: toCompany(m.company),
        role: m.role,
      }));
      const activeCompanyId =
        (keepActive && memberships.some((m) => m.company.id === keepActive) && keepActive) ||
        memberships[0]?.company.id ||
        '';
      persist({ token, user, memberships, activeCompanyId });
    },
    [persist],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const { access_token } = await api.post<{ access_token: string }>('/api/v1/auth/login', {
        email,
        password,
      });
      await loadSession(access_token);
    },
    [loadSession],
  );

  const register = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      const { access_token } = await api.post<{ access_token: string }>('/api/v1/auth/register', {
        email,
        password,
        company_name: 'Mon entreprise',
      });
      await loadSession(access_token);
    },
    [loadSession],
  );

  // Parcours public « Voir la démo » : compte viewer en lecture seule.
  const loginAsDemo = useCallback(
    () => login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password),
    [login],
  );

  // Connexion dev sur le compte owner seedé (retiré du build de prod).
  const loginAsDev = useCallback(async () => {
    if (import.meta.env.DEV) {
      return login('lucas@atelier-dupont.fr', 'motdepasse');
    }
    throw new Error('Accès dev indisponible en production');
  }, [login]);

  const refreshSession = useCallback(async () => {
    const current = load();
    if (current?.token) await loadSession(current.token, current.activeCompanyId);
  }, [loadSession]);

  const logout = useCallback(() => {
    persist(null);
  }, [persist]);

  const switchCompany = useCallback((companyId: string) => {
    // Miroir dans devis-ai-auth pour l'en-tête X-Company-Id des appels API.
    setState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, activeCompanyId: companyId };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const addCompany = useCallback(
    async (input: NewCompanyInput): Promise<Company> => {
      const created = await api.post<ApiCompany>('/api/v1/companies', {
        name: input.name.trim(),
        address: input.address?.trim() || null,
        contactEmail: input.contactEmail?.trim() || null,
        contactPhone: input.contactPhone?.trim() || null,
      });
      // Recharge les appartenances puis bascule sur le nouvel espace.
      const current = load();
      if (current?.token) await loadSession(current.token, created.id);
      return toCompany(created);
    },
    [loadSession],
  );

  const value = useMemo<AuthContextValue>(() => {
    const memberships = state?.memberships ?? [];
    const activeMembership =
      memberships.find((m) => m.company.id === state?.activeCompanyId) ?? memberships[0] ?? null;
    return {
      user: state?.user ?? null,
      memberships,
      activeCompanyId: activeMembership?.company.id ?? null,
      activeMembership,
      isAuthenticated: Boolean(state?.token && state?.user),
      login,
      register,
      loginAsDev,
      loginAsDemo,
      logout,
      switchCompany,
      addCompany,
      refreshSession,
    };
  }, [state, login, register, loginAsDev, loginAsDemo, logout, switchCompany, addCompany, refreshSession]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

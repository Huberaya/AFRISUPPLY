// Contexte d'authentification AFRISUPPLY — Intégration Clerk & base de données Neon
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';
import { api, tokenStore } from './api';

export type User = {
  id: string;
  email: string;
  fullName: string;
  isAdmin?: boolean;
  emailVerified?: boolean;
  emailVerifiedAt?: string | null;
  clerkId?: string | null;
};

export type Restaurant = {
  id: string;
  name: string;
  city: string | null;
  plan: string;
  trialEndsAt: string | null;
  coversPerDay: number | null;
  role: string;
};

type Ctx = {
  user: User | null;
  restaurants: Restaurant[];
  restaurant: Restaurant | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (p: { email: string; password: string; fullName: string; restaurantName: string; city?: string; coversPerDay?: number; inviteCode?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  switchRestaurant: (id: string) => void;
  accessNotice: string | null;
  clearAccessNotice: () => void;
};

const AuthContext = createContext<Ctx | undefined>(undefined);

/** Ce que le contexte d'authentification a besoin de savoir de Clerk (rien de plus). */
type ClerkBridge = {
  available: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  /** Identifiant de la personne connectée chez Clerk : sert uniquement à relancer la synchronisation quand il change. */
  userId: string | null;
  /** Jeton de session Clerk à présenter au serveur (preuve d'identité vérifiée côté serveur). */
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

const NO_CLERK: ClerkBridge = { available: false, isLoaded: true, isSignedIn: false, userId: null, getToken: async () => null, signOut: async () => {} };

/** Contexte d'authentification SANS Clerk (aucune clé publique configurée, ou tests) : e-mail et mot de passe. */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthCore clerk={NO_CLERK}>{children}</AuthCore>;
}

/** Contexte d'authentification AVEC Clerk : à monter à l'intérieur de `ClerkProvider`. */
export function ClerkAuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const clerk = useClerk();
  const bridge = useMemo<ClerkBridge>(() => ({
    available: true,
    isLoaded,
    isSignedIn: isSignedIn ?? false,
    userId: user?.id ?? null,
    getToken: async () => (await clerk.session?.getToken()) ?? null,
    signOut: async () => { await clerk.signOut(); },
  }), [isLoaded, isSignedIn, user?.id, clerk]);
  return <AuthCore clerk={bridge}>{children}</AuthCore>;
}

function AuthCore({ children, clerk }: { children: ReactNode; clerk: ClerkBridge }) {
  const { available: clerkAvailable, isLoaded: clerkLoaded, isSignedIn, userId: clerkUserId } = clerk;

  const [user, setUser] = useState<User | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantId, setRestaurantId] = useState<string | null>(tokenStore.restaurant());
  const [loading, setLoading] = useState(true);
  const [accessNotice, setAccessNotice] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: Event) => setAccessNotice((e as CustomEvent<string>).detail);
    window.addEventListener('afs:access-notice', h);
    return () => window.removeEventListener('afs:access-notice', h);
  }, []);
  const clearAccessNotice = useCallback(() => setAccessNotice(null), []);

  const refresh = useCallback(async () => {
    if (!tokenStore.authed()) {
      setUser(null);
      setRestaurants([]);
      setLoading(false);
      return;
    }
    try {
      const me = await api<{ user: User; restaurants: Restaurant[] }>('/auth/me');
      setUser(me.user);
      setRestaurants(me.restaurants);
      const rid = me.restaurants.some((r) => r.id === restaurantId) ? restaurantId! : me.restaurants[0]?.id;
      if (rid) {
        tokenStore.setRestaurant(rid);
        setRestaurantId(rid);
      }
    } catch {
      tokenStore.clear();
      setUser(null);
      setRestaurants([]);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  // Synchronisation avec Clerk ou session existante
  useEffect(() => {
    // 1. Clerk a une personne connectée : on échange son jeton de session Clerk contre une session
    //    AFRISUPPLY. Le serveur vérifie le jeton et lit lui-même l'identité chez Clerk : le
    //    navigateur n'envoie plus ni identifiant ni adresse e-mail (chantier P0.2).
    if (clerkAvailable && isSignedIn && clerkUserId) {
      let active = true;
      setLoading(true);

      (async () => {
        const sessionToken = await clerk.getToken();
        if (!sessionToken) throw new Error('Session Clerk indisponible');
        return api<{ ok: boolean; token: string; user: User; restaurants: Restaurant[] }>('/auth/clerk-sync', {
          method: 'POST',
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
      })().then((res) => {
        if (active) {
          tokenStore.setAuthed();
          setUser(res.user);
          setRestaurants(res.restaurants);
          const currentRid = tokenStore.restaurant();
          const validRid = res.restaurants.some((r) => r.id === currentRid)
            ? currentRid!
            : res.restaurants[0]?.id;
          if (validRid) {
            tokenStore.setRestaurant(validRid);
            setRestaurantId(validRid);
          }
        }
      }).catch((err) => {
        console.error('[auth] connexion Clerk refusée par le serveur :', err);
        // Le serveur explique pourquoi (adresse non vérifiée, compte à confirmer, service indisponible…).
        if (active) setAccessNotice(err instanceof Error && err.message ? err.message : 'La connexion par Clerk a échoué.');
      }).finally(() => {
        if (active) setLoading(false);
      });

      return () => {
        active = false;
      };
    }

    // 2. Sinon, si on est déjà authentifié par token/cookie (session locale, test, etc.)
    if (tokenStore.authed()) {
      void refresh();
      return;
    }

    // 3. Si Clerk a fini de charger ou n'est pas présent, et personne n'est connecté
    if (!clerkAvailable || clerkLoaded) {
      setUser(null);
      setRestaurants([]);
      setLoading(false);
    }
    // `clerk` ne change d'identité que lorsque l'état de connexion Clerk change (voir ClerkAuthProvider).
  }, [clerk, clerkAvailable, clerkLoaded, isSignedIn, clerkUserId, refresh]);

  useEffect(() => {
    const onAccess = (e: Event) => {
      const d = (e as CustomEvent<{ error?: string }>).detail;
      tokenStore.clearRestaurant();
      setRestaurantId(null);
      setAccessNotice(`${d?.error ?? 'Accès modifié'} — nous avons rechargé la liste de vos établissements.`);
      void refresh();
    };
    window.addEventListener('afs:access', onAccess as EventListener);
    return () => window.removeEventListener('afs:access', onAccess as EventListener);
  }, [refresh]);

  const login = async (email: string, password: string) => {
    await api('/auth/login', { method: 'POST', json: { email, password } });
    tokenStore.setAuthed();
    setLoading(true);
    await refresh();
  };

  const register: Ctx['register'] = async (p) => {
    await api('/auth/register', { method: 'POST', json: p });
    tokenStore.setAuthed();
    setLoading(true);
    await refresh();
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' }).catch(() => null);
      await clerk.signOut();
    } finally {
      tokenStore.clear();
      setUser(null);
      setRestaurants([]);
    }
  };

  const switchRestaurant = (id: string) => {
    tokenStore.setRestaurant(id);
    setRestaurantId(id);
    window.location.reload();
  };

  const restaurant = restaurants.find((r) => r.id === restaurantId) ?? restaurants[0] ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        restaurants,
        restaurant,
        loading,
        accessNotice,
        clearAccessNotice,
        login,
        register,
        logout,
        refresh,
        switchRestaurant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth hors AuthProvider');
  return c;
}

// Contexte d'authentification AFRISUPPLY — Intégration Clerk & base de données Neon
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
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

function useSafeClerk() {
  try {
    const userHook = useUser();
    const clerk = useClerk();
    return {
      available: true,
      isLoaded: userHook.isLoaded,
      isSignedIn: userHook.isSignedIn ?? false,
      clerkUser: userHook.user,
      clerk,
    };
  } catch {
    return {
      available: false,
      isLoaded: true,
      isSignedIn: false,
      clerkUser: null,
      clerk: null,
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { available: clerkAvailable, isLoaded: clerkLoaded, isSignedIn, clerkUser, clerk } = useSafeClerk();

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
    // 1. Si Clerk est connecté avec un utilisateur : synchronisation avec Neon
    if (clerkAvailable && isSignedIn && clerkUser) {
      const currentClerkUser = clerkUser;
      let active = true;
      setLoading(true);

      api<{
        ok: boolean;
        token: string;
        user: User;
        restaurants: Restaurant[];
      }>('/auth/clerk-sync', {
        method: 'POST',
        json: {
          clerkId: currentClerkUser.id,
          email: currentClerkUser.primaryEmailAddress?.emailAddress,
          fullName: currentClerkUser.fullName || currentClerkUser.firstName || currentClerkUser.username,
          phone: currentClerkUser.primaryPhoneNumber?.phoneNumber,
        },
      }).then((res) => {
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
        console.error('[auth] Sync Clerk ↔ Neon failed:', err);
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
  }, [clerkAvailable, clerkLoaded, isSignedIn, clerkUser, refresh]);

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
      if (clerk && clerk.signOut) {
        await clerk.signOut();
      }
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

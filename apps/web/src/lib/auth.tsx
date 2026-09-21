// Port de ethimarket/src/lib/auth.tsx — sans Supabase : JWT + /api/auth/me
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, tokenStore } from './api';

export type User = { id: string; email: string; fullName: string; isAdmin?: boolean; emailVerified?: boolean; emailVerifiedAt?: string | null };
export type Restaurant = { id: string; name: string; city: string | null; plan: string; trialEndsAt: string | null; coversPerDay: number | null; role: string };

type Ctx = {
  user: User | null; restaurants: Restaurant[]; restaurant: Restaurant | null; loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (p: { email: string; password: string; fullName: string; restaurantName: string; city?: string; coversPerDay?: number; inviteCode?: string }) => Promise<void>;
  logout: () => Promise<void>; refresh: () => Promise<void>; switchRestaurant: (id: string) => void;
  accessNotice: string | null; clearAccessNotice: () => void;
};
const AuthContext = createContext<Ctx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantId, setRestaurantId] = useState<string | null>(tokenStore.restaurant());
  const [loading, setLoading] = useState(true);
  // Chantier 8 : message explicite quand l'accès change (établissement retiré, plus aucun restaurant).
  const [accessNotice, setAccessNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) { setUser(null); setRestaurants([]); setLoading(false); return; }
    try {
      const me = await api<{ user: User; restaurants: Restaurant[] }>('/auth/me');
      setUser(me.user); setRestaurants(me.restaurants);
      const rid = me.restaurants.some((r) => r.id === restaurantId) ? restaurantId! : me.restaurants[0]?.id;
      if (rid) { tokenStore.setRestaurant(rid); setRestaurantId(rid); }
    } catch { tokenStore.clear(); setUser(null); setRestaurants([]); }
    finally { setLoading(false); }
  }, [restaurantId]);
  // Chargement initial : une seule fois au montage, volontairement (on ne veut pas recharger la
  // session à chaque changement d'établissement — c'est `setRestaurant` qui s'en charge).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- montage unique
  useEffect(() => { void refresh(); }, []);
  // Chantier 8 : le serveur signale que l'établissement courant n'est plus accessible → on recharge
  // les appartenances et on repart sur un établissement valide, avec un message clair.
  useEffect(() => {
    const onAccess = (e: Event) => {
      const d = (e as CustomEvent<{ error?: string }>).detail;
      tokenStore.clearRestaurant(); setRestaurantId(null);
      setAccessNotice(`${d?.error ?? 'Accès modifié'} — nous avons rechargé la liste de vos établissements.`);
      void refresh();
    };
    window.addEventListener('afs:access', onAccess as EventListener);
    return () => window.removeEventListener('afs:access', onAccess as EventListener);
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const r = await api<{ token: string }>('/auth/login', { method: 'POST', json: { email, password } });
    tokenStore.set(r.token); setLoading(true); await refresh();
  };
  const register: Ctx['register'] = async (p) => {
    const r = await api<{ token: string }>('/auth/register', { method: 'POST', json: p });
    tokenStore.set(r.token); setLoading(true); await refresh();
  };
  const logout = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => null); tokenStore.clear(); setUser(null); setRestaurants([]); };
  const switchRestaurant = (id: string) => { tokenStore.setRestaurant(id); setRestaurantId(id); window.location.reload(); };
  const clearAccessNotice = () => setAccessNotice(null);

  const restaurant = restaurants.find((r) => r.id === restaurantId) ?? restaurants[0] ?? null;
  return <AuthContext.Provider value={{ user, restaurants, restaurant, loading, accessNotice, clearAccessNotice, login, register, logout, refresh, switchRestaurant }}>{children}</AuthContext.Provider>;
}

export function useAuth() { const c = useContext(AuthContext); if (!c) throw new Error('useAuth hors AuthProvider'); return c; }

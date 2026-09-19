// Client API minimal (remplace le client Supabase) — JWT en localStorage + header X-Restaurant-Id
const TOKEN_KEY = 'afs_token';
const RESTAURANT_KEY = 'afs_restaurant';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(RESTAURANT_KEY); },
  restaurant: () => localStorage.getItem(RESTAURANT_KEY),
  setRestaurant: (id: string) => localStorage.setItem(RESTAURANT_KEY, id),
};

export class ApiError extends Error { constructor(public status: number, message: string, public details?: unknown) { super(message); } }

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> ?? {}) };
  const token = tokenStore.get(); if (token) headers.Authorization = `Bearer ${token}`;
  const rid = tokenStore.restaurant(); if (rid) headers['X-Restaurant-Id'] = rid;
  let body = init.body;
  if (init.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(init.json); }
  const res = await fetch(`/api${path}`, { ...init, headers, body, credentials: 'include' });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 402 && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('afs:paywall', { detail: data?.error ?? 'Abonnement requis' }));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Erreur ${res.status}`, data?.details);
  return data as T;
}

export const fmtEur = (v: number | string | null | undefined, digits = 2) =>
  v === null || v === undefined ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: digits }).format(Number(v));
export const fmtQty = (q: number | string | null | undefined, unit = '') => {
  if (q === null || q === undefined) return '—';
  const nb = Number(q); return `${Number.isInteger(nb) ? nb : nb.toFixed(1).replace('.', ',')}${unit ? ' ' + unit : ''}`;
};
export const fmtDate = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—';
export const CATEGORY_LABEL: Record<string, string> = { feculents: '🌾 Féculents', frais: '🥬 Frais', viandes_poissons: '🥩 Viandes & poissons', epicerie: '🫙 Épicerie', boissons: '🥤 Boissons', emballages: '📦 Emballages' };
export const STATUS_LABEL: Record<string, string> = { brouillon: 'Brouillon', preparee: 'Préparée', envoyee: 'Envoyée', confirmee: 'Confirmée', livree_partiel: 'Livrée (écart)', livree: 'Livrée', annulee: 'Annulée' };

/** Ouvre un PDF protégé par JWT dans un nouvel onglet (chantier 16). */
export async function openPdf(path: string) {
  const headers: Record<string, string> = {}; const t = tokenStore.get(); if (t) headers.Authorization = `Bearer ${t}`; const rid = tokenStore.restaurant(); if (rid) headers['X-Restaurant-Id'] = rid;
  const res = await fetch(`/api${path}`, { headers }); if (!res.ok) throw new ApiError(res.status, 'PDF indisponible');
  const url = URL.createObjectURL(await res.blob()); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

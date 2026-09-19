// Panier public (localStorage) — survit à l'inscription/connexion, puis converti en commandes marketplace.
import { useEffect, useState } from 'react';
export type CartLine = { offerId: string; productId: string; productName: string; packLabel: string; packPriceEur: number; packQty: number; unit: string; vendorId: string; vendorName: string; minOrderEur: number; packs: number };
const KEY = 'afs_cart'; const EVT = 'afs:cart';
const read = (): CartLine[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };
const write = (l: CartLine[]) => { localStorage.setItem(KEY, JSON.stringify(l)); window.dispatchEvent(new Event(EVT)); };
export const cart = {
  get: read,
  add(line: Omit<CartLine, 'packs'>, packs = 1) { const l = read(); const ex = l.find((x) => x.offerId === line.offerId); if (ex) ex.packs += packs; else l.push({ ...line, packs }); write(l); },
  setPacks(offerId: string, packs: number) { write(read().map((x) => x.offerId === offerId ? { ...x, packs } : x).filter((x) => x.packs > 0)); },
  remove(offerId: string) { write(read().filter((x) => x.offerId !== offerId)); },
  clear() { write([]); },
};
export function useCart() {
  const [lines, setLines] = useState<CartLine[]>(read);
  useEffect(() => { const h = () => setLines(read()); window.addEventListener(EVT, h); window.addEventListener('storage', h); return () => { window.removeEventListener(EVT, h); window.removeEventListener('storage', h); }; }, []);
  const total = lines.reduce((a, l) => a + l.packPriceEur * l.packs, 0); const count = lines.reduce((a, l) => a + l.packs, 0);
  const byVendor = Object.values(lines.reduce<Record<string, { vendorId: string; vendorName: string; minOrderEur: number; lines: CartLine[]; total: number }>>((acc, l) => { (acc[l.vendorId] ??= { vendorId: l.vendorId, vendorName: l.vendorName, minOrderEur: l.minOrderEur, lines: [], total: 0 }).lines.push(l); acc[l.vendorId].total += l.packPriceEur * l.packs; return acc; }, {}));
  return { lines, total, count, byVendor };
}
export const productImage = (slug: string) => `/produits/${slug}.jpg`;
export const CAT_EMOJI: Record<string, string> = { feculents: '🌾', frais: '🥬', viandes_poissons: '🐟', epicerie: '🫙', boissons: '🥤', emballages: '📦' };

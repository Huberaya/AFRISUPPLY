// Chantier 19 — Tournées & créneaux : calcul des prochaines dates de livraison possibles pour un restaurant.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb, vendorRoutes, orders } from '@afrisupply/db';

export type RouteRow = typeof vendorRoutes.$inferSelect;
export type SlotOption = { routeId: string; routeName: string; date: string; weekday: number; slots: string[]; cutoffAt: string; remaining: number | null; full: boolean };

const TZ = 'Europe/Paris';
export const WEEKDAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** Date « YYYY-MM-DD » de Paris pour un instant donné. */
export const parisDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const parisMinutes = (d: Date) => { const p = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d); return Number(p.find((x) => x.type === 'hour')!.value) * 60 + Number(p.find((x) => x.type === 'minute')!.value); };
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekdayOf = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();

/** Une tournée dessert-elle ce restaurant ? (zones vides = toutes) */
export function routeServes(r: { zones: string[] }, rest: { city: string | null; postalCode?: string | null }) {
  if (!r.zones.length) return true;
  const city = (rest.city ?? '').trim().toLowerCase(); const cp = (rest.postalCode ?? '').trim();
  return r.zones.some((z) => { const t = z.trim().toLowerCase(); if (!t) return false; if (/^\d{5}$/.test(t)) return cp === t; if (/^\d{2}$/.test(t)) return cp.startsWith(t); return t === city; });
}

/** La commande est-elle encore possible pour la date `date` (heure limite J-n à HH:MM) ? */
export function cutoffFor(r: Pick<RouteRow, 'cutoffDaysBefore' | 'cutoffTime'>, date: string): { cutoffDate: string; cutoffMinutes: number } {
  const [h, m] = r.cutoffTime.split(':').map(Number); return { cutoffDate: addDays(date, -r.cutoffDaysBefore), cutoffMinutes: (h || 0) * 60 + (m || 0) };
}
export function isBeforeCutoff(r: Pick<RouteRow, 'cutoffDaysBefore' | 'cutoffTime'>, date: string, now = new Date()) {
  const { cutoffDate, cutoffMinutes } = cutoffFor(r, date); const today = parisDate(now);
  return today < cutoffDate || (today === cutoffDate && parisMinutes(now) < cutoffMinutes);
}

/** Prochaines options de livraison (14 jours) pour un grossiste et un restaurant, capacité déduite des commandes déjà posées. */
export async function nextSlots(vendorId: string, rest: { city: string | null; postalCode?: string | null }, days = 14, now = new Date()): Promise<SlotOption[]> {
  const db = await getDb();
  const rs = (await db.select().from(vendorRoutes).where(and(eq(vendorRoutes.vendorId, vendorId), eq(vendorRoutes.active, true)))).filter((r) => routeServes(r, rest));
  if (!rs.length) return [];
  const today = parisDate(now); const horizon = addDays(today, days);
  const load = await db.select({ routeId: orders.routeId, date: orders.expectedAt, count: sql<number>`count(*)` }).from(orders)
    .where(and(inArray(orders.routeId, rs.map((r) => r.id)), sql`${orders.expectedAt} between ${today} and ${horizon}`, sql`${orders.status} not in ('annulee')`)).groupBy(orders.routeId, orders.expectedAt);
  const out: SlotOption[] = [];
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i); const wd = weekdayOf(date);
    for (const r of rs.filter((x) => x.weekday === wd)) {
      if (!isBeforeCutoff(r, date, now)) continue;
      const used = Number(load.find((l) => l.routeId === r.id && l.date === date)?.count ?? 0);
      const remaining = r.capacity === null ? null : Math.max(0, r.capacity - used);
      const { cutoffDate } = cutoffFor(r, date);
      out.push({ routeId: r.id, routeName: r.name, date, weekday: wd, slots: r.slots, cutoffAt: `${cutoffDate} ${r.cutoffTime}`, remaining, full: remaining === 0 });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

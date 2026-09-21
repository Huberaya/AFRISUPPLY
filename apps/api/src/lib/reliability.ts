// Chantier 27 — Indicateurs de fiabilité grossiste (calculés à la volée, 90 derniers jours pour l'opérationnel, tous les avis pour la note).
import { and, gte, inArray, sql } from 'drizzle-orm';
import { getDb, orders, vendorReviews } from '@afrisupply/db';

export type Reliability = { rating: number | null; reviews: number; onTimePct: number | null; conformPct: number | null; acceptPct: number | null; avgResponseH: number | null; disputePct: number | null; orders90d: number; badge: 'excellent' | 'fiable' | 'nouveau' | 'a_surveiller' };

const pct = (a: number | null, b: number | null) => (a === null || !b ? null : Math.round((a / b) * 100));

export async function reliabilityFor(vendorIds: string[]): Promise<Map<string, Reliability>> {
  const db = await getDb(); const out = new Map<string, Reliability>(); if (!vendorIds.length) return out;
  const since = sql`now() - interval '90 days'`;
  const rev = await db.select({ vendorId: vendorReviews.vendorId, rating: sql<number>`avg(${vendorReviews.rating})`, count: sql<number>`count(*)`, onTime: sql<number>`count(*) filter (where ${vendorReviews.onTime})`, onTimeN: sql<number>`count(*) filter (where ${vendorReviews.onTime} is not null)`, conform: sql<number>`count(*) filter (where ${vendorReviews.conform})`, conformN: sql<number>`count(*) filter (where ${vendorReviews.conform} is not null)` }).from(vendorReviews).where(inArray(vendorReviews.vendorId, vendorIds)).groupBy(vendorReviews.vendorId);
  const ops = await db.select({ vendorId: orders.vendorId, total: sql<number>`count(*)`, decided: sql<number>`count(*) filter (where ${orders.vendorDecisionAt} is not null)`, refused: sql<number>`count(*) filter (where ${orders.status} = 'annulee' and ${orders.vendorDecisionAt} is not null)`, avgH: sql<number>`avg(extract(epoch from (${orders.vendorDecisionAt} - ${orders.sentAt}))/3600) filter (where ${orders.vendorDecisionAt} is not null and ${orders.sentAt} is not null)`, delivered: sql<number>`count(*) filter (where ${orders.status} in ('livree','livree_partiel') or ${orders.vendorDeliveredAt} is not null)`, partial: sql<number>`count(*) filter (where ${orders.status} = 'livree_partiel')` }).from(orders).where(and(inArray(orders.vendorId, vendorIds), gte(orders.createdAt, since))).groupBy(orders.vendorId);
  for (const vid of vendorIds) {
    const r = rev.find((x) => x.vendorId === vid); const o = ops.find((x) => x.vendorId === vid);
    const reviews = r ? Number(r.count) : 0; const rating = r ? Math.round(Number(r.rating) * 10) / 10 : null;
    const decided = o ? Number(o.decided) : 0; const acceptPct = decided ? Math.round(((decided - Number(o!.refused)) / decided) * 100) : null;
    const delivered = o ? Number(o.delivered) : 0; const disputePct = delivered ? Math.round((Number(o!.partial) / delivered) * 100) : null;
    const onTimePct = r ? pct(Number(r.onTime), Number(r.onTimeN)) : null; const conformPct = r ? pct(Number(r.conform), Number(r.conformN)) : null;
    const avgResponseH = o && o.avgH !== null ? Math.round(Number(o.avgH) * 10) / 10 : null;
    let badge: Reliability['badge'] = 'nouveau';
    if (reviews >= 3 || decided >= 5) { const bad = (rating !== null && rating < 3.5) || (acceptPct !== null && acceptPct < 80) || (onTimePct !== null && onTimePct < 70); const great = rating !== null && rating >= 4.5 && (onTimePct ?? 100) >= 90 && (acceptPct ?? 100) >= 95; badge = bad ? 'a_surveiller' : great ? 'excellent' : 'fiable'; }
    out.set(vid, { rating, reviews, onTimePct, conformPct, acceptPct, avgResponseH, disputePct, orders90d: o ? Number(o.total) : 0, badge });
  }
  return out;
}
export const emptyReliability: Reliability = { rating: null, reviews: 0, onTimePct: null, conformPct: null, acceptPct: null, avgResponseH: null, disputePct: null, orders90d: 0, badge: 'nouveau' };

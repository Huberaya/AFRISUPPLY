// Chantier 29 — Encours & conditions de paiement : exposition d'un restaurant chez un grossiste.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb, orders, vendorCreditTerms } from '@afrisupply/db';

export type Exposure = { outstandingEur: number; overdueEur: number; overdueCount: number; openOrders: number; oldestDueAt: string | null };
export type CreditCheck = { ok: true; terms: typeof vendorCreditTerms.$inferSelect | null; exposure: Exposure } | { ok: false; error: string; status: 400 | 402 | 409 };

const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
export const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;
const today = () => new Date().toISOString().slice(0, 10);

/** Commandes plateforme non annulées, non payées (ou partiellement), engagées = tout sauf brouillon/annulée. */
export async function exposureFor(vendorId: string, restaurantIds: string[]): Promise<Map<string, Exposure>> {
  const db = await getDb(); const out = new Map<string, Exposure>(); if (!restaurantIds.length) return out;
  const rows = await db.select({ rid: orders.restaurantId, total: orders.totalEur, fee: orders.deliveryFeeEur, paid: orders.paidAmountEur, paidAt: orders.paidAt, dueAt: orders.dueAt, status: orders.status })
    .from(orders).where(and(eq(orders.vendorId, vendorId), inArray(orders.restaurantId, restaurantIds), sql`${orders.status} not in ('brouillon','preparee','annulee')`));
  const t = today();
  for (const rid of restaurantIds) out.set(rid, { outstandingEur: 0, overdueEur: 0, overdueCount: 0, openOrders: 0, oldestDueAt: null });
  for (const r of rows) {
    const due = Math.max(0, n(r.total) + n(r.fee) - n(r.paid)); if (r.paidAt && due <= 0.005) continue; if (due <= 0.005) continue;
    const e = out.get(r.rid)!; e.outstandingEur += due; e.openOrders += 1;
    if (r.dueAt && r.dueAt < t) { e.overdueEur += due; e.overdueCount += 1; if (!e.oldestDueAt || r.dueAt < e.oldestDueAt) e.oldestDueAt = r.dueAt; }
  }
  for (const e of out.values()) { e.outstandingEur = Math.round(e.outstandingEur * 100) / 100; e.overdueEur = Math.round(e.overdueEur * 100) / 100; }
  return out;
}

export async function termsFor(vendorId: string, restaurantId: string) {
  const db = await getDb(); const [t] = await db.select().from(vendorCreditTerms).where(and(eq(vendorCreditTerms.vendorId, vendorId), eq(vendorCreditTerms.restaurantId, restaurantId))); return t ?? null;
}

/** Peut-on accepter une nouvelle commande de `amount` € ? (plafond d'encours, compte bloqué, retards) */
export async function checkCredit(vendorId: string, restaurantId: string, amount: number, vendorName: string): Promise<CreditCheck> {
  const terms = await termsFor(vendorId, restaurantId); const exposure = (await exposureFor(vendorId, [restaurantId])).get(restaurantId)!;
  if (terms?.blocked) return { ok: false, error: `Votre compte chez ${vendorName} est bloqué (impayé). Contactez-le pour régulariser${exposure.overdueEur ? ` : ${eur(exposure.overdueEur)} en retard` : ''}.`, status: 402 };
  if (terms && terms.paymentDays > 0 && exposure.overdueCount > 0) return { ok: false, error: `${exposure.overdueCount} facture${exposure.overdueCount > 1 ? 's' : ''} en retard chez ${vendorName} (${eur(exposure.overdueEur)}). Réglez-les avant de recommander à crédit.`, status: 402 };
  if (terms?.creditLimitEur !== null && terms?.creditLimitEur !== undefined && exposure.outstandingEur + amount > n(terms.creditLimitEur))
    return { ok: false, error: `Plafond d'encours dépassé chez ${vendorName} : ${eur(exposure.outstandingEur)} en cours + ${eur(amount)} > ${eur(n(terms.creditLimitEur))} autorisés.`, status: 402 };
  return { ok: true, terms, exposure };
}

/** Job quotidien : rappels de paiement aux restaurants (J-2 avant échéance, puis à J+1, J+8, J+15 de retard). */
export async function remindPayments(now = new Date()): Promise<{ reminded: number }> {
  const db = await getDb(); const t = now.toISOString().slice(0, 10);
  const { vendors, restaurants, restaurantMembers, users } = await import('@afrisupply/db'); const { sendMail } = await import('./mailer.js');
  const rows = await db.select({ o: orders, vendorName: vendors.name, restaurantName: restaurants.name })
    .from(orders).innerJoin(vendors, eq(vendors.id, orders.vendorId)).innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
    .where(and(sql`(${orders.status} in ('livree','livree_partiel') or ${orders.vendorDeliveredAt} is not null)`, sql`${orders.paidAt} is null`, sql`${orders.dueAt} is not null`, sql`${orders.paymentDays} > 0`));
  const dayDiff = (due: string) => Math.round((new Date(`${t}T00:00:00Z`).getTime() - new Date(`${due}T00:00:00Z`).getTime()) / 86_400_000);
  const due = rows.map((r) => ({ ...r, d: dayDiff(r.o.dueAt!) })).filter((r) => [-2, 1, 8, 15].includes(r.d));
  let reminded = 0;
  for (const r of due) {
    const amount = Math.max(0, n(r.o.totalEur) + n(r.o.deliveryFeeEur) - n(r.o.paidAmountEur)); if (amount <= 0) continue;
    const rcpts = await db.select({ email: users.email }).from(restaurantMembers).innerJoin(users, eq(users.id, restaurantMembers.userId)).where(and(eq(restaurantMembers.restaurantId, r.o.restaurantId), inArray(restaurantMembers.role, ['owner', 'manager'])));
    const late = r.d > 0; const subject = late ? `⚠️ Facture ${r.o.reference} en retard de ${r.d} j — ${r.vendorName} — ${eur(amount)}` : `📅 Facture ${r.o.reference} à régler dans 2 jours — ${r.vendorName} — ${eur(amount)}`;
    const text = `Bonjour,\n\nLa commande ${r.o.reference} livrée par ${r.vendorName} ${late ? `devait être réglée le ${r.o.dueAt} (${r.d} jour${r.d > 1 ? 's' : ''} de retard)` : `arrive à échéance le ${r.o.dueAt}`} : ${eur(amount)}.\n${late ? 'Tant qu\'une facture est en retard, vous ne pouvez plus commander à crédit chez ce fournisseur.' : ''}\n\nAFRISUPPLY`;
    for (const x of rcpts) { void sendMail({ to: x.email, subject, text, html: `<p>${text.replace(/\n/g, '<br/>')}</p>` }); reminded += 1; }
  }
  return { reminded };
}

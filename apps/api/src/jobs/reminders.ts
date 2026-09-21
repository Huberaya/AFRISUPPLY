// Chantier 18 — Relance des commandes marketplace sans réponse du grossiste.
import { and, eq, isNull, lt } from 'drizzle-orm';
import { getDb, orders, vendors, restaurants } from '@afrisupply/db';
import { sendMail } from '../lib/mailer.js';
import { sendMessage } from '../lib/sms.js';
import { recordJobRun, statusFrom } from '../lib/job-runs.js';
import { notifyAllRestaurants } from '../lib/notify.js';

const APP_URL = () => process.env.APP_URL ?? 'http://localhost:5173';
const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;

export async function remindPendingVendorOrders(opts: { hours?: number; now?: Date } = {}) {
  const startedAt = new Date();
  const hours = opts.hours ?? Number(process.env.REMINDER_HOURS ?? 4); const now = opts.now ?? new Date();
  const db = await getDb(); const limit = new Date(now.getTime() - hours * 3_600_000);
  const rows = await db.select({ o: orders, v: vendors, r: restaurants }).from(orders).innerJoin(vendors, eq(vendors.id, orders.vendorId)).innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
    .where(and(eq(orders.status, 'envoyee'), isNull(orders.vendorRemindedAt), lt(orders.sentAt, limit)));
  const out: { reference: string; vendor: string; channel: string; ok: boolean }[] = [];
  for (const { o, v, r } of rows) {
    const text = `AFRISUPPLY — Rappel : la commande ${o.reference} de ${r.name} (${eur(Number(o.totalEur))}) attend votre réponse depuis ${Math.round((now.getTime() - (o.sentAt ?? o.createdAt).getTime()) / 3_600_000)} h.\nConfirmer / refuser : ${APP_URL()}/fournisseur/commandes`;
    const phone = v.whatsapp || v.contactPhone; let channel = 'none'; let ok = false;
    if (phone) { const res = await sendMessage({ to: phone, prefer: v.whatsapp ? 'whatsapp' : 'sms', kind: 'order.reminder', orderId: o.id, vendorId: v.id, restaurantId: r.id, body: text }); channel = res.channel; ok = res.ok; }
    if (v.contactEmail) { const m = await sendMail({ to: v.contactEmail, subject: `⏰ Rappel : commande ${o.reference} de ${r.name} en attente`, text, html: `<p>${text.replace(/\n/g, '<br>')}</p>`, tags: { type: 'order_reminder' } }); ok = ok || m.ok; channel = channel === 'none' ? 'email' : `${channel}+email`; }
    await db.update(orders).set({ vendorRemindedAt: now }).where(eq(orders.id, o.id));
    out.push({ reference: o.reference, vendor: v.name, channel, ok });
  }
  // Chantier 6 (audit) : chaque passage de job laisse une trace supervisable (qui a été relancé, par quel canal).
  await recordJobRun({
    job: 'reminders', startedAt, status: statusFrom(out.filter((o) => o.ok).length, out.filter((o) => !o.ok).length),
    summary: { hours, candidates: rows.length, reminded: out.length, channels: out.map((o) => o.channel) },
    error: out.some((o) => !o.ok) ? `${out.filter((o) => !o.ok).length} relance(s) sans canal réel` : null,
  });
  return { ranAt: now.toISOString(), hours, reminded: out.length, details: out };
}

/**
 * Déclenchement opportuniste (au plus toutes les 15 min par instance) depuis les routes fréquentées — utile quand
 * l'hébergeur n'autorise qu'un cron par jour. Depuis le chantier 6 il fait aussi partir les e-mails d'alerte
 * en attente : une rupture détectée en pleine journée ne doit pas attendre le lendemain 4 h 30.
 */
let lastRun = 0;
export function maybeRemind() {
  const t = Date.now(); if (t - lastRun < 15 * 60_000) return; lastRun = t;
  void remindPendingVendorOrders().catch((e) => console.warn('[reminders]', (e as Error).message));
  void notifyAllRestaurants().catch((e) => console.warn('[notify]', (e as Error).message));
}

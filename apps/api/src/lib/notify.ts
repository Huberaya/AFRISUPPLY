// Chantier 6 (audit) — « les alertes n'atteignent l'utilisateur qu'au chargement du dashboard ».
// Ce module transforme une alerte persistée en e-mail immédiat, sans attendre le mail du matin :
//   • rupture de stock (imminente ou constatée) ;
//   • écart de livraison (manquant / excédent) ;
//   • facture plus élevée que la commande (surfacturation) ;
//   • ventes non saisies depuis plusieurs jours (relance).
// L'idempotence est portée par alerts.notified_at : une alerte n'est envoyée qu'une fois, même si
// la fonction est appelée à la fois par la réception, par la route d'alertes et par le cron horaire.
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb, alerts, restaurants } from '@afrisupply/db';
import { sendMail } from './mailer.js';
import { recordJobRun } from './job-runs.js';
import { recipientsFor } from './recipients.js';

/** Genres d'alerte qui partent par e-mail tout de suite (le reste attend le mail du matin). */
export const IMMEDIATE_KINDS = ['rupture', 'ecart_livraison', 'saisie'] as const;

/**
 * Une alerte n'est « immédiate » que si elle est récente : on n'envoie pas par e-mail une rupture
 * constatée il y a trois semaines parce que le cron était en panne. Au-delà, elle reste dans la cloche.
 */
export const IMMEDIATE_WINDOW_HOURS = () => Math.max(1, Number(process.env.IMMEDIATE_ALERT_WINDOW_HOURS ?? 48));

const APP_URL = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export interface PendingAlert { id: string; kind: string; severity: string; title: string; message: string; actionUrl: string | null }

/** Alertes urgentes pas encore notifiées par e-mail (une charge utile de facturation compte comme urgente). */
export async function pendingImmediateAlerts(rid: string, limit = 8): Promise<PendingAlert[]> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - IMMEDIATE_WINDOW_HOURS() * 3_600_000);
  const rows = await db.select({ id: alerts.id, kind: alerts.kind, severity: alerts.severity, title: alerts.title, message: alerts.message, actionUrl: alerts.actionUrl, createdAt: alerts.createdAt })
    .from(alerts)
    .where(and(eq(alerts.restaurantId, rid), isNull(alerts.notifiedAt), eq(alerts.isRead, false), gte(alerts.createdAt, cutoff),
      or(inArray(alerts.kind, [...IMMEDIATE_KINDS]), sql`${alerts.payload} ? 'surchargeEur'`)))
    .orderBy(desc(alerts.createdAt)).limit(limit);
  return rows.map((r) => ({ id: r.id, kind: r.kind, severity: r.severity, title: r.title, message: r.message, actionUrl: r.actionUrl }));
}

/**
 * Ménage : les alertes trop anciennes pour être envoyées par e-mail sont marquées comme annoncées.
 * Évite qu'une alerte oubliée reparte des semaines plus tard (et que la file d'envoi grossisse sans fin).
 */
export async function retireStaleAlerts(rid: string, now = new Date()) {
  const cutoff = new Date(now.getTime() - IMMEDIATE_WINDOW_HOURS() * 3_600_000);
  const db = await getDb();
  const done = await db.update(alerts).set({ notifiedAt: now })
    .where(and(eq(alerts.restaurantId, rid), isNull(alerts.notifiedAt), lt(alerts.createdAt, cutoff)))
    .returning({ id: alerts.id });
  return done.length;
}

/** Marque des alertes comme « déjà annoncées » (ex. : elles figuraient dans le mail du matin). */
export async function markAlertsNotified(ids: string[], at = new Date()) {
  if (!ids.length) return 0;
  const db = await getDb();
  const done = await db.update(alerts).set({ notifiedAt: at }).where(inArray(alerts.id, ids)).returning({ id: alerts.id });
  return done.length;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Construit l'e-mail « alertes urgentes » d'un restaurant (une seule fois pour tout le lot). */
export function buildAlertMail(restaurantName: string, list: PendingAlert[]) {
  const one = list.length === 1;
  const subject = one ? `${list[0].title}` : `🔔 ${list.length} alertes urgentes — ${restaurantName}`;
  const lines = list.map((a) => `• ${a.title}\n  ${a.message}${a.actionUrl ? `\n  → ${APP_URL()}${a.actionUrl}` : ''}`);
  const text = `Bonjour,\n\n${one ? 'Une alerte demande votre attention' : `${list.length} alertes demandent votre attention`} (${restaurantName}) :\n\n${lines.join('\n\n')}\n\nOuvrir AFRISUPPLY : ${APP_URL()}/app\n\nL'équipe AFRISUPPLY`;
  const html = `<p>Bonjour,</p><p><b>${one ? 'Une alerte demande votre attention' : `${list.length} alertes demandent votre attention`}</b> (${escapeHtml(restaurantName)}) :</p>`
    + list.map((a) => `<div style="border-left:3px solid #dc2626;padding:2px 0 2px 10px;margin:12px 0"><b>${escapeHtml(a.title)}</b><br>${escapeHtml(a.message)}${a.actionUrl ? `<br><a href="${APP_URL()}${a.actionUrl}">Voir dans AFRISUPPLY</a>` : ''}</div>`).join('')
    + `<p><a href="${APP_URL()}/app">Ouvrir AFRISUPPLY</a></p><p>L'équipe AFRISUPPLY</p>`;
  return { subject, text, html };
}

export interface NotifyResult {
  restaurantId: string; alerts: number; emails: number; recipients: string[];
  sent: boolean; transport?: string; delivered?: boolean; status: 'ok' | 'partial' | 'error' | 'nothing';
  error?: string;
}

/**
 * Envoie (tout de suite) l'e-mail des alertes urgentes en attente d'un restaurant.
 * `record` : écrit une ligne `job_runs` — chaque envoi doit être supervisable.
 */
export async function notifyCriticalAlerts(rid: string, opts: { now?: Date; record?: boolean; recordJob?: string } = {}): Promise<NotifyResult> {
  const now = opts.now ?? new Date();
  const startedAt = new Date();
  const db = await getDb();
  await retireStaleAlerts(rid, now);
  const pending = await pendingImmediateAlerts(rid);
  if (!pending.length) return { restaurantId: rid, alerts: 0, emails: 0, recipients: [], sent: false, status: 'nothing' };

  const [r] = await db.select({ name: restaurants.name, settings: restaurants.settings }).from(restaurants).where(eq(restaurants.id, rid));
  const out: NotifyResult = { restaurantId: rid, alerts: pending.length, emails: 0, recipients: [], sent: false, status: 'partial' };

  if (r?.settings?.immediateAlertEmails === false) {
    out.status = 'nothing'; out.error = 'alertes immédiates désactivées dans les réglages';
    // Désactivé volontairement : on ne notifie jamais par e-mail, on marque pour ne pas réessayer en boucle.
    await markAlertsNotified(pending.map((a) => a.id), now);
    if (opts.record !== false) await recordJobRun({ job: opts.recordJob ?? 'alerts-notify', startedAt, status: 'ok', summary: { restaurantId: rid, skipped: 'immediate_alert_emails_disabled', alerts: pending.length } });
    return out;
  }

  const recipients = await recipientsFor(rid, r?.settings?.digestRecipients);
  out.recipients = recipients.map((x) => x.email);
  if (!recipients.length) {
    out.status = 'error'; out.error = 'aucun destinataire : renseignez un e-mail dans les réglages';
    if (opts.record !== false) await recordJobRun({ job: opts.recordJob ?? 'alerts-notify', startedAt, status: 'error', summary: { restaurantId: rid, alerts: pending.length, recipients: 0 }, error: out.error });
    return out;
  }

  const { subject, text, html } = buildAlertMail(r?.name ?? 'votre restaurant', pending);
  let transport = ''; let delivered = false; let error: string | undefined;
  for (const rcpt of recipients) {
    const res = await sendMail({ to: rcpt.email, subject, text: html ? text : text, html, tags: { type: 'alert_immediate', restaurant: rid } });
    transport = res.transport;
    if (res.ok && res.delivered) delivered = true;
    if (!res.ok) error = res.error;
  }
  out.transport = transport; out.delivered = delivered; out.emails = delivered ? recipients.length : 0;

  if (delivered) {
    await markAlertsNotified(pending.map((a) => a.id), now);
    out.sent = true; out.status = 'ok';
  } else {
    // Rien n'est parti : on ne marque PAS les alertes (elles repartiront dès qu'un canal réel sera configuré).
    out.status = 'error'; out.error = error ?? 'envoi impossible : aucun service d’e-mail configuré';
  }
  if (opts.record !== false) {
    await recordJobRun({
      job: opts.recordJob ?? 'alerts-notify', startedAt, status: out.status === 'ok' ? 'ok' : 'error',
      summary: { restaurantId: rid, alerts: pending.length, recipients: out.recipients.length, sent: out.sent, transport, kinds: pending.map((a) => a.kind) },
      error: out.error ?? null,
    });
  }
  return out;
}

/** Balayage de tous les restaurants : utilisé par le cron horaire (et au plus toutes les 15 min en opportuniste). */
export async function notifyAllRestaurants(opts: { now?: Date; limit?: number } = {}) {
  const startedAt = new Date(); const db = await getDb();
  const all = await db.select({ id: restaurants.id }).from(restaurants).orderBy(asc(restaurants.createdAt)).limit(opts.limit ?? 200);
  const details: NotifyResult[] = [];
  for (const r of all) { const res = await notifyCriticalAlerts(r.id, { now: opts.now, record: false }); if (res.alerts) details.push(res); }
  const sent = details.filter((d) => d.sent).reduce((a, d) => a + d.emails, 0);
  const failed = details.filter((d) => d.status === 'error').length;
  await recordJobRun({
    job: 'alerts-notify', startedAt, status: failed === 0 ? 'ok' : sent > 0 ? 'partial' : 'error',
    summary: { restaurants: all.length, withAlerts: details.length, emails: sent, failed },
    error: failed ? `${failed} restaurant(s) sans envoi possible` : null,
  });
  return { ranAt: (opts.now ?? new Date()).toISOString(), restaurants: all.length, withAlerts: details.length, emails: sent, failed, details };
}

// Chantier 6 (audit) — « les alertes n'atteignent l'utilisateur qu'au chargement du dashboard ».
// Ce module transforme une alerte persistée en e-mail immédiat, sans attendre le mail du matin :
//   • rupture de stock (imminente ou constatée) ;
//   • écart de livraison (manquant / excédent) ;
//   • facture plus élevée que la commande (surfacturation) ;
//   • ventes non saisies depuis plusieurs jours (relance).
// L'idempotence est portée par alerts.notified_at : une alerte n'est envoyée qu'une fois, même si
// la fonction est appelée à la fois par la réception, par la route d'alertes et par le cron horaire.
import { and, asc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb, alerts, restaurants } from '@afrisupply/db';
import { sendMail, maskEmail, MAIL_CONFIG_ERRORS, MAIL_ERROR_MESSAGES, type MailErrorCode } from './mailer.js';
import { recordJobRun } from './job-runs.js';
import { recipientsFor } from './recipients.js';

/** Genres d'alerte qui partent par e-mail tout de suite (le reste attend le mail du matin). */
export const IMMEDIATE_KINDS = ['rupture', 'ecart_livraison', 'saisie'] as const;
/** Une alerte « blue » est une information (rappel doux) : elle reste dans la cloche et le mail du matin. */
const IMMEDIATE_SEVERITIES = ['red', 'orange'] as const;

/**
 * Une alerte n'est « immédiate » que si elle est récente : on n'envoie pas par e-mail une rupture
 * constatée il y a trois semaines parce que le cron était en panne. Au-delà, elle reste dans la cloche.
 */
export const IMMEDIATE_WINDOW_HOURS = () => Math.max(1, Number(process.env.IMMEDIATE_ALERT_WINDOW_HOURS ?? 48));

const APP_URL = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export interface PendingAlert { id: string; kind: string; severity: string; title: string; message: string; actionUrl: string | null }

/** Alertes urgentes pas encore notifiées par e-mail (une charge utile de facturation compte comme urgente). */
export async function pendingImmediateAlerts(rid: string, limit = 50): Promise<PendingAlert[]> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - IMMEDIATE_WINDOW_HOURS() * 3_600_000);
  const rows = await db.select({ id: alerts.id, kind: alerts.kind, severity: alerts.severity, title: alerts.title, message: alerts.message, actionUrl: alerts.actionUrl, createdAt: alerts.createdAt })
    .from(alerts)
    .where(and(eq(alerts.restaurantId, rid), isNull(alerts.notifiedAt), eq(alerts.isRead, false), gte(alerts.createdAt, cutoff),
      // Chantier 9 : un rappel doux (severity « blue ») ne part pas par e-mail — il serait quotidien
      // et deviendrait du bruit. Les alertes graves partent immédiatement, comme avant.
      or(and(inArray(alerts.kind, [...IMMEDIATE_KINDS]), inArray(alerts.severity, [...IMMEDIATE_SEVERITIES])), sql`${alerts.payload} ? 'surchargeEur'`)))
    // Chantier 9 (audit 2) : l'ordre est stable (le plus ancien d'abord) et la limite est large.
    // Avec une limite de 8 et un tri arbitraire, une rupture réelle pouvait ne JAMAIS figurer dans
    // l'e-mail alors que les autres partaient (cas reproduit : 9 produits à zéro d'un compte neuf).
    .orderBy(asc(alerts.createdAt)).limit(limit);
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

/**
 * Levée des blocages (chantier E) — pourquoi un restaurant n'a pas reçu ses alertes.
 * `no_recipient` et `disabled` ne sont pas des pannes : il n'y avait personne à qui écrire, ou le
 * restaurant a coupé ces e-mails. Les autres motifs sont ceux du service d'envoi (lib/mailer.ts).
 */
export type NotifyReason = MailErrorCode | 'no_recipient' | 'disabled' | 'not_attempted';

export interface NotifyResult {
  restaurantId: string; alerts: number; emails: number;
  /** Destinataires, masqués (« a***@domaine.fr ») : ce résultat part dans des réponses et des journaux. */
  recipients: string[];
  sent: boolean; transport?: string; delivered?: boolean;
  /** `skipped` : rien à reprocher à l'envoi (aucun destinataire) ; `error` : l'envoi a été tenté et rien n'est parti. */
  status: 'ok' | 'partial' | 'error' | 'nothing' | 'skipped';
  reason?: NotifyReason;
  error?: string;
}

/**
 * Envoie (tout de suite) l'e-mail des alertes urgentes en attente d'un restaurant.
 * `record` : écrit une ligne `job_runs` — chaque envoi doit être supervisable.
 */
export async function notifyCriticalAlerts(rid: string, opts: { now?: Date; record?: boolean; recordJob?: string; dontSend?: NotifyReason } = {}): Promise<NotifyResult> {
  const now = opts.now ?? new Date();
  const startedAt = new Date();
  const db = await getDb();
  await retireStaleAlerts(rid, now);
  const pending = await pendingImmediateAlerts(rid);
  if (!pending.length) return { restaurantId: rid, alerts: 0, emails: 0, recipients: [], sent: false, status: 'nothing' };

  const [r] = await db.select({ name: restaurants.name, settings: restaurants.settings }).from(restaurants).where(eq(restaurants.id, rid));
  const out: NotifyResult = { restaurantId: rid, alerts: pending.length, emails: 0, recipients: [], sent: false, status: 'partial' };

  if (r?.settings?.immediateAlertEmails === false) {
    out.status = 'nothing'; out.reason = 'disabled'; out.error = 'alertes immédiates désactivées dans les réglages';
    // Désactivé volontairement : on ne notifie jamais par e-mail, on marque pour ne pas réessayer en boucle.
    await markAlertsNotified(pending.map((a) => a.id), now);
    if (opts.record !== false) await recordJobRun({ job: opts.recordJob ?? 'alerts-notify', startedAt, status: 'ok', summary: { restaurantId: rid, skipped: 'immediate_alert_emails_disabled', alerts: pending.length } });
    return out;
  }

  const recipients = await recipientsFor(rid, r?.settings?.digestRecipients);
  out.recipients = recipients.map((x) => maskEmail(x.email));
  if (!recipients.length) {
    // Personne à qui écrire : ce n'est pas une panne de l'envoi. Les alertes restent dans la cloche
    // et dans le mail du matin ; elles ne sont pas marquées (un destinataire ajouté plus tard les recevra).
    out.status = 'skipped'; out.reason = 'no_recipient'; out.error = 'aucun destinataire : renseignez un e-mail dans les réglages';
    if (opts.record !== false) await recordJobRun({ job: opts.recordJob ?? 'alerts-notify', startedAt, status: 'ok', summary: { restaurantId: rid, alerts: pending.length, recipients: 0, skipped: 'no_recipient' } });
    return out;
  }
  if (opts.dontSend) {
    // Le balayage a déjà constaté que l'envoi est impossible pour tout le monde (configuration, limite
    // de débit) : on n'insiste pas auprès du prestataire. Rien n'est marqué : tout repartira au prochain passage.
    out.status = 'error'; out.reason = 'not_attempted'; out.error = `envoi non tenté : ${MAIL_ERROR_MESSAGES[opts.dontSend as MailErrorCode] ?? opts.dontSend}`;
    return out;
  }

  const { subject, text, html } = buildAlertMail(r?.name ?? 'votre restaurant', pending);
  let transport = ''; let delivered = 0; let failureCode: MailErrorCode | undefined;
  for (const rcpt of recipients) {
    const res = await sendMail({ to: rcpt.email, subject, text: html ? text : text, html, tags: { type: 'alert_immediate', restaurant: rid } });
    transport = res.transport;
    if (res.ok && res.delivered) delivered += 1;
    if (!res.ok) {
      failureCode = res.code;
      // Un échec de configuration ou une limite de débit frappera aussi les destinataires suivants.
      if (MAIL_CONFIG_ERRORS.includes(res.code) || res.code === 'mail_rate_limited') break;
    }
  }
  out.transport = transport; out.delivered = delivered > 0; out.emails = delivered;

  if (delivered > 0) {
    // Au moins un responsable a reçu le message : les alertes sont annoncées, elles ne repartiront pas.
    await markAlertsNotified(pending.map((a) => a.id), now);
    out.sent = true; out.status = delivered === recipients.length ? 'ok' : 'partial';
    if (failureCode) { out.reason = failureCode; out.error = MAIL_ERROR_MESSAGES[failureCode]; }
  } else {
    // Rien n'est parti : on ne marque PAS les alertes (elles repartiront dès qu'un canal réel sera configuré).
    out.status = 'error'; out.reason = failureCode ?? 'mail_not_configured'; out.error = MAIL_ERROR_MESSAGES[failureCode ?? 'mail_not_configured'];
  }
  if (opts.record !== false) {
    await recordJobRun({
      job: opts.recordJob ?? 'alerts-notify', startedAt, status: out.sent ? 'ok' : 'error',
      summary: { restaurantId: rid, alerts: pending.length, recipients: out.recipients.length, emails: out.emails, sent: out.sent, transport, kinds: pending.map((a) => a.kind), ...(out.reason ? { reason: out.reason } : {}) },
      error: out.sent ? null : out.error ?? null,
    });
  }
  return out;
}

/** Balayage de tous les restaurants : utilisé par le cron horaire (et au plus toutes les 15 min en opportuniste). */
export async function notifyAllRestaurants(opts: { now?: Date; limit?: number } = {}) {
  const startedAt = new Date(); const db = await getDb();
  const all = await db.select({ id: restaurants.id }).from(restaurants).orderBy(asc(restaurants.createdAt)).limit(opts.limit ?? 200);
  const details: NotifyResult[] = [];
  // Dès qu'un envoi échoue pour une raison qui vaut pour tout le monde (configuration du service,
  // limite de débit), le balayage cesse de solliciter le prestataire : il note le motif et continue
  // sans envoyer. Les alertes ne sont pas marquées : elles repartiront au passage suivant, une seule fois.
  let blocked: NotifyReason | undefined;
  for (const r of all) {
    const res = await notifyCriticalAlerts(r.id, { now: opts.now, record: false, dontSend: blocked });
    if (res.alerts) details.push(res);
    if (!blocked && res.status === 'error' && res.reason && (MAIL_CONFIG_ERRORS.includes(res.reason as MailErrorCode) || res.reason === 'mail_rate_limited')) blocked = res.reason;
  }
  const sent = details.filter((d) => d.sent).reduce((a, d) => a + d.emails, 0);
  const failedList = details.filter((d) => d.status === 'error');
  const failed = failedList.length;
  const skipped = details.filter((d) => d.status === 'skipped').length;
  // Motifs comptés : la ligne de suivi dit POURQUOI rien n'est parti, pas seulement combien.
  const reasons: Record<string, number> = {};
  for (const d of details) if (d.reason && d.status !== 'ok') reasons[d.reason] = (reasons[d.reason] ?? 0) + 1;
  const cause = blocked ?? (failedList.find((d) => d.reason)?.reason as NotifyReason | undefined);
  const explain = cause && cause in MAIL_ERROR_MESSAGES ? ` — ${MAIL_ERROR_MESSAGES[cause as MailErrorCode]}` : '';
  await recordJobRun({
    job: 'alerts-notify', startedAt, status: failed === 0 ? 'ok' : sent > 0 ? 'partial' : 'error',
    summary: { restaurants: all.length, withAlerts: details.length, emails: sent, failed, skipped, reasons, ...(blocked ? { stoppedSendingFor: blocked } : {}) },
    error: failed ? `${failed} restaurant(s) sans envoi${cause ? ` [${cause}]` : ''}${explain}` : null,
  });
  return { ranAt: (opts.now ?? new Date()).toISOString(), restaurants: all.length, withAlerts: details.length, emails: sent, failed, skipped, reasons, details };
}

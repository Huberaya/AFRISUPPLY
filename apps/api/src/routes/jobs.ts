// Déclencheurs de jobs + réglages de notifications.
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, restaurants } from '@afrisupply/db';
import { requireAuth, requireRestaurant, requireMinRole, type Env } from '../lib/auth.js';
import { runDailyForAll, runDailyForRestaurant, buildDigestForRestaurant } from '../jobs/daily.js';
import { buildDigest } from '../lib/digest.js';
import { remindPendingVendorOrders } from '../jobs/reminders.js';
import { normalizePhone, sendMessage, smsConfig, smsStats } from '../lib/sms.js';
import { mailerConfig, sendMail, mailStats } from '../lib/mailer.js';
import { notifyAllRestaurants } from '../lib/notify.js';
import { recordJobRun } from '../lib/job-runs.js';

export const jobsRoutes = new Hono<Env>();

/** Cron externe : POST (GitHub Actions/crontab) ou GET (Vercel Cron) /api/jobs/daily.
 *  Secret accepté via X-Cron-Secret, Authorization: Bearer <CRON_SECRET> (convention Vercel) ou ?secret=. */
const runDaily = async (c: Context<Env>) => {
  const secret = process.env.CRON_SECRET;
  const auth = c.req.header('authorization');
  const given = c.req.header('x-cron-secret') ?? (auth?.startsWith('Bearer ') ? auth.slice(7) : undefined) ?? c.req.query('secret');
  if (!secret) return c.json({ error: 'CRON_SECRET non configuré' }, 503);
  if (given !== secret) return c.json({ error: 'Secret cron invalide' }, 401);
  const dryRun = c.req.query('dryRun') === '1';
  return c.json(await runDailyForAll({ dryRun }));
};
jobsRoutes.post('/jobs/daily', runDaily);
/** Chantier 18 : rappel aux grossistes qui n'ont pas répondu (> REMINDER_HOURS, défaut 4 h). Vercel Cron toutes les heures. */
const runReminders = async (c: Context<Env>) => {
  const secret = process.env.CRON_SECRET; const auth = c.req.header('authorization');
  const given = c.req.header('x-cron-secret') ?? (auth?.startsWith('Bearer ') ? auth.slice(7) : undefined) ?? c.req.query('secret');
  if (!secret || given !== secret) return c.json({ error: 'Secret cron invalide' }, 401);
  // Chantier 6 : la même passe horaire relance les grossistes ET envoie les alertes urgentes en attente.
  const reminders = await remindPendingVendorOrders();
  const notifications = await notifyAllRestaurants();
  return c.json({ ...reminders, notifications });
};

/** Alertes urgentes seules (rupture, écart de livraison, surfacturation) — cron dédié possible. */
const runNotify = async (c: Context<Env>) => {
  const secret = process.env.CRON_SECRET; const auth = c.req.header('authorization');
  const given = c.req.header('x-cron-secret') ?? (auth?.startsWith('Bearer ') ? auth.slice(7) : undefined) ?? c.req.query('secret');
  if (!secret || given !== secret) return c.json({ error: 'Secret cron invalide' }, 401);
  return c.json(await notifyAllRestaurants());
};
jobsRoutes.get('/jobs/reminders', runReminders); jobsRoutes.post('/jobs/reminders', runReminders);
jobsRoutes.get('/jobs/notify', runNotify); jobsRoutes.post('/jobs/notify', runNotify);
jobsRoutes.get('/jobs/daily', runDaily);

// --- réglages & prévisualisation, côté restaurant connecté (monté séparément, après les routeurs protégés)
export const settingsRoutes = new Hono<Env>();
settingsRoutes.use('*', requireAuth, requireRestaurant);

// Chantier 2 (audit) — réglages du restaurant, destinataires du mail du matin et envois de test : responsable.
settingsRoutes.on(['PUT'], '/settings', requireMinRole('manager'));
settingsRoutes.on(['POST'], '/digest/send-test', requireMinRole('manager'));
settingsRoutes.on(['POST'], '/settings/test-sms', requireMinRole('manager'));
settingsRoutes.on(['POST'], '/settings/test-email', requireMinRole('manager'));

settingsRoutes.get('/settings', async (c) => {
  const db = await getDb(); const [r] = await db.select().from(restaurants).where(eq(restaurants.id, c.get('restaurantId')));
  const s = r.settings ?? {};
  const mc = mailerConfig();
  return c.json({
    restaurant: { id: r.id, name: r.name, city: r.city, coversPerDay: r.coversPerDay, plan: r.plan, trialEndsAt: r.trialEndsAt },
    settings: { priceIncreaseAlertPct: s.priceIncreaseAlertPct ?? 8, forecastHorizonDays: s.forecastHorizonDays ?? 7, autoReorderEnabled: s.autoReorderEnabled ?? true, dailyDigestEnabled: s.dailyDigestEnabled ?? true, immediateAlertEmails: s.immediateAlertEmails ?? true, notifyPhone: s.notifyPhone ?? '', digestRecipients: s.digestRecipients ?? [], closedWeekdays: s.closedWeekdays ?? [] },
    // Chantier 6 : on annonce ce qui est réellement possible, pas ce qu'on aimerait faire.
    mail: { transport: mc.transport, from: mc.from, configured: mc.transport === 'resend', delivered: mc.transport !== 'log', stats: mailStats() },
    sms: { configured: smsConfig().enabled, whatsapp: smsConfig().whatsapp, delivered: smsConfig().enabled, stats: smsStats() },
    cron: { secretConfigured: !!process.env.CRON_SECRET, jobs: ['/api/jobs/daily', '/api/jobs/reminders', '/api/jobs/notify'] },
  });
});

settingsRoutes.put('/settings', async (c) => {
  const body = z.object({
    name: z.string().min(2).optional(), city: z.string().nullable().optional(), coversPerDay: z.number().int().positive().nullable().optional(),
    priceIncreaseAlertPct: z.number().min(1).max(50).optional(), forecastHorizonDays: z.number().int().min(3).max(14).optional(),
    autoReorderEnabled: z.boolean().optional(), dailyDigestEnabled: z.boolean().optional(), immediateAlertEmails: z.boolean().optional(), digestRecipients: z.array(z.string().email()).max(10).optional(), closedWeekdays: z.array(z.number().int().min(0).max(6)).optional(), notifyPhone: z.string().max(30).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const db = await getDb(); const rid = c.get('restaurantId');
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, rid));
  const { name, city, coversPerDay, ...settingsPatch } = body.data;
  if (settingsPatch.notifyPhone !== undefined) { const p = normalizePhone(settingsPatch.notifyPhone); if (settingsPatch.notifyPhone && !p) return c.json({ error: 'Numéro de téléphone invalide (ex. 06 12 34 56 78 ou +33612345678)' }, 400); settingsPatch.notifyPhone = p ?? ''; }
  const [row] = await db.update(restaurants).set({ name, city, coversPerDay, settings: { ...(r.settings ?? {}), ...settingsPatch } }).where(eq(restaurants.id, rid)).returning();
  return c.json({ ok: true, settings: row.settings });
});

/** Aperçu du mail du matin (HTML) sans l'envoyer. */
settingsRoutes.get('/digest/preview', async (c) => {
  const { input } = await buildDigestForRestaurant(c.get('restaurantId'));
  const d = buildDigest({ ...input, firstName: c.get('user').fullName.split(' ')[0] || 'chef' });
  if (c.req.query('format') === 'html') return c.html(d.html);
  return c.json({ subject: d.subject, text: d.text, html: d.html, isEmpty: d.isEmpty });
});

/** « M'envoyer le mail maintenant » (test) — force l'envoi même si désactivé / jour fermé. */
settingsRoutes.post('/digest/send-test', async (c) => {
  const res = await runDailyForRestaurant(c.get('restaurantId'), { force: true });
  const { preview: _p, ...rest } = res; void _p;
  return c.json(rest);
});


/** Chantier 18 : test d'envoi WhatsApp/SMS vers le numéro du restaurant. */
settingsRoutes.post('/settings/test-sms', async (c) => {
  const db = await getDb(); const [r] = await db.select().from(restaurants).where(eq(restaurants.id, c.get('restaurantId')));
  const to = r.settings?.notifyPhone; if (!to) return c.json({ error: 'Renseignez d’abord un numéro' }, 400);
  const res = await sendMessage({ to, kind: 'test', restaurantId: r.id, body: `AFRISUPPLY — test : vous recevrez ici le suivi de vos commandes (${r.name}).` });
  const configured = smsConfig().enabled;
  // Chantier 6 : message honnête. Un numéro enregistré sans Twilio n'est pas un envoi réussi.
  return c.json({
    ...res, configured, to,
    message: res.delivered
      ? `Message de test envoyé par ${res.channel} au ${to}.`
      : configured
        ? `Échec de l'envoi : ${res.error ?? 'erreur inconnue du fournisseur'}.`
        : "Canal WhatsApp/SMS non en service sur cette installation : le message n'a PAS été envoyé. Votre numéro est bien enregistré ; les envois démarreront dès l'activation du canal.",
    code: res.delivered ? undefined : configured ? 'sms_failed' : 'channel_not_configured',
  });
});

/**
 * Chantier 6 : test de bout en bout « est-ce que je reçois vraiment un e-mail ? ».
 * On envoie un vrai message à l'adresse demandée (ou au demandeur) et on répond sans arrondir :
 * `delivered` distingue « réellement remis » de « simulé / impossible ».
 */
settingsRoutes.post('/settings/test-email', async (c) => {
  const startedAt = new Date();
  const body = z.object({ to: z.string().email().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Adresse e-mail invalide' }, 400);
  const user = c.get('user'); const rid = c.get('restaurantId');
  const db = await getDb(); const [r] = await db.select().from(restaurants).where(eq(restaurants.id, rid));
  const to = body.data.to ?? user.email;
  const mc = mailerConfig();
  const sentAt = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  const text = `Bonjour ${user.fullName}, extrait de votre test de notification AFRISUPPLY.\n\nSi vous recevez ce message, les alertes de rupture, les écarts de livraison et le mail du matin arriveront bien dans cette boîte : ${to}.\n\nRestaurant : ${r.name}\nDate du test : ${sentAt}\nType d'envoi : ${mc.transport}\n\nL'équipe AFRISUPPLY`;
  const html = `<p>Bonjour ${user.fullName},</p><p>Vous avez demandé un <b>test des notifications</b> depuis AFRISUPPLY.</p><p style="padding:10px;background:#f5f5f4;border-radius:8px">Si ce message s'affiche, les alertes de rupture, les écarts de livraison et le mail du matin arriveront bien à <b>${to}</b>.</p><p style="color:#78716c">Restaurant : ${r.name}<br>Date du test : ${sentAt}<br>Type d'envoi : ${mc.transport}</p><p>L'équipe AFRISUPPLY</p>`;
  const res = await sendMail({ to, subject: '✅ Test des notifications AFRISUPPLY', text, html, tags: { type: 'mail_test', restaurant: rid } });
  const delivered = res.ok && res.delivered;
  await recordJobRun({
    job: 'mail-test', startedAt, status: delivered ? 'ok' : 'error',
    summary: { restaurantId: rid, to, transport: res.transport, delivered, requestedBy: user.email },
    error: res.ok ? null : res.error,
  });
  return c.json({
    ok: delivered, delivered, transport: res.transport, to, configured: mc.transport !== 'log',
    message: delivered
      ? (res.transport === 'file'
        ? `E-mail écrit (mode développement : relisez-le dans le dossier .outbox, aucun prestataire n'est configuré).`
        : `E-mail envoyé à ${to}. Vérifiez votre boîte (et les indésirables) : s'il arrive, vos alertes arriveront aussi.`)
      : `E-mail NON envoyé : ${res.ok ? 'aucun service d’envoi réel n’est configuré sur ce serveur.' : res.error}`,
    code: delivered ? undefined : 'mail_not_configured',
  }, delivered ? 200 : 424);
});

// Déclencheurs de jobs + réglages de notifications.
import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, restaurants } from '@afrisupply/db';
import { requireAuth, requireRestaurant, type Env } from '../lib/auth.js';
import { runDailyForAll, runDailyForRestaurant, buildDigestForRestaurant } from '../jobs/daily.js';
import { buildDigest } from '../lib/digest.js';
import { mailerConfig } from '../lib/mailer.js';

export const jobsRoutes = new Hono<Env>();

/** Cron externe : POST /api/jobs/daily avec X-Cron-Secret (ou ?secret=). */
jobsRoutes.post('/jobs/daily', async (c) => {
  const secret = process.env.CRON_SECRET;
  const given = c.req.header('x-cron-secret') ?? c.req.query('secret');
  if (!secret || given !== secret) return c.json({ error: 'Secret cron invalide' }, 401);
  const dryRun = c.req.query('dryRun') === '1';
  return c.json(await runDailyForAll({ dryRun }));
});

// --- réglages & prévisualisation, côté restaurant connecté (monté séparément, après les routeurs protégés)
export const settingsRoutes = new Hono<Env>();
settingsRoutes.use('*', requireAuth, requireRestaurant);

settingsRoutes.get('/settings', async (c) => {
  const db = await getDb(); const [r] = await db.select().from(restaurants).where(eq(restaurants.id, c.get('restaurantId')));
  const s = r.settings ?? {};
  return c.json({ restaurant: { id: r.id, name: r.name, city: r.city, coversPerDay: r.coversPerDay, plan: r.plan, trialEndsAt: r.trialEndsAt }, settings: { priceIncreaseAlertPct: s.priceIncreaseAlertPct ?? 8, forecastHorizonDays: s.forecastHorizonDays ?? 7, autoReorderEnabled: s.autoReorderEnabled ?? true, dailyDigestEnabled: s.dailyDigestEnabled ?? true, digestRecipients: s.digestRecipients ?? [], closedWeekdays: s.closedWeekdays ?? [] }, mail: { transport: mailerConfig().transport, from: mailerConfig().from } });
});

settingsRoutes.put('/settings', async (c) => {
  const body = z.object({
    name: z.string().min(2).optional(), city: z.string().nullable().optional(), coversPerDay: z.number().int().positive().nullable().optional(),
    priceIncreaseAlertPct: z.number().min(1).max(50).optional(), forecastHorizonDays: z.number().int().min(3).max(14).optional(),
    autoReorderEnabled: z.boolean().optional(), dailyDigestEnabled: z.boolean().optional(), digestRecipients: z.array(z.string().email()).max(10).optional(), closedWeekdays: z.array(z.number().int().min(0).max(6)).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const db = await getDb(); const rid = c.get('restaurantId');
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, rid));
  const { name, city, coversPerDay, ...settingsPatch } = body.data;
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


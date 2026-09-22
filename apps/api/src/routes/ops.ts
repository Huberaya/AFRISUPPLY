// Chantier 12 (audit) — EXPLOITATION : sauvegardes réellement vérifiables, supervision lisible,
// journal d'audit consultable. Rien n'est « déclaré » ici : chaque chiffre vient de la base,
// des fichiers de sauvegarde réellement écrits, ou des passages de jobs réellement enregistrés.
import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { getDb, restaurants, auditLog, jobRuns } from '@afrisupply/db';
import type { MiddlewareHandler } from 'hono';
import { requireAuth, requireRestaurant, requireMinRole, type Env } from '../lib/auth.js';
import { buildInfo, sentryEnabled, audit } from '../lib/ops.js';
import { SUPPORT, jobHealth, watchdog } from '../lib/ops-health.js';
import {
  BACKUP_VERSION, backupAllRestaurants, backupStorageStats, exportRestaurant, listBackups, restoreDrill,
  readBackupFile, restoreBackup, verifyBackup, type BackupFile,
} from '../lib/backup.js';
import { offsiteStats, offsiteSweep, offsiteDrill, downloadBackup, offsiteConfig } from '../lib/offsite.js';
import { mailerConfig, mailStats, outboxCount } from '../lib/mailer.js';
import { smsConfig, smsStats } from '../lib/sms.js';
import { recordJobRun, statusFrom } from '../lib/job-runs.js';

const isAdmin = (email: string) => (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());

export const opsRoutes = new Hono<Env>();

// ---------------------------------------------------------------- côté restaurant (propriétaire)

/**
 * GET /api/backup/export — le restaurant récupère TOUTES ses données, dans un fichier lisible.
 * Réservé au propriétaire : c'est la porte de sortie (et la réponse honnête à « mes données m'appartiennent »).
 */
opsRoutes.get('/backup/export', requireAuth, requireRestaurant, requireMinRole('owner'), async (c) => {
  const rid = c.get('restaurantId');
  const backup = await exportRestaurant(rid, { mode: 'owner' });
  await audit('backup.export_owner', { actorEmail: c.get('user').email, target: rid, meta: { rows: backup.totals.rows } });
  const day = new Date().toISOString().slice(0, 10);
  c.header('Content-Type', 'application/json; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="afrisupply-donnees-${day}.json"`);
  return c.body(JSON.stringify(backup, null, 2));
});

/** GET /api/backup/status — ce que le restaurant peut savoir : y a-t-il des sauvegardes, et quand. */
opsRoutes.get('/backup/status', requireAuth, requireRestaurant, async (c) => {
  const rid = c.get('restaurantId');
  const stats = await backupStorageStats();
  const mine = (await listBackups()).filter((b) => b.restaurantId === rid);
  const [last] = mine;
  return c.json({
    lastBackupAt: last?.createdAt ?? null,
    lastBackupAgeHours: last ? Math.round(((Date.now() - new Date(last.createdAt).getTime()) / 3_600_000) * 10) / 10 : null,
    copies: mine.length, retentionDays: stats.keep, sizeBytes: last?.sizeBytes ?? null,
    exportUrl: '/api/backup/export',
    note: 'Les sauvegardes sont faites automatiquement chaque jour par la plateforme ; vous pouvez à tout moment télécharger la vôtre.',
  });
});

// ---------------------------------------------------------------- côté plateforme (admin)

export const adminOpsRoutes = new Hono<Env>();
// Garde explicite par route (et non `use('*')`) : monter un routeur avec un middleware attrape-tout
// sous /api reviendrait à filtrer TOUTES les requêtes de la plateforme. Chaque route admin se
// déclare donc elle-même « admin uniquement », sans effet de bord.
const adminOnly: MiddlewareHandler<Env> = async (c, next) => {
  if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403);
  await next();
};

/**
 * GET /api/admin/ops — l'état réel de l'exploitation en un écran :
 * jobs (dernier passage, durée, échecs), sauvegardes, canaux de notification, alertes admin récentes.
 */
adminOpsRoutes.get('/admin/ops', requireAuth, adminOnly, async (c) => {
  const jobs = await jobHealth();
  const storage = await backupStorageStats();
  const db = await getDb();
  const alerts = await db.select().from(auditLog).where(ilike(auditLog.action, 'ops.%')).orderBy(desc(auditLog.at)).limit(20);
  const [lastBackupRun] = await db.select().from(jobRuns).where(eq(jobRuns.job, 'backup')).orderBy(desc(jobRuns.startedAt)).limit(1);
  // Chantier 13 : l'état de la copie HORS SITE (aucun secret : ni clé, ni jeton).
  const horsSite = await offsiteStats();
  const t0 = Date.now(); await db.execute(sql`select 1`); const dbMs = Date.now() - t0;
  const mc = mailerConfig(); const sc = smsConfig();
  const problems = [
    ...Object.entries(jobs).filter(([, h]) => h.state === 'degraded' || h.state === 'stale').map(([job, h]) => `Job « ${job} » : ${h.state === 'stale' ? `aucun passage depuis ${h.lastRun?.hoursAgo ?? '?'} h (max ${h.maxHours} h)` : `dernier passage en échec (${h.lastRun?.error ?? 'sans détail'})`}`),
    ...(storage.files === 0 ? ['Aucune sauvegarde sur disque : lancez-en une et vérifiez le dossier BACKUP_DIR.'] : []),
    ...(storage.last && (Date.now() - new Date(storage.last.createdAt).getTime()) / 3_600_000 > 36 ? [`Dernière sauvegarde il y a ${Math.round((Date.now() - new Date(storage.last.createdAt).getTime()) / 3_600_000)} h : le job de sauvegarde ne tourne plus.`] : []),
    // Chantier 13 (audit n°3) : sans copie hors site, la sauvegarde disparaît avec l'instance.
    ...(horsSite.configured ? [] : [horsSite.pourquoi]),
    ...(horsSite.error ? [`Sauvegarde hors site : ${horsSite.error}`] : []),
    // Chantier 13 : en serverless, le disque du projet est en lecture seule et le dossier temporaire
    // est effacé. Le dire évite de croire qu'un fichier local suffit à protéger les données.
    ...(storage.ephemere ? [String(storage.note ?? 'Sauvegardes locales sur un disque éphémère : seule la copie hors site est durable.')] : []),
    ...(horsSite.configured && horsSite.lastUploadAt && (Date.now() - new Date(horsSite.lastUploadAt).getTime()) / 3_600_000 > 36 ? [`Aucune copie hors site depuis ${Math.round((Date.now() - new Date(horsSite.lastUploadAt).getTime()) / 3_600_000)} h : la copie externe ne se fait plus.`] : []),
    ...(mc.transport !== 'resend' ? [`Envoi d'e-mails en mode « ${mc.transport} » : aucun e-mail ne part vers l'extérieur.`] : []),
    ...(sentryEnabled() ? [] : ['Suivi d\'erreurs (Sentry) non configuré : les incidents ne sont visibles que dans les journaux du serveur.']),
  ];
  return c.json({
    ok: problems.length === 0, checkedAt: new Date().toISOString(), problems,
    jobs, backup: { ...storage, lastJobRun: lastBackupRun ? { status: lastBackupRun.status, finishedAt: lastBackupRun.finishedAt, summary: lastBackupRun.summary, error: lastBackupRun.error } : null, version: BACKUP_VERSION },
    // Chantier 13 : ce que le hors site contient RÉELLEMENT (compté à la source, jamais estimé).
    offsite: horsSite,
    channels: {
      mail: { transport: mc.transport, configured: mc.transport === 'resend', from: mc.from, stats: mailStats(), outbox: mc.transport === 'file' ? await outboxCount() : null },
      sms: { configured: sc.enabled, whatsapp: sc.whatsapp, stats: smsStats() },
      errorTracking: { configured: sentryEnabled() },
    },
    database: { latencyMs: dbMs, engine: process.env.DATABASE_URL ? 'neon' : 'pglite-local' },
    build: buildInfo(), adminAlerts: alerts, support: { email: SUPPORT.email(), hours: SUPPORT.hours, responseTime: SUPPORT.responseTime, phone: SUPPORT.phone() },
  });
});

/** POST /api/admin/backups/run — sauvegarder maintenant (tous les restaurants ou un seul). */
adminOpsRoutes.post('/admin/backups/run', requireAuth, adminOnly, async (c) => {
  const body = z.object({ restaurantId: z.string().uuid().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Requête invalide', details: body.error.flatten() }, 400);
  const startedAt = new Date();
  const res = await backupAllRestaurants({ restaurantId: body.data.restaurantId });
  await recordJobRun({
    job: 'backup', startedAt, status: statusFrom(res.written.length, res.errors.length),
    summary: { written: res.written.map((w) => ({ name: w.name, rows: w.rows, sizeBytes: w.sizeBytes })), removed: res.removed, dir: res.dir, keep: res.keep },
    error: res.errors.length ? res.errors.map((e) => `${e.restaurantId}: ${e.error}`).join(' | ') : null,
  });
  await audit('backup.run_manual', { actorEmail: c.get('user').email, meta: { written: res.written.length, errors: res.errors.length } });
  return c.json(res);
});

/** GET /api/admin/backups — liste des fichiers réellement présents (taille, lignes, empreinte). */
adminOpsRoutes.get('/admin/backups', requireAuth, adminOnly, async (c) => c.json({ backups: await listBackups(), stats: await backupStorageStats() }));

/** POST /api/admin/backups/verify — vérifie un fichier SANS rien écrire (empreinte + compteurs). */
adminOpsRoutes.post('/admin/backups/verify', requireAuth, adminOnly, async (c) => {
  const body = z.object({ name: z.string().optional(), backup: z.unknown().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Requête invalide' }, 400);
  try {
    const backup = body.data.backup ?? (body.data.name ? await readBackupFile(body.data.name) : null);
    if (!backup) return c.json({ error: 'Fournissez « name » (fichier existant) ou « backup » (contenu).' }, 400);
    return c.json(verifyBackup(backup));
  } catch (e) { return c.json({ ok: false, problems: [(e as Error).message] }, 400); }
});

/**
 * POST /api/admin/backups/drill — ESSAI DE RESTAURATION RÉEL : la sauvegarde est rechargée dans une
 * base neuve et jetable, et les lignes sont comptées. C'est la réponse honnête à « est-ce que nos
 * sauvegardes servent à quelque chose ? » — vérifier une empreinte ne prouve pas qu'on sait recharger.
 */
adminOpsRoutes.post('/admin/backups/drill', requireAuth, adminOnly, async (c) => {
  const body = z.object({ name: z.string().optional(), backup: z.unknown().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Requête invalide' }, 400);
  try {
    const backup = (body.data.backup ?? (body.data.name ? await readBackupFile(body.data.name) : null)) as BackupFile | null;
    if (!backup) return c.json({ error: 'Fournissez « name » ou « backup ».' }, 400);
    const report = await restoreDrill(backup);
    await audit('backup.drill', { actorEmail: c.get('user').email, target: report.restaurantId ?? undefined, meta: { ok: report.ok, rows: report.totals.inserted, tookMs: report.tookMs } });
    return c.json(report);
  } catch (e) { return c.json({ ok: false, error: (e as Error).message }, 400); }
});

/** GET /api/admin/backups/:name — téléchargement du fichier (gzip). */
adminOpsRoutes.get('/admin/backups/:name', requireAuth, adminOnly, async (c) => {
  const name = c.req.param('name');
  if (!/^[A-Za-z0-9._-]+\.json\.gz$/.test(name)) return c.json({ error: 'Nom invalide' }, 400);
  const { backupDir } = await import('../lib/backup.js');
  const fs = await import('node:fs/promises');
  try {
    const buf = await fs.readFile(`${backupDir()}/${name}`);
    c.header('Content-Type', 'application/gzip');
    c.header('Content-Disposition', `attachment; filename="${name}"`);
    return c.body(buf as unknown as ArrayBuffer);
  } catch { return c.json({ error: 'Sauvegarde introuvable' }, 404); }
});

/**
 * POST /api/admin/backups/offsite — envoie les sauvegardes hors site MAINTENANT (et applique la
 * rétention distante). C'est le geste à faire après une sauvegarde manuelle, et celui que le
 * quotidien exécute tout seul. Chaque copie est relue et comparée avant d'être comptée.
 */
adminOpsRoutes.post('/admin/backups/offsite', requireAuth, adminOnly, async (c) => {
  const body = z.object({ names: z.array(z.string()).optional(), keep: z.number().int().min(1).max(365).optional(), prune: z.boolean().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Requête invalide', details: body.error.flatten() }, 400);
  const startedAt = new Date();
  const res = await offsiteSweep({ names: body.data.names, keep: body.data.keep, prune: body.data.prune });
  await recordJobRun({
    job: 'offsite-backup', startedAt, status: res.configured ? statusFrom(res.uploaded.length, res.failed.length) : 'partial',
    summary: { uploaded: res.uploaded.length, failed: res.failed.length, removed: res.removed.length, objects: res.objects, bytes: res.bytes, endpoint: res.endpoint },
    error: res.configured ? (res.error ?? null) : 'sauvegarde hors site non configurée',
  });
  await audit('backup.offsite_run', { actorEmail: c.get('user').email, meta: { uploaded: res.uploaded.length, failed: res.failed.length, configured: res.configured } });
  return c.json(res, res.configured ? 200 : 400);
});

/**
 * POST /api/admin/backups/offsite-drill — LA PREUVE : télécharge la copie depuis le stockage externe,
 * la vérifie, la recharge dans une base neuve et jetable, et compte les lignes retrouvées.
 * Télécharger ne suffit pas ; vérifier une empreinte ne suffit pas ; ici on restaure pour de vrai.
 */
adminOpsRoutes.post('/admin/backups/offsite-drill', requireAuth, adminOnly, async (c) => {
  const body = z.object({ name: z.string().optional() }).safeParse(await c.req.json().catch(() => ({})));
  const cfg = offsiteConfig();
  if (!cfg.configured) return c.json({ ok: false, configured: false, error: cfg.why }, 400);
  // Sans nom fourni : on prend la dernière sauvegarde présente hors site.
  const nom = body.success && body.data.name ? body.data.name : (await offsiteStats()).lastBackupName ?? '';
  if (!nom) return c.json({ ok: false, error: 'Aucune sauvegarde hors site : envoyez-en une d’abord (POST /api/admin/backups/offsite).' }, 400);
  const rapport = await offsiteDrill(nom);
  await audit('backup.offsite_drill', { actorEmail: c.get('user').email, target: rapport.restore?.restaurantId ?? undefined, meta: { name: nom, ok: rapport.ok, rows: rapport.restore?.totals.inserted ?? 0, downloadMs: rapport.downloadMs } });
  return c.json(rapport, rapport.ok ? 200 : 400);
});

/**
 * POST /api/admin/backups/offsite-download — ramène une copie EXTERNE sur ce serveur, pour pouvoir
 * la restaurer (reprise après sinistre dans un environnement neuf : c'est le premier geste du
 * protocole de restauration).
 */
adminOpsRoutes.post('/admin/backups/offsite-download', requireAuth, adminOnly, async (c) => {
  const body = z.object({ name: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Nom de sauvegarde requis' }, 400);
  const cfg = offsiteConfig();
  if (!cfg.configured) return c.json({ ok: false, configured: false, error: cfg.why }, 400);
  const res = await downloadBackup(body.data.name);
  await audit('backup.offsite_download', { actorEmail: c.get('user').email, meta: { name: body.data.name, ok: res.ok, bytes: res.bytes } });
  return c.json({ ...res, body: undefined }, res.ok ? 200 : 400);
});

/**
 * POST /api/admin/backups/restore — restaure une sauvegarde DANS CETTE base.
 * Refusé si la base contient déjà des restaurants (sauf `force: true`) et exige la confirmation
 * écrite « RESTAURER » : c'est l'outil de reprise après sinistre, pas un bouton ordinaire.
 */
adminOpsRoutes.post('/admin/backups/restore', requireAuth, adminOnly, async (c) => {
  const body = z.object({ name: z.string().optional(), backup: z.unknown().optional(), confirm: z.string(), force: z.boolean().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Requête invalide', details: body.error.flatten() }, 400);
  if (body.data.confirm !== 'RESTAURER') return c.json({ error: 'Confirmation manquante : envoyez { "confirm": "RESTAURER" }.' }, 400);
  try {
    const backup = (body.data.backup ?? (body.data.name ? await readBackupFile(body.data.name) : null)) as BackupFile | null;
    if (!backup) return c.json({ error: 'Fournissez « name » ou « backup ».' }, 400);
    const report = await restoreBackup(backup, { allowNonEmpty: body.data.force });
    await audit('backup.restore', { actorEmail: c.get('user').email, target: report.restaurantId ?? undefined, meta: { inserted: report.totals.inserted, skipped: report.totals.skipped, tookMs: report.tookMs } });
    return c.json(report);
  } catch (e) { return c.json({ error: (e as Error).message }, 409); }
});

/** POST /api/admin/ops/watchdog — force la surveillance croisée des jobs (normalement déclenchée par les jobs eux-mêmes). */
adminOpsRoutes.post('/admin/ops/watchdog', requireAuth, adminOnly, async (c) => {
  const res = await watchdog({ self: 'manual' });
  return c.json(res);
});

/** GET /api/admin/audit — journal d'audit filtrable (+ export CSV avec &format=csv). */
adminOpsRoutes.get('/admin/audit', requireAuth, adminOnly, async (c) => {
  const q = c.req.query('q')?.trim(); const action = c.req.query('action')?.trim();
  const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 100)));
  const db = await getDb();
  const conds = [];
  if (q) conds.push(or(ilike(auditLog.action, `%${q}%`), ilike(auditLog.actorEmail, `%${q}%`), ilike(auditLog.target, `%${q}%`))!);
  if (action) conds.push(ilike(auditLog.action, `${action}%`));
  const rows = await db.select().from(auditLog).where(conds.length ? and(...conds) : undefined).orderBy(desc(auditLog.at)).limit(limit);
  if (c.req.query('format') === 'csv') {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['horodatage;acteur;action;cible;details', ...rows.map((r) => [r.at instanceof Date ? r.at.toISOString() : r.at, r.actorEmail, r.action, r.target, JSON.stringify(r.meta ?? {})].map(esc).join(';'))].join('\n');
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="journal-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    return c.body(csv);
  }
  const [count] = await db.select({ n: sql<number>`count(*)` }).from(auditLog);
  return c.json({ rows, total: Number(count.n), filters: { q: q ?? null, action: action ?? null, limit } });
});

/** GET /api/admin/ops/jobs — historique brut des passages de jobs (mêmes données que job_runs). */
adminOpsRoutes.get('/admin/ops/jobs', requireAuth, adminOnly, async (c) => {
  const db = await getDb();
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50)));
  return c.json({ runs: await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(limit) });
});

/** POST /api/admin/restaurants/:id/backup — sauvegarde d'un restaurant précis (mêmes garanties). */
adminOpsRoutes.post('/admin/restaurants/:id/backup', requireAuth, adminOnly, async (c) => {
  const id = c.req.param('id');
  const db = await getDb();
  const [r] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.id, id));
  if (!r) return c.json({ error: 'Restaurant introuvable' }, 404);
  const res = await backupAllRestaurants({ restaurantId: id });
  return c.json(res);
});

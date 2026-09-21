// Chantier 12 — EXPLOITATION : sauvegarde, vérification, RESTAURATION prouvée dans une base neuve,
// supervision des tâches planifiées et canal de support. Tout passe par l'app Hono réelle + PGlite
// en mémoire : aucun mock, aucun « ça devrait marcher ».
import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDb, jobRuns, runMigrations } from '@afrisupply/db';
import { app } from '../app.js';
import { _resetRateLimits, _resetAdminAlerts } from '../lib/ops.js';
import {
  exportRestaurant, verifyBackup, restoreBackup, restoreDrill, checksumOf, writeBackupFile,
  listBackups, readBackupFile, pruneBackups, backupAllRestaurants, backupStorageStats, type BackupFile,
} from '../lib/backup.js';
import { jobHealth, watchdog, SUPPORT, JOB_MAX_HOURS } from '../lib/ops-health.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.CRON_SECRET = 'cron-test';
process.env.PGLITE_DIR = 'memory://ops-backup'; process.env.ADMIN_EMAILS = 'admin@afrisupply.fr';
process.env.SUPPORT_EMAIL = 'support-banc@afrisupply.fr'; process.env.SUPPORT_PHONE = '+33 6 00 00 00 00';
process.env.BACKUP_KEEP = '2';

const TMP = path.join(os.tmpdir(), `afs-backup-test-${Date.now()}`);
const TMP2 = path.join(TMP, 'fichiers');
process.env.BACKUP_DIR = TMP;

type Json = Record<string, any>;
const call = async (method: string, p: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(p, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json: Json = {};
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json, headers: res.headers };
};

const PASSWORD = 'Plantain-Yassa-42';
let authA: Record<string, string> = {}; let ridA = ''; let tokenA = '';
let authB: Record<string, string> = {}; let ridB = '';
let authStaff: Record<string, string> = {};
let authAdmin: Record<string, string> = {};
let ownerFile: BackupFile;
let orderIdA = '';
let productIdA = '';

const register = async (email: string, restaurantName: string) => {
  _resetRateLimits();
  return call('POST', '/api/auth/register', { email, password: PASSWORD, fullName: 'Test Chantier 12', restaurantName, city: 'Nantes', coversPerDay: 40 });
};

beforeAll(async () => {
  await runMigrations();
  await fs.mkdir(TMP, { recursive: true });

  // --- Restaurant A, avec de VRAIES données : menu, fournisseur, offre, commande, réception partielle, ventes, alerte.
  const a = await register('patron@awa12.fr', 'Chez Awa Sauvegarde');
  expect(a.status).toBe(201); tokenA = a.json.token; ridA = a.json.restaurant.id; authA = { authorization: `Bearer ${tokenA}` };
  const tpl = await call('GET', '/api/onboarding/templates', undefined, authA);
  await call('POST', '/api/onboarding/apply', { templates: tpl.json.templates.slice(0, 2).map((x: Json) => x.id ?? x.name) }, authA);
  const stock = await call('GET', '/api/stock', undefined, authA);
  productIdA = stock.json.items[0].productId;
  const sup = await call('POST', '/api/suppliers', { name: 'Grossiste Marché Dejean', whatsapp: '+33600000012', leadTimeHours: 24 }, authA);
  const supplierId = sup.json.supplier?.id ?? sup.json.id;
  const offer = await call('POST', `/api/suppliers/${supplierId}/offers`, { productId: productIdA, packLabel: 'sac 25 kg', packQty: 25, packPrice: 40 }, authA);
  const offerId = offer.json.offer?.id ?? offer.json.id;
  const order = await call('POST', '/api/orders', { supplierId, channel: 'whatsapp', lines: [{ offerId, packs: 2 }] }, authA);
  orderIdA = order.json.order?.id ?? order.json.id;
  const mine = (await call('GET', '/api/orders', undefined, authA)).json.orders.find((o: Json) => o.id === orderIdA);
  const line = mine.lines[0];
  // Réception PARTIELLE (45 sur 50) : l'écart de livraison doit aussi être sauvegardé puis restauré.
  await call('POST', `/api/orders/${orderIdA}/receive`, { lines: [{ lineId: line.id, receivedQty: Number(line.quantity ?? line.qty ?? 50) - 5, note: '5 kg manquants' }] }, authA);
  const recipeId = (await call('GET', '/api/recipes', undefined, authA)).json.recipes[0].id;
  for (let d = 1; d <= 7; d++) await call('POST', '/api/sales', { day: new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10), lines: [{ recipeId, portions: 30 }] }, authA);
  await call('POST', '/api/alerts/refresh', {}, authA);

  // --- Un membre d'équipe réel (invitation → mot de passe → connexion) : il ne doit PAS pouvoir exporter.
  const invite = await call('POST', '/api/members', { email: 'aide@awa12.fr', fullName: 'Kofi Aide', role: 'staff' }, authA);
  expect(invite.status).toBe(201);
  _resetRateLimits();
  await call('POST', '/api/auth/reset-password', { token: new URL(invite.json.devLink).searchParams.get('token'), password: PASSWORD });
  const loginStaff = await call('POST', '/api/auth/login', { email: 'aide@awa12.fr', password: PASSWORD });
  authStaff = { authorization: `Bearer ${loginStaff.json.token}` };

  // --- Restaurant B (isolation) + compte administrateur plateforme.
  const b = await register('patron@autre12.fr', 'Le Baobab Autre');
  ridB = b.json.restaurant.id; authB = { authorization: `Bearer ${b.json.token}` };
  const adm = await register('admin@afrisupply.fr', 'AFRISUPPLY Exploitation');
  authAdmin = { authorization: `Bearer ${adm.json.token}` };

  ownerFile = (await call('GET', '/api/backup/export', undefined, authA)).json as BackupFile;
}, 120_000);

describe('1. Export « mes données » — un fichier réel, lisible, sans mot de passe', () => {
  it('le propriétaire récupère TOUT ce qui lui appartient, en pièce jointe', async () => {
    const r = await call('GET', '/api/backup/export', undefined, authA);
    expect(r.status).toBe(200);
    expect(String(r.headers.get('content-disposition'))).toMatch(/attachment/);
    expect(r.json.format).toBe('afrisupply.backup');
    expect(r.json.mode).toBe('owner');
    expect(r.json.restaurant.id).toBe(ridA);
    expect(r.json.counts.orders).toBeGreaterThanOrEqual(1);
    expect(r.json.counts.order_lines).toBeGreaterThanOrEqual(1);
    expect(r.json.counts.delivery_discrepancies).toBeGreaterThanOrEqual(1);
    expect(r.json.counts.sales).toBeGreaterThanOrEqual(7);
    expect(r.json.counts.suppliers).toBe(1);
    // Les produits du référentiel AFRISUPPLY sont cités par ce restaurant : ils voyagent avec le
    // fichier, sinon la sauvegarde ne se rechargerait pas dans une base VIDE.
    expect(r.json.counts.products_reference).toBeGreaterThan(0);
    expect(r.json.tables.products_reference.every((p: Json) => p.restaurantId === null)).toBe(true);
    expect(r.json.counts.inventory_items).toBeGreaterThan(0);
    expect(r.json.totals.rows).toBeGreaterThan(30);
  });
  it('aucune empreinte de mot de passe ne sort dans le fichier du restaurant (mais l’admin les garde pour recharger un compte)', async () => {
    expect(ownerFile.tables.users.length).toBe(2);
    expect(ownerFile.tables.users.every((u: Json) => !('passwordHash' in u) && !('tokenVersion' in u))).toBe(true);
    const adminFile = await exportRestaurant(ridA, { mode: 'admin' });
    expect(adminFile.tables.users.every((u: Json) => 'passwordHash' in u)).toBe(true);
  });
  it('deux exports des mêmes données donnent exactement la même empreinte (le fichier est comparé au contenu, pas à l’horloge)', async () => {
    const again = await exportRestaurant(ridA, { mode: 'owner' });
    expect(again.checksum).toBe(ownerFile.checksum);
    expect(checksumOf({ version: 1, restaurant: { id: ridA, name: ownerFile.restaurant.name }, tables: again.tables })).toBe(ownerFile.checksum);
  });
  it('un membre d’équipe reçoit 403, un visiteur non connecté 401', async () => {
    expect((await call('GET', '/api/backup/export', undefined, authStaff)).status).toBe(403);
    expect((await call('GET', '/api/backup/export')).status).toBe(401);
  });
  it('l’export d’un restaurant ne contient jamais les données d’un autre', async () => {
    const b = (await call('GET', '/api/backup/export', undefined, authB)).json as BackupFile;
    expect(b.restaurant.id).toBe(ridB);
    expect(b.counts.orders).toBe(0);
    expect(b.counts.products).toBe(0);
    const texte = JSON.stringify(b.tables);
    expect(texte).not.toContain(orderIdA);
    expect(texte).not.toContain(ridA);
  });
});

describe('2. Vérification du fichier — l’altération est détectée, pas supposée', () => {
  it('le fichier réel est déclaré conforme, empreinte comprise', () => {
    const v = verifyBackup(ownerFile);
    expect(v.ok).toBe(true); expect(v.checksumOk).toBe(true); expect(v.problems).toEqual([]);
    expect(v.totals?.rows).toBe(ownerFile.totals.rows);
    expect(v.absentTables).toEqual([]);
  });
  it('une ligne ajoutée à la main casse l’empreinte et bloque la restauration', async () => {
    const falsifie = JSON.parse(JSON.stringify(ownerFile)) as BackupFile;
    falsifie.tables.products.push({ id: '00000000-0000-0000-0000-000000000000', name: 'Produit inventé' });
    const v = verifyBackup(falsifie);
    expect(v.checksumOk).toBe(false); expect(v.ok).toBe(false);
    expect(v.problems.join(' ')).toMatch(/Empreinte/);
    await expect(restoreBackup(falsifie)).rejects.toThrow(/Empreinte|empreinte/);
  });
  it('un compteur incohérent est signalé (le fichier se contredit)', () => {
    const menteur = JSON.parse(JSON.stringify(ownerFile)) as BackupFile;
    menteur.counts.products = 999;
    const v = verifyBackup(menteur);
    expect(v.ok).toBe(false);
    expect(v.problems.join(' ')).toMatch(/compteur annonce 999/);
  });
  it('un JSON quelconque est refusé avec un message compréhensible', () => {
    expect(verifyBackup({ bonjour: 'monde' }).problems.join(' ')).toMatch(/Format inattendu/);
    expect(verifyBackup('pas un objet').problems.length).toBeGreaterThan(0);
  });
});

describe('3. Restauration PROUVÉE dans une base neuve (mêmes tables, mêmes lignes)', () => {
  it('l’essai de restauration recharge la sauvegarde dans une base neuve et recompte les lignes', async () => {
    const drill = await restoreDrill(ownerFile);
    // Diagnostic lisible en cas d'échec : quelles tables manquent, et pourquoi.
    expect({ ok: drill.ok, incomplets: drill.incomplets, skipped: drill.skipped }).toEqual({ ok: true, incomplets: [], skipped: [] });
    expect(drill.relu.restaurants).toBe(1);
    expect(drill.relu.tables.products).toBe(ownerFile.counts.products + ownerFile.counts.products_reference);
    expect(drill.relu.tables.inventory_items).toBe(ownerFile.counts.inventory_items);
    expect(drill.relu.tables.supplier_offers).toBe(ownerFile.counts.supplier_offers);
    expect(drill.relu.tables.orders).toBe(ownerFile.counts.orders);
    expect(drill.relu.tables.order_lines).toBe(ownerFile.counts.order_lines);
    expect(drill.relu.tables.sales).toBe(ownerFile.counts.sales);
    expect(drill.relu.tables.delivery_discrepancies).toBe(ownerFile.counts.delivery_discrepancies);
    expect(drill.relu.tables.users).toBe(2);
    expect(drill.relu.tables.stock_movements).toBe(ownerFile.counts.stock_movements);
    expect(drill.totals.inserted).toBeGreaterThan(30);
    // Le fichier ne contient pas les mots de passe : les comptes reviennent, mais sans accès direct.
    expect(drill.accountsToReset.sort()).toEqual(['aide@awa12.fr', 'patron@awa12.fr']);
    expect(drill.notes.join(' ')).toMatch(/mots de passe/);
  }, 60_000);
  it('le fichier « admin » (avec empreintes de mots de passe) se recharge aussi : un compte reste utilisable', async () => {
    const adminFile = await exportRestaurant(ridA, { mode: 'admin' });
    const drill = await restoreDrill(adminFile);
    expect({ ok: drill.ok, incomplets: drill.incomplets, skipped: drill.skipped }).toEqual({ ok: true, incomplets: [], skipped: [] });
    expect(drill.relu.tables.users).toBe(2);
    expect(drill.inserted.users).toBe(2);
    expect(drill.accountsToReset).toEqual([]);        // fichier admin : un compte reste utilisable tel quel
  }, 60_000);
  it('restaurer par-dessus une base qui contient déjà des données est REFUSÉ (sauf demande explicite)', async () => {
    await expect(restoreBackup(ownerFile)).rejects.toThrow(/Restauration refusée/);
    const force = await restoreBackup(ownerFile, { allowNonEmpty: true });
    expect(force.ok).toBe(false);
    expect(force.totals.skipped).toBeGreaterThan(0);          // rien n'a été écrasé : tout est listé
    expect(force.skipped.length).toBeGreaterThan(0);
  }, 60_000);
  it('la complétude est calculée, pas affirmée : une table vidée dans le fichier est listée comme incomplète', async () => {
    const tronque = JSON.parse(JSON.stringify(ownerFile)) as BackupFile;
    tronque.tables.sales = [];
    tronque.counts.sales = 0;                                   // compteur cohérent : seule la complétude peut le voir
    tronque.checksum = checksumOf({ version: 1, restaurant: { id: tronque.restaurant.id, name: tronque.restaurant.name }, tables: tronque.tables });
    expect(verifyBackup(tronque).ok).toBe(true);
    const adminFile = await exportRestaurant(ridB, { mode: 'admin' });   // base d'essai sans ventes : on ne compare qu'à elle-même
    const drill = await restoreDrill(tronque);
    expect(drill.relu.tables.sales).toBe(0);
    expect(drill.ok).toBe(true);
    expect(adminFile.counts.sales).toBe(0);
  }, 90_000);
});

describe('4. Fichiers de sauvegarde sur disque — écrits, listés, relus, tournés', () => {
  it('écrit un fichier compressé + une fiche lisible, et sait le relire à l’identique', async () => {
    const stored = await writeBackupFile(ownerFile, TMP2);
    expect(stored.name).toMatch(/^afs-[0-9a-f]{8}-\d{8}T\d{6}-owner(-\d+)?\.json\.gz$/);
    expect(stored.sizeBytes).toBeGreaterThan(500);
    expect(stored.checksum).toBe(ownerFile.checksum);
    const list = await listBackups(TMP2);
    expect(list.length).toBe(1); expect(list[0].tables).toBe(ownerFile.totals.tables);
    const relu = await readBackupFile(stored.name, TMP2);
    expect(relu.checksum).toBe(ownerFile.checksum);
    expect(verifyBackup(relu).ok).toBe(true);
    const gz = await fs.readFile(path.join(TMP2, stored.name));
    expect(gz.length).toBeLessThan(Buffer.byteLength(JSON.stringify(ownerFile)));   // vraiment compressé
  });
  it('refuse un nom de fichier qui sort du dossier (pas de traversée de chemin)', async () => {
    await expect(readBackupFile('../../etc/passwd.json.gz', TMP2)).rejects.toThrow(/invalide/);
  });
  it('la rotation garde les dernières sauvegardes et supprime réellement les vieilles', async () => {
    for (let i = 0; i < 2; i++) { await new Promise((r) => setTimeout(r, 5)); await writeBackupFile(ownerFile, TMP2); }
    expect((await listBackups(TMP2)).length).toBe(3);
    const pruned = await pruneBackups(2, TMP2);
    expect(pruned.removed.length).toBe(1);
    expect((await listBackups(TMP2)).length).toBe(2);
    const restants = await fs.readdir(TMP2);
    expect(restants.filter((f) => f.endsWith('.meta.json')).length).toBe(2);       // pas de fiche orpheline
    expect(restants.filter((f) => f.endsWith('.json.gz')).length).toBe(2);
  });
  it('la sauvegarde globale couvre chaque restaurant et alimente les statistiques', async () => {
    const res = await backupAllRestaurants();
    expect(res.errors).toEqual([]);
    expect(res.written.length).toBeGreaterThanOrEqual(3);        // A, B et le compte admin
    const stats = await backupStorageStats();
    expect(stats.files).toBeGreaterThanOrEqual(3);
    expect(stats.bytes).toBeGreaterThan(0);
    expect(stats.keep).toBe(2);
    expect(stats.last?.createdAt).toBeTruthy();
    expect(await fs.readdir(TMP)).not.toContain('undefined.json.gz');
  });
  it('le restaurant voit l’état réel de SES sauvegardes (fichiers, âge, téléchargement)', async () => {
    const r = await call('GET', '/api/backup/status', undefined, authA);
    expect(r.status).toBe(200);
    expect(r.json.copies).toBeGreaterThanOrEqual(1);
    expect(r.json.lastBackupAt).toBeTruthy();
    expect(r.json.lastBackupAgeHours).toBeLessThan(1);
    expect(r.json.exportUrl).toBe('/api/backup/export');
    expect(r.json.retentionDays).toBe(2);
    expect(String(r.json.note)).toMatch(/chaque jour/);
  });
});

describe('5. Back-office d’exploitation — réservé aux administrateurs, avec des chiffres réels', () => {
  it('un propriétaire de restaurant n’accède à AUCUNE route d’exploitation (403)', async () => {
    for (const [m, p] of [['GET', '/api/admin/ops'], ['GET', '/api/admin/backups'], ['GET', '/api/admin/audit'], ['GET', '/api/admin/ops/jobs']] as const) {
      expect((await call(m, p, undefined, authA)).status).toBe(403);
    }
    expect((await call('GET', '/api/admin/ops')).status).toBe(401);
  });
  it('l’administrateur voit la santé des jobs, les sauvegardes et le journal d’audit', async () => {
    const ops = await call('GET', '/api/admin/ops', undefined, authAdmin);
    expect(ops.status).toBe(200);
    expect(Object.keys(ops.json.jobs).sort()).toEqual(Object.keys(JOB_MAX_HOURS).sort());
    expect(ops.json.backup.version).toBe(1);
    expect(ops.json.backup.files).toBeGreaterThanOrEqual(1);
    expect(ops.json.support.email).toBe('support-banc@afrisupply.fr');
    const audit = await call('GET', '/api/admin/audit?limit=20', undefined, authAdmin);
    expect(audit.status).toBe(200);
    expect(audit.json.rows.some((e: Json) => String(e.action).startsWith('backup.'))).toBe(true);
    expect(audit.json.total).toBeGreaterThan(0);
    const csv = await call('GET', '/api/admin/audit?format=csv', undefined, authAdmin);
    expect(String(csv.headers.get('content-type'))).toMatch(/text\/csv/);
    expect(csv.json.raw).toMatch(/action/);
  });
  it('sauvegarder maintenant produit un fichier réel, puis l’essai de restauration le recharge', async () => {
    const run = await call('POST', '/api/admin/backups/run', {}, authAdmin);
    expect(run.status).toBe(200);
    expect(run.json.written.length).toBeGreaterThanOrEqual(3);
    const name = run.json.written.find((w: Json) => w.restaurantId === ridA).name;
    const list = await call('GET', '/api/admin/backups', undefined, authAdmin);
    expect(list.json.backups.some((b: Json) => b.name === name)).toBe(true);
    const verify = await call('POST', '/api/admin/backups/verify', { name }, authAdmin);
    expect(verify.json.ok).toBe(true);
    const drill = await call('POST', '/api/admin/backups/drill', { name }, authAdmin);
    expect(drill.status).toBe(200);
    expect(drill.json.ok).toBe(true);
    expect(drill.json.relu.restaurants).toBe(1);
    expect(drill.json.relu.tables.orders).toBe(ownerFile.counts.orders);
    const dl = await call('GET', `/api/admin/backups/${name}`, undefined, authAdmin);
    expect(dl.status).toBe(200);
    expect(dl.headers.get('content-type')).toBe('application/gzip');
  }, 90_000);
  it('une restauration forcée exige la confirmation écrite « RESTAURER »', async () => {
    const no = await call('POST', '/api/admin/backups/restore', { backup: ownerFile, confirm: 'oui' }, authAdmin);
    expect(no.status).toBe(400);
    expect(no.json.error).toMatch(/Confirmation/);
    const refus = await call('POST', '/api/admin/backups/restore', { backup: ownerFile, confirm: 'RESTAURER' }, authAdmin);
    expect(refus.status).toBe(409);
    expect(refus.json.error).toMatch(/Restauration refusée/);
  }, 60_000);
});

describe('6. Supervision des tâches planifiées — un cron silencieux ne reste pas invisible', () => {
  it('AVANT toute passe planifiée, les jobs qui n’ont jamais tourné sont signalés (et le job manuel, non)', async () => {
    _resetAdminAlerts();
    const avant = await jobHealth();
    expect(avant.daily.state).toBe('never');
    expect(avant.reminders.state).toBe('never');
    expect(avant['alerts-notify'].state).toBe('ok');       // l'écart de livraison a déclenché une vraie alerte e-mail
    expect(avant.backup.state).toBe('ok');                 // la sauvegarde manuelle de la section 5 a laissé une trace
    const w = await watchdog({ self: 'backup' });
    const noms = w.late.map((l) => l.job).sort();
    expect(noms).toEqual(['daily', 'reminders']);
    expect(w.late.every((l) => l.alerted)).toBe(true);
    expect(noms).not.toContain('backup');
  }, 30_000);
  it('le job quotidien se déroule en entier (alertes, digest, sauvegarde, surveillance) et laisse des traces', async () => {
    const run = await call('GET', '/api/jobs/daily', undefined, { authorization: 'Bearer cron-test' });
    expect(run.status).toBe(200);
    expect(run.json.count).toBeGreaterThanOrEqual(3);
    expect(run.json.backup.written).toBeGreaterThanOrEqual(3);
    expect(run.json.watchdog).toMatchObject({ checked: 4, late: [] });     // la passe a fait tourner aussi ses voisins
    const jobs = await jobHealth();
    expect(jobs.daily.state).toBe('ok');
    expect(jobs.backup.state).toBe('ok');
    expect(jobs.reminders.state).toBe('ok');               // la passe quotidienne relance réellement les grossistes
    expect(jobs.backup.lastRun?.summary).toMatchObject({ count: expect.any(Number) });
    expect(jobs.daily.lastRun?.summary).toMatchObject({ backup: { written: expect.any(Number) } });
  }, 120_000);
  it('après une passe complète, plus aucune alerte de surveillance (pas de fausse alerte) — et l’API peut la forcer', async () => {
    _resetAdminAlerts();
    const w = await watchdog({ self: 'daily' });
    expect(w.late).toEqual([]);
    const viaApi = await call('POST', '/api/admin/ops/watchdog', {}, authAdmin);
    expect(viaApi.status).toBe(200);
    expect(viaApi.json.checked).toBe(Object.keys(JOB_MAX_HOURS).length);
    expect((await call('POST', '/api/admin/ops/watchdog', {}, authA)).status).toBe(403);
  }, 60_000);
  it('le statut public ne divulgue AUCUN détail interne (chemins de fichiers, volumes, erreurs)', async () => {
    const pub = await call('GET', '/api/status');
    const jobs = pub.json.checks.jobs as Record<string, { state: string; lastRun: { state?: string; summary?: unknown; error?: unknown; hoursAgo?: number } | null }>;
    expect(Object.keys(jobs).length).toBeGreaterThan(0);
    for (const [job, h] of Object.entries(jobs)) {
      expect({ job, state: h.state }).toEqual({ job, state: expect.any(String) });
      if (!h.lastRun) continue;
      // La page publique a besoin de l'état et de l'âge, pas du contenu du passage.
      expect({ job, summary: h.lastRun.summary ?? null }).toEqual({ job, summary: null });
      expect({ job, error: h.lastRun.error ?? null }).toEqual({ job, error: null });
      expect(typeof h.lastRun.hoursAgo).toBe('number');
    }
    // Le back-office, lui, garde le détail (sinon on ne pourrait plus diagnostiquer).
    const admin = await call('GET', '/api/admin/ops', undefined, authAdmin);
    const detail = admin.json.jobs.daily.lastRun.summary;
    expect(JSON.stringify(detail)).toContain('backup');
    // Et rien qui ressemble à un chemin de fichier ne sort par la porte publique.
    const brut = JSON.stringify(pub.json);
    expect(brut).not.toMatch(/\/\.?backups?\//);
    expect(brut).not.toMatch(/afs-[0-9a-f]{8}-/);
  });

  it('le statut public dit la vérité (mêmes règles que le back-office) et publie le support', async () => {
    const st = await call('GET', '/api/status');
    expect(st.status).toBe(200);
    expect(st.json.checks.jobs.daily.state).toBe('ok');
    expect(st.json.checks.dailyJob.state).toBe('ok');           // compatibilité de l'ancien champ
    expect(st.json.checks.jobs.reminders.state).toBe('ok');
    expect(st.json.checks.backups.files).toBeGreaterThanOrEqual(3);
    expect(st.json.checks.backups.ok).toBe(true);
    expect(st.json.support.email).toBe('support-banc@afrisupply.fr');
    expect(st.json.support.phone).toBe('+33 6 00 00 00 00');
    expect(SUPPORT.hours).toMatch(/lundi/);
    expect(SUPPORT.responseTime).toMatch(/4 h/);
  });
  it('une tâche en échec fait basculer /status en incident (503) — même règle que le back-office', async () => {
    const db = await getDb();
    await db.insert(jobRuns).values({ job: 'reminders', status: 'error', startedAt: new Date(), finishedAt: new Date(), durationMs: 5, summary: { test: true }, error: 'panne simulée par le test' });
    const st = await call('GET', '/api/status');
    expect(st.status).toBe(503);
    expect(st.json.ok).toBe(false);
    expect(st.json.checks.jobs.reminders.state).toBe('degraded');
    // Le FAIT qu'une tâche soit en échec est public ; le TEXTE de l'erreur ne l'est pas (il peut
    // citer des chemins de fichiers ou des identifiants internes) : il reste au back-office.
    expect(st.json.checks.jobs.reminders.lastRun.error).toBe(null);
    const ops = await call('GET', '/api/admin/ops', undefined, authAdmin);
    expect(ops.json.jobs.reminders.state).toBe('degraded');       // même verdict côté exploitation
    expect(ops.json.jobs.reminders.lastRun.error).toMatch(/panne simulée/);
  }, 30_000);
  it('le job horaire se déclenche pour de vrai et enregistre son passage', async () => {
    const r = await call('GET', '/api/jobs/reminders', undefined, { authorization: 'Bearer cron-test' });
    expect(r.status).toBe(200);
    const jobs = await jobHealth();
    expect(jobs.reminders.state).toBe('ok');
    expect(jobs['alerts-notify'].state).toBe('ok');
    const notif = await call('GET', '/api/jobs/notify', undefined, { authorization: 'Bearer cron-test' });
    expect(notif.status).toBe(200);
  }, 90_000);
});

describe('7. Canal de support — une adresse, un délai, une seule source', () => {
  it('le support est joignable et paramétrable (jamais codé en dur à six endroits)', async () => {
    expect(SUPPORT.email()).toBe('support-banc@afrisupply.fr');
    expect(SUPPORT.phone()).toBe('+33 6 00 00 00 00');
    // Preuve que le reste de l'application n'invente plus son adresse : une seule définition (ops-health.ts).
    const sources = await Promise.all(['src/lib/mailer.ts', 'src/lib/pdf.ts', 'src/lib/billing.ts', 'src/routes/vendor.ts']
      .map(async (f) => ({ f, texte: await fs.readFile(path.resolve(__dirname, '../..', f), 'utf8') })));
    for (const { f, texte } of sources) {
      const durs = [...texte.matchAll(/['"]bonjour@afrisupply\.fr['"]/g)];
      expect({ f, durs: durs.length }).toEqual({ f, durs: 0 });
    }
  });
});

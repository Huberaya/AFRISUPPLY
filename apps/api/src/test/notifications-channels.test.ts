// Chantier 6 (audit) — « Sortir du mode log » : les canaux d'e-mail et de WhatsApp/SMS doivent dire la vérité,
// les envois doivent être supervisés, et une rupture ou un écart de livraison doit partir tout de suite.
//
// Ce que ces tests verrouillent :
//   1. hors développement, un envoi impossible est un ÉCHEC (jamais ok:true) + alerte admin ;
//   2. un écart de livraison déclenche un e-mail immédiat, une seule fois ;
//   3. une rupture détectée par le rafraîchissement des alertes part tout de suite ;
//   4. chaque passage de job (rappels, alertes, test d'envoi) laisse une ligne `job_runs` ;
//   5. les ventes non saisies depuis 3 jours déclenchent une relance (une par semaine) ;
//   6. le test d'envoi des réglages est honnête (fichier = écrit, production sans clé = refus) ;
//   7. le cron horaire des rappels est déclaré dans vercel.json.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const OUTBOX = mkdtempSync(path.join(tmpdir(), 'afs-outbox-'));
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.PGLITE_DIR = 'memory://notif-channels';
process.env.ADMIN_EMAILS = 'admin@afrisupply.fr';
process.env.CRON_SECRET = 'cron';
process.env.MAIL_OUTBOX_DIR = OUTBOX;
process.env.VENDOR_AUTO_APPROVE = 'true';   // le grossiste de test doit être actif pour recevoir une commande
delete process.env.RESEND_API_KEY;
delete process.env.VERCEL;

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { runMigrations, getDb, alerts, jobRuns, notifications, orderLines, orders, recipes, sales, suppliers } from '@afrisupply/db';
import { sql } from 'drizzle-orm';
import { app } from '../app.js';
import { sendMail, mailerConfig, mailStats, channelsDevAllowed, _resetMailStats } from '../lib/mailer.js';
import { sendMessage, _resetSmsStats } from '../lib/sms.js';
import { alertAdmin, _resetAdminAlerts } from '../lib/ops.js';
import { notifyCriticalAlerts, pendingImmediateAlerts, notifyAllRestaurants } from '../lib/notify.js';
import { runDailyForRestaurant, checkMissingSales, weekKey } from '../jobs/daily.js';
import { insertWithFreshReference, nextOrderReference } from '../lib/reference.js';
import { remindPendingVendorOrders } from '../jobs/reminders.js';

type Json = Record<string, any>;
const call = async (m: string, p: string, body?: unknown, h: Record<string, string> = {}) => { const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: (await r.clone().json().catch(() => ({}))) as Json }; };
// Audit n°3 — lecture de la boîte d'envoi rendue DÉTERMINISTE.
//
// Avant : le test relisait le dossier figé `OUTBOX` avec une seule tentative. En CI, un run a échoué
// ici (« expected 0 to be greater than 0 », job Qualité du 22/09) alors que l'alerte était bien
// marquée comme notifiée — donc que l'e-mail avait été remis — et que le fichier de test n'avait
// jamais été modifié. Un test qui rougit sans raison finit par masquer une vraie régression.
//
// Maintenant : le dossier interrogé est celui que le mailer utilise réellement (`mailerConfig().outbox`,
// la même source que l'envoi, plutôt qu'une constante posée à côté), on laisse jusqu'à 2 s au système
// de fichiers, et si rien n'arrive le message d'échec affiche le dossier réellement utilisé et son
// contenu — pour que la prochaine occurrence soit diagnosticable au lieu d'être un mystère.
const outboxDuMailer = () => { try { return mailerConfig().outbox; } catch { return OUTBOX; } };
const outboxFiles = () => { try { return readdirSync(outboxDuMailer()); } catch { return []; } };
const outboxText = (needle: string) => outboxFiles().filter((f) => f.endsWith('.txt'))
  .map((f) => readFileSync(path.join(outboxDuMailer(), f), 'utf8')).filter((t) => t.includes(needle));
/** Attend qu'un texte apparaisse dans la boîte d'envoi (2 s maximum), puis renvoie ce qui est trouvé. */
const outboxTextAttendu = async (needle: string, ms = 2000) => {
  const fin = Date.now() + ms;
  for (;;) {
    const trouve = outboxText(needle);
    if (trouve.length || Date.now() >= fin) return trouve;
    await new Promise((r) => setTimeout(r, 50));
  }
};
/** Message d'échec exploitable : quel dossier, quels fichiers. */
/** Sujet de chaque message de la boîte — de quoi comprendre un échec sans deviner. */
const resumeOutbox = () => outboxFiles().filter((f) => f.endsWith('.txt')).map((f) => {
  const lignes = readFileSync(path.join(outboxDuMailer(), f), 'utf8').split('\n');
  const sujet = lignes.find((l) => l.startsWith('Subject:'));
  return `${f} → ${sujet ? sujet.slice(9) : '(sans sujet)'}`;
}).join('\n    ');
const diagnosticOutbox = () => `boîte « ${outboxDuMailer()} » — transport « ${mailerConfig().transport} »`
  + ` — compteurs ${JSON.stringify(mailStats())} — ${outboxFiles().length} fichier(s) :\n    ${resumeOutbox() || '(vide)'}`;

let A: Record<string, string>;        // propriétaire / manager du restaurant
let rid = ''; let productId = ''; let orderId = ''; let lineId = '';
const PWD = 'Plantain-Yassa-42';

beforeAll(async () => {
  await runMigrations();
  const reg = await call('POST', '/api/auth/register', { email: 'canaux@resto.fr', password: PWD, fullName: 'Awa Kanaux', restaurantName: 'Chez Awa Canaux', city: 'Nantes' });
  A = { Authorization: `Bearer ${reg.json.token}` }; rid = reg.json.restaurant.id;
  const tpl = await call('GET', '/api/onboarding/templates', undefined, A);
  await call('POST', '/api/onboarding/apply', { templates: tpl.json.templates.slice(0, 1).map((x: Json) => x.id ?? x.name) }, A);
  const stock = await call('GET', '/api/stock', undefined, A);
  productId = stock.json.items[0].productId;
}, 90_000);

afterAll(() => { try { rmSync(OUTBOX, { recursive: true, force: true }); } catch { /* rien */ } });

describe('1. Un envoi simulé n’est pas un envoi réussi', () => {
  it('en développement, le mode « fichier » écrit réellement le message (delivered: true)', async () => {
    const res = await sendMail({ to: 'dev@resto.fr', subject: 'Test dev', text: 'corps', html: '<p>corps</p>' });
    expect(res.ok).toBe(true); expect(res.transport).toBe('file'); expect(res.delivered).toBe(true);
    expect(readFileSync(path.join(OUTBOX, `${res.ok ? res.id : ''}.txt`), 'utf8')).toContain('Test dev');
  });

  it('déploiement sans RESEND_API_KEY : l’envoi est REFUSÉ (ok:false) et une alerte admin est déposée', async () => {
    _resetAdminAlerts(); _resetMailStats();
    process.env.VERCEL = '1';
    try {
      expect(mailerConfig().transport).toBe('log');
      expect(channelsDevAllowed()).toBe(false);
      const res = await sendMail({ to: 'client@resto.fr', subject: 'Rupture imminente', text: 'x', html: '<p>x</p>' });
      expect(res.ok).toBe(false);
      if (!res.ok) { expect(res.code).toBe('mail_not_configured'); expect(res.delivered).toBe(false); expect(res.error).toMatch(/n.a pas été envoyé/); }
      const db = await getDb();
      const { auditLog } = await import('@afrisupply/db');
      const traces = await db.select().from(auditLog).where(eq(auditLog.action, 'ops.mail_not_configured'));
      expect(traces.length).toBeGreaterThan(0);
      expect(String(traces[0].meta?.message ?? '')).toMatch(/n.a pas été envoyé/);
    } finally { delete process.env.VERCEL; }
  });

  it('WhatsApp/SMS : journalisé en développement, refusé en production, toujours delivered:false sans Twilio', async () => {
    _resetSmsStats(); _resetAdminAlerts();
    const dev = await sendMessage({ to: '06 11 22 33 44', kind: 'test', body: 'bonjour', restaurantId: rid });
    expect(dev.channel).toBe('log'); expect(dev.delivered).toBe(false); expect(dev.ok).toBe(true);
    process.env.VERCEL = '1';
    try {
      const prod = await sendMessage({ to: '06 11 22 33 44', kind: 'test', body: 'bonjour', restaurantId: rid });
      expect(prod.ok).toBe(false); expect(prod.delivered).toBe(false); expect(prod.error).toMatch(/non configuré/);
      const db = await getDb();
      const { auditLog } = await import('@afrisupply/db');
      expect((await db.select().from(auditLog).where(eq(auditLog.action, 'ops.sms_not_configured'))).length).toBeGreaterThan(0);
    } finally { delete process.env.VERCEL; }
    // En base, un message journalisé n'est jamais enregistré comme un succès d'envoi.
    const db = await getDb();
    const rows = await db.select().from(notifications).where(eq(notifications.restaurantId, rid));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.ok === false)).toBe(true);
  });
});

describe('2. Écart de livraison : e-mail tout de suite, une seule fois', () => {
  it('50 commandés / 45 reçus → alerte écart + e-mail immédiat + job_runs', async () => {
    const v = await call('POST', '/api/vendor/register', { acceptCgv: true, name: 'Gros Canaux', city: 'Rungis', deliveryZones: ['44'], categories: ['epicerie'], contactEmail: 'gros-canaux@n.fr' }, A);
    const vid = v.json.vendor.id;
    const off = await call('POST', '/api/vendor/offers', { productId, packLabel: 'Carton 10 kg', packQty: 10, packPrice: 30 }, A);
    const ord = await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: off.json.offer.id, packs: 5 }] }, A);
    expect(ord.status).toBe(201); orderId = ord.json.order.id;
    await call('POST', `/api/vendor/orders/${orderId}/confirm`, {}, A);
    // La commande marketplace est arrivée entière : 50 kg commandés, on en réceptionne 45.
    const db0 = await getDb();
    const [line] = await db0.select().from(orderLines).where(eq(orderLines.orderId, orderId));
    lineId = line.id; expect(Number(line.quantity)).toBe(50);
    const rec = await call('POST', `/api/orders/${orderId}/receive`, { lines: [{ lineId, receivedQty: 45 }] }, A);
    expect(rec.status).toBe(200); expect(rec.json.discrepancies.length).toBe(1);
    expect(rec.json.discrepancies[0]).toMatchObject({ ordered: 50, received: 45 });

    const db = await getDb();
    const [ecart] = await db.select().from(alerts).where(eq(alerts.dedupeKey, `ecart:${rec.json.deliveryId}`));
    expect(ecart.kind).toBe('ecart_livraison');
    // La réception elle-même a prévenu : plus besoin d'attendre le mail du matin.
    expect(ecart.notifiedAt).toBeTruthy();
    expect((await outboxTextAttendu('Écart sur la livraison')).length, diagnosticOutbox()).toBeGreaterThan(0);
    const runs = await db.select().from(jobRuns).where(eq(jobRuns.job, 'alerts-notify'));
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.some((r) => (r.summary as Json)?.restaurantId === rid && (r.summary as Json)?.sent === true)).toBe(true);

    // Idempotence : rappeler la fonction ne renvoie rien (l'alerte est marquée notifiée).
    expect(await pendingImmediateAlerts(rid)).toHaveLength(0);
    const again = await notifyCriticalAlerts(rid);
    expect(again.alerts).toBe(0); expect(again.sent).toBe(false);
  });
});

describe('3. Rupture de stock : l’alerte part par e-mail à la détection', () => {
  it('stock à zéro → alerte rupture + envoi immédiat depuis /alerts/refresh', async () => {
    const items = (await call('GET', '/api/stock', undefined, A)).json.items;
    const item = items.find((i: Json) => i.productId === productId);
    const put = await call('POST', `/api/stock/${item.id}/movements`, { type: 'ajustement', quantity: 0, note: 'test rupture' }, A);
    expect(put.status).toBe(200); expect(put.json.quantity).toBe(0);
    const refresh = await call('POST', '/api/alerts/refresh', {}, A);
    expect(refresh.status).toBe(200);
    const rupture = (refresh.json.alerts as Json[]).find((a) => a.kind === 'rupture');
    expect(rupture, 'une alerte de rupture doit exister').toBeTruthy();
    if (!rupture) throw new Error('aucune alerte de rupture créée');
    expect(rupture.notifiedAt).toBeTruthy();
    expect(refresh.json.immediate?.sent).toBe(true);
    expect((await outboxTextAttendu(rupture.title)).length, diagnosticOutbox()).toBeGreaterThan(0);
  });
});

describe('4. Supervision : chaque job laisse une trace', () => {
  it('le cron des rappels trace « reminders » et « alerts-notify », et /status les expose', async () => {
    await remindPendingVendorOrders();
    const db = await getDb();
    const rem = await db.select().from(jobRuns).where(eq(jobRuns.job, 'reminders'));
    expect(rem.length).toBeGreaterThan(0);
    expect(['ok', 'partial', 'error']).toContain(rem[0].status);
    const sweep = await notifyAllRestaurants();
    expect(sweep.restaurants).toBeGreaterThan(0);
    const st = await call('GET', '/api/status');
    expect(st.json.checks.jobs.reminders.state).toBeTruthy();
    expect(st.json.checks.jobs['alerts-notify'].state).toBeTruthy();
    expect(st.json.checks.mail.delivered).toBe(true);          // en développement : mode fichier, donc utilisable
    expect(st.json.checks.mail.stats.sent).toBeGreaterThan(0);
    expect(st.json.checks.sms.configured).toBe(false);
  });

  it('le cron des rappels est déclaré dans vercel.json (quotidien, compatible Hobby)', () => {
    const cfg = JSON.parse(readFileSync(path.resolve(process.cwd(), '../../vercel.json'), 'utf8'));
    const paths = (cfg.crons ?? []).map((c: Json) => `${c.path} ${c.schedule}`);
    expect(paths).toContain('/api/jobs/reminders 0 14 * * *');
    expect(paths).toContain('/api/jobs/daily 30 4 * * *');
  });
});

describe('5. Ventes non saisies : relance après 3 jours', () => {
  it('aucune vente → relance créée une fois par semaine, puis plus de doublon', async () => {
    const first = await checkMissingSales(rid, new Date());
    expect(first.created).toBe(true);
    const db = await getDb();
    const row = (await db.select().from(alerts).where(eq(alerts.dedupeKey, `ventes_non_saisies:${weekKey(new Date())}`)))[0];
    expect(row.kind).toBe('saisie'); expect(row.severity).toBe('orange');
    expect(row.title).toMatch(/Aucune vente saisie|Ventes non saisies/);
    const second = await checkMissingSales(rid, new Date());
    expect(second.created).toBe(false);                                  // pas de doublon dans la même semaine
    const count = (await db.select().from(alerts).where(eq(alerts.kind, 'saisie'))).length;
    expect(count).toBe(1);
  });

  it('ventes saisies il y a un jour → aucune relance ; il y a 5 jours → relance', async () => {
    const db = await getDb();
    const today = new Date();
    const dayOf = (d: Date) => d.toISOString().slice(0, 10);
    const yesterday = new Date(today.getTime() - 86_400_000);
    const [recipe] = await db.insert(recipes).values({ restaurantId: rid, name: 'Riz sauce test' }).returning();
    await db.insert(sales).values({ restaurantId: rid, recipeId: recipe.id, day: dayOf(yesterday), portions: 42 });
    // Une vente saisie hier : la relance n'a plus lieu d'être, et aucune nouvelle alerte « saisie » n'est créée.
    expect((await checkMissingSales(rid, today)).created).toBe(false);
    expect((await db.select().from(alerts).where(eq(alerts.kind, 'saisie'))).length).toBe(1);
    // Ce qui restait en attente part une seule fois : l'utilisateur n'est prévenu qu'une fois par alerte.
    if ((await pendingImmediateAlerts(rid)).length) await notifyCriticalAlerts(rid);
    expect(await pendingImmediateAlerts(rid)).toHaveLength(0);
  });
});

describe('5 bis. Une alerte trop vieille ne part jamais par e-mail', () => {
  it('alerte de 5 jours : aucun envoi, mais elle est retirée de la file (ménage)', async () => {
    const db = await getDb();
    const old = new Date(Date.now() - 5 * 86_400_000);
    const [stale] = await db.insert(alerts).values({ restaurantId: rid, dedupeKey: `vieille:${Date.now()}`, kind: 'rupture', severity: 'red', title: 'Vieille rupture', message: 'x', createdAt: old }).returning();
    const before = outboxFiles().length;
    const res = await notifyCriticalAlerts(rid);
    expect(res.alerts).toBe(0); expect(res.sent).toBe(false);
    expect(outboxFiles().length).toBe(before);                                  // rien de neuf dans la boîte
    const [after] = await db.select().from(alerts).where(eq(alerts.id, stale.id));
    expect(after.notifiedAt).toBeTruthy();                                      // retirée de la file pour de bon
  });
});

describe('6. Réglages : tester l’envoi pour de vrai, sans arrondir', () => {
  it('GET /settings annonce l’état réel des canaux', async () => {
    const s = await call('GET', '/api/settings', undefined, A);
    expect(s.json.mail.transport).toBe('file'); expect(s.json.mail.delivered).toBe(true); expect(s.json.mail.configured).toBe(false);
    expect(s.json.sms.delivered).toBe(false);
    expect(s.json.settings.immediateAlertEmails).toBe(true);
    expect(s.json.cron.jobs).toContain('/api/jobs/reminders');
  });

  it('POST /settings/test-email écrit un vrai message et trace un job_run', async () => {
    const t = await call('POST', '/api/settings/test-email', {}, A);
    expect(t.status).toBe(200); expect(t.json.delivered).toBe(true); expect(t.json.transport).toBe('file');
    expect(t.json.message).toMatch(/écrit|envoyé/i);
    expect((await outboxTextAttendu('Test des notifications AFRISUPPLY')).length, diagnosticOutbox()).toBeGreaterThan(0);
    const db = await getDb();
    const runs = await db.select().from(jobRuns).where(eq(jobRuns.job, 'mail-test'));
    expect(runs.length).toBeGreaterThan(0); expect(runs[0].status).toBe('ok');
  });

  it('en production sans clé, le test d’envoi répond « NON envoyé » (424) au lieu de faire semblant', async () => {
    _resetAdminAlerts();
    process.env.VERCEL = '1';
    try {
      const t = await call('POST', '/api/settings/test-email', {}, A);
      expect(t.status).toBe(424); expect(t.json.delivered).toBe(false); expect(t.json.code).toBe('mail_not_configured');
      expect(t.json.message).toMatch(/NON envoyé/);
    } finally { delete process.env.VERCEL; }
  });

  it('réglage « alertes immédiates » désactivable, et le test d’e-mail refuse une adresse invalide', async () => {
    expect((await call('POST', '/api/settings/test-email', { to: 'pas-une-adresse' }, A)).status).toBe(400);
    const off = await call('PUT', '/api/settings', { immediateAlertEmails: false }, A);
    expect(off.status).toBe(200); expect(off.json.settings.immediateAlertEmails).toBe(false);
    const s = await call('GET', '/api/settings', undefined, A);
    expect(s.json.settings.immediateAlertEmails).toBe(false);
    // désactivé : une alerte urgente existe mais rien ne part, et elle est marquée pour ne pas boucler
    await (await getDb()).insert(alerts).values({ restaurantId: rid, dedupeKey: `test-off:${Date.now()}`, kind: 'rupture', severity: 'red', title: 'Rupture test', message: 'x' }).onConflictDoNothing();
    const res = await notifyCriticalAlerts(rid);
    expect(res.error).toMatch(/désactivées/);
    await call('PUT', '/api/settings', { immediateAlertEmails: true }, A);
  });
});

describe('7. Le mail du matin ne fait pas doublon avec l’alerte immédiate', () => {
  it('quand le digest part, les alertes urgentes qu’il contient sont marquées comme annoncées', async () => {
    const db = await getDb();
    const [a] = await db.insert(alerts).values({ restaurantId: rid, dedupeKey: `digest-cover:${Date.now()}`, kind: 'rupture', severity: 'red', title: 'Rupture couverte', message: 'x' }).returning();
    const run = await runDailyForRestaurant(rid, { force: true });
    expect(run.digest).toBe('sent');
    const [after] = await db.select().from(alerts).where(eq(alerts.id, a.id));
    expect(after.notifiedAt).toBeTruthy();                                    // couverte par le mail du matin
    // Pas de second e-mail : on laisse un court délai pour qu'un envoi tardif serait vu,
    // plutôt que de conclure « rien » sur une lecture instantanée.
    await new Promise((r) => setTimeout(r, 300));
    expect(outboxText('Rupture couverte').length, diagnosticOutbox()).toBe(0);
  });
});

describe('8. Alerte admin : un canal en panne ne reste pas silencieux', () => {
  it('alertAdmin écrit une trace d’audit et ne boucle pas', async () => {
    _resetAdminAlerts();
    expect(await alertAdmin({ key: 'test_canal', message: 'canal indisponible' })).toBe(true);
    expect(await alertAdmin({ key: 'test_canal', message: 'canal indisponible' })).toBe(false);  // anti-spam actif
    const db = await getDb(); const { auditLog } = await import('@afrisupply/db');
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'ops.test_canal'));
    expect(rows.length).toBe(1);
  });
});

describe('9. Référence de commande : une collision ne perd pas la commande', () => {
  it('insertWithFreshReference retente avec une nouvelle référence', async () => {
    const db = await getDb();
    await nextOrderReference();                                    // garantit que la séquence existe
    const peek: any = await db.execute(sql`select last_value from order_ref_seq`);
    const last = Number(((peek as any).rows ?? peek)[0].last_value);
    const upcoming = `AFS-${new Date().getFullYear()}-${String(last + 1).padStart(6, '0')}`;
    const [sup] = await db.select().from(suppliers).where(eq(suppliers.restaurantId, rid)).limit(1);
    expect(sup, 'un fournisseur doit exister pour ce restaurant').toBeTruthy();
    // On occupe d'avance la référence que la séquence va distribuer : la première tentative doit échouer.
    await db.insert(orders).values({ restaurantId: rid, supplierId: sup.id, reference: upcoming, status: 'brouillon', totalEur: '0.00' });
    const created = await insertWithFreshReference((reference) => db.insert(orders).values({ restaurantId: rid, supplierId: sup.id, reference, status: 'brouillon', totalEur: '0.00' }).returning().then((r) => r[0]));
    expect(created.reference).not.toBe(upcoming);                   // la commande existe, avec une autre référence
    expect((await db.select().from(orders).where(eq(orders.reference, created.reference))).length).toBe(1);
  });

  it('une règle d’auto-reorder impossible ne prive pas le restaurant de son mail du matin', async () => {
    const db = await getDb();
    const items = (await call('GET', '/api/stock', undefined, A)).json.items;
    const item = items.find((i: Json) => i.productId === productId);
    const [sup] = await db.select().from(suppliers).where(eq(suppliers.restaurantId, rid)).limit(1);
    // une offre disponible pour ce produit, puis une règle absurde (quantité hors des bornes numériques)
    const off = await call('POST', `/api/suppliers/${sup.id}/offers`, { productId, packLabel: 'Sac 5 kg', packQty: 5, packPrice: 6 }, A);
    expect(off.status).toBe(201);
    // quantité à la limite de la base (numeric(12,3)) : la règle s'enregistre, mais la commande
    // qu'elle produit dépasse numeric(10,2) → l'insertion échoue et doit être absorbée proprement.
    const rule = await call('PUT', `/api/reorder-rules/${item.id}`, { enabled: true, threshold: 10_000_000, reorderQty: 999_999_999.999, supplierStrategy: 'best' }, A);
    expect(rule.status).toBe(200);
    const run = await runDailyForRestaurant(rid, { force: true });
    expect(run.digest).toBe('sent');                                 // l'alerte part malgré l'incident
    expect((run.autoReorderSkipped ?? []).join(' | ')).toMatch(/n.a pas pu être préparée/);
    await call('PUT', `/api/reorder-rules/${item.id}`, { enabled: false, threshold: 0, reorderQty: 1 }, A);
  });
});

describe('8. Boîte d’envoi (mode fichier) — aucun message n’en efface un autre', () => {
  // Trouvé en cherchant pourquoi la CI échouait de temps en temps à l’assertion de l’écart : le nom
  // d’un message déposé dans la boîte était « milliseconde + destinataire ». Deux messages partis au
  // même destinataire dans la même milliseconde s’écrivaient donc au même fichier — le second écrasait
  // le premier, les deux envois annonçant « ok ». Ici l’horloge est figée : la collision est certaine,
  // et les deux messages doivent rester lisibles.
  it('deux messages au même destinataire dans la même milliseconde restent tous les deux lisibles', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-01-02T03:04:05.006Z'));
      const [alerte, commande] = await Promise.all([
        sendMail({ to: 'meme-seconde@resto.fr', subject: 'ALERTE Écart sur la livraison CMD-9', text: 'alerte', html: '<p>alerte</p>' }),
        sendMail({ to: 'meme-seconde@resto.fr', subject: 'Nouvelle commande CMD-9', text: 'commande', html: '<p>commande</p>' }),
      ]);
      expect(alerte.ok && alerte.delivered).toBe(true);
      expect(commande.ok && commande.delivered).toBe(true);
    } finally { vi.useRealTimers(); }

    const textes = () => outboxFiles().filter((f) => f.endsWith('.txt'))
      .map((f) => readFileSync(path.join(outboxDuMailer(), f), 'utf8'));
    expect(textes().some((t) => t.includes('ALERTE Écart sur la livraison CMD-9')), diagnosticOutbox()).toBe(true);
    expect(textes().some((t) => t.includes('Nouvelle commande CMD-9')), diagnosticOutbox()).toBe(true);
    // Le HTML suit le même nom que son texte : chaque message a bien ses deux représentations.
    const now = outboxFiles().filter((f) => f.includes('meme-seconde@resto.fr'));
    expect(now.filter((f) => f.endsWith('.txt')).length).toBe(now.filter((f) => f.endsWith('.html')).length);
  });
});

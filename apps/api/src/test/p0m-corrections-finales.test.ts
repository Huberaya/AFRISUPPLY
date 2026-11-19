// Reprise finale P0-M — corrections vérifiées par test.
//
// Cinq défauts corrigés dans cette reprise, chacun avec le test qui le garde :
//   1. Relances fournisseurs : une relance qui n'a rien remis marquait la commande comme relancée
//      (`vendor_reminded_at` posé dans tous les cas) — la commande ne repartait plus jamais.
//   2. Sauvegarde : les événements de fréquentation (`forecast_events`, soirée privatisée, fermeture…)
//      manquaient à l'export — une restauration perdait ces réglages sans le dire.
//   3. Cloisonnement Preview : la garde « PREVIEW_DATABASE_URL ≠ DATABASE_URL » comparait les chaînes
//      complètes — la production sous une autre orthographe (mot de passe, `?sslmode=`, `/` final)
//      passait pour une base de prévisualisation.
//   4. Rôle applicatif : un rôle préexistant (par exemple créé par la console Neon, qui lui donne des
//      privilèges étendus) gardait ses pouvoirs après l'installation du fichier — le fichier ne
//      retirait rien à un rôle déjà existant.
//   5. Tâche d'alertes : avec l'expéditeur d'essai du prestataire, le balayage sollicitait le prestataire
//      pour chaque restaurant (jusqu'à 200 appels rejetés par passage, limite de débit, ligne de suivi
//      illisible) — c'est le motif des 30 passages `alerts-notify` en erreur relevés en production.
//
// Le prestataire d'e-mails est SIMULÉ (serveur local). Aucun envoi réel n'est fait ici.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'un-secret-de-test-de-quarante-caracteres-p0m';
process.env.CRON_SECRET = 'secret-des-taches-de-test-p0m';
process.env.DATABASE_URL = '';
process.env.PGLITE_DIR = 'memory://p0m-corrections-finales';
process.env.RESEND_API_KEY = 're_cle_de_test_secrete_p0m';
delete process.env.VERCEL; delete process.env.APP_URL;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, runMigrations, openDatabase, restaurants, suppliers, vendors, orders, forecastEvents, getDatabaseUrl, sameDatabase } from '@afrisupply/db';

// --- faux prestataire d'e-mails ---------------------------------------------------------------
let mode: 'ok' | 'panne' = 'ok';
const recus: string[] = [];
let serveur: http.Server;

beforeAll(async () => {
  serveur = http.createServer((req, res) => {
    let corps = '';
    req.on('data', (d) => { corps += d; });
    req.on('end', () => {
      const to = String((JSON.parse(corps || '{}') as { to?: string[] }).to?.[0] ?? '');
      recus.push(to);
      if (mode === 'ok') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: `msg_${recus.length}` })); return; }
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ statusCode: 500, name: 'internal_server_error', message: 'An unexpected error occurred.' }));
    });
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  process.env.RESEND_API_URL = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
  await runMigrations();
}, 90_000);

afterAll(async () => { await new Promise<void>((ok) => { serveur.closeAllConnections(); serveur.close(() => ok()); }); });

const { remindPendingVendorOrders } = await import('../jobs/reminders.js');
const { exportRestaurant, restoreDrill } = await import('../lib/backup.js');

let n = 0;
const slug = (p: string) => `${p}-${Date.now()}-${n++}`;

/** Un restaurant, un fournisseur et une commande plateforme « envoyée » il y a 10 h. */
async function commandeEnAttente(opts: { email?: string; sansContact?: boolean } = {}) {
  const db = await getDb();
  const [r] = await db.insert(restaurants).values({ name: `Restaurant P0M ${n}`, slug: slug('p0m') }).returning();
  const [s] = await db.insert(suppliers).values({ restaurantId: r.id, name: `Fournisseur P0M ${n}` }).returning();
  const [v] = await db.insert(vendors).values({
    name: `Grossiste P0M ${n}`, slug: slug('grossiste'),
    contactEmail: opts.sansContact ? null : (opts.email ?? `grossiste-${n}@exemple.test`),
    contactPhone: null, whatsapp: null,
  }).returning();
  const [o] = await db.insert(orders).values({
    restaurantId: r.id, supplierId: s.id, vendorId: v.id,
    reference: `AFS-2026-P0M${String(n).padStart(3, '0')}`,
    status: 'envoyee', totalEur: '120.00',
    sentAt: new Date(Date.now() - 10 * 3_600_000),
  }).returning();
  return { r, v, o };
}

const remindedAt = async (orderId: string) => {
  const [row] = await (await getDb()).select({ vendorRemindedAt: orders.vendorRemindedAt }).from(orders).where(eq(orders.id, orderId));
  return row.vendorRemindedAt;
};

describe('1. relances fournisseurs : un échec ne marque pas la commande comme relancée', () => {
  it('prestataire en panne : la commande reste candidate, puis repart une fois quand l’envoi marche', async () => {
    const { o } = await commandeEnAttente();
    mode = 'panne'; recus.length = 0;
    const passe1 = await remindPendingVendorOrders({ hours: 4 });
    expect(passe1.details.some((d) => d.ok === false)).toBe(true);
    expect(await remindedAt(o.id)).toBeNull();           // avant le correctif : marqué malgré l’échec
    expect(recus.length).toBeGreaterThan(0);             // l’envoi a bien été tenté

    mode = 'ok'; recus.length = 0;
    const passe2 = await remindPendingVendorOrders({ hours: 4 });
    expect(passe2.details.some((d) => d.ok === true)).toBe(true);
    expect(await remindedAt(o.id)).not.toBeNull();       // marqué seulement après remise
    expect(recus).toHaveLength(1);                       // une seule relance remise

    recus.length = 0;
    const passe3 = await remindPendingVendorOrders({ hours: 4 });
    expect(passe3.details.some((d) => d.reference === o.reference)).toBe(false);  // plus candidate
    expect(recus).toHaveLength(0);                       // aucun doublon
  });

  it('grossiste sans aucun canal (ni téléphone ni e-mail) : marqué, sans boucle de réessai', async () => {
    const { o } = await commandeEnAttente({ sansContact: true });
    const passe = await remindPendingVendorOrders({ hours: 4 });
    expect(passe.details.some((d) => d.reference === o.reference && d.channel === 'none')).toBe(true);
    expect(await remindedAt(o.id)).not.toBeNull();
  });
});

describe('2. sauvegarde : les événements de fréquentation sont exportés et restaurés', () => {
  it('export + essai de restauration : forecast_events présent, sans perte', async () => {
    const db = await getDb();
    const [r] = await db.insert(restaurants).values({ name: `Restaurant P0M sauvegarde ${n}`, slug: slug('p0m-sauvegarde') }).returning();
    await db.insert(forecastEvents).values([
      { restaurantId: r.id, day: '2026-12-24', label: 'Soirée privatisée', multiplier: '2.50' },
      { restaurantId: r.id, day: '2026-12-25', label: 'Fermeture', multiplier: '0.05' },
    ]);
    const fichier = await exportRestaurant(r.id, { mode: 'admin' });
    expect(fichier.tables.forecast_events).toHaveLength(2);
    expect(fichier.counts.forecast_events).toBe(2);
    const drill = await restoreDrill(fichier);
    expect(drill.ok).toBe(true);
    expect(drill.relu.tables.forecast_events).toBe(2);
  });
});

describe('3. cloisonnement Preview : la même base sous une autre orthographe reste refusée', () => {
  // Adresses et mots de passe FICTIFS (aucune valeur réelle ne figure dans ce dépôt) : `motdepasse` est
  // la forme d'exemple admise par le contrôle du dépôt public, `autremdp` une autre orthographe.
  const PROD = 'postgresql://proprietaire:motdepasse@ep-prod-123.eu-central-1.aws.neon.tech/afrisupply?sslmode=require';
  it('sameDatabase compare hôte et base, pas la chaîne complète', () => {
    expect(sameDatabase(PROD, PROD)).toBe(true);
    expect(sameDatabase(PROD, 'postgresql://autre:autremdp@ep-prod-123.eu-central-1.aws.neon.tech/afrisupply')).toBe(true);
    expect(sameDatabase(PROD, 'postgresql://proprietaire:motdepasse@ep-prod-123.eu-central-1.aws.neon.tech/afrisupply/')).toBe(true);
    expect(sameDatabase(PROD, 'postgresql://u:p@ep-preview-456.eu-central-1.aws.neon.tech/afrisupply?sslmode=require')).toBe(false);
    expect(sameDatabase(PROD, 'postgresql://u:p@ep-prod-123.eu-central-1.aws.neon.tech/autre_base')).toBe(false);
    expect(sameDatabase(PROD, undefined)).toBe(false);
    expect(sameDatabase(undefined, undefined)).toBe(false);
  });

  it('getDatabaseUrl refuse la production déguisée en prévisualisation', () => {
    const deguisee = 'postgresql://afrisupply_app:autremdp@ep-prod-123.eu-central-1.aws.neon.tech/afrisupply';
    expect(getDatabaseUrl({ VERCEL_ENV: 'preview', DATABASE_URL: PROD, PREVIEW_DATABASE_URL: deguisee })).toBeUndefined();
    const preview = 'postgresql://u:p@ep-preview-456.eu-central-1.aws.neon.tech/afrisupply';
    expect(getDatabaseUrl({ VERCEL_ENV: 'preview', DATABASE_URL: PROD, PREVIEW_DATABASE_URL: preview })).toBe(preview);
  });
});

describe('4. rôle applicatif : un rôle préexistant privilégié est ramené au minimum', () => {
  it('ALTER ROLE retire SUPERUSER / BYPASSRLS / CREATEDB / CREATEROLE à un rôle déjà existant', async () => {
    const racine = path.resolve(process.cwd(), '../..');
    const ROLE = readFileSync(path.join(racine, 'packages/db/roles/afrisupply_app.sql'), 'utf8');
    const db = await openDatabase('memory://p0m-role-preexistant');
    await runMigrations(db);   // base migrée, comme la branche Neon visée (schéma drizzle présent)
    const brut = (db as unknown as { $client: { exec: (q: string) => Promise<unknown>; query: (q: string) => Promise<{ rows: Record<string, unknown>[] }> } }).$client;
    // Sous AFS_DB_MINIMAL_ROLE=true, runMigrations a déjà installé le rôle minimal et basculé dessus :
    // on repasse en propriétaire, puis on donne au rôle les privilèges étendus (comme la console Neon).
    await brut.exec('RESET ROLE');
    await brut.exec(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afrisupply_app') THEN
        CREATE ROLE afrisupply_app LOGIN SUPERUSER BYPASSRLS CREATEDB CREATEROLE;
      ELSE
        ALTER ROLE afrisupply_app LOGIN SUPERUSER BYPASSRLS CREATEDB CREATEROLE;
      END IF;
    END $$;`);
    const avant = (await brut.query("select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole from pg_roles where rolname = 'afrisupply_app'")).rows[0];
    expect(avant).toEqual({ rolsuper: true, rolbypassrls: true, rolcreatedb: true, rolcreaterole: true });
    await brut.exec(ROLE);
    const apres = (await brut.query("select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit, rolreplication from pg_roles where rolname = 'afrisupply_app'")).rows[0];
    expect(apres).toEqual({ rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false, rolinherit: false, rolreplication: false });
    // Et le rôle peut toujours se connecter (CONNECT accordé explicitement).
    const [d] = (await brut.query("select has_database_privilege('afrisupply_app', current_database(), 'CONNECT') as connect")).rows;
    expect(d.connect).toBe(true);
  });
});

describe('5. balayage des alertes : on n’insiste pas auprès du prestataire quand tout le monde sera refusé', () => {
  it('sweepBlocker arrête le passage pour un échec de configuration, pas pour un destinataire isolé', async () => {
    const { sweepBlocker } = await import('../lib/notify.js');
    const res = (status: string, reason: string, emails = 0) => ({ restaurantId: 'r', alerts: 1, emails, recipients: ['r***@exemple.test'], sent: emails > 0, status, reason }) as never;
    // Échec de configuration : il frappera tous les restaurants, un seul appel suffit.
    for (const code of ['mail_not_configured', 'mail_key_invalid', 'mail_domain_not_verified', 'mail_from_invalid', 'mail_rate_limited']) {
      expect(sweepBlocker(res('error', code))).toBe(code);
    }
    // Expéditeur d'essai : le prestataire sert le titulaire de son compte. Rien n'a été remis au
    // restaurant essayé → les suivants seront refusés aussi, on cesse de solliciter le prestataire.
    expect(sweepBlocker(res('error', 'mail_test_sender_restricted'))).toBe('mail_test_sender_restricted');
    // … mais si le titulaire a été servi, le passage continue (emails > 0 → pas d'arrêt).
    expect(sweepBlocker(res('partial', 'mail_test_sender_restricted', 1))).toBeUndefined();
    // Motifs propres à un destinataire, ou passage réussi : on continue.
    expect(sweepBlocker(res('error', 'mail_recipient_rejected'))).toBeUndefined();
    expect(sweepBlocker(res('error', 'mail_provider_error'))).toBeUndefined();
    expect(sweepBlocker(res('skipped', 'no_recipient'))).toBeUndefined();
    expect(sweepBlocker(res('ok', 'ok', 1))).toBeUndefined();
  });
});

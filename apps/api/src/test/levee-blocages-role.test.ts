// Levée des blocages — chantier B : base de test sans données, et rôle PostgreSQL minimal.
//
// 1. packages/db/sql/base_neuve.sql crée, sur une base VIDE, exactement ce que l'outil de migration
//    crée (mêmes tables, mêmes colonnes, même journal) — sans aucune donnée. Il sert à ouvrir une
//    prévisualisation propre depuis un simple éditeur SQL.
// 2. packages/db/roles/afrisupply_app.sql donne au rôle applicatif les privilèges nécessaires et
//    AUCUN autre : couverture vérifiée table par table, séquence par séquence, schéma par schéma.
// 3. « 48 tables dans le code, 49 relevées sur Neon » : la 49e est le journal des migrations.
//
// Preuve sur la base PostgreSQL embarquée des tests. Elle ne remplace pas l'essai sur Neon
// (docs/audits/LEVEE_RESERVES_NEON.md, fiche NEON-03) : elle garantit que les deux scripts sont justes.
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { openDatabase, runMigrations, migrationStatus, type Db } from '@afrisupply/db';

process.env.NODE_ENV = 'test';

const racine = path.resolve(process.cwd(), '../..');
const BASE_NEUVE = readFileSync(path.join(racine, 'packages/db/sql/base_neuve.sql'), 'utf8');
const ROLE = readFileSync(path.join(racine, 'packages/db/roles/afrisupply_app.sql'), 'utf8');
/** Les tables que le code connaît (packages/db/src/schema.ts). */
const TABLES_DU_CODE = [...readFileSync(path.join(racine, 'packages/db/src/schema.ts'), 'utf8').matchAll(/pgTable\(\s*'([a-z_0-9]+)'/g)].map((m) => m[1]).sort();
/**
 * Journaux : le code n'y fait que lire et insérer (relevé sur toutes les sources hors tests).
 * Une trace d'audit, un historique de prix, un mouvement de stock ne se réécrivent pas et ne s'effacent pas.
 */
const JOURNAUX_IMMUABLES = ['audit_log', 'forecasts', 'order_events', 'price_history', 'stock_movements', 'usage_events'];
/** Tables écrites par « INSERT … ON CONFLICT DO UPDATE » : UPDATE nécessaire, DELETE jamais utilisé. */
const UPSERT_SANS_SUPPRESSION = ['sales', 'vendor_credit_terms'];
/** Tables où le code effectue une suppression physique, relevées dans les routes métier. */
const TABLES_AVEC_SUPPRESSION = [
  'forecast_events', 'group_buy_participations', 'inventory_items', 'order_lines', 'products',
  'prospects', 'rate_limits', 'recipe_ingredients', 'recipes', 'recurring_orders', 'reorder_rules',
  'restaurant_members', 'restaurants', 'shopping_lists', 'supplier_offers', 'users',
  'vendor_customer_prices', 'vendor_offers', 'vendor_price_tiers', 'vendor_routes',
].sort();

type Brut = { exec: (q: string) => Promise<unknown>; query: (q: string) => Promise<{ rows: Record<string, unknown>[] }> };
const brut = (db: Db) => (db as unknown as { $client: Brut }).$client;
const lignes = async (db: Db, q: string) => (await brut(db).query(q)).rows;

let neuve: Db; let reference: Db;
beforeAll(async () => {
  neuve = await openDatabase('memory://levee-base-neuve');
  await brut(neuve).exec(BASE_NEUVE);
  reference = await openDatabase('memory://levee-base-reference');
  await runMigrations(reference);
  // Sous AFS_DB_MINIMAL_ROLE=true, la base de référence est passée au rôle applicatif : on relit en propriétaire.
  await brut(reference).exec('RESET ROLE');
}, 120_000);

describe('base neuve : le fichier SQL vaut l’outil de migration', () => {
  it('le fichier committé correspond aux migrations du dépôt', () => {
    const r = spawnSync('node', ['scripts/base-neuve.mjs', '--check'], { cwd: racine, encoding: 'utf8' });
    expect(r.stdout + r.stderr).toMatch(/correspond aux migrations/);
    expect(r.status).toBe(0);
  });

  it('journal : 29 migrations sur 29, état « à jour »', async () => {
    const s = await migrationStatus(neuve);
    expect(s).toMatchObject({ state: 'a_jour', expected: 29, applied: 29, pending: [], modified: [], unknownInDatabase: 0 });
  });

  it('mêmes tables, mêmes colonnes, mêmes types, mêmes index et mêmes contraintes que la base migrée par l’outil', async () => {
    const colonnes = "select table_schema, table_name, column_name, data_type, udt_name, is_nullable, coalesce(column_default, '') as defaut from information_schema.columns where table_schema in ('public', 'drizzle') order by 1, 2, 3";
    const index = "select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2";
    const contraintes = "select conrelid::regclass::text as t, conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2";
    const types = "select t.typname, e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid order by 1, e.enumsortorder";
    for (const q of [colonnes, index, contraintes, types]) expect(await lignes(neuve, q)).toEqual(await lignes(reference, q));
    expect((await lignes(neuve, colonnes)).length).toBeGreaterThan(400);
  });

  it('48 tables de l’application + 1 journal des migrations = 49 ; les 48 sont celles du code, et elles sont vides', async () => {
    const parSchema = await lignes(neuve, "select table_schema as s, count(*)::int as n from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema') group by 1 order by 1");
    expect(parSchema).toEqual([{ s: 'drizzle', n: 1 }, { s: 'public', n: 48 }]);
    const noms = (await lignes(neuve, "select table_name as t from information_schema.tables where table_schema = 'public' order by 1")).map((r) => String(r.t));
    expect(noms).toEqual(TABLES_DU_CODE);
    expect(TABLES_DU_CODE).toHaveLength(48);
    // Aucune donnée : ni compte, ni restaurant, ni commande, ni journal d'audit.
    for (const t of TABLES_DU_CODE) expect(Number((await lignes(neuve, `select count(*)::int as n from "${t}"`))[0].n), t).toBe(0);
  });

  it('il refuse de s’appliquer à une base qui contient déjà des tables — et ne la modifie pas', async () => {
    await expect(brut(neuve).exec(BASE_NEUVE)).rejects.toThrow(/base neuve/);
    await brut(neuve).exec('ROLLBACK').catch(() => undefined);
    expect((await migrationStatus(neuve)).applied).toBe(29);
  });
});

describe('rôle applicatif : les privilèges nécessaires, et aucun autre', () => {
  const R = 'afrisupply_app';
  beforeAll(async () => { await brut(neuve).exec(ROLE); await brut(neuve).exec(ROLE); });   // rejouable

  it('attributs du rôle : ni super-utilisateur, ni création de rôles ou de bases, ni contournement de RLS, membre d’aucun rôle', async () => {
    const [r] = await lignes(neuve, `select rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication, rolinherit from pg_roles where rolname = '${R}'`);
    expect(r).toEqual({ rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false, rolreplication: false, rolinherit: false });
    expect(await lignes(neuve, `select 1 from pg_auth_members m join pg_roles x on x.oid = m.member where x.rolname = '${R}'`)).toEqual([]);
  });

  it('chacune des 48 tables : lire et ajouter — ni vider, ni référencer, ni déclencher, et jamais propriétaire', async () => {
    const droits = await lignes(neuve, `
      select c.relname as t,
             has_table_privilege('${R}', c.oid, 'SELECT') as lire, has_table_privilege('${R}', c.oid, 'INSERT') as ajouter,
             has_table_privilege('${R}', c.oid, 'UPDATE') as modifier, has_table_privilege('${R}', c.oid, 'DELETE') as supprimer,
             has_table_privilege('${R}', c.oid, 'TRUNCATE') as vider, has_table_privilege('${R}', c.oid, 'REFERENCES') as referencer, has_table_privilege('${R}', c.oid, 'TRIGGER') as declencher,
             pg_get_userbyid(c.relowner) = '${R}' as proprietaire
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`);
    expect(droits.map((d) => d.t)).toEqual(TABLES_DU_CODE);
    for (const d of droits) expect(d, String(d.t)).toMatchObject({ lire: true, ajouter: true, vider: false, referencer: false, declencher: false, proprietaire: false });
  });

  // Répartition exacte des 48 tables : 20 avec suppression (la liste nominative du script SQL) et
  // 28 sans. Parmi ces 28, les 6 journaux n'ont pas non plus UPDATE, et les 2 tables UPSERT gardent
  // UPDATE mais perdent DELETE. Le nom de cet essai donne ces quatre nombres : il ne dit plus « 40 ».
  it('écriture : 20 tables avec suppression, 28 sans — dont 6 journaux sans modification ni suppression et 2 UPSERT sans suppression', async () => {
    const droits = await lignes(neuve, `
      select c.relname as t, has_table_privilege('${R}', c.oid, 'UPDATE') as modifier, has_table_privilege('${R}', c.oid, 'DELETE') as supprimer
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`);
    const sans = (k: 'modifier' | 'supprimer') => droits.filter((d) => !d[k]).map((d) => String(d.t));
    expect(droits).toHaveLength(48);
    expect(TABLES_AVEC_SUPPRESSION).toHaveLength(20);
    expect(sans('modifier')).toEqual(JOURNAUX_IMMUABLES);
    expect(droits.filter((d) => d.supprimer).map((d) => String(d.t))).toEqual(TABLES_AVEC_SUPPRESSION);
    expect(sans('supprimer')).toEqual(TABLES_DU_CODE.filter((t) => !TABLES_AVEC_SUPPRESSION.includes(t)).sort());
    expect(droits.filter((d) => d.modifier && d.supprimer).map((d) => String(d.t))).toEqual(TABLES_AVEC_SUPPRESSION);
    expect(sans('supprimer')).toHaveLength(28);
  });

  // Aucune porte de derrière : NOINHERIT et l'absence d'appartenance à un rôle (vérifiés plus haut)
  // ne suffisent pas — un droit accordé à PUBLIC vaut pour tout le monde, rôle minimal compris. Il
  // est donc contrôlé sur les 48 tables, pas seulement sur les journaux comme plus bas.
  it('aucune réintroduction par PUBLIC : les 48 tables ne lui donnent ni lecture, ni écriture, ni suppression', async () => {
    const droits = await lignes(neuve, `
      select c.relname as t,
             has_table_privilege('public', c.oid, 'SELECT') as lire, has_table_privilege('public', c.oid, 'INSERT') as ajouter,
             has_table_privilege('public', c.oid, 'UPDATE') as modifier, has_table_privilege('public', c.oid, 'DELETE') as supprimer
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`);
    expect(droits.map((d) => d.t)).toEqual(TABLES_DU_CODE);
    for (const d of droits) expect(d, String(d.t)).toMatchObject({ lire: false, ajouter: false, modifier: false, supprimer: false });
    const [g] = await lignes(neuve, `select has_schema_privilege('public', 'public', 'CREATE') as creer_schema,
      has_database_privilege('public', current_database(), 'CREATE') as creer_base,
      has_database_privilege('public', current_database(), 'TEMPORARY') as temporaire`);
    expect(g).toEqual({ creer_schema: false, creer_base: false, temporaire: false });
  });

  it('journal des migrations : lecture seule', async () => {
    const [d] = await lignes(neuve, `select has_table_privilege('${R}', 'drizzle.__drizzle_migrations', 'SELECT') as lire, has_table_privilege('${R}', 'drizzle.__drizzle_migrations', 'INSERT') as ajouter, has_table_privilege('${R}', 'drizzle.__drizzle_migrations', 'UPDATE') as modifier, has_table_privilege('${R}', 'drizzle.__drizzle_migrations', 'DELETE') as supprimer`);
    expect(d).toEqual({ lire: true, ajouter: false, modifier: false, supprimer: false });
  });

  it('séquences : les trois compteurs de numérotation existent et sont utilisables ; le compteur du journal ne l’est pas', async () => {
    const seq = await lignes(neuve, `select c.relname as s, has_sequence_privilege('${R}', c.oid, 'USAGE') as usage, has_sequence_privilege('${R}', c.oid, 'SELECT') as lire, has_sequence_privilege('${R}', c.oid, 'UPDATE') as realigner from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'S' order by 1`);
    expect(seq).toEqual(['claim_ref_seq', 'order_ref_seq', 'subscription_invoice_seq'].map((s) => ({ s, usage: true, lire: true, realigner: true })));
    const [j] = await lignes(neuve, `select has_sequence_privilege('${R}', 'drizzle.__drizzle_migrations_id_seq', 'USAGE') as usage, has_sequence_privilege('${R}', 'drizzle.__drizzle_migrations_id_seq', 'UPDATE') as realigner`);
    expect(j).toEqual({ usage: false, realigner: false });
  });

  it('schémas et base : utiliser, jamais créer — ni table, ni table temporaire, ni schéma', async () => {
    const [d] = await lignes(neuve, `select has_schema_privilege('${R}', 'public', 'USAGE') as public_usage, has_schema_privilege('${R}', 'public', 'CREATE') as public_creer,
      has_schema_privilege('${R}', 'drizzle', 'USAGE') as journal_usage, has_schema_privilege('${R}', 'drizzle', 'CREATE') as journal_creer,
      has_database_privilege('${R}', current_database(), 'CREATE') as base_creer, has_database_privilege('${R}', current_database(), 'TEMPORARY') as base_temporaire`);
    expect(d).toEqual({ public_usage: true, public_creer: false, journal_usage: true, journal_creer: false, base_creer: false, base_temporaire: false });
  });

  it('une table créée plus tard par une migration reçoit les mêmes droits, d’office', async () => {
    await brut(neuve).exec('create table table_d_une_migration_future (id int primary key)');
    const [d] = await lignes(neuve, `select has_table_privilege('${R}', 'table_d_une_migration_future', 'SELECT') as lire, has_table_privilege('${R}', 'table_d_une_migration_future', 'INSERT') as ajouter, has_table_privilege('${R}', 'table_d_une_migration_future', 'TRUNCATE') as vider`);
    await brut(neuve).exec('drop table table_d_une_migration_future');
    expect(d).toEqual({ lire: true, ajouter: true, vider: false });
  });

  // Les privilèges par défaut accordent les quatre droits d'écriture à toute table future : un journal
  // créé par une migration suivante ne devient donc immuable que si son nom est ajouté à
  // JOURNAUX_IMMUABLES et le fichier rejoué. Ce test verrouille ce comportement pour qu'il ne puisse
  // pas changer en silence.
  it('privilèges par défaut : une table future reçoit SELECT/INSERT/UPDATE, jamais DELETE', async () => {
    await brut(neuve).exec('create table table_d_une_migration_future (id int primary key)');
    const [d] = await lignes(neuve, `select has_table_privilege('${R}', 'table_d_une_migration_future', 'SELECT') as lire, has_table_privilege('${R}', 'table_d_une_migration_future', 'INSERT') as ajouter, has_table_privilege('${R}', 'table_d_une_migration_future', 'UPDATE') as modifier, has_table_privilege('${R}', 'table_d_une_migration_future', 'DELETE') as supprimer, has_table_privilege('${R}', 'table_d_une_migration_future', 'TRUNCATE') as vider`);
    await brut(neuve).exec('drop table table_d_une_migration_future');
    expect(d).toEqual({ lire: true, ajouter: true, modifier: true, supprimer: false, vider: false });
  });

  it('à l’usage : le rôle lit et écrit, et tout le reste lui est refusé', async () => {
    const c = brut(neuve);
    await c.exec(`SET ROLE ${R}`);
    try {
      await c.exec("insert into rate_limits (key, n, reset_at) values ('essai', 1, now()); update rate_limits set n = 2 where key = 'essai'; delete from rate_limits where key = 'essai'");
      await c.exec("select nextval('order_ref_seq'); select setval('order_ref_seq', 10, true); select count(*) from drizzle.__drizzle_migrations");
      const interdits = ['create table interdit (id int)', 'create temporary table interdit_temp (id int)', 'alter table users add column interdit int', 'drop table rate_limits', 'truncate rate_limits',
        'create sequence interdite', 'create schema interdit', 'create role intrus', 'alter role afrisupply_app createrole', 'delete from drizzle.__drizzle_migrations',
        "insert into drizzle.__drizzle_migrations (hash, created_at) values ('x', 1)", 'alter table users enable row level security', 'create index interdit on users (email)'];
      for (const q of interdits) await expect(c.exec(q), q).rejects.toThrow();
      // Donner un droit qu'on ne peut pas donner : PostgreSQL ne lève pas d'erreur, il n'accorde rien.
      await c.exec('grant select on users to public');
    } finally { await c.exec('RESET ROLE'); }
    expect(await lignes(neuve, "select has_table_privilege('public', 'users', 'SELECT') as tout_le_monde_lit_les_comptes")).toEqual([{ tout_le_monde_lit_les_comptes: false }]);
  });
});

// Reprise P0-M, 17 novembre 2026 — le rôle applicatif ne doit pouvoir ni réécrire ni effacer une trace.
describe('journaux immuables : une trace ne se réécrit pas et ne s’efface pas', () => {
  const R = 'afrisupply_app';
  const colonne = async (t: string) =>
    String((await lignes(neuve, `select column_name as c from information_schema.columns where table_schema = 'public' and table_name = '${t}' order by ordinal_position limit 1`))[0].c);

  it('audit_log : lire et ajouter, ni modifier, ni supprimer, ni vider', async () => {
    const [d] = await lignes(neuve, `select has_table_privilege('${R}', 'audit_log', 'SELECT') as lire, has_table_privilege('${R}', 'audit_log', 'INSERT') as ajouter,
      has_table_privilege('${R}', 'audit_log', 'UPDATE') as modifier, has_table_privilege('${R}', 'audit_log', 'DELETE') as supprimer, has_table_privilege('${R}', 'audit_log', 'TRUNCATE') as vider`);
    expect(d).toEqual({ lire: true, ajouter: true, modifier: false, supprimer: false, vider: false });
  });

  it('les six journaux sont protégés de la même façon, et personne d’autre ne l’est par accident', async () => {
    const droits = await lignes(neuve, `select c.relname as t, has_table_privilege('${R}', c.oid, 'UPDATE') as modifier, has_table_privilege('${R}', c.oid, 'DELETE') as supprimer
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`);
    expect(droits.filter((d) => !d.modifier).map((d) => String(d.t))).toEqual(JOURNAUX_IMMUABLES);
    expect(droits.filter((d) => !d.supprimer).map((d) => String(d.t))).toEqual(TABLES_DU_CODE.filter((t) => !TABLES_AVEC_SUPPRESSION.includes(t)).sort());
    for (const t of JOURNAUX_IMMUABLES) {
      const [d] = await lignes(neuve, `select has_table_privilege('${R}', '${t}', 'SELECT') as lire, has_table_privilege('${R}', '${t}', 'INSERT') as ajouter, has_table_privilege('${R}', '${t}', 'TRUNCATE') as vider`);
      expect(d, t).toEqual({ lire: true, ajouter: true, vider: false });
    }
  });

  it('à l’usage, sous le rôle : on écrit une trace d’audit, puis ni la modifier ni la supprimer ne passent', async () => {
    const c = brut(neuve);
    await c.exec(`SET ROLE ${R}`);
    try {
      await c.exec("insert into audit_log (actor_email, action, target) values ('exploitant@example.test', 'login.failed', 'reprise-p0-m')");
      await c.exec('select action from audit_log');
      await expect(c.exec("update audit_log set action = 'efface' where target = 'reprise-p0-m'"), 'update audit_log').rejects.toThrow(/permission denied for table audit_log/);
      await expect(c.exec("delete from audit_log where target = 'reprise-p0-m'"), 'delete audit_log').rejects.toThrow(/permission denied for table audit_log/);
      await expect(c.exec('truncate audit_log'), 'truncate audit_log').rejects.toThrow();
      await expect(c.exec('drop table audit_log'), 'drop audit_log').rejects.toThrow();
    } finally { await c.exec('RESET ROLE'); }
    // La trace écrite est toujours là, intacte : rien n'a été réécrit ni effacé entre-temps.
    expect(await lignes(neuve, "select action, target from audit_log where target = 'reprise-p0-m'")).toEqual([{ action: 'login.failed', target: 'reprise-p0-m' }]);
  });

  it('les six journaux : modification et suppression réellement refusées sous le rôle, aucune ligne touchée', async () => {
    const c = brut(neuve);
    const tables = [...JOURNAUX_IMMUABLES, ...UPSERT_SANS_SUPPRESSION];
    const comptes = async () => Object.fromEntries(await Promise.all(tables.map(async (t) => [t, Number((await lignes(neuve, `select count(*)::int as n from ${t}`))[0].n)])));
    const avant = await comptes();
    await c.exec(`SET ROLE ${R}`);
    try {
      for (const t of JOURNAUX_IMMUABLES) {
        const col = await colonne(t);
        await expect(c.exec(`update ${t} set ${col} = ${col} where false`), `update ${t}`).rejects.toThrow(/permission denied/);
        await expect(c.exec(`delete from ${t} where false`), `delete ${t}`).rejects.toThrow(/permission denied/);
      }
      // Les deux tables en UPSERT gardent la modification (le code en a besoin) et perdent la suppression.
      for (const t of UPSERT_SANS_SUPPRESSION) {
        const col = await colonne(t);
        await expect(c.exec(`update ${t} set ${col} = ${col} where false`), `update ${t}`).resolves.toBeDefined();
        await expect(c.exec(`delete from ${t} where false`), `delete ${t}`).rejects.toThrow(/permission denied/);
      }
    } finally { await c.exec('RESET ROLE'); }
    expect(await comptes()).toEqual(avant);
  });

  it('PUBLIC n’a aucun droit sur les journaux, et le fichier est rejouable sans rien changer', async () => {
    for (const t of JOURNAUX_IMMUABLES) {
      const [d] = await lignes(neuve, `select has_table_privilege('public', '${t}', 'SELECT') as lire, has_table_privilege('public', '${t}', 'UPDATE') as modifier, has_table_privilege('public', '${t}', 'DELETE') as supprimer`);
      expect(d, t).toEqual({ lire: false, modifier: false, supprimer: false });
    }
    const avant = await lignes(neuve, `select c.relname as t, has_table_privilege('${R}', c.oid, 'SELECT') as lire, has_table_privilege('${R}', c.oid, 'INSERT') as ajouter, has_table_privilege('${R}', c.oid, 'UPDATE') as modifier, has_table_privilege('${R}', c.oid, 'DELETE') as supprimer from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`);
    await brut(neuve).exec(ROLE);
    expect(await lignes(neuve, `select c.relname as t, has_table_privilege('${R}', c.oid, 'SELECT') as lire, has_table_privilege('${R}', c.oid, 'INSERT') as ajouter, has_table_privilege('${R}', c.oid, 'UPDATE') as modifier, has_table_privilege('${R}', c.oid, 'DELETE') as supprimer from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`)).toEqual(avant);
  });
});

// ================================================================================================
// Réserves du contrôle indépendant — deux portes d'élévation que NOINHERIT ne ferme pas.
//
// 1. L'APPARTENANCE à un autre rôle. NOINHERIT empêche l'héritage AUTOMATIQUE des privilèges des
//    rôles dont on est membre ; il n'empêche pas SET ROLE. Un rôle membre d'un autre peut l'endosser
//    et obtenir directement ses pouvoirs — membre du propriétaire de la base ou d'un SUPERUSER, il
//    contourne tout ce que le fichier met en place, refus de DELETE compris. Le fichier ne retire
//    pas ces appartenances à l'aveugle : il refuse l'installation et les nomme.
// 2. Les droits donnés à PUBLIC. PUBLIC n'est pas un rôle dont on hérite : c'est un droit accordé à
//    tout le monde, NOINHERIT n'y change rien. Le fichier retire tout DML à PUBLIC, sur les tables
//    présentes comme sur les tables futures.
//
// Chaque scénario ouvre SA base : SET SESSION AUTHORIZATION ne se restaure pas d'un appel à l'autre
// sur la base embarquée, et il ne faut rien laisser qui puisse fausser les essais voisins.
// ================================================================================================
describe('appartenance à un rôle privilégié : NOINHERIT ne suffit pas, le fichier refuse', () => {
  it('membre d’un rôle SUPERUSER, le rôle applicatif peut l’endosser — et le fichier refuse de s’installer dans cet état', async () => {
    const isolee = await openDatabase('memory://levee-appartenance-danger');
    await brut(isolee).exec(BASE_NEUVE);
    await brut(isolee).exec(ROLE);
    const c = brut(isolee);
    await c.exec('CREATE ROLE role_privilegie SUPERUSER');
    await c.exec('GRANT role_privilegie TO afrisupply_app');
    // L'installation refuse, et nomme l'appartenance avec l'attribut qui la rend dangereuse.
    await expect(c.exec(ROLE), 'installation refusée').rejects.toThrow(/installation refusée/);
    await expect(c.exec(ROLE), 'appartenance nommée').rejects.toThrow(/role_privilegie \(SUPERUSER\)/);
    // Le danger est réel et non théorique : endosser le rôle donne les droits d'un super-utilisateur.
    // C'est exactement ce que la précondition ci-dessus empêche d'atteindre.
    await c.exec('SET SESSION AUTHORIZATION afrisupply_app');
    await c.exec('SET ROLE role_privilegie');
    expect((await lignes(isolee, `select current_user as cu, current_setting('is_superuser') as super`))[0])
      .toEqual({ cu: 'role_privilegie', super: 'on' });
  }, 120_000);

  it('appartenance retirée par l’opérateur : installation acceptée, plus aucune appartenance, SET ROLE refusé', async () => {
    const isolee = await openDatabase('memory://levee-appartenance-saine');
    await brut(isolee).exec(BASE_NEUVE);
    const c = brut(isolee);
    await c.exec('CREATE ROLE role_privilegie SUPERUSER');
    await c.exec('CREATE ROLE afrisupply_app NOLOGIN');
    await c.exec('GRANT role_privilegie TO afrisupply_app');
    // Le retrait est une décision explicite de l'opérateur : le fichier ne le fait jamais à sa place.
    await c.exec('REVOKE role_privilegie FROM afrisupply_app');
    await c.exec(ROLE);
    expect(await lignes(isolee, `select 1 from pg_auth_members m join pg_roles x on x.oid = m.member where x.rolname = 'afrisupply_app'`)).toEqual([]);
    expect((await lignes(isolee, `select pg_has_role('afrisupply_app', 'role_privilegie', 'MEMBER') as membre`))[0]).toEqual({ membre: false });
    // Endosser ce rôle est désormais refusé : il n'y a plus d'appartenance à endosser.
    await c.exec('SET SESSION AUTHORIZATION afrisupply_app');
    await expect(c.exec('SET ROLE role_privilegie'), 'SET ROLE refusé').rejects.toThrow(/permission denied to set role/);
  }, 120_000);
});

describe('privilèges PUBLIC : rien sur les tables présentes, rien sur les tables futures', () => {
  it('des droits PUBLIC préexistants sont retirés partout, et ne reviennent pas sur une table créée ensuite', async () => {
    const isolee = await openDatabase('memory://levee-public');
    await brut(isolee).exec(BASE_NEUVE);
    // État de départ volontairement laxiste : l'équivalent d'un « GRANT ALL … TO PUBLIC » laissé par
    // une console, un ancien script ou une commande manuelle.
    await brut(isolee).exec('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC');
    await brut(isolee).exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO PUBLIC');
    expect((await lignes(isolee, `select has_table_privilege('public', 'audit_log', 'DELETE') as journal, has_table_privilege('public', 'users', 'DELETE') as comptes`))[0], 'état de départ laxiste')
      .toEqual({ journal: true, comptes: true });

    await brut(isolee).exec(ROLE);

    // Plus aucun droit PUBLIC sur les 48 tables — y compris les 20 qui donnent DELETE au rôle.
    const droits = await lignes(isolee, `select c.relname as t, has_table_privilege('public', c.oid, 'SELECT') as lire,
      has_table_privilege('public', c.oid, 'INSERT') as ajouter, has_table_privilege('public', c.oid, 'UPDATE') as modifier,
      has_table_privilege('public', c.oid, 'DELETE') as supprimer, has_table_privilege('public', c.oid, 'TRUNCATE') as vider
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`);
    expect(droits.map((x) => x.t)).toEqual(TABLES_DU_CODE);
    for (const x of droits) expect(x, String(x.t)).toMatchObject({ lire: false, ajouter: false, modifier: false, supprimer: false, vider: false });

    // Une table créée APRÈS l'application n'en reçoit pas non plus, alors que le rôle applicatif,
    // lui, reçoit bien SELECT/INSERT/UPDATE — et jamais DELETE.
    await brut(isolee).exec('create table public.table_apres (id int primary key)');
    expect((await lignes(isolee, `select has_table_privilege('public', 'public.table_apres', 'SELECT') as pub_lire,
      has_table_privilege('public', 'public.table_apres', 'DELETE') as pub_supprimer,
      has_table_privilege('afrisupply_app', 'public.table_apres', 'SELECT') as role_lire,
      has_table_privilege('afrisupply_app', 'public.table_apres', 'INSERT') as role_ajouter,
      has_table_privilege('afrisupply_app', 'public.table_apres', 'DELETE') as role_supprimer`))[0])
      .toEqual({ pub_lire: false, pub_supprimer: false, role_lire: true, role_ajouter: true, role_supprimer: false });
    await brut(isolee).exec('drop table public.table_apres');

    // Rien n'a été perdu au passage : les 20 DELETE justifiés sont toujours là, et les journaux
    // immuables restent sans UPDATE.
    const apres = await lignes(isolee, `select c.relname as t, has_table_privilege('afrisupply_app', c.oid, 'DELETE') as supprimer
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`);
    expect(apres.filter((x) => x.supprimer).map((x) => String(x.t))).toEqual(TABLES_AVEC_SUPPRESSION);
    for (const j of JOURNAUX_IMMUABLES) {
      expect((await lignes(isolee, `select has_table_privilege('afrisupply_app', '${j}', 'INSERT') as ajouter, has_table_privilege('afrisupply_app', '${j}', 'UPDATE') as modifier`))[0], j)
        .toEqual({ ajouter: true, modifier: false });
    }
  }, 120_000);
});

// Chantier 12 (audit) — SAUVEGARDE ET RESTAURATION RÉELLEMENT TESTABLES.
//
// Principe : une sauvegarde n'est pas un `pg_dump` qu'on espère, c'est un fichier qu'on a
// **rouvert et vérifié**. On exporte donc les données d'UN restaurant (produits, fournisseurs,
// offres, prix pratiqués, stock, commandes, lignes, réceptions, écarts, recettes, ventes, alertes,
// listes, litiges…) dans un format versionné, lisible, avec une empreinte SHA-256 qui permet de
// détecter une altération, et on sait le réimporter dans une base vide en le prouvant.
//
// Ce qui n'est PAS dans le fichier : les données des autres restaurants, ni celles des grossistes
// (sauf les références strictement nécessaires aux commandes passées, marquées « externes » et
// restaurées seulement si le grossiste existe).
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import path from 'node:path';
import { and, eq, getTableColumns, inArray, isNull, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import {
  getDb, openDatabase, runMigrations, type Db, restaurants, users, restaurantMembers, products, suppliers, supplierOffers, priceHistory,
  inventoryItems, stockMovements, orders, orderLines, deliveries, deliveryDiscrepancies, recipes,
  recipeIngredients, sales, alerts, reorderRules, forecasts, shoppingLists, feedback, usageEvents,
  notifications, orderEvents, recurringOrders, claims, subscriptionInvoices, billingEvents,
  commissions, groupBuyParticipations, vendorCustomerPrices, vendorReviews,
} from '@afrisupply/db';

export const BACKUP_FORMAT = 'afrisupply.backup';
export const BACKUP_VERSION = 1;

type Scope = 'restaurant' | 'child' | 'members' | 'external' | 'reference';

interface BackupTable {
  /** Nom du tableau tel qu'il apparaît dans le fichier. */
  name: string;
  table: PgTable;
  scope: Scope;
  /** Colonne de rattachement au restaurant (scope « restaurant ») ou au parent (scope « child »). */
  column?: string;
  /** Tableau parent (scope « child ») : on reprend les identifiants collectés à l'export. */
  parent?: string;
  /** Tableau parent dont on reprend les identifiants utilisateurs (scope « members »). */
  parentUser?: string;
  /** Donnée appartenant à un tiers : restaurée seulement si la référence existe déjà. */
  note?: string;
  /**
   * Ligne de RÉFÉRENTIEL partagé (catalogue AFRISUPPLY, `restaurant_id` NULL) : elle peut déjà
   * exister dans la base cible — on l'insère sans écraser, et on compte ce qui est présent.
   */
  conflictSafe?: boolean;
}

/**
 * Ordre d'export ET de restauration : les parents avant les enfants (l'ordre importe, les clés
 * étrangères sont réelles). Toute table ajoutée ici est automatiquement sauvegardée, vérifiée
 * et restaurée — c'est le seul endroit à mettre à jour.
 */
export const BACKUP_TABLES: BackupTable[] = [
  { name: 'restaurant_members', table: restaurantMembers, scope: 'restaurant', column: 'restaurantId' },
  { name: 'products', table: products, scope: 'restaurant', column: 'restaurantId' },
  { name: 'suppliers', table: suppliers, scope: 'restaurant', column: 'restaurantId' },
  { name: 'supplier_offers', table: supplierOffers, scope: 'restaurant', column: 'restaurantId' },
  { name: 'price_history', table: priceHistory, scope: 'restaurant', column: 'restaurantId' },
  { name: 'recipes', table: recipes, scope: 'restaurant', column: 'restaurantId' },
  { name: 'sales', table: sales, scope: 'restaurant', column: 'restaurantId' },
  { name: 'orders', table: orders, scope: 'restaurant', column: 'restaurantId' },
  { name: 'deliveries', table: deliveries, scope: 'restaurant', column: 'restaurantId' },
  { name: 'inventory_items', table: inventoryItems, scope: 'restaurant', column: 'restaurantId' },
  { name: 'stock_movements', table: stockMovements, scope: 'restaurant', column: 'restaurantId' },
  { name: 'alerts', table: alerts, scope: 'restaurant', column: 'restaurantId' },
  { name: 'reorder_rules', table: reorderRules, scope: 'restaurant', column: 'restaurantId' },
  { name: 'forecasts', table: forecasts, scope: 'restaurant', column: 'restaurantId' },
  { name: 'shopping_lists', table: shoppingLists, scope: 'restaurant', column: 'restaurantId' },
  { name: 'recurring_orders', table: recurringOrders, scope: 'restaurant', column: 'restaurantId' },
  { name: 'claims', table: claims, scope: 'restaurant', column: 'restaurantId' },
  { name: 'notifications', table: notifications, scope: 'restaurant', column: 'restaurantId' },
  { name: 'feedback', table: feedback, scope: 'restaurant', column: 'restaurantId' },
  { name: 'usage_events', table: usageEvents, scope: 'restaurant', column: 'restaurantId' },
  { name: 'billing_events', table: billingEvents, scope: 'restaurant', column: 'restaurantId' },
  { name: 'subscription_invoices', table: subscriptionInvoices, scope: 'restaurant', column: 'restaurantId' },
  // Enfants : rattachés par leur parent.
  { name: 'order_lines', table: orderLines, scope: 'child', column: 'orderId', parent: 'orders' },
  { name: 'order_events', table: orderEvents, scope: 'child', column: 'orderId', parent: 'orders' },
  { name: 'delivery_discrepancies', table: deliveryDiscrepancies, scope: 'child', column: 'deliveryId', parent: 'deliveries' },
  { name: 'recipe_ingredients', table: recipeIngredients, scope: 'child', column: 'recipeId', parent: 'recipes' },
  // Comptes de l'équipe (le fichier admin garde les empreintes de mot de passe : c'est ce qui permet
  // de retrouver un compte utilisable ; l'export « propriétaire » les retire, voir redactForOwner).
  { name: 'users', table: users, scope: 'members', column: 'id', parentUser: 'restaurant_members' },
  // Référentiel partagé : les produits AFRISUPPLY (restaurant_id NULL) réellement cités par ce
  // restaurant. Sans eux, un fichier de sauvegarde ne se rechargerait pas dans une base VIDE.
  { name: 'products_reference', table: products, scope: 'reference', column: 'id', conflictSafe: true, note: 'produits du référentiel AFRISUPPLY cités par ce restaurant' },
  // Données de tiers : présentes pour la fidélité de l'historique, restaurées si la référence existe.
  { name: 'commissions', table: commissions, scope: 'external', column: 'orderId', parent: 'orders', note: 'commissions AFRISUPPLY liées aux commandes' },
  { name: 'vendor_reviews', table: vendorReviews, scope: 'external', column: 'restaurantId', note: 'avis déposés sur les grossistes' },
  { name: 'vendor_customer_prices', table: vendorCustomerPrices, scope: 'external', column: 'restaurantId', note: 'prix négociés avec les grossistes' },
  { name: 'group_buy_participations', table: groupBuyParticipations, scope: 'external', column: 'restaurantId', note: 'participations aux achats groupés' },
];

const rid = (t: BackupTable) => (t.table as unknown as Record<string, unknown>)[t.column ?? 'id'];

/** Empreinte stable : mêmes données ⇒ même empreinte, quel que soit l'ordre des clés. */
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().filter((k) => obj[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`).join(',')}}`;
}
export const checksumOf = (payload: unknown) => `sha256:${createHash('sha256').update(stable(payload)).digest('hex')}`;

function dateISO(v: unknown): unknown {
  return v instanceof Date ? v.toISOString() : v;
}
/** Convertit les dates en texte lisible : un fichier de sauvegarde doit rester inspectable. */
/** Identifiants de produits cités par les lignes exportées (stock, offres, commandes, recettes…). */
function referencedProductIds(tables: Record<string, Record<string, unknown>[]>) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const out = new Set<string>();
  for (const rows of Object.values(tables)) {
    for (const row of rows) {
      for (const [k, v] of Object.entries(row)) if (typeof v === 'string' && uuid.test(v) && /productId$/.test(k)) out.add(v);
    }
  }
  return [...out];
}

function jsonSafe(rows: Record<string, unknown>[]) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, dateISO(v)])));
}

/** Retire ce qui n'a pas à sortir d'un fichier remis au restaurant (empreintes de mots de passe). */
function redactForOwner(table: string, rows: Record<string, unknown>[]) {
  if (table !== 'users') return rows;
  return rows.map(({ passwordHash: _p, tokenVersion: _t, ...rest }) => rest);
}

export interface BackupFile {
  format: string; version: number; createdAt: string; mode: 'admin' | 'owner';
  restaurant: Record<string, unknown>;
  tables: Record<string, Record<string, unknown>[]>;
  counts: Record<string, number>;
  totals: { tables: number; rows: number };
  checksum: string;
}

/** Exporte TOUT ce qui appartient à un restaurant (et rien d'autre). */
export async function exportRestaurant(restaurantId: string, opts: { mode?: 'admin' | 'owner'; db?: Db } = {}): Promise<BackupFile> {
  const mode = opts.mode ?? 'admin';
  const db = opts.db ?? (await getDb());
  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
  if (!restaurant) throw new Error('Restaurant introuvable');
  const tables: Record<string, Record<string, unknown>[]> = {};
  const ids: Record<string, string[]> = {};

  // 1) tables directement rattachées au restaurant
  for (const t of BACKUP_TABLES.filter((x) => x.scope === 'restaurant')) {
    const rows = await db.select().from(t.table).where(eq(rid(t) as never, restaurantId)) as Record<string, unknown>[];
    tables[t.name] = jsonSafe(rows);
    ids[t.name] = rows.map((r) => String(r.id));
  }
  // 2) enfants (par identifiant de parent)
  for (const t of BACKUP_TABLES.filter((x) => x.scope === 'child')) {
    const parentIds = ids[t.parent!] ?? [];
    const rows = parentIds.length
      ? await db.select().from(t.table).where(inArray(rid(t) as never, parentIds)) as Record<string, unknown>[]
      : [];
    tables[t.name] = jsonSafe(rows);
    ids[t.name] = rows.map((r) => String(r.id));
  }
  // 3) équipe : les utilisateurs réellement membres de ce restaurant
  for (const t of BACKUP_TABLES.filter((x) => x.scope === 'members')) {
    const members = (tables[t.parentUser!] ?? []) as { userId?: string }[];
    const userIds = [...new Set(members.map((m) => String(m.userId)).filter(Boolean))];
    const rows = userIds.length
      ? await db.select().from(t.table).where(inArray(rid(t) as never, userIds)) as Record<string, unknown>[]
      : [];
    tables[t.name] = jsonSafe(mode === 'owner' ? redactForOwner(t.name, rows) : rows);
    ids[t.name] = rows.map((r) => String(r.id));
  }
  // 4) données de tiers (meilleure effort : restaurées seulement si la référence existe)
  for (const t of BACKUP_TABLES.filter((x) => x.scope === 'external')) {
    const parentIds = ids[t.parent!] ?? [];
    const rows = t.column === 'orderId' && parentIds.length
      ? await db.select().from(t.table).where(inArray(rid(t) as never, parentIds)) as Record<string, unknown>[]
      : await db.select().from(t.table).where(eq(rid(t) as never, restaurantId)) as Record<string, unknown>[];
    tables[t.name] = jsonSafe(rows);
  }

  // 5) référentiel partagé : on embarque les seules lignes du catalogue AFRISUPPLY citées par ce
  //    restaurant (équivalents, offres, stock, commandes, recettes…). Le fichier reste autonome :
  //    il se recharge dans une base vide, sans dépendre d'un catalogue préexistant.
  const cites = referencedProductIds(tables);
  const refRows = cites.length
    ? await db.select().from(products).where(and(inArray(products.id, cites), isNull(products.restaurantId))) as Record<string, unknown>[]
    : [];
  tables.products_reference = jsonSafe(refRows);

  const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
  const payload = { version: BACKUP_VERSION, restaurant: { id: restaurant.id, name: restaurant.name }, tables };
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), mode,
    restaurant: jsonSafe([restaurant as Record<string, unknown>])[0],
    tables, counts,
    totals: { tables: Object.keys(counts).length, rows: Object.values(counts).reduce((a, b) => a + b, 0) },
    checksum: checksumOf(payload),
  };
}

/** Vérifie un fichier SANS rien écrire : format, empreinte, cohérence des compteurs. */
export function verifyBackup(backup: unknown) {
  const problems: string[] = [];
  const b = backup as BackupFile | null;
  if (!b || typeof b !== 'object') return { ok: false, problems: ['Fichier illisible : ce n’est pas du JSON.'] };
  if (b.format !== BACKUP_FORMAT) problems.push(`Format inattendu : « ${String((b as BackupFile).format)} » (attendu « ${BACKUP_FORMAT} »).`);
  if (Number(b.version) > BACKUP_VERSION) problems.push(`Version de sauvegarde ${b.version} plus récente que le logiciel (${BACKUP_VERSION}) : mettez à jour AFRISUPPLY avant de restaurer.`);
  const tables = b.tables ?? {};
  const inconnues = Object.keys(tables).filter((k) => !BACKUP_TABLES.some((t) => t.name === k));
  if (inconnues.length) problems.push(`Tableaux inconnus ignorés à la restauration : ${inconnues.join(', ')}.`);
  const countsRecalcules: Record<string, number> = {};
  for (const [k, v] of Object.entries(tables)) {
    if (!Array.isArray(v)) { problems.push(`Le tableau « ${k} » n’est pas une liste de lignes.`); continue; }
    countsRecalcules[k] = v.length;
    if (typeof b.counts?.[k] === 'number' && b.counts[k] !== v.length) problems.push(`« ${k} » : le compteur annonce ${b.counts[k]} ligne(s), le fichier en contient ${v.length}.`);
  }
  const attendu = checksumOf({ version: BACKUP_VERSION, restaurant: { id: b.restaurant?.id as string, name: b.restaurant?.name as string }, tables });
  const checksumOk = attendu === b.checksum;
  if (!checksumOk) problems.push('Empreinte SHA-256 différente : le fichier a été modifié (ou tronqué) depuis sa création.');
  const manquants = BACKUP_TABLES.map((t) => t.name).filter((n) => !(n in tables));
  const notes: string[] = [];
  if (b.mode === 'owner') notes.push('Fichier « propriétaire » : les empreintes de mots de passe n’y sont pas (volontairement). Après restauration, chaque membre de l’équipe devra choisir un nouveau mot de passe.');
  return {
    ok: problems.length === 0, checksumOk, problems, notes, counts: countsRecalcules,
    totals: { tables: Object.keys(countsRecalcules).length, rows: Object.values(countsRecalcules).reduce((a, b2) => a + b2, 0) },
    absentTables: manquants,
    createdAt: b.createdAt ?? null, restaurant: b.restaurant ? { id: b.restaurant.id, name: b.restaurant.name } : null, mode: b.mode ?? null,
  };
}

/** Convertit une valeur JSON en valeur acceptée par la base (les dates redeviennent des dates). */
function coerceRow(table: BackupTable, columns: Record<string, { dataType: string }>, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const col = columns[k];
    if (!col) continue;                              // colonne disparue : on ignore proprement
    if (v === null || v === undefined) { out[k] = null; continue; }
    out[k] = col.dataType === 'date' && typeof v === 'string' ? new Date(v) : v;
  }
  return out;
}

const CHUNK = 200;

export interface RestoreReport {
  ok: boolean;
  inserted: Record<string, number>;
  skipped: { table: string; id: string | null; reason: string }[];
  /** Comptes restaurés sans mot de passe utilisable : à réinitialiser par leur titulaire. */
  accountsToReset: string[];
  /** Tables du restaurant dont le nombre de lignes restaurées diffère du fichier : preuve de complétude. */
  incomplets: string[];
  totals: { inserted: number; skipped: number };
  verification: ReturnType<typeof verifyBackup>;
  restaurantId: string | null;
  tookMs: number;
}

/**
 * Restaure une sauvegarde dans la base courante.
 * Refus par défaut si la base contient déjà des restaurants : une restauration qui écrase
 * silencieusement des données existantes est un accident, pas une fonctionnalité.
 */
export async function restoreBackup(backup: BackupFile, opts: { allowNonEmpty?: boolean; db?: Db } = {}): Promise<RestoreReport> {
  const started = Date.now();
  // La base est injectable pour une seule raison : prouver la restauration dans une base NEUVE
  // (tests), exactement avec le même code que celui qui tournera en production.
  const db = opts.db ?? (await getDb());
  const verification = verifyBackup(backup);
  if (!verification.checksumOk) throw new Error('Restauration refusée : l’empreinte du fichier ne correspond pas (fichier modifié ou incomplet).');
  const existing = await db.select({ id: restaurants.id }).from(restaurants);
  if (existing.length && !opts.allowNonEmpty) {
    throw new Error(`Restauration refusée : la base contient déjà ${existing.length} restaurant(s). Utilisez une base vide (base neuve) ou forcez explicitement.`);
  }
  const inserted: Record<string, number> = {};
  const skipped: RestoreReport['skipped'] = [];
  const accountsToReset: string[] = [];
  let restaurantId: string | null = null;

  // Un fichier remis au restaurant ne contient AUCUNE empreinte de mot de passe (c'est voulu).
  // Sans ça, la ligne de `users` violerait la contrainte NOT NULL et TOUTE la restauration
  // échouerait en cascade — un fichier de sauvegarde qui ne se recharge pas n'est pas une
  // sauvegarde. On restaure donc le compte avec un mot de passe inutilisable, et on le dit :
  // chaque personne concernée en choisit un nouveau (mot de passe oublié).
  const unusablePassword = () => `!invalide-${randomUUID()}`;
  // Copie (jamais de modification du fichier reçu) : sinon l'empreinte du fichier ne correspondrait
  // plus après une restauration, et une seconde vérification accuserait le fichier à tort.
  const prepared: Record<string, Record<string, unknown>[]> = {};
  for (const t of BACKUP_TABLES) {
    const rows = (backup.tables?.[t.name] ?? []) as Record<string, unknown>[];
    prepared[t.name] = rows.map((row) => {
      if (t.name !== 'users' || row.passwordHash) return { ...row };
      accountsToReset.push(String(row.email ?? row.id ?? ''));
      return { ...row, passwordHash: unusablePassword() };
    });
  }

  // Les clés étrangères sont réelles : l'ordre d'insertion n'est pas cosmétique.
  // 1) le restaurant, 2) les comptes de l'équipe, 3) les tables rattachées à l'un ou l'autre
  // (restaurant_members référence le restaurant ET l'utilisateur), 4) les enfants, 5) les tiers.
  const insertTable = async (t: BackupTable) => {
    const rows = prepared[t.name] ?? [];
    inserted[t.name] = 0;
    if (!rows.length) return;
    const columns = getTableColumns(t.table) as unknown as Record<string, { dataType: string }>;
    const coerced = rows.map((r) => coerceRow(t, columns, r));
    const insert = (values: unknown) => t.conflictSafe
      ? db.insert(t.table).values(values as never).onConflictDoNothing()
      : db.insert(t.table).values(values as never);
    for (let i = 0; i < coerced.length; i += CHUNK) {
      const lot = coerced.slice(i, i + CHUNK);
      try {
        await insert(lot);
        inserted[t.name] += lot.length;
      } catch {
        // Un lot peut échouer pour une seule ligne (référence de tiers absente) : on reprend ligne
        // par ligne pour ne perdre QUE ce qui est réellement impossible à restaurer, et on le dit.
        for (const ligne of lot) {
          try { await insert(ligne); inserted[t.name] += 1; }
          catch (e) { skipped.push({ table: t.name, id: ligne.id ? String(ligne.id) : null, reason: (e as Error).message.split('\n')[0].slice(0, 180) }); }
        }
      }
    }
    // Lignes de référentiel déjà présentes dans la base cible : on ne les a pas insérées, mais elles
    // SONT là — le compte doit dire « présent », pas « inséré ». Sinon la complétude mentirait.
    if (t.conflictSafe) {
      const ids = coerced.map((r) => r.id).filter(Boolean) as string[];
      if (ids.length) {
        const [row] = await db.select({ n: sql<number>`count(*)` }).from(t.table).where(inArray(rid(t) as never, ids));
        inserted[t.name] = Number(row?.n ?? 0);
      }
    }
  };

  const resto = backup.restaurant as Record<string, unknown> | undefined;
  if (resto?.id) {
    const cols = getTableColumns(restaurants) as unknown as Record<string, { dataType: string }>;
    try {
      await db.insert(restaurants).values(coerceRow({ name: 'restaurants', table: restaurants, scope: 'restaurant' }, cols, resto) as never);
      inserted.restaurants = 1; restaurantId = String(resto.id);
    } catch (e) { skipped.push({ table: 'restaurants', id: String(resto.id), reason: (e as Error).message.split('\n')[0].slice(0, 180) }); }
  }

  for (const t of BACKUP_TABLES.filter((x) => x.scope === 'members')) await insertTable(t);
  for (const t of BACKUP_TABLES.filter((x) => x.scope === 'reference')) await insertTable(t);
  for (const t of BACKUP_TABLES.filter((x) => x.scope !== 'members' && x.scope !== 'reference')) await insertTable(t);

  const totalInserted = Object.values(inserted).reduce((a, b) => a + b, 0);
  // Preuve de complétude : tout ce qui appartient au restaurant doit être là ; seules les données
  // de tiers peuvent manquer, et elles sont listées nommément.
  const propres = BACKUP_TABLES.filter((t) => t.scope !== 'external').map((t) => t.name);
  const incomplets = propres.filter((n) => (inserted[n] ?? 0) !== (backup.counts?.[n] ?? 0));
  return {
    ok: incomplets.length === 0 && !skipped.some((s) => !BACKUP_TABLES.some((t) => t.name === s.table && t.scope === 'external')),
    inserted, skipped: skipped.slice(0, 50),
    incomplets, accountsToReset,
    totals: { inserted: totalInserted, skipped: skipped.length },
    verification, restaurantId, tookMs: Date.now() - started,
  };
}

/**
 * ESSAI DE RESTAURATION RÉEL, dans une base neuve et jetable.
 * Vérifier une empreinte prouve que le fichier est intact ; cela ne prouve pas qu'il se recharge.
 * Ici on va jusqu'au bout : base neuve en mémoire, migrations, restauration, comptage des lignes,
 * puis on jette la base. C'est la seule preuve qui vaut avant de dire « nos sauvegardes marchent ».
 */
export async function restoreDrill(backup: BackupFile) {
  const started = Date.now();
  const dir = `memory://afs-drill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const db = await openDatabase(dir);
  try {
    await runMigrations(db);
    const report = await restoreBackup(backup, { db });
    // Contre-vérification indépendante de la restauration : on recompte dans la base neuve.
    const counts: Record<string, number> = {};
    for (const t of BACKUP_TABLES) {
      const [row] = await db.select({ n: sql<number>`count(*)` }).from(t.table);
      counts[t.name] = Number(row?.n ?? 0);
    }
    const [restoCount] = await db.select({ n: sql<number>`count(*)` }).from(restaurants);
    return {
      ok: report.ok, dir, restaurantId: backup.restaurant?.id ? String(backup.restaurant.id) : null, tookMs: Date.now() - started,
      inserted: report.inserted, incomplets: report.incomplets, skipped: report.skipped.slice(0, 20), totals: report.totals,
      accountsToReset: report.accountsToReset, notes: report.verification.notes ?? [],
      relu: { restaurants: Number(restoCount?.n ?? 0), tables: counts, rows: Object.values(counts).reduce((a, b) => a + b, 0) },
      verification: report.verification,
    };
  } finally {
    // Base jetable : on libère réellement la ressource (sinon l'essai fuit de la mémoire à chaque appel).
    try { await (db as unknown as { $client?: { close: () => Promise<void> } }).$client?.close(); } catch { /* déjà fermée */ }
  }
}

// ---------------------------------------------------------------- fichiers

const exists = async (p: string) => { try { await fs.access(p); return true; } catch { return false; } };

export const backupDir = () => process.env.BACKUP_DIR ?? path.join(process.cwd(), '.backups');
export const retentionDays = () => Math.max(1, Number(process.env.BACKUP_KEEP ?? 14));

export interface BackupStored { name: string; sizeBytes: number; createdAt: string; restaurantId: string | null; restaurantName: string | null; rows: number; tables: number; checksum: string | null; version: number | null; mode: string | null }

/** Écrit le fichier sur disque (gzip) + une fiche lisible à côté : lister ne demande pas de décompresser. */
export async function writeBackupFile(backup: BackupFile, dir = backupDir()) {
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);   // AAAAMMJJTHHMMSS
  const base = `afs-${String(backup.restaurant.id).slice(0, 8)}-${stamp}-${backup.mode}`;
  // Deux sauvegardes lancées dans la même seconde ne doivent JAMAIS s'écraser l'une l'autre :
  // on suffixe plutôt que de perdre silencieusement un fichier.
  let name = `${base}.json.gz`;
  for (let i = 2; await exists(path.join(dir, name)); i++) name = `${base}-${i}.json.gz`;
  const body = gzipSync(Buffer.from(JSON.stringify(backup)));
  await fs.writeFile(path.join(dir, name), body);
  const meta: BackupStored = {
    name, sizeBytes: body.length, createdAt: backup.createdAt, restaurantId: String(backup.restaurant.id),
    restaurantName: String(backup.restaurant.name ?? ''), rows: backup.totals.rows, tables: backup.totals.tables,
    checksum: backup.checksum, version: backup.version, mode: backup.mode,
  };
  await fs.writeFile(path.join(dir, `${name}.meta.json`), JSON.stringify(meta, null, 2));
  return meta;
}

export async function listBackups(dir = backupDir()): Promise<BackupStored[]> {
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json.gz.meta.json'));
    const out: BackupStored[] = [];
    for (const f of files) {
      try { out.push(JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')) as BackupStored); } catch { /* fiche illisible : ignorée */ }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch { return []; }
}

export async function readBackupFile(name: string, dir = backupDir()): Promise<BackupFile> {
  if (!/^[A-Za-z0-9._-]+\.json\.gz$/.test(name)) throw new Error('Nom de sauvegarde invalide');
  const raw = await fs.readFile(path.join(dir, name));
  return JSON.parse(gunzipSync(raw).toString('utf8')) as BackupFile;
}

/** Rotation : on ne garde que les N derniers fichiers par restaurant (14 par défaut). */
export async function pruneBackups(keep = retentionDays(), dir = backupDir()) {
  const all = await listBackups(dir);
  const kept: string[] = []; const removed: string[] = [];
  const byRestaurant = new Map<string, BackupStored[]>();
  for (const b of all) { const k = b.restaurantId ?? 'inconnu'; byRestaurant.set(k, [...(byRestaurant.get(k) ?? []), b]); }
  for (const [, list] of byRestaurant) {
    for (const b of list.slice(keep)) {
      await fs.rm(path.join(dir, b.name), { force: true });
      await fs.rm(path.join(dir, `${b.name}.meta.json`), { force: true });
      removed.push(b.name);
    }
    kept.push(...list.slice(0, keep).map((b) => b.name));
  }
  return { kept, removed, keep };
}

/** Sauvegarde de tous les restaurants (ou d'un seul) : utilisé par le job quotidien et le bouton admin. */
export async function backupAllRestaurants(opts: { restaurantId?: string; dir?: string } = {}) {
  const db = await getDb();
  const list = opts.restaurantId
    ? [{ id: opts.restaurantId, name: '' }]
    : await db.select({ id: restaurants.id, name: restaurants.name }).from(restaurants);
  const written: BackupStored[] = []; const errors: { restaurantId: string; error: string }[] = [];
  for (const r of list) {
    try {
      const backup = await exportRestaurant(r.id, { mode: 'admin' });
      written.push(await writeBackupFile(backup, opts.dir ?? backupDir()));
    } catch (e) { errors.push({ restaurantId: r.id, error: (e as Error).message }); }
  }
  const pruned = errors.length ? { removed: [], keep: retentionDays() } : await pruneBackups(retentionDays(), opts.dir ?? backupDir());
  return { written, errors, removed: pruned.removed, keep: retentionDays(), dir: opts.dir ?? backupDir() };
}

/** Espace disque utilisé par les sauvegardes (pour l'afficher honnêtement dans le back-office). */
export async function backupStorageStats(dir = backupDir()) {
  const list = await listBackups(dir);
  const rows = list.length ? await getDb().then((db) => db.select({ n: sql<number>`count(*)` }).from(restaurants)) : [];
  return {
    dir, files: list.length, bytes: list.reduce((a, b) => a + b.sizeBytes, 0),
    last: list[0] ?? null, restaurants: rows.length ? Number(rows[0].n) : 0, keep: retentionDays(),
  };
}

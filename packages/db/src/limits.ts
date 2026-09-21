// =============================================================
// AFRISUPPLY — Plafonds de plausibilité des quantités
//
// Pourquoi : un restaurateur peut saisir « 25000000 » au lieu de
// « 25 » et générer un bon de commande à 42 M€ (constat d'audit).
// On encadre donc chaque quantité par un plafond **explicable**,
// dérivé des données réelles du restaurant :
//   1. historique de consommation (mouvements des 28 et 90 derniers jours)
//   2. à défaut : seuil critique × 30 jours × 6
//   3. à défaut : ordre de grandeur de la catégorie de produit
//
// Le plafond n'est jamais bloquant pour un besoin légitime : le
// client peut le franchir explicitement (voir `override` dans les
// routes de commande), auquel cas la décision est tracée.
// =============================================================

import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from './client.js';
import { inventoryItems, products, stockMovements } from './schema.js';

/** Nombre de mois de consommation qu'une commande ne doit pas dépasser sans confirmation explicite. */
export const ORDER_MAX_MONTHS_OF_STOCK = Number(process.env.ORDER_MAX_MONTHS_OF_STOCK ?? 12);

/** Plafond de secours par catégorie, en unité de base par mois, pour un produit jamais consommé. */
const CATEGORY_MONTHLY_FALLBACK: Record<string, number> = {
  feculents: 40, frais: 40, viandes_poissons: 30, epicerie: 20, boissons: 20, emballages: 50,
};

// -------------------------------------------------------------
// Chantier 1 (audit) — démarrage à froid : seuils par défaut
//
// Avant : un produit ajouté au suivi l'était avec `critical_level = 0`.
// Résultat : aucune recommandation possible (« rien à commander » alors
// que le stock est à zéro), et des alertes absurdes (« sous votre seuil
// critique de 0 kg »). Désormais tout produit suivi naît avec un seuil
// critique (≈ 3 jours de conso) et un objectif (≈ 7 jours), dérivés de
// l'ordre de grandeur de sa catégorie. L'utilisateur peut les ajuster.
// -----------------------------------------------------------------------

/** Seuils par défaut à l'ajout d'un produit au suivi : ≈3 jours en critique, ≈7 jours en objectif. */
export function defaultThresholds(category: string | null | undefined): { criticalLevel: number; targetLevel: number } {
  const monthly = CATEGORY_MONTHLY_FALLBACK[category ?? ''] ?? 20;
  const round1 = (v: number) => Math.round(v * 10) / 10;
  return {
    criticalLevel: Math.max(1, round1(monthly / 10)),   // ≈ 3 jours de consommation
    targetLevel: Math.max(2, round1(monthly / 4)),      // ≈ 7–8 jours de consommation
  };
}

export type TrackedItem = { id: string; productId: string; criticalLevel: number; targetLevel: number | null };

/**
 * Ajoute des produits au stock suivi AVEC des seuils explicites (jamais 0/0 silencieux).
 * Idempotent : un produit déjà suivi garde ses réglages (on n'écrase jamais la configuration).
 * `opts.criticalLevel` force un seuil commun (objectif = max(défaut, 2 × seuil)).
 */
export async function trackProducts(
  restaurantId: string,
  productIds: string[],
  opts: { criticalLevel?: number | null } = {},
): Promise<TrackedItem[]> {
  const db = await getDb();
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return [];
  const prods = await db.select({ id: products.id, category: products.category }).from(products).where(inArray(products.id, ids));
  const catById = new Map(prods.map((p) => [p.id, p.category as string]));
  const rows = ids.map((productId) => {
    const d = defaultThresholds(catById.get(productId));
    const critical = opts.criticalLevel ?? d.criticalLevel;
    const target = Math.max(d.targetLevel, critical * 2);
    return {
      restaurantId, productId,
      quantity: '0',
      criticalLevel: critical.toFixed(3),
      targetLevel: target.toFixed(3),
    };
  });
  const ins = await db.insert(inventoryItems).values(rows)
    .onConflictDoNothing({ target: [inventoryItems.restaurantId, inventoryItems.productId] })
    .returning({ id: inventoryItems.id, productId: inventoryItems.productId, criticalLevel: inventoryItems.criticalLevel, targetLevel: inventoryItems.targetLevel });
  return ins.map((r) => ({ id: r.id, productId: r.productId, criticalLevel: Number(r.criticalLevel), targetLevel: r.targetLevel === null ? null : Number(r.targetLevel) }));
}

export type QuantityCeiling = {
  /** Quantité maximale (en unité de base) acceptée sans confirmation explicite. */
  maxQuantity: number;
  /** Même plafond exprimé en colis, pour le conditionnement demandé. */
  maxPacks: number;
  /** Consommation mensuelle mesurée (0 si le produit n'a jamais été consommé). */
  monthlyUse: number;
  /** Sur quoi le plafond repose : historique réel, seuil saisi, ou ordre de grandeur. */
  basis: 'historique' | 'seuil' | 'categorie';
};

/** Consommation mensuelle mesurée d'un produit, en unité de base (max du rythme à 28 j et de la moyenne 90 j). */
export async function measuredMonthlyUse(restaurantId: string, productId: string): Promise<number> {
  const db = await getDb();
  const [item] = await db.select({ id: inventoryItems.id }).from(inventoryItems)
    .where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.productId, productId)));
  if (!item) return 0;
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const [agg] = await db.select({
    use28: sql<number>`coalesce(sum(abs(${stockMovements.quantity})) filter (where ${stockMovements.type} in ('consommation','perte') and ${stockMovements.createdAt} >= ${day(28)}), 0)`,
    use90: sql<number>`coalesce(sum(abs(${stockMovements.quantity})) filter (where ${stockMovements.type} in ('consommation','perte') and ${stockMovements.createdAt} >= ${day(90)}), 0)`,
  }).from(stockMovements).where(eq(stockMovements.inventoryItemId, item.id));
  const use28 = Number(agg?.use28 ?? 0);
  const use90 = Number(agg?.use90 ?? 0);
  // 28 jours ≈ 1 mois ; 90 jours / 3 = moyenne mensuelle du trimestre.
  return Math.max(use28, use90 / 3);
}

/** Plafond de quantité pour un produit chez un restaurant, pour un conditionnement donné. */
export async function quantityCeiling(
  restaurantId: string,
  opts: { productId: string; packQty: number; criticalLevel?: number | null; category?: string | null },
): Promise<QuantityCeiling> {
  const packQty = opts.packQty > 0 ? opts.packQty : 1;
  const monthlyUse = await measuredMonthlyUse(restaurantId, opts.productId);

  let basis: QuantityCeiling['basis'] = 'historique';
  let monthly = monthlyUse;
  if (monthly <= 0) {
    const critical = Number(opts.criticalLevel ?? 0);
    if (critical > 0) { monthly = critical * 30; basis = 'seuil'; }
    else { monthly = CATEGORY_MONTHLY_FALLBACK[opts.category ?? ''] ?? 20; basis = 'categorie'; }
  }

  const maxQuantity = Math.round(monthly * ORDER_MAX_MONTHS_OF_STOCK * 1000) / 1000;
  const maxPacks = Math.max(1, Math.ceil(maxQuantity / packQty));
  return { maxQuantity, maxPacks, monthlyUse, basis };
}

/** Message d'erreur actionnable, en français, expliquant le plafond atteint. */
export function ceilingMessage(productName: string, maxPacks: number, maxQuantity: number, unit: string, months: number, basis: QuantityCeiling['basis']): string {
  const reason = basis === 'historique'
    ? `vu votre consommation des derniers mois`
    : basis === 'seuil'
      ? `vu votre seuil critique (aucune consommation enregistrée)`
      : `aucune consommation connue : ordre de grandeur par défaut`;
  return `${productName} : ${maxPacks} colis maximum en une commande (${Math.round(maxQuantity)} ${unit}, soit ${months} mois de stock ${reason}). ` +
    `Corrigez la quantité, ou confirmez explicitement si ce volume est volontaire.`;
}

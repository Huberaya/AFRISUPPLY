// Référence de commande unique sur toute la plateforme : AFS-AAAA-NNNNNN (l'index orders_ref est global, pas par restaurant).
import { sql } from 'drizzle-orm';
import { getDb } from '@afrisupply/db';
import { isUniqueViolation } from './orders.js';

/**
 * Rattrapage de la séquence — trouvé par la vérification de bout en bout, pas par relecture.
 *
 * Une base peut contenir DÉJÀ des commandes : jeu de démonstration, **restauration d'une sauvegarde**
 * (chantier 12), import, base recréée. Dans ce cas `create sequence if not exists` repart de 1 alors
 * que des références AFS-AAAA-NNNNNN existent plus haut : la première commande créée entre en
 * collision, et sans gestion, le restaurant ne peut PLUS COMMANDER DU TOUT (HTTP 500 constaté).
 *
 * On aligne donc la séquence sur la plus grande référence réelle avant de tirer la suivante.
 * `greatest(...)` garantit qu'on ne recule jamais quand la séquence est déjà en avance.
 */
/**
 * Rattrapage GÉNÉRIQUE d'une séquence de numérotation : on l'aligne sur le plus grand numéro
 * réellement présent dans la table, jamais en arrière.
 *
 * Pourquoi c'est indispensable (et pourquoi ce n'est pas théorique) : `create sequence if not
 * exists` démarre à 1. Sur une base qui contient DÉJÀ des numéros — jeu de démonstration,
 * **restauration d'une sauvegarde** (chantier 12), migration, réimport — la première commande ou
 * facture créée entre en collision avec l'existant. Sans rattrapage : erreur 500 côté API, et un
 * restaurant dans cet état ne peut plus commander du tout. Constaté sur l'instance réelle, corrigé
 * ici, vérifié par test et par la passe de bout en bout complète.
 *
 * Les paramètres sont des constantes internes (aucune donnée utilisateur) : `sql.raw` est employé
 * pour les identifiants, les valeurs restant paramétrées.
 */
export async function syncSequenceToMax(opts: {
  /** Nom de la séquence, ex. `order_ref_seq`. */
  sequence: string;
  /** Table qui porte les numéros, ex. `orders`. */
  table: string;
  /** Colonne qui porte les numéros, ex. `reference`. */
  column: string;
  /** Position du premier chiffre du numéro dans la chaîne (1 = début), ex. 10 pour `AFS-2026-000001`. */
  digitsFrom: number;
  /** Motif des numéros légitimes, ex. `^AFS-[0-9]{4}-[0-9]+$`. */
  pattern: string;
}): Promise<number> {
  const db = await getDb();
  await db.execute(sql.raw(`create sequence if not exists ${opts.sequence}`));
  // On lit, puis on n'écrit que si la séquence est réellement en retard : `setval` refuse 0 (une
  // séquence commence à 1) et une base neuve ne doit pas être modifiée pour rien.
  const res = await db.execute(sql.raw(`
    select
      coalesce((select last_value from pg_sequences where schemaname = current_schema() and sequencename = '${opts.sequence}'), 0) as cur,
      coalesce((select max(substring(${opts.column} from ${opts.digitsFrom})::int) from ${opts.table} where ${opts.column} ~ '${opts.pattern}'), 0) as maxref`));
  const rows = (res as unknown as { rows?: Record<string, unknown>[] }).rows ?? (res as unknown as Record<string, unknown>[]);
  const row = (Array.isArray(rows) ? rows[0] : rows) as { cur: string | number; maxref: string | number };
  const cur = Number(row?.cur ?? 0);
  const maxref = Number(row?.maxref ?? 0);
  if (maxref > cur) {
    await db.execute(sql.raw(`select setval('${opts.sequence}', ${maxref}, true)`));
    return maxref;
  }
  return cur;
}

/** Références de commande `AFS-AAAA-NNNNNN`. */
export const syncOrderReferenceSequence = () =>
  syncSequenceToMax({ sequence: 'order_ref_seq', table: 'orders', column: 'reference', digitsFrom: 10, pattern: '^AFS-[0-9]{4}-[0-9]+$' });

export async function nextOrderReference(): Promise<string> {
  const db = await getDb();
  await syncOrderReferenceSequence();
  const res = await db.execute(sql`select nextval('order_ref_seq') as v`);
  const rows = (res as unknown as { rows?: { v: string | number }[] }).rows ?? (res as unknown as { v: string | number }[]);
  const v = Number((Array.isArray(rows) ? rows[0] : rows).v);
  return `AFS-${new Date().getFullYear()}-${String(v).padStart(6, '0')}`;
}

/**
 * Chantier 6 (audit) — la référence de commande est unique sur toute la plateforme. Si une collision
 * survient (base restaurée d'une sauvegarde, compteur de séquence en retard…), on ne perd pas la
 * commande et on ne casse pas le job : on tire une nouvelle référence et on réessaie.
 *
 * Chantier 12 (suite) : en cas de collision on réaligne AUSSI la séquence (voir ci-dessus), sinon 4
 * essais ne suffisent pas quand la séquence a cent références de retard (cas réel constaté).
 */
export async function insertWithFreshReference<T>(insert: (reference: string) => Promise<T>, tries = 4): Promise<T> {
  let last: unknown = null;
  for (let i = 0; i < tries; i += 1) {
    const reference = await nextOrderReference();
    try { return await insert(reference); }
    catch (e) {
      last = e;
      if (!isUniqueViolation(e, 'orders_ref')) throw e;
      await syncOrderReferenceSequence();
    }
  }
  throw last;
}

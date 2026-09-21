// Référence de commande unique sur toute la plateforme : AFS-AAAA-NNNNNN (l'index orders_ref est global, pas par restaurant).
import { sql } from 'drizzle-orm';
import { getDb } from '@afrisupply/db';
import { isUniqueViolation } from './orders.js';

export async function nextOrderReference(): Promise<string> {
  const db = await getDb();
  await db.execute(sql`create sequence if not exists order_ref_seq`);
  const res = await db.execute(sql`select nextval('order_ref_seq') as v`);
  const rows = (res as unknown as { rows?: { v: string | number }[] }).rows ?? (res as unknown as { v: string | number }[]);
  const v = Number((Array.isArray(rows) ? rows[0] : rows).v);
  return `AFS-${new Date().getFullYear()}-${String(v).padStart(6, '0')}`;
}

/**
 * Chantier 6 (audit) — la référence de commande est unique sur toute la plateforme. Si une collision
 * survient (base restaurée d'une sauvegarde, compteur de séquence en retard…), on ne perd pas la
 * commande et on ne casse pas le job : on tire une nouvelle référence et on réessaie.
 */
export async function insertWithFreshReference<T>(insert: (reference: string) => Promise<T>, tries = 4): Promise<T> {
  let last: unknown = null;
  for (let i = 0; i < tries; i += 1) {
    const reference = await nextOrderReference();
    try { return await insert(reference); }
    catch (e) { last = e; if (!isUniqueViolation(e, 'orders_ref')) throw e; }
  }
  throw last;
}

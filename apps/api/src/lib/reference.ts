// Référence de commande unique sur toute la plateforme : AFS-AAAA-NNNNNN (l'index orders_ref est global, pas par restaurant).
import { sql } from 'drizzle-orm';
import { getDb } from '@afrisupply/db';

export async function nextOrderReference(): Promise<string> {
  const db = await getDb();
  await db.execute(sql`create sequence if not exists order_ref_seq`);
  const res = await db.execute(sql`select nextval('order_ref_seq') as v`);
  const rows = (res as unknown as { rows?: { v: string | number }[] }).rows ?? (res as unknown as { v: string | number }[]);
  const v = Number((Array.isArray(rows) ? rows[0] : rows).v);
  return `AFS-${new Date().getFullYear()}-${String(v).padStart(6, '0')}`;
}

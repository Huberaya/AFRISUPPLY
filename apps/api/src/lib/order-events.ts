// Chantier 20/23 — chronologie d'une commande (partagée restaurant / grossiste).
import { asc, eq } from 'drizzle-orm';
import { getDb, orderEvents } from '@afrisupply/db';

export type OrderEventType = 'sent' | 'confirmed' | 'refused' | 'preparing' | 'shipped' | 'delivered' | 'received' | 'cancelled' | 'note';
export async function logOrderEvent(orderId: string, type: OrderEventType, label: string, actor: 'restaurant' | 'vendor' | 'system' = 'system', meta?: Record<string, unknown>) {
  try { const db = await getDb(); await db.insert(orderEvents).values({ orderId, type, label, actor, meta }); } catch (e) { console.warn('[order-events]', (e as Error).message); }
}
export async function orderTimeline(orderId: string) {
  const db = await getDb();
  return db.select().from(orderEvents).where(eq(orderEvents.orderId, orderId)).orderBy(asc(orderEvents.at));
}

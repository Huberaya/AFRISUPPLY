// Chantier 27 — Avis restaurants → grossistes, réponse du grossiste, lecture publique.
import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb, vendorReviews, orders, vendors, restaurants, vendorMembers } from '@afrisupply/db';
import { requireAuth, requireRestaurant, type Env } from '../lib/auth.js';
import { logOrderEvent } from '../lib/order-events.js';
import { reliabilityFor, emptyReliability } from '../lib/reliability.js';

const pub = (r: typeof vendorReviews.$inferSelect, restaurantName: string) => ({ id: r.id, rating: r.rating, onTime: r.onTime, conform: r.conform, comment: r.comment, vendorReply: r.vendorReply, createdAt: r.createdAt, restaurantName: restaurantName.length > 2 ? `${restaurantName.slice(0, 1)}${'*'.repeat(Math.min(6, restaurantName.length - 2))}${restaurantName.slice(-1)}` : restaurantName, city: null as string | null });

// ---- public (vitrine) ----
export const publicReviewRoutes = new Hono<Env>();
publicReviewRoutes.get('/public/vendors/:id/reviews', async (c) => {
  const db = await getDb(); const vid = c.req.param('id');
  const rows = await db.select({ r: vendorReviews, name: restaurants.name, city: restaurants.city }).from(vendorReviews).innerJoin(restaurants, eq(restaurants.id, vendorReviews.restaurantId)).where(eq(vendorReviews.vendorId, vid)).orderBy(desc(vendorReviews.createdAt)).limit(50);
  return c.json({ reliability: (await reliabilityFor([vid])).get(vid) ?? emptyReliability, reviews: rows.map((x) => ({ ...pub(x.r, x.name), city: x.city })) });
});

// ---- restaurant ----
export const reviewRoutes = new Hono<Env>();
reviewRoutes.use('/reviews', requireAuth, requireRestaurant); reviewRoutes.use('/reviews/*', requireAuth, requireRestaurant); reviewRoutes.use('/orders/:id/review', requireAuth, requireRestaurant);
reviewRoutes.get('/reviews/pending', async (c) => {
  const db = await getDb(); const rid = c.get('restaurantId');
  const rows = await db.select({ id: orders.id, reference: orders.reference, deliveredAt: sql<string | null>`coalesce(${orders.deliveredAt}, ${orders.vendorDeliveredAt})`, status: orders.status, vendorName: vendors.name, vendorId: vendors.id, reviewed: vendorReviews.id }).from(orders).innerJoin(vendors, eq(vendors.id, orders.vendorId)).leftJoin(vendorReviews, eq(vendorReviews.orderId, orders.id)).where(and(eq(orders.restaurantId, rid))).orderBy(desc(sql`coalesce(${orders.deliveredAt}, ${orders.vendorDeliveredAt}, ${orders.createdAt})`)).limit(100);
  return c.json({ pending: rows.filter((r) => !r.reviewed && (['livree', 'livree_partiel'].includes(r.status) || r.deliveredAt)).slice(0, 10), reviewedOrderIds: rows.filter((r) => r.reviewed).map((r) => r.id) });
});
reviewRoutes.post('/orders/:id/review', async (c) => {
  const body = z.object({ rating: z.number().int().min(1).max(5), onTime: z.boolean().optional(), conform: z.boolean().optional(), comment: z.string().max(500).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb(); const rid = c.get('restaurantId'); const user = c.get('user');
  const [o] = await db.select().from(orders).where(and(eq(orders.id, c.req.param('id')), eq(orders.restaurantId, rid))); if (!o?.vendorId) return c.json({ error: 'Commande plateforme introuvable' }, 404);
  if (!['livree', 'livree_partiel'].includes(o.status) && !o.vendorDeliveredAt) return c.json({ error: 'Vous pourrez noter après la réception de la commande' }, 400);
  const [dup] = await db.select({ id: vendorReviews.id }).from(vendorReviews).where(eq(vendorReviews.orderId, o.id)); if (dup) return c.json({ error: 'Commande déjà notée' }, 409);
  const [r] = await db.insert(vendorReviews).values({ vendorId: o.vendorId, restaurantId: rid, orderId: o.id, rating: body.data.rating, onTime: body.data.onTime, conform: body.data.conform, comment: body.data.comment, createdBy: user.id }).returning();
  void logOrderEvent(o.id, 'note', `Avis du restaurant : ${'★'.repeat(body.data.rating)}${'☆'.repeat(5 - body.data.rating)}${body.data.comment ? ` — ${body.data.comment.slice(0, 80)}` : ''}`, 'restaurant');
  return c.json({ review: r, message: 'Merci ! Votre avis aide les autres restaurants et le fournisseur à progresser.' }, 201);
});

// ---- grossiste ----
type VEnv = { Variables: Env['Variables'] & { vendorId: string } };
export const vendorReviewRoutes = new Hono<VEnv>();
const guard = async (c: import('hono').Context<VEnv>, next: import('hono').Next) => { const db = await getDb(); const rows = await db.select({ vendorId: vendorMembers.vendorId }).from(vendorMembers).where(eq(vendorMembers.userId, c.get('user').id)); const w = c.req.header('x-vendor-id'); const vid = w && rows.some((r) => r.vendorId === w) ? w : rows[0]?.vendorId; if (!vid) return c.json({ error: 'Aucun espace fournisseur' }, 403); c.set('vendorId', vid); await next(); };
vendorReviewRoutes.use('/vendor/reviews', requireAuth, guard); vendorReviewRoutes.use('/vendor/reviews/*', requireAuth, guard);
vendorReviewRoutes.get('/vendor/reviews', async (c) => {
  const db = await getDb(); const vid = c.get('vendorId');
  const rows = await db.select({ r: vendorReviews, name: restaurants.name, reference: orders.reference }).from(vendorReviews).innerJoin(restaurants, eq(restaurants.id, vendorReviews.restaurantId)).innerJoin(orders, eq(orders.id, vendorReviews.orderId)).where(eq(vendorReviews.vendorId, vid)).orderBy(desc(vendorReviews.createdAt)).limit(100);
  return c.json({ reliability: (await reliabilityFor([vid])).get(vid) ?? emptyReliability, reviews: rows.map((x) => ({ ...x.r, restaurantName: x.name, orderReference: x.reference })) });
});
vendorReviewRoutes.post('/vendor/reviews/:id/reply', async (c) => {
  const body = z.object({ reply: z.string().min(2).max(500) }).safeParse(await c.req.json()); if (!body.success) return c.json({ error: 'Réponse requise' }, 400);
  const db = await getDb(); const vid = c.get('vendorId');
  const [r] = await db.update(vendorReviews).set({ vendorReply: body.data.reply, vendorRepliedAt: new Date() }).where(and(eq(vendorReviews.id, c.req.param('id')), eq(vendorReviews.vendorId, vid))).returning(); if (!r) return c.json({ error: 'Avis introuvable' }, 404);
  return c.json({ review: r });
});

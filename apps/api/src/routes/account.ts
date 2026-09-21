// RGPD : export des données personnelles + suppression de compte (droit d'accès / droit à l'effacement).
import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { deleteCookie } from 'hono/cookie';
import { getDb, users, restaurants, restaurantMembers, suppliers, products, inventoryItems, orders, orderLines, sales, recipes, alerts, reorderRules, deliveries, stockMovements, priceHistory, supplierOffers } from '@afrisupply/db';
import { requireAuth, verifyPassword, requireMinRole, type Env } from '../lib/auth.js';
import { audit } from '../lib/ops.js';

export const accountRoutes = new Hono<Env>();
accountRoutes.use('/account/*', requireAuth);

// Chantier 2 (audit) — exporter les données : responsable ; supprimer le compte : propriétaire.
accountRoutes.on(['GET'], '/account/export', requireMinRole('manager'));
accountRoutes.on(['DELETE'], '/account', requireMinRole('owner'));

/** Export complet (JSON) : profil + chaque restaurant dont l'utilisateur est membre. */
accountRoutes.get('/account/export', async (c) => {
  const db = await getDb(); const u = c.get('user');
  const [me] = await db.select({ id: users.id, email: users.email, fullName: users.fullName, phone: users.phone, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.id, u.id));
  const memberships = await db.select({ restaurant: restaurants, role: restaurantMembers.role }).from(restaurantMembers).innerJoin(restaurants, eq(restaurants.id, restaurantMembers.restaurantId)).where(eq(restaurantMembers.userId, u.id));
  const out: Record<string, unknown>[] = [];
  for (const m of memberships) {
    const rid = m.restaurant.id;
    const [sup, prod, inv, ord, sal, rec, al, rules, del, mov] = await Promise.all([
      db.select().from(suppliers).where(eq(suppliers.restaurantId, rid)), db.select().from(products).where(eq(products.restaurantId, rid)),
      db.select().from(inventoryItems).where(eq(inventoryItems.restaurantId, rid)), db.select().from(orders).where(eq(orders.restaurantId, rid)),
      db.select().from(sales).where(eq(sales.restaurantId, rid)), db.select().from(recipes).where(eq(recipes.restaurantId, rid)),
      db.select().from(alerts).where(eq(alerts.restaurantId, rid)), db.select().from(reorderRules).where(eq(reorderRules.restaurantId, rid)),
      db.select().from(deliveries).where(eq(deliveries.restaurantId, rid)), db.select().from(stockMovements).where(eq(stockMovements.restaurantId, rid)),
    ]);
    const orderIds = ord.map((o) => o.id); const supIds = sup.map((s) => s.id);
    const [lines, offers, prices] = await Promise.all([
      orderIds.length ? db.select().from(orderLines).where(inArray(orderLines.orderId, orderIds)) : [],
      supIds.length ? db.select().from(supplierOffers).where(inArray(supplierOffers.supplierId, supIds)) : [],
      db.select().from(priceHistory).where(eq(priceHistory.restaurantId, rid)),
    ]);
    out.push({ restaurant: m.restaurant, role: m.role, suppliers: sup, supplierOffers: offers, priceHistory: prices, products: prod, inventory: inv, stockMovements: mov, orders: ord, orderLines: lines, deliveries: del, sales: sal, recipes: rec, alerts: al, reorderRules: rules });
  }
  void audit('account.export', { actorEmail: u.email, target: u.id });
  c.header('Content-Disposition', `attachment; filename="afrisupply-export-${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json({ exportedAt: new Date().toISOString(), user: me, restaurants: out });
});

/** Suppression : mot de passe requis. Les restaurants dont l'utilisateur est le seul owner sont supprimés (cascade). */
accountRoutes.delete('/account', async (c) => {
  const body = z.object({ password: z.string(), confirm: z.literal('SUPPRIMER') }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Mot de passe et confirmation « SUPPRIMER » requis' }, 400);
  const db = await getDb(); const u = c.get('user');
  const [me] = await db.select().from(users).where(eq(users.id, u.id));
  if (!me || !(await verifyPassword(body.data.password, me.passwordHash))) return c.json({ error: 'Mot de passe incorrect' }, 401);
  const mine = await db.select({ rid: restaurantMembers.restaurantId, role: restaurantMembers.role }).from(restaurantMembers).where(eq(restaurantMembers.userId, u.id));
  const deleted: string[] = []; const left: string[] = [];
  for (const m of mine) {
    const others = await db.select({ id: restaurantMembers.userId }).from(restaurantMembers).where(and(eq(restaurantMembers.restaurantId, m.rid), eq(restaurantMembers.role, 'owner')));
    const soleOwner = m.role === 'owner' && others.every((o) => o.id === u.id);
    if (soleOwner) { await db.delete(restaurants).where(eq(restaurants.id, m.rid)); deleted.push(m.rid); } else left.push(m.rid);
  }
  await db.delete(users).where(eq(users.id, u.id));
  await audit('account.delete', { actorEmail: u.email, target: u.id, meta: { restaurantsDeleted: deleted.length, restaurantsLeft: left.length } });
  deleteCookie(c, 'afs_token', { path: '/' });
  return c.json({ ok: true, restaurantsDeleted: deleted.length, restaurantsLeft: left.length });
});

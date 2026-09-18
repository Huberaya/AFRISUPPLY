import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { setCookie, deleteCookie } from 'hono/cookie';
import { getDb, users, restaurants, restaurantMembers, leads } from '@afrisupply/db';
import { hashPassword, verifyPassword, signToken, requireAuth, type Env } from '../lib/auth.js';
import { audit } from '../lib/ops.js';

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const cookieOpts = { httpOnly: true, sameSite: 'Lax' as const, path: '/', maxAge: 60 * 60 * 24 * 30, secure: process.env.NODE_ENV === 'production' };

export const authRoutes = new Hono<Env>();

authRoutes.post('/register', async (c) => {
  const body = z.object({
    email: z.string().email(), password: z.string().min(8), fullName: z.string().min(2),
    restaurantName: z.string().min(2), city: z.string().optional(), coversPerDay: z.number().int().positive().optional(), inviteCode: z.string().max(20).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const d = body.data; const db = await getDb();

  const dup = await db.select({ id: users.id }).from(users).where(eq(users.email, d.email.toLowerCase())).limit(1);
  if (dup.length) return c.json({ error: 'Un compte existe déjà avec cet e-mail' }, 409);

  const [user] = await db.insert(users).values({ email: d.email.toLowerCase(), passwordHash: await hashPassword(d.password), fullName: d.fullName, lastLoginAt: new Date() }).returning();
  const slug = `${slugify(d.restaurantName)}-${user.id.slice(0, 6)}`;
  const trialEndsAt = new Date(Date.now() + 30 * 86_400_000);
  // Chantier 7 : code d'invitation pilote → restaurant fondateur (−50 % à vie), lead marqué « client »
  const code = d.inviteCode?.toUpperCase().trim();
  const [lead] = code ? await db.select().from(leads).where(eq(leads.inviteCode, code)) : [];
  const founder = !!lead && !lead.restaurantId;
  const [restaurant] = await db.insert(restaurants).values({ name: d.restaurantName, slug, city: d.city, coversPerDay: d.coversPerDay, plan: 'trial', trialEndsAt, founder, inviteCode: founder ? code : null }).returning();
  if (founder) await db.update(leads).set({ restaurantId: restaurant.id, status: 'client' }).where(eq(leads.id, lead.id));
  await db.insert(restaurantMembers).values({ restaurantId: restaurant.id, userId: user.id, role: 'owner' });

  const token = await signToken({ id: user.id, email: user.email, fullName: user.fullName });
  setCookie(c, 'afs_token', token, cookieOpts);
  return c.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName }, restaurant }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = z.object({ email: z.string().email(), password: z.string() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, body.data.email.toLowerCase())).limit(1);
  if (!user || !(await verifyPassword(body.data.password, user.passwordHash))) { void audit('login.failed', { actorEmail: body.data.email.toLowerCase(), meta: { ip: c.req.header('x-forwarded-for') } }); return c.json({ error: 'E-mail ou mot de passe incorrect' }, 401); }
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  const token = await signToken({ id: user.id, email: user.email, fullName: user.fullName });
  setCookie(c, 'afs_token', token, cookieOpts);
  return c.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName } });
});

authRoutes.post('/logout', (c) => { deleteCookie(c, 'afs_token', { path: '/' }); return c.json({ ok: true }); });

authRoutes.get('/me', requireAuth, async (c) => {
  const db = await getDb(); const user = c.get('user');
  const rows = await db.select({ restaurant: restaurants, role: restaurantMembers.role })
    .from(restaurantMembers).innerJoin(restaurants, eq(restaurants.id, restaurantMembers.restaurantId))
    .where(eq(restaurantMembers.userId, user.id));
  const isAdmin = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(user.email.toLowerCase());
  return c.json({ user: { ...user, isAdmin }, restaurants: rows.map((r) => ({ ...r.restaurant, role: r.role })) });
});

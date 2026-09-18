// Auth maison (remplace Supabase Auth) : mot de passe bcrypt + JWT HS256 (jose)
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, and } from 'drizzle-orm';
import { getDb, users, restaurantMembers } from '@afrisupply/db';

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret-change-me-in-production');
const TOKEN_TTL = '30d';

export type AuthUser = { id: string; email: string; fullName: string; phone?: string | null };

export async function hashPassword(pw: string) { return bcrypt.hash(pw, 10); }
export async function verifyPassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }

export async function signToken(user: AuthUser) {
  return new SignJWT({ email: user.email, fullName: user.fullName })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime(TOKEN_TTL).sign(secret);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return { id: payload.sub!, email: payload.email as string, fullName: payload.fullName as string };
  } catch { return null; }
}

export type Env = { Variables: { user: AuthUser; restaurantId: string } };

/** Middleware : exige un JWT (header Authorization: Bearer ou cookie afs_token). */
export async function requireAuth(c: Context<Env>, next: Next) {
  const header = c.req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : getCookie(c, 'afs_token');
  const user = token ? await verifyToken(token) : null;
  if (!user) return c.json({ error: 'Non authentifié' }, 401);
  const db = await getDb();
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!row) return c.json({ error: 'Utilisateur inconnu' }, 401);
  c.set('user', user);
  await next();
}

/** Middleware : résout le restaurant courant (header X-Restaurant-Id ou 1er restaurant du membre) et vérifie l'appartenance. */
export async function requireRestaurant(c: Context<Env>, next: Next) {
  const db = await getDb();
  const user = c.get('user');
  const wanted = c.req.header('x-restaurant-id');
  const memberships = await db.select({ restaurantId: restaurantMembers.restaurantId })
    .from(restaurantMembers).where(eq(restaurantMembers.userId, user.id));
  if (!memberships.length) return c.json({ error: 'Aucun restaurant associé' }, 403);
  const rid = wanted ?? memberships[0].restaurantId;
  if (!memberships.some((m) => m.restaurantId === rid)) return c.json({ error: 'Accès refusé à ce restaurant' }, 403);
  c.set('restaurantId', rid);
  await next();
}

export const membershipWhere = (userId: string, restaurantId: string) =>
  and(eq(restaurantMembers.userId, userId), eq(restaurantMembers.restaurantId, restaurantId));

// Auth maison (remplace Supabase Auth) : mot de passe bcrypt + JWT HS256 (jose)
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, and } from 'drizzle-orm';
import { getDb, users, restaurantMembers, restaurants } from '@afrisupply/db';
import { accessState, billingEnforced, PLAN_RANK } from './billing.js';

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

export type Env = { Variables: { user: AuthUser; restaurantId: string; plan: string } };

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
  // Chantier 6 : accès selon l'abonnement. Essai expiré / résilié → lecture seule (GET) ; le reste répond 402 avec l'action à faire.
  const [r] = await db.select({ plan: restaurants.plan, trialEndsAt: restaurants.trialEndsAt, subscriptionStatus: restaurants.subscriptionStatus, currentPeriodEnd: restaurants.currentPeriodEnd }).from(restaurants).where(eq(restaurants.id, rid));
  c.set('plan', r?.plan ?? 'trial');
  if (r && billingEnforced()) {
    const s = accessState(r);
    const path = c.req.path;
    if (s.blocked && c.req.method !== 'GET' && !path.includes('/billing') && !path.includes('/account')) {
      return c.json({ error: s.state === 'past_due' ? 'Paiement en attente : mettez à jour votre moyen de paiement pour continuer.' : 'Votre essai gratuit est terminé. Choisissez une formule pour continuer (vos données sont conservées).', code: 'subscription_required', state: s.state }, 402);
    }
    const need = planRequired(path);
    if (need && (PLAN_RANK[r.plan] ?? 0) < PLAN_RANK[need] && !(s.state === 'trialing' && r.plan === 'trial')) {
      return c.json({ error: `Cette fonction fait partie de l'offre ${need[0].toUpperCase()}${need.slice(1)}.`, code: 'plan_required', plan: need }, 402);
    }
  }
  await next();
}

/** Fonctions réservées à une formule (chemins d'API). L'essai gratuit donne accès à tout le Pro. */
const PRO_PATHS = ['/api/forecast', '/api/compare', '/api/smart-cart', '/api/assistant', '/api/recipes', '/api/reorder-rules', '/api/quick/invoice'];
const BUSINESS_PATHS = ['/api/marketplace/group-buys', '/api/account/export'];
export function planRequired(path: string): 'pro' | 'business' | null {
  if (BUSINESS_PATHS.some((p) => path.startsWith(p))) return 'business';
  if (PRO_PATHS.some((p) => path.startsWith(p))) return 'pro';
  return null;
}

export const membershipWhere = (userId: string, restaurantId: string) =>
  and(eq(restaurantMembers.userId, userId), eq(restaurantMembers.restaurantId, restaurantId));

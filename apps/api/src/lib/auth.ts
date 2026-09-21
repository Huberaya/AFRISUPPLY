// Auth maison (remplace Supabase Auth) : mot de passe bcrypt + JWT HS256 (jose)
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import type { Context, MiddlewareHandler, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, and } from 'drizzle-orm';
import { getDb, users, restaurantMembers, restaurants } from '@afrisupply/db';
import { accessState, billingEnforced, PLAN_RANK } from './billing.js';
import { isKnownPath, roleAtLeast } from './security.js';

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret-change-me-in-production');
// Chantier 2 (audit) : durée de session réduite (30 j → 7 j par défaut) et révocable (voir `tokenVersion`).
const TOKEN_TTL = process.env.AUTH_TOKEN_TTL ?? '7d';

/** Durée de vie du cookie, alignée sur celle du jeton (« 7d », « 12h », « 3600 » …). */
export function tokenTtlSeconds(ttl: string = TOKEN_TTL): number {
  const m = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!m) return 7 * 86_400;
  const n = Number(m[1]); const unit = m[2] ?? 's';
  return n * ({ s: 1, m: 60, h: 3600, d: 86_400 }[unit] ?? 1);
}

export type AuthUser = { id: string; email: string; fullName: string; phone?: string | null; tokenVersion?: number };

export async function hashPassword(pw: string) { return bcrypt.hash(pw, 10); }
export async function verifyPassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }

export async function signToken(user: AuthUser, tokenVersion = user.tokenVersion ?? 0) {
  return new SignJWT({ email: user.email, fullName: user.fullName, tv: tokenVersion })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime(TOKEN_TTL).sign(secret);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return { id: payload.sub!, email: payload.email as string, fullName: payload.fullName as string, tokenVersion: Number(payload.tv ?? 0) };
  } catch { return null; }
}

export type Env = { Variables: { user: AuthUser; restaurantId: string; plan: string; role: string } };

/** Middleware : exige un JWT (header Authorization: Bearer ou cookie afs_token). */
export async function requireAuth(c: Context<Env>, next: Next) {
  const header = c.req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : getCookie(c, 'afs_token');
  // Chantier 2 (audit) : une URL qui n'existe pas répond 404 (et non 401) — pas d'information inutile,
  // et le diagnostic côté client est juste.
  if (!token) {
    if (!isKnownPath(c.req.path)) return c.json({ error: 'Route inconnue' }, 404);
    return c.json({ error: 'Non authentifié' }, 401);
  }
  const user = await verifyToken(token);
  if (!user) return c.json({ error: 'Session expirée, reconnectez-vous.', code: 'session_invalid' }, 401);
  const db = await getDb();
  const [row] = await db.select({ id: users.id, email: users.email, fullName: users.fullName, phone: users.phone, tokenVersion: users.tokenVersion })
    .from(users).where(eq(users.id, user.id)).limit(1);
  if (!row) return c.json({ error: 'Utilisateur inconnu' }, 401);
  // Jeton révoqué (mot de passe changé, déconnexion globale) → session invalide même si le JWT n'a pas expiré.
  if ((row.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
    return c.json({ error: 'Session révoquée : reconnectez-vous avec votre nouveau mot de passe.', code: 'session_revoked' }, 401);
  }
  c.set('user', { id: row.id, email: row.email, fullName: row.fullName, phone: row.phone, tokenVersion: row.tokenVersion });
  await next();
}

/** Middleware : résout le restaurant courant (header X-Restaurant-Id ou 1er restaurant du membre) et vérifie l'appartenance. */
export async function requireRestaurant(c: Context<Env>, next: Next) {
  const db = await getDb();
  const user = c.get('user');
  const wanted = c.req.header('x-restaurant-id');
  const memberships = await db.select({ restaurantId: restaurantMembers.restaurantId, role: restaurantMembers.role })
    .from(restaurantMembers).where(eq(restaurantMembers.userId, user.id));
  if (!memberships.length) return c.json({ error: 'Aucun restaurant associé' }, 403);
  const rid = wanted ?? memberships[0].restaurantId;
  const membership = memberships.find((m) => m.restaurantId === rid);
  if (!membership) return c.json({ error: 'Accès refusé à ce restaurant' }, 403);
  c.set('restaurantId', rid);
  // Chantier 2 (audit) : le rôle du membre est désormais exposé et appliqué par les routeurs sensibles.
  c.set('role', membership.role);
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
const BUSINESS_PATHS = ['/api/marketplace/group-buys']; // audit final G1 : /api/account/export = droit RGPD, JAMAIS payant
export function planRequired(path: string): 'pro' | 'business' | null {
  if (BUSINESS_PATHS.some((p) => path.startsWith(p))) return 'business';
  if (PRO_PATHS.some((p) => path.startsWith(p))) return 'pro';
  return null;
}

/**
 * Chantier 2 (audit) : réservé aux rôles suffisants sur le restaurant courant.
 * owner = tout ; manager = gestion (fournisseurs, commandes, réglages) ; staff = quotidien (stock, ventes, réception).
 */
export function requireMinRole(min: 'staff' | 'manager' | 'owner'): MiddlewareHandler<Env> {
  return async (c, next) => {
    const role = c.get('role');
    if (!roleAtLeast(role, min)) {
      const label = min === 'owner' ? 'au propriétaire du restaurant' : 'au responsable';
      return c.json({
        error: `Action réservée ${label} (votre rôle : ${role ?? 'inconnu'}). Demandez au propriétaire du compte de vous donner les droits.`,
        code: 'role_required', requiredRole: min, role: role ?? null,
      }, 403);
    }
    await next();
  };
}

export const membershipWhere = (userId: string, restaurantId: string) =>
  and(eq(restaurantMembers.userId, userId), eq(restaurantMembers.restaurantId, restaurantId));

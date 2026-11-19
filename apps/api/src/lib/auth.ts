// Authentification AFRISUPPLY : mot de passe bcrypt + jeton de session HS256 (jose).
// Clerk n'est qu'un fournisseur d'identité : une identité Clerk vérifiée ouvre une session
// AFRISUPPLY (voir routes/auth.ts, `clerk-sync`) ; toutes les routes s'appuient ensuite sur ce jeton.
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import type { Context, MiddlewareHandler, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, and } from 'drizzle-orm';
import { getDb, users, restaurantMembers, restaurants } from '@afrisupply/db';
import { accessState, billingEnforced, PLAN_RANK } from './billing.js';
import { isKnownPath, roleAtLeast, isProd, jwtSecretProblem, adminEmails } from './security.js';

const DEV_FALLBACK_SECRET = 'dev-secret-change-me-in-production';

/** Levée quand le serveur n'a pas de quoi signer une session de façon sûre : l'API répond 503. */
export class UnsafeConfigError extends Error {
  readonly code = 'config_unsafe';
  constructor(message: string) { super(message); this.name = 'UnsafeConfigError'; }
}

let cachedSecret: { raw: string; bytes: Uint8Array } | null = null;
/**
 * Clé de signature des sessions.
 * Chantier P0.2 : en production il n'existe AUCUNE valeur de repli. Avant, un `JWT_SECRET` absent
 * faisait signer les sessions avec une chaîne publique (présente dans le dépôt) : n'importe qui
 * pouvait alors fabriquer une session pour n'importe quel compte. Sans secret sûr, on refuse de
 * signer comme de vérifier.
 */
function sessionSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET?.trim() ?? '';
  if (isProd()) {
    const problem = jwtSecretProblem(raw);
    if (problem) throw new UnsafeConfigError(problem);
  }
  const effective = raw || DEV_FALLBACK_SECRET;
  if (!cachedSecret || cachedSecret.raw !== effective) cachedSecret = { raw: effective, bytes: new TextEncoder().encode(effective) };
  return cachedSecret.bytes;
}

// Chantier 2 (audit) : durée de session réduite (30 j → 7 j par défaut) et révocable (voir `tokenVersion`).
const TOKEN_TTL = process.env.AUTH_TOKEN_TTL ?? '7d';

/** Durée de vie du cookie, alignée sur celle du jeton (« 7d », « 12h », « 3600 » …). */
export function tokenTtlSeconds(ttl: string = TOKEN_TTL): number {
  const m = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!m) return 7 * 86_400;
  const n = Number(m[1]); const unit = m[2] ?? 's';
  return n * ({ s: 1, m: 60, h: 3600, d: 86_400 }[unit] ?? 1);
}

export type AuthUser = {
  id: string; email: string; fullName: string; phone?: string | null; tokenVersion?: number;
  /** L'adresse e-mail du compte a-t-elle été prouvée (lien reçu par e-mail, ou adresse vérifiée par Clerk) ? */
  emailVerified?: boolean;
};

export async function hashPassword(pw: string) { return bcrypt.hash(pw, 10); }
export async function verifyPassword(pw: string, hash: string | null | undefined) {
  if (!hash) return false;
  return bcrypt.compare(pw, hash);
}

export async function signToken(user: AuthUser, tokenVersion = user.tokenVersion ?? 0) {
  return new SignJWT({ email: user.email, fullName: user.fullName, tv: tokenVersion })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime(TOKEN_TTL).sign(sessionSecret());
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  const secret = sessionSecret(); // hors du try : une configuration dangereuse n'est pas « un jeton invalide »
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (!payload.sub) return null;
    return { id: payload.sub, email: payload.email as string, fullName: payload.fullName as string, tokenVersion: Number(payload.tv ?? 0) };
  } catch { return null; }
}

export type Env = { Variables: { user: AuthUser; restaurantId: string; plan: string; role: string } };

/**
 * Exploitant de la plateforme : adresse listée dans ADMIN_EMAILS **et prouvée**.
 * Chantier P0.2 : avant, il suffisait de s'inscrire avec une adresse de la liste encore libre pour
 * obtenir les droits d'exploitant, sans jamais démontrer qu'on en était le titulaire.
 */
export function isPlatformAdmin(user: Pick<AuthUser, 'email' | 'emailVerified'> | null | undefined): boolean {
  if (!user?.email || user.emailVerified !== true) return false;
  return adminEmails().includes(user.email.toLowerCase());
}

/** Middleware : réservé à l'exploitant de la plateforme (à placer après `requireAuth`). */
export const requirePlatformAdmin: MiddlewareHandler<Env> = async (c, next) => {
  if (!isPlatformAdmin(c.get('user'))) return c.json({ error: 'Accès réservé' }, 403);
  await next();
};

/** Middleware : exige une session AFRISUPPLY valide (en-tête Authorization: Bearer ou cookie afs_token). */
export async function requireAuth(c: Context<Env>, next: Next) {
  // Plusieurs routeurs déclarent ce middleware sur le même préfixe : une requête le traversait
  // jusqu'à douze fois, avec une lecture en base à chaque passage. Une fois suffit.
  if (c.get('user')) return next();

  const header = c.req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : getCookie(c, 'afs_token');
  // Chantier 2 (audit) : une URL qui n'existe pas répond 404 (et non 401) — pas d'information inutile,
  // et le diagnostic côté client est juste.
  if (!token) {
    if (!isKnownPath(c.req.path)) return c.json({ error: 'Route inconnue' }, 404);
    return c.json({ error: 'Non authentifié' }, 401);
  }
  // Chantier P0.2 : seul le jeton de session AFRISUPPLY est accepté ici. L'ancien repli « session
  // Clerk présentée directement » contournait la révocation des sessions et ne contrôlait ni
  // l'origine du jeton ni l'adresse du compte ; l'identité Clerk passe désormais uniquement par
  // POST /api/auth/clerk-sync, qui délivre un jeton AFRISUPPLY.
  const claimed = await verifyToken(token);
  if (!claimed) return c.json({ error: 'Session expirée, reconnectez-vous.', code: 'session_invalid' }, 401);

  const db = await getDb();
  const [row] = await db.select({ id: users.id, email: users.email, fullName: users.fullName, phone: users.phone, tokenVersion: users.tokenVersion, emailVerifiedAt: users.emailVerifiedAt })
    .from(users).where(eq(users.id, claimed.id)).limit(1);
  if (!row) return c.json({ error: 'Utilisateur inconnu' }, 401);
  // Jeton révoqué (mot de passe changé, déconnexion) → session invalide même si le JWT n'a pas expiré.
  if ((row.tokenVersion ?? 0) !== (claimed.tokenVersion ?? 0)) {
    return c.json({ error: 'Session révoquée : reconnectez-vous.', code: 'session_revoked' }, 401);
  }
  c.set('user', { id: row.id, email: row.email, fullName: row.fullName, phone: row.phone, tokenVersion: row.tokenVersion, emailVerified: row.emailVerifiedAt !== null });
  await next();
}

/** Middleware : résout le restaurant courant (header X-Restaurant-Id ou 1er restaurant du membre) et vérifie l'appartenance. */
export async function requireRestaurant(c: Context<Env>, next: Next) {
  // Même raison que `requireAuth` : le contexte du restaurant est résolu une seule fois par requête.
  if (c.get('restaurantId')) return next();

  const db = await getDb();
  const user = c.get('user');
  const wanted = c.req.header('x-restaurant-id');
  const memberships = await db.select({ restaurantId: restaurantMembers.restaurantId, role: restaurantMembers.role })
    .from(restaurantMembers).where(eq(restaurantMembers.userId, user.id));
  // Chantier 8 : un code machine permet au web de recharger les établissements au lieu d'afficher une erreur sèche.
  if (!memberships.length) return c.json({ error: 'Aucun restaurant associé à ce compte', code: 'no_restaurant' }, 403);
  const rid = wanted ?? memberships[0].restaurantId;
  const membership = memberships.find((m) => m.restaurantId === rid);
  if (!membership) return c.json({ error: 'Accès refusé à cet établissement (votre accès a peut-être été modifié)', code: 'restaurant_forbidden' }, 403);
  // Chantier 6 : accès selon l'abonnement. Essai expiré / résilié → lecture seule (GET) ; le reste répond 402 avec l'action à faire.
  const [r] = await db.select({ plan: restaurants.plan, trialEndsAt: restaurants.trialEndsAt, subscriptionStatus: restaurants.subscriptionStatus, currentPeriodEnd: restaurants.currentPeriodEnd }).from(restaurants).where(eq(restaurants.id, rid));
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
  // Le contexte n'est posé qu'une fois tous les contrôles passés : un refus ne laisse aucun contexte derrière lui.
  c.set('restaurantId', rid);
  // Chantier 2 (audit) : le rôle du membre est exposé et appliqué par les routeurs sensibles.
  c.set('role', membership.role);
  c.set('plan', r?.plan ?? 'trial');
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

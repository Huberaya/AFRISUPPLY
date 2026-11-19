// Aides partagées par les tests d'API.
import type { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb, users, restaurantMembers } from '@afrisupply/db';
import { signToken } from '../lib/auth.js';
import { _resetRateLimits } from '../lib/ops.js';

/**
 * Marque l'adresse d'un compte de test comme confirmée — l'équivalent du clic sur le lien reçu par
 * e-mail. Les droits d'exploitant (ADMIN_EMAILS) exigent une adresse prouvée (chantier P0.2) : les
 * tests qui ont besoin d'un exploitant confirment donc son adresse après l'inscription. Le parcours
 * réel (lien, jeton à usage unique) est vérifié dans account-recovery.test.ts et admin-verifie.test.ts.
 */
export async function confirmerAdresse(email: string): Promise<void> {
  const db = await getDb();
  const rows = await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email.toLowerCase())).returning({ id: users.id });
  if (!rows.length) throw new Error(`confirmerAdresse : aucun compte ${email}`);
}

// ---------------------------------------------------------------------------------------------
// Aides des suites « P0 » (cloisonnement, rôles, robustesse) : appels HTTP et comptes de test.
// ---------------------------------------------------------------------------------------------
export type Rep = { status: number; json: any; text: string; headers: Headers };
export type Compte = { h: Record<string, string>; token: string; userId: string; rid: string; email: string };

/** Appel HTTP à l'application montée en mémoire. `body` : objet (envoyé en JSON) ou chaîne brute (envoyée telle quelle). */
export function creerAppel(app: Hono) {
  return async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Rep> => {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* réponse sans JSON (PDF, CSV…) */ }
    return { status: res.status, json, text, headers: res.headers };
  };
}

/** Inscription par la route publique : compte + restaurant + rôle de propriétaire. */
export async function inscrire(appel: ReturnType<typeof creerAppel>, email: string, restaurant: string, city = 'Nantes'): Promise<Compte> {
  const r = await appel('POST', '/api/auth/register', { email, password: 'Plantain-Yassa-42', fullName: `Personne ${restaurant}`, restaurantName: restaurant, city });
  if (r.status !== 201) throw new Error(`inscription de ${email} : HTTP ${r.status} ${r.text}`);
  await _resetRateLimits();   // la préparation d'un test ne doit pas consommer le quota d'inscriptions
  return { h: { authorization: `Bearer ${r.json.token}` }, token: r.json.token, userId: r.json.user.id, rid: r.json.restaurant.id, email };
}

/**
 * Membre supplémentaire d'un restaurant, avec le rôle voulu. Le compte est créé par inscription puis
 * rattaché directement en base au restaurant visé (raccourci de test : l'invitation par e-mail est
 * vérifiée dans security.test.ts et account-recovery.test.ts).
 */
export async function ajouterMembre(appel: ReturnType<typeof creerAppel>, rid: string, email: string, role: 'staff' | 'manager' | 'owner'): Promise<Compte> {
  const c = await inscrire(appel, email, `Annexe de ${email}`);
  const db = await getDb();
  await db.delete(restaurantMembers).where(eq(restaurantMembers.userId, c.userId));
  await db.insert(restaurantMembers).values({ restaurantId: rid, userId: c.userId, role });
  return { ...c, rid };
}

/** Jeton de session pour un compte existant (raccourci de test). */
export async function jetonPour(userId: string, email: string): Promise<string> {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  return signToken({ id: userId, email, fullName: u?.fullName ?? email, tokenVersion: u?.tokenVersion ?? 0 });
}

// Chantier P0.2 — DÉFAUT CRITIQUE : POST /api/auth/clerk-sync.
//
// Avant la correction, cette route ouvrait une session sur n'importe quel compte à partir de sa
// seule adresse e-mail envoyée dans le corps de la requête : aucune preuve d'identité n'était exigée.
// Ces tests rejouent l'attaque (et ses variantes) et vérifient qu'elle échoue, puis que les
// connexions légitimes fonctionnent toujours.
//
// Clerk est SIMULÉ (faux-clerk.ts : clé de signature locale + fausse API d'annuaire). Ce qui est
// réellement exécuté : la route, la bibliothèque @clerk/backend, la vérification de signature,
// d'expiration et d'origine, et la lecture de la fiche. Ces tests ne prouvent pas que l'instance
// Clerk réelle est bien configurée (voir la fiche d'intervention CLERK-01).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { runMigrations, getDb, users, restaurants, restaurantMembers, auditLog } from '@afrisupply/db';
import { demarrerFauxClerk, type FauxClerk } from './faux-clerk.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_URL = '';
process.env.PGLITE_DIR = 'memory://clerk-test';
process.env.ADMIN_EMAILS = 'exploitant@afrisupply.test';
process.env.MAIL_OUTBOX_DIR = '/tmp/afs-outbox-clerk-sync';
delete process.env.RESEND_API_KEY; delete process.env.APP_URL; delete process.env.ALLOWED_ORIGINS; delete process.env.CLERK_AUTHORIZED_PARTIES;

const { app } = await import('../app.js');
const { _resetRateLimits } = await import('../lib/ops.js');

let clerk: FauxClerk;
type Rep = { status: number; json: any; cookie: string | null };
const sync = async (opts: { jeton?: string; corps?: unknown } = {}): Promise<Rep> => {
  const res = await app.request('/api/auth/clerk-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.jeton ? { Authorization: `Bearer ${opts.jeton}` } : {}) },
    body: JSON.stringify(opts.corps ?? {}),
  });
  let json: any = null; try { json = await res.json(); } catch { /* pas de JSON */ }
  return { status: res.status, json, cookie: res.headers.get('set-cookie') };
};
const moi = async (jeton: string) => {
  const res = await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${jeton}` } });
  return { status: res.status, json: (await res.json()) as any };
};
const inscrire = async (email: string, nom: string) => {
  const res = await app.request('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Plantain-Yassa-42', fullName: nom, restaurantName: `Chez ${nom}` }) });
  expect(res.status).toBe(201);
  return (await res.json()) as any;
};
const compte = async (email: string) => (await (await getDb()).select().from(users).where(eq(users.email, email)))[0];
const activerClerk = () => { process.env.CLERK_SECRET_KEY = 'sk_test_cle_du_faux_service'; process.env.CLERK_JWT_KEY = clerk.jwtKey; process.env.CLERK_API_URL = clerk.url; };

beforeAll(async () => { await runMigrations(); clerk = await demarrerFauxClerk(); }, 60_000);
afterAll(async () => { await clerk.fermer(); });
beforeEach(async () => { activerClerk(); clerk.panne(false); clerk.silence(false); delete process.env.CLERK_TIMEOUT_MS; await _resetRateLimits(); });

describe('1. L’attaque d’origine et ses variantes échouent', () => {
  beforeAll(async () => { await inscrire('victime@resto.test', 'Awa Victime'); });

  it('l’adresse e-mail d’un compte, envoyée dans le corps, n’ouvre plus aucune session', async () => {
    const r = await sync({ corps: { clerkId: 'user_inventé', email: 'victime@resto.test', fullName: 'Attaquant' } });
    expect(r.status).toBe(401);
    expect(r.json.code).toBe('clerk_token_required');
    expect(r.json.token).toBeUndefined();
    expect(r.cookie).toBeNull();
    expect((await compte('victime@resto.test')).clerkId).toBeNull();   // le compte n'a pas été relié
  });

  it('même refus quand Clerk n’est pas configuré côté serveur (cas de l’exploitation prouvée par l’audit)', async () => {
    delete process.env.CLERK_SECRET_KEY; delete process.env.CLERK_JWT_KEY;
    const sansJeton = await sync({ corps: { clerkId: 'user_x', email: 'victime@resto.test' } });
    expect(sansJeton.status).toBe(401);
    const avecJeton = await sync({ jeton: await clerk.jeton('user_x'), corps: { clerkId: 'user_x', email: 'victime@resto.test' } });
    expect(avecJeton.status).toBe(503);
    expect(avecJeton.json.code).toBe('clerk_not_configured');
    expect(avecJeton.cookie).toBeNull();
  });

  it('l’adresse d’un exploitant (ADMIN_EMAILS) ne donne pas davantage de session', async () => {
    const r = await sync({ corps: { clerkId: 'user_admin', email: 'exploitant@afrisupply.test' } });
    expect(r.status).toBe(401);
    expect(await compte('exploitant@afrisupply.test')).toBeUndefined();   // aucun compte créé
  });

  it('un jeton signé par une autre clé est refusé', async () => {
    clerk.ajouter({ id: 'user_faux', email: 'victime@resto.test' });
    const r = await sync({ jeton: await clerk.jetonForge('user_faux') });
    expect(r.status).toBe(401);
    expect(r.json.code).toBe('clerk_token_invalid');
    expect(r.cookie).toBeNull();
  });

  it('un jeton expiré est refusé', async () => {
    clerk.ajouter({ id: 'user_expire', email: 'expire@resto.test' });
    const r = await sync({ jeton: await clerk.jeton('user_expire', { expiresInSec: -120 }) });
    expect(r.status).toBe(401);
    expect(await compte('expire@resto.test')).toBeUndefined();
  });

  it('un jeton émis pour une autre origine (azp), ou sans origine, est refusé', async () => {
    clerk.ajouter({ id: 'user_azp', email: 'azp@resto.test' });
    const autreSite = await sync({ jeton: await clerk.jeton('user_azp', { azp: 'https://site-pirate.exemple' }) });
    expect(autreSite.status).toBe(401);
    expect(autreSite.json.code).toBe('clerk_origin_refused');
    const sansOrigine = await sync({ jeton: await clerk.jeton('user_azp', { azp: null }) });
    expect(sansOrigine.status).toBe(401);
    expect(sansOrigine.json.code).toBe('clerk_origin_refused');
    expect(await compte('azp@resto.test')).toBeUndefined();
  });

  it('une identité Clerk dont l’adresse n’est PAS vérifiée ne prend pas le compte de cette adresse', async () => {
    clerk.ajouter({ id: 'user_squatteur', email: 'victime@resto.test', verified: false });
    const r = await sync({ jeton: await clerk.jeton('user_squatteur') });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe('clerk_email_unverified');
    expect(r.cookie).toBeNull();
    expect((await compte('victime@resto.test')).clerkId).toBeNull();
  });

  it('un compte dont l’adresse n’a jamais été confirmée côté AFRISUPPLY n’est pas relié', async () => {
    // « victime » s'est inscrite par mot de passe et n'a pas confirmé son adresse : le compte a pu être
    // ouvert par n'importe qui avec cette adresse, on ne le relie donc pas automatiquement.
    clerk.ajouter({ id: 'user_titulaire', email: 'victime@resto.test' });
    const r = await sync({ jeton: await clerk.jeton('user_titulaire') });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe('local_email_unverified');
    expect((await compte('victime@resto.test')).clerkId).toBeNull();
  });

  it('un lien posé avant la correction (identifiant Clerk arbitraire sur le compte) ne donne accès à rien', async () => {
    // L'ancienne route laissait un attaquant écrire SON identifiant Clerk sur le compte de la victime.
    const db = await getDb();
    await db.update(users).set({ clerkId: 'user_attaquant' }).where(eq(users.email, 'victime@resto.test'));
    clerk.ajouter({ id: 'user_attaquant', email: 'attaquant@ailleurs.test' });   // identité Clerk réelle de l'attaquant
    const r = await sync({ jeton: await clerk.jeton('user_attaquant') });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe('clerk_identity_mismatch');
    expect(r.cookie).toBeNull();
    expect((await compte('victime@resto.test')).email).toBe('victime@resto.test');   // rien n'a été modifié
    // …et le titulaire légitime ne peut pas être relié par-dessus sans intervention : conflit explicite.
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, 'victime@resto.test'));
    const titulaire = await sync({ jeton: await clerk.jeton('user_titulaire') });
    expect(titulaire.status).toBe(409);
    expect(titulaire.json.code).toBe('clerk_identity_conflict');
    await db.update(users).set({ clerkId: null, emailVerifiedAt: null }).where(eq(users.email, 'victime@resto.test'));
  });

  it('si Clerk ne répond pas, aucune session n’est ouverte (plus de repli sur le corps de la requête)', async () => {
    clerk.ajouter({ id: 'user_panne', email: 'panne@resto.test' });
    clerk.panne(true);
    const r = await sync({ jeton: await clerk.jeton('user_panne'), corps: { clerkId: 'user_panne', email: 'victime@resto.test' } });
    expect(r.status).toBe(503);
    expect(r.json.code).toBe('clerk_unreachable');
    expect(r.cookie).toBeNull();
    expect(await compte('panne@resto.test')).toBeUndefined();
  });

  it('si Clerk accepte la connexion mais ne répond jamais, la requête n’attend pas indéfiniment : 503 dans le délai, aucune session', async () => {
    clerk.ajouter({ id: 'user_silence', email: 'silence@resto.test' });
    clerk.silence(true);
    process.env.CLERK_TIMEOUT_MS = '400';
    const debut = Date.now();
    const r = await sync({ jeton: await clerk.jeton('user_silence') });
    const duree = Date.now() - debut;
    expect(r.status).toBe(503);
    expect(r.json.code).toBe('clerk_unreachable');
    expect(r.cookie).toBeNull();
    expect(duree).toBeLessThan(3_000);              // sans délai maximal, cet appel ne reviendrait pas
    expect(await compte('silence@resto.test')).toBeUndefined();
  }, 15_000);

  it('un identifiant Clerk inconnu de l’annuaire est refusé', async () => {
    const r = await sync({ jeton: await clerk.jeton('user_inconnu_de_clerk'), corps: { email: 'victime@resto.test' } });
    expect(r.status).toBe(401);
    expect(r.json.code).toBe('clerk_user_unknown');
  });

  it('les refus sont tracés dans le journal d’audit', async () => {
    const db = await getDb();
    await new Promise((r) => setTimeout(r, 50));
    const lignes = await db.select().from(auditLog).where(eq(auditLog.action, 'auth.clerk_sync.refused'));
    expect(lignes.length).toBeGreaterThanOrEqual(5);
    expect(lignes.some((l) => (l.meta as { code?: string })?.code === 'clerk_identity_mismatch')).toBe(true);
  });

  it('la route est freinée : au-delà de 20 appels par minute, 429', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 22; i++) codes.push((await sync({ corps: { clerkId: `user_${i}`, email: 'victime@resto.test' } })).status);
    expect(codes.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(codes.slice(20)).toEqual([429, 429]);
  });
});

describe('2. Les connexions légitimes fonctionnent', () => {
  it('nouvelle identité Clerk vérifiée → compte, restaurant et session ; le corps de la requête est ignoré', async () => {
    clerk.ajouter({ id: 'user_nouveau', email: 'Chef.Ibrahim@Resto.test', firstName: 'Ibrahim', lastName: 'Chef', phone: '+33600000001' });
    const r = await sync({ jeton: await clerk.jeton('user_nouveau'), corps: { clerkId: 'user_autre', email: 'exploitant@afrisupply.test', fullName: 'Faux Nom' } });
    expect(r.status).toBe(200);
    expect(r.json.user.email).toBe('chef.ibrahim@resto.test');       // l'adresse vient de Clerk, pas du corps
    expect(r.json.user.clerkId).toBe('user_nouveau');
    expect(r.json.user.isAdmin).toBe(false);
    expect(r.json.restaurants).toHaveLength(1);
    expect(r.json.restaurants[0].role).toBe('owner');
    expect(r.cookie).toContain('afs_token=');
    expect(r.cookie).toContain('HttpOnly');

    const dbUser = await compte('chef.ibrahim@resto.test');
    expect(dbUser.fullName).toBe('Ibrahim Chef');
    expect(dbUser.emailVerifiedAt).not.toBeNull();
    expect(await compte('exploitant@afrisupply.test')).toBeUndefined();

    const me = await moi(r.json.token);
    expect(me.status).toBe(200);
    expect(me.json.user.email).toBe('chef.ibrahim@resto.test');
  });

  it('deuxième connexion de la même identité : même compte, aucun doublon', async () => {
    const avant = await compte('chef.ibrahim@resto.test');
    const r = await sync({ jeton: await clerk.jeton('user_nouveau') });
    expect(r.status).toBe(200);
    expect(r.json.user.id).toBe(avant.id);
    const db = await getDb();
    expect(await db.select().from(restaurantMembers).where(eq(restaurantMembers.userId, avant.id))).toHaveLength(1);
  });

  it('compte existant dont l’adresse est confirmée des deux côtés → relié sans perte de données', async () => {
    const db = await getDb();
    const [ancien] = await db.insert(users).values({ email: 'ancien@resto.test', fullName: 'Ancien Compte', emailVerifiedAt: new Date() }).returning();
    const [resto] = await db.insert(restaurants).values({ name: 'Mon Beau Restaurant', slug: `beau-resto-${Date.now()}`, plan: 'pro' }).returning();
    await db.insert(restaurantMembers).values({ restaurantId: resto.id, userId: ancien.id, role: 'owner' });

    clerk.ajouter({ id: 'user_ancien', email: 'ancien@resto.test', firstName: 'Ancien' });
    const r = await sync({ jeton: await clerk.jeton('user_ancien') });
    expect(r.status).toBe(200);
    expect(r.json.user.id).toBe(ancien.id);
    expect(r.json.user.clerkId).toBe('user_ancien');
    expect(r.json.restaurants.map((x: any) => x.id)).toEqual([resto.id]);   // aucun restaurant créé en plus
    expect((await compte('ancien@resto.test')).clerkId).toBe('user_ancien');
  });

  it('une autre identité Clerk ne peut pas se relier à un compte déjà relié', async () => {
    clerk.ajouter({ id: 'user_second', email: 'ancien@resto.test' });
    const r = await sync({ jeton: await clerk.jeton('user_second') });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe('clerk_identity_conflict');
    expect((await compte('ancien@resto.test')).clerkId).toBe('user_ancien');
  });

  it('un exploitant dont l’adresse est vérifiée par Clerk obtient bien ses droits', async () => {
    clerk.ajouter({ id: 'user_exploitant', email: 'exploitant@afrisupply.test', firstName: 'Exploitant' });
    const r = await sync({ jeton: await clerk.jeton('user_exploitant') });
    expect(r.status).toBe(200);
    expect(r.json.user.isAdmin).toBe(true);
    const res = await app.request('/api/admin/dashboard', { headers: { Authorization: `Bearer ${r.json.token}` } });
    expect(res.status).toBe(200);
  });

  it('un compte Clerk suspendu est refusé', async () => {
    clerk.ajouter({ id: 'user_banni', email: 'banni@resto.test', banned: true });
    const r = await sync({ jeton: await clerk.jeton('user_banni') });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe('clerk_user_blocked');
  });
});

describe('3. Le reste de l’API n’accepte que la session AFRISUPPLY', () => {
  it('un jeton Clerk présenté directement à une route protégée est refusé (ancien repli supprimé)', async () => {
    const jetonClerk = await clerk.jeton('user_nouveau');
    const me = await moi(jetonClerk);
    expect(me.status).toBe(401);
    expect(me.json.code).toBe('session_invalid');
    const stock = await app.request('/api/stock', { headers: { Authorization: `Bearer ${jetonClerk}` } });
    expect(stock.status).toBe(401);
  });

  it('la déconnexion révoque la session issue de Clerk', async () => {
    const r = await sync({ jeton: await clerk.jeton('user_nouveau') });
    expect((await moi(r.json.token)).status).toBe(200);
    const out = await app.request('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${r.json.token}` } });
    expect(out.status).toBe(200);
    const apres = await moi(r.json.token);
    expect(apres.status).toBe(401);
    expect(apres.json.code).toBe('session_revoked');
  });
});

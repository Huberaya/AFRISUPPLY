// Chantier 2 (audit) — socle de sécurité : configuration de démarrage, CORS, politique de mot de passe,
// mot de passe oublié / réinitialisation, révocation de session, rôles réellement appliqués, 404 exact.
import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '@afrisupply/db';
import { app } from '../app.js';
import { checkSecureConfig, passwordProblem, resolveCorsOrigin, isKnownPath, allowedOrigins } from '../lib/security.js';
import { _resetRateLimits } from '../lib/ops.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.CRON_SECRET = 'cron-test'; process.env.PGLITE_DIR = 'memory://security';

type Json = Record<string, any>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json: Json = {}; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json, headers: res.headers };
};
/** Les tests enchaînent les inscriptions/connexions : on remet les compteurs de limitation à zéro. */
const fresh = () => _resetRateLimits();
const STRONG = 'Plantain-Yassa-42';

beforeAll(async () => { await runMigrations(); }, 60_000);

describe('1. Configuration de démarrage (refus des réglages dangereux en production)', () => {
  const prodEnv = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@h/db' } as NodeJS.ProcessEnv;
  it('refuse un secret de développement ou trop court en production', () => {
    expect(checkSecureConfig({ ...prodEnv, JWT_SECRET: 'dev-secret-change-me-in-production' }).errors.join(' ')).toMatch(/JWT_SECRET/);
    expect(checkSecureConfig({ ...prodEnv, JWT_SECRET: 'court' }).errors.join(' ')).toMatch(/JWT_SECRET/);
    expect(checkSecureConfig({ ...prodEnv }).errors.join(' ')).toMatch(/JWT_SECRET/);
  });
  it('refuse la base éphémère et le restaurant de démonstration en production', () => {
    const noDb = checkSecureConfig({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(40), DATABASE_URL: '' });
    expect(noDb.errors.join(' ')).toMatch(/DATABASE_URL/);
    const demo = checkSecureConfig({ ...prodEnv, JWT_SECRET: 'a'.repeat(40), SEED_DEMO: 'true' });
    expect(demo.errors.join(' ')).toMatch(/SEED_DEMO/);
    const assumed = checkSecureConfig({ ...prodEnv, JWT_SECRET: 'a'.repeat(40), SEED_DEMO: 'true', ALLOW_DEMO_SEED: 'true' });
    expect(assumed.errors).toEqual([]);
  });
  it('accepte une configuration correcte et n’avertit plus sur les manques', () => {
    const ok = checkSecureConfig({ ...prodEnv, JWT_SECRET: 'a'.repeat(40), CRON_SECRET: 'c', ADMIN_EMAILS: 'a@b.fr', RESEND_API_KEY: 'r', APP_URL: 'https://afrisupply.fr' });
    expect(ok).toEqual({ errors: [], warnings: [] });
  });
  it('ne bloque pas le développement local, mais avertit', () => {
    const dev = checkSecureConfig({ NODE_ENV: 'development', JWT_SECRET: 'dev-secret-local' });
    expect(dev.errors).toEqual([]); expect(dev.warnings.length).toBeGreaterThan(0);
  });
});

describe('2. CORS : liste blanche d’origines (jamais « * » avec credentials)', () => {
  it('autorise les origines locales en développement, refuse les inconnues', () => {
    expect(resolveCorsOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(resolveCorsOrigin('https://resto-malin.example')).toBeUndefined();
    expect(resolveCorsOrigin(undefined)).toBeUndefined();
    expect(allowedOrigins()).not.toContain('*');
  });
  it('respecte ALLOWED_ORIGINS et APP_URL', () => {
    const env = { NODE_ENV: 'production', APP_URL: 'https://afrisupply.fr', ALLOWED_ORIGINS: 'https://www.afrisupply.fr' } as NodeJS.ProcessEnv;
    expect(resolveCorsOrigin('https://www.afrisupply.fr', env)).toBe('https://www.afrisupply.fr');
    expect(resolveCorsOrigin('https://afrisupply.fr', env)).toBe('https://afrisupply.fr');
    expect(resolveCorsOrigin('https://attaque.example', env)).toBeUndefined();
  });
  it('ne renvoie pas d’en-tête CORS pour une origine non autorisée (réponse HTTP réelle)', async () => {
    const evil = await call('GET', '/api/health', undefined, { origin: 'https://attaque.example' });
    expect(evil.status).toBe(200); expect(evil.headers.get('access-control-allow-origin')).toBeNull();
    const ok = await call('GET', '/api/health', undefined, { origin: 'http://localhost:3000' });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(ok.headers.get('cache-control')).toBe('no-store');
  });
});

describe('3. Politique de mot de passe', () => {
  it('refuse les mots de passe courants, courts, en chiffres seuls ou répétés', () => {
    expect(passwordProblem('demo1234')).toMatch(/courant/);
    expect(passwordProblem('motdepasse1')).toMatch(/courant/);
    expect(passwordProblem('court')).toMatch(/8 caractères/);
    expect(passwordProblem('12345678901')).toMatch(/chiffres/);
    expect(passwordProblem('aaaaaaaaa')).toMatch(/répétition/);
    expect(passwordProblem(STRONG)).toBeNull();
    expect(passwordProblem('trois mots sans rapport')).toBeNull();
  });
  it('refuse une inscription avec mot de passe trop faible, accepte un mot de passe solide', async () => {
    await fresh();
    const weak = await call('POST', '/api/auth/register', { email: 'faible@resto.fr', password: 'demo1234', fullName: 'Test Faible', restaurantName: 'Faible' });
    expect(weak.status).toBe(400); expect(weak.json.code).toBe('weak_password');
    const ok = await call('POST', '/api/auth/register', { email: 'solide@resto.fr', password: STRONG, fullName: 'Test Solide', restaurantName: 'Solide' });
    expect(ok.status).toBe(201);
  });
});

describe('4. Mot de passe oublié / réinitialisation / révocation', () => {
  let token = ''; let devLink = '';
  it('répond toujours la même chose (pas d’énumération des comptes)', async () => {
    await fresh();
    const unknown = await call('POST', '/api/auth/forgot-password', { email: 'inconnu@nulle-part.fr' });
    expect(unknown.status).toBe(200); expect(unknown.json.message).toMatch(/Si un compte existe/); expect(unknown.json.devLink).toBeUndefined();
    const known = await call('POST', '/api/auth/forgot-password', { email: 'solide@resto.fr' });
    expect(known.status).toBe(200); expect(known.json.devLink).toMatch(/reinitialiser\?token=/);
    devLink = known.json.devLink;
  });
  it('refuse un lien sans jeton ou un mot de passe faible', async () => {
    const missing = await call('POST', '/api/auth/reset-password', { token: 'x'.repeat(20), password: STRONG });
    expect(missing.status).toBe(400); expect(missing.json.code).toBe('reset_invalid');
    const t = new URL(devLink).searchParams.get('token');
    const weak = await call('POST', '/api/auth/reset-password', { token: t, password: 'azerty123' });
    expect(weak.status).toBe(400); expect(weak.json.code).toBe('weak_password');
  });
  it('réinitialise le mot de passe et révoque les sessions déjà ouvertes', async () => {
    await fresh();
    const login = await call('POST', '/api/auth/login', { email: 'solide@resto.fr', password: STRONG });
    expect(login.status).toBe(200); token = login.json.token;
    expect((await call('GET', '/api/dashboard', undefined, { authorization: `Bearer ${token}` })).status).toBe(200);

    const t = new URL(devLink).searchParams.get('token');
    const reset = await call('POST', '/api/auth/reset-password', { token: t, password: 'Riz-Brisé-2026!' });
    expect(reset.status).toBe(200);

    const oldToken = await call('GET', '/api/dashboard', undefined, { authorization: `Bearer ${token}` });
    expect(oldToken.status).toBe(401); expect(oldToken.json.code).toBe('session_revoked');
    expect((await call('POST', '/api/auth/login', { email: 'solide@resto.fr', password: STRONG })).status).toBe(401);
    expect((await call('POST', '/api/auth/login', { email: 'solide@resto.fr', password: 'Riz-Brisé-2026!' })).status).toBe(200);
  });
  it('un lien ne sert qu’une fois', async () => {
    await fresh();
    const t = new URL(devLink).searchParams.get('token');
    const again = await call('POST', '/api/auth/reset-password', { token: t, password: 'Autre-Mot-De-Passe-9' });
    expect(again.status).toBe(400); expect(again.json.code).toBe('reset_invalid');
  });
  it('changement de mot de passe : l’appareil courant reste connecté, les autres non', async () => {
    await fresh();
    const l1 = await call('POST', '/api/auth/login', { email: 'solide@resto.fr', password: 'Riz-Brisé-2026!' });
    const l2 = await call('POST', '/api/auth/login', { email: 'solide@resto.fr', password: 'Riz-Brisé-2026!' });
    const t1 = l1.json.token; const t2 = l2.json.token;
    const wrong = await call('POST', '/api/auth/password', { currentPassword: 'faux', newPassword: 'Nouveau-Mot-De-Passe-7' }, { authorization: `Bearer ${t1}` });
    expect(wrong.status).toBe(401);
    const ok = await call('POST', '/api/auth/password', { currentPassword: 'Riz-Brisé-2026!', newPassword: 'Nouveau-Mot-De-Passe-7' }, { authorization: `Bearer ${t1}` });
    expect(ok.status).toBe(200); const t3 = ok.json.token;
    expect((await call('GET', '/api/dashboard', undefined, { authorization: `Bearer ${t3}` })).status).toBe(200);
    expect((await call('GET', '/api/dashboard', undefined, { authorization: `Bearer ${t2}` })).status).toBe(401);
  });
  it('« déconnecter tous mes appareils » invalide immédiatement le jeton', async () => {
    await fresh();
    const l = await call('POST', '/api/auth/login', { email: 'solide@resto.fr', password: 'Nouveau-Mot-De-Passe-7' });
    const t = l.json.token;
    expect((await call('POST', '/api/auth/logout-all', undefined, { authorization: `Bearer ${t}` })).status).toBe(200);
    const after = await call('GET', '/api/dashboard', undefined, { authorization: `Bearer ${t}` });
    expect(after.status).toBe(401); expect(after.json.code).toBe('session_revoked');
  });
});

let owner: Record<string, string> = {}; let restaurantId = ''; let staffToken = ''; let managerToken = '';
describe('5. Rôles : attribuables et réellement appliqués', () => {
  it('le propriétaire invite un membre de l’équipe, qui choisit son mot de passe', async () => {
    await fresh();
    const reg = await call('POST', '/api/auth/register', { email: 'patron@resto.fr', password: STRONG, fullName: 'Awa Patronne', restaurantName: 'Chez Awa Test', city: 'Nantes' });
    expect(reg.status).toBe(201); owner = { authorization: `Bearer ${reg.json.token}` }; restaurantId = reg.json.restaurant.id;

    const invite = await call('POST', '/api/members', { email: 'aide@resto.fr', fullName: 'Kofi Aide', role: 'staff' }, owner);
    expect(invite.status).toBe(201); expect(invite.json.devLink).toMatch(/bienvenue\?token=/);
    const invite2 = await call('POST', '/api/members', { email: 'chef@resto.fr', fullName: 'Nadia Chef', role: 'manager' }, owner);
    expect(invite2.status).toBe(201);
    expect((await call('POST', '/api/members', { email: 'aide@resto.fr', role: 'staff' }, owner)).status).toBe(409);

    const setPw = async (link: string) => (await call('POST', '/api/auth/reset-password', { token: new URL(link).searchParams.get('token'), password: STRONG })).status;
    expect(await setPw(invite.json.devLink)).toBe(200);
    expect(await setPw(invite2.json.devLink)).toBe(200);
    const s = await call('POST', '/api/auth/login', { email: 'aide@resto.fr', password: STRONG });
    const m = await call('POST', '/api/auth/login', { email: 'chef@resto.fr', password: STRONG });
    staffToken = s.json.token; managerToken = m.json.token;
    expect(staffToken && managerToken).toBeTruthy();
  });
  it('« équipe » peut travailler au quotidien (stock, inventaire, réception) mais ne peut pas s’engager financièrement', async () => {
    const staff = { authorization: `Bearer ${staffToken}`, 'x-restaurant-id': restaurantId };
    await fresh();
    expect((await call('GET', '/api/stock', undefined, staff)).status).toBe(200);
    const tpl = await call('GET', '/api/onboarding/templates', undefined, staff);
    await call('POST', '/api/onboarding/apply', { templates: tpl.json.templates.slice(0, 1).map((t: Json) => t.name) }, staff);
    const stock = await call('GET', '/api/stock', undefined, staff);
    const item = stock.json.items[0];
    expect((await call('PUT', `/api/stock/${item.itemId ?? item.id}`, { criticalLevel: 10, quantity: 12 }, staff)).status).toBe(200);

    const supplier = await call('POST', '/api/suppliers', { name: 'Fournisseur Interdit', leadTimeHours: 24 }, staff);
    expect(supplier.status).toBe(403); expect(supplier.json.code).toBe('role_required');
    const settings = await call('PUT', '/api/settings', { name: 'Nom piraté' }, staff);
    expect(settings.status).toBe(403); expect(settings.json.code).toBe('role_required');
    const people = await call('GET', '/api/members', undefined, staff);
    expect(people.status).toBe(200); expect(people.json.me.role).toBe('staff');
  });
  it('« responsable » gère les fournisseurs et les commandes, mais pas l’abonnement ni les membres', async () => {
    const mgr = { authorization: `Bearer ${managerToken}`, 'x-restaurant-id': restaurantId };
    await fresh();
    const supplier = await call('POST', '/api/suppliers', { name: 'Grossiste Chef', whatsapp: '+33600000002', leadTimeHours: 24 }, mgr);
    expect(supplier.status).toBe(201);
    const sup = supplier.json.supplier?.id ?? supplier.json.id;
    const offline = await call('POST', `/api/suppliers/${sup}/offers`, { productId: (await call('GET', '/api/stock', undefined, mgr)).json.items[0].productId, packLabel: 'sac 25 kg', packQty: 25, packPrice: 40 }, mgr);
    expect(offline.status).toBeLessThan(300);
    expect((await call('POST', '/api/billing/checkout', {}, mgr)).status).toBe(403);
    expect((await call('POST', '/api/members', { email: 'x@y.fr', role: 'staff' }, mgr)).status).toBe(403);
  });
  it('le dernier propriétaire ne peut être ni rétrogradé ni retiré', async () => {
    const patron = (await call('GET', '/api/auth/me', undefined, owner)).json.user.id;
    const demote = await call('PATCH', `/api/members/${patron}`, { role: 'staff' }, owner);
    expect(demote.status).toBe(409); expect(demote.json.error).toMatch(/propriétaire/);
    expect((await call('DELETE', `/api/members/${patron}`, undefined, owner)).status).toBe(409);
  });
  it('le propriétaire peut retirer un membre ; son compte disparaît s’il n’a plus de restaurant', async () => {
    const list = await call('GET', '/api/members', undefined, owner);
    const kofi = list.json.members.find((m: Json) => m.email === 'aide@resto.fr');
    expect((await call('DELETE', `/api/members/${kofi.userId}`, undefined, owner)).status).toBe(200);
    const after = await call('GET', '/api/members', undefined, owner);
    expect(after.json.members.some((m: Json) => m.email === 'aide@resto.fr')).toBe(false);
    await fresh();
    expect((await call('POST', '/api/auth/login', { email: 'aide@resto.fr', password: STRONG })).status).toBe(401);
  });
});

describe('6. Routes inconnues et en-têtes', () => {
  it('une URL inexistante répond 404 (et non 401) — BUG-5 de l’audit', async () => {
    const r = await call('GET', '/api/inconnu');
    expect(r.status).toBe(404); expect(r.json.error).toMatch(/Route inconnue/);
    expect((await call('GET', '/api/dashboard')).status).toBe(401);   // route réelle, non authentifié
    expect(isKnownPath('/api/orders')).toBe(true);
    expect(isKnownPath('/api/nimporte-quoi')).toBe(false);
  });
  it('les réponses de l’API ne sont pas mises en cache par le navigateur', async () => {
    const r = await call('GET', '/api/health');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('7. Cloisonnement des produits privés (BUG-6)', () => {
  it('un restaurant ne peut pas lire le nom du produit privé d’un autre (404 au lieu de 200)', async () => {
    await fresh();
    // Restaurant A crée un produit privé
    const a = await call('POST', '/api/auth/register', { email: 'a-cloison@resto.fr', password: STRONG, fullName: 'A Cloison', restaurantName: 'Resto A Cloison' });
    const tokA = a.json.token; const ridA = a.json.restaurant.id;
    const created = await call('POST', '/api/catalog/products', { name: 'Produit privé de A', category: 'epicerie', baseUnit: 'kg' }, { authorization: `Bearer ${tokA}`, 'x-restaurant-id': ridA });
    expect(created.status).toBe(201);
    const privateId = created.json.id;

    // Restaurant B tente de le comparer
    const b = await call('POST', '/api/auth/register', { email: 'b-cloison@resto.fr', password: STRONG, fullName: 'B Cloison', restaurantName: 'Resto B Cloison' });
    const tokB = b.json.token; const ridB = b.json.restaurant.id;
    const leak = await call('GET', `/api/compare/${privateId}`, undefined, { authorization: `Bearer ${tokB}`, 'x-restaurant-id': ridB });
    expect(leak.status).toBe(404);
    expect(JSON.stringify(leak.json)).not.toMatch(/Produit privé de A/);

    // Le propriétaire légitime y accède toujours
    const mine = await call('GET', `/api/compare/${privateId}`, undefined, { authorization: `Bearer ${tokA}`, 'x-restaurant-id': ridA });
    expect(mine.status).toBe(200);
    expect(mine.json.product.name).toBe('Produit privé de A');

    // Les produits du référentiel AFRISUPPLY restent accessibles à tous
    const refProducts = (await call('GET', '/api/catalog?q=riz', undefined, { authorization: `Bearer ${tokB}`, 'x-restaurant-id': ridB })).json.items ?? [];
    const ref = refProducts.find((p: Json) => !p.restaurantId);
    if (ref) {
      const shared = await call('GET', `/api/compare/${ref.id}`, undefined, { authorization: `Bearer ${tokB}`, 'x-restaurant-id': ridB });
      expect(shared.status).toBe(200);
    }
  });
});

// =============================================================
// Chantier 5 (audit S1/B7) — rate-limit PARTAGÉ (serverless-proof)
// Critère de validation : 14 logins rapides → 429, et le compteur vit en base.
// =============================================================
describe('6. Rate-limit partagé entre instances (Postgres)', () => {
  it('14 logins rapides → 429 (critère de validation du chantier 5)', async () => {
    await fresh();
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      const r = await call('POST', '/api/auth/login', { email: 'brute@force.fr', password: 'mauvais-' + i });
      statuses.push(r.status);
    }
    // max 10/min sur /auth/login : les 10 premières tentatives atteignent l'authentification (401),
    // les suivantes sont refusées avant (429).
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10).every((s) => s === 429)).toBe(true);
    // l'en-tête Retry-After est présent sur le refus
    await fresh();
  });

  it('le compteur vit dans Postgres (partagé entre instances), pas en mémoire', async () => {
    await fresh();
    for (let i = 0; i < 3; i++) await call('POST', '/api/auth/login', { email: 'compteur@base.fr', password: 'x' });
    const { getDb, rateLimits } = await import('@afrisupply/db');
    const db = await getDb();
    const rows = await db.select().from(rateLimits);
    const loginRow = rows.find((r) => r.key.startsWith('/api/auth/login:'));
    expect(loginRow).toBeDefined();
    expect(Number(loginRow!.n)).toBeGreaterThanOrEqual(3);
  });

  it('la fenêtre expire : après réinitialisation, le service est rétabli', async () => {
    await fresh();
    for (let i = 0; i < 11; i++) await call('POST', '/api/auth/login', { email: 'fenetre@gl.fr', password: 'x' });
    const bloque = await call('POST', '/api/auth/login', { email: 'autre@ip.fr', password: 'x' }); // 12e = 429
    expect(bloque.status).toBe(429);
    await fresh(); // la purge (=_resetRateLimits) rétablit aussitôt
    const retabli = await call('POST', '/api/auth/login', { email: 'fenetre@gl.fr', password: 'x' });
    expect(retabli.status).toBe(401);
  });
});

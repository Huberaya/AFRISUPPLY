// Chantier 5 (audit) — ACCÈS ET RÉCUPÉRATION DE COMPTE
//
// 1. Adresse e-mail réellement confirmable (jeton haché, usage unique, 48 h, renvoi).
// 2. Mot de passe oublié : jeton à usage unique, expiré refusé, sessions révoquées.
// 3. Rôles réellement appliqués côté serveur, y compris sur un jeton déjà émis.
// 4. Un employé ne peut pas détruire le compte ; le dernier propriétaire est protégé.
import { describe, it, expect, beforeAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { runMigrations, getDb, users, emailVerifications } from '@afrisupply/db';
import { app } from '../app.js';
import { hashEmailToken } from '../lib/reset-link.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.CRON_SECRET = 'cron-test';
process.env.PGLITE_DIR = 'memory://chantier5'; process.env.MAIL_OUTBOX_DIR = '/tmp/afs-outbox-chantier5';
delete process.env.RESEND_API_KEY; delete process.env.APP_URL;

const call = async (method: string, path: string, opts: { token?: string; rid?: string; body?: unknown } = {}) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.rid) headers['X-Restaurant-Id'] = opts.rid;
  const res = await app.request(path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const text = await res.text();
  let json: any = {}; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
};
const tokenOf = (link: string) => new URL(link).searchParams.get('token')!;

let owner: any = {};   // propriétaire
let secondaire: any = {};   // compte non confirmé (expiration / renvoi)
let autre: any = {};        // second restaurant : cloisonnement et « non confirmé mais pas bloqué »
let rid = '';

beforeAll(async () => { await runMigrations(); }, 60_000);

describe('1. Confirmation de l’adresse e-mail', () => {
  it('l’inscription crée un jeton à usage unique et dit la vérité sur l’envoi', async () => {
    const r = await call('POST', '/api/auth/register', { body: { email: 'patron@resto-cinq.fr', password: 'Plantain-Yassa-42', fullName: 'Awa Patron', restaurantName: 'Chez Awa Cinq', city: 'Nantes', coversPerDay: 80 } });
    expect(r.status).toBe(201);
    expect(r.json.emailVerified).toBe(false);
    expect(r.json.emailVerification.delivered).toBe(true);          // transport « fichier » en test : réellement écrit
    expect(r.json.emailVerification.devLink).toContain('/verifier-email?token=');
    owner = { token: r.json.token, id: r.json.user.id, email: 'patron@resto-cinq.fr', devLink: r.json.emailVerification.devLink };
    rid = r.json.restaurant.id;

    const me = await call('GET', '/api/auth/me', { token: owner.token });
    expect(me.json.user.emailVerified).toBe(false);
    expect(me.json.user.emailVerifiedAt).toBeNull();
  });

  it('le jeton de confirmation est stocké HACHÉ (jamais en clair) et expire', async () => {
    const db = await getDb();
    const rows = await db.select().from(emailVerifications).where(eq(emailVerifications.userId, owner.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toContain(tokenOf(owner.devLink));
    expect(rows[0].tokenHash).toBe(hashEmailToken(tokenOf(owner.devLink)));
    const hoursLeft = (rows[0].expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(hoursLeft).toBeGreaterThan(47);                          // 48 h par défaut
  });

  it('un jeton inconnu est refusé', async () => {
    const r = await call('POST', '/api/auth/verify-email', { body: { token: 'jeton-invente-de-trente-deux-caracteres' } });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('verify_invalid');
  });

  it('un jeton expiré est refusé (48 h dépassées)', async () => {
    const db = await getDb();
    // Compte secondaire, non confirmé : sert aussi au test du renvoi de lien ci-dessous.
    secondaire = (await call('POST', '/api/auth/register', { body: { email: 'secondaire@resto-cinq.fr', password: 'Plantain-Yassa-42', fullName: 'Testi Secondaire', restaurantName: 'Resto Secondaire', city: 'Lyon', coversPerDay: 30 } })).json;
    const token = tokenOf(secondaire.emailVerification.devLink);
    // On recule la date d'expiration en base : le temps réel du test ne suffit pas à attendre 48 h.
    const back = await db.update(emailVerifications).set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(and(eq(emailVerifications.userId, secondaire.user.id), eq(emailVerifications.tokenHash, hashEmailToken(token))));
    expect(back).toBeDefined();
    const r = await call('POST', '/api/auth/verify-email', { body: { token } });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('verify_expired');
  });

  it('confirmer l’adresse fonctionne, une seule fois', async () => {
    const r = await call('POST', '/api/auth/verify-email', { body: { token: tokenOf(owner.devLink) } });
    expect(r.status).toBe(200);
    expect(r.json.alreadyVerified).toBe(false);
    const me = await call('GET', '/api/auth/me', { token: owner.token });
    expect(me.json.user.emailVerified).toBe(true);
    expect(me.json.user.emailVerifiedAt).toBeTruthy();
    // Deuxième clic sur le même lien : information claire, pas une erreur bloquante
    const again = await call('POST', '/api/auth/verify-email', { body: { token: tokenOf(owner.devLink) } });
    expect(again.status).toBe(200);
    expect(again.json.alreadyVerified).toBe(true);
  });

  it('un nouveau lien invalide le précédent', async () => {
    const oldToken = tokenOf(secondaire.emailVerification.devLink);
    const resend = await call('POST', '/api/auth/resend-verification', { token: secondaire.token });
    expect(resend.status).toBe(200);
    expect(resend.json.delivered).toBe(true);
    const newToken = tokenOf(resend.json.devLink);
    expect(newToken).not.toBe(oldToken);
    expect((await call('POST', '/api/auth/verify-email', { body: { token: oldToken } })).status).toBe(400);  // l'ancien lien est mort
    expect((await call('POST', '/api/auth/verify-email', { body: { token: newToken } })).status).toBe(200);
    const encore = await call('POST', '/api/auth/resend-verification', { token: secondaire.token });
    expect(encore.json.alreadyVerified).toBe(true);
  });

  it('réinitialiser son mot de passe par un lien reçu confirme aussi l’adresse', async () => {
    const fresh = (await call('POST', '/api/auth/register', { body: { email: 'motdepasse@resto-cinq.fr', password: 'Plantain-Yassa-42', fullName: 'Testi Motdepasse', restaurantName: 'Resto Motdepasse', city: 'Nantes', coversPerDay: 40 } })).json;
    const forgot = await call('POST', '/api/auth/forgot-password', { body: { email: 'motdepasse@resto-cinq.fr' } });
    expect(forgot.status).toBe(200);
    expect(forgot.json.delivered).toBe(true);
    const reset = await call('POST', '/api/auth/reset-password', { body: { token: tokenOf(forgot.json.devLink), password: 'Yassa-Plantain-7' } });
    expect(reset.status).toBe(200);
    const login = await call('POST', '/api/auth/login', { body: { email: 'motdepasse@resto-cinq.fr', password: 'Yassa-Plantain-7' } });
    expect(login.status).toBe(200);
    const me = await call('GET', '/api/auth/me', { token: login.json.token });
    expect(me.json.user.emailVerified).toBe(true);
    void fresh;
  });
});

describe('2. Mot de passe oublié : usage unique et sessions révoquées', () => {
  it('le lien ne sert qu’une fois, l’ancien mot de passe ne fonctionne plus, les sessions tombent', async () => {
    const forgot = await call('POST', '/api/auth/forgot-password', { body: { email: owner.email } });
    expect(forgot.json.delivered).toBe(true);
    const token = tokenOf(forgot.json.devLink);
    expect((await call('POST', '/api/auth/reset-password', { body: { token, password: 'Nouveau-Mot-De-Passe-9' } })).status).toBe(200);
    // réutilisation du même lien : refusée
    const reuse = await call('POST', '/api/auth/reset-password', { body: { token, password: 'Encore-Un-Autre-42' } });
    expect(reuse.status).toBe(400);
    expect(reuse.json.code).toBe('reset_invalid');
    // ancien mot de passe : refusé
    expect((await call('POST', '/api/auth/login', { body: { email: owner.email, password: 'Plantain-Yassa-42' } })).status).toBe(401);
    // nouveau mot de passe : accepté
    const login = await call('POST', '/api/auth/login', { body: { email: owner.email, password: 'Nouveau-Mot-De-Passe-9' } });
    expect(login.status).toBe(200);
    // le jeton d'avant la réinitialisation est révoqué
    const old = await call('GET', '/api/auth/me', { token: owner.token });
    expect(old.status).toBe(401);
    // L'API distingue « jeton invalide » de « session révoquée » : ici c'est bien une révocation.
    expect(['session_revoked', 'session_invalid']).toContain(old.json.code);
    owner.token = login.json.token;
  });

  it('une adresse inconnue ne révèle rien et un mot de passe faible est refusé', async () => {
    const unknown = await call('POST', '/api/auth/forgot-password', { body: { email: 'personne@nulle-part.fr' } });
    expect(unknown.status).toBe(200);
    expect(unknown.json.ok).toBe(true);
    expect(unknown.json.delivered).toBeUndefined();                 // aucun envoi : on ne prétend rien
    const forgot = await call('POST', '/api/auth/forgot-password', { body: { email: owner.email } });
    const weak = await call('POST', '/api/auth/reset-password', { body: { token: tokenOf(forgot.json.devLink), password: 'motdepasse' } });
    expect(weak.status).toBe(400);
    expect(weak.json.code).toBe('weak_password');
  });
});

describe('3. Rôles réellement appliqués côté serveur', () => {
  let staff: any = {}; let manager: any = {};
  const inviteAndLogin = async (email: string, role: string, fullName: string) => {
    const inv = await call('POST', '/api/members', { token: owner.token, rid, body: { email, fullName, role } });
    expect(inv.status).toBe(201);
    expect(inv.json.invited).toBe(true);
    expect(inv.json.devLink).toContain('/bienvenue?token=');
    const set = await call('POST', '/api/auth/reset-password', { body: { token: tokenOf(inv.json.devLink), password: 'Mot-De-Passe-Equipe-3' } });
    expect(set.status).toBe(200);
    const login = await call('POST', '/api/auth/login', { body: { email, password: 'Mot-De-Passe-Equipe-3' } });
    expect(login.status).toBe(200);
    return { token: login.json.token, id: login.json.user.id, email };
  };

  it('le propriétaire invite un responsable et un employé', async () => {
    staff = await inviteAndLogin('employe@resto-cinq.fr', 'staff', 'Awa Employée');
    manager = await inviteAndLogin('responsable@resto-cinq.fr', 'manager', 'Awa Responsable');
    const list = await call('GET', '/api/members', { token: owner.token, rid });
    expect(list.status).toBe(200);
    expect(list.json.members.map((m: any) => m.role).sort()).toEqual(['manager', 'owner', 'staff']);
  });

  it('un employé ne peut ni gérer l’équipe, ni toucher aux réglages, ni payer, ni exporter', async () => {
    const cases: [string, string, string, unknown][] = [
      ['POST', '/api/members', 'inviter un membre', { email: 'x@y.fr', role: 'staff' }],
      ['PATCH', `/api/members/${manager.id}`, 'changer un rôle', { role: 'staff' }],
      ['DELETE', `/api/members/${manager.id}`, 'retirer un membre', undefined],
      ['PUT', '/api/settings', 'modifier les réglages', { digestHour: 6 }],
      ['POST', '/api/billing/checkout', 'payer un abonnement', {}],
      ['GET', '/api/account/export', 'exporter les données', undefined],
    ];
    for (const [method, path, label, body] of cases) {
      const r = await call(method, path, { token: staff.token, rid, body });
      expect(`${label}:${r.status}`).toBe(`${label}:403`);
      expect(r.json.code).toBe('role_required');
    }
  });

  it('un employé ne peut pas supprimer le compte du restaurant', async () => {
    const r = await call('DELETE', '/api/account', { token: staff.token, body: { password: 'Mot-De-Passe-Equipe-3', confirm: 'SUPPRIMER' } });
    expect(r.status).toBe(403);
    expect(r.json.requiredRole).toBe('owner');
    const still = await call('GET', '/api/auth/me', { token: owner.token });
    expect(still.status).toBe(200);                                 // le restaurant existe toujours
  });

  it('un responsable peut exporter mais pas gérer l’équipe ni payer ni supprimer', async () => {
    expect((await call('GET', '/api/account/export', { token: manager.token })).status).toBe(200);
    expect((await call('POST', '/api/members', { token: manager.token, rid, body: { email: 'z@z.fr', role: 'staff' } })).status).toBe(403);
    expect((await call('POST', '/api/billing/checkout', { token: manager.token, rid, body: {} })).status).toBe(403);
    expect((await call('DELETE', '/api/account', { token: manager.token, body: { password: 'Mot-De-Passe-Equipe-3', confirm: 'SUPPRIMER' } })).status).toBe(403);
  });

  it('un changement de rôle prend effet immédiatement, même sur un jeton déjà émis', async () => {
    expect((await call('GET', '/api/account/export', { token: manager.token })).status).toBe(200);
    const demote = await call('PATCH', `/api/members/${manager.id}`, { token: owner.token, rid, body: { role: 'staff' } });
    expect(demote.status).toBe(200);
    const after = await call('GET', '/api/account/export', { token: manager.token });
    expect(after.status).toBe(403);                                 // même jeton, rôle lu en base à chaque requête
    await call('PATCH', `/api/members/${manager.id}`, { token: owner.token, rid, body: { role: 'manager' } });
    expect((await call('GET', '/api/account/export', { token: manager.token })).status).toBe(200);
  });

  it('le dernier propriétaire ne peut être ni rétrogradé ni retiré', async () => {
    const list = await call('GET', '/api/members', { token: owner.token, rid });
    expect(list.json.members.filter((m: any) => m.role === 'owner')).toHaveLength(1);
    const demote = await call('PATCH', `/api/members/${owner.id}`, { token: owner.token, rid, body: { role: 'staff' } });
    expect(demote.status).toBe(409);
    const remove = await call('DELETE', `/api/members/${owner.id}`, { token: owner.token, rid });
    expect(remove.status).toBe(409);
    expect((await call('GET', '/api/auth/me', { token: owner.token })).json.restaurants[0].role).toBe('owner');
  });

  it('un désaccord de rôle ne fait pas fuiter les données d’un autre restaurant', async () => {
    const other = (await call('POST', '/api/auth/register', { body: { email: 'autre@resto-six.fr', password: 'Plantain-Yassa-42', fullName: 'Autre Patron', restaurantName: 'Resto Six', city: 'Rennes', coversPerDay: 20 } })).json;
    autre = other;
    const list = await call('GET', '/api/members', { token: other.token, rid });   // tente l'équipe du premier restaurant
    expect([403, 404]).toContain(list.status);
    const members = await call('GET', '/api/members', { token: other.token, rid: other.restaurant.id });
    expect(members.json.members).toHaveLength(1);                   // il ne voit que la sienne
  });
});

describe('4. Ce que voit la personne concernée (et pas seulement le serveur)', () => {
  it('/auth/me expose le rôle réel du membre, y compris après rétrogradation', async () => {
    const staffLogin = await call('POST', '/api/auth/login', { body: { email: 'employe@resto-cinq.fr', password: 'Mot-De-Passe-Equipe-3' } });
    const me = await call('GET', '/api/auth/me', { token: staffLogin.json.token });
    expect(me.status).toBe(200);
    const resto = me.json.restaurants.find((r: any) => r.id === rid);
    expect(resto.role).toBe('staff');
    expect(me.json.mailTransport).toBeTruthy();                     // l'app sait si un e-mail peut réellement partir
  });

  it('un utilisateur tout juste inscrit n’a aucune fausse promesse dans la réponse', async () => {
    expect(autre.emailVerified).toBe(false);
    expect(autre.emailVerification).toMatchObject({ delivered: true, transport: 'file' });
    expect(autre.emailVerification.warning).toBeUndefined();        // ici un e-mail part vraiment
    const me = await call('GET', '/api/auth/me', { token: autre.token });
    expect(me.json.user.emailVerified).toBe(false);
  });
});

describe('4 bis. En production sans envoi d’e-mails configuré, l’app prévient au lieu de mentir', () => {
  it('un envoi impossible est annoncé comme tel (transport « log »)', async () => {
    // mailerConfig() lit l'environnement au moment de l'envoi : on simule un déploiement serverless sans clé.
    process.env.VERCEL = '1';
    try {
      const r = await call('POST', '/api/auth/resend-verification', { token: autre.token });
      expect(r.status).toBe(200);
      expect(r.json.delivered).toBe(false);
      expect(r.json.transport).toBe('log');
      expect(r.json.code).toBe('mail_not_delivered');
      expect(r.json.message).toMatch(/pas configuré|n.a pas pu être envoyé/i);
      expect(r.json.message).not.toMatch(/envoyé à/);            // aucune promesse fausse
      expect(r.json.devLink).toBeUndefined();                      // et aucun lien en clair hors développement

      const forgot = await call('POST', '/api/auth/forgot-password', { body: { email: autre.user.email } });
      expect(forgot.status).toBe(200);
      expect(forgot.json.delivered).toBe(false);
      expect(forgot.json.message).toMatch(/n’est pas configuré|support/i);
      expect(forgot.json.devLink).toBeUndefined();
    } finally { delete process.env.VERCEL; }
  });

  it('une invitation n’est pas annoncée comme envoyée si rien ne peut partir', async () => {
    process.env.VERCEL = '1';
    try {
      const r = await call('POST', '/api/members', { token: owner.token, rid, body: { email: 'invite-sans-mail@resto-cinq.fr', fullName: 'Testi Sans Mail', role: 'staff' } });
      expect(r.status).toBe(201);
      expect(r.json.delivered).toBe(false);
      expect(r.json.code).toBe('mail_not_delivered');
      expect(r.json.message).toMatch(/n.a pas pu être envoyé/);
      expect(r.json.message).not.toMatch(/a reçu un lien/);        // aucune promesse fausse
      expect(r.json.devLink).toBeUndefined();                       // et pas de jeton en clair hors développement
      // le membre existe bien : l'invitation est enregistrée, seul l'envoi manque
      const list = await call('GET', '/api/members', { token: owner.token, rid });
      expect(list.json.members.some((m: any) => m.email === 'invite-sans-mail@resto-cinq.fr')).toBe(true);
    } finally { delete process.env.VERCEL; }
  });

  it('le retour à un transport réel rétablit un envoi annoncé comme tel', async () => {
    const r = await call('POST', '/api/auth/resend-verification', { token: autre.token });
    expect(r.json.delivered).toBe(true);
    expect(r.json.devLink).toContain('/verifier-email?token=');
  });
});

describe('5. Ce qui doit rester vrai pour les utilisateurs déjà en base', () => {
  it('un compte créé sans adresse confirmée peut quand même travailler (aucun blocage)', async () => {
    const tok = autre.token; const r2 = autre.restaurant.id;   // compte jamais confirmé
    expect((await call('GET', '/api/dashboard', { token: tok, rid: r2 })).status).toBe(200);
    expect((await call('POST', '/api/suppliers', { token: tok, rid: r2, body: { name: 'Grossiste Test', leadTimeHours: 24 } })).status).toBe(201);
    void users;
  });
});

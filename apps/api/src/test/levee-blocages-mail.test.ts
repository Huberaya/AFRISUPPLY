// Levée des blocages — chantier E : e-mails et tâche d'alertes.
//
// Constats relevés en base de production (lecture indépendante) : 83 e-mails de confirmation non
// remis pour 1 remis, et 61 passages de la tâche d'alertes en erreur dont 54 avec pour seul motif
// « N restaurant(s) sans envoi possible ». L'expéditeur est l'adresse d'essai du prestataire, qui ne
// remet qu'au titulaire de son compte.
//
// Ce que ces tests verrouillent :
//   1. chaque échec d'envoi a un MOTIF (code) : destinataire refusé, domaine non vérifié, clé refusée,
//      limite de débit, panne, réseau, service non configuré ;
//   2. aucun texte du prestataire, aucune adresse e-mail complète, aucune clé ne sort dans un résultat,
//      un journal, une ligne de suivi ou la page de statut publique ;
//   3. la tâche d'alertes dit pourquoi rien n'est parti, n'insiste pas quand l'échec vaut pour tout le
//      monde, ne s'en prend pas à un restaurant sans destinataire, et reprend sans doublon.
//
// Le prestataire d'e-mails est SIMULÉ (serveur local qui répond comme lui). Un envoi réel reste à
// faire sur une prévisualisation propre : docs/audits/RESEND_VALIDATION_PREVIEW.md.
import http from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'un-secret-de-test-de-quarante-caracteres-0002';
process.env.CRON_SECRET = 'secret-des-taches-de-test-0002';
process.env.DATABASE_URL = '';
process.env.PGLITE_DIR = 'memory://levee-blocages-mail';
process.env.RESEND_API_KEY = 're_cle_de_test_secrete_0002';
process.env.MAIL_FROM = 'AFRISUPPLY <onboarding@resend.dev>';
delete process.env.VERCEL; delete process.env.APP_URL;

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb, runMigrations, alerts, jobRuns, restaurants, restaurantMembers, auditLog, emailVerifications } from '@afrisupply/db';

// --- faux prestataire d'e-mails -----------------------------------------------------------------
const TITULAIRE = 'titulaire.du.compte@prestataire-exemple.test';      // l'adresse que le vrai prestataire écrit dans son message de refus
type Mode = 'ok' | 'expediteur_essai' | 'domaine' | 'cle' | 'debit' | 'panne' | 'destinataire' | 'autre';
let mode: Mode = 'ok';
const recus: string[] = [];        // destinataires de chaque appel reçu
const textes: string[] = [];       // texte de chaque message reçu
let delaiMs = 0;                   // lenteur simulée du prestataire
let serveur: http.Server;
const REPONSES: Record<Exclude<Mode, 'ok'>, [number, Record<string, unknown>]> = {
  expediteur_essai: [403, { statusCode: 403, name: 'validation_error', message: `You can only send testing emails to your own email address (${TITULAIRE}). To send emails to other recipients, please verify a domain at resend.com/domains, and change the \`from\` address to an email using this domain.` }],
  domaine: [403, { statusCode: 403, name: 'validation_error', message: 'The exemple-societe.test domain is not verified. Please, add and verify your domain on https://resend.com/domains' }],
  cle: [401, { statusCode: 401, name: 'restricted_api_key', message: 'API key is invalid' }],
  debit: [429, { statusCode: 429, name: 'rate_limit_exceeded', message: 'Too many requests. You can only make 2 requests per second.' }],
  panne: [500, { statusCode: 500, name: 'internal_server_error', message: 'An unexpected error occurred.' }],
  destinataire: [422, { statusCode: 422, name: 'invalid_to_address', message: 'Invalid `to` field. The email address needs to follow the `email@example.com` format.' }],
  autre: [422, { statusCode: 422, name: 'validation_error', message: 'Missing required field.' }],
};

beforeAll(async () => {
  serveur = http.createServer((req, res) => {
    let corps = '';
    req.on('data', (d) => { corps += d; });
    req.on('end', () => {
      const recu = JSON.parse(corps || '{}') as { to?: string[]; text?: string };
      const to = String(recu.to?.[0] ?? '');
      recus.push(to); textes.push(String(recu.text ?? ''));
      const json = (status: number, body: unknown) => { setTimeout(() => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }, delaiMs); };
      if (mode === 'ok') return json(200, { id: `msg_${recus.length}` });
      // Comme le vrai prestataire : avec l'expéditeur d'essai, le titulaire du compte est servi, pas les autres.
      if (mode === 'expediteur_essai' && to === TITULAIRE) return json(200, { id: `msg_${recus.length}` });
      return json(...REPONSES[mode]);
    });
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  process.env.RESEND_API_URL = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
  await runMigrations();
}, 90_000);
afterAll(async () => { await new Promise<void>((ok) => { serveur.closeAllConnections(); serveur.close(() => ok()); }); });

const { app } = await import('../app.js');
const { sendMail, classifyProviderFailure, redact, maskEmail, mailStats, _resetMailStats, MAIL_ERROR_MESSAGES } = await import('../lib/mailer.js');
const { notifyAllRestaurants, notifyCriticalAlerts } = await import('../lib/notify.js');
const { _resetRateLimits } = await import('../lib/ops.js');

const message = (to: string) => ({ to, subject: 'Sujet', text: 'Bonjour', html: '<p>Bonjour</p>' });
let n = 0;
/** Un restaurant d'essai avec une alerte urgente en attente. */
async function restaurantAvecAlerte(opts: { destinataires?: string[]; sansResponsable?: boolean } = {}) {
  n += 1;
  const email = `responsable-${n}@restaurant-exemple.test`;
  await _resetRateLimits();      // l'inscription est limitée à cinq par minute : ce n'est pas ce qu'on teste ici
  const res = await app.request('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Plantain-Yassa-42', fullName: `Responsable ${n}`, restaurantName: `Restaurant Essai ${n}` }) });
  const rid = ((await res.json()) as { restaurant: { id: string } }).restaurant.id;
  const db = await getDb();
  if (opts.destinataires) await db.update(restaurants).set({ settings: { digestRecipients: opts.destinataires } }).where(eq(restaurants.id, rid));
  if (opts.sansResponsable) await db.update(restaurantMembers).set({ role: 'staff' }).where(eq(restaurantMembers.restaurantId, rid));
  await db.insert(alerts).values({ restaurantId: rid, dedupeKey: `essai-${n}`, kind: 'rupture', severity: 'red', title: 'Rupture : riz parfumé', message: 'Stock à zéro.' });
  recus.length = 0;              // l'inscription a envoyé son e-mail de confirmation : on ne compte que les alertes
  return { rid, email };
}
const enAttente = async (rid: string) => (await (await getDb()).select({ id: alerts.id }).from(alerts).where(and(eq(alerts.restaurantId, rid), isNull(alerts.notifiedAt)))).length;
/** Remet les compteurs à zéro : plus aucune alerte en attente, plus aucun appel compté. */
async function menage() {
  await (await getDb()).update(alerts).set({ notifiedAt: new Date() }).where(isNull(alerts.notifiedAt));
  recus.length = 0; textes.length = 0; mode = 'ok'; delaiMs = 0; _resetMailStats();
}
beforeEach(menage);

describe('chaque refus du prestataire a un motif', () => {
  it('classement d’après le code HTTP, le nom et le message', () => {
    const c = (m: Exclude<Mode, 'ok'>) => classifyProviderFailure(REPONSES[m][0], REPONSES[m][1]);
    expect(c('expediteur_essai')).toBe('mail_test_sender_restricted');
    expect(c('domaine')).toBe('mail_domain_not_verified');
    expect(c('cle')).toBe('mail_key_invalid');
    expect(c('debit')).toBe('mail_rate_limited');
    expect(c('panne')).toBe('mail_provider_error');
    expect(c('destinataire')).toBe('mail_recipient_rejected');
    expect(c('autre')).toBe('mail_rejected');
    expect(classifyProviderFailure(403, { name: 'invalid_api_key', message: 'API key is invalid' })).toBe('mail_key_invalid');
    expect(classifyProviderFailure(429, { name: 'daily_quota_exceeded', message: 'You have reached your daily email sending quota.' })).toBe('mail_rate_limited');
    expect(classifyProviderFailure(422, { name: 'invalid_from_address', message: 'Invalid `from` field.' })).toBe('mail_from_invalid');
    expect(classifyProviderFailure(503, null)).toBe('mail_provider_error');
    expect(classifyProviderFailure(400, {})).toBe('mail_rejected');
  });

  it('masquage : adresses, clés et jetons', () => {
    expect(redact(`refus pour ${TITULAIRE}`)).toBe('refus pour t***@prestataire-exemple.test');
    expect(maskEmail('awa.diop@chez-awa.test')).toBe('a***@chez-awa.test');
    expect(redact('clé re_abcdEFGH12345678 et sk_live_abcdefgh12345678')).toBe('clé re_*** et sk_***');
    expect(redact('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def')).toBe('Authorization: Bearer ***');
    expect(redact('https://exemple.test/verifier-email?token=abcdef1234567890&x=1')).toBe('https://exemple.test/verifier-email?token=***&x=1');
  });
});

describe('un envoi refusé : motif exact, et rien de confidentiel ne sort', () => {
  const cas: [Exclude<Mode, 'ok'>, string, boolean][] = [
    ['expediteur_essai', 'mail_test_sender_restricted', false], ['domaine', 'mail_domain_not_verified', false], ['cle', 'mail_key_invalid', false],
    ['debit', 'mail_rate_limited', true], ['panne', 'mail_provider_error', true], ['destinataire', 'mail_recipient_rejected', false], ['autre', 'mail_rejected', false],
  ];
  for (const [m, code, reessayable] of cas) {
    it(`${m} → ${code}${reessayable ? ' (à réessayer)' : ''}`, async () => {
      mode = m;
      const journal: string[] = [];
      const espions = (['log', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { journal.push(a.map(String).join(' ')); }));
      const res = await sendMail(message('cliente@restaurant-exemple.test'));
      for (const e of espions) e.mockRestore();
      expect(res).toMatchObject({ ok: false, delivered: false, transport: 'resend', code, retryable: reessayable, error: MAIL_ERROR_MESSAGES[code as keyof typeof MAIL_ERROR_MESSAGES] });
      expect(mailStats()).toMatchObject({ failed: 1, lastErrorCode: code });
      // Ni l'adresse du titulaire du compte (présente dans le message du prestataire), ni celle du
      // destinataire, ni la clé : dans le résultat, les compteurs et les journaux.
      const sortie = JSON.stringify(res) + JSON.stringify(mailStats()) + journal.join('\n');
      for (const interdit of [TITULAIRE, 'cliente@restaurant-exemple.test', process.env.RESEND_API_KEY!, 'only send testing emails']) expect(sortie).not.toContain(interdit);
    });
  }

  it('prestataire injoignable → mail_network_error (à réessayer)', async () => {
    const adresse = process.env.RESEND_API_URL; process.env.RESEND_API_URL = 'http://127.0.0.1:1';
    const res = await sendMail(message('cliente@restaurant-exemple.test'));
    process.env.RESEND_API_URL = adresse;
    expect(res).toMatchObject({ ok: false, code: 'mail_network_error', retryable: true });
    expect(JSON.stringify(res)).not.toContain('127.0.0.1');
  });

  it('la page de statut PUBLIQUE ne montre que le motif — jamais le texte du prestataire', async () => {
    mode = 'expediteur_essai';
    await sendMail(message('cliente@restaurant-exemple.test'));
    const statut = await (await app.request('/api/status')).text();
    expect(JSON.parse(statut).checks.mail).toMatchObject({ testSender: true, stats: { failed: 1, lastErrorCode: 'mail_test_sender_restricted' } });
    for (const interdit of [TITULAIRE, 'cliente@restaurant-exemple.test', 'prestataire-exemple']) expect(statut).not.toContain(interdit);
  });

  it('l’adresse du prestataire n’est pas modifiable par une variable en production', async () => {
    const avant = { ...process.env };
    process.env.NODE_ENV = 'production';     // RESEND_API_URL pointe toujours vers le faux prestataire
    const debut = recus.length;
    const res = await sendMail(message('cliente@restaurant-exemple.test'));
    process.env.NODE_ENV = avant.NODE_ENV;
    expect(recus.length).toBe(debut);         // le faux prestataire n'a rien reçu : la variable est ignorée
    expect(res.ok).toBe(false);               // la vraie adresse a refusé la clé de test, ou est injoignable d'ici
  }, 30_000);
});

describe('tâche d’alertes : elle dit pourquoi, n’insiste pas, reprend sans doublon', () => {
  const derniereLigne = async () => (await (await getDb()).select().from(jobRuns).where(eq(jobRuns.job, 'alerts-notify'))).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];

  it('expéditeur d’essai : rien ne part, le motif est écrit, les alertes restent en attente — puis partent UNE fois', async () => {
    const a = await restaurantAvecAlerte(); const b = await restaurantAvecAlerte(); const c = await restaurantAvecAlerte();
    mode = 'expediteur_essai';
    const passe1 = await notifyAllRestaurants();
    expect(passe1).toMatchObject({ withAlerts: 3, emails: 0, failed: 3, skipped: 0, reasons: { mail_test_sender_restricted: 1, not_attempted: 2 } });
    // Rien n'a été remis au premier restaurant essayé : le prestataire refusera les suivants pour la même
    // raison (seul le titulaire de son compte serait servi). Le balayage cesse donc de le solliciter — sinon
    // chaque passage frappe le prestataire une fois par restaurant jusqu'à la limite de débit.
    expect(recus).toHaveLength(1);
    const ligne = await derniereLigne();
    expect(ligne.status).toBe('error');
    expect(ligne.error).toMatch(/^3 restaurant\(s\) sans envoi \[mail_test_sender_restricted\] — L'expéditeur est l'adresse d'essai/);
    expect(ligne.summary).toMatchObject({ withAlerts: 3, failed: 3, reasons: { mail_test_sender_restricted: 1, not_attempted: 2 }, stoppedSendingFor: 'mail_test_sender_restricted' });
    for (const r of [a, b, c]) expect(await enAttente(r.rid)).toBe(1);

    // L'envoi est rétabli (domaine vérifié) : chaque restaurant reçoit son alerte, une fois.
    mode = 'ok'; recus.length = 0;
    const passe2 = await notifyAllRestaurants();
    expect(passe2).toMatchObject({ withAlerts: 3, emails: 3, failed: 0 });
    expect(recus.sort()).toEqual([a.email, b.email, c.email].sort());
    expect((await derniereLigne()).status).toBe('ok');
    for (const r of [a, b, c]) expect(await enAttente(r.rid)).toBe(0);

    // Troisième passage : plus rien à envoyer, aucun doublon.
    recus.length = 0;
    expect(await notifyAllRestaurants()).toMatchObject({ withAlerts: 0, emails: 0, failed: 0 });
    expect(recus).toHaveLength(0);
  });

  it('expéditeur d’essai : le titulaire du compte reste servi, et le balayage s’arrête au premier restaurant sans envoi', async () => {
    // Le prestataire sert le titulaire de son compte : l'envoi n'est donc PAS abandonné d'emblée.
    const titulaire = await restaurantAvecAlerte({ destinataires: [TITULAIRE] });
    const b = await restaurantAvecAlerte(); const c = await restaurantAvecAlerte();
    mode = 'expediteur_essai';
    const passe = await notifyAllRestaurants();
    expect(passe).toMatchObject({ withAlerts: 3, emails: 1, failed: 2, reasons: { mail_test_sender_restricted: 1, not_attempted: 1 } });
    expect(recus).toEqual([TITULAIRE, b.email]);            // le 3e restaurant n'est pas sollicité : son refus est certain
    const ligne = await derniereLigne();
    expect(ligne.status).toBe('partial');                   // quelque chose est parti : pas « error »
    expect(ligne.summary).toMatchObject({ stoppedSendingFor: 'mail_test_sender_restricted' });
    expect(await enAttente(titulaire.rid)).toBe(0);         // l'alerte du titulaire est annoncée
    expect(await enAttente(b.rid)).toBe(1);                 // les autres repartiront au passage suivant
    expect(await enAttente(c.rid)).toBe(1);
  });

  for (const [m, code] of [['cle', 'mail_key_invalid'], ['domaine', 'mail_domain_not_verified'], ['debit', 'mail_rate_limited']] as const) {
    it(`${code} : un seul appel au prestataire pour tous les restaurants, puis reprise complète`, async () => {
      const liste = [await restaurantAvecAlerte(), await restaurantAvecAlerte(), await restaurantAvecAlerte(), await restaurantAvecAlerte()];
      mode = m;
      const passe = await notifyAllRestaurants();
      expect(recus).toHaveLength(1);                                  // on n'insiste pas : l'échec vaut pour tout le monde
      expect(passe).toMatchObject({ withAlerts: 4, emails: 0, failed: 4, reasons: { [code]: 1, not_attempted: 3 } });
      const ligne = await derniereLigne();
      expect(ligne.summary).toMatchObject({ stoppedSendingFor: code });
      expect(ligne.error).toContain(`[${code}]`);
      for (const r of liste) expect(await enAttente(r.rid)).toBe(1); // rien n'est perdu
      mode = 'ok'; recus.length = 0;
      expect(await notifyAllRestaurants()).toMatchObject({ emails: 4, failed: 0 });
      expect(recus).toHaveLength(4);
    });
  }

  it('un restaurant sans destinataire ne met pas la tâche en erreur', async () => {
    const seul = await restaurantAvecAlerte({ sansResponsable: true });
    const autre = await restaurantAvecAlerte();
    const passe = await notifyAllRestaurants();
    expect(passe).toMatchObject({ withAlerts: 2, emails: 1, failed: 0, skipped: 1, reasons: { no_recipient: 1 } });
    expect(recus).toEqual([autre.email]);
    const ligne = await derniereLigne();
    expect(ligne.status).toBe('ok'); expect(ligne.error).toBeNull();
    expect(await enAttente(seul.rid)).toBe(1);    // l'alerte attend qu'un destinataire existe ; elle reste dans la cloche
  });

  it('deux destinataires dont un seul est servi : l’alerte est annoncée une fois, sans renvoi au second passage', async () => {
    const r = await restaurantAvecAlerte({ destinataires: [TITULAIRE, 'associe@restaurant-exemple.test'] });
    mode = 'expediteur_essai';
    const res = await notifyCriticalAlerts(r.rid, { record: false });
    expect(res).toMatchObject({ sent: true, status: 'partial', emails: 1, reason: 'mail_test_sender_restricted' });
    expect(res.recipients).toEqual(['t***@prestataire-exemple.test', 'a***@restaurant-exemple.test']);   // masqués
    expect(await enAttente(r.rid)).toBe(0);
    recus.length = 0;
    expect((await notifyCriticalAlerts(r.rid, { record: false })).status).toBe('nothing');
    expect(recus).toHaveLength(0);
  });

  it('aucune ligne de suivi ne contient une adresse e-mail complète ni le texte du prestataire', async () => {
    await restaurantAvecAlerte(); mode = 'expediteur_essai';
    await notifyAllRestaurants();
    const lignes = JSON.stringify(await (await getDb()).select().from(jobRuns));
    expect(lignes).not.toMatch(/[A-Za-z0-9._%+-]{2,}@[A-Za-z0-9.-]+\.[a-z]{2,}/);
    expect(lignes).not.toContain('only send testing emails');
  });

  it('GET /api/jobs/notify : la réponse donne les motifs, et les destinataires masqués', async () => {
    const r = await restaurantAvecAlerte(); mode = 'expediteur_essai';
    const rep = await app.request('/api/jobs/notify', { headers: { 'x-cron-secret': process.env.CRON_SECRET! } });
    const texte = await rep.text();
    expect(rep.status).toBe(200);
    expect(JSON.parse(texte)).toMatchObject({ failed: 1, reasons: { mail_test_sender_restricted: 1 } });
    expect(texte).not.toContain(r.email); expect(texte).not.toContain(TITULAIRE);
  });
});

describe('tâche d’alertes : elle tient dans le temps d’une fonction et reprend où elle s’est arrêtée', () => {
  it('temps imparti atteint : elle s’arrête, dit combien il en reste, et le passage suivant sert EXACTEMENT le reste', async () => {
    const liste = [await restaurantAvecAlerte(), await restaurantAvecAlerte(), await restaurantAvecAlerte(), await restaurantAvecAlerte()];
    delaiMs = 80;                                             // prestataire lent : un envoi dépasse à lui seul le temps imparti
    const passe1 = await notifyAllRestaurants({ budgetMs: 50 });
    delaiMs = 0;
    expect(passe1).toMatchObject({ withAlerts: 1, emails: 1, failed: 0, remaining: 3 });
    const servi = [...recus];
    expect(servi).toHaveLength(1);
    const ligne = (await (await getDb()).select().from(jobRuns).where(eq(jobRuns.job, 'alerts-notify'))).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
    expect(ligne.status).toBe('partial');
    expect(ligne.error).toMatch(/3 restaurant\(s\) reporté\(s\) au passage suivant/);
    expect(ligne.summary).toMatchObject({ remaining: 3 });
    recus.length = 0;
    const passe2 = await notifyAllRestaurants();
    expect(passe2).toMatchObject({ withAlerts: 3, emails: 3, failed: 0, remaining: 0 });
    // Personne n'a reçu deux fois, personne n'a été oublié.
    expect([...servi, ...recus].sort()).toEqual(liste.map((r) => r.email).sort());
    recus.length = 0;
    expect(await notifyAllRestaurants()).toMatchObject({ withAlerts: 0, emails: 0, remaining: 0 });
    expect(recus).toHaveLength(0);
  });

  it('sans alerte à envoyer : le prestataire n’est pas sollicité, quel que soit le nombre de restaurants', async () => {
    const passe = await notifyAllRestaurants();
    expect(passe.restaurants).toBeGreaterThan(10);            // tous les restaurants créés par ce fichier
    expect(passe).toMatchObject({ withAlerts: 0, emails: 0, failed: 0, skipped: 0, remaining: 0 });
    expect(recus).toHaveLength(0);
  });
});

describe('confirmation d’adresse : l’échec d’envoi est dit, et qualifié', () => {
  const inscrire = async (email: string) => {
    await _resetRateLimits();
    const r = await app.request('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Plantain-Yassa-42', fullName: 'Personne Essai', restaurantName: `Restaurant ${email.split('@')[0]}` }) });
    return { status: r.status, texte: await r.text() };
  };
  const renvoyer = async (jeton: string) => { const r = await app.request('/api/auth/resend-verification', { method: 'POST', headers: { authorization: `Bearer ${jeton}` } }); return { status: r.status, texte: await r.text() }; };

  it('expéditeur d’essai (cas de la production) : le compte est créé, l’envoi est annoncé non fait, avec son motif', async () => {
    mode = 'expediteur_essai';
    const r = await inscrire('confirmation-1@restaurant-exemple.test');
    const j = JSON.parse(r.texte);
    expect(r.status).toBe(201);
    expect(j.emailVerification).toMatchObject({ delivered: false, code: 'mail_not_delivered', reason: 'mail_test_sender_restricted', retryable: false });
    expect(j.emailVerification.warning).toMatch(/n'a pas encore pu être confirmée : l'envoi d'e-mails de la plateforme n'est pas opérationnel/);
    expect(j.emailVerification.warning).not.toMatch(/n'est pas configuré/);       // il l'est : c'est le prestataire qui refuse
    for (const interdit of [TITULAIRE, 'only send testing emails', 'prestataire-exemple']) expect(r.texte).not.toContain(interdit);
  });

  it('prestataire momentanément indisponible : la personne est invitée à réessayer ; adresse refusée : à la vérifier', async () => {
    const r = await inscrire('confirmation-2@restaurant-exemple.test');     // envoi réussi à l'inscription
    const jeton = JSON.parse(r.texte).token as string;
    expect(JSON.parse(r.texte).emailVerification).toMatchObject({ delivered: true });
    mode = 'debit';
    const debit = JSON.parse((await renvoyer(jeton)).texte);
    expect(debit).toMatchObject({ delivered: false, reason: 'mail_rate_limited', retryable: true });
    expect(debit.message).toMatch(/momentanément indisponible\. Réessayez dans quelques minutes/);
    mode = 'destinataire';
    const refus = JSON.parse((await renvoyer(jeton)).texte);
    expect(refus).toMatchObject({ delivered: false, reason: 'mail_recipient_rejected', retryable: false });
    expect(refus.message).toMatch(/refusée par le service d'envoi\. Vérifiez-la/);
    // Le journal d'audit garde le motif — jamais le texte du prestataire.
    const journal = JSON.stringify(await (await getDb()).select().from(auditLog).where(eq(auditLog.action, 'email.verification.resent')));
    expect(journal).toContain('mail_rate_limited'); expect(journal).toContain('mail_recipient_rejected');
    expect(journal).not.toContain('Too many requests'); expect(journal).not.toContain('Invalid `to` field');
  });

  it('le lien envoyé ne porte que le jeton : ni adresse, ni identifiant, ni autre paramètre', async () => {
    await inscrire('confirmation-3@restaurant-exemple.test');
    const message = textes.find((t) => t.includes('/verifier-email?token=')) ?? '';
    const lien = /https?:\/\/\S+\/verifier-email\?\S+/.exec(message)?.[0] ?? '';
    const url = new URL(lien);
    expect([...url.searchParams.keys()]).toEqual(['token']);
    expect(url.searchParams.get('token')).toMatch(/^[A-Za-z0-9_-]{43}$/);      // 32 octets aléatoires
    expect(lien).not.toContain('@'); expect(lien).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('un jeton falsifié est refusé, ne confirme rien et ne consomme pas le vrai ; le vrai sert une fois', async () => {
    const adresse = 'confirmation-5@restaurant-exemple.test';
    const r = await inscrire(adresse);
    const session = JSON.parse(r.texte).token as string;
    const message = [...textes].reverse().find((t) => t.includes('/verifier-email?token=')) ?? '';
    const vrai = new URL(/https?:\/\/\S+\/verifier-email\?\S+/.exec(message)?.[0] ?? '').searchParams.get('token')!;
    const confirmer = async (jeton: string) => { const x = await app.request('/api/auth/verify-email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: jeton }) }); return { status: x.status, json: await x.json() as Record<string, unknown> }; };
    const moi = async () => (await (await app.request('/api/auth/me', { headers: { authorization: `Bearer ${session}` } })).json()) as { user?: { emailVerified?: boolean } };
    // Un caractère changé, un jeton tronqué, un jeton d'une autre forme : refusés, avec le même message.
    const falsifie = vrai.slice(0, -1) + (vrai.endsWith('A') ? 'B' : 'A');
    for (const faux of [falsifie, vrai.slice(0, 20), `${vrai}x`, 'a'.repeat(43)]) {
      const refus = await confirmer(faux);
      expect(refus.status).toBe(400);
      expect(refus.json.code).toBe('verify_invalid');
    }
    expect((await moi()).user?.emailVerified).toBe(false);
    // En base : le jeton n'est conservé que sous forme d'empreinte, et il n'est pas consommé par les essais.
    const lignes = await (await getDb()).select().from(emailVerifications).where(eq(emailVerifications.email, adresse));
    expect(lignes).toHaveLength(1);
    expect(lignes[0].usedAt).toBeNull();
    expect(JSON.stringify(lignes)).not.toContain(vrai);
    expect(lignes[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    // Le vrai jeton confirme l'adresse — c'est l'application qui écrit la date, personne d'autre.
    const ok = await confirmer(vrai);
    expect(ok.status).toBe(200);
    expect((await moi()).user?.emailVerified).toBe(true);
    const apres = await (await getDb()).select().from(emailVerifications).where(eq(emailVerifications.email, adresse));
    expect(apres[0].usedAt).not.toBeNull();
    // Rejoué : rien ne change (« déjà confirmée »), aucune seconde écriture utile.
    const rejoue = await confirmer(vrai);
    expect(rejoue.status).toBe(200);
    expect(rejoue.json.alreadyVerified).toBe(true);
  });

  it('le renvoi du lien est freiné : cinq par quart d’heure, puis 429', async () => {
    const r = await inscrire('confirmation-4@restaurant-exemple.test');
    const jeton = JSON.parse(r.texte).token as string;
    await _resetRateLimits();
    const codes: number[] = [];
    for (let i = 0; i < 7; i += 1) codes.push((await renvoyer(jeton)).status);
    expect(codes).toEqual([200, 200, 200, 200, 200, 429, 429]);
    await _resetRateLimits();
  });
});


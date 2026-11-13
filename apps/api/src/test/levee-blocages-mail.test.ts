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
import { getDb, runMigrations, alerts, jobRuns, restaurants, restaurantMembers } from '@afrisupply/db';

// --- faux prestataire d'e-mails -----------------------------------------------------------------
const TITULAIRE = 'titulaire.du.compte@prestataire-exemple.test';      // l'adresse que le vrai prestataire écrit dans son message de refus
type Mode = 'ok' | 'expediteur_essai' | 'domaine' | 'cle' | 'debit' | 'panne' | 'destinataire' | 'autre';
let mode: Mode = 'ok';
const recus: string[] = [];        // destinataires de chaque appel reçu
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
      const to = String((JSON.parse(corps || '{}') as { to?: string[] }).to?.[0] ?? '');
      recus.push(to);
      const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
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
  recus.length = 0; mode = 'ok'; _resetMailStats();
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
    expect(passe1).toMatchObject({ withAlerts: 3, emails: 0, failed: 3, skipped: 0, reasons: { mail_test_sender_restricted: 3 } });
    // Motif propre à chaque destinataire : le prestataire est sollicité pour chacun (le titulaire du compte, lui, serait servi).
    expect(recus).toHaveLength(3);
    const ligne = await derniereLigne();
    expect(ligne.status).toBe('error');
    expect(ligne.error).toMatch(/^3 restaurant\(s\) sans envoi \[mail_test_sender_restricted\] — L'expéditeur est l'adresse d'essai/);
    expect(ligne.summary).toMatchObject({ withAlerts: 3, failed: 3, reasons: { mail_test_sender_restricted: 3 } });
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

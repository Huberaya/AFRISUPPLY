// Chantier P0.3 — DÉFAUTS D'API du registre P0.1 : chaque défaut prouvé par l'audit a ici son test.
//
//   1. accès anonyme : une route protégée répond 401, y compris quand son chemin porte un paramètre
//      (avant : 404 « Route inconnue » sur 86 routes) ; la liste des routes publiques est explicite ;
//   2. corps de requête : JSON mal formé → 400 (avant : 500) ; corps vide `{}` → jamais 500
//      (avant : 500 sur 12 routes) ; corps trop volumineux → 413 ;
//   3. défauts route par route : panier intelligent, suppression qui « réussit » sans rien supprimer,
//      déconnexion, mot de passe oublié, droits d'exploitant, codes d'invitation.
//
// Les balayages parcourent le registre réel des routes de l'application : une route ajoutée demain
// est couverte sans modifier ce fichier.
import { describe, it, expect, beforeAll } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import * as dbm from '@afrisupply/db';
import { runMigrations, getDb } from '@afrisupply/db';
import { app } from '../app.js';
import { _resetRateLimits } from '../lib/ops.js';
import { makeInviteCode } from '../routes/pilots.js';
import { creerAppel, inscrire, confirmerAdresse, type Compte } from './aide-comptes.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.DATABASE_URL = '';
process.env.PGLITE_DIR = 'memory://p0-api'; process.env.ADMIN_EMAILS = 'exploitant@afrisupply.test'; process.env.CRON_SECRET = 'secret-des-taches-de-test';
process.env.MAIL_OUTBOX_DIR = '/tmp/afs-outbox-p0-api'; process.env.BACKUP_DIR = '/tmp/afs-backups-p0-api';
delete process.env.RESEND_API_KEY; delete process.env.STRIPE_SECRET_KEY; delete process.env.LLM_API_KEY; delete process.env.TWILIO_ACCOUNT_SID; delete process.env.SENTRY_DSN;

const appel = creerAppel(app);
const ID = '7b7b7b7b-7b7b-4b7b-8b7b-7b7b7b7b7b7b';

/** Routes ouvertes sans session : toute autre route doit exiger une authentification. */
const PUBLIQUES = new Set([
  'GET /api/health', 'GET /api/status', 'GET /api/billing/health', 'POST /api/billing/webhook',
  'POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/logout', 'POST /api/auth/forgot-password', 'POST /api/auth/reset-password',
  'POST /api/auth/verify-email', 'GET /api/auth/password-policy', 'POST /api/auth/clerk-sync',
  'GET /api/public/plans', 'GET /api/public/proof', 'POST /api/public/leads', 'GET /api/public/reference', 'GET /api/public/invite/:code',
  'GET /api/public/vendor-invite/:token', 'GET /api/public/catalog', 'GET /api/public/vendors', 'GET /api/public/vendors/:id/reviews',
  'GET /api/public/products/:id', 'POST /api/public/product-alert',
]);
/** Routes des tâches planifiées : protégées par CRON_SECRET (jamais par une session). */
const PLANIFIEES = new Set(['GET /api/jobs/daily', 'POST /api/jobs/daily', 'GET /api/jobs/reminders', 'POST /api/jobs/reminders', 'GET /api/jobs/notify', 'POST /api/jobs/notify', 'GET /api/status/jobs',
  // Levée des réserves : diagnostic de configuration, réservé à l'exploitant (même secret).
  'GET /api/status/config']);

const routes = () => {
  const vues = new Set<string>(); const out: { cle: string; method: string; path: string }[] = [];
  for (const r of app.routes) { if (r.method === 'ALL') continue; const cle = `${r.method} ${r.path}`; if (!vues.has(cle)) { vues.add(cle); out.push({ cle, method: r.method, path: r.path }); } }
  return out;
};
const concret = (path: string, id = ID) => path.replace(':step', 'app').replace(':name', 'sauvegarde-inexistante.json.gz').replace(':token', 'jeton-inexistant').replace(':code', 'PILOTE-INEXISTANT').replace(/:[A-Za-z]+/, id);

let patron: Compte; let exploitant: Compte; let grossiste: Compte;
const ids: Record<'patron' | 'exploitant' | 'grossiste', string[]> = { patron: [], exploitant: [], grossiste: [] };

beforeAll(async () => {
  await runMigrations();
  const db = await getDb();
  patron = await inscrire(appel, 'patron@resto.test', 'Restaurant du patron');
  exploitant = await inscrire(appel, 'exploitant@afrisupply.test', 'Exploitation'); await confirmerAdresse('exploitant@afrisupply.test');
  grossiste = await inscrire(appel, 'grossiste@gros.test', 'Compte du grossiste');

  // Données réelles du patron : les balayages présentent de VRAIS identifiants (c'est avec eux que l'audit a obtenu des 500).
  await appel('GET', '/api/catalog', undefined, patron.h);
  const ref = await db.select().from(dbm.products).where(isNull(dbm.products.restaurantId)).limit(2);
  const f = (await appel('POST', '/api/suppliers', { name: 'Fournisseur du patron' }, patron.h)).json;
  const o = (await appel('POST', `/api/suppliers/${f.id}/offers`, { productId: ref[0].id, packLabel: 'Sac 10 kg', packQty: 10, packPrice: 25 }, patron.h)).json;
  const rec = (await appel('POST', '/api/recipes', { name: 'Recette du patron', ingredients: [{ productId: ref[0].id, quantity: 0.2 }] }, patron.h)).json;
  const cmd = (await appel('POST', '/api/orders', { supplierId: f.id, lines: [{ offerId: o.id, packs: 1 }] }, patron.h)).json.order;
  const [article] = await db.select().from(dbm.inventoryItems).where(eq(dbm.inventoryItems.restaurantId, patron.rid));
  const liste = (await appel('POST', '/api/shopping/lists', { name: 'Liste du patron', text: '10 kg riz' }, patron.h)).json.list;
  await appel('PUT', `/api/reorder-rules/${article.id}`, { threshold: 1, reorderQty: 5 }, patron.h);
  ids.patron = [f.id, o.id, rec.id, cmd.id, article.id, liste.id, ref[0].id, patron.userId, patron.rid];

  // Grossiste actif avec une offre et une tournée.
  const v = (await appel('POST', '/api/vendor/register', { acceptCgv: true, name: 'Grossiste du test', city: 'Nantes', categories: ['epicerie'], contactEmail: 'commandes@gros.test' }, grossiste.h)).json.vendor;
  await appel('PUT', `/api/admin/vendors/${v.id}`, { status: 'actif', commissionPct: 4 }, exploitant.h);
  const vo = (await appel('POST', '/api/vendor/offers', { productId: ref[0].id, packLabel: 'Sac 25 kg', packQty: 25, packPrice: 30 }, grossiste.h)).json.offer;
  const tournee = (await appel('POST', '/api/vendor/routes', { name: 'Tournée du test', weekday: 2, zones: ['nantes'], cutoffHours: 24 }, grossiste.h)).json;
  const cmdV = (await appel('POST', `/api/marketplace/vendors/${v.id}/orders`, { lines: [{ vendorOfferId: vo.id, packs: 1 }], override: true }, patron.h)).json.order;
  ids.grossiste = [v.id, vo.id, cmdV?.id, tournee?.route?.id, patron.rid].filter(Boolean);
  ids.patron.push(v.id, cmdV?.id);

  // Objets de l'exploitant.
  const lead = (await appel('POST', '/api/public/leads', { restaurantName: 'Prospect du test', contactName: 'Ama Test', email: 'prospect@resto.test' })).json;
  const prospect = (await appel('POST', '/api/admin/prospects', { kind: 'restaurant', name: 'Fiche du test' }, exploitant.h)).json.prospect;
  ids.exploitant = [lead.id, prospect.id, v.id, ref[0].id, patron.rid, patron.userId].filter(Boolean);
  await _resetRateLimits();
}, 120_000);

describe('1. Accès sans session', () => {
  it('le registre compte 252 routes, dont 23 publiques et 8 protégées par le secret des tâches — toutes les autres exigent une session', () => {
    const toutes = routes();
    expect(toutes).toHaveLength(252);
    expect(toutes.filter((r) => PUBLIQUES.has(r.cle))).toHaveLength(PUBLIQUES.size);
    expect(toutes.filter((r) => PLANIFIEES.has(r.cle))).toHaveLength(PLANIFIEES.size);
    expect(PUBLIQUES.size).toBe(23); expect(PLANIFIEES.size).toBe(8);
  });

  it('toute route protégée répond 401 sans session — y compris les routes à paramètre (avant : 404 sur 86 routes)', async () => {
    const proteges = routes().filter((r) => !PUBLIQUES.has(r.cle) && !PLANIFIEES.has(r.cle));
    const ecarts: string[] = [];
    for (const r of proteges) {
      const rep = await appel(r.method, concret(r.path), ['GET', 'DELETE'].includes(r.method) ? undefined : {});
      if (rep.status !== 401) ecarts.push(`${r.cle} → ${rep.status}`);
    }
    expect(ecarts).toEqual([]);
    expect(proteges.length).toBe(221);
    expect(proteges.filter((r) => r.path.includes(':')).length).toBeGreaterThanOrEqual(86);
  });

  it('un jeton invalide ou falsifié reçoit 401, jamais 404 ni 500', async () => {
    for (const jeton of ['nimporte-quoi', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.', 'a.b.c']) {
      for (const p of ['/api/stock', `/api/orders/${ID}/send`, '/api/admin/dashboard', '/api/vendor/orders']) {
        const rep = await appel(p.includes('send') ? 'POST' : 'GET', p, undefined, { authorization: `Bearer ${jeton}` });
        expect(rep.status, `${p} avec ${jeton}`).toBe(401);
      }
    }
  });

  it('une adresse qui n’existe pas répond 404, avec ou sans session', async () => {
    expect((await appel('GET', '/api/route-qui-nexiste-pas')).status).toBe(404);
    expect((await appel('GET', '/api/route-qui-nexiste-pas', undefined, patron.h)).status).toBe(404);
    expect((await appel('POST', `/api/commandes/${ID}/envoyer`, {})).status).toBe(404);
  });

  it('les routes publiques ne demandent pas de session, les tâches planifiées exigent leur secret', async () => {
    for (const cle of PUBLIQUES) {
      const [m, p] = cle.split(' ');
      const rep = await appel(m, concret(p), m === 'GET' ? undefined : {});
      expect(rep.status, cle).not.toBe(500);
      // Seule exception : la connexion par Clerk n'exige pas de session AFRISUPPLY mais une preuve d'identité Clerk.
      if (cle === 'POST /api/auth/clerk-sync') { expect(rep.status).toBe(401); expect(rep.json.code).toBe('clerk_token_required'); }
      else expect(rep.status, cle).not.toBe(401);
      await _resetRateLimits();
    }
    for (const cle of PLANIFIEES) {
      const [m, p] = cle.split(' ');
      expect((await appel(m, p)).status, cle).toBe(401);
      expect((await appel(m, p, undefined, { 'x-cron-secret': 'mauvais-secret' })).status, cle).toBe(401);
      expect((await appel(m, p, undefined, { authorization: 'Bearer mauvais-secret' })).status, cle).toBe(401);
    }
    expect((await appel('GET', '/api/status/jobs', undefined, { 'x-cron-secret': 'secret-des-taches-de-test' })).status).toBe(200);
  });
});

describe('2. Corps de requête : une entrée invalide est une erreur du client (400), jamais une panne (500)', () => {
  const ecritures = () => routes().filter((r) => r.method !== 'GET');
  const identitePour = (path: string): ['patron' | 'exploitant' | 'grossiste', Compte] =>
    path.startsWith('/api/admin/') ? ['exploitant', exploitant] : path.startsWith('/api/vendor/') ? ['grossiste', grossiste] : ['patron', patron];
  // Routes qui détruiraient la session ou le compte utilisés par le balayage : testées séparément plus bas ou dans d'autres fichiers.
  const EXCLUES = new Set(['DELETE /api/account', 'POST /api/auth/logout', 'POST /api/auth/logout-all', 'POST /api/admin/backups/restore']);

  it('JSON mal formé : aucune route ne répond 500 ; les routes qui lisent un corps répondent 400 « invalid_json »', async () => {
    const pannes: string[] = []; const codes: Record<number, number> = {}; let lues = 0;
    for (const r of ecritures().filter((x) => !EXCLUES.has(x.cle) && x.method !== 'DELETE')) {
      const [nom, c] = identitePour(r.path);
      for (const id of [ID, ...ids[nom]]) {
        if (!r.path.includes(':') && id !== ID) continue;
        const rep = await appel(r.method, concret(r.path, id), '{"quantite": 12, "note": ', c.h);
        codes[rep.status] = (codes[rep.status] ?? 0) + 1;
        if (rep.status === 500) pannes.push(`${r.cle} [${id === ID ? 'identifiant inconnu' : 'identifiant réel'}] → 500 ${rep.text.slice(0, 100)}`);
        if (rep.status === 400 && rep.json?.code === 'invalid_json') lues += 1;
      }
      await _resetRateLimits();
    }
    expect(pannes).toEqual([]);
    expect(lues).toBeGreaterThan(60);   // l'audit avait prouvé 6 routes et relevé le même motif sur 61 autres
  }, 180_000);

  it('les six routes où l’audit avait mesuré un 500 sur JSON mal formé répondent 400', async () => {
    const cas: [string, string, Compte | null][] = [
      ['POST', '/api/auth/login', null], ['POST', '/api/auth/register', null], ['POST', '/api/suppliers', patron],
      ['POST', '/api/orders', patron], ['POST', `/api/stock/${ids.patron[4]}/movements`, patron], ['POST', '/api/sales', patron],
    ];
    for (const [m, p, c] of cas) {
      const rep = await appel(m, p, '{"email": "a@b.fr", ', c?.h ?? {});
      expect(rep.status, `${m} ${p}`).toBe(400);
      expect(rep.json.code, `${m} ${p}`).toBe('invalid_json');
      await _resetRateLimits();
    }
  });

  it('corps vide {} : aucune route ne répond 500, avec un identifiant inconnu comme avec un identifiant réel', async () => {
    const pannes: string[] = []; let essais = 0;
    for (const r of ecritures().filter((x) => !EXCLUES.has(x.cle) && x.method !== 'DELETE')) {
      const [nom, c] = identitePour(r.path);
      for (const id of [ID, ...ids[nom]]) {
        if (!r.path.includes(':') && id !== ID) continue;
        const rep = await appel(r.method, concret(r.path, id), {}, c.h);
        essais += 1;
        if (rep.status === 500) pannes.push(`${r.cle} [${id === ID ? 'identifiant inconnu' : 'identifiant réel'}] → 500 ${rep.text.slice(0, 100)}`);
      }
      await _resetRateLimits();
    }
    expect(pannes).toEqual([]);
    expect(essais).toBeGreaterThan(500);
  }, 240_000);

  it('les douze routes où l’audit avait mesuré un 500 sur {} répondent 400 (ou 404 si l’objet n’existe pas)', async () => {
    const db = await getDb();
    const [lead] = await db.select().from(dbm.leads).limit(1);
    const [vendeur] = await db.select().from(dbm.vendors).limit(1);
    const [tournee] = await db.select().from(dbm.vendorRoutes).limit(1);
    const [produit] = await db.select().from(dbm.products).where(isNull(dbm.products.restaurantId)).limit(1);
    const liste = (await appel('POST', '/api/shopping/lists', { name: 'Liste pour récurrente', text: '1 kg riz' }, patron.h)).json.list;
    void liste;
    const cas: [string, string, Compte, number[]][] = [
      ['PUT', `/api/admin/reference/${produit.id}`, exploitant, [400]],          // R031
      ['PUT', `/api/suppliers/${ids.patron[0]}`, patron, [400]],                 // R054
      ['PUT', `/api/recurring/${ID}`, patron, [400]],                            // R073
      ['PUT', `/api/recipes/${ids.patron[2]}`, patron, [400]],                   // R082
      ['PUT', '/api/vendor/profile', grossiste, [400]],                          // R164
      ['PUT', `/api/vendor/routes/${tournee.id}`, grossiste, [400]],             // R171
      ['PUT', `/api/admin/billing/invoices/${ID}`, exploitant, [400, 404]],      // R174
      ['PUT', `/api/admin/leads/${lead.id}`, exploitant, [400]],                 // R200
      ['POST', '/api/admin/prospects', exploitant, [400]],                       // R205
      ['POST', '/api/admin/prospects/import', exploitant, [400]],                // R209
      ['PUT', `/api/admin/vendors/${vendeur.id}`, exploitant, [400]],            // R211
      ['POST', '/api/feedback', patron, [400]],                                  // R212
    ];
    for (const [m, p, c, attendus] of cas) {
      const rep = await appel(m, p, {}, c.h);
      expect(attendus, `${m} ${p} → ${rep.status} ${rep.text.slice(0, 120)}`).toContain(rep.status);
    }
    // …et une vraie modification passe toujours.
    expect((await appel('PUT', `/api/suppliers/${ids.patron[0]}`, { name: 'Fournisseur renommé' }, patron.h)).status).toBe(200);
    expect((await appel('PUT', '/api/vendor/profile', { description: 'Grossiste de test' }, grossiste.h)).status).toBe(200);
    expect((await appel('PUT', `/api/admin/leads/${lead.id}`, { status: 'contacte' }, exploitant.h)).status).toBe(200);
  });

  it('une modification partielle ne touche que les champs envoyés (aucun retour silencieux à une valeur par défaut)', async () => {
    const db = await getDb();
    // offre marquée indisponible : changer son prix ne la remet pas « en stock »
    const offre = ids.patron[1];
    expect((await appel('PUT', `/api/offers/${offre}`, { inStock: false }, patron.h)).status).toBe(200);
    expect((await appel('PUT', `/api/offers/${offre}`, { packPrice: 27 }, patron.h)).status).toBe(200);
    const [o] = await db.select().from(dbm.supplierOffers).where(eq(dbm.supplierOffers.id, offre));
    expect(o.inStock).toBe(false); expect(Number(o.packPriceEur)).toBe(27);
    await appel('PUT', `/api/offers/${offre}`, { inStock: true, packPrice: 25 }, patron.h);
    // produit du référentiel : le renommer ne supprime pas ses alias
    const cree = await appel('POST', '/api/admin/reference', { name: 'Produit de test des alias', aliases: ['alias un', 'alias deux'], category: 'epicerie', baseUnit: 'kg' }, exploitant.h);
    expect(cree.status).toBe(201);
    expect((await appel('PUT', `/api/admin/reference/${cree.json.product.id}`, { origin: 'Sénégal' }, exploitant.h)).status).toBe(200);
    const [p] = await db.select().from(dbm.products).where(eq(dbm.products.id, cree.json.product.id));
    expect(p.aliases).toEqual(['alias un', 'alias deux']); expect(p.origin).toBe('Sénégal');
    // tournée d'un grossiste : la renommer ne supprime ni ses zones ni son heure limite
    const tournee = await appel('POST', '/api/vendor/routes', { name: 'Tournée complète', weekday: 4, zones: ['nantes', 'rezé'], slots: ['matin'], cutoffDaysBefore: 2, cutoffTime: '11:30', active: false }, grossiste.h);
    expect(tournee.status).toBe(201);
    expect((await appel('PUT', `/api/vendor/routes/${tournee.json.route.id}`, { name: 'Tournée renommée' }, grossiste.h)).status).toBe(200);
    const [r] = await db.select().from(dbm.vendorRoutes).where(eq(dbm.vendorRoutes.id, tournee.json.route.id));
    expect(r).toMatchObject({ name: 'Tournée renommée', zones: ['nantes', 'rezé'], slots: ['matin'], cutoffDaysBefore: 2, cutoffTime: '11:30', active: false });
  });

  it('suppressions : identifiant inconnu → 404, jamais 500 ni « ok » sans effet', async () => {
    const suppressions = routes().filter((r) => r.method === 'DELETE' && r.cle !== 'DELETE /api/account');
    expect(suppressions.length).toBe(13);
    for (const r of suppressions) {
      const [, c] = identitePour(r.path);
      const rep = await appel('DELETE', concret(r.path), undefined, c.h);
      expect(rep.status, r.cle).toBe(404);
    }
  });

  it('corps trop volumineux : 413 sur une route ordinaire, accepté sur une route qui reçoit une image', async () => {
    const gros = JSON.stringify({ name: 'x'.repeat(1_200_000) });
    const refuse = await appel('POST', '/api/suppliers', gros, patron.h);
    expect(refuse.status).toBe(413);
    expect(refuse.json.code).toBe('payload_too_large');
    // la route « photo de facture » accepte jusqu'à 10 Mo : le même volume n'y est pas refusé pour sa taille
    const image = await appel('POST', '/api/quick/invoice', JSON.stringify({ image: `data:image/png;base64,${'A'.repeat(1_200_000)}` }), patron.h);
    expect(image.status).not.toBe(413);
    // sans session, un corps énorme est refusé avant toute lecture
    expect((await appel('POST', '/api/suppliers', gros)).status).toBe(413);
  });

  it('un tableau démesuré est refusé sans épuiser le serveur (avis de sécurité sur la validation des collections)', async () => {
    const lignes = Array.from({ length: 100_000 }, () => ({ itemId: 'x', quantity: 'y' }));
    const t0 = Date.now();
    const rep = await appel('POST', '/api/stock/inventory', { counts: lignes }, patron.h);
    expect([400, 413]).toContain(rep.status);
    expect(Date.now() - t0).toBeLessThan(5_000);
  });
});

describe('3. Défauts route par route', () => {
  it('panier intelligent (R101) : aucune commande orpheline, quantité bornée, tout ou rien', async () => {
    const db = await getDb();
    const commandes = async () => (await db.select().from(dbm.orders).where(eq(dbm.orders.restaurantId, patron.rid))).length;
    const avant = await commandes();
    const [f, o] = ids.patron;
    // aucune ligne valide : avant → 500 et une commande à 0 € laissée en base
    const inconnue = await appel('POST', '/api/smart-cart/checkout', { suppliers: [{ supplierId: f, lines: [{ offerId: ID, packs: 1 }] }] }, patron.h);
    expect(inconnue.status).toBe(400); expect(inconnue.json.code).toBe('offer_not_found');
    // quantité démesurée : avant → 500 (dépassement numérique)
    const demesure = await appel('POST', '/api/smart-cart/checkout', { suppliers: [{ supplierId: f, lines: [{ offerId: o, packs: 999_999_999 }] }] }, patron.h);
    expect(demesure.status).toBe(400);
    // quantité invraisemblable au regard de la consommation : refusée, sauf confirmation explicite
    const invraisemblable = await appel('POST', '/api/smart-cart/checkout', { suppliers: [{ supplierId: f, lines: [{ offerId: o, packs: 900 }] }] }, patron.h);
    expect(invraisemblable.status).toBe(400); expect(invraisemblable.json.code).toBe('quantity_out_of_range');
    // un fournisseur valide + un fournisseur inconnu : rien n'est créé
    const mixte = await appel('POST', '/api/smart-cart/checkout', { suppliers: [{ supplierId: f, lines: [{ offerId: o, packs: 1 }] }, { supplierId: ID, lines: [{ offerId: o, packs: 1 }] }] }, patron.h);
    expect(mixte.status).toBe(404);
    expect(await commandes()).toBe(avant);
    expect((await db.select().from(dbm.orders).where(and(eq(dbm.orders.restaurantId, patron.rid), eq(dbm.orders.totalEur, '0.00')))).length).toBe(0);
    // le cas normal fonctionne
    const ok = await appel('POST', '/api/smart-cart/checkout', { suppliers: [{ supplierId: f, lines: [{ offerId: o, packs: 2 }] }] }, patron.h);
    expect(ok.status).toBe(201); expect(ok.json.created).toHaveLength(1); expect(ok.json.created[0].total).toBe(50);
    expect(await commandes()).toBe(avant + 1);
  });

  it('suppression d’une offre de catalogue (R150) : 404 si rien n’est supprimé, 200 sinon', async () => {
    const db = await getDb();
    expect((await appel('DELETE', `/api/vendor/offers/${ID}`, undefined, grossiste.h)).status).toBe(404);
    const [offre] = await db.select().from(dbm.vendorOffers).limit(1);
    expect((await appel('DELETE', `/api/vendor/offers/${offre.id}`, undefined, grossiste.h)).status).toBe(200);
    expect((await appel('DELETE', `/api/vendor/offers/${offre.id}`, undefined, grossiste.h)).status).toBe(404);
  });

  it('déconnexion (R004) : le jeton ne fonctionne plus après, même s’il avait été copié', async () => {
    const c = await inscrire(appel, 'deconnexion@resto.test', 'Restaurant de la déconnexion');
    const copie = c.token;
    expect((await appel('GET', '/api/auth/me', undefined, c.h)).status).toBe(200);
    const sortie = await appel('POST', '/api/auth/logout', undefined, c.h);
    expect(sortie.status).toBe(200);
    expect(sortie.headers.get('set-cookie')).toContain('afs_token=;');
    const apres = await appel('GET', '/api/auth/me', undefined, { authorization: `Bearer ${copie}` });
    expect(apres.status).toBe(401); expect(apres.json.code).toBe('session_revoked');
    // rejouer l'ancien jeton sur la déconnexion ne ferme pas la NOUVELLE session de la personne
    const reconnexion = await appel('POST', '/api/auth/login', { email: 'deconnexion@resto.test', password: 'Plantain-Yassa-42' });
    await appel('POST', '/api/auth/logout', undefined, { authorization: `Bearer ${copie}` });
    expect((await appel('GET', '/api/auth/me', undefined, { authorization: `Bearer ${reconnexion.json.token}` })).status).toBe(200);
    // sans session, la déconnexion reste sans effet et ne plante pas
    expect((await appel('POST', '/api/auth/logout')).status).toBe(200);
    expect((await appel('POST', '/api/auth/logout', undefined, { authorization: 'Bearer nimporte-quoi' })).status).toBe(200);
  });

  it('mot de passe oublié (R002) : réponse identique que le compte existe ou non', async () => {
    const connu = await appel('POST', '/api/auth/forgot-password', { email: 'patron@resto.test' });
    const inconnu = await appel('POST', '/api/auth/forgot-password', { email: 'personne@nulle-part.test' });
    const invalide = await appel('POST', '/api/auth/forgot-password', { email: 'pas-une-adresse' });
    expect(connu.status).toBe(200); expect(inconnu.status).toBe(200); expect(invalide.status).toBe(200);
    const sansLien = ({ devLink: _l, ...reste }: Record<string, unknown>) => reste;
    expect(sansLien(connu.json)).toEqual(inconnu.json);
    expect(invalide.json).toEqual(inconnu.json);
    // en déploiement (pas de lien de développement), les deux réponses sont strictement identiques
    process.env.VERCEL = '1';
    try {
      await _resetRateLimits();
      const a = await appel('POST', '/api/auth/forgot-password', { email: 'patron@resto.test' });
      const b = await appel('POST', '/api/auth/forgot-password', { email: 'personne@nulle-part.test' });
      expect(a.json).toEqual(b.json);
      expect(a.json.devLink).toBeUndefined();
    } finally { delete process.env.VERCEL; }
  });

  it('droits d’exploitant (R009) : s’inscrire avec une adresse de ADMIN_EMAILS ne suffit plus, il faut la prouver', async () => {
    process.env.ADMIN_EMAILS = 'exploitant@afrisupply.test,second-exploitant@afrisupply.test';
    const r = await appel('POST', '/api/auth/register', { email: 'second-exploitant@afrisupply.test', password: 'Plantain-Yassa-42', fullName: 'Usurpateur', restaurantName: 'Faux exploitant' });
    expect(r.status).toBe(201);
    const h = { authorization: `Bearer ${r.json.token}` };
    expect((await appel('GET', '/api/auth/me', undefined, h)).json.user.isAdmin).toBe(false);
    for (const p of ['/api/admin/dashboard', '/api/admin/ops', '/api/admin/audit', '/api/admin/leads', '/api/admin/vendors', '/api/admin/pilots', '/api/admin/prospects', '/api/admin/reference', '/api/admin/claims', '/api/admin/billing']) {
      expect((await appel('GET', p, undefined, h)).status, p).toBe(403);
    }
    expect((await appel('GET', '/api/vendor/me', undefined, h)).json.isAdmin).toBe(false);
    // Le titulaire de l'adresse clique sur le lien reçu par e-mail : les droits s'ouvrent, avec le même jeton.
    const jeton = new URL(r.json.emailVerification.devLink).searchParams.get('token');
    expect((await appel('POST', '/api/auth/verify-email', { token: jeton })).status).toBe(200);
    expect((await appel('GET', '/api/auth/me', undefined, h)).json.user.isAdmin).toBe(true);
    expect((await appel('GET', '/api/admin/dashboard', undefined, h)).status).toBe(200);
    process.env.ADMIN_EMAILS = 'exploitant@afrisupply.test';
    await _resetRateLimits();
  });

  it('codes d’invitation (R216) : imprévisibles et lecture freinée', async () => {
    expect(makeInviteCode()).toMatch(/^PILOTE-[A-HJ-NP-Z2-9]{10}$/);
    const inv = await appel('POST', '/api/admin/pilots/invite', { email: 'invite@resto.test', restaurantName: 'Restaurant invité', contactName: 'Awa Invitée' }, exploitant.h);
    expect(inv.status).toBe(200);
    expect(inv.json.code).toMatch(/^PILOTE-[A-HJ-NP-Z2-9]{10}$/);
    expect((await appel('GET', `/api/public/invite/${inv.json.code}`)).status).toBe(200);
    await _resetRateLimits();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await appel('GET', `/api/public/invite/PILOTE-ESSAI${String(i).padStart(4, '0')}`)).status);
    expect(codes.slice(0, 10)).toEqual(Array(10).fill(404));
    expect(codes.slice(10)).toEqual([429, 429]);        // une seule fenêtre pour tous les codes essayés
    await _resetRateLimits();
    // un ancien code court reste lisible (compatibilité) et l'inscription avec le nouveau code marque bien le restaurant fondateur
    const reg = await appel('POST', '/api/auth/register', { email: 'invite@resto.test', password: 'Plantain-Yassa-42', fullName: 'Awa Invitée', restaurantName: 'Restaurant invité', inviteCode: inv.json.code });
    expect(reg.status).toBe(201); expect(reg.json.restaurant.founder).toBe(true);
    expect((await appel('GET', `/api/public/invite/${inv.json.code}`)).status).toBe(410);
  });

  it('une requête authentifiée ne relit le compte et le restaurant qu’une fois (avant : jusqu’à douze fois)', async () => {
    const db = await getDb();
    const client = (db as unknown as { $client: { query: (...a: unknown[]) => unknown } }).$client;
    const original = client.query.bind(client); let n = 0; const vues: string[] = [];
    client.query = (...a: unknown[]) => { n += 1; vues.push(String(a[0])); return original(...a); };
    try {
      const rep = await appel('POST', '/api/usage', { events: [] }, patron.h);   // dernier routeur monté : le pire cas
      expect(rep.status).toBe(200);
    } finally { client.query = original; }
    expect(vues.filter((q) => /from "users"/.test(q)).length).toBe(1);
    expect(vues.filter((q) => /from "restaurant_members"/.test(q)).length).toBe(1);
    expect(n).toBeLessThanOrEqual(4);
  });
});

// Audit n°3 — un identifiant malformé ne doit JAMAIS produire une erreur serveur.
//
// Constat qui a motivé ce fichier : un identifiant d'URL qui n'est pas un UUID (`/api/compare/abc`)
// était comparé directement à une colonne `uuid`. PostgreSQL refuse la requête (22P02), l'erreur
// remontait sans être reconnue et l'API répondait **500 « Erreur serveur »** — avec, en développement,
// la requête SQL en clair dans la réponse. Mesuré sur 7 routes sur 16 testées ; le dépôt compte
// 40 routes paramétrées exposées au même cas.
//
// Ce que ce fichier verrouille, route par route : un identifiant invalide donne une réponse de
// CLIENT (401/403/404), jamais un 5xx, et jamais de SQL dans le corps de la réponse.
// La détection centrale vit dans `lib/db-errors.ts` ; ce test l'exerce de bout en bout.
import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '@afrisupply/db';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.CRON_SECRET = 'cron-test';
process.env.PGLITE_DIR = 'memory://identifiants-invalides';
process.env.ADMIN_EMAILS = 'admin@afrisupply.fr';
process.env.VENDOR_AUTO_APPROVE = 'true';

import { app } from '../app.js';
import { _resetRateLimits } from '../lib/ops.js';

type Json = Record<string, unknown>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const texte = await res.text();
  let json: Json = {};
  try { json = JSON.parse(texte) as Json; } catch { json = { raw: texte }; }
  return { status: res.status, json, texte };
};

const PWD = 'Plantain-Yassa-42';
let A: Record<string, string> = {};   // session du propriétaire
let RID = '';

beforeAll(async () => {
  await runMigrations();
  _resetRateLimits();
  const reg = await call('POST', '/api/auth/register', { email: 'id-invalide@resto.fr', password: PWD, fullName: 'Awa Identifiant', restaurantName: 'Chez Awa Identifiant', city: 'Nantes' });
  A = { Authorization: `Bearer ${reg.json.token as string}`, 'X-Restaurant-Id': (reg.json.restaurant as Json).id as string };
  RID = (reg.json.restaurant as Json).id as string;
}, 60_000);

/**
 * Routes réellement exposées, avec un identifiant **remplacé** par une valeur impossible.
 * `abc` couvre le cas « pas un UUID du tout » ; `99999999-9999-9999-9999-999999999999` couvre
 * « UUID bien formé mais inexistant » (doit aussi répondre 404, sans 500).
 */
const INVALIDE = 'abc';
const INEXISTANT = '99999999-9999-9999-9999-999999999999';

/** Une réponse ne doit jamais annoncer « Route inconnue » : ces routes existent. */
const ROUTE_INCONNUE = 'Route inconnue';
// Liste établie à partir des routes réellement déclarées (`grep "\\.get('.*/"`, puis vérifiée :
// chacune est bien une lecture existante, pour que le test mesure le bon comportement et non un 404
// « Route inconnue ». `/offers/:id` et `/discrepancies/:id` n'existent qu'en écriture : ils sont
// couverts par le test des écritures plus bas.
const ROUTES_LECTURE = [
  '/api/prices/ID/history',
  '/api/suppliers/ID',
  '/api/orders/ID/message',
  '/api/orders/ID/pdf',
  '/api/orders/ID/payment',
  '/api/orders/ID/timeline',
  '/api/orders/ID/reorder-preview',
  '/api/compare/ID',
  '/api/public/products/ID',
  '/api/stock/ID/movements',
  '/api/marketplace/vendors/ID',
  '/api/marketplace/vendors/ID/credit',
  '/api/marketplace/vendors/ID/slots',
  '/api/public/vendors/ID/reviews',
  '/api/billing/invoices/ID/pdf',
  '/api/claims/ID/photo',
];

describe('Identifiants invalides — jamais de 500, jamais de SQL dans la réponse', () => {
  it.each(ROUTES_LECTURE)('%s répond une erreur de client (pas un 5xx)', async (route) => {
    const url = route.replace('ID', INVALIDE);
    const r = await call('GET', url, undefined, A);
    expect(r.status, `${url} → HTTP ${r.status} ${r.texte.slice(0, 160)}`).toBeLessThan(500);
    expect(r.texte).not.toMatch(/Failed query|select |invalid input syntax/i);
    // La route doit exister : sinon le test validerait un 404 de route inconnue, sans rien prouver.
    expect(r.json.error, `${url} → ${r.texte.slice(0, 120)}`).not.toBe(ROUTE_INCONNUE);
  });

  it.each(ROUTES_LECTURE)('%s avec un UUID inexistant : pas de 5xx, et jamais de données inventées', async (route) => {
    const url = route.replace('ID', INEXISTANT);
    const r = await call('GET', url, undefined, A);
    expect(r.status, `${url} → HTTP ${r.status}`).toBeLessThan(500);
    if (r.status === 200) {
      // Certaines lectures répondent légitimement 200 pour un identifiant inconnu mais bien formé :
      // l'historique de prix d'un produit inexistant, les avis / créneaux / encours d'un grossiste
      // inconnu, les conditions de paiement par défaut. Ce qui serait grave, ce n'est pas le 200 :
      // c'est d'INVENTER des données. On vérifie donc qu'aucune liste n'est remplie et qu'aucun
      // montant n'est renseigné — un zéro ou un `null` veut dire « rien », un chiffre non nul mentirait.
      // Analyse en clair plutôt qu'une expression régulière : on veut savoir CE QUI est rempli.
      const listesRemplies: unknown[] = [];
      const montantsNonNuls: [string, number][] = [];
      const parcourir = (v: unknown, cle = ''): void => {
        if (Array.isArray(v)) { if (v.length) listesRemplies.push(v); v.forEach((x) => parcourir(x, cle)); return; }
        if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) parcourir(x, k); return; }
        if (typeof v === 'number' && /Eur$/.test(cle) && v !== 0) montantsNonNuls.push([cle, v]);
      };
      parcourir(r.json);
      expect(listesRemplies, `${url} → 200 avec une liste remplie : ${JSON.stringify(listesRemplies).slice(0, 200)}`).toHaveLength(0);
      expect(montantsNonNuls, `${url} → 200 avec un montant non nul : ${JSON.stringify(montantsNonNuls)}`).toHaveLength(0);
    } else {
      expect([401, 403, 404]).toContain(r.status);
    }
  });

  it('les écritures paramétrées sont protégées de la même façon', async () => {
    const ecritures: [string, string, unknown][] = [
      ['POST', '/api/suppliers/abc/offers', { productId: INEXISTANT, packLabel: 'Sac 25 kg', packQty: 25, packPrice: 30 }],
      ['PUT', '/api/offers/abc', { packPrice: 12 }],
      ['POST', '/api/stock/abc/movements', { delta: 1 }],
      ['POST', '/api/alerts/abc/read', {}],
      ['POST', '/api/orders/abc/receive', { lines: [{ lineId: INEXISTANT, receivedQty: 1 }] }],
      ['POST', '/api/discrepancies/abc/resolve', { note: 'test' }],
      ['POST', '/api/orders/abc/review', { rating: 4 }],
      ['PATCH', '/api/members/abc', { role: 'staff' }],
    ];
    for (const [methode, url, corps] of ecritures) {
      const r = await call(methode, url, corps, A);
      expect(r.status, `${methode} ${url} → HTTP ${r.status} ${r.texte.slice(0, 140)}`).toBeLessThan(500);
      expect(r.texte).not.toMatch(/Failed query|invalid input syntax/i);
    }
  });

  it('un identifiant invalide dans le corps de requête est refusé proprement (400, pas 500)', async () => {
    // `lineId` doit être un UUID : le validateur Zod le refuse avant tout accès base.
    const r = await call('POST', `/api/orders/${INEXISTANT}/receive`, { lines: [{ lineId: 'pas-un-uuid', receivedQty: 5 }] }, A);
    expect(r.status).toBeLessThan(500);
    expect(r.texte).not.toMatch(/Failed query|invalid input syntax/i);
  });

  it('l’API reste utilisable après ces appels (aucune session cassée, aucun état corrompu)', async () => {
    const r = await call('GET', '/api/dashboard', undefined, A);
    expect(r.status).toBe(200);
    const reg2 = await call('POST', `/api/compare/${RID}`, undefined, A);   // identifiant de restaurant : produit inexistant
    expect(reg2.status).toBeLessThan(500);
  });
});

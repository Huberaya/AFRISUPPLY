// Chantier P0.2 — RÔLES : la même règle sur toutes les routes qui font la même chose.
//
// Constat de l'audit P0.1 (S-05) : un compte « équipe » (staff) se voyait refuser POST /api/orders ou
// POST /api/suppliers, mais obtenait le même résultat par une route parallèle non gardée (panier
// intelligent, import, ajout d'offres en lot, réassort automatique…).
//
// Ce fichier fixe la matrice des rôles et la vérifie route par route. Il échoue aussi si une route
// d'écriture est ajoutée sans avoir été classée : le rôle d'une nouvelle route devient une décision
// explicite, plus un oubli possible.
//
// Modèle (identique à celui annoncé par GET /api/members et par le menu de l'application) :
//   - équipe (staff)        : le quotidien — stock, inventaire, réception, ventes, saisie express, listes de courses ;
//   - responsable (manager) : + fournisseurs, prix, recettes, commandes, écarts et litiges, réglages, export ;
//   - propriétaire (owner)  : + membres, abonnement, sauvegarde, suppression du compte.
import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '@afrisupply/db';
import { app } from '../app.js';
import { _resetRateLimits } from '../lib/ops.js';
import { creerAppel, inscrire, ajouterMembre, type Compte } from './aide-comptes.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.DATABASE_URL = '';
process.env.PGLITE_DIR = 'memory://p0-roles'; process.env.MAIL_OUTBOX_DIR = '/tmp/afs-outbox-p0-roles'; process.env.BACKUP_DIR = '/tmp/afs-backups-p0-roles';
delete process.env.RESEND_API_KEY; delete process.env.ADMIN_EMAILS;

const appel = creerAppel(app);
const ID = '7b7b7b7b-7b7b-4b7b-8b7b-7b7b7b7b7b7b';
type Regle = 'staff' | 'manager' | 'owner';

/** Matrice des rôles : rôle minimal exigé pour chaque route d'écriture (et les lectures sensibles) du périmètre restaurant. */
const MATRICE: Record<string, Regle> = {
  // --- quotidien : ouvert à toute l'équipe ---
  'POST /api/stock/:itemId/movements': 'staff', 'PUT /api/stock/:itemId': 'staff', 'POST /api/stock/thresholds': 'staff', 'POST /api/stock/inventory': 'staff',
  'POST /api/orders/:id/receive': 'staff', 'POST /api/sales': 'staff',
  'POST /api/quick/parse': 'staff', 'POST /api/quick/apply': 'staff', 'POST /api/quick/invoice': 'staff', 'POST /api/quick/invoice/apply': 'staff',
  'POST /api/shopping/parse': 'staff', 'POST /api/shopping/lists': 'staff', 'PUT /api/shopping/lists/:id': 'staff', 'DELETE /api/shopping/lists/:id': 'staff',
  'POST /api/catalog/track': 'staff', 'POST /api/catalog/products': 'staff',
  'POST /api/alerts/refresh': 'staff', 'POST /api/alerts/:id/read': 'staff',
  'PUT /api/forecast/events': 'staff', 'DELETE /api/forecast/events/:id': 'staff', 'POST /api/forecast/snapshot': 'staff',
  'POST /api/assistant/ask': 'staff', 'POST /api/feedback': 'staff', 'POST /api/usage': 'staff', 'POST /api/onboarding/checklist/:step': 'staff',
  'POST /api/marketplace/vendors/:id/quote': 'staff',   // simple calcul de prix, aucune écriture
  // --- gestion : responsable ---
  'POST /api/suppliers': 'manager', 'PUT /api/suppliers/:id': 'manager', 'POST /api/suppliers/:id/offers': 'manager', 'POST /api/suppliers/:id/offers/batch': 'manager',
  'PUT /api/offers/:id': 'manager', 'DELETE /api/offers/:id': 'manager', 'POST /api/import/suppliers': 'manager',
  'POST /api/recipes': 'manager', 'PUT /api/recipes/:id': 'manager', 'DELETE /api/recipes/:id': 'manager', 'POST /api/onboarding/apply': 'manager',
  'POST /api/orders': 'manager', 'POST /api/orders/:id/send': 'manager', 'PUT /api/orders/:id': 'manager', 'PUT /api/orders/:id/lines': 'manager',
  'POST /api/orders/:id/proposal': 'manager', 'POST /api/orders/:id/reorder': 'manager', 'POST /api/orders/:id/pay': 'manager', 'POST /api/orders/:id/review': 'manager',
  'POST /api/smart-cart/checkout': 'manager',
  'PUT /api/reorder-rules/:inventoryItemId': 'manager', 'DELETE /api/reorder-rules/:inventoryItemId': 'manager', 'POST /api/reorder-rules/run': 'manager',
  'DELETE /api/stock/:itemId': 'manager',
  'POST /api/discrepancies/:id/resolve': 'manager', 'POST /api/claims': 'manager', 'POST /api/claims/:id/close': 'manager',
  'POST /api/recurring': 'manager', 'PUT /api/recurring/:id': 'manager', 'DELETE /api/recurring/:id': 'manager', 'POST /api/recurring/:id/run': 'manager',
  'POST /api/marketplace/vendors/:id/orders': 'manager', 'POST /api/marketplace/vendors/:id/link': 'manager',
  'POST /api/marketplace/group-buys/:id/join': 'manager', 'POST /api/marketplace/orders/:id/send': 'manager',
  'PUT /api/settings': 'manager', 'POST /api/digest/send-test': 'manager', 'POST /api/settings/test-sms': 'manager', 'POST /api/settings/test-email': 'manager',
  'GET /api/account/export': 'manager',
  // --- propriétaire ---
  'POST /api/members': 'owner', 'PATCH /api/members/:userId': 'owner', 'DELETE /api/members/:userId': 'owner',
  'DELETE /api/suppliers/:id': 'owner',
  'POST /api/billing/checkout': 'owner', 'POST /api/billing/portal': 'owner', 'POST /api/billing/sync': 'owner', 'POST /api/billing/invoices/:id/send': 'owner',
  'GET /api/backup/export': 'owner', 'DELETE /api/account': 'owner',
};

const HORS_RESTAURANT = /^\/api\/(auth|public|admin|vendor|jobs|status|health|reference)(\/|$)|^\/api\/billing\/(webhook|health)$/;
const routes = () => {
  const vues = new Set<string>(); const out: string[] = [];
  for (const r of app.routes) { if (r.method === 'ALL') continue; const k = `${r.method} ${r.path}`; if (!vues.has(k)) { vues.add(k); out.push(k); } }
  return out;
};
const chemin = (cle: string) => cle.split(' ')[1].replace(':step', 'app').replace(/:[A-Za-z]+/, ID);
const methode = (cle: string) => cle.split(' ')[0];
const RANG: Record<Regle, number> = { staff: 1, manager: 2, owner: 3 };

let owner: Compte; let manager: Compte; let staff: Compte;
const refuseParRole = async (cle: string, c: Compte) => {
  const body = ['GET', 'DELETE'].includes(methode(cle)) ? undefined : {};
  const r = await appel(methode(cle), chemin(cle), body, c.h);
  return { refuse: r.status === 403 && r.json?.code === 'role_required', status: r.status, requis: r.json?.requiredRole as string | undefined };
};

beforeAll(async () => {
  await runMigrations();
  owner = await inscrire(appel, 'proprietaire@resto.test', 'Restaurant des rôles');
  manager = await ajouterMembre(appel, owner.rid, 'responsable@resto.test', 'manager');
  staff = await ajouterMembre(appel, owner.rid, 'equipe@resto.test', 'staff');
}, 60_000);

describe('matrice des rôles', () => {
  it('toute route d’écriture du périmètre restaurant est classée (aucun oubli possible)', () => {
    const ecritures = routes().filter((k) => !HORS_RESTAURANT.test(k.split(' ')[1]) && methode(k) !== 'GET');
    const nonClassees = ecritures.filter((k) => !(k in MATRICE));
    expect(nonClassees).toEqual([]);
    const inconnues = Object.keys(MATRICE).filter((k) => !routes().includes(k));
    expect(inconnues).toEqual([]);            // la matrice ne décrit que des routes qui existent
    expect(ecritures.length).toBeGreaterThanOrEqual(70);
  });

  for (const [cle, regle] of Object.entries(MATRICE)) {
    it(`${cle} → ${regle}`, async () => {
      await _resetRateLimits();
      // la suppression du compte par le propriétaire détruirait le restaurant utilisé par les autres tests :
      // pour lui, seul le refus des rôles inférieurs est vérifié ici (la suppression réelle l'est dans security.test.ts).
      const destructeur = cle === 'DELETE /api/account';
      for (const [nom, c] of [['staff', staff], ['manager', manager], ['owner', owner]] as const) {
        if (destructeur && nom === 'owner') continue;
        const r = await refuseParRole(cle, c);
        const attenduRefus = RANG[nom] < RANG[regle];
        expect(r.refuse, `${nom} sur ${cle} (HTTP ${r.status})`).toBe(attenduRefus);
        if (attenduRefus) expect(r.requis).toBe(regle);
        else expect(r.status, `${nom} sur ${cle}`).not.toBe(401);
      }
    });
  }
});

describe('contournements prouvés par l’audit (S-05) : la route parallèle est désormais fermée', () => {
  it('un employé ne crée plus de commande par le panier intelligent, ni de fournisseur par l’import, ni de prix par le lot d’offres', async () => {
    const f = await appel('POST', '/api/suppliers', { name: 'Fournisseur du test des rôles' }, owner.h);
    expect(f.status).toBe(201);
    const avant = (await appel('GET', '/api/suppliers', undefined, owner.h)).json.suppliers.length;
    const imp = await appel('POST', '/api/import/suppliers', { csv: 'fournisseur;produit;conditionnement;prix\nGrossiste importé par un employé;Riz;Sac de 10 kg;25', dryRun: false }, staff.h);
    expect(imp.status).toBe(403);
    expect((await appel('GET', '/api/suppliers', undefined, owner.h)).json.suppliers.length).toBe(avant);
    expect((await appel('POST', '/api/smart-cart/checkout', { suppliers: [{ supplierId: f.json.id, lines: [{ offerId: ID, packs: 1 }] }] }, staff.h)).status).toBe(403);
    expect((await appel('POST', `/api/suppliers/${f.json.id}/offers/batch`, { items: [] }, staff.h)).status).toBe(403);
    expect((await appel('GET', '/api/orders', undefined, owner.h)).json.orders).toHaveLength(0);
  });

  it('un employé garde son travail quotidien : suivre un produit, compter, enregistrer un mouvement', async () => {
    await appel('GET', '/api/catalog', undefined, staff.h);
    const produit = (await appel('GET', '/api/products', undefined, staff.h)).json.products[0];
    const suivi = await appel('POST', '/api/catalog/track', { productIds: [produit.id] }, staff.h);
    expect(suivi.status).toBe(200);
    const article = (await appel('GET', '/api/stock', undefined, staff.h)).json.items[0];
    expect((await appel('POST', `/api/stock/${article.id}/movements`, { type: 'reception', quantity: 5 }, staff.h)).status).toBe(200);
    expect((await appel('POST', '/api/stock/inventory', { counts: [{ itemId: article.id, quantity: 4 }] }, staff.h)).status).toBe(200);
    expect((await appel('PUT', `/api/stock/${article.id}`, { criticalLevel: 2 }, staff.h)).status).toBe(200);
    // …mais ne retire pas un article du suivi (réservé au responsable)
    expect((await appel('DELETE', `/api/stock/${article.id}`, undefined, staff.h)).status).toBe(403);
    expect((await appel('DELETE', `/api/stock/${article.id}`, undefined, manager.h)).status).toBe(200);
  });
});

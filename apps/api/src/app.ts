import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { bodyLimit } from 'hono/body-limit';
import { ZodError } from 'zod';
import { authRoutes } from './routes/auth.js';
import { restaurantRoutes } from './routes/restaurant.js';
import { catalogRoutes } from './routes/catalog.js';
import { intelligenceRoutes } from './routes/intelligence.js';
import { analysisRoutes } from './routes/analysis.js'; // chantier 4 : analyse des coûts (page Analyse)
import { manageRoutes } from './routes/manage.js';
import { publicRoutes } from './routes/public.js';
import { storefrontRoutes } from './routes/storefront.js';
import { referenceAdminRoutes, referenceRequestRoutes } from './routes/reference-admin.js';
import { adminDashboardRoutes } from './routes/admin-dashboard.js';
import { claimRoutes, vendorClaimRoutes, adminClaimRoutes } from './routes/claims.js';
import { publicReviewRoutes, reviewRoutes, vendorReviewRoutes } from './routes/reviews.js';
import { jobsRoutes, settingsRoutes } from './routes/jobs.js';
import { isNeon, onVercel, DatabaseUnavailableError } from '@afrisupply/db';
import { accountRoutes } from './routes/account.js';
import { memberRoutes } from './routes/members.js';
import { quickRoutes } from './routes/quick.js';
import { billingRoutes, billingPublicRoutes, billingAdminRoutes } from './routes/billing.js';
import { pilotRoutes, pilotPublicRoutes, pilotAdminRoutes } from './routes/pilots.js';
import { prospectRoutes, prospectPublicRoutes } from './routes/prospects.js';
import { marketplaceRoutes } from './routes/marketplace.js';
import { shoppingRoutes } from './routes/shopping.js';
import { vendorRoutes, vendorAdminRoutes } from './routes/vendor.js';
import { statusRoutes } from './routes/status.js';
import { opsRoutes, adminOpsRoutes } from './routes/ops.js'; // chantier 12 : sauvegardes, supervision, journal d'audit
import { captureException, securityHeaders, rateLimit, buildInfo } from './lib/ops.js';
import { isInvalidUuidInput, isEmptyUpdate } from './lib/db-errors.js';
import { resolveCorsOrigin, setKnownRoutes, configGateState } from './lib/security.js';
import { UnsafeConfigError } from './lib/auth.js';

/** Corps de requête qui n'est pas du JSON lisible (vide, tronqué, mal formé). */
export class InvalidJsonBodyError extends Error {
  constructor() { super('invalid_json_body'); this.name = 'InvalidJsonBodyError'; }
}

/** Taille maximale d'un corps de requête. Les routes qui reçoivent une image ou un fichier ont un plafond plus haut. */
const BODY_LIMIT = 1024 * 1024;            // 1 Mo : très au-dessus de tout formulaire de l'application
const LARGE_BODY_LIMIT = 10 * 1024 * 1024; // 10 Mo : photo de facture, preuve de livraison, sauvegarde, import
const LARGE_BODY_PATHS = [
  /^\/api\/quick\/invoice$/, /^\/api\/claims$/, /^\/api\/vendor\/orders\/[^/]+\/fulfillment$/, /^\/api\/vendor\/catalog\//,
  /^\/api\/vendor\/offers\/import$/, /^\/api\/import\/suppliers$/, /^\/api\/admin\/backups\//, /^\/api\/admin\/prospects\/import$/,
];
const tooLarge = (c: Context) => c.json({ error: 'Requête trop volumineuse.', code: 'payload_too_large' }, 413);
const limitBody = bodyLimit({ maxSize: BODY_LIMIT, onError: tooLarge });
const limitLargeBody = bodyLimit({ maxSize: LARGE_BODY_LIMIT, onError: tooLarge });

export const app = new Hono();
if (process.env.NODE_ENV !== 'test') app.use('*', logger());
app.use('*', securityHeaders);
// Chantier 2 (audit) : plus de « * » avec credentials — liste blanche explicite (ALLOWED_ORIGINS / APP_URL).
// Posés AVANT les gardes ci-dessous : un refus (503, 413, 429) porte ainsi les mêmes en-têtes qu'une réponse normale.
app.use('/api/*', async (c, next) => { await next(); c.header('Cache-Control', 'no-store'); });
app.use('/api/*', cors({ origin: (o) => resolveCorsOrigin(o), credentials: true }));

// Chantier P0.4 — même règle sur Vercel que sur le serveur autonome. Le serveur autonome refuse de
// démarrer avec une configuration dangereuse ; une fonction serverless ne peut pas « ne pas démarrer » :
// elle refuse donc de répondre (503) tant que la configuration n'est pas corrigée. Seul le contrôle
// de santé reste joignable, pour que la panne soit visible et expliquée.
app.use('/api/*', async (c, next) => {
  if (c.req.path !== '/api/health' && configGateState().blocked) {
    return c.json({ error: 'Service momentanément indisponible : la configuration du serveur est incomplète.', code: 'config_unsafe' }, 503);
  }
  await next();
});

// Chantier P0.3/P0.5 — corps de requête : taille plafonnée, et un JSON illisible est une erreur du
// client (400), jamais une panne du service (500).
app.use('/api/*', (c, next) => (LARGE_BODY_PATHS.some((re) => re.test(c.req.path)) ? limitLargeBody : limitBody)(c, next));
app.use('/api/*', async (c, next) => {
  const readJson = c.req.json.bind(c.req);
  (c.req as { json: () => Promise<unknown> }).json = async () => {
    try { return await readJson(); } catch { throw new InvalidJsonBodyError(); }
  };
  await next();
});
// Chantier 2 (audit) : freinage des points d'entrée d'authentification (y compris mot de passe oublié).
app.use('/api/auth/login', rateLimit({ windowMs: 60_000, max: 10 }));
app.use('/api/auth/register', rateLimit({ windowMs: 60_000, max: 5 }));
app.use('/api/auth/forgot-password', rateLimit({ windowMs: 15 * 60_000, max: 5 }));
app.use('/api/auth/reset-password', rateLimit({ windowMs: 15 * 60_000, max: 10 }));
app.use('/api/auth/password', rateLimit({ windowMs: 15 * 60_000, max: 10 }));
app.use('/api/auth/logout-all', rateLimit({ windowMs: 15 * 60_000, max: 20 }));
// Chantier 5 (audit) : confirmation d'adresse e-mail — mêmes limites que le reste de l'authentification.
app.use('/api/auth/verify-email', rateLimit({ windowMs: 15 * 60_000, max: 20 }));
app.use('/api/auth/resend-verification', rateLimit({ windowMs: 15 * 60_000, max: 5 }));
app.use('/api/public/leads', rateLimit({ windowMs: 60_000, max: 5 }));
// Chantier P0.2 : l'ouverture de session par Clerk et la lecture d'un code d'invitation sont freinées
// comme le reste de l'authentification (une seule fenêtre par adresse, quel que soit le code essayé).
app.use('/api/auth/clerk-sync', rateLimit({ windowMs: 60_000, max: 20 }));
app.use('/api/auth/logout', rateLimit({ windowMs: 60_000, max: 30 }));
app.use('/api/public/invite/*', rateLimit({ windowMs: 15 * 60_000, max: 10, key: () => '/api/public/invite' }));

app.get('/api/health', (c) => {
  const gate = configGateState();
  // `db` dit ce que ce déploiement utilise réellement : sur Vercel il n'existe pas de base locale.
  const db = isNeon() ? 'neon' : onVercel() ? 'aucune' : 'pglite-local';
  // Le détail des anomalies reste dans les journaux du serveur : la réponse publique dit seulement « à corriger ».
  return c.json({ ok: !gate.blocked, service: 'afrisupply-api', db, config: gate.blocked ? 'a_corriger' : 'ok', time: new Date().toISOString(), ...buildInfo() }, gate.blocked ? 503 : 200);
});
app.route('/api', statusRoutes);
app.route('/api', opsRoutes);        // chantier 12 : export des données du restaurant (propriétaire)
app.route('/api', adminOpsRoutes);   // chantier 12 : exploitation (jobs, sauvegardes, audit) — admin uniquement
app.route('/api', jobsRoutes); // cron (secret propre)
app.route('/api', publicRoutes);
app.route('/api', storefrontRoutes); // vitrine publique (chantier 13)
app.route('/api', publicReviewRoutes); // avis publics (vitrine)
app.route('/api', prospectPublicRoutes); // lecture d'une invitation fournisseur (chantier 14)
app.route('/api', billingPublicRoutes);
app.route('/api', pilotPublicRoutes); // webhook Stripe (signature, pas de JWT) // public en premier : les routeurs suivants imposent l'auth via use('*')
app.route('/api/auth', authRoutes);
app.route('/api', referenceRequestRoutes); // signalement produit manquant (tout compte connecté)
app.route('/api', referenceAdminRoutes);
app.route('/api', adminDashboardRoutes);
app.route('/api', adminClaimRoutes);
app.route('/api', vendorClaimRoutes);
app.route('/api', vendorReviewRoutes);
app.route('/api', vendorRoutes); // espace fournisseur : comptes sans restaurant → avant les routeurs qui imposent requireRestaurant
app.route('/api', vendorAdminRoutes);
app.route('/api', billingAdminRoutes);
app.route('/api', pilotAdminRoutes);
app.route('/api', prospectRoutes);
app.route('/api', restaurantRoutes);
app.route('/api', catalogRoutes);
app.route('/api', intelligenceRoutes);
app.route('/api', analysisRoutes);
app.route('/api', manageRoutes);
app.route('/api', claimRoutes);
app.route('/api', reviewRoutes);
app.route('/api', settingsRoutes);
app.route('/api', accountRoutes);
app.route('/api', memberRoutes); // chantier 2 : membres & rôles
app.route('/api', quickRoutes);
app.route('/api', marketplaceRoutes);
app.route('/api', shoppingRoutes);
app.route('/api', billingRoutes);
app.route('/api', pilotRoutes);


// Chantier 2 (audit) : registre des routes déclarées, pour répondre 404 (et non 401) sur une URL inconnue.
setKnownRoutes(app.routes.filter((r) => r.method !== 'ALL').map((r) => r.path));

app.notFound((c) => c.json({ error: 'Route inconnue' }, 404));
app.onError((err, c) => {
  // Audit n°3 — identifiant malformé (ex. `/api/compare/abc`) : PostgreSQL refuse la requête, ce
  // n'est pas une panne du service mais une entrée invalide. On répond 404 comme le font les routes
  // qui valident déjà leur identifiant, au lieu d'un 500 qui déclencherait une fausse alerte de
  // supervision et laissait fuiter la requête SQL en développement. Voir lib/db-errors.ts.
  if (isInvalidUuidInput(err)) return c.json({ error: 'Ressource introuvable' }, 404);
  // Chantier P0.3 — erreurs qui viennent de la requête, pas du service : elles répondent 400 et ne
  // déclenchent ni alerte de supervision ni trace d'erreur.
  if (err instanceof InvalidJsonBodyError) return c.json({ error: 'Corps de requête illisible : du JSON valide est attendu.', code: 'invalid_json' }, 400);
  if (err instanceof ZodError) return c.json({ error: 'Données invalides', code: 'invalid_body', details: err.flatten() }, 400);
  if (isEmptyUpdate(err)) return c.json({ error: 'Aucune modification fournie : indiquez au moins un champ à changer.', code: 'empty_update' }, 400);
  // Déploiement sans base utilisable ou sans secret sûr : indisponible (503), avec la raison dans les journaux.
  if (err instanceof DatabaseUnavailableError || err instanceof UnsafeConfigError) {
    console.error(`[config] 🛑 ${err.message}`);
    return c.json({ error: 'Service momentanément indisponible : la configuration du serveur est incomplète.', code: err.code }, 503);
  }
  console.error(err);
  void captureException(err, { route: c.req.path, method: c.req.method, userEmail: (c.get as (k: string) => { email?: string } | undefined)('user')?.email });
  return c.json({ error: 'Erreur serveur', detail: process.env.NODE_ENV === 'production' ? undefined : String(err) }, 500);
});

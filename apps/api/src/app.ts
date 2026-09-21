import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/auth.js';
import { restaurantRoutes } from './routes/restaurant.js';
import { catalogRoutes } from './routes/catalog.js';
import { intelligenceRoutes } from './routes/intelligence.js';
import { manageRoutes } from './routes/manage.js';
import { publicRoutes } from './routes/public.js';
import { storefrontRoutes } from './routes/storefront.js';
import { referenceAdminRoutes, referenceRequestRoutes } from './routes/reference-admin.js';
import { adminDashboardRoutes } from './routes/admin-dashboard.js';
import { claimRoutes, vendorClaimRoutes, adminClaimRoutes } from './routes/claims.js';
import { jobsRoutes, settingsRoutes } from './routes/jobs.js';
import { isNeon } from '@afrisupply/db';
import { accountRoutes } from './routes/account.js';
import { quickRoutes } from './routes/quick.js';
import { billingRoutes, billingPublicRoutes, billingAdminRoutes } from './routes/billing.js';
import { pilotRoutes, pilotPublicRoutes, pilotAdminRoutes } from './routes/pilots.js';
import { prospectRoutes, prospectPublicRoutes } from './routes/prospects.js';
import { marketplaceRoutes } from './routes/marketplace.js';
import { shoppingRoutes } from './routes/shopping.js';
import { vendorRoutes, vendorAdminRoutes } from './routes/vendor.js';
import { statusRoutes } from './routes/status.js';
import { captureException, securityHeaders, rateLimit, buildInfo } from './lib/ops.js';

export const app = new Hono();
if (process.env.NODE_ENV !== 'test') app.use('*', logger());
app.use('*', securityHeaders);
app.use('/api/auth/login', rateLimit({ windowMs: 60_000, max: 10 }));
app.use('/api/auth/register', rateLimit({ windowMs: 60_000, max: 5 }));
app.use('/api/public/leads', rateLimit({ windowMs: 60_000, max: 5 }));
app.use('/api/*', cors({ origin: (o) => o ?? '*', credentials: true }));

app.get('/api/health', (c) => c.json({ ok: true, service: 'afrisupply-api', db: isNeon() ? 'neon' : 'pglite-local', time: new Date().toISOString(), ...buildInfo() }));
app.route('/api', statusRoutes);
app.route('/api', jobsRoutes); // cron (secret propre)
app.route('/api', publicRoutes);
app.route('/api', storefrontRoutes); // vitrine publique (chantier 13)
app.route('/api', prospectPublicRoutes); // lecture d'une invitation fournisseur (chantier 14)
app.route('/api', billingPublicRoutes);
app.route('/api', pilotPublicRoutes); // webhook Stripe (signature, pas de JWT) // public en premier : les routeurs suivants imposent l'auth via use('*')
app.route('/api/auth', authRoutes);
app.route('/api', referenceRequestRoutes); // signalement produit manquant (tout compte connecté)
app.route('/api', referenceAdminRoutes);
app.route('/api', adminDashboardRoutes);
app.route('/api', adminClaimRoutes);
app.route('/api', vendorClaimRoutes);
app.route('/api', vendorRoutes); // espace fournisseur : comptes sans restaurant → avant les routeurs qui imposent requireRestaurant
app.route('/api', vendorAdminRoutes);
app.route('/api', billingAdminRoutes);
app.route('/api', pilotAdminRoutes);
app.route('/api', prospectRoutes);
app.route('/api', restaurantRoutes);
app.route('/api', catalogRoutes);
app.route('/api', intelligenceRoutes);
app.route('/api', manageRoutes);
app.route('/api', claimRoutes);
app.route('/api', settingsRoutes);
app.route('/api', accountRoutes);
app.route('/api', quickRoutes);
app.route('/api', marketplaceRoutes);
app.route('/api', shoppingRoutes);
app.route('/api', billingRoutes);
app.route('/api', pilotRoutes);


app.notFound((c) => c.json({ error: 'Route inconnue' }, 404));
app.onError((err, c) => {
  console.error(err);
  void captureException(err, { route: c.req.path, method: c.req.method, userEmail: (c.get as (k: string) => { email?: string } | undefined)('user')?.email });
  return c.json({ error: 'Erreur serveur', detail: process.env.NODE_ENV === 'production' ? undefined : String(err) }, 500);
});

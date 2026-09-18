import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/auth.js';
import { restaurantRoutes } from './routes/restaurant.js';
import { catalogRoutes } from './routes/catalog.js';
import { intelligenceRoutes } from './routes/intelligence.js';
import { manageRoutes } from './routes/manage.js';
import { publicRoutes } from './routes/public.js';
import { isNeon } from '@afrisupply/db';

export const app = new Hono();
app.use('*', logger());
app.use('/api/*', cors({ origin: (o) => o ?? '*', credentials: true }));

app.get('/api/health', (c) => c.json({ ok: true, service: 'afrisupply-api', db: isNeon() ? 'neon' : 'pglite-local', time: new Date().toISOString() }));
app.route('/api', publicRoutes); // public en premier : les routeurs suivants imposent l'auth via use('*')
app.route('/api/auth', authRoutes);
app.route('/api', restaurantRoutes);
app.route('/api', catalogRoutes);
app.route('/api', intelligenceRoutes);
app.route('/api', manageRoutes);

app.notFound((c) => c.json({ error: 'Route inconnue' }, 404));
app.onError((err, c) => { console.error(err); return c.json({ error: 'Erreur serveur', detail: process.env.NODE_ENV === 'production' ? undefined : String(err) }, 500); });

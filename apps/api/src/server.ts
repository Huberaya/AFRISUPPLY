import { serve } from '@hono/node-server';
import { runMigrations, seedDemo } from '@afrisupply/db';
import { app } from './app.js';
import { enforceSecureConfig } from './lib/security.js';

const port = Number(process.env.PORT ?? 8787);

async function main() {
  // Chantier 2 (audit) : en production, on refuse de démarrer avec un secret de développement,
  // une base éphémère ou le restaurant de démonstration activé.
  enforceSecureConfig();
  if (process.env.AUTO_MIGRATE !== 'false') await runMigrations();
  // SEED_DEMO=true : crée le restaurant démo s'il manque ; SEED_DEMO=purge : le supprime et le régénère.
  if (process.env.SEED_DEMO === 'true' || process.env.SEED_DEMO === 'purge') await seedDemo({ force: process.env.SEED_DEMO === 'purge' });
  serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => console.log(`[api] AFRISUPPLY API → http://0.0.0.0:${port}`));
}
main().catch((e) => { console.error(e); process.exit(1); });

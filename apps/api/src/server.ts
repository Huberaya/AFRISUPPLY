// Serveur autonome (développement local, hébergement hors fonctions serverless).
//
// Le fichier `.env` de la racine est chargé S'IL EXISTE, avant d'importer l'application (plusieurs
// modules lisent leur configuration à l'import). Avant, le script de démarrage l'exigeait
// (`--env-file`) : sans ce fichier — en intégration continue, ou sur un hébergeur qui fournit ses
// variables autrement — le serveur ne démarrait pas du tout. Les variables déjà présentes dans
// l'environnement gardent toujours la priorité sur le fichier.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);
  else console.warn('[config] .env trouvé mais cette version de Node ne sait pas le charger (Node ≥ 20.12 requis) : variables d\'environnement seules.');
}

const { serve } = await import('@hono/node-server');
const { runMigrations, seedDemo } = await import('@afrisupply/db');
const { app } = await import('./app.js');
const { enforceSecureConfig } = await import('./lib/security.js');

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

// Migration au déploiement : appliquée par le build Vercel si DATABASE_URL est disponible (Production/Preview),
// sinon ignorée (build de prévisualisation sans base, ou local). Ne bloque jamais le build d'un site statique.
import { spawnSync } from 'node:child_process';
if (!process.env.DATABASE_URL) { console.log('[migrate] DATABASE_URL absent → migrations ignorées'); process.exit(0); }
if (process.env.SKIP_MIGRATE === '1') { console.log('[migrate] SKIP_MIGRATE=1 → ignorées'); process.exit(0); }
console.log('[migrate] application des migrations Drizzle sur', process.env.DATABASE_URL.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@'));
const r = spawnSync('npm', ['run', 'migrate', '-w', 'packages/db'], { stdio: 'inherit', env: process.env });
process.exit(r.status ?? 1);

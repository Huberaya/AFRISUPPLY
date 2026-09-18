// Bundle l'API Hono (+ @afrisupply/db, code workspace) en un seul fichier JS pour la fonction Vercel.
// Les dépendances npm externes restent dans node_modules ; PGlite (dev only) est exclu.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const deps = Object.keys({ ...JSON.parse(readFileSync('package.json', 'utf8')).dependencies, ...JSON.parse(readFileSync('apps/api/package.json', 'utf8')).dependencies, ...JSON.parse(readFileSync('packages/db/package.json', 'utf8')).dependencies }).filter((d) => !d.startsWith('@afrisupply/'));
await build({
  entryPoints: ['api/_src/index.ts'], outfile: 'api/index.js', bundle: true, platform: 'node', format: 'esm', target: 'node20', sourcemap: false, minify: false,
  external: [...deps, '@electric-sql/pglite', 'drizzle-orm/pglite', 'drizzle-orm/pglite/migrator'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  define: { 'process.env.PGLITE_DISABLED': '"1"' },
});
console.log('[api] bundle → api/index.js');

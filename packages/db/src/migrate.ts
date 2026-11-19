// Applique les migrations SQL générées par drizzle-kit (dossier ./drizzle)
import { getDb, isNeon, type Db } from './client.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

export function resolveMigrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), 'packages/db/drizzle'),
    path.resolve(here, '../drizzle'),
    path.resolve(here, '../packages/db/drizzle'),
    path.resolve(here, '../../packages/db/drizzle'),
    '/var/task/packages/db/drizzle',
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, 'meta', '_journal.json'))) {
        return c;
      }
    } catch {
      // Ignorer les erreurs d'accès
    }
  }
  return path.resolve(here, '../drizzle');
}

/** Rôle applicatif à privilèges minimaux (candidat) : packages/db/roles/afrisupply_app.sql. */
export const APP_ROLE = 'afrisupply_app';
export function resolveAppRoleScript(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const c of [path.resolve(process.cwd(), 'packages/db/roles/afrisupply_app.sql'), path.resolve(here, '../roles/afrisupply_app.sql'), path.resolve(here, '../../packages/db/roles/afrisupply_app.sql')]) {
    try { if (fs.existsSync(c)) return c; } catch { /* chemin illisible : candidat suivant */ }
  }
  return null;
}

/**
 * Levée des réserves (chantier C) — ESSAI du rôle applicatif minimal, base embarquée uniquement.
 * Avec AFS_DB_MINIMAL_ROLE=true, la base embarquée (tests, développement) est utilisée comme le serait
 * une base réelle avec le rôle candidat : les migrations sont jouées par le propriétaire, puis TOUTES
 * les requêtes de l'application passent par `afrisupply_app`, qui ne peut que lire et écrire des lignes.
 * Jamais sur une base distante : là, le rôle est celui de la chaîne de connexion.
 */
export const minimalRoleRequested = (env: NodeJS.ProcessEnv = process.env) => env.AFS_DB_MINIMAL_ROLE === 'true';
type RawClient = { exec: (q: string) => Promise<unknown> };
const rawClient = (db: Db): RawClient | null => { const c = (db as unknown as { $client?: RawClient }).$client; return c && typeof c.exec === 'function' ? c : null; };

/** Applique les migrations sur la base courante, ou sur une base fournie (base neuve de vérification). */
export async function runMigrations(target?: Db) {
  const db = target ?? (await getDb());
  const folder = resolveMigrationsFolder();
  if (!target && isNeon()) {
    const { migrate } = await import('drizzle-orm/neon-serverless/migrator');
    await migrate(db as never, { migrationsFolder: folder });
  } else {
    const minimal = minimalRoleRequested() ? rawClient(db) : null;
    // Les migrations changent la structure : c'est le travail du rôle propriétaire, jamais du rôle applicatif.
    if (minimal) await minimal.exec('RESET ROLE');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(db as never, { migrationsFolder: folder });
    if (minimal) {
      const script = resolveAppRoleScript();
      if (!script) throw new Error('AFS_DB_MINIMAL_ROLE=true mais packages/db/roles/afrisupply_app.sql est introuvable.');
      await minimal.exec(fs.readFileSync(script, 'utf8'));
      await minimal.exec(`SET ROLE ${APP_ROLE}`);
      console.log(`[db] rôle applicatif minimal « ${APP_ROLE} » : l'application ne peut plus que lire et écrire des lignes`);
    }
  }
  console.log('[db] migrations appliquées');
}

if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

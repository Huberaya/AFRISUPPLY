// Applique les migrations SQL générées par drizzle-kit (dossier ./drizzle)
import { getDb, isNeon, type Db } from './client.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

function resolveMigrationsFolder(): string {
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

const migrationsFolder = resolveMigrationsFolder();

/** Applique les migrations sur la base courante, ou sur une base fournie (base neuve de vérification). */
export async function runMigrations(target?: Db) {
  const db = target ?? (await getDb());
  const folder = resolveMigrationsFolder();
  if (!target && isNeon()) {
    const { migrate } = await import('drizzle-orm/neon-serverless/migrator');
    await migrate(db as never, { migrationsFolder: folder });
  } else {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(db as never, { migrationsFolder: folder });
  }
  console.log('[db] migrations appliquées');
}

if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

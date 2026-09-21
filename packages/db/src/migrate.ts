// Applique les migrations SQL générées par drizzle-kit (dossier ./drizzle)
import { getDb, isNeon, type Db } from './client.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../drizzle');

/** Applique les migrations sur la base courante, ou sur une base fournie (base neuve de vérification). */
export async function runMigrations(target?: Db) {
  const db = target ?? (await getDb());
  if (!target && isNeon()) {
    const { migrate } = await import('drizzle-orm/neon-serverless/migrator');
    await migrate(db as never, { migrationsFolder });
  } else {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(db as never, { migrationsFolder });
  }
  console.log('[db] migrations appliquées');
}

if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

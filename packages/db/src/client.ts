// =============================================================
// Client base de données
//  - Production / staging : Neon serverless (DATABASE_URL=postgresql://…neon.tech…)
//  - Local sans DATABASE_URL : PGlite (Postgres WASM embarqué, fichier ./.pglite)
// Les deux exposent la même API Drizzle → aucun code métier ne change.
// =============================================================
import * as schema from './schema.js';
import type { PgliteDatabase } from 'drizzle-orm/pglite';

// Les deux drivers partagent l'API PgDatabase : on expose un seul type pour le code métier.
export type Db = PgliteDatabase<typeof schema>;

let _db: Db | null = null;

export function getDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL?.trim();
  return url && url.length > 0 ? url : undefined;
}

export function isNeon(): boolean {
  return !!getDatabaseUrl();
}

export async function getDb(): Promise<Db> {
  if (_db) return _db;
  const url = getDatabaseUrl();

  if (url) {
    const { Pool, neonConfig } = await import('@neondatabase/serverless');
    const { drizzle } = await import('drizzle-orm/neon-serverless');
    // WebSocket requis pour les transactions hors runtime edge
    const ws = (await import('ws')).default;
    neonConfig.webSocketConstructor = ws;
    const pool = new Pool({ connectionString: url });
    _db = drizzle(pool, { schema }) as unknown as Db;
    console.log('[db] Neon connecté');
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const dataDir = process.env.PGLITE_DIR ?? './.pglite';
    const client = new PGlite(dataDir);
    _db = drizzle(client, { schema });
    console.log(`[db] PGlite local (${dataDir}) — définissez DATABASE_URL pour utiliser Neon`);
  }
  return _db;
}

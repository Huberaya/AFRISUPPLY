// =============================================================
// Client base de données
//  - Production / staging : Neon serverless (DATABASE_URL=postgresql://…neon.tech…)
//  - Prévisualisation Vercel : PREVIEW_DATABASE_URL uniquement (voir `getDatabaseUrl`)
//  - Local sans DATABASE_URL : PGlite (Postgres WASM embarqué, fichier ./.pglite)
// Les deux exposent la même API Drizzle → aucun code métier ne change.
// =============================================================
import * as schema from './schema.js';
import type { PgliteDatabase } from 'drizzle-orm/pglite';

// Les deux drivers partagent l'API PgDatabase : on expose un seul type pour le code métier.
export type Db = PgliteDatabase<typeof schema>;

let _db: Db | null = null;

const clean = (v: string | undefined) => { const s = v?.trim(); return s && s.length > 0 ? s : undefined; };

/** Vrai dans une fonction ou un build Vercel (quel que soit l'environnement). */
export const onVercel = (env: NodeJS.ProcessEnv = process.env) => !!env.VERCEL || !!env.VERCEL_ENV;

/**
 * Adresse de la base à utiliser dans l'environnement courant.
 *
 * Chantier P0.4 — cloisonnement des environnements : une prévisualisation Vercel ne lit JAMAIS
 * `DATABASE_URL`. Cette variable porte la base de production et Vercel propose par défaut de
 * l'exposer à tous les environnements : une branche de travail se brancherait alors sur les données
 * réelles sans que personne ne l'ait décidé. Une prévisualisation n'utilise donc que
 * `PREVIEW_DATABASE_URL` (une base ou une branche Neon dédiée), et rien si elle est absente.
 * Garde supplémentaire : si les deux variables portent la même adresse, la prévisualisation est refusée.
 */
export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.VERCEL_ENV === 'preview') {
    const preview = clean(env.PREVIEW_DATABASE_URL);
    if (preview && preview === clean(env.DATABASE_URL)) return undefined;
    return preview;
  }
  return clean(env.DATABASE_URL);
}

/** Pourquoi aucune base n'est disponible (message destiné à l'exploitant, sans secret). */
export function databaseUnavailableReason(env: NodeJS.ProcessEnv = process.env): string | null {
  if (getDatabaseUrl(env)) return null;
  if (env.VERCEL_ENV === 'preview') {
    return clean(env.PREVIEW_DATABASE_URL)
      ? 'PREVIEW_DATABASE_URL est identique à DATABASE_URL : une prévisualisation ne doit pas utiliser la base de production.'
      : 'PREVIEW_DATABASE_URL est absent : cette prévisualisation n\'a pas de base dédiée (DATABASE_URL est volontairement ignoré hors production).';
  }
  if (onVercel(env)) return 'DATABASE_URL est absent : aucune base n\'est configurée pour ce déploiement.';
  return null; // poste local : PGlite prend le relais
}

/** Levée quand le déploiement n'a pas de base utilisable : l'API répond 503, jamais une base de repli. */
export class DatabaseUnavailableError extends Error {
  readonly code = 'database_unavailable';
  constructor(reason: string) { super(reason); this.name = 'DatabaseUnavailableError'; }
}

export function isNeon(): boolean {
  return !!getDatabaseUrl();
}

/**
 * Région d'hébergement de la base, lue dans le NOM D'HÔTE de son adresse
 * (`ep-….eu-central-1.aws.neon.tech` → aws / eu-central-1). Seul ce libellé sort d'ici : jamais
 * l'adresse, qui contient le mot de passe. `null` si l'adresse est absente ou d'une autre forme.
 *
 * Chantier P0.4 : sert à constater si les fonctions tournent près de la base. Mesuré en production le
 * 2026-11-12 : environ 96 ms par requête SQL — le temps d'un aller-retour entre deux continents.
 */
export function databaseRegion(env: NodeJS.ProcessEnv = process.env): { provider: 'aws' | 'azure'; region: string } | null {
  const url = getDatabaseUrl(env);
  if (!url) return null;
  try {
    const m = /\.([a-z0-9-]+)\.(aws|azure)\.neon\.tech$/i.exec(new URL(url).hostname);
    return m ? { provider: m[2].toLowerCase() as 'aws' | 'azure', region: m[1].toLowerCase() } : null;
  } catch { return null; }
}

/** Région de fonctions la plus proche de chaque région de base proposée par le fournisseur. */
const FONCTIONS_PROCHES: Record<string, string> = {
  'aws/us-east-1': 'iad1', 'aws/us-east-2': 'cle1', 'aws/us-west-2': 'pdx1',
  'aws/eu-central-1': 'fra1', 'aws/eu-west-2': 'lhr1',
  'aws/ap-southeast-1': 'sin1', 'aws/ap-southeast-2': 'syd1', 'aws/sa-east-1': 'gru1',
  'azure/eastus2': 'iad1', 'azure/westus3': 'pdx1', 'azure/germanywestcentral': 'fra1',
};

export interface RegionCheck {
  /** Région où s'exécute la fonction (plateforme serverless), ou null hors plateforme. */
  fonction: string | null;
  /** Région de la base (« aws/eu-central-1 »), ou null si elle ne se lit pas dans l'adresse. */
  base: string | null;
  /** Région de fonctions conseillée pour cette base, si elle est connue. */
  conseillee: string | null;
  /** true : fonctions et base voisines ; false : éloignées ; null : impossible à dire. */
  voisines: boolean | null;
}

/** Les fonctions tournent-elles près de la base ? (constat, sans aucun appel réseau) */
export function regionCheck(env: NodeJS.ProcessEnv = process.env): RegionCheck {
  const fonction = env.VERCEL_REGION?.trim() || null;
  const r = databaseRegion(env);
  const base = r ? `${r.provider}/${r.region}` : null;
  const conseillee = base ? FONCTIONS_PROCHES[base] ?? null : null;
  return { fonction, base, conseillee, voisines: fonction && conseillee ? fonction === conseillee : null };
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
    // Sur Vercel, il n'existe pas de base locale : sans adresse valide on s'arrête net.
    const reason = databaseUnavailableReason();
    if (reason) throw new DatabaseUnavailableError(reason);
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const dataDir = process.env.PGLITE_DIR ?? './.pglite';
    const client = new PGlite(dataDir);
    _db = drizzle(client, { schema });
    console.log(`[db] PGlite local (${dataDir}) — définissez DATABASE_URL pour utiliser Neon`);
  }
  return _db;
}

/**
 * Ouvre une base INDÉPENDANTE du singleton applicatif (fichier ou `memory://nom`).
 * Sert à une seule chose, mais essentielle : prouver qu'une sauvegarde se restaure vraiment —
 * on la restaure dans une base NEUVE, on compte les lignes, puis on jette cette base.
 */
export async function openDatabase(dataDir: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  return drizzle(new PGlite(dataDir), { schema }) as unknown as Db;
}

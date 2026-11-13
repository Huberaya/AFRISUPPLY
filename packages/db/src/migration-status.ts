// =============================================================
// État des migrations : ce que le code attend, ce que la base a réellement reçu.
//
// Chantier P0.4 — une migration écrite dans le dépôt ne prouve pas qu'elle est appliquée. Ce module
// LIT le journal tenu par Drizzle dans la base (`drizzle.__drizzle_migrations`) et le compare au
// journal du code (`drizzle/meta/_journal.json`). Il n'écrit jamais rien.
//
// Utilisé à deux endroits :
//   - au build de production (scripts/deploy-migrate.mjs) : on refuse de mettre en ligne un code
//     qui attend un schéma que la base n'a pas ;
//   - à l'exécution (/api/status, /api/admin/ops) : l'état réel de la base est visible sans console.
// =============================================================
import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, type Db } from './client.js';
import { resolveMigrationsFolder } from './migrate.js';

export type MigrationState = 'a_jour' | 'en_retard' | 'en_avance' | 'divergente' | 'non_initialisee';

export type MigrationStatus = {
  state: MigrationState;
  /** Nombre de migrations décrites par le code. */
  expected: number;
  /** Nombre de migrations inscrites dans la base (null : journal absent). */
  applied: number | null;
  /** Dernière migration du code. */
  lastExpected: string | null;
  /** Dernière migration du code retrouvée dans la base. */
  lastApplied: string | null;
  /** Migrations du code absentes de la base, dans l'ordre d'application. */
  pending: string[];
  /** Migrations inscrites dans la base mais inconnues du code (base plus récente que le code). */
  unknownInDatabase: number;
  /** Migrations appliquées dont le fichier a changé depuis (empreinte différente). */
  modified: string[];
};

type JournalEntry = { tag: string; when: number };

function readJournal(folder: string): JournalEntry[] {
  const raw = JSON.parse(fs.readFileSync(path.join(folder, 'meta', '_journal.json'), 'utf8')) as { entries: JournalEntry[] };
  return raw.entries.map((e) => ({ tag: e.tag, when: Number(e.when) }));
}

const isMissingTable = (e: unknown): boolean => {
  const seen = new Set<unknown>(); let node: unknown = e;
  while (node && typeof node === 'object' && !seen.has(node)) {
    seen.add(node);
    const n = node as { code?: string; message?: string; cause?: unknown };
    if (n.code === '42P01' || n.code === '3F000') return true;   // table ou schéma inexistant
    if (typeof n.message === 'string' && /(relation|schema) .* does not exist/i.test(n.message)) return true;
    node = n.cause;
  }
  return false;
};

/** Compare le journal du code à celui de la base. Lecture seule. */
export async function migrationStatus(target?: Db, folder: string = resolveMigrationsFolder()): Promise<MigrationStatus> {
  const journal = readJournal(folder);
  const files = readMigrationFiles({ migrationsFolder: folder });
  const hashByWhen = new Map(files.map((f) => [Number(f.folderMillis), f.hash]));
  const tagByWhen = new Map(journal.map((e) => [e.when, e.tag]));
  const lastExpected = journal.length ? journal[journal.length - 1].tag : null;

  const db = target ?? (await getDb());
  let rows: { hash: string; created_at: string | number }[];
  try {
    const res = await db.execute(sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at`);
    rows = (res.rows ?? []) as { hash: string; created_at: string | number }[];
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    return { state: 'non_initialisee', expected: journal.length, applied: null, lastExpected, lastApplied: null, pending: journal.map((e) => e.tag), unknownInDatabase: 0, modified: [] };
  }

  const appliedWhen = new Set(rows.map((r) => Number(r.created_at)));
  // Même règle que l'outil de migration : tout ce qui est plus récent que la dernière entrée de la base reste à appliquer.
  const lastInDb = rows.length ? Math.max(...rows.map((r) => Number(r.created_at))) : -Infinity;
  const pending = journal.filter((e) => e.when > lastInDb).map((e) => e.tag);
  const unknownInDatabase = rows.filter((r) => !tagByWhen.has(Number(r.created_at))).length;
  const modified = rows
    .filter((r) => tagByWhen.has(Number(r.created_at)) && hashByWhen.get(Number(r.created_at)) !== r.hash)
    .map((r) => tagByWhen.get(Number(r.created_at))!);
  const known = journal.filter((e) => appliedWhen.has(e.when));
  const lastApplied = known.length ? known[known.length - 1].tag : null;

  const state: MigrationState = pending.length ? (rows.length ? 'en_retard' : 'non_initialisee')
    : modified.length ? 'divergente'
      : unknownInDatabase ? 'en_avance' : 'a_jour';
  return { state, expected: journal.length, applied: rows.length, lastExpected, lastApplied, pending, unknownInDatabase, modified };
}

/** Phrase lisible par l'exploitant. */
export function describeMigrationStatus(s: MigrationStatus): string {
  switch (s.state) {
    case 'a_jour': return `base à jour (${s.applied}/${s.expected} migrations, dernière : ${s.lastApplied}).`;
    case 'non_initialisee': return `base non initialisée : aucune des ${s.expected} migrations n'est appliquée.`;
    case 'en_retard': return `base en retard : ${s.pending.length} migration(s) à appliquer (${s.pending.join(', ')}).`;
    case 'en_avance': return `base en avance : ${s.unknownInDatabase} migration(s) appliquée(s) que ce code ne connaît pas.`;
    case 'divergente': return `historique divergent : ${s.modified.length} migration(s) appliquée(s) dont le fichier a changé depuis (${s.modified.join(', ')}).`;
  }
}

// Ligne de commande : `tsx src/migration-status.ts` → code de sortie 0 (à jour), 3 (en retard ou non
// initialisée), 4 (en avance ou divergente), 1 (erreur). N'écrit jamais dans la base.
if (process.argv[1] && process.argv[1].endsWith('migration-status.ts')) {
  // Un build ne doit jamais rester suspendu à une base qui ne répond pas : au-delà de 45 s, on abandonne.
  const delai = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('aucune réponse de la base en 45 secondes')), 45_000).unref());
  Promise.race([migrationStatus(), delai])
    .then((s) => {
      console.log(`[migrate] ${describeMigrationStatus(s)}`);
      process.exit(s.state === 'a_jour' ? 0 : s.state === 'en_retard' || s.state === 'non_initialisee' ? 3 : 4);
    })
    .catch((e) => { console.error('[migrate] lecture de l\'état impossible :', (e as Error).message); process.exit(1); });
}

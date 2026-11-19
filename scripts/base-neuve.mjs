// =============================================================
// AFRISUPPLY — script SQL d'une base NEUVE (levée des blocages, chantier B)
//
// Produit packages/db/sql/base_neuve.sql : les 29 migrations du dépôt et leur journal, en un seul
// fichier SQL qu'on peut coller dans un éditeur SQL. Il sert à créer une base de test SANS AUCUNE
// donnée (prévisualisation propre), sans outil ni accès au dépôt, exactement comme l'outil de
// migration l'aurait fait : mêmes instructions, mêmes empreintes dans le journal.
//
// CE N'EST PAS UNE MIGRATION et rien ne l'exécute automatiquement. Il refuse de s'appliquer à une base
// qui contient déjà des tables : il ne peut pas toucher une base existante.
//
//   node scripts/base-neuve.mjs           # régénère le fichier
//   node scripts/base-neuve.mjs --check   # échoue si le fichier committé ne correspond plus aux migrations
// =============================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dossier = path.join(racine, 'packages/db/drizzle');
const sortie = path.join(racine, 'packages/db/sql/base_neuve.sql');

export function construire() {
  const journal = JSON.parse(readFileSync(path.join(dossier, 'meta/_journal.json'), 'utf8')).entries;
  const migrations = readMigrationFiles({ migrationsFolder: dossier });
  if (migrations.length !== journal.length) throw new Error(`journal (${journal.length}) et fichiers (${migrations.length}) ne concordent pas`);
  const lignes = [
    '-- =============================================================',
    `-- AFRISUPPLY — base neuve : ${migrations.length} migrations et leur journal (dernière : ${journal.at(-1).tag})`,
    '-- FICHIER GÉNÉRÉ par scripts/base-neuve.mjs — ne pas modifier à la main.',
    '--',
    '-- À jouer UNE fois, avec le rôle propriétaire, sur une base VIDE (base de test, prévisualisation).',
    '-- Il ne contient aucune donnée. Il refuse de s\'appliquer à une base qui contient déjà des tables.',
    '-- Ce n\'est pas une migration : rien ne l\'exécute automatiquement.',
    '-- =============================================================',
    'BEGIN;',
    '',
    'DO $$',
    'BEGIN',
    '  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema IN (\'public\', \'drizzle\')) THEN',
    '    RAISE EXCEPTION \'Cette base contient déjà des tables : ce script ne s\'\'applique qu\'\'à une base neuve.\';',
    '  END IF;',
    'END',
    '$$;',
    '',
    'CREATE SCHEMA IF NOT EXISTS "drizzle";',
    'CREATE TABLE "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);',
  ];
  migrations.forEach((m, i) => {
    lignes.push('', `-- ---------- ${String(i + 1).padStart(2, '0')}/${migrations.length} · ${journal[i].tag} ----------`);
    for (const instruction of m.sql) {
      const texte = instruction.trim();
      if (!texte) continue;
      lignes.push(texte.endsWith(';') ? texte : `${texte};`);
    }
    lignes.push(`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('${m.hash}', ${m.folderMillis});`);
  });
  lignes.push('', 'COMMIT;', '');
  return lignes.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sql = construire();
  if (process.argv.includes('--check')) {
    const actuel = existsSync(sortie) ? readFileSync(sortie, 'utf8') : '';
    if (actuel !== sql) { console.error('✗ packages/db/sql/base_neuve.sql ne correspond plus aux migrations : relancer « node scripts/base-neuve.mjs » et committer.'); process.exit(1); }
    console.log(`✓ packages/db/sql/base_neuve.sql correspond aux migrations (${sql.split('\n').length} lignes)`);
  } else {
    mkdirSync(path.dirname(sortie), { recursive: true });
    writeFileSync(sortie, sql);
    console.log(`✓ ${path.relative(racine, sortie)} écrit (${sql.split('\n').length} lignes, ${Buffer.byteLength(sql)} octets)`);
  }
}

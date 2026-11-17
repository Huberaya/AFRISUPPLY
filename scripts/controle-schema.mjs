#!/usr/bin/env node
// Contrôle « schéma ↔ migrations » : le schéma du code (packages/db/src/schema.ts) ne doit rien contenir
// qui ne soit pas déjà dans une migration.
//
// Pourquoi. Une colonne ajoutée au schéma sans migration passe tous les tests sur une base créée à neuf par
// le code… et casse en production, où la base n'est modifiée QUE par les migrations. À l'inverse, une
// migration écrite à la main sans l'instantané qui l'accompagne (cas de 0028, corrigé) fait régénérer les
// mêmes instructions à la migration suivante : elle échouerait au déploiement (« la colonne existe déjà »).
//
// Comment. Le générateur de migrations est lancé sur une COPIE du dossier des migrations : rien n'est écrit
// dans le dépôt. S'il produit un fichier, le contrôle échoue et affiche ce qui manque.
//
//   node scripts/controle-schema.mjs
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const db = join(racine, 'packages', 'db');
const copie = mkdtempSync(join(tmpdir(), 'afs-schema-'));
const sortie = join(copie, 'drizzle');
cpSync(join(db, 'drizzle'), sortie, { recursive: true });

const avant = new Set(readdirSync(sortie).filter((f) => f.endsWith('.sql')));
// Le générateur n'accepte qu'un chemin RELATIF pour sa sortie (il le préfixe de « ./ »).
const r = spawnSync('npx', ['drizzle-kit', 'generate', '--dialect', 'postgresql', '--schema', './src/schema.ts', '--out', relative(db, sortie)], {
  cwd: db, encoding: 'utf8', env: { ...process.env, CI: 'true' }, shell: process.platform === 'win32', timeout: 120_000,
});
const texte = `${r.stdout ?? ''}${r.stderr ?? ''}`;
const nouveaux = readdirSync(sortie).filter((f) => f.endsWith('.sql') && !avant.has(f));
// Le générateur peut sortir avec le code 0 après une erreur : seul son message « rien à migrer » vaut succès.
const rienAMigrer = /No schema changes, nothing to migrate/.test(texte);
let code = 0;
if (r.status !== 0 || (!nouveaux.length && !rienAMigrer)) {
  console.error('✖ Le générateur de migrations n\'a pas pu comparer le schéma et les migrations :\n' + texte.trim().split('\n').slice(-12).join('\n'));
  code = 2;
} else if (nouveaux.length) {
  console.error(`✖ Le schéma du code contient des éléments absents des ${avant.size} migrations.`);
  for (const f of nouveaux) console.error(`\n--- instructions manquantes (${f}) ---\n${readFileSync(join(sortie, f), 'utf8').trim()}`);
  console.error('\nÀ faire : écrire la migration correspondante (cd packages/db && npm run generate), relire le fichier produit,\npuis régénérer packages/db/sql/base_neuve.sql (node scripts/base-neuve.mjs). Ne jamais corriger la base à la main.');
  code = 1;
} else {
  console.log(`✔ Schéma et migrations concordent : ${avant.size} migrations, aucune instruction manquante.`);
}
rmSync(copie, { recursive: true, force: true });
process.exit(code);

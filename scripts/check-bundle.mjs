// Vérifie que le bundle serverless versionné (`api/index.js`) est bien à jour par rapport aux sources.
//
// Pourquoi : `api/index.js` est committé (Vercel détecte les fonctions depuis le dépôt). Si quelqu'un
// modifie l'API sans relancer `npm run build:api`, le déployé ne correspond plus au code testé — et
// personne ne s'en aperçoit avant la production. Ce contrôle échoue dans ce cas, et laisse l'arbre
// de travail intact quand tout va bien.
//
// Second contrôle, ajouté après une panne réelle en production : vérifier que le bundle à jour soit
// bien celui qu'on déploie. La production tournait sur un bundle resté en arrière — les correctifs
// étaient committés, poussés, « déployés »… et sans effet, parce que la chaîne de déploiement ne
// régénérait pas le bundle. On exige donc désormais que le build Vercel le régénère lui-même
// (`node api/build.mjs` dans `vercel.json`).
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BUNDLE = 'api/index.js';
const root = process.cwd();

if (!existsSync(BUNDLE)) {
  console.error(`✖ ${BUNDLE} est absent : lancez \`npm run build:api\` puis committez le fichier.`);
  process.exit(1);
}

// Hors dépôt git (build Vercel) : rien à comparer, ce contrôle ne concerne que le dépôt.
try {
  execFileSync('git', ['rev-parse', '--git-dir'], { cwd: root, stdio: 'ignore' });
} catch {
  console.log('[bundle] pas de dépôt git ici — contrôle ignoré.');
  process.exit(0);
}

const before = readFileSync(BUNDLE);
const backupDir = mkdtempSync(path.join(tmpdir(), 'afs-bundle-'));
const backup = path.join(backupDir, 'index.js');
copyFileSync(BUNDLE, backup);

let ok = true;
try {
  execFileSync('node', ['api/build.mjs'], { cwd: root, stdio: 'inherit' });
  const after = readFileSync(BUNDLE);
  ok = Buffer.compare(before, after) === 0;
  if (!ok) {
    console.error('\n✖ api/index.js ne correspond PAS aux sources actuelles de l’API.');
    console.error('  → lancez `npm run build:api` et committez api/index.js avec vos changements.');
  } else {
    console.log('✓ api/index.js est à jour (identique au bundle reconstruit).');
  }
} finally {
  // On restaure le fichier tel qu'il était : ce script est un CONTRÔLE, pas un build.
  if (!ok) copyFileSync(backup, BUNDLE);
  rmSync(backupDir, { recursive: true, force: true });
}

// --- Second contrôle : la chaîne de déploiement reconstruit-elle le bundle ? ---------------------
// Sans cette étape, un oubli de commit du bundle fait tourner la production sur du code périmé,
// sans que rien ne le signale (le commit affiché par la plateforme reste, lui, le bon).
let deploieLeBundle = true;
try {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const buildCommand = String(vercel.buildCommand ?? '');
  deploieLeBundle = buildCommand.includes('api/build.mjs');
  if (deploieLeBundle) {
    console.log('✓ le déploiement régénère le bundle (vercel.json → buildCommand).');
  } else {
    console.error('\n✖ `vercel.json` ne régénère PAS le bundle : la production servirait un bundle périmé.');
    console.error('  → ajoutez `node api/build.mjs` au buildCommand de vercel.json.');
  }
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.log('[bundle] pas de vercel.json ici — second contrôle ignoré.');
  } else {
    deploieLeBundle = false;
    console.error('\n✖ vercel.json illisible :', error?.message ?? error);
  }
}

// --- Troisième contrôle : la fonction déployée charge-t-elle les mêmes dépendances que les tests ? ---
// `api/index.js` est à la racine du dépôt : à l'exécution, ses dépendances externes (hono, zod,
// drizzle-orm…) sont cherchées depuis la RACINE. Les tests, eux, s'exécutent dans `apps/api` et
// `packages/db`. Si une dépendance n'est installée que dans un espace de travail, ou y existe dans
// une autre version qu'à la racine, la production charge autre chose que ce qui a été testé — ou ne
// démarre pas du tout (module introuvable). Constaté lors du chantier P0.5 : après une mise à jour,
// `zod` et `@hono/node-server` n'étaient plus résolus à la racine dans la version testée.
const requireDepuis = (dossier) => createRequire(path.join(root, dossier, 'package.json'));
const versionVue = (dossier, paquet) => {
  // On remonte les dossiers node_modules comme le fait Node, sans dépendre du champ « exports » du paquet.
  for (const base of requireDepuis(dossier).resolve.paths(paquet) ?? []) {
    const fichier = path.join(base, paquet, 'package.json');
    if (existsSync(fichier)) return JSON.parse(readFileSync(fichier, 'utf8')).version;
  }
  return null;
};
const nomDuPaquet = (specifier) => (specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]);
const source = readFileSync(BUNDLE, 'utf8');
// Imports statiques (`import … from "paquet"`) et chargements à la demande (`await import("paquet")`).
const specifiers = [
  ...[...source.matchAll(/^import\s[^'"]*from\s+["']([^"'.][^"']*)["'];?$/gm)].map((m) => m[1]),
  ...[...source.matchAll(/\bimport\(\s*["']([^"'.][^"']*)["']\s*\)/g)].map((m) => m[1]),
];
const externes = [...new Set(specifiers.filter((s) => !s.startsWith('node:')).map(nomDuPaquet))].sort();
let dependancesCoherentes = true;
for (const paquet of externes) {
  const racine = versionVue('.', paquet);
  const api = versionVue('apps/api', paquet);
  const db = versionVue('packages/db', paquet);
  if (!racine) {
    dependancesCoherentes = false;
    console.error(`\n✖ ${paquet} est importé par ${BUNDLE} mais introuvable depuis la racine du dépôt : la fonction déployée ne démarrerait pas.`);
    console.error('  → déclarez-le dans les dépendances du package.json racine, à la même version que dans les espaces de travail.');
  } else if ((api && api !== racine) || (db && db !== racine)) {
    dependancesCoherentes = false;
    console.error(`\n✖ ${paquet} : la fonction déployée chargerait la version ${racine}, les tests utilisent ${[api, db].filter((v) => v && v !== racine).join(' / ')}.`);
    console.error('  → alignez les versions (package.json racine, apps/api, packages/db) puis relancez `npm install`.');
  }
}
if (dependancesCoherentes) console.log(`✓ les ${externes.length} dépendances externes du bundle se résolvent depuis la racine, dans la version testée.`);

process.exit(ok && deploieLeBundle && dependancesCoherentes ? 0 : 1);

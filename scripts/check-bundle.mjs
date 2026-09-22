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

process.exit(ok && deploieLeBundle ? 0 : 1);

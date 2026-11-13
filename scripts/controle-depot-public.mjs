// =============================================================
// AFRISUPPLY — contrôle « dépôt public » (levée des blocages, chantier J)
//
// Ce dépôt est PUBLIC. Deux fichiers de prospection y ont été committés en septembre 2026 avec des
// coordonnées de tiers (noms de dirigeants, téléphones, adresses e-mail). Ce contrôle empêche que cela
// se reproduise. Il échoue si un fichier SUIVI par Git est :
//   1. un fichier de données (tableur, export, carnet d'adresses, sauvegarde) ;
//   2. un fichier contenant ce qui ressemble à un secret réel (clé, chaîne de connexion, clé privée) ;
//   3. un document contenant des coordonnées (téléphone, adresse e-mail hors domaines d'exemple) ;
//   4. n'importe quel fichier, hors tests, contenant une LISTE de coordonnées (20 ou plus).
// Il n'affiche jamais la valeur trouvée : seulement le fichier, la ligne et la nature du constat.
//
//   node scripts/controle-depot-public.mjs              # contrôle les fichiers suivis
//   node scripts/controle-depot-public.mjs --auto-test  # vérifie que le contrôle détecte bien
// =============================================================
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 1. Extensions de fichiers de données : aucune n'a sa place dans un dépôt public. */
const DONNEES = /\.(csv|tsv|xlsx|xlsm|xls|ods|numbers|vcf|sqlite|sqlite3|db|dump|bak|pst|mbox|sql\.gz|json\.gz)$/i;
/** Exceptions explicites (aucune aujourd'hui). Un modèle vide se documente ici, avec sa raison. */
const DONNEES_AUTORISEES = new Set([]);

/** 2. Formes de secrets RÉELS (les valeurs d'essai du dépôt, courtes ou à tirets bas, n'y répondent pas). */
const SECRETS = [
  ['clé secrète Clerk ou Stripe', /\b(sk|rk)_(live|test)_[A-Za-z0-9]{24,}\b/],
  ['clé d\'envoi d\'e-mails', /\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{16,}\b/],
  ['secret de webhook', /\bwhsec_[A-Za-z0-9]{24,}\b/],
  ['chaîne de connexion avec mot de passe', /\bpostgres(?:ql)?:\/\/[^:\s'"`]+:(?!p@|pass@|password@|motdepasse@|\*+@|<)[^@\s'"`]{12,}@[A-Za-z0-9.-]+\.[a-z]{2,}/],
  ['clé privée', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['clé d\'accès de stockage', /\bAKIA[0-9A-Z]{16}\b/],
  ['jeton GitHub', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['jeton de session', /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{16,}\b/],
];

/** 3 et 4. Coordonnées. */
const TELEPHONE = /(?:\+33[\s.]?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
/** Domaines qui ne désignent personne : exemples, essais, adresses de la société et de ses prestataires. */
const DOMAINE_NEUTRE = /(^|\.)(test|example|invalid|localhost)$|^example\.(com|org|net)$|^(afrisupply\.fr|chezawa\.fr|resend\.dev|users\.noreply\.github\.com|exemple\.fr|exemple\.com)$|\.neon\.tech$|\.vercel\.app$|\.clerk\.accounts\.dev$/i;
const DOCUMENT = /\.(md|mdx|txt|rst|adoc|html?)$/i;
const TEXTE = /\.(md|mdx|txt|rst|html?|json|ya?ml|ts|tsx|js|mjs|cjs|py|sh|sql|toml|env|example|css|svg)$/i;
/** Fichiers où des coordonnées inventées en nombre sont normales : tests, vérifications, jeu de démonstration. */
const ESSAIS = /(^|\/)(test|tests|__tests__)\/|\.test\.[a-z]+$|^scripts\/(verifications|navigateur)\/|^packages\/db\/src\/seed|^apps\/api\/src\/(data|lib\/prospects)|^api\/index\.js$|package-lock\.json$/;
const SEUIL_LISTE = 20;

/** Constats pour un fichier : [{ ligne, nature }] — jamais la valeur. */
export function examiner(fichier, contenu) {
  const constats = [];
  if (DONNEES.test(fichier) && !DONNEES_AUTORISEES.has(fichier)) constats.push({ ligne: 0, nature: 'fichier de données (tableur, export ou sauvegarde) dans un dépôt public' });
  if (contenu === null || !TEXTE.test(fichier)) return constats;
  const lignes = contenu.split('\n');
  const telephones = new Set(); const adresses = new Set();
  lignes.forEach((l, i) => {
    for (const [nom, motif] of SECRETS) if (motif.test(l)) constats.push({ ligne: i + 1, nature: `secret probable : ${nom}` });
    for (const m of l.matchAll(TELEPHONE)) { telephones.add(m[0].replace(/\D/g, '')); if (DOCUMENT.test(fichier)) constats.push({ ligne: i + 1, nature: 'numéro de téléphone dans un document' }); }
    for (const m of l.matchAll(EMAIL)) {
      if (DOMAINE_NEUTRE.test(m[1])) continue;
      adresses.add(m[0].toLowerCase());
      if (DOCUMENT.test(fichier)) constats.push({ ligne: i + 1, nature: `adresse e-mail dans un document (domaine ${m[1].toLowerCase()})` });
    }
  });
  if (!ESSAIS.test(fichier) && !DOCUMENT.test(fichier)) {
    if (telephones.size >= SEUIL_LISTE) constats.push({ ligne: 0, nature: `liste de ${telephones.size} numéros de téléphone` });
    if (adresses.size >= SEUIL_LISTE) constats.push({ ligne: 0, nature: `liste de ${adresses.size} adresses e-mail` });
  }
  return constats;
}

function autoTest() {
  const doit = (nom, ok) => { if (!ok) { console.error(`✗ auto-test : ${nom}`); process.exit(1); } };
  const natures = (f, c) => examiner(f, c).map((x) => x.nature).join(' | ');
  doit('un tableur est refusé', /fichier de données/.test(natures('docs/prospection/liste.xlsx', null)));
  doit('un export CSV est refusé', /fichier de données/.test(natures('docs/x/export.csv', 'a;b')));
  doit('un téléphone dans un document est vu', /téléphone/.test(natures('docs/note.md', 'Appeler le 06 12 34 56 78 demain')));
  doit('une adresse réelle dans un document est vue', /adresse e-mail/.test(natures('docs/note.md', 'contact : prenom.nom@gmail.com')));
  doit('une adresse d\'exemple ne l\'est pas', natures('docs/note.md', 'awa@chezawa.fr, test@parcours.test, bonjour@afrisupply.fr') === '');
  doit('une clé réelle est vue', /secret probable/.test(natures('apps/api/src/x.ts', `const k = 'sk_live_${'a1B2c3D4'.repeat(4)}';`)));
  doit('une clé d\'essai du dépôt ne l\'est pas', natures('apps/api/src/test/x.test.ts', "const k = 'sk_live_cle_secrete_de_production_0001';") === '');
  doit('une chaîne de connexion réelle est vue', /chaîne de connexion/.test(natures('notes.txt', 'postgresql://neondb_owner:npg_AbCdEfGh1234567@ep-nom-123.eu-central-1.aws.neon.tech/neondb')));
  doit('une chaîne d\'exemple ne l\'est pas', natures('.env.example', 'DATABASE_URL=postgresql://user:pass@ep-xxxx-pooler.eu-central-1.aws.neon.tech/afrisupply') === '');
  doit('une clé privée est vue', /clé privée/.test(natures('cle.txt', '-----BEGIN PRIVATE KEY-----')));
  const liste = Array.from({ length: 25 }, (_, i) => `{ nom: 'Société ${i}', tel: '01 42 00 00 ${String(i).padStart(2, '0')}' }`).join(',\n');
  doit('une liste de coordonnées hors tests est vue', /liste de 25 numéros/.test(natures('apps/api/src/routes/x.ts', liste)));
  doit('la même liste dans un test ne l\'est pas', natures('apps/api/src/test/x.test.ts', liste) === '');
  doit('le constat ne contient jamais la valeur', !JSON.stringify(examiner('docs/note.md', 'prenom.nom@gmail.com 06 12 34 56 78')).includes('prenom.nom') && !JSON.stringify(examiner('docs/note.md', '06 12 34 56 78')).includes('56 78'));
  console.log('✓ auto-test : 13 cas');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--auto-test')) { autoTest(); process.exit(0); }
  const fichiers = execFileSync('git', ['ls-files', '-z'], { cwd: racine, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
  let total = 0;
  for (const f of fichiers) {
    let contenu = null;
    if (TEXTE.test(f)) { try { contenu = readFileSync(path.join(racine, f), 'utf8'); } catch { contenu = null; } }
    for (const c of examiner(f, contenu)) { total += 1; console.error(`✗ ${f}${c.ligne ? `:${c.ligne}` : ''} — ${c.nature}`); }
  }
  if (total) { console.error(`\n${total} constat(s). Ce dépôt est public : retirer ces contenus (voir docs/audits/DEPOT_PUBLIC_DONNEES_PERSONNELLES.md).`); process.exit(1); }
  console.log(`✓ dépôt public : ${fichiers.length} fichiers suivis, aucun fichier de données, aucun secret probable, aucune coordonnée dans les documents`);
}

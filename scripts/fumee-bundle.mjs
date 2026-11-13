// Essai de fumée du bundle serverless : `api/index.js` démarre-t-il, et répond-il correctement ?
//
// Pourquoi : les tests exercent les SOURCES de l'API, depuis `apps/api`. La production exécute le
// bundle `api/index.js`, depuis la racine du dépôt, avec ses dépendances résolues à la racine. Un
// module introuvable ou une dépendance dans une autre version ne se voit donc dans aucun test : la
// fonction déployée tomberait en panne dès sa première requête. Ce script charge le bundle tel
// quel (aucun outil de transformation), le branche sur un vrai serveur HTTP — comme le fait la
// plateforme — et vérifie quelques réponses qui traversent toute la chaîne : base, session,
// validation, limites.
//
// La base est une base PostgreSQL embarquée (PGlite) créée pour l'essai : ce script ne se connecte
// à aucun service réel. Usage : `npm run check:bundle:run`.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'afs-fumee-'));
const env = { PGLITE_DIR: path.join(tmp, 'pglite'), JWT_SECRET: 'secret-local-de-l-essai-de-fumee-0123456789', NODE_ENV: 'development', MAIL_OUTBOX_DIR: path.join(tmp, 'outbox'), BACKUP_DIR: path.join(tmp, 'backups') };
// Aucune variable du poste ne doit influencer l'essai (ni base réelle, ni clé de service).
for (const k of Object.keys(process.env)) if (/^(DATABASE_URL|PREVIEW_DATABASE_URL|VERCEL|RESEND_|STRIPE_|TWILIO_|LLM_|SENTRY_|CLERK_|BACKUP_S3_|ADMIN_EMAILS|CRON_SECRET|SEED_DEMO)/.test(k)) delete process.env[k];
Object.assign(process.env, env);

let echecs = 0;
const verifier = (libelle, ok, detail = '') => { if (!ok) echecs += 1; console.log(`  [${ok ? 'OK' : 'ÉCHEC'}] ${libelle}${detail ? ` — ${detail}` : ''}`); };

try {
  // 1. La base de l'essai reçoit les migrations (processus séparé : une seule connexion à la fois sur le dossier PGlite).
  const mig = spawnSync('npm', ['run', '--silent', 'migrate', '-w', 'packages/db'], { cwd: racine, env: { ...process.env }, encoding: 'utf8' });
  verifier('migrations appliquées sur la base de l\'essai', mig.status === 0, mig.status === 0 ? '' : (mig.stderr || mig.stdout).slice(-300));

  // 2. Le bundle est chargé tel qu'il sera déployé, puis branché sur un serveur HTTP.
  const { default: listener } = await import(pathToFileURL(path.join(racine, 'api/index.js')).href);
  verifier('api/index.js se charge et exporte un écouteur (req, res)', typeof listener === 'function');
  const serveur = http.createServer(listener);
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${serveur.address().port}`;
  const appel = async (methode, chemin, corps, enTetes = {}) => {
    const res = await fetch(base + chemin, { method: methode, headers: { 'content-type': 'application/json', connection: 'close', ...enTetes }, body: corps === undefined ? undefined : typeof corps === 'string' ? corps : JSON.stringify(corps) });
    const texte = await res.text(); let json = null; try { json = JSON.parse(texte); } catch { /* pas de JSON */ }
    return { status: res.status, json, headers: res.headers };
  };

  const sante = await appel('GET', '/api/health');
  verifier('GET /api/health → 200, configuration saine', sante.status === 200 && sante.json?.ok === true && sante.json?.config === 'ok', `HTTP ${sante.status}`);
  const statut = await appel('GET', '/api/status');
  verifier('GET /api/status lit l\'état des migrations dans la base', statut.json?.checks?.schema?.state === 'a_jour', JSON.stringify(statut.json?.checks?.schema ?? null));
  const insc = await appel('POST', '/api/auth/register', { email: 'fumee@resto.test', password: 'Plantain-Yassa-42', fullName: 'Essai de fumée', restaurantName: 'Restaurant de l\'essai' });
  const cookie = insc.headers.get('set-cookie') ?? '';
  verifier('inscription → 201, cookie de session HttpOnly', insc.status === 201 && /afs_token=/.test(cookie) && /HttpOnly/i.test(cookie), `HTTP ${insc.status}`);
  const session = { authorization: `Bearer ${insc.json?.token}` };
  verifier('route protégée avec session → 200', (await appel('GET', '/api/stock', undefined, session)).status === 200);
  verifier('route protégée sans session → 401', (await appel('GET', '/api/stock')).status === 401);
  verifier('route protégée à paramètre sans session → 401 (et non 404)', (await appel('GET', '/api/orders/7b7b7b7b-7b7b-4b7b-8b7b-7b7b7b7b7b7b/timeline')).status === 401);
  const malForme = await appel('POST', '/api/suppliers', '{"name": ', session);
  verifier('JSON mal formé → 400', malForme.status === 400 && malForme.json?.code === 'invalid_json', `HTTP ${malForme.status}`);
  const cree = await appel('POST', '/api/suppliers', { name: 'Fournisseur de l\'essai' }, session);
  verifier('création validée par le schéma → 201', cree.status === 201, `HTTP ${cree.status}`);
  verifier('modification vide {} → 400 (et non 500)', (await appel('PUT', `/api/suppliers/${cree.json?.id}`, {}, session)).status === 400);
  const clerk = await appel('POST', '/api/auth/clerk-sync', { clerkId: 'user_x', email: 'fumee@resto.test' });
  verifier('connexion Clerk sans preuve d\'identité → 401, aucune session', clerk.status === 401 && !clerk.json?.token, `HTTP ${clerk.status}`);
  await appel('POST', '/api/auth/logout', undefined, session);
  verifier('après déconnexion, l\'ancien jeton est refusé', (await appel('GET', '/api/auth/me', undefined, session)).status === 401);
  serveur.close();
} catch (e) {
  verifier('essai de fumée exécuté jusqu\'au bout', false, String(e?.stack ?? e).slice(0, 600));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(echecs ? `\n✖ ${echecs} contrôle(s) en échec : le bundle ne doit pas être déployé.` : '\n✓ le bundle serverless démarre et répond correctement.');
process.exit(echecs ? 1 : 0);

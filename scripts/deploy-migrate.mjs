// Base de données et build Vercel — chantier P0.4.
//
// Avant : tout build disposant de DATABASE_URL (production ET prévisualisation) appliquait les
// migrations. Pousser une branche pouvait donc modifier le schéma de la base de production, sans
// revue et sans décision — et un retour arrière du code ne défaisait pas le schéma.
//
// Règle désormais appliquée :
//   1. un build de prévisualisation ne se connecte JAMAIS à la base désignée par DATABASE_URL.
//      Il ne regarde que PREVIEW_DATABASE_URL (base dédiée, forcément différente) ; sans elle,
//      aucune connexion ;
//   2. par défaut, un build CONTRÔLE en lecture seule. En production, si la base est en retard sur
//      le code, le build échoue : on ne met pas en ligne un code qui attend un schéma absent ;
//   3. les migrations ne sont appliquées que sur demande explicite : MIGRATE_ON_BUILD=apply posé
//      pour l'environnement concerné, ou `node scripts/deploy-migrate.mjs --apply` lancé à la main.
//
// SKIP_MIGRATE=1 coupe tout (ni contrôle ni application).
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const clean = (v) => { const s = (v ?? '').trim(); return s || undefined; };

/**
 * Décide ce que le build a le droit de faire avec la base. Fonction pure : testée sans base.
 * `target` désigne la base visée : 'production' (DATABASE_URL) ou 'preview' (PREVIEW_DATABASE_URL).
 * @param {NodeJS.ProcessEnv} env
 * @param {string[]} argv
 * @returns {{ action: 'skip' | 'check' | 'apply', reason: string, target?: 'production' | 'preview' | 'manuel' }}
 */
export function decideMigrationAction(env, argv = []) {
  const vercelEnv = env.VERCEL_ENV ?? null;
  const onVercel = !!env.VERCEL || !!vercelEnv;
  const wantsApply = argv.includes('--apply') || env.MIGRATE_ON_BUILD === 'apply';
  const prodUrl = clean(env.DATABASE_URL);

  if (env.SKIP_MIGRATE === '1') return { action: 'skip', reason: 'SKIP_MIGRATE=1 : aucune opération sur la base' };

  if (onVercel && vercelEnv === 'preview') {
    const previewUrl = clean(env.PREVIEW_DATABASE_URL);
    if (!previewUrl) return { action: 'skip', reason: 'build de prévisualisation sans PREVIEW_DATABASE_URL : aucune connexion à une base (DATABASE_URL est ignoré hors production)' };
    if (previewUrl === prodUrl) return { action: 'skip', reason: 'PREVIEW_DATABASE_URL est identique à DATABASE_URL : refusé, une prévisualisation ne touche pas la base de production' };
    return wantsApply
      ? { action: 'apply', target: 'preview', reason: 'MIGRATE_ON_BUILD=apply : migrations appliquées à la base de PRÉVISUALISATION' }
      : { action: 'check', target: 'preview', reason: 'contrôle en lecture seule de la base de prévisualisation (MIGRATE_ON_BUILD=apply pour appliquer)' };
  }
  if (onVercel && vercelEnv !== 'production') {
    return { action: 'skip', reason: `build Vercel « ${vercelEnv ?? 'environnement inconnu'} » : aucune connexion à la base hors production` };
  }
  if (!prodUrl) return { action: 'skip', reason: 'DATABASE_URL absent : rien à contrôler' };
  const target = onVercel ? 'production' : 'manuel';
  if (wantsApply) return { action: 'apply', target, reason: onVercel ? 'MIGRATE_ON_BUILD=apply : application demandée pour ce déploiement de production' : 'application demandée explicitement (--apply)' };
  return { action: 'check', target, reason: 'contrôle en lecture seule (aucune écriture ; MIGRATE_ON_BUILD=apply pour appliquer)' };
}

const masked = (url) => url.replace(/:\/\/([^:/@]+):[^@]+@/, '://$1:***@');

function main() {
  const { action, reason, target } = decideMigrationAction(process.env, process.argv.slice(2));
  console.log(`[migrate] ${reason}`);
  if (action === 'skip') return 0;

  // La base visée est celle que `packages/db` choisira lui-même pour cet environnement
  // (PREVIEW_DATABASE_URL en prévisualisation, DATABASE_URL sinon) : on l'affiche, mot de passe masqué.
  const url = target === 'preview' ? process.env.PREVIEW_DATABASE_URL : process.env.DATABASE_URL;
  console.log(`[migrate] base : ${masked(url)}`);
  if (action === 'apply') {
    const r = spawnSync('npm', ['run', 'migrate', '-w', 'packages/db'], { stdio: 'inherit', env: process.env });
    return r.status ?? 1;
  }

  const r = spawnSync('npm', ['run', '--silent', 'migrate:status', '-w', 'packages/db'], { stdio: 'inherit', env: process.env });
  const code = r.status ?? 1;
  if (code === 0) return 0;
  if (code === 3 && target === 'preview') {
    // Une prévisualisation en retard n'engage personne : on prévient, l'API le signalera aussi (/api/status).
    console.warn('[migrate] ⚠ La base de prévisualisation est en retard sur ce code. Posez MIGRATE_ON_BUILD=apply (portée Preview) pour l\'aligner.');
    return 0;
  }
  if (code === 3) {
    console.error('[migrate] ✖ La base est en retard sur ce code : le déploiement est interrompu, la version en ligne reste en place.');
    console.error('[migrate]   Appliquez les migrations (opération autorisée et tracée), puis relancez le déploiement.');
    console.error('[migrate]   Pour les appliquer pendant ce build : variable MIGRATE_ON_BUILD=apply sur ce déploiement.');
    return 1;
  }
  if (code === 4) {
    // Base plus récente que le code, ou fichier de migration modifié après application : le schéma
    // n'est pas touché par ce build. On le signale sans bloquer (un retour arrière du code doit rester possible).
    console.warn('[migrate] ⚠ L\'historique de la base ne correspond pas exactement à ce code (voir la ligne ci-dessus). Aucune écriture n\'a été faite.');
    return 0;
  }
  if (target === 'preview') { console.warn('[migrate] ⚠ État de la base de prévisualisation illisible : le build continue, l\'API le signalera.'); return 0; }
  console.error('[migrate] ✖ Impossible de lire l\'état des migrations : déploiement interrompu par prudence.');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());

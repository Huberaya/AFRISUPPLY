// =============================================================
// AFRISUPPLY — socle de sécurité (chantier 2 de l'audit)
//
// Objectifs :
//   1. refuser de démarrer en production dans une configuration dangereuse
//      (secret JWT par défaut, base non persistée, restaurant de démonstration) ;
//   2. n'autoriser que les origines réellement connues en CORS (jamais « * » avec credentials) ;
//   3. imposer une politique de mot de passe minimale ;
//   4. distinguer « route inconnue » (404) de « non authentifié » (401).
// =============================================================

import { createHash, timingSafeEqual } from 'node:crypto';
import { getDatabaseUrl, databaseUnavailableReason, regionCheck } from '@afrisupply/db';
import { clerkConfigProblem, clerkKeyFacts } from './clerk-config.js';

const DEV_SECRETS = new Set([
  'dev-secret-change-me-in-production', 'dev-secret-local', 'test-secret', 'secret', 'changeme',
  'changez-moi-64-caracteres-aleatoires', 'change-me',
]);

export const isProd = (env: NodeJS.ProcessEnv = process.env) =>
  env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';

/** Problème d'un secret de signature de session, ou null s'il convient (≥ 32 caractères, pas une valeur d'exemple). */
export function jwtSecretProblem(raw: string | undefined): string | null {
  const secret = (raw ?? '').trim();
  if (!secret) return 'JWT_SECRET est absent : sans secret, les sessions ne peuvent pas être signées de façon sûre.';
  if (DEV_SECRETS.has(secret) || secret.length < 32) {
    return `JWT_SECRET est trop faible (${secret.length} caractères${DEV_SECRETS.has(secret) ? ', valeur de développement' : ''}) : utilisez au moins 32 caractères aléatoires (openssl rand -hex 32).`;
  }
  return null;
}

/** Adresses des exploitants de la plateforme (ADMIN_EMAILS), en minuscules. */
export const adminEmails = (env: NodeJS.ProcessEnv = process.env): string[] =>
  (env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

/** L'expéditeur est-il l'adresse d'essai du prestataire d'e-mails (remise limitée au titulaire du compte) ? */
export const usesTestSender = (from: string | undefined): boolean => /@resend\.dev\b/i.test(from ?? '');

export type ConfigCheck = { errors: string[]; warnings: string[] };

/**
 * Vérifie la configuration de démarrage. Fonction pure (testable) : ne journalise rien,
 * ne quitte pas le processus — c'est `enforceSecureConfig()` qui s'en charge.
 */
export function checkSecureConfig(env: NodeJS.ProcessEnv = process.env): ConfigCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const prod = isProd(env);

  const secretProblem = jwtSecretProblem(env.JWT_SECRET);
  if (secretProblem) {
    // Absent : toujours une erreur. Faible : bloquant en production, simple avertissement en développement.
    if (prod || !(env.JWT_SECRET ?? '').trim()) errors.push(secretProblem); else warnings.push(secretProblem);
  }

  // Base : `getDatabaseUrl` applique le cloisonnement des environnements (une prévisualisation Vercel
  // ne lit que PREVIEW_DATABASE_URL, jamais la base de production).
  if (prod && !getDatabaseUrl(env)) {
    errors.push(databaseUnavailableReason(env)
      ?? 'DATABASE_URL est absent en production : la base serait une base locale éphémère (données perdues à chaque déploiement).');
  }

  if (env.SEED_DEMO && env.SEED_DEMO !== 'false' && prod && env.ALLOW_DEMO_SEED !== 'true') {
    errors.push('SEED_DEMO (true/purge) en production créerait le restaurant de démonstration avec des identifiants publics (awa@chezawa.fr / demo1234). Retirez SEED_DEMO, ou assumez-le explicitement avec ALLOW_DEMO_SEED=true.');
  }

  if (prod && !env.CRON_SECRET?.trim()) warnings.push('CRON_SECRET absent : le job quotidien (mail du matin, rappels grossistes) répondra 503.');
  if (prod && !env.ADMIN_EMAILS?.trim()) warnings.push('ADMIN_EMAILS absent : aucune personne ne peut valider les fournisseurs plateforme ni voir les leads.');
  if (prod && env.VENDOR_AUTO_APPROVE === 'true') warnings.push('VENDOR_AUTO_APPROVE=true : tout fournisseur qui s’inscrit est publié sans vérification.');
  if (prod && !env.RESEND_API_KEY?.trim()) warnings.push('RESEND_API_KEY absent : les e-mails (réinitialisation de mot de passe incluse) ne partiront pas.');
  // Levée des réserves (chantier F) : avec l'adresse d'essai du prestataire, seuls les messages
  // adressés au titulaire du compte du prestataire sont remis — aucun client ne reçoit rien.
  if (prod && env.RESEND_API_KEY?.trim() && usesTestSender(env.MAIL_FROM)) {
    warnings.push('MAIL_FROM utilise l\'adresse d\'essai du prestataire d\'e-mails (…@resend.dev) : seuls les messages adressés au titulaire du compte du prestataire sont remis. Les clients ne reçoivent ni confirmation d\'adresse, ni mail du matin, ni alerte. Vérifiez un domaine d\'envoi chez le prestataire, puis renseignez MAIL_FROM avec une adresse de ce domaine.');
  }
  if (prod && !env.ALLOWED_ORIGINS?.trim() && !env.APP_URL?.trim()) warnings.push('ALLOWED_ORIGINS/APP_URL non définis : aucune origine tierce ne pourra appeler l’API (le site sur le même domaine fonctionne).');
  if (env.BILLING_ENFORCE === 'false' && env.STRIPE_SECRET_KEY?.trim()) warnings.push('BILLING_ENFORCE=false : la facturation Stripe est configurée mais non appliquée.');

  // Chantier P0.4 : fonctions loin de la base → chaque requête SQL paie un aller-retour entre deux
  // régions. Constaté en production : ~96 ms par requête, des écrans lents et une passe quotidienne
  // qui ne tient plus dans la durée d'une fonction.
  const regions = regionCheck(env);
  if (regions.voisines === false) {
    warnings.push(`Les fonctions s'exécutent en « ${regions.fonction} » alors que la base est en « ${regions.base} » : chaque requête SQL traverse la distance entre les deux régions. Région de fonctions conseillée : « ${regions.conseillee} » (vercel.json → "regions", ou Réglages du projet → Functions → Function Region).`);
  }

  // Clerk (chantier P0.2) : la connexion Clerk n'est acceptée que si le serveur peut la vérifier.
  const clerkSecret = env.CLERK_SECRET_KEY?.trim();
  const clerkPublic = (env.VITE_CLERK_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? env.CLERK_PUBLISHABLE_KEY)?.trim();
  if (prod && clerkPublic && !clerkSecret) warnings.push('Clé publique Clerk présente mais CLERK_SECRET_KEY absent : la connexion Clerk affichée par le site sera refusée par le serveur.');
  // Levée des réserves (chantier B) : des clés qui ne conviennent pas à l'environnement coupent la
  // connexion Clerk (lib/clerk-config.ts) ; l'avertissement dit pourquoi, sans jamais afficher une clé.
  const clerkProblem = clerkConfigProblem(env);
  if (clerkProblem) warnings.push(clerkProblem.message);
  const clerkFacts = clerkKeyFacts(env);
  for (const o of clerkFacts.others) {
    warnings.push(o.same
      ? `${o.variable} répète la clé Clerk du site : seule ${clerkFacts.site.variable} est lue. Variable à retirer.`
      : `${o.variable} porte une AUTRE clé Clerk que ${clerkFacts.site.variable}${o.frontendApi && clerkFacts.site.frontendApi ? ` (instances « ${o.frontendApi} » et « ${clerkFacts.site.frontendApi} »)` : ''} : seule ${clerkFacts.site.variable} est lue. Variable à retirer, après avoir vérifié laquelle est la bonne.`);
  }
  if (clerkFacts.site.variable && clerkFacts.site.variable !== 'VITE_CLERK_PUBLISHABLE_KEY') {
    warnings.push(`La clé Clerk du site est fournie par ${clerkFacts.site.variable}, que le site ne lit pas (il ne lit que VITE_CLERK_PUBLISHABLE_KEY, au build) : la connexion Clerk n'est pas proposée aux visiteurs.`);
  }
  if (prod && clerkSecret && !allowedOrigins(env).length && !env.CLERK_AUTHORIZED_PARTIES?.trim() && !env.VERCEL_PROJECT_PRODUCTION_URL?.trim() && !env.VERCEL_URL?.trim()) {
    warnings.push('Clerk est configuré sans origine autorisée (APP_URL, ALLOWED_ORIGINS ou CLERK_AUTHORIZED_PARTIES) : toute connexion Clerk sera refusée.');
  }

  return { errors, warnings };
}

/** Journalise la configuration puis coupe le démarrage si elle est dangereuse. */
export function enforceSecureConfig(env: NodeJS.ProcessEnv = process.env, log: Pick<Console, 'log' | 'warn' | 'error'> = console): void {
  const { errors, warnings } = checkSecureConfig(env);
  for (const w of warnings) log.warn(`[config] ⚠️  ${w}`);
  if (errors.length) {
    log.error('[config] 🛑 Démarrage refusé — configuration non sûre :');
    for (const e of errors) log.error(`[config]   • ${e}`);
    log.error('[config] Corrigez ces variables (voir .env.example), ou démarrez en développement (NODE_ENV=development).');
    if (isProd(env) && env.ALLOW_INSECURE_CONFIG !== 'true') throw new Error('Configuration non sûre : démarrage refusé.');
  }
}

/** Comparaison de deux secrets à temps constant (aucune fuite par le temps de réponse). */
export function sameSecret(given: string | undefined | null, expected: string | undefined | null): boolean {
  if (!given || !expected) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Secret des tâches planifiées présenté par une requête : en-tête `X-Cron-Secret`,
 * `Authorization: Bearer …` (convention des crons Vercel) ou paramètre `?secret=`.
 * Renvoie « absent » (CRON_SECRET non configuré), « refuse » ou « ok ».
 */
export function cronSecretCheck(headers: { cron?: string; authorization?: string }, querySecret: string | undefined, env: NodeJS.ProcessEnv = process.env): 'absent' | 'refuse' | 'ok' {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) return 'absent';
  const given = headers.cron ?? (headers.authorization?.startsWith('Bearer ') ? headers.authorization.slice(7) : undefined) ?? querySecret;
  return sameSecret(given, secret) ? 'ok' : 'refuse';
}

/**
 * La configuration interdit-elle de servir ? Même règle que `enforceSecureConfig`, pour un
 * environnement qui ne peut pas « refuser de démarrer » (fonction serverless) : il refuse de répondre.
 */
export function configGateState(env: NodeJS.ProcessEnv = process.env): { blocked: boolean; errors: string[] } {
  const { errors } = checkSecureConfig(env);
  return { blocked: isProd(env) && errors.length > 0 && env.ALLOW_INSECURE_CONFIG !== 'true', errors };
}

// -------------------------------------------------------------
// CORS : liste blanche explicite (jamais « * » avec credentials)
// -------------------------------------------------------------
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const list = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  const app = env.APP_URL?.trim().replace(/\/$/, '');
  if (app && app !== '*') list.push(app);
  if (!isProd(env)) list.push('http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173');
  return [...new Set(list)];
}

/**
 * Renvoie l'origine à autoriser, ou `undefined` si elle n'est pas dans la liste.
 * Une requête sans en-tête `Origin` (même origine, outillage serveur) n'a pas besoin d'en-tête CORS.
 */
export function resolveCorsOrigin(origin: string | undefined, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!origin) return undefined;
  const list = allowedOrigins(env);
  return list.includes(origin.replace(/\/$/, '')) ? origin : undefined;
}

// -------------------------------------------------------------
// Politique de mot de passe
// -------------------------------------------------------------
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'motdepasse', 'motdepasse1',
  'azerty123', 'qwerty123', 'demo1234', 'afrisupply', 'iloveyou', 'soleil123', 'restaurant',
]);

export const PASSWORD_MIN_LENGTH = Number(process.env.PASSWORD_MIN_LENGTH ?? 8);

/** Renvoie le problème à corriger, ou null si le mot de passe convient. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN_LENGTH) return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return 'Ce mot de passe est trop courant : choisissez-en un autre (par exemple trois mots qui n’ont rien à voir entre eux).';
  if (/^(.)\1+$/.test(pw)) return 'Ce mot de passe est une répétition : choisissez-en un autre.';
  if (/^\d+$/.test(pw)) return 'Un mot de passe uniquement composé de chiffres est trop facile à deviner.';
  return null;
}

// -------------------------------------------------------------
// Routes connues : distinguer 404 (route inexistante) de 401 (non authentifié)
// -------------------------------------------------------------
let knownMatchers: RegExp[] | null = null;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function setKnownRoutes(paths: string[]): void {
  knownMatchers = paths.map((p) => {
    if (p.includes('*')) return /.*/;                       // route générique : on ne conclut pas
    // Chantier P0.3 : seuls les segments LITTÉRAUX sont échappés. Avant, le motif « [^/]+ » d'un
    // paramètre l'était aussi et ne correspondait plus à rien : toute route à paramètre passait pour
    // inconnue, et une requête sans session y recevait 404 « Route inconnue » au lieu de 401.
    const re = '/' + p.split('/').filter(Boolean)
      .map((seg) => (seg.startsWith(':') ? '[^/]+' : escapeRe(seg)))
      .join('/') + '/?';
    return new RegExp(`^${re}$`);
  });
}

/** Vrai si le chemin correspond à une route déclarée (ou si le registre n'est pas encore prêt). */
export function isKnownPath(path: string): boolean {
  if (!knownMatchers) return true;
  return knownMatchers.some((r) => r.test(path.replace(/\/$/, '') || '/'));
}

// -------------------------------------------------------------
// Modèle de rôles (appliqué par les routeurs)
// -------------------------------------------------------------
export const ROLE_RANK: Record<string, number> = { staff: 1, manager: 2, owner: 3 };
export const roleAtLeast = (role: string | undefined, min: 'staff' | 'manager' | 'owner') =>
  (ROLE_RANK[role ?? ''] ?? 0) >= ROLE_RANK[min];

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

const DEV_SECRETS = new Set([
  'dev-secret-change-me-in-production', 'dev-secret-local', 'test-secret', 'secret', 'changeme',
  'changez-moi-64-caracteres-aleatoires', 'change-me',
]);

export const isProd = (env: NodeJS.ProcessEnv = process.env) =>
  env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';

export type ConfigCheck = { errors: string[]; warnings: string[] };

/**
 * Vérifie la configuration de démarrage. Fonction pure (testable) : ne journalise rien,
 * ne quitte pas le processus — c'est `enforceSecureConfig()` qui s'en charge.
 */
export function checkSecureConfig(env: NodeJS.ProcessEnv = process.env): ConfigCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const prod = isProd(env);

  const secret = (env.JWT_SECRET ?? '').trim();
  if (!secret) {
    errors.push('JWT_SECRET est absent : sans secret, les sessions ne peuvent pas être signées de façon sûre.');
  } else if (DEV_SECRETS.has(secret) || secret.length < 32) {
    const msg = `JWT_SECRET est trop faible (${secret.length} caractères${DEV_SECRETS.has(secret) ? ', valeur de développement' : ''}) : utilisez au moins 32 caractères aléatoires (openssl rand -hex 32).`;
    if (prod) errors.push(msg); else warnings.push(msg);
  }

  if (prod && !env.DATABASE_URL?.trim()) {
    errors.push('DATABASE_URL est absent en production : la base serait une base locale éphémère (données perdues à chaque déploiement).');
  }

  if (env.SEED_DEMO && env.SEED_DEMO !== 'false' && prod && env.ALLOW_DEMO_SEED !== 'true') {
    errors.push('SEED_DEMO (true/purge) en production créerait le restaurant de démonstration avec des identifiants publics (awa@chezawa.fr / demo1234). Retirez SEED_DEMO, ou assumez-le explicitement avec ALLOW_DEMO_SEED=true.');
  }

  if (prod && !env.CRON_SECRET?.trim()) warnings.push('CRON_SECRET absent : le job quotidien (mail du matin, rappels grossistes) répondra 503.');
  if (prod && !env.ADMIN_EMAILS?.trim()) warnings.push('ADMIN_EMAILS absent : aucune personne ne peut valider les fournisseurs plateforme ni voir les leads.');
  if (prod && env.VENDOR_AUTO_APPROVE === 'true') warnings.push('VENDOR_AUTO_APPROVE=true : tout fournisseur qui s’inscrit est publié sans vérification.');
  if (prod && !env.RESEND_API_KEY?.trim()) warnings.push('RESEND_API_KEY absent : les e-mails (réinitialisation de mot de passe incluse) ne partiront pas.');
  if (prod && !env.ALLOWED_ORIGINS?.trim() && !env.APP_URL?.trim()) warnings.push('ALLOWED_ORIGINS/APP_URL non définis : aucune origine tierce ne pourra appeler l’API (le site sur le même domaine fonctionne).');
  if (env.BILLING_ENFORCE === 'false' && env.STRIPE_SECRET_KEY?.trim()) warnings.push('BILLING_ENFORCE=false : la facturation Stripe est configurée mais non appliquée.');

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
    const re = '/' + p.split('/').filter(Boolean)
      .map((seg) => (seg.startsWith(':') ? '[^/]+' : seg.replace(/[:*]/g, '')))
      .map(escapeRe).join('/') + '/?';
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

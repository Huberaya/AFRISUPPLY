// =============================================================
// Clerk — cohérence des clés avec l'environnement (levée des réserves, chantier B)
//
// Clerk fournit deux sortes d'instances : développement (clés `pk_test_` / `sk_test_`) et production
// (`pk_live_` / `sk_live_`). Une instance de développement n'est pas faite pour accueillir des
// clients (sessions de développement, adresses de test acceptées, plafond d'utilisateurs).
//
// Règles appliquées par le serveur, sans dépendre de ce qui est saisi chez l'hébergeur :
//   1. en production, des clés de développement ne sont JAMAIS utilisées : la connexion Clerk est
//      coupée (la connexion par e-mail et mot de passe reste disponible) ;
//   2. une prévisualisation n'utilise jamais les clés de l'instance de production ;
//   3. clé du site et clé du serveur doivent être de la même sorte.
// Fonctions pures : aucune clé n'est journalisée ni renvoyée, seulement sa sorte et, pour la clé du
// site (publique par nature), le domaine de l'instance qu'elle désigne.
// =============================================================
import { deploymentKind, type DeploymentKind } from './environment.js';

export type ClerkKeyMode = 'test' | 'live';

const clean = (v: string | undefined) => { const s = v?.trim(); return s ? s : undefined; };

/** Variables qui peuvent porter la clé du site, dans l'ordre où le serveur les lit. Le SITE, lui, ne lit que la première. */
export const SITE_KEY_VARIABLES = ['VITE_CLERK_PUBLISHABLE_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_PUBLISHABLE_KEY'] as const;
export type SiteKeyVariable = (typeof SITE_KEY_VARIABLES)[number];

/**
 * Ce que dit une clé du site (« publishable key ») : sa sorte et le domaine de l'instance.
 * Format : `pk_test_` ou `pk_live_`, suivi du domaine de l'instance encodé en base64 et terminé par « $ ».
 */
export function publishableKeyFacts(raw: string | undefined): { mode: ClerkKeyMode | null; frontendApi: string | null } {
  const key = clean(raw) ?? '';
  const m = /^pk_(test|live)_(.+)$/.exec(key);
  if (!m) return { mode: null, frontendApi: null };
  let host: string | null = null;
  try {
    const decoded = Buffer.from(m[2], 'base64').toString('utf8');
    const h = decoded.endsWith('$') ? decoded.slice(0, -1) : '';
    if (/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(h) && h.includes('.')) host = h.toLowerCase();
  } catch { /* clé illisible : sorte connue, domaine inconnu */ }
  return { mode: m[1] as ClerkKeyMode, frontendApi: host };
}

/** Sorte d'une clé du serveur (« secret key »), lue sur son seul préfixe. */
export function secretKeyMode(raw: string | undefined): ClerkKeyMode | null {
  const key = clean(raw) ?? '';
  return key.startsWith('sk_test_') ? 'test' : key.startsWith('sk_live_') ? 'live' : null;
}

export type ClerkKeyFacts = {
  kind: DeploymentKind;
  /** Clé du site réellement retenue par le serveur (la première variable renseignée). */
  site: { variable: SiteKeyVariable | null; mode: ClerkKeyMode | null; frontendApi: string | null };
  /** Autres variables de clé du site renseignées : le site ne les lit pas. `same` : même valeur que la clé retenue. */
  others: { variable: SiteKeyVariable; mode: ClerkKeyMode | null; frontendApi: string | null; same: boolean }[];
  server: { present: boolean; mode: ClerkKeyMode | null };
  jwtKey: boolean;
};

export function clerkKeyFacts(env: NodeJS.ProcessEnv = process.env): ClerkKeyFacts {
  const set = SITE_KEY_VARIABLES.map((variable) => ({ variable, value: clean(env[variable]) })).filter((x): x is { variable: SiteKeyVariable; value: string } => !!x.value);
  const used = set[0] ?? null;
  return {
    kind: deploymentKind(env),
    site: used ? { variable: used.variable, ...publishableKeyFacts(used.value) } : { variable: null, mode: null, frontendApi: null },
    others: set.slice(1).map((x) => ({ variable: x.variable, ...publishableKeyFacts(x.value), same: x.value === used!.value })),
    server: { present: !!clean(env.CLERK_SECRET_KEY), mode: secretKeyMode(env.CLERK_SECRET_KEY) },
    jwtKey: !!clean(env.CLERK_JWT_KEY),
  };
}

export type ClerkConfigProblem = { code: 'clerk_dev_instance_in_production' | 'clerk_live_instance_in_preview' | 'clerk_keys_mismatch' | 'clerk_key_unrecognized'; message: string };

/**
 * Raison pour laquelle la connexion Clerk doit rester coupée dans cet environnement, ou null.
 * Sans clé de serveur, il n'y a rien à refuser : Clerk n'est simplement pas configuré.
 */
export function clerkConfigProblem(env: NodeJS.ProcessEnv = process.env): ClerkConfigProblem | null {
  const f = clerkKeyFacts(env);
  if (!f.server.present) return null;
  if (f.kind !== 'development' && f.server.mode === null) {
    return { code: 'clerk_key_unrecognized', message: 'CLERK_SECRET_KEY ne ressemble pas à une clé Clerk (préfixe sk_test_ ou sk_live_ attendu) : connexion Clerk coupée.' };
  }
  if (f.site.mode && f.server.mode && f.site.mode !== f.server.mode) {
    return { code: 'clerk_keys_mismatch', message: `La clé Clerk du site (${f.site.variable}) et CLERK_SECRET_KEY ne sont pas de la même sorte (${f.site.mode === 'test' ? 'développement' : 'production'} / ${f.server.mode === 'test' ? 'développement' : 'production'}) : elles ne peuvent pas appartenir à la même instance. Connexion Clerk coupée.` };
  }
  const modes = [f.site.mode, f.server.mode];
  if (f.kind === 'production' && modes.includes('test')) {
    return { code: 'clerk_dev_instance_in_production', message: 'Clés Clerk de développement (pk_test_ / sk_test_) en production : connexion Clerk coupée. Elle sera rétablie avec les clés d\'une instance Clerk de production (pk_live_ / sk_live_). La connexion par e-mail et mot de passe n\'est pas touchée.' };
  }
  if (f.kind === 'preview' && modes.includes('live')) {
    return { code: 'clerk_live_instance_in_preview', message: 'Clés Clerk de production (pk_live_ / sk_live_) sur une prévisualisation : connexion Clerk coupée. Une prévisualisation utilise les clés de l\'instance de développement.' };
  }
  return null;
}

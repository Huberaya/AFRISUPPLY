// =============================================================
// Clerk — vérification des identités CÔTÉ SERVEUR (chantier P0.2)
//
// Règle unique : l'identité d'une personne connectée par Clerk vient d'un jeton de session signé
// par Clerk et vérifié ici (signature, expiration, origine autorisée), puis de la fiche utilisateur
// lue chez Clerk avec la clé secrète du serveur. Rien de ce que le navigateur déclare
// (identifiant, adresse e-mail, nom) n'est une source d'identité.
//
// Tout échec ferme la porte : sans clé secrète, sans origine autorisée, si Clerk ne répond pas ou
// si l'adresse n'est pas vérifiée, aucune session n'est ouverte.
// =============================================================
import { createClerkClient, verifyToken, type ClerkClient } from '@clerk/backend';
import { allowedOrigins, isProd } from './security.js';
import { clerkConfigProblem, clerkKeyFacts, type ClerkConfigProblem, type ClerkKeyFacts } from './clerk-config.js';

export type ClerkIdentity = {
  /** Identifiant Clerk de la personne (revendication `sub` du jeton vérifié). */
  clerkId: string;
  /** Adresse e-mail principale chez Clerk, en minuscules. */
  email: string;
  /** L'adresse principale a-t-elle été vérifiée par Clerk ? */
  emailVerified: boolean;
  fullName: string | null;
  phone: string | null;
};

/** Refus d'authentification Clerk : `status` et `code` sont renvoyés tels quels au client. */
export class ClerkAuthError extends Error {
  constructor(readonly status: 401 | 403 | 503, readonly code: string, message: string) {
    super(message); this.name = 'ClerkAuthError';
  }
}

const clean = (v: string | undefined) => { const s = v?.trim(); return s ? s : undefined; };

export function clerkSettings(env: NodeJS.ProcessEnv = process.env) {
  const secretKey = clean(env.CLERK_SECRET_KEY);
  // Clé publique PEM de l'instance (vérification sans appel réseau). Les retours à la ligne peuvent
  // avoir été saisis sous la forme « \n » dans l'interface de l'hébergeur.
  const jwtKey = clean(env.CLERK_JWT_KEY)?.replace(/\\n/g, '\n');
  const publishableKey = clean(env.VITE_CLERK_PUBLISHABLE_KEY) ?? clean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) ?? clean(env.CLERK_PUBLISHABLE_KEY);
  // Adresse de l'API Clerk : modifiable uniquement hors production (tests avec un faux service).
  const apiUrl = isProd(env) ? undefined : clean(env.CLERK_API_URL);
  // Levée des réserves (chantier B) : des clés qui ne conviennent pas à l'environnement (instance de
  // développement en production, instance de production sur une prévisualisation, clés de deux
  // sortes) coupent la connexion Clerk — comme si elle n'était pas configurée.
  const problem = secretKey ? clerkConfigProblem(env) : null;
  return { secretKey, jwtKey, publishableKey, apiUrl, problem, enabled: !!secretKey && !problem };
}

/** Clerk est-il utilisable par le serveur ? (la clé publique seule ne suffit pas) */
export const clerkEnabled = (env: NodeJS.ProcessEnv = process.env) => clerkSettings(env).enabled;

/**
 * Origines autorisées à présenter un jeton Clerk (revendication `azp`).
 * Sans cette liste, un jeton obtenu par un autre site branché sur la même instance Clerk serait accepté.
 */
export function clerkAuthorizedParties(env: NodeJS.ProcessEnv = process.env): string[] {
  const list = new Set(allowedOrigins(env));
  for (const p of (env.CLERK_AUTHORIZED_PARTIES ?? '').split(',')) { const s = p.trim().replace(/\/$/, ''); if (s) list.add(s); }
  // Domaines attribués par la plateforme d'hébergement (un tiers ne peut pas les choisir).
  const host = (h: string | undefined) => { const s = clean(h); if (s) list.add(`https://${s.replace(/^https?:\/\//, '').replace(/\/$/, '')}`); };
  if (env.VERCEL_ENV === 'production') host(env.VERCEL_PROJECT_PRODUCTION_URL);
  if (env.VERCEL_ENV === 'preview') { host(env.VERCEL_URL); host(env.VERCEL_BRANCH_URL); }
  return [...list];
}

let cached: { key: string; client: ClerkClient } | null = null;
function client(s: ReturnType<typeof clerkSettings>): ClerkClient {
  const key = `${s.secretKey}|${s.apiUrl ?? ''}`;
  if (!cached || cached.key !== key) cached = { key, client: createClerkClient({ secretKey: s.secretKey, publishableKey: s.publishableKey, ...(s.apiUrl ? { apiUrl: s.apiUrl } : {}) }) };
  return cached.client;
}

/**
 * Délai maximal accordé au service d'identité (chantier P0.4). La bibliothèque Clerk n'en fixe pas :
 * si Clerk ne répond pas, la connexion resterait suspendue jusqu'à la durée maximale de la fonction
 * (60 s). Au-delà du délai, on répond 503 « momentanément indisponible » — et aucune session n'est ouverte.
 */
export const clerkTimeoutMs = (env: NodeJS.ProcessEnv = process.env) => { const v = Number(env.CLERK_TIMEOUT_MS); return Number.isFinite(v) && v > 0 ? v : 8_000; };
class DelaiDepasse extends Error { constructor() { super('le service d\'identité n\'a pas répondu dans le délai imparti'); this.name = 'DelaiDepasse'; } }
const avecDelai = <T>(p: Promise<T>, ms: number): Promise<T> => new Promise<T>((ok, ko) => {
  const t = setTimeout(() => ko(new DelaiDepasse()), ms);
  p.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); ko(e); });
});

/** Motifs d'échec qui viennent du serveur ou du réseau (clé absente, Clerk injoignable), pas du jeton. */
const SERVER_SIDE_REASONS = /^(jwk-remote-failed-to-load|jwk-remote-invalid|jwk-failed-to-resolve|jwk-local-missing|secret-key-invalid)$/;

/**
 * Vérifie un jeton de session Clerk et renvoie l'identifiant de la personne.
 * Contrôles : signature (clé de l'instance), expiration, origine autorisée (`azp`), session active.
 */
export async function verifyClerkSessionToken(token: string, env: NodeJS.ProcessEnv = process.env): Promise<{ clerkId: string; sessionId: string | null }> {
  const s = clerkSettings(env);
  if (s.problem) throw new ClerkAuthError(503, s.problem.code, 'La connexion par Clerk n\'est pas disponible sur ce serveur. Utilisez votre e-mail et votre mot de passe.');
  if (!s.enabled) throw new ClerkAuthError(503, 'clerk_not_configured', 'La connexion par Clerk n\'est pas configurée sur ce serveur.');
  const parties = clerkAuthorizedParties(env);
  if (!parties.length) throw new ClerkAuthError(503, 'clerk_misconfigured', 'La connexion par Clerk est mal configurée (aucune origine autorisée : APP_URL ou CLERK_AUTHORIZED_PARTIES).');

  let payload: Awaited<ReturnType<typeof verifyToken>>;
  try {
    payload = await avecDelai(verifyToken(token, { secretKey: s.secretKey, jwtKey: s.jwtKey, authorizedParties: parties, clockSkewInMs: 5_000, ...(s.apiUrl ? { apiUrl: s.apiUrl } : {}) }), clerkTimeoutMs(env));
  } catch (e) {
    const reason = e instanceof DelaiDepasse ? 'jwk-remote-failed-to-load' : String((e as { reason?: string }).reason ?? '');
    if (SERVER_SIDE_REASONS.test(reason)) {
      console.error('[clerk] vérification du jeton impossible côté serveur :', reason);
      throw new ClerkAuthError(503, 'clerk_unreachable', 'Le service d\'identité est momentanément indisponible. Réessayez dans un instant.');
    }
    if (reason === 'token-invalid-authorized-parties') throw new ClerkAuthError(401, 'clerk_origin_refused', 'Cette session Clerk ne provient pas d\'une origine autorisée.');
    throw new ClerkAuthError(401, 'clerk_token_invalid', 'Session Clerk invalide ou expirée : reconnectez-vous.');
  }

  const claims = payload as { sub?: unknown; azp?: unknown; sid?: unknown; sts?: unknown };
  const sub = typeof claims.sub === 'string' ? claims.sub : '';
  if (!sub) throw new ClerkAuthError(401, 'clerk_token_invalid', 'Session Clerk invalide : reconnectez-vous.');
  // Contrôle répété ici pour ne pas dépendre du comportement de la bibliothèque : l'origine est obligatoire.
  const azp = typeof claims.azp === 'string' ? claims.azp.replace(/\/$/, '') : '';
  if (!azp || !parties.includes(azp)) throw new ClerkAuthError(401, 'clerk_origin_refused', 'Cette session Clerk ne provient pas d\'une origine autorisée.');
  if (typeof claims.sts === 'string' && claims.sts !== 'active') throw new ClerkAuthError(401, 'clerk_session_pending', 'Votre connexion Clerk n\'est pas terminée.');
  return { clerkId: sub, sessionId: typeof claims.sid === 'string' ? claims.sid : null };
}

/** Lit la fiche de la personne chez Clerk (clé secrète du serveur) : adresse principale et son état de vérification. */
export async function fetchClerkIdentity(clerkId: string, env: NodeJS.ProcessEnv = process.env): Promise<ClerkIdentity> {
  const s = clerkSettings(env);
  if (!s.enabled) throw new ClerkAuthError(503, 'clerk_not_configured', 'La connexion par Clerk n\'est pas configurée sur ce serveur.');
  let u: Awaited<ReturnType<ClerkClient['users']['getUser']>>;
  try {
    u = await avecDelai(client(s).users.getUser(clerkId), clerkTimeoutMs(env));
  } catch (e) {
    const status = Number((e as { status?: number }).status ?? 0);
    if (status === 404) throw new ClerkAuthError(401, 'clerk_user_unknown', 'Compte Clerk introuvable : reconnectez-vous.');
    console.error('[clerk] lecture de la fiche impossible :', status || (e as Error).message);
    throw new ClerkAuthError(503, 'clerk_unreachable', 'Le service d\'identité est momentanément indisponible. Réessayez dans un instant.');
  }
  if (u.banned || u.locked) throw new ClerkAuthError(403, 'clerk_user_blocked', 'Ce compte Clerk est suspendu.');
  const primary = u.emailAddresses.find((a) => a.id === u.primaryEmailAddressId) ?? null;
  if (!primary?.emailAddress) throw new ClerkAuthError(403, 'clerk_email_required', 'Votre compte Clerk n\'a pas d\'adresse e-mail principale.');
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.username || null;
  const phone = u.phoneNumbers.find((p) => p.id === u.primaryPhoneNumberId)?.phoneNumber ?? null;
  return { clerkId: u.id, email: primary.emailAddress.toLowerCase(), emailVerified: primary.verification?.status === 'verified', fullName: name, phone };
}

/** Identité Clerk prouvée d'une requête : jeton dans l'en-tête `Authorization: Bearer`, jamais dans le corps. */
export async function clerkIdentityFromRequest(req: Request, env: NodeJS.ProcessEnv = process.env): Promise<ClerkIdentity> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new ClerkAuthError(401, 'clerk_token_required', 'Jeton de session Clerk requis.');
  const { clerkId } = await verifyClerkSessionToken(token, env);
  return fetchClerkIdentity(clerkId, env);
}

// -------------------------------------------------------------
// Diagnostic (levée des réserves, chantier B) — réservé à l'exploitant.
// Répond, sans afficher aucune clé, aux questions qu'on ne peut pas trancher en lisant les variables :
// quelles clés sont en place, de quelle sorte, pour quelle instance — et la clé du site et la clé du
// serveur appartiennent-elles à la MÊME instance ?
// -------------------------------------------------------------
export type ClerkDiagnostic = ClerkKeyFacts & {
  enabled: boolean;
  problem: ClerkConfigProblem | null;
  authorizedParties: string[];
  /**
   * Identifiants d'instance (« kid » des clés de signature) vus des deux côtés : par le domaine que
   * désigne la clé du site (public) et par l'API Clerk interrogée avec la clé du serveur.
   * `same` : true = même instance ; false = deux instances différentes ; null = comparaison impossible.
   */
  instance: { site: string[] | null; server: string[] | null; same: boolean | null; detail: string | null };
};

async function kids(url: string, headers: Record<string, string>, ms: number): Promise<string[]> {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const body = await r.json() as { keys?: { kid?: unknown }[] };
  return (body.keys ?? []).map((k) => String(k.kid ?? '')).filter(Boolean).sort();
}

export async function clerkDiagnostic(env: NodeJS.ProcessEnv = process.env): Promise<ClerkDiagnostic> {
  const facts = clerkKeyFacts(env);
  const s = clerkSettings(env);
  const instance: ClerkDiagnostic['instance'] = { site: null, server: null, same: null, detail: null };
  const ms = Math.min(clerkTimeoutMs(env), 8_000);
  const errors: string[] = [];
  // Adresses de Clerk : modifiables uniquement hors production (tests avec un faux service).
  const frontendBase = (!isProd(env) && clean(env.CLERK_FRONTEND_API_URL)) || (facts.site.frontendApi ? `https://${facts.site.frontendApi}` : null);
  const apiBase = s.apiUrl ?? 'https://api.clerk.com';
  await Promise.all([
    (async () => {
      if (!frontendBase) { errors.push('clé du site absente ou illisible'); return; }
      try { instance.site = await kids(`${frontendBase.replace(/\/$/, '')}/.well-known/jwks.json`, {}, ms); } catch (e) { errors.push(`instance de la clé du site injoignable (${(e as Error).message})`); }
    })(),
    (async () => {
      if (!s.secretKey) { errors.push('CLERK_SECRET_KEY absente'); return; }
      try { instance.server = await kids(`${apiBase.replace(/\/$/, '')}/v1/jwks`, { authorization: `Bearer ${s.secretKey}` }, ms); } catch (e) { errors.push(`API Clerk refusée ou injoignable avec la clé du serveur (${(e as Error).message})`); }
    })(),
  ]);
  if (instance.site && instance.server) instance.same = instance.site.length > 0 && instance.site.some((k) => instance.server!.includes(k));
  instance.detail = errors.length ? errors.join(' ; ') : null;
  return { ...facts, enabled: s.enabled, problem: s.problem, authorizedParties: clerkAuthorizedParties(env), instance };
}

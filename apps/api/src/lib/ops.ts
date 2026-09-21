// Exploitation : remontée d'erreurs (Sentry via API HTTP, zéro dépendance), rate limiting, en-têtes de sécurité, audit.
import type { Context, MiddlewareHandler, Next } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { sql } from 'drizzle-orm';
import { getDb, auditLog, rateLimits } from '@afrisupply/db';

// ---------- Sentry (envelope API) ----------
function parseDsn(dsn: string) {
  const u = new URL(dsn); const projectId = u.pathname.replace(/^\//, '');
  return { key: u.username, host: u.host, projectId, endpoint: `${u.protocol}//${u.host}/api/${projectId}/envelope/` };
}
export const sentryEnabled = () => !!process.env.SENTRY_DSN;

/** Envoie une exception à Sentry (fire-and-forget, jamais bloquant, jamais throw). */
export async function captureException(err: unknown, ctx: { route?: string; method?: string; userEmail?: string; restaurantId?: string; extra?: Record<string, unknown> } = {}) {
  const dsn = process.env.SENTRY_DSN; if (!dsn) return;
  try {
    const { key, endpoint } = parseDsn(dsn);
    const e = err instanceof Error ? err : new Error(String(err));
    const frames = (e.stack ?? '').split('\n').slice(1).map((l) => l.trim()).filter(Boolean).reverse().map((l) => ({ function: l.replace(/^at\s+/, '') }));
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const event = {
      event_id: eventId, timestamp: new Date().toISOString(), platform: 'node', level: 'error',
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development', release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
      server_name: process.env.VERCEL_REGION ?? 'local', transaction: ctx.route ? `${ctx.method ?? ''} ${ctx.route}`.trim() : undefined,
      exception: { values: [{ type: e.name, value: e.message, stacktrace: frames.length ? { frames } : undefined }] },
      user: ctx.userEmail ? { email: ctx.userEmail } : undefined, tags: { restaurantId: ctx.restaurantId ?? 'none' }, extra: ctx.extra,
    };
    const envelope = `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`;
    await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${key}, sentry_client=afrisupply/1.0` }, body: envelope, signal: AbortSignal.timeout(3000) });
  } catch { /* la télémétrie ne doit jamais casser une requête */ }
}

// ---------- Rate limiting (Postgres PARTAGÉ entre instances — audit Chantier 5 / S1, B7) ----------
// Un compteur mémoire se contourne en serverless : chaque instance froide redémarre avec son
// propre compteur. Les compteurs vivent dans la table `rate_limits` (UPSERT incrémental atomique,
// fenêtre à l'horloge de la base). Repli mémoire uniquement si la base est injoignable : la
// limitation ne doit jamais servir de point de défaillance.
const memBuckets = new Map<string, { n: number; reset: number }>();

async function bumpCounter(key: string, windowMs: number): Promise<{ n: number; resetMs: number }> {
  const db = await getDb();
  const iso = new Date(Date.now() + windowMs).toISOString();
  const res = await db.execute(sql`
    INSERT INTO rate_limits (key, n, reset_at) VALUES (${key}, 1, ${iso}::timestamptz)
    ON CONFLICT (key) DO UPDATE SET
      n = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.n + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= now() THEN ${iso}::timestamptz ELSE rate_limits.reset_at END
    RETURNING n, reset_at`);
  const row = (res.rows ?? [])[0] as { n: number | string; reset_at: Date | string } | undefined;
  if (!row) throw new Error('rate_limits: RETURNING vide');
  // purge opportuniste des fenêtres expirées (~1 % des requêtes limitées, jamais bloquant)
  if (Math.random() < 0.01) { try { await db.execute(sql`DELETE FROM rate_limits WHERE reset_at <= now()`); } catch { /* rien */ } }
  return { n: Number(row.n), resetMs: new Date(row.reset_at).getTime() };
}

/**
 * Adresse client fiable. `X-Forwarded-For` n'est utilisé que si l'on est réellement derrière un proxy
 * (Vercel, ou TRUST_PROXY=true) : sinon n'importe qui pourrait contourner la limitation en changeant l'en-tête.
 */
export function clientIp(c: Context): string {
  const trustProxy = process.env.TRUST_PROXY === 'true' || !!process.env.VERCEL;
  const xff = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  if (trustProxy && xff) return xff;
  try { const addr = getConnInfo(c)?.remote?.address; if (addr) return addr; } catch { /* contexte sans socket (tests) */ }
  return xff ?? c.req.header('x-real-ip') ?? 'local';
}

export function rateLimit(opts: { windowMs: number; max: number; key?: (c: Context) => string }): MiddlewareHandler {
  return async (c, next) => {
    const ip = clientIp(c);
    const k = `${opts.key ? opts.key(c) : c.req.path}:${ip}`;
    let n: number; let resetMs: number;
    try {
      ({ n, resetMs } = await bumpCounter(k, opts.windowMs));
    } catch {
      // Repli mémoire (incident base ponctuel / dev sans base) : limite au niveau de l'instance.
      const now = Date.now();
      let b = memBuckets.get(k); if (!b || b.reset < now) { b = { n: 0, reset: now + opts.windowMs }; memBuckets.set(k, b); }
      b.n += 1;
      if (memBuckets.size > 20_000) memBuckets.clear();
      n = b.n; resetMs = b.reset;
    }
    c.header('X-RateLimit-Limit', String(opts.max)); c.header('X-RateLimit-Remaining', String(Math.max(0, opts.max - n)));
    if (n > opts.max) { c.header('Retry-After', String(Math.max(1, Math.ceil((resetMs - Date.now()) / 1000)))); return c.json({ error: 'Trop de tentatives, réessayez dans une minute.' }, 429); }
    await next();
  };
}
/** Purge les compteurs (mémoire + table) — utilisé par les tests entre deux scénarios. */
export const _resetRateLimits = async () => {
  memBuckets.clear();
  try { const db = await getDb(); await db.delete(rateLimits); } catch { /* pas de base : la purge mémoire suffit */ }
};

// ---------- En-têtes de sécurité ----------
export async function securityHeaders(c: Context, next: Next) {
  await next();
  c.header('X-Content-Type-Options', 'nosniff'); c.header('X-Frame-Options', 'DENY'); c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
}

// ---------- Audit ----------
export async function audit(action: string, opts: { actorEmail?: string | null; target?: string; meta?: Record<string, unknown> } = {}) {
  try { const db = await getDb(); await db.insert(auditLog).values({ action, actorEmail: opts.actorEmail ?? null, target: opts.target, meta: opts.meta }); } catch (e) { console.error('[audit]', e); }
}

// ---------- Version / build ----------
export const buildInfo = () => ({ version: process.env.npm_package_version ?? '0.1.0', commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local', env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development', region: process.env.VERCEL_REGION ?? 'local' });

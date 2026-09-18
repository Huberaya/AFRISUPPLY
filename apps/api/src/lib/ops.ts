// Exploitation : remontée d'erreurs (Sentry via API HTTP, zéro dépendance), rate limiting, en-têtes de sécurité, audit.
import type { Context, MiddlewareHandler, Next } from 'hono';
import { getDb, auditLog } from '@afrisupply/db';

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

// ---------- Rate limiting (mémoire par instance : suffisant pour freiner le brute-force sur une fonction serverless) ----------
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(opts: { windowMs: number; max: number; key?: (c: Context) => string }): MiddlewareHandler {
  return async (c, next) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? c.req.header('x-real-ip') ?? 'local';
    const k = `${opts.key ? opts.key(c) : c.req.path}:${ip}`; const now = Date.now();
    let b = buckets.get(k); if (!b || b.reset < now) { b = { n: 0, reset: now + opts.windowMs }; buckets.set(k, b); }
    b.n += 1;
    if (buckets.size > 5000) for (const [kk, v] of buckets) if (v.reset < now) buckets.delete(kk);
    c.header('X-RateLimit-Limit', String(opts.max)); c.header('X-RateLimit-Remaining', String(Math.max(0, opts.max - b.n)));
    if (b.n > opts.max) { c.header('Retry-After', String(Math.ceil((b.reset - now) / 1000))); return c.json({ error: 'Trop de tentatives, réessayez dans une minute.' }, 429); }
    await next();
  };
}
export const _resetRateLimits = () => buckets.clear();

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

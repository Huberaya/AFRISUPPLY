// Remontée des erreurs front vers Sentry (API HTTP, sans SDK) si VITE_SENTRY_DSN est défini.
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
export function captureFrontError(err: unknown, extra: Record<string, unknown> = {}) {
  if (!dsn) return;
  try {
    const u = new URL(dsn); const endpoint = `${u.protocol}//${u.host}/api/${u.pathname.slice(1)}/envelope/`;
    const e = err instanceof Error ? err : new Error(String(err)); const id = crypto.randomUUID().replace(/-/g, '');
    const event = { event_id: id, timestamp: new Date().toISOString(), platform: 'javascript', level: 'error', environment: import.meta.env.MODE, request: { url: location.href }, exception: { values: [{ type: e.name, value: e.message }] }, extra: { stack: e.stack, ...extra } };
    const body = `${JSON.stringify({ event_id: id, sent_at: new Date().toISOString(), dsn })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`;
    const sent = navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'application/x-sentry-envelope' }));
    if (!sent) void fetch(endpoint, { method: 'POST', body, keepalive: true, headers: { 'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${u.username}, sentry_client=afrisupply-web/1.0` } });
  } catch { /* silencieux */ }
}
export function installGlobalHandlers() {
  window.addEventListener('error', (ev) => captureFrontError(ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => captureFrontError(ev.reason));
}

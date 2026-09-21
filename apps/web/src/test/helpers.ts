// Mock de transport HTTP au niveau `fetch` : les tests traversent la VRAIE chaîne
// api() → useApi → composant (jamais de mock de module applicatif).
import { vi } from 'vitest';

export type ApiCall = { method: string; path: string; body: unknown; headers: Record<string, string> };
export type Handler = (body: unknown, call: ApiCall) => { status?: number; body: unknown };
export type Routes = Record<string, Handler>;

export function mockApi(routes: Routes) {
  const calls: ApiCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input).replace(/^\/api/, '').split('?')[0];
    const method = (init.method ?? 'GET').toUpperCase();
    let body: unknown;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
    const call: ApiCall = { method, path: url, body, headers };
    calls.push(call);
    const h = routes[`${method} ${url}`] ?? routes['*'];
    const out = h ? h(body, call) : { status: 404, body: { error: `mock: route non fâchée ${method} ${url}` } };
    return new Response(JSON.stringify(out.body ?? {}), { status: out.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fn };
}

// Chantier 7 : invitation pilote → inscription avec code (fondateur) → checklist auto → feedback/NPS → usage → cockpit admin → rapport hebdo.
import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '@afrisupply/db';
import { app } from '../app.js';
import { buildWeeklyPilotReport, makeInviteCode } from '../routes/pilots.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.PGLITE_DIR = 'memory://pilots'; process.env.ADMIN_EMAILS = 'admin@afrisupply.fr'; delete process.env.STRIPE_SECRET_KEY; delete process.env.BILLING_ENFORCE;
type Json = Record<string, any>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  let json: Json = {}; try { json = await res.json(); } catch { /* */ } return { status: res.status, json };
};
let ADM: Record<string, string>; let code = ''; let P: { h: Record<string, string>; rid: string };
beforeAll(async () => { await runMigrations(); const r = await call('POST', '/api/auth/register', { email: 'admin@afrisupply.fr', password: 'Plantain-Yassa-42', fullName: 'Admin', restaurantName: 'Admin' }); ADM = { authorization: `Bearer ${r.json.token}` }; }, 60_000);

describe('programme pilote', () => {
  it('code lisible', () => { expect(makeInviteCode()).toMatch(/^PILOTE-[A-Z2-9]{4}$/); });
  it('admin invite un restaurant → code + lien ; le code public renvoie les infos pré-remplies', async () => {
    const inv = await call('POST', '/api/admin/pilots/invite', { email: 'fatou@lateranga.fr', restaurantName: 'La Teranga', contactName: 'Fatou Ndiaye', city: 'Nantes' }, ADM);
    expect(inv.status).toBe(200); code = inv.json.code; expect(inv.json.link).toContain(`/inscription?code=${code}`);
    const pub = await call('GET', `/api/public/invite/${code.toLowerCase()}`); expect(pub.json).toMatchObject({ valid: true, restaurantName: 'La Teranga', email: 'fatou@lateranga.fr' });
    expect((await call('GET', '/api/public/invite/PILOTE-ZZZZ')).status).toBe(404);
  });
  it('inscription avec le code → restaurant fondateur, lead client, code consommé', async () => {
    const r = await call('POST', '/api/auth/register', { email: 'fatou@lateranga.fr', password: 'Plantain-Yassa-42', fullName: 'Fatou Ndiaye', restaurantName: 'La Teranga', city: 'Nantes', inviteCode: code });
    expect(r.status).toBe(201); expect(r.json.restaurant.founder).toBe(true); P = { h: { authorization: `Bearer ${r.json.token}` }, rid: r.json.restaurant.id };
    expect((await call('GET', `/api/public/invite/${code}`)).status).toBe(410);
    expect((await call('GET', '/api/billing', undefined, P.h)).json.founder).toBe(true);
    const r2 = await call('POST', '/api/auth/register', { email: 'x@y.fr', password: 'Plantain-Yassa-42', fullName: 'X Y', restaurantName: 'Sans code', inviteCode: 'PILOTE-FAUX' }); expect(r2.json.restaurant.founder).toBe(false);
  });
  it('checklist : détection automatique des étapes + étape manuelle + masquage', async () => {
    let c = await call('GET', '/api/onboarding/checklist', undefined, P.h); expect(c.json).toMatchObject({ done: 0, total: 7, dayNumber: 1, founder: true });
    const t = await call('GET', '/api/onboarding/templates', undefined, P.h); await call('POST', '/api/onboarding/apply', { templates: t.json.templates.slice(0, 2).map((x: Json) => x.id ?? x.name) }, P.h);
    await call('POST', '/api/quick/apply', { intent: 'count', lines: (await call('GET', '/api/stock', undefined, P.h)).json.items.slice(0, 2).map((i: Json) => ({ productId: i.productId, quantity: 5 })) }, P.h).catch(() => null);
    c = await call('GET', '/api/onboarding/checklist', undefined, P.h); expect(c.json.steps.find((s: Json) => s.id === 'carte').done).toBe(true);
    await call('POST', '/api/onboarding/checklist/app', {}, P.h); c = await call('GET', '/api/onboarding/checklist', undefined, P.h); expect(c.json.steps.find((s: Json) => s.id === 'app').done).toBe(true);
    expect((await call('POST', '/api/onboarding/checklist/inconnue', {}, P.h)).status).toBe(400);
    await call('POST', '/api/onboarding/checklist/_dismissed', {}, P.h); expect((await call('GET', '/api/onboarding/checklist', undefined, P.h)).json.dismissed).toBe(true);
  });
  it('retours : bug sans message refusé, bug OK, NPS 4 → alerte admin, NPS non dû à J1', async () => {
    expect((await call('POST', '/api/feedback', { kind: 'bug', message: '  ' }, P.h)).status).toBe(400);
    expect((await call('POST', '/api/feedback', { kind: 'bug', message: 'Le bouton commander ne marche pas sur iPhone', page: '/app/achats/panier' }, P.h)).status).toBe(201);
    expect((await call('POST', '/api/feedback', { kind: 'nps', score: 4, message: 'Trop de clics' }, P.h)).json.message).toMatch(/Merci/);
    expect((await call('GET', '/api/feedback/nps-due', undefined, P.h)).json.due).toBe(false);
  });
  it('usage : lot d’événements accepté', async () => {
    expect((await call('POST', '/api/usage', { events: [{ event: 'page./app/stock' }, { event: 'action.sale.quick', meta: { lines: 3 } }] }, P.h)).json.ok).toBe(true);
  });
  it('cockpit admin : santé rouge (NPS 4 + bug ouvert), résumé, liste des invités ; feedback traité', async () => {
    expect((await call('GET', '/api/admin/pilots', undefined, P.h)).status).toBe(403);
    const a = await call('GET', '/api/admin/pilots', undefined, ADM); expect(a.status).toBe(200);
    const p = a.json.pilots.find((x: Json) => x.id === P.rid); expect(p.status).toBe('rouge'); expect(p.reasons.join(' ')).toMatch(/NPS 4/); expect(p.openFeedback).toBe(1); expect(p.founder).toBe(true); expect(p.week.events).toBe(2);
    expect(a.json.summary).toMatchObject({ rouge: 1, founders: 1, founderSeatsLeft: 19, npsResponses: 1, nps: -100 });
    expect(a.json.invited[0]).toMatchObject({ inviteCode: code, restaurantId: P.rid });
    const fb = a.json.feedback.find((f: Json) => f.kind === 'bug'); const u = await call('PUT', `/api/admin/pilots/feedback/${fb.id}`, { status: 'traite' }, ADM); expect(u.json.feedback.status).toBe('traite');
    const rep = await buildWeeklyPilotReport(); expect(rep.text).toContain('🔴 La Teranga'); expect(rep.text).toContain('Trop de clics');
  });
});

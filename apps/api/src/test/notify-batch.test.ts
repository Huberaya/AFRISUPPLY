// Chantier 9 (audit 2) — « une rupture peut ne jamais partir par e-mail ».
// Défaut réel reproduit : `pendingImmediateAlerts` ne renvoyait que 8 alertes, dans un ordre arbitraire
// pour des alertes créées au même instant. Sur un compte neuf à 9 produits en rupture, l'une des ruptures
// ne figurait dans AUCUN e-mail — et n'était donc jamais marquée « annoncée ».
// Ce test verrouille : toutes les alertes urgentes en attente partent (jusqu'à 50), dans un ordre stable,
// et un rappel doux (bleu) ne déclenche jamais d'e-mail.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const OUTBOX = mkdtempSync(path.join(tmpdir(), 'afs-outbox-batch-'));
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.PGLITE_DIR = 'memory://notify-batch';
process.env.MAIL_OUTBOX_DIR = OUTBOX;
delete process.env.RESEND_API_KEY;
delete process.env.VERCEL;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, runMigrations, alerts } from '@afrisupply/db';
import { app } from '../app.js';
import { notifyCriticalAlerts, pendingImmediateAlerts } from '../lib/notify.js';

let rid = '';
const outboxText = () => {
  try {
    return readdirSync(OUTBOX).filter((f) => f.endsWith('.txt'))
      .map((f) => readFileSync(path.join(OUTBOX, f), 'utf8')).join('\n');
  } catch { return ''; }
};

beforeAll(async () => {
  await runMigrations();
  const res = await app.request('/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'batch@resto.fr', password: 'Plantain-Yassa-42', fullName: 'Awa Batch', restaurantName: 'Chez Batch' }),
  });
  rid = ((await res.json()) as { restaurant: { id: string } }).restaurant.id;
}, 90_000);

afterAll(() => { try { rmSync(OUTBOX, { recursive: true, force: true }); } catch { /* rien */ } });

describe('chantier 9 — envoi immédiat : aucune alerte urgente silencieusement écartée', () => {
  it('12 ruptures simultanées : les 12 figurent dans l’e-mail et sont marquées annoncées', async () => {
    const db = await getDb();
    const produits = Array.from({ length: 12 }, (_, i) => `Produit ${i + 1}`);
    await db.insert(alerts).values(produits.map((p, i) => ({
      restaurantId: rid, dedupeKey: `rupture:batch:${i}`, kind: 'rupture' as const, severity: 'red' as const,
      title: `🔴 Rupture imminente — ${p}`, message: `Stock à zéro pour ${p}.`, actionUrl: '/stock',
    })));
    expect(await pendingImmediateAlerts(rid)).toHaveLength(12);   // avant correctif : 8 seulement

    const res = await notifyCriticalAlerts(rid, { record: false });
    expect(res.sent).toBe(true);
    expect(res.emails).toBeGreaterThan(0);

    const texte = outboxText();
    for (const p of produits) expect(texte, `« ${p} » absent de l'e-mail`).toContain(p);
    expect(await pendingImmediateAlerts(rid)).toHaveLength(0);   // tout a réellement été annoncé
  });

  it('un rappel doux (bleu) n’envoie jamais d’e-mail : il attend le récapitulatif du matin', async () => {
    const db = await getDb();
    await db.insert(alerts).values({
      restaurantId: rid, dedupeKey: `ventes_non_saisies:j${Date.now()}`, kind: 'saisie', severity: 'blue',
      title: '📝 Pensez à saisir vos ventes', message: 'Dernière saisie : hier.', actionUrl: '/app/ventes',
      payload: { reminder: 'sales', gentle: true },
    });
    const res = await notifyCriticalAlerts(rid, { record: false });
    expect(res.sent).toBe(false);
    expect(res.status).toBe('nothing');           // rien d'urgent : aucun mail immédiat
    expect(await pendingImmediateAlerts(rid)).toHaveLength(0);
  });
});

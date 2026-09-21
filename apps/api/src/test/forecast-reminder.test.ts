// Chantier 9 (audit 2) — « la prévision se vide en dix jours » : la cause est l'absence de saisie.
// Ce test verrouille la relance graduée (J+1/J+2 douce dans l'application, J+3 ferme + e-mail immédiat)
// et le fait qu'un rappel doux n'engorge pas la boîte mail du restaurateur.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.PGLITE_DIR = 'memory://forecast-reminder';
process.env.ADMIN_EMAILS = 'admin@afrisupply.fr';
delete process.env.RESEND_API_KEY;

import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { runMigrations, getDb, restaurants, alerts, sales, recipes } from '@afrisupply/db';
import { checkMissingSales, weekKey, buildDigestForRestaurant } from '../jobs/daily.js';
import { pendingImmediateAlerts } from '../lib/notify.js';

const dayOf = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
let rid = ''; let recipeId = '';

beforeAll(async () => {
  await runMigrations();
  const db = await getDb();
  const [r] = await db.insert(restaurants).values({ name: 'Chez Test Relance', slug: `relance-${Date.now()}`, coversPerDay: 100 }).returning();
  rid = r.id;
  const [rec] = await db.insert(recipes).values({ restaurantId: rid, name: 'Poulet braisé' }).returning();
  recipeId = rec.id;
}, 60_000);

const saisir = async (n: number) => { const db = await getDb(); await db.insert(sales).values({ restaurantId: rid, recipeId, day: dayOf(n), portions: 30 }); };
const alertesSaisie = async () => (await getDb()).select().from(alerts).where(eq(alerts.kind, 'saisie'));

describe('chantier 9 — relance graduée des ventes non saisies', () => {
  it('aucune vente saisie : relance ferme (orange) une fois par semaine, aucune douce en double', async () => {
    const first = await checkMissingSales(rid, new Date());
    expect(first.created).toBe(true);
    expect(first.gentle).toBe(false);                       // rien à relancer doucement : tout manque
    const rows = await alertesSaisie();
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe('orange');
    expect(rows[0].dedupeKey).toBe(`ventes_non_saisies:${weekKey(new Date())}`);
    const second = await checkMissingSales(rid, new Date());
    expect(second.created).toBe(false);
    expect(await alertesSaisie()).toHaveLength(1);           // pas de doublon dans la semaine
  });

  it('ventes saisies hier : rien à signaler (c’est le rythme normal)', async () => {
    await saisir(1);
    const res = await checkMissingSales(rid, new Date());
    expect(res.gapDays).toBe(1); expect(res.created).toBe(false); expect(res.gentle).toBe(false);
    expect(await alertesSaisie()).toHaveLength(1);            // seule la relance ferme précédente existe
  });

  it('ventes d’avant-hier : rappel doux, sans e-mail, une seule fois par jour', async () => {
    const db = await getDb();
    await db.delete(sales).where(eq(sales.restaurantId, rid));
    await saisir(2);
    const now = new Date();
    const res = await checkMissingSales(rid, now);
    expect(res.gapDays).toBe(2);
    expect(res.gentle).toBe(true); expect(res.created).toBe(false);
    const rows = (await alertesSaisie()).filter((a) => a.severity === 'blue');
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toMatch(/saisir vos ventes/i);
    expect(rows[0].actionUrl).toBe('/app/ventes');
    // Un rappel doux n'est pas une urgence : il ne part PAS par e-mail tout de suite.
    const immediate = await pendingImmediateAlerts(rid);
    expect(immediate.some((a) => a.title.match(/saisir vos ventes/i))).toBe(false);
    // Deuxième appel le même jour : aucun doublon.
    const again = await checkMissingSales(rid, now);
    expect(again.gentle).toBe(false);
    expect((await alertesSaisie()).filter((a) => a.severity === 'blue')).toHaveLength(1);
  });

  it('la relance en attente est réellement affichée dans le mail du matin (jamais annoncée dans le vide)', async () => {
    const db = await getDb();
    await db.delete(sales).where(eq(sales.restaurantId, rid));
    await db.delete(alerts).where(eq(alerts.restaurantId, rid));
    const res = await checkMissingSales(rid, new Date());
    expect(res.created).toBe(true);
    const { input } = await buildDigestForRestaurant(rid);
    expect(input.salesReminder).toBeTruthy();
    expect(input.salesReminder!.title).toMatch(/vente/i);
    const html = (await import('../lib/digest.js')).buildDigest({ ...input, firstName: 'Awa' });
    // Le mail porte le rappel, et son objet ne prétend pas que tout va bien.
    expect(html.text).toContain('Aucune vente saisie');
    expect(html.text).toContain('/app/ventes');          // le lien de saisie est dans la version texte
    expect(html.html).toContain('Saisir mes ventes');    // et le bouton dans la version HTML
    expect(html.subject).not.toMatch(/sous contrôle/i);
    await db.delete(alerts).where(eq(alerts.restaurantId, rid));
  });

  it('ventes de la semaine dernière : relance ferme créée et bien envoyée par e-mail', async () => {
    const db = await getDb();
    await db.delete(sales).where(eq(sales.restaurantId, rid));
    await db.delete(alerts).where(eq(alerts.restaurantId, rid));
    await saisir(5);
    const res = await checkMissingSales(rid, new Date());
    expect(res.gapDays).toBe(5);
    expect(res.created).toBe(true); expect(res.gentle).toBe(false);   // fenêtre douce = J+1/J+2 uniquement
    const rows = await alertesSaisie();
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe('orange');
    expect(rows[0].message).toMatch(/couverts et vos seuils/);        // le message dit ce que la prévision fera de moins
    // Les alertes graves, elles, restent des alertes immédiates.
    const immediate = await pendingImmediateAlerts(rid);
    expect(immediate.map((a) => a.severity)).toContain('orange');
  });
});

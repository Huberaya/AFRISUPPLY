// Chantier P0.5 — LE HTML DES E-MAILS N'ACCEPTE PAS CELUI DES UTILISATEURS.
//
// Avant : le nom d'une personne, d'un restaurant, d'un grossiste, d'un produit, le texte d'un litige…
// étaient insérés tels quels dans le HTML de 25 e-mails. Un compte pouvait donc faire partir, au nom
// d'AFRISUPPLY et vers une adresse de son choix (invitation d'un membre, e-mail de test), un message
// portant ses propres liens : un support d'hameçonnage.
//
// Ces tests vérifient : l'outil d'échappement, l'absence de gabarit non protégé dans le code, et —
// sur de vrais e-mails écrits sur disque — qu'un nom piégé arrive inoffensif chez le destinataire.
import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync, rmSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { runMigrations, getDb, users, restaurants } from '@afrisupply/db';
import { app } from '../app.js';
import { h, brut, nl2br, esc, nomAfficheProbleme, NOM_MAX } from '../lib/html.js';
import { _resetRateLimits } from '../lib/ops.js';
import { creerAppel, confirmerAdresse } from './aide-comptes.js';

const BOITE = '/tmp/afs-outbox-p0-courriels';
process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.DATABASE_URL = '';
process.env.PGLITE_DIR = 'memory://p0-courriels'; process.env.MAIL_OUTBOX_DIR = BOITE;
delete process.env.RESEND_API_KEY; delete process.env.VERCEL;

const appel = creerAppel(app);
const PIEGE = '<a href="https://hameconnage.example/connexion">Cliquez ici pour garder votre compte</a>';
const htmlPour = (destinataire: string) => readdirSync(BOITE).filter((f) => f.endsWith('.html') && f.includes(destinataire.replace(/[^a-z0-9@.]/gi, '_'))).map((f) => readFileSync(path.join(BOITE, f), 'utf8'));

beforeAll(async () => { rmSync(BOITE, { recursive: true, force: true }); mkdirSync(BOITE, { recursive: true }); await runMigrations(); }, 60_000);

describe('outil d’échappement', () => {
  it('chaque valeur insérée dans un gabarit est échappée', () => {
    expect(h`<p>Bonjour ${'<b>Awa</b> & "Co"'}</p>`).toBe('<p>Bonjour &lt;b&gt;Awa&lt;/b&gt; &amp; &quot;Co&quot;</p>');
    expect(h`<a href="${'https://exemple.fr/?a=1&b="2"'}">lien</a>`).toBe('<a href="https://exemple.fr/?a=1&amp;b=&quot;2&quot;">lien</a>');
    expect(h`${null}${undefined}${0}${12.5}`).toBe('012.5');
    expect(esc('<script>')).toBe('&lt;script&gt;');
  });

  it('un fragment construit par le code se déclare (brut) — et ses valeurs restent échappées', () => {
    const lignes = ['Riz <1 kg>', 'Huile & sel'];
    expect(h`<ul>${brut(lignes.map((l) => h`<li>${l}</li>`).join(''))}</ul>`).toBe('<ul><li>Riz &lt;1 kg&gt;</li><li>Huile &amp; sel</li></ul>');
    expect(h`<p>${nl2br('ligne 1\n<img src=x onerror=alert(1)>')}</p>`).toBe('<p>ligne 1<br>&lt;img src=x onerror=alert(1)&gt;</p>');
  });
});

describe('un nom montré à des tiers n’est ni une balise, ni une adresse web, ni une phrase', () => {
  it('règle', () => {
    for (const ok of ['Awa Diop', 'Chez Awa — Nantes', 'L’Étoile d’Abidjan', 'Afro Distribution (Rungis) & Fils', 'O\'Neil']) expect(nomAfficheProbleme(ok), ok).toBeNull();
    expect(nomAfficheProbleme('A')).toMatch(/trop court/);
    expect(nomAfficheProbleme('x'.repeat(NOM_MAX + 1))).toMatch(/trop long/);
    expect(nomAfficheProbleme('<b>Awa</b>')).toMatch(/< et >/);
    expect(nomAfficheProbleme('Compte suspendu : https://hameconnage.example')).toMatch(/adresse web/);
    expect(nomAfficheProbleme('Voir www.hameconnage.example')).toMatch(/adresse web/);
  });

  it('inscription, invitation et réglages refusent un tel nom (400) — et rien n’est créé', async () => {
    await _resetRateLimits();
    const base = { email: 'nom-refuse@resto.test', password: 'Plantain-Yassa-42', fullName: 'Awa Diop', restaurantName: 'Chez Awa', city: 'Nantes' };
    for (const corps of [{ ...base, fullName: PIEGE }, { ...base, restaurantName: 'Urgent : https://hameconnage.example' }, { ...base, fullName: 'x'.repeat(NOM_MAX + 1) }]) {
      const r = await appel('POST', '/api/auth/register', corps);
      expect(r.status, JSON.stringify(corps).slice(0, 80)).toBe(400);
    }
    const db = await getDb();
    expect(await db.select().from(users).where(eq(users.email, 'nom-refuse@resto.test'))).toHaveLength(0);
    await _resetRateLimits();
    const ok = await appel('POST', '/api/auth/register', base);
    expect(ok.status).toBe(201);
    const h1 = { authorization: `Bearer ${ok.json.token}`, 'x-restaurant-id': ok.json.restaurant.id };
    expect((await appel('POST', '/api/members', { email: 'invite-nom@victime.test', fullName: PIEGE }, h1)).status).toBe(400);
    expect((await appel('PUT', '/api/settings', { name: 'Promo sur www.hameconnage.example' }, h1)).status).toBe(400);
    expect((await appel('PUT', '/api/settings', { name: 'Chez Awa — Île de Nantes' }, h1)).status).toBe(200);
  });
});

describe('aucun gabarit HTML non protégé dans le code', () => {
  it('tout « html: `…` » et tout « const html = `…` » passe par l’étiquette h (ou par un échappement explicite)', () => {
    const SRC = fileURLToPath(new URL('..', import.meta.url));
    const fichiers = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? (f === 'test' ? [] : fichiers(p)) : p.endsWith('.ts') ? [p] : []; });
    // Gabarits connus pour échapper eux-mêmes chacune de leurs valeurs (fonction d'échappement locale).
    const ECHAPPENT_EUX_MEMES = new Set(['lib/digest.ts', 'lib/notify.ts']);
    const nus: string[] = []; let etiquetes = 0;
    for (const f of fichiers(SRC)) {
      const rel = path.relative(SRC, f); const source = readFileSync(f, 'utf8');
      etiquetes += (source.match(/html(?::| =) h`/g) ?? []).length;
      if (ECHAPPENT_EUX_MEMES.has(rel)) continue;
      for (const m of source.matchAll(/html(?::| =|\s*\+=) `/g)) nus.push(`${rel}:${source.slice(0, m.index).split('\n').length}`);
    }
    expect(etiquetes).toBeGreaterThanOrEqual(26);          // le test voit bien les gabarits
    expect(nus, `gabarits HTML sans échappement : ${nus.join(', ')}`).toEqual([]);
  });
});

describe('e-mails réellement écrits : un nom piégé arrive inoffensif', () => {
  it('invitation d’un membre : le nom de l’invitant et celui du restaurant sont échappés, le rôle est écrit en clair', async () => {
    const r = await appel('POST', '/api/auth/register', { email: 'pirate@resto.test', password: 'Plantain-Yassa-42', fullName: 'Compte Pirate', restaurantName: 'Chez Pirate', city: 'Nantes' });
    expect(r.status).toBe(201);
    await _resetRateLimits();
    // Un nom piégé DÉJÀ enregistré (compte créé avant la règle sur les noms) : on l'écrit directement en
    // base. C'est le cas que l'échappement doit couvrir — la validation à l'inscription ne le voit pas.
    const db = await getDb();
    await db.update(users).set({ fullName: PIEGE }).where(eq(users.email, 'pirate@resto.test'));
    await db.update(restaurants).set({ name: `Chez ${PIEGE}` }).where(eq(restaurants.id, r.json.restaurant.id));
    const co = await appel('POST', '/api/auth/login', { email: 'pirate@resto.test', password: 'Plantain-Yassa-42' });   // session portant le nom piégé
    const h1 = { authorization: `Bearer ${co.json.token}`, 'x-restaurant-id': r.json.restaurant.id };
    const inv = await appel('POST', '/api/members', { email: 'cible@victime.test', role: 'staff' }, h1);
    expect(inv.status, inv.text).toBe(201);
    const recus = htmlPour('cible@victime.test');
    expect(recus).toHaveLength(1);
    // le lien du pirate n'est PAS un lien dans le message reçu : il s'affiche comme du texte
    expect(recus[0]).not.toContain('<a href="https://hameconnage.example');
    expect(recus[0]).toContain('&lt;a href=&quot;https://hameconnage.example/connexion&quot;&gt;');
    // le seul lien du message est celui d'AFRISUPPLY
    const liens = [...recus[0].matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
    expect(liens).toHaveLength(1); expect(liens[0]).toMatch(/\/bienvenue\?token=/);
    expect(recus[0]).toContain('avec le rôle <b>Équipe (quotidien)</b>');
    expect(recus[0]).not.toMatch(/rôle <b>staff<\/b>/);
  });

  it('e-mail de test envoyé à une adresse choisie : même protection', async () => {
    await confirmerAdresse('pirate@resto.test');
    const co = await appel('POST', '/api/auth/login', { email: 'pirate@resto.test', password: 'Plantain-Yassa-42' });
    expect(co.status).toBe(200);
    const moi = await appel('GET', '/api/auth/me', undefined, { authorization: `Bearer ${co.json.token}` });
    const h1 = { authorization: `Bearer ${co.json.token}`, 'x-restaurant-id': moi.json.restaurants[0].id };
    const t = await appel('POST', '/api/settings/test-email', { to: 'autre-cible@victime.test' }, h1);
    expect(t.status, t.text).toBe(200);
    const recus = htmlPour('autre-cible@victime.test');
    expect(recus).toHaveLength(1);
    expect(recus[0]).not.toContain('<a href="https://hameconnage.example');
    expect(recus[0]).toContain('&lt;a href=');
  });

  it('les invitations sont freinées : au-delà de 20 par heure et par restaurant, quelle que soit l’adresse cliente, 429 (et aucun e-mail de plus)', async () => {
    await _resetRateLimits();
    const r = await appel('POST', '/api/auth/register', { email: 'expediteur@resto.test', password: 'Plantain-Yassa-42', fullName: 'Expéditeur En Série', restaurantName: 'Chez Série', city: 'Nantes' });
    const h1 = { authorization: `Bearer ${r.json.token}`, 'x-restaurant-id': r.json.restaurant.id };
    const codes: number[] = [];
    for (let i = 0; i < 23; i++) {
      // inviter puis retirer : le plafond d'utilisateurs de l'offre ne freine pas ces envois.
      // Chaque invitation arrive d'une adresse cliente différente : le compteur est celui du restaurant,
      // changer d'adresse ne le remet pas à zéro.
      const inv = await appel('POST', '/api/members', { email: `serie-${i}@victime.test`, role: 'staff' }, { ...h1, 'x-forwarded-for': `203.0.113.${i + 1}` });
      codes.push(inv.status);
      if (inv.status === 201) {
        const membres = await appel('GET', '/api/members', undefined, h1);
        const m = (membres.json.members as { userId: string; email: string }[]).find((x) => x.email === `serie-${i}@victime.test`);
        if (m) await appel('DELETE', `/api/members/${m.userId}`, undefined, h1);
      }
    }
    expect(codes.filter((c) => c === 201)).toHaveLength(20);
    expect(codes.slice(20)).toEqual([429, 429, 429]);
    expect(readdirSync(BOITE).filter((f) => f.endsWith('.txt') && f.includes('serie_')).length).toBe(20);
  }, 60_000);
});

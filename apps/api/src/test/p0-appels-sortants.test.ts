// Chantier P0.4 — AUCUN APPEL SORTANT SANS DÉLAI MAXIMAL.
//
// Une fonction serverless est coupée à sa durée maximale (60 s). Un appel à un prestataire (paiement,
// e-mail, SMS, stockage, LLM, identité) qui ne répond pas et n'a pas de délai retient la requête
// jusqu'à cette coupure : l'utilisateur attend une minute, puis reçoit une erreur de la plateforme,
// et une tâche planifiée perd tout ce qu'il lui restait à faire.
//
// Ce test lit le code source : chaque `fetch(` de l'API doit porter un `signal` (délai). Le délai de la
// bibliothèque Clerk, qui n'utilise pas `fetch` directement, est vérifié dans clerk-sync.test.ts.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offsiteTimeoutMs } from '../lib/offsite.js';
import { clerkTimeoutMs } from '../lib/clerk.js';
import { FUNCTION_MAX_MS } from '../jobs/daily.js';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const fichiers = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  if (statSync(p).isDirectory()) return f === 'test' ? [] : fichiers(p);
  return p.endsWith('.ts') ? [p] : [];
});

/** Texte de l'appel `fetch(...)` qui commence à `debut` (parenthèses équilibrées). */
function appelComplet(source: string, debut: number): string {
  let profondeur = 0;
  for (let i = source.indexOf('(', debut); i < source.length; i++) {
    if (source[i] === '(') profondeur++;
    else if (source[i] === ')' && --profondeur === 0) return source.slice(debut, i + 1);
  }
  return source.slice(debut);
}

describe('appels sortants', () => {
  it('chaque fetch() de l’API porte un délai maximal (signal)', () => {
    const appels: { ou: string; texte: string }[] = [];
    for (const f of fichiers(SRC)) {
      const source = readFileSync(f, 'utf8');
      for (const m of source.matchAll(/(?<![.\w])fetch\(/g)) {
        const ligne = source.slice(0, m.index).split('\n').length;
        appels.push({ ou: `${path.relative(SRC, f)}:${ligne}`, texte: appelComplet(source, m.index!) });
      }
    }
    // garde-fou du test lui-même : il voit bien les appels connus (paiement, e-mail, SMS, stockage, LLM, suite de la passe)
    expect(appels.length).toBeGreaterThanOrEqual(9);
    for (const attendu of ['lib/billing.ts', 'lib/mailer.ts', 'lib/sms.ts', 'lib/offsite.ts', 'lib/assistant.ts', 'lib/quick.ts', 'lib/catalog-import.ts', 'lib/ops.ts', 'routes/jobs.ts']) {
      expect(appels.some((a) => a.ou.startsWith(attendu)), `aucun fetch trouvé dans ${attendu}`).toBe(true);
    }
    const sansDelai = appels.filter((a) => !/\bsignal\s*:/.test(a.texte)).map((a) => a.ou);
    expect(sansDelai, `appels sortants sans délai maximal : ${sansDelai.join(', ')}`).toEqual([]);
  });

  it('aucun délai ne dépasse la durée maximale d’une fonction', () => {
    const tropLongs: string[] = [];
    for (const f of fichiers(SRC)) {
      const source = readFileSync(f, 'utf8');
      for (const m of source.matchAll(/AbortSignal\.timeout\(([\d_]+)\)/g)) {
        if (Number(m[1].replace(/_/g, '')) >= FUNCTION_MAX_MS) tropLongs.push(`${path.relative(SRC, f)} : ${m[1]} ms`);
      }
    }
    expect(tropLongs).toEqual([]);
  });

  it('stockage externe : sur la plateforme serverless, une tentative est plafonnée bien en dessous de la durée d’une fonction', () => {
    expect(offsiteTimeoutMs(60_000, {})).toBe(60_000);                              // serveur autonome : inchangé
    expect(offsiteTimeoutMs(60_000, { VERCEL: '1' })).toBe(12_000);
    expect(offsiteTimeoutMs(5_000, { VERCEL: '1' })).toBe(5_000);                   // un délai déjà plus court est respecté
    expect(offsiteTimeoutMs(60_000, { VERCEL: '1', OFFSITE_TIMEOUT_MS: '8000' })).toBe(8_000);
    expect(offsiteTimeoutMs(60_000, { VERCEL: '1', OFFSITE_TIMEOUT_MS: 'illisible' })).toBe(12_000);
    // trois tentatives plafonnées tiennent dans la durée d'une fonction
    expect(3 * offsiteTimeoutMs(60_000, { VERCEL: '1' })).toBeLessThan(FUNCTION_MAX_MS);
  });

  it('service d’identité : délai par défaut court, réglable, jamais désactivé par une valeur illisible', () => {
    expect(clerkTimeoutMs({})).toBe(8_000);
    expect(clerkTimeoutMs({ CLERK_TIMEOUT_MS: '3000' })).toBe(3_000);
    expect(clerkTimeoutMs({ CLERK_TIMEOUT_MS: '0' })).toBe(8_000);
    expect(clerkTimeoutMs({ CLERK_TIMEOUT_MS: 'abc' })).toBe(8_000);
  });
});

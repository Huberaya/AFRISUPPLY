// Levée des réserves (chantier B) — la clé Clerk du site doit convenir à l'environnement du déploiement.
// Relevé à l'origine de ce test : en production, la variable du site porte une clé d'instance de
// développement (pk_test_). Le site ne doit rien charger de Clerk dans ce cas.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { clerkActivation, DEPLOY_ENV } from './clerk';

describe('activation de Clerk côté site', () => {
  it('production : une clé de développement n’est jamais activée ; une clé de production l’est', () => {
    expect(clerkActivation('pk_test_abc', 'production')).toEqual({ enabled: false, reason: 'cle_de_developpement_en_production' });
    expect(clerkActivation('pk_live_abc', 'production')).toEqual({ enabled: true, reason: null });
  });

  it('prévisualisation : la clé de production n’est pas activée ; la clé de développement l’est', () => {
    expect(clerkActivation('pk_live_abc', 'preview')).toEqual({ enabled: false, reason: 'cle_de_production_en_previsualisation' });
    expect(clerkActivation('pk_test_abc', 'preview')).toEqual({ enabled: true, reason: null });
  });

  it('en local : la clé fournie est utilisée ; sans clé, Clerk n’est pas proposé', () => {
    expect(clerkActivation('pk_test_abc', '')).toEqual({ enabled: true, reason: null });
    expect(clerkActivation('', 'production')).toEqual({ enabled: false, reason: 'cle_absente' });
  });

  it('l’environnement du déploiement est fixé au build à partir de VERCEL_ENV', () => {
    expect(typeof DEPLOY_ENV).toBe('string');
    const config = readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/__AFS_DEPLOY_ENV__:\s*JSON\.stringify\(process\.env\.VERCEL_ENV \?\? ''\)/);
  });
});

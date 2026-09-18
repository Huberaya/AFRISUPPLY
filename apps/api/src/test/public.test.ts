import { describe, it, expect } from 'vitest';
import { PLANS, FOUNDER_OFFER } from '../routes/public.js';

describe('offre commerciale', () => {
  it('reprend les tarifs du concept (39 / 89 / 199) et l’offre pilote', () => {
    expect(PLANS.map((p) => p.priceMonthly)).toEqual([39, 89, 199]);
    expect(PLANS.filter((p) => p.highlight).map((p) => p.id)).toEqual(['pro']);
    expect(FOUNDER_OFFER).toMatchObject({ discountPct: 50, seats: 20, trialDays: 30 });
  });
  it('Pro contient l’intelligence, Starter non', () => {
    const pro = PLANS.find((p) => p.id === 'pro')!.features.join(' '); const starter = PLANS.find((p) => p.id === 'starter')!.features.join(' ');
    expect(pro).toMatch(/Prévision/); expect(pro).toMatch(/IA/); expect(starter).not.toMatch(/Prévision/);
  });
});

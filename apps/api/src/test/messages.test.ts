import { describe, it, expect } from 'vitest';
import { buildOrderMessage, waNumber } from '../lib/messages.js';

describe('messages de commande', () => {
  it('normalise les numéros WhatsApp', () => {
    expect(waNumber('06 12 34 56 78')).toBe('33612345678');
    expect(waNumber('+33 6 12 34 56 78')).toBe('33612345678');
    expect(waNumber('0033612345678')).toBe('33612345678');
    expect(waNumber('12')).toBeNull(); expect(waNumber(null)).toBeNull();
  });
  it('rédige un message complet avec lignes, total, date et liens', () => {
    const m = buildOrderMessage({
      reference: 'AFS-2026-000042', restaurantName: 'Chez Awa', senderName: 'Awa Diallo', senderPhone: '06 00 00 00 00',
      supplier: { name: 'Afro Distribution', contactName: 'Moussa', email: 'cmd@afro.example', whatsapp: '0611223344' },
      expectedAt: '2026-09-22', notes: 'Livrer avant 10h', total: 126, deliveryFee: 0,
      lines: [{ productName: 'Riz parfumé', packLabel: 'Sac 25 kg', packs: 3, quantity: 75, unit: 'kg', lineTotal: 126 }],
    });
    expect(m.subject).toBe('Commande AFS-2026-000042 — Chez Awa');
    expect(m.body).toContain('Bonjour Moussa,');
    expect(m.body).toContain('• Riz parfumé — 3 × Sac 25 kg (75 kg)');
    expect(m.body).toContain('Total estimé : 126,00 €.');
    expect(m.body).toMatch(/Livraison souhaitée : mardi 22 septembre/);
    expect(m.body).toContain('Remarque : Livrer avant 10h');
    expect(m.hasWhatsapp).toBe(true); expect(m.whatsappUrl.startsWith('https://wa.me/33611223344?text=')).toBe(true);
    expect(m.hasEmail).toBe(true); expect(m.mailtoUrl).toContain('mailto:cmd@afro.example');
  });
});

// Chantier 11 (audit UX) — preuve que les confirmations et les notifications intégrées fonctionnent.
//
// Ce test monte réellement le provider (racine React + événements DOM) et vérifie :
//   • une notification s'affiche dans la zone annoncée aux lecteurs d'écran (role="status") et se ferme ;
//   • une confirmation renvoie `true` si l'on confirme et `false` si l'on refuse ;
//   • Échap refuse l'action (comme le faisait la boîte native du navigateur) ;
//   • pour une action destructrice, le focus part sur « refuser », pas sur le bouton rouge ;
//   • sans provider, l'action destructrice est REFUSÉE (jamais de suppression silencieuse).
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useState } from 'react';
import { FeedbackProvider, useConfirm, useToast, TOAST_CONTAINER_ID } from './Feedback';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Petit écran de test : un bouton qui demande une confirmation, un autre qui notifie. */
function Banc({ onResult }: { onResult?: (v: boolean) => void }) {
  const confirmer = useConfirm();
  const toast = useToast();
  const [etat, setEtat] = useState<string>('rien');
  return (
    <div>
      <button data-testid="supprimer" onClick={async () => {
        const ok = await confirmer({ title: 'Supprimer cette commande ?', body: <>Action définitive.</>, confirmLabel: 'Supprimer la commande', danger: true });
        setEtat(ok ? 'confirme' : 'refuse'); onResult?.(ok);
      }}>Supprimer</button>
      <button data-testid="notifier" onClick={() => toast.success('Réception enregistrée.', 'Le stock a été mis à jour.')}>Notifier</button>
      <p data-testid="etat">{etat}</p>
    </div>
  );
}

const monter = async (node: React.ReactElement) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(node); });
  return container;
};
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); };
const parTexte = (c: HTMLElement, t: string) => [...c.querySelectorAll('button')].find((b) => b.textContent?.includes(t))!;

describe('chantier 11 — confirmation intégrée (plus de boîte du navigateur)', () => {
  it('affiche un dialogue avec le libellé exact de l’action et le titre français', async () => {
    const c = await monter(<FeedbackProvider><Banc /></FeedbackProvider>);
    await clic(parTexte(c, 'Supprimer'));
    const dlg = c.querySelector('[role="dialog"]')!;
    expect(dlg).toBeTruthy();
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(dlg.textContent).toContain('Supprimer cette commande ?');
    expect(dlg.textContent).toContain('Supprimer la commande');
    expect(dlg.textContent).toContain('Action définitive.');
  });

  it('renvoie true quand on confirme et false quand on refuse', async () => {
    const res: boolean[] = [];
    const c = await monter(<FeedbackProvider><Banc onResult={(v) => res.push(v)} /></FeedbackProvider>);

    await clic(parTexte(c, 'Supprimer'));
    await clic(c.querySelector('[data-confirm]')!);
    await clic(parTexte(c, 'Supprimer'));           // nouvelle demande
    await clic(parTexte(c, 'Annuler'));             // refus

    expect(res).toEqual([true, false]);
    expect(c.querySelector('[data-testid="etat"]')!.textContent).toBe('refuse');
    expect(c.querySelector('[role="dialog"]')).toBeNull();
  });

  it('Échap refuse l’action et le focus part sur « refuser » pour une action destructrice', async () => {
    const c = await monter(<FeedbackProvider><Banc /></FeedbackProvider>);
    await clic(parTexte(c, 'Supprimer'));
    const annuler = parTexte(c, 'Annuler');
    expect(document.activeElement).toBe(annuler);
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(c.querySelector('[role="dialog"]')).toBeNull();
    expect(c.querySelector('[data-testid="etat"]')!.textContent).toBe('refuse');
  });
});

describe('chantier 11 — notifications intégrées', () => {
  it('annonce le résultat de l’action puis se laisse fermer', async () => {
    const c = await monter(<FeedbackProvider><Banc /></FeedbackProvider>);
    expect(c.querySelector(`#${TOAST_CONTAINER_ID}`)).toBeTruthy();
    await clic(parTexte(c, 'Notifier'));
    const zone = c.querySelector(`#${TOAST_CONTAINER_ID}`)!;
    expect(zone.getAttribute('role')).toBe('status');
    expect(zone.getAttribute('aria-live')).toBe('polite');
    expect(zone.textContent).toContain('Réception enregistrée.');
    expect(zone.textContent).toContain('Le stock a été mis à jour.');
    await clic(zone.querySelector('button[aria-label="Fermer le message"]')!);
    expect(zone.textContent).toBe('');
  });
});

describe('chantier 11 — garde-fou sans provider', () => {
  it('refuse une action destructrice au lieu de supprimer en silence', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res: boolean[] = [];
    const c = await monter(<Banc onResult={(v) => res.push(v)} />);   // monté SANS provider
    await clic(parTexte(c, 'Supprimer'));
    expect(res).toEqual([false]);
    expect(c.querySelector('[role="dialog"]')).toBeNull();
    await clic(parTexte(c, 'Notifier'));                               // ne doit pas planter non plus
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

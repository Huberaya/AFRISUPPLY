// Chantier P0.6 — LA FENÊTRE DE DIALOGUE S'AFFICHE DANS L'ÉCRAN, PAS DANS LA PAGE.
//
// Défaut trouvé dans un vrai navigateur (scripts/navigateur) : la fenêtre était rendue à l'intérieur de
// la page, elle-même animée à l'entrée. L'animation laissait une transformation sur la page ; une
// transformation fait de l'élément le repère de tout ce qui est en `position: fixed` à l'intérieur. La
// fenêtre se plaçait donc par rapport à la PAGE : sur un restaurant neuf (page courte), le haut du
// formulaire « Nouveau fournisseur » — son premier champ, obligatoire — sortait de l'écran.
//
// jsdom ne calcule aucune mise en page : ces tests gardent les deux causes (où la fenêtre est rendue,
// comment l'animation se termine). La géométrie réelle est mesurée par scripts/navigateur/parcours.mjs.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Modal } from './Modal';

describe('fenêtre de dialogue', () => {
  it('elle est rattachée au document, jamais à la page (animée) qui l’ouvre', () => {
    const { getByTestId } = render(
      <div data-testid="page" className="animate-fade-up">
        <Modal title="Nouveau fournisseur" onClose={() => {}}><input aria-label="Nom du fournisseur" /></Modal>
      </div>,
    );
    const dialogue = screen.getByRole('dialog', { name: 'Nouveau fournisseur' });
    expect(getByTestId('page').contains(dialogue)).toBe(false);
    expect(dialogue.parentElement).toBe(document.body);
    expect(dialogue.getAttribute('aria-modal')).toBe('true');
    // son contenu est bien là
    expect(screen.getByLabelText('Nom du fournisseur')).toBeTruthy();
    cleanup();
    expect(document.querySelector('[role="dialog"]')).toBeNull();      // retirée du document avec la page
  });

  it('un clic sur le voile ferme, un clic dans la fenêtre ne ferme pas', () => {
    const fermer = vi.fn();
    render(<Modal title="Titre" onClose={fermer}><button>Dans la fenêtre</button></Modal>);
    fireEvent.click(screen.getByText('Dans la fenêtre'));
    expect(fermer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog'));
    expect(fermer).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('la touche Échap ferme la fenêtre ; une autre touche ne ferme rien ; fermée, elle n’écoute plus', () => {
    const fermer = vi.fn();
    const { unmount } = render(<Modal title="Nouveau fournisseur" onClose={fermer}><input aria-label="Nom" /></Modal>);
    fireEvent.keyDown(document, { key: 'a' });
    expect(fermer).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(fermer).toHaveBeenCalledTimes(1);
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(fermer).toHaveBeenCalledTimes(1);
  });

  it('l’animation d’entrée des pages se termine sans transformation', () => {
    const config = readFileSync(path.resolve(process.cwd(), 'tailwind.config.js'), 'utf8');   // les tests du site s'exécutent depuis apps/web
    const fin = /fadeUp:\s*\{[^}]*\},\s*to:\s*\{([^}]*)\}/.exec(config)?.[1] ?? '';
    expect(fin).toMatch(/transform:\s*'none'/);
    // « translateY(0) » est une transformation : elle suffirait à redéplacer les fenêtres de dialogue.
    expect(fin).not.toMatch(/translate|scale|rotate|matrix/);
  });
});

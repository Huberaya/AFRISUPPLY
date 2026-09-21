// Chantier 5 (audit) — smoke test exigé par l'audit (« + 1 test smoke »),
// et un peu plus : l'écran de connexion s'affiche réellement.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { mockApi } from './helpers';

describe('smoke : l\'application démarre', () => {
  it('ouvre sur l\'écran de connexion', async () => {
    mockApi({});
    window.history.pushState({}, '', '/connexion');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
    expect(screen.getByLabelText(/E-mail/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mot de passe/)).toBeInTheDocument();
  });
});

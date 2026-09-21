import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// Polyfills jsdom (manques documentés de l'environnement)
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
if (!window.ResizeObserver) {
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// Chaque test repart d'une session vierge (indice d'authentification + restaurant)
beforeEach(() => localStorage.clear());

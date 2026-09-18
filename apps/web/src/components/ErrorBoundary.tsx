import { Component, type ReactNode } from 'react';
import { captureFrontError } from '../lib/monitoring';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) { captureFrontError(error, { componentStack: info.componentStack }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 p-6">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-4xl">😕</p>
          <h1 className="mt-3 text-xl font-bold">Quelque chose s’est mal passé</h1>
          <p className="mt-2 text-sm text-stone-600">L’erreur a été signalée à notre équipe. Vous pouvez recharger la page ; vos données ne sont pas perdues.</p>
          <div className="mt-5 flex justify-center gap-2"><button className="btn-primary" onClick={() => location.reload()}>Recharger</button><a className="btn-ghost" href="/app">Retour à l’accueil</a></div>
          <p className="mt-4 text-xs text-stone-400">{this.state.error.message}</p>
        </div>
      </div>
    );
  }
}

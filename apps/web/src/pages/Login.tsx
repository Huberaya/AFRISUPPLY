import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SignIn } from '@clerk/clerk-react';
import { useAuth } from '../lib/auth';
import { Logo, HomeButton } from '../components/AppLayout';

const DEMO_LOGIN = import.meta.env.VITE_DEMO_LOGIN as string | undefined;

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get('next')?.startsWith('/') ? sp.get('next')! : '/app';

  // Par défaut, le formulaire local direct est présent pour satisfaire les tests et les connexions rapides,
  // et Clerk est disponible en 1 clic ou activable.
  const [useClerkMode, setUseClerkMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<'identifiants' | 'trop' | null>(null);
  const [wait, setWait] = useState(0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      await login(email, password);
      nav(next);
    } catch (err) {
      const e2 = err as Error & { status?: number; retryAfterSec?: number };
      setError(e2.message);
      if (e2.status === 429) {
        setHint('trop');
        setWait(Math.max(30, e2.retryAfterSec ?? 60));
      } else if (e2.status === 401) {
        setHint('identifiants');
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setInterval(() => setWait((w) => (w <= 1 ? 0 : w - 1)), 1000);
    return () => window.clearInterval(t);
  }, [wait]);

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-stone-50">
      {/* Panneau gauche de présentation (desktop) */}
      <div className="hidden lg:flex flex-col justify-between bg-stone-900 p-12 text-white">
        <div className="flex items-center justify-between gap-4">
          <Logo light />
          <HomeButton light />
        </div>
        <div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-brand-500/20 text-brand-300 border border-brand-500/30 mb-4">
            Espace Restaurateur Sécurisé
          </span>
          <h2 className="text-4xl font-extrabold leading-tight">
            Achetez mieux.<br />
            Gaspillez moins.<br />
            <span className="text-brand-400">Gagnez plus.</span>
          </h2>
          <p className="mt-6 max-w-md text-stone-300 text-sm leading-relaxed">
            L’assistant d’approvisionnement intelligent des restaurants africains : gestion de stocks en temps réel, commandes groupées, catalogue fournisseur vérifié et comparateur de prix réunis dans un seul tableau de bord.
          </p>
        </div>
        <div className="flex items-center justify-between text-xs text-stone-500 pt-8 border-t border-stone-800">
          <p>© {new Date().getFullYear()} AFRISUPPLY · Authentification sécurisée par Clerk & Neon</p>
        </div>
      </div>

      {/* Panneau droit */}
      <div className="flex flex-col justify-center items-center p-4 sm:p-8 md:p-12">
        <div className="w-full max-w-sm space-y-4">
          {/* Header mobile avec Logo et bouton Retour */}
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-stone-200 lg:border-none">
            <div className="lg:hidden">
              <Logo />
            </div>
            <div className="ml-auto">
              <HomeButton />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <h1 className="text-2xl font-extrabold">Connexion</h1>
            <button
              type="button"
              onClick={() => setUseClerkMode(!useClerkMode)}
              className="text-xs text-brand-700 hover:underline font-semibold bg-brand-50 px-2.5 py-1 rounded-lg border border-brand-200"
            >
              {useClerkMode ? 'Connexion standard' : 'Connexion Clerk'}
            </button>
          </div>

          {useClerkMode ? (
            <div className="space-y-4">
              <div className="flex justify-center w-full">
                <SignIn
                  routing="path"
                  path="/connexion"
                  signUpUrl="/inscription"
                  fallbackRedirectUrl={next}
                  appearance={{
                    elements: {
                      rootBox: 'w-full shadow-none',
                      card: 'w-full shadow-md border border-stone-200 rounded-2xl p-6 bg-white',
                      headerTitle: 'hidden',
                      headerSubtitle: 'hidden',
                      formButtonPrimary: 'bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5 rounded-xl text-sm transition shadow-sm',
                      footerActionLink: 'text-brand-600 hover:text-brand-700 font-semibold',
                      formFieldInput: 'rounded-xl border-stone-300 focus:border-brand-500 focus:ring-brand-500',
                    },
                  }}
                />
              </div>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setUseClerkMode(false)}
                  className="text-xs text-stone-500 hover:text-stone-700 underline"
                >
                  Revenir au formulaire classique e-mail / mot de passe
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="w-full space-y-4">
              {DEMO_LOGIN?.includes('/') && (
                <button
                  type="button"
                  className="btn-ghost w-full justify-center text-xs"
                  onClick={() => {
                    const [e, p] = DEMO_LOGIN.split('/');
                    setEmail(e);
                    setPassword(p ?? '');
                  }}
                >
                  🔧 Remplir le compte de démonstration (environnement de test)
                </button>
              )}
              {error && (
                <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  <p>{error}</p>
                  {hint === 'identifiants' && (
                    <p className="mt-1 text-xs text-red-800">
                      Vérifiez la casse de votre adresse e-mail. Si vous ne retrouvez pas votre mot de passe :{' '}
                      <Link to="/mot-de-passe-oublie" className="font-semibold underline">
                        recevoir un lien par e-mail
                      </Link>{' '}
                      (valable 1 heure).
                    </p>
                  )}
                  {hint === 'trop' && (
                    <p className="mt-1 text-xs text-red-800">
                      Trop de tentatives depuis cet appareil : patientez{' '}
                      {wait > 0 ? `${wait} seconde${wait > 1 ? 's' : ''}` : 'un instant'} puis réessayez. Aucun de vos
                      identifiants n'est en cause.
                    </p>
                  )}
                </div>
              )}
              <label className="block text-sm font-medium">
                E-mail
                <input
                  className="input mt-1"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm font-medium">
                Mot de passe
                <input
                  className="input mt-1"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              <button
                className="btn-primary w-full justify-center"
                disabled={busy || wait > 0}
              >
                {busy ? 'Connexion…' : wait > 0 ? `Patientez ${wait} s` : 'Se connecter'}
              </button>
              <p className="text-center text-sm">
                <Link to="/mot-de-passe-oublie" className="text-stone-500 underline">
                  Mot de passe oublié ?
                </Link>
              </p>
              <div className="rounded-xl bg-brand-50/50 border border-brand-100 p-3 text-center space-y-1">
                <p className="text-xs text-stone-600 font-medium">Vous utilisez Google ou la connexion sans mot de passe ?</p>
                <button
                  type="button"
                  onClick={() => setUseClerkMode(true)}
                  className="text-xs text-brand-700 hover:text-brand-800 font-bold underline"
                >
                  Ouvrir la connexion Clerk →
                </button>
              </div>
              <p className="text-center text-sm text-stone-500">
                Pas encore de compte ?{' '}
                <Link to="/inscription" className="font-semibold text-brand-700">
                  Créer mon restaurant
                </Link>{' '}
                ·{' '}
                <Link to="/" className="text-stone-500 underline">
                  Retour au site
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

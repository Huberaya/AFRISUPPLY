import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Logo } from '../components/AppLayout';

// Chantier 2 (audit) : plus aucun identifiant pré-rempli dans l'écran de connexion.
// Le raccourci de démonstration n'existe que si VITE_DEMO_LOGIN est défini au build (démo locale).
const DEMO_LOGIN = import.meta.env.VITE_DEMO_LOGIN as string | undefined;

export default function Login() {
  const { login } = useAuth(); const nav = useNavigate(); const [sp] = useSearchParams(); const next = sp.get('next')?.startsWith('/') ? sp.get('next')! : '/app';
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  // Chantier 8 : on n'affiche jamais « Erreur 401 » — on explique quoi vérifier et quoi faire ensuite.
  const [hint, setHint] = useState<'identifiants' | 'trop' | null>(null);
  const [wait, setWait] = useState(0);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null); setHint(null);
    try { await login(email, password); nav(next); }
    catch (err) {
      const e2 = err as Error & { status?: number; retryAfterSec?: number };
      setError(e2.message);
      if (e2.status === 429) { setHint('trop'); setWait(Math.max(30, e2.retryAfterSec ?? 60)); }
      else if (e2.status === 401) setHint('identifiants');
    } finally { setBusy(false); }
  };
  // Compte à rebours honnête quand le serveur limite les tentatives (il indique le délai réel).
  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setInterval(() => setWait((w) => (w <= 1 ? 0 : w - 1)), 1000);
    return () => window.clearInterval(t);
  }, [wait]);
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-stone-900 p-12 text-white">
        <Logo light />
        <div>
          <h2 className="text-4xl font-extrabold leading-tight">Achetez mieux.<br />Gaspillez moins.<br /><span className="text-brand-400">Gagnez plus.</span></h2>
          <p className="mt-6 max-w-md text-stone-300">L’assistant d’approvisionnement intelligent des restaurants africains : stocks, fournisseurs, comparateur de prix, prévisions et alertes dans un seul espace.</p>
        </div>
        <p className="text-xs text-stone-500">© {new Date().getFullYear()} AFRISUPPLY</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div className="lg:hidden mb-6"><Logo /></div>
          <h1 className="text-2xl font-extrabold">Connexion</h1>
          {DEMO_LOGIN?.includes('/') && (
            <button type="button" className="btn-ghost w-full justify-center text-xs"
              onClick={() => { const [e, p] = DEMO_LOGIN.split('/'); setEmail(e); setPassword(p ?? ''); }}>
              🔧 Remplir le compte de démonstration (environnement de test)
            </button>
          )}
          {error && (
            <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              <p>{error}</p>
              {hint === 'identifiants' && <p className="mt-1 text-xs text-red-800">Vérifiez la casse de votre adresse e-mail. Si vous ne retrouvez pas votre mot de passe : <Link to="/mot-de-passe-oublie" className="font-semibold underline">recevoir un lien par e-mail</Link> (valable 1 heure).</p>}
              {hint === 'trop' && <p className="mt-1 text-xs text-red-800">Trop de tentatives depuis cet appareil : patientez {wait > 0 ? `${wait} seconde${wait > 1 ? 's' : ''}` : 'un instant'} puis réessayez. Aucun de vos identifiants n'est en cause.</p>}
            </div>
          )}
          <label className="block text-sm font-medium">E-mail<input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label className="block text-sm font-medium">Mot de passe<input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <button className="btn-primary w-full justify-center" disabled={busy || wait > 0}>{busy ? 'Connexion…' : wait > 0 ? `Patientez ${wait} s` : 'Se connecter'}</button>
          <p className="text-center text-sm"><Link to="/mot-de-passe-oublie" className="text-stone-500 underline">Mot de passe oublié ?</Link></p>
          <p className="text-center text-sm text-stone-500">Pas encore de compte ? <Link to="/inscription" className="font-semibold text-brand-700">Créer mon restaurant</Link> · <Link to="/" className="text-stone-500 underline">Retour au site</Link></p>
        </form>
      </div>
    </div>
  );
}

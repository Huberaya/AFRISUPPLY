import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Logo } from '../components/AppLayout';

export default function Login() {
  const { login } = useAuth(); const nav = useNavigate();
  const [email, setEmail] = useState('awa@chezawa.fr'); const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(null); try { await login(email, password); nav('/app'); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } };
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
          <p className="text-sm text-stone-500">Compte démo pré-rempli : <b>awa@chezawa.fr</b> / <b>demo1234</b></p>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <label className="block text-sm font-medium">E-mail<input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label className="block text-sm font-medium">Mot de passe<input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
          <p className="text-center text-sm text-stone-500">Pas encore de compte ? <Link to="/inscription" className="font-semibold text-brand-700">Créer mon restaurant</Link> · <Link to="/" className="text-stone-500 underline">Retour au site</Link></p>
        </form>
      </div>
    </div>
  );
}

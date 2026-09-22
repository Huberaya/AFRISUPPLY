// Chantier 2 (audit) — choix d'un nouveau mot de passe (lien reçu par e-mail, ou lien d'invitation d'un membre).
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Logo, HomeButton } from '../components/AppLayout';

type Policy = { minLength: number; hint: string };

export default function Reset() {
  const [sp] = useSearchParams(); const nav = useNavigate(); const { login } = useAuth();
  const token = sp.get('token') ?? '';
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [policy, setPolicy] = useState<Policy>({ minLength: 8, hint: 'Au moins 8 caractères.' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [done, setDone] = useState<string | null>(null);

  useEffect(() => { void api<Policy>('/auth/password-policy').then(setPolicy).catch(() => null); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(null);
    if (pw !== pw2) { setError('Les deux mots de passe ne sont pas identiques.'); return; }
    setBusy(true);
    try {
      const r = await api<{ message: string }>('/auth/reset-password', { method: 'POST', json: { token, password: pw } });
      setDone(r.message);
      setTimeout(() => nav('/connexion'), 2500);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
    void login;
  };

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div className="mb-2 flex items-center justify-between gap-2"><Logo /><HomeButton /></div>
        <h1 className="text-2xl font-extrabold">{token ? 'Nouveau mot de passe' : 'Lien incomplet'}</h1>
        {!token && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">Ce lien ne contient pas de jeton. Demandez un nouveau lien depuis « Mot de passe oublié ».</p>}
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {done ? (
          <p className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">{done}<br />Redirection vers la connexion…</p>
        ) : token ? (<>
          <p className="text-sm text-stone-500">{policy.hint}</p>
          <label className="block text-sm font-medium">Nouveau mot de passe
            <input className="input mt-1" type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={policy.minLength} required autoFocus autoComplete="new-password" />
          </label>
          <label className="block text-sm font-medium">Confirmer
            <input className="input mt-1" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={policy.minLength} required autoComplete="new-password" />
          </label>
          <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? 'Enregistrement…' : 'Choisir ce mot de passe'}</button>
        </>) : null}
        <p className="text-center text-sm text-stone-500"><Link to="/connexion" className="underline">Retour à la connexion</Link></p>
      </form>
    </div>
  );
}

// Chantier 2 (audit) — « Mot de passe oublié » : demande d'un lien de réinitialisation.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Logo } from '../components/AppLayout';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ message: string; devLink?: string } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const r = await api<{ message: string; devLink?: string }>('/auth/forgot-password', { method: 'POST', json: { email } });
      setSent(r);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div className="mb-2"><Logo /></div>
        <h1 className="text-2xl font-extrabold">Mot de passe oublié</h1>
        {!sent ? (<>
          <p className="text-sm text-stone-500">Indiquez l’adresse de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe (valable 1 heure).</p>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <label className="block text-sm font-medium">E-mail
            <input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? 'Envoi…' : 'Envoyer le lien'}</button>
        </>) : (<>
          <p className="rounded-xl bg-brand-50 border border-brand-100 p-3 text-sm text-brand-900">{sent.message}</p>
          {sent.devLink && (
            <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
              Environnement de développement (aucun e-mail réel envoyé) : <a className="underline break-all" href={sent.devLink}>{sent.devLink}</a>
            </p>
          )}
        </>)}
        <p className="text-center text-sm text-stone-500"><Link to="/connexion" className="underline">Retour à la connexion</Link></p>
      </form>
    </div>
  );
}

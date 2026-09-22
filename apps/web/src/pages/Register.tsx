import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Logo, HomeButton } from '../components/AppLayout';

export default function Register() {
  const { register } = useAuth(); const nav = useNavigate(); const [sp] = useSearchParams(); const [invite, setInvite] = useState<{ code: string; offer: { discountPct: number; trialDays: number } } | null>(null);
  const [f, setF] = useState({ fullName: '', email: '', password: '', restaurantName: '', city: '', coversPerDay: 50, inviteCode: (sp.get('code') ?? '').toUpperCase() });
  useEffect(() => { const code = (sp.get('code') ?? '').toUpperCase(); if (!code) return; api<{ valid: boolean; restaurantName: string; contactName: string; email: string; city: string | null; coversPerDay: number | null; offer: { discountPct: number; trialDays: number } }>(`/public/invite/${code}`).then((r) => { setInvite({ code, offer: r.offer }); setF((x) => ({ ...x, inviteCode: code, fullName: r.contactName, email: r.email, restaurantName: r.restaurantName, city: r.city ?? '', coversPerDay: r.coversPerDay ?? 50 })); }).catch(() => setInvite(null)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === 'coversPerDay' ? Number(e.target.value) : e.target.value });
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(null); try { await register(f); nav(sp.get('next')?.startsWith('/') ? sp.get('next')! : '/app/demarrer'); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } };
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Logo />
          <HomeButton />
        </div>
        <h1 className="text-2xl font-extrabold">Créer mon espace</h1>
        <p className="text-sm text-stone-500">{sp.get('next') === '/panier' ? 'Compte restaurant gratuit — vous pourrez commander juste après.' : '30 jours d’essai gratuit, sans carte bancaire.'}</p>
        {invite && <p className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">🎁 <b>Invitation pilote fondateur</b> ({invite.code}) : {invite.offer.trialDays} jours gratuits puis −{invite.offer.discountPct} % à vie.</p>}
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-sm font-medium">Nom du restaurant<input className="input mt-1" value={f.restaurantName} onChange={set('restaurantName')} required minLength={2} /></label>
          <label className="text-sm font-medium">Ville<input className="input mt-1" value={f.city} onChange={set('city')} /></label>
          <label className="text-sm font-medium">Couverts / jour<input className="input mt-1" type="number" min={1} value={f.coversPerDay} onChange={set('coversPerDay')} /></label>
          <label className="col-span-2 text-sm font-medium">Votre nom<input className="input mt-1" value={f.fullName} onChange={set('fullName')} required minLength={2} /></label>
          <label className="col-span-2 text-sm font-medium">E-mail<input className="input mt-1" type="email" value={f.email} onChange={set('email')} required /></label>
          <label className="col-span-2 text-sm font-medium">Mot de passe (8 caractères min.)<input className="input mt-1" type="password" value={f.password} onChange={set('password')} required minLength={8} /></label>
        </div>
        <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? 'Création…' : 'Démarrer l’essai gratuit'}</button>
        <p className="text-center text-sm text-stone-500">Déjà un compte ? <Link to={`/connexion${sp.get('next') ? `?next=${encodeURIComponent(sp.get('next')!)}` : ''}`} className="font-semibold text-brand-700">Se connecter</Link></p>
      </form>
    </div>
  );
}

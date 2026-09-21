// Chantier 14 — Atterrissage d'un grossiste invité : fiche pré-remplie par l'équipe, création du compte inline, activation immédiate.
import { useEffect, useState } from 'react';
import { Check, Store, Sparkles } from 'lucide-react';
import { api, tokenStore, CATEGORY_LABEL } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Field } from '../../components/Modal';

type Invite = { pid: string; name: string; city: string | null; phone: string | null; email: string | null; contactName: string | null; converted: boolean };
export function InviteLanding({ token, onDone }: { token: string; onDone: () => void }) {
  const { register, login } = useAuth();
  const [inv, setInv] = useState<Invite | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [mode, setMode] = useState<'new' | 'login'>('new');
  const [f, setF] = useState({ fullName: '', email: '', password: '', city: '', deliveryZones: '', categories: ['feculents', 'epicerie'] as string[], minOrderEur: '0', leadTimeHours: '48', contactPhone: '', whatsapp: '', acceptCgv: false });
  useEffect(() => { api<{ invite: Invite }>(`/public/vendor-invite/${token}`).then((r) => { setInv(r.invite); setF((x) => ({ ...x, fullName: r.invite.contactName ?? '', email: r.invite.email ?? '', city: r.invite.city ?? '', deliveryZones: r.invite.city ?? '', contactPhone: r.invite.phone ?? '', whatsapp: r.invite.phone ?? '' })); }).catch((e) => setErr((e as Error).message)); }, [token]);
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      if (!tokenStore.authed()) { if (mode === 'new') await register({ email: f.email, password: f.password, fullName: f.fullName || inv!.name, restaurantName: inv!.name }); else await login(f.email, f.password); }
      await api('/vendor/register', { method: 'POST', json: { acceptCgv: f.acceptCgv, name: inv!.name, city: f.city || undefined, deliveryZones: f.deliveryZones.split(/[,;]+/).map((s) => s.trim()).filter(Boolean), categories: f.categories, leadTimeHours: Number(f.leadTimeHours) || 48, minOrderEur: Number(f.minOrderEur) || 0, deliveryFeeEur: 0, contactEmail: f.email || undefined, contactPhone: f.contactPhone || undefined, whatsapp: f.whatsapp || undefined, invite: token } });
      history.replaceState(null, '', '/fournisseur'); onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  if (err && !inv) return <div className="card mx-auto max-w-lg text-center"><p className="font-bold text-red-700">{err}</p><p className="mt-2 text-sm text-stone-600">Le lien a peut-être expiré. Vous pouvez tout de même <a className="underline" href="/fournisseur">créer votre espace fournisseur</a>.</p></div>;
  if (!inv) return <p className="text-stone-500">Chargement de votre invitation…</p>;
  const logged = !!tokenStore.authed();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white"><p className="flex items-center gap-2 text-sm font-semibold text-brand-100"><Sparkles size={16} /> Invitation personnelle</p><h1 className="mt-1 text-3xl font-extrabold">{inv.name}, votre fiche est prête.</h1><p className="mt-2 text-brand-50">200 restaurants africains cherchent des grossistes fiables. Créez votre mot de passe, collez votre tarif : vous êtes en ligne en 10 minutes. Sans abonnement, commission uniquement sur les ventes réalisées.</p></div>
      {inv.converted && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><Check size={14} className="mr-1 inline" />Un espace existe déjà pour cette invitation — connectez-vous.</p>}
      <div className="card space-y-3">
        <h2 className="flex items-center gap-2 font-bold"><Store size={18} /> Votre entreprise</h2>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Nom"><input className="input" value={inv.name} disabled /></Field><Field label="Ville / entrepôt"><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field></div>
        <Field label="Zones livrées" hint="Villes ou départements, séparés par des virgules (ex. Paris, 93, 94)"><input className="input" value={f.deliveryZones} onChange={(e) => setF({ ...f, deliveryZones: e.target.value })} /></Field>
        <Field label="Ce que vous vendez"><div className="flex flex-wrap gap-1.5">{Object.entries(CATEGORY_LABEL).map(([k, l]) => <button type="button" key={k} onClick={() => setF({ ...f, categories: f.categories.includes(k) ? f.categories.filter((x) => x !== k) : [...f.categories, k] })} className={`pill ${f.categories.includes(k) ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-700'}`}>{l}</button>)}</div></Field>
        <div className="grid gap-3 sm:grid-cols-3"><Field label="Minimum de commande (€)"><input className="input" type="number" value={f.minOrderEur} onChange={(e) => setF({ ...f, minOrderEur: e.target.value })} /></Field><Field label="Délai de livraison (h)"><input className="input" type="number" value={f.leadTimeHours} onChange={(e) => setF({ ...f, leadTimeHours: e.target.value })} /></Field><Field label="Téléphone / WhatsApp"><input className="input" value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value, whatsapp: e.target.value })} /></Field></div>
      </div>
      {!logged && <div className="card space-y-3">
        <div className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm font-semibold">{(['new', 'login'] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-lg py-2 ${mode === m ? 'bg-white shadow-sm' : 'text-stone-500'}`}>{m === 'new' ? 'Créer mon accès' : 'J’ai déjà un compte'}</button>)}</div>
        {mode === 'new' && <Field label="Votre nom"><input className="input" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>}
        <div className="grid gap-3 sm:grid-cols-2"><Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field><Field label={mode === 'new' ? 'Choisissez un mot de passe (8 car. min.)' : 'Mot de passe'}><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field></div>
      </div>}
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      <label className="flex items-start gap-2 rounded-xl bg-stone-50 p-3 text-sm"><input type="checkbox" className="mt-0.5" checked={f.acceptCgv} onChange={(e) => setF({ ...f, acceptCgv: e.target.checked })} /><span>J’accepte les <a className="font-semibold underline" href="/cgv-fournisseur" target="_blank" rel="noreferrer">conditions générales fournisseur</a> : confirmation sous 24 h, facturation directe au restaurant, commission de 2 à 5 % HT sur les commandes confirmées via la plateforme.</span></label>
      <button className="btn-primary w-full !py-3 text-base" disabled={busy || !f.acceptCgv || (!logged && (!f.email.includes('@') || f.password.length < 8))} onClick={() => void go()}>{busy ? 'Activation…' : 'Activer mon espace et importer mon tarif →'}</button>
      <p className="text-center text-xs text-stone-500">Espace activé immédiatement (vous avez été vérifié par notre équipe). Étape suivante : coller votre tarif Excel, texte ou photo.</p>
    </div>
  );
}

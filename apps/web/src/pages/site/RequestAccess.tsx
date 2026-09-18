import { useState, type FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import { FOUNDER } from '../../lib/plans';
import { Field } from '../../components/Modal';

const CUISINES = ['Sénégalaise', 'Ivoirienne', 'Camerounaise', 'Congolaise', 'Malienne', 'Guinéenne', 'Panafricaine', 'Afro-fusion', 'Autre'];

export default function RequestAccess() {
  const [sp] = useSearchParams();
  const [f, setF] = useState({ restaurantName: '', contactName: '', email: '', phone: '', city: '', cuisine: '', coversPerDay: '', message: '', planInterest: sp.get('plan') ?? 'pilote', website: '' });
  const [done, setDone] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const utm: Record<string, string> = {}; sp.forEach((v, k) => { if (k.startsWith('utm_')) utm[k] = v; });
    try {
      const r = await api<{ message: string }>('/public/leads', { method: 'POST', json: { ...f, phone: f.phone || undefined, city: f.city || undefined, cuisine: f.cuisine || undefined, message: f.message || undefined, coversPerDay: f.coversPerDay ? Number(f.coversPerDay) : undefined, utm: Object.keys(utm).length ? utm : undefined, source: sp.get('source') ?? 'site' } });
      setDone(r.message);
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  if (done) return <div className="mx-auto max-w-xl px-4 py-24 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={48} /><h1 className="mt-4 text-3xl font-extrabold">{done}</h1><p className="mt-3 text-stone-600">En attendant, vous pouvez explorer la démo avec le restaurant fictif « Chez Awa ».</p><Link to="/connexion" className="btn-primary mt-6">Voir la démo</Link></div>;
  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-4 py-16 lg:grid-cols-5 lg:px-8">
      <div className="lg:col-span-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Demander un accès</h1>
        <p className="mt-3 text-stone-600">On ouvre les accès par petits groupes pour accompagner chaque restaurant. Réponse sous 24 h ouvrées.</p>
        <div className="mt-6 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900"><b>Offre pilote fondateur</b><br />{FOUNDER.trialDays} jours gratuits sans carte bancaire, puis −{FOUNDER.discountPct} % à vie. Il reste des places parmi les {FOUNDER.seats} premiers.</div>
        <ul className="mt-6 space-y-2 text-sm text-stone-700"><li>✅ Mise en route ensemble en visio (20 min)</li><li>✅ Import de vos fournisseurs par nos soins si vous le souhaitez</li><li>✅ Ligne WhatsApp directe avec l’équipe</li></ul>
      </div>
      <form onSubmit={submit} className="card lg:col-span-3 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Nom du restaurant"><input className="input" required value={f.restaurantName} onChange={(e) => set('restaurantName', e.target.value)} placeholder="Chez Awa" /></Field></div>
        <Field label="Votre nom"><input className="input" required value={f.contactName} onChange={(e) => set('contactName', e.target.value)} /></Field>
        <Field label="E-mail"><input className="input" type="email" required value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Téléphone / WhatsApp"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Ville"><input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="Nantes" /></Field>
        <Field label="Cuisine"><select className="input" value={f.cuisine} onChange={(e) => set('cuisine', e.target.value)}><option value="">—</option>{CUISINES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Couverts par jour (environ)"><input className="input" type="number" min={1} value={f.coversPerDay} onChange={(e) => set('coversPerDay', e.target.value)} placeholder="80" /></Field>
        <div className="sm:col-span-2"><Field label="Formule qui vous intéresse"><div className="flex flex-wrap gap-2">{[['pilote', '⭐ Pilote fondateur'], ['starter', 'Starter'], ['pro', 'Pro'], ['business', 'Business']].map(([v, l]) => <button type="button" key={v} onClick={() => set('planInterest', v)} className={`pill !px-3 !py-1.5 ${f.planInterest === v ? 'bg-brand-700 text-white' : 'bg-stone-100 text-stone-700'}`}>{l}</button>)}</div></Field></div>
        <div className="sm:col-span-2"><Field label="Votre plus gros casse-tête d’achats aujourd’hui (optionnel)"><textarea className="input" rows={3} value={f.message} onChange={(e) => set('message', e.target.value)} placeholder="Les ruptures de plantain le week-end, les prix qui bougent…" /></Field></div>
        <input type="text" className="hidden" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set('website', e.target.value)} aria-hidden="true" />
        {err && <p className="sm:col-span-2 text-sm text-red-700">{err}</p>}
        <div className="sm:col-span-2 flex items-center justify-between gap-3"><p className="text-xs text-stone-500">En envoyant, vous acceptez d’être recontacté(e). Aucune revente de données.</p><button className="btn-primary" disabled={busy}>{busy ? 'Envoi…' : 'Envoyer ma demande'}</button></div>
      </form>
    </div>
  );
}

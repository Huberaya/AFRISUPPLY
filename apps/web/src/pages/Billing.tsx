// Chantier 6 — /app/abonnement : état de l'essai, choix de formule (Stripe Checkout), gestion (Stripe Portal).
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Check, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox } from '../components/ui';

type Plan = { id: 'starter' | 'pro' | 'business'; name: string; priceMonthly: number; founderPrice: number; tagline: string; highlight: boolean; features: readonly string[]; available: boolean };
type B = { plan: string; founder: boolean; subscriptionStatus: string; trialEndsAt: string | null; currentPeriodEnd: string | null; state: 'trialing' | 'active' | 'past_due' | 'expired'; trialDaysLeft: number | null; blocked: boolean; enforced: boolean; stripe: boolean; hasSubscription: boolean; plans: Plan[]; founderOffer: { discountPct: number; seats: number; trialDays: number } };

export default function Billing() {
  const [sp] = useSearchParams(); const { data, loading, error, reload } = useApi<B>('/billing');
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { const ck = sp.get('checkout'); if (ck === 'ok') { setMsg('🎉 Merci ! Votre abonnement est en cours d’activation…'); api('/billing/sync', { method: 'POST', json: { sessionId: sp.get('session_id') ?? undefined } }).then(() => { setMsg('🎉 Abonnement actif. Bienvenue à bord !'); reload(); }).catch(() => setMsg('Paiement reçu — l’activation prend quelques secondes, rechargez la page.')); } if (ck === 'annule') setMsg('Paiement annulé — vous pouvez réessayer quand vous voulez.'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading) return <Loader />; if (error) return <ErrorBox message={error} />; if (!data) return null;
  const go = async (path: string, json?: unknown) => { setBusy(path + JSON.stringify(json ?? '')); setMsg(null); try { const r = await api<{ url: string }>(path, { method: 'POST', json }); window.location.href = r.url; } catch (e) { setMsg((e as Error).message); setBusy(null); } };
  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const banner = data.state === 'active' ? { tone: 'bg-emerald-50 border-emerald-200 text-emerald-900', text: <>✅ Abonnement <b className="capitalize">{data.plan}</b> actif{data.founder ? ' · tarif pilote fondateur −50 % à vie' : ''} · prochain prélèvement le {fmt(data.currentPeriodEnd)}.</> }
    : data.state === 'past_due' ? { tone: 'bg-red-50 border-red-200 text-red-900', text: <>⚠️ <b>Dernier paiement refusé.</b> Mettez à jour votre carte pour éviter l’interruption{data.blocked ? ' — l’écriture est suspendue' : ''}.</> }
    : data.state === 'expired' ? { tone: 'bg-amber-50 border-amber-200 text-amber-900', text: <>⏰ <b>Votre essai gratuit est terminé.</b> Vos données sont conservées, l’app est en lecture seule : choisissez une formule pour reprendre la main.</> }
    : { tone: 'bg-brand-50 border-brand-200 text-brand-900', text: <>🎁 Essai gratuit : <b>{data.trialDaysLeft} jour{(data.trialDaysLeft ?? 0) > 1 ? 's' : ''} restant{(data.trialDaysLeft ?? 0) > 1 ? 's' : ''}</b> (jusqu’au {fmt(data.trialEndsAt)}), toutes les fonctions Pro incluses. Abonnez-vous maintenant : vous n’êtes prélevé qu’à la fin de l’essai.</> };
  return (
    <div className="animate-fade-up space-y-6">
      <PageTitle title="💳 Mon abonnement" subtitle="Sans engagement, résiliable en un clic. Paiement sécurisé par Stripe, facture chaque mois." />
      <div className={`rounded-2xl border p-4 text-sm ${banner.tone}`}>{banner.text}</div>
      {msg && <p className="rounded-xl border border-stone-200 bg-white p-3 text-sm">{msg}</p>}
      {data.founder && <p className="flex items-center gap-2 rounded-xl bg-yellow-50 p-3 text-sm text-yellow-900"><Sparkles size={16} /> Vous êtes <b>restaurant pilote fondateur</b> : −{data.founderOffer.discountPct} % à vie sur toutes les formules. Merci de construire AFRISUPPLY avec nous.</p>}
      <div className="grid gap-4 md:grid-cols-3">
        {data.plans.map((p) => { const current = data.plan === p.id && data.state === 'active'; const price = data.founder ? p.founderPrice : p.priceMonthly; return (
          <div key={p.id} className={`card relative flex flex-col ${p.highlight ? 'ring-2 ring-brand-500' : ''}`}>
            {p.highlight && <span className="pill absolute -top-3 left-5 bg-brand-600 text-white">Le plus choisi</span>}
            <h2 className="text-xl font-bold">{p.name}</h2><p className="text-sm text-stone-500">{p.tagline}</p>
            <p className="mt-4"><span className="text-4xl font-extrabold">{price} €</span><span className="text-stone-500"> HT / mois</span>{data.founder && <span className="ml-2 text-sm text-stone-400 line-through">{p.priceMonthly} €</span>}</p>
            <ul className="mt-4 flex-1 space-y-1.5 text-sm text-stone-700">{p.features.map((f) => <li key={f} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-600" /> {f}</li>)}</ul>
            {current ? <span className="btn-ghost mt-6 justify-center cursor-default">✓ Votre formule</span>
              : data.hasSubscription && data.state !== 'expired' ? <button className="btn-ghost mt-6 justify-center" onClick={() => void go('/billing/portal')}>Changer pour {p.name}</button>
              : <button className={`mt-6 justify-center ${p.highlight ? 'btn-primary' : 'btn-ghost'}`} disabled={busy !== null} onClick={() => void go('/billing/checkout', { plan: p.id })}><CreditCard size={16} /> {data.state === 'trialing' ? `Choisir ${p.name}` : `Reprendre avec ${p.name}`}</button>}
          </div>); })}
      </div>
      {data.hasSubscription && <div className="card flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold">Gérer mon abonnement</p><p className="text-sm text-stone-600">Factures, moyen de paiement, changement de formule, résiliation — tout se passe dans votre espace sécurisé Stripe.</p></div><button className="btn-ghost" onClick={() => void go('/billing/portal')}>Ouvrir mon espace de facturation</button></div>}
      <div className="grid gap-3 text-sm text-stone-600 md:grid-cols-3">
        <p className="flex gap-2"><ShieldCheck size={18} className="shrink-0 text-emerald-600" /> Vos données restent à vous : export complet à tout moment dans <Link className="underline" to="/app/parametres">Paramètres</Link>.</p>
        <p className="flex gap-2"><ShieldCheck size={18} className="shrink-0 text-emerald-600" /> Sans engagement : résiliez quand vous voulez, l’accès reste actif jusqu’à la fin du mois payé.</p>
        <p className="flex gap-2"><ShieldCheck size={18} className="shrink-0 text-emerald-600" /> Une question, un budget serré ? <a className="underline" href="mailto:bonjour@afrisupply.fr">bonjour@afrisupply.fr</a> — on trouve une solution.</p>
      </div>
    </div>
  );
}

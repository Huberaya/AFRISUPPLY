// Chantier 6/7 — /app/abonnement : état de l'essai, choix de formule (Stripe Checkout), gestion (Stripe Portal),
// factures AFRISUPPLY téléchargeables. Lorsque le paiement en ligne n'est pas configuré, la page le dit
// clairement et propose l'activation par e-mail ou virement (aucun bouton trompeur).
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Check, CreditCard, FileText, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { api, openPdf, fmtEur } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox } from '../components/ui';

type Plan = { id: 'starter' | 'pro' | 'business'; name: string; priceMonthly: number; founderPrice: number; tagline: string; highlight: boolean; features: readonly string[]; available: boolean };
type Health = { ok: boolean; stripe: boolean; webhookReady: boolean; missing: string[]; mode: string; message: string; webhookUrl: string };
type B = { plan: string; founder: boolean; subscriptionStatus: string; trialEndsAt: string | null; currentPeriodEnd: string | null; state: 'trialing' | 'active' | 'past_due' | 'expired'; trialDaysLeft: number | null; blocked: boolean; enforced: boolean; stripe: boolean; hasSubscription: boolean; plans: Plan[]; founderOffer: { discountPct: number; seats: number; trialDays: number }; health: Health; price: { monthly: number; list: number }; seats: number };
type Inv = { id: string; number: string; plan: string; founder: boolean; amountEur: number; vatRate: number; periodStart: string; periodEnd: string; status: string; source: string; hostedUrl: string | null; paidAt: string | null; issuedAt: string };
type InvoiceList = { invoices: Inv[]; billingEmail: string | null; emitterComplete: boolean; stripe: boolean };

const STATUS: Record<string, { label: string; tone: string }> = {
  payee: { label: 'payée', tone: 'bg-emerald-50 text-emerald-800' },
  ouverte: { label: 'à payer', tone: 'bg-amber-50 text-amber-800' },
  annulee: { label: 'annulée', tone: 'bg-stone-100 text-stone-600' },
};

export default function Billing() {
  const [sp] = useSearchParams(); const { data, loading, error, reload } = useApi<B>('/billing');
  const { data: inv, reload: reloadInv } = useApi<InvoiceList>('/billing/invoices');
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { const ck = sp.get('checkout'); if (ck === 'ok') { setMsg('🎉 Merci ! Votre abonnement est en cours d’activation…'); api('/billing/sync', { method: 'POST', json: { sessionId: sp.get('session_id') ?? undefined } }).then(() => { setMsg('🎉 Abonnement actif. Bienvenue à bord !'); reload(); reloadInv(); }).catch(() => setMsg('Paiement reçu — l’activation prend quelques secondes, rechargez la page.')); } if (ck === 'annule') setMsg('Paiement annulé — vous pouvez réessayer quand vous voulez.'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading) return <Loader />; if (error) return <ErrorBox message={error} />; if (!data) return null;
  const go = async (path: string, json?: unknown) => { setBusy(path + JSON.stringify(json ?? '')); setMsg(null); try { const r = await api<{ url: string }>(path, { method: 'POST', json }); window.location.href = r.url; } catch (e) { setMsg((e as Error).message); setBusy(null); } };
  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const send = async (i: Inv) => { setBusy('send-' + i.id); try { await api(`/billing/invoices/${i.id}/send`, { method: 'POST' }); setMsg(`Facture ${i.number} renvoyée à ${inv?.billingEmail ?? 'votre adresse de facturation'}.`); } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); } };
  const banner = data.state === 'active' ? { tone: 'bg-emerald-50 border-emerald-200 text-emerald-900', text: <>✅ Abonnement <b className="capitalize">{data.plan}</b> actif{data.founder ? ' · tarif pilote fondateur −50 % à vie' : ''} · {fmtEur(data.price.monthly, 0)} HT / mois · prochain prélèvement le {fmt(data.currentPeriodEnd)}.</> }
    : data.state === 'past_due' ? { tone: 'bg-red-50 border-red-200 text-red-900', text: <>⚠️ <b>Dernier paiement refusé.</b> Mettez à jour votre carte pour éviter l’interruption{data.blocked ? ' — l’écriture est suspendue' : ''}.</> }
    : data.state === 'expired' ? { tone: 'bg-amber-50 border-amber-200 text-amber-900', text: <>⏰ <b>Votre essai gratuit est terminé.</b> Vos données sont conservées, l’app est en lecture seule : choisissez une formule pour reprendre la main.</> }
    : { tone: 'bg-brand-50 border-brand-200 text-brand-900', text: <>🎁 Essai gratuit : <b>{data.trialDaysLeft} jour{(data.trialDaysLeft ?? 0) > 1 ? 's' : ''} restant{(data.trialDaysLeft ?? 0) > 1 ? 's' : ''}</b> (jusqu’au {fmt(data.trialEndsAt)}), toutes les fonctions Pro incluses. Abonnez-vous maintenant : vous n’êtes prélevé qu’à la fin de l’essai.</> };
  return (
    <div className="animate-fade-up space-y-6">
      <PageTitle title="💳 Mon abonnement" subtitle="Sans engagement, résiliable en un clic. Facture AFRISUPPLY en PDF chaque mois." />
      <div className={`rounded-2xl border p-4 text-sm ${banner.tone}`}>{banner.text}</div>
      {msg && <p className="rounded-xl border border-stone-200 bg-white p-3 text-sm">{msg}</p>}
      {!data.stripe && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Paiement en ligne pas encore ouvert sur cet environnement</p>
          <p className="mt-1">Le guichet de paiement par carte n’est pas encore activé ici : aucun prélèvement ne peut être déclenché depuis cette page. Pour activer une formule, répondez simplement à l’e-mail de bienvenue ou écrivez à <a className="underline" href="mailto:bonjour@afrisupply.fr">bonjour@afrisupply.fr</a> — nous vous envoyons la facture (carte, virement ou prélèvement au choix).</p>
          {data.health.missing.length > 0 && <p className="mt-2 text-xs text-amber-800">Configuration à compléter côté AFRISUPPLY : {data.health.missing.join(', ')}.</p>}
        </div>
      )}
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
              : data.stripe ? <button className={`mt-6 justify-center ${p.highlight ? 'btn-primary' : 'btn-ghost'}`} disabled={busy !== null} onClick={() => void go('/billing/checkout', { plan: p.id })}><CreditCard size={16} /> {data.state === 'trialing' ? `Choisir ${p.name}` : `Reprendre avec ${p.name}`}</button>
              : <a className={`mt-6 justify-center ${p.highlight ? 'btn-primary' : 'btn-ghost'}`} href={`mailto:bonjour@afrisupply.fr?subject=${encodeURIComponent(`AFRISUPPLY — activer la formule ${p.name}`)}&body=${encodeURIComponent(`Bonjour, je souhaite activer la formule ${p.name} (${price} € HT/mois) pour mon restaurant. Merci de m'envoyer la facture et les modalités de paiement.`)}`}><Mail size={16} /> Demander l’activation — {p.name}</a>}
          </div>); })}
      </div>
      {data.hasSubscription && data.stripe && <div className="card flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold">Gérer mon abonnement</p><p className="text-sm text-stone-600">Moyen de paiement, changement de formule, résiliation — dans votre espace sécurisé Stripe. Vos factures AFRISUPPLY restent ici, téléchargeables.</p></div><button className="btn-ghost" onClick={() => void go('/billing/portal')}>Ouvrir mon espace de facturation</button></div>}

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold"><FileText size={18} /> Mes factures AFRISUPPLY</h2>
          {inv?.billingEmail && <p className="text-xs text-stone-500">Envoyées à <b>{inv.billingEmail}</b> · modifiable dans <Link className="underline" to="/app/parametres">Paramètres</Link></p>}
        </div>
        {!inv || inv.invoices.length === 0
          ? <p className="text-sm text-stone-600">Aucune facture pour l’instant. {data.state === 'trialing' ? 'Votre essai est gratuit : la première facture arrivera à l’abonnement.' : 'La prochaine facture apparaîtra ici dès son émission.'}</p>
          : <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="p-3">N°</th><th className="p-3">Période</th><th className="p-3">Montant HT</th><th className="p-3">Statut</th><th className="p-3">Actions</th></tr></thead>
              <tbody className="divide-y divide-stone-100">{inv.invoices.map((i) => <tr key={i.id}>
                <td className="p-3 font-semibold">{i.number}{i.founder && <span className="pill ml-2 bg-yellow-50 text-yellow-800">−50 %</span>}</td>
                <td className="p-3">{fmt(i.periodStart)} → {fmt(i.periodEnd)}</td>
                <td className="p-3">{fmtEur(i.amountEur)}<span className="text-xs text-stone-500"> + TVA {Number(i.vatRate).toFixed(0)} %</span></td>
                <td className="p-3"><span className={`pill ${STATUS[i.status]?.tone ?? 'bg-stone-100'}`}>{STATUS[i.status]?.label ?? i.status}</span>{i.source === 'stripe' && <span className="ml-2 text-xs text-stone-500">carte</span>}</td>
                <td className="p-3 space-x-3 whitespace-nowrap">
                  <button className="text-xs underline" onClick={() => void openPdf(`/billing/invoices/${i.id}/pdf`).catch((e) => setMsg((e as Error).message))}>PDF</button>
                  <button className="text-xs underline" disabled={busy !== null} onClick={() => void send(i)}>Recevoir par e-mail</button>
                  {i.hostedUrl && <a className="text-xs underline" href={i.hostedUrl} target="_blank" rel="noreferrer">Reçu Stripe</a>}
                </td></tr>)}</tbody></table></div>}
        {inv && !inv.emitterComplete && <p className="text-xs text-amber-700">⚠️ Mentions légales de l’émetteur à compléter (SIRET, TVA) — les factures le signalent explicitement.</p>}
      </div>

      <div className="grid gap-3 text-sm text-stone-600 md:grid-cols-3">
        <p className="flex gap-2"><ShieldCheck size={18} className="shrink-0 text-emerald-600" /> Vos données restent à vous : export complet à tout moment dans <Link className="underline" to="/app/parametres">Paramètres</Link>.</p>
        <p className="flex gap-2"><ShieldCheck size={18} className="shrink-0 text-emerald-600" /> Sans engagement : résiliez quand vous voulez, l’accès reste actif jusqu’à la fin du mois payé.</p>
        <p className="flex gap-2"><ShieldCheck size={18} className="shrink-0 text-emerald-600" /> Une question, un budget serré ? <a className="underline" href="mailto:bonjour@afrisupply.fr">bonjour@afrisupply.fr</a> — on trouve une solution.</p>
      </div>
    </div>
  );
}

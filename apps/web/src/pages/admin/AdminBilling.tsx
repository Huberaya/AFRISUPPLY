// Admin : vue abonnements (MRR, essais, fondateurs), offre pilote fondateur, factures d'abonnement AFRISUPPLY
// (émission manuelle / encaissement / envoi) et factures de commission fournisseurs. Santé de l'encaissement affichée.
import { useEffect, useState } from 'react';
import { api, fmtEur, fmtDate } from '../../lib/api';
import { PageTitle, ErrorBox, Stat } from '../../components/ui';
import { Modal, Field } from '../../components/Modal';
import { useToast } from '../../components/Feedback';

type R = { id: string; name: string; city: string | null; plan: string; founder: boolean; subscriptionStatus: string; trialEndsAt: string | null; state: string; trialDaysLeft: number | null; blocked: boolean; seats: number; createdAt: string };
type SubInv = { id: string; number: string; restaurantId: string; plan: string; founder: boolean; amountEur: number; status: string; source: string; stripeInvoiceId: string | null; periodStart: string; periodEnd: string; paidAt: string | null };
type Health = { ok: boolean; stripe: boolean; webhookReady: boolean; missing: string[]; mode: string; message: string; webhookUrl: string };
type D = {
  restaurants: R[]; founders: number; founderSeatsLeft: number; mrr: number; legacyMrr: number;
  subscriptions: SubInv[]; invoices: { id: string; vendorId: string; period: string; orders: number; baseEur: string; amountEur: string; status: string; stripeInvoiceId: string | null }[];
  stripe: boolean; enforced: boolean; health: Health;
};
export default function AdminBilling() {
  const [d, setD] = useState<D | null>(null); const [err, setErr] = useState<string | null>(null); const [period, setPeriod] = useState(() => { const p = new Date(); p.setUTCDate(0); return p.toISOString().slice(0, 7); }); const [msg, setMsg] = useState<string | null>(null);
  // Chantier 11 : la bascule de formule se faisait par deux `window.prompt` successifs
  // (fenêtres du navigateur, pas de vérification, aucune trace de qui a changé quoi).
  const [planEdit, setPlanEdit] = useState<R | null>(null);
  const [planForm, setPlanForm] = useState<{ plan: string; status: string }>({ plan: 'starter', status: 'active' });
  const [planErr, setPlanErr] = useState<string | null>(null);
  const toast = useToast();
  const load = () => api<D>('/admin/billing').then(setD).catch((e) => setErr((e as Error).message));
  useEffect(() => { void load(); }, []);
  const upd = async (id: string, json: unknown) => { try { await api(`/admin/billing/restaurants/${id}`, { method: 'PUT', json }); } catch (e) { setMsg((e as Error).message); } void load(); };
  const invoice = async (dryRun: boolean) => { const r = await api<{ invoices: { vendorName: string; amount: number; via: string }[] }>('/admin/billing/commissions/invoice', { method: 'POST', json: { period, dryRun } }); setMsg(`${dryRun ? 'Simulation' : 'Émis'} ${period} : ${r.invoices.length} relevé(s) — ${r.invoices.map((i) => `${i.vendorName} ${i.amount.toFixed(2)} € (${i.via})`).join(', ') || 'rien à facturer'}`); void load(); };
  /** Bascule manuelle d'un restaurant (virement reçu, paiement hors ligne). */
  const subInvoice = async (r: R) => { const res = await api<{ invoice: SubInv; mail: { sent: boolean; reason?: string } }>(`/admin/billing/restaurants/${r.id}/invoice`, { method: 'POST', json: { months: 1 } }); setMsg(`Facture ${res.invoice.number} émise pour ${r.name} (${fmtEur(res.invoice.amountEur)}) — ${res.mail.sent ? 'envoyée par e-mail' : `non envoyée : ${res.mail.reason ?? 'transport indisponible'}`}`); void load(); };
  const setPaid = async (i: SubInv, status: 'payee' | 'ouverte' | 'annulee') => { await api(`/admin/billing/invoices/${i.id}`, { method: 'PUT', json: { status } }); void load(); };
  const PLANS = ['trial', 'starter', 'pro', 'business'] as const;
  const STATUSES = ['trialing', 'active', 'past_due', 'canceled', 'expired'] as const;
  const openPlan = (r: R) => { setPlanEdit(r); setPlanForm({ plan: r.plan, status: r.subscriptionStatus }); setPlanErr(null); };
  const savePlan = async () => {
    if (!planEdit) return;
    if (!PLANS.includes(planForm.plan as typeof PLANS[number])) { setPlanErr(`Formule inconnue : « ${planForm.plan} ». Valeurs acceptées : ${PLANS.join(', ')}.`); return; }
    if (!STATUSES.includes(planForm.status as typeof STATUSES[number])) { setPlanErr(`Statut inconnu : « ${planForm.status} ». Valeurs acceptées : ${STATUSES.join(', ')}.`); return; }
    await upd(planEdit.id, { plan: planForm.plan, subscriptionStatus: planForm.status });
    toast.success(`Formule mise à jour pour ${planEdit.name}.`, `Offre « ${planForm.plan} », statut « ${planForm.status} ». La personne le verra à sa prochaine connexion.`);
    setPlanEdit(null);
  };
  if (err) return <ErrorBox message={err} onRetry={() => void load()} />; if (!d) return null;
  return (
    <div className="animate-fade-up space-y-5">
      <PageTitle title="🛡️ Abonnements & facturation" subtitle={`Stripe ${d.stripe ? 'configuré' : 'NON configuré'} · restrictions ${d.enforced ? 'actives' : 'désactivées'}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="MRR (abonnements)" value={fmtEur(d.mrr, 0)} /><Stat label="Abonnés" value={d.restaurants.filter((r) => r.state === 'active').length} /><Stat label="En essai" value={d.restaurants.filter((r) => r.state === 'trialing').length} /><Stat label="Fondateurs" value={`${d.founders}/${d.founders + d.founderSeatsLeft}`} /></div>
      <div className={`card text-sm ${d.health.ok ? '' : 'border-amber-300 bg-amber-50'}`}>
        <p className="font-bold">État de l’encaissement : {d.health.ok ? '✅ opérationnel' : '⚠️ incomplet'}</p>
        <p className="mt-1 text-stone-700">{d.health.message}</p>
        {d.health.missing.length > 0 && <p className="mt-1 text-amber-800">À renseigner : {d.health.missing.join(', ')}</p>}
        <p className="mt-1 text-xs text-stone-500">URL de webhook à déclarer chez Stripe : <code>{d.health.webhookUrl}</code> — événements : checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed.</p>
        <p className="mt-1 text-xs text-stone-500">Bascule manuelle d’une formule (sans passer par Stripe) : bouton « Formule / statut » ci-dessous, puis « Facturer 1 mois » pour encaisser par virement.</p>
      </div>
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="p-3">Restaurant</th><th className="p-3">Formule</th><th className="p-3">État</th><th className="p-3">Sièges</th><th className="p-3">Essai</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y divide-stone-100">
        {d.restaurants.map((r) => <tr key={r.id}><td className="p-3 font-semibold">{r.name}<span className="ml-1 text-xs font-normal text-stone-400">{r.city}</span>{r.founder && <span className="pill ml-2 bg-yellow-50 text-yellow-800">fondateur</span>}</td><td className="p-3 capitalize">{r.plan}</td><td className="p-3">{r.state}{r.blocked ? ' 🔒' : ''}</td><td className="p-3">{Number.isFinite(r.seats) ? r.seats : '∞'}</td><td className="p-3">{r.trialDaysLeft !== null ? `${r.trialDaysLeft} j` : '—'}</td>
          <td className="p-3 space-x-2 whitespace-nowrap"><button className="text-xs underline" onClick={() => void upd(r.id, { founder: !r.founder })}>{r.founder ? 'Retirer fondateur' : 'Fondateur −50 %'}</button><button className="text-xs underline" onClick={() => void upd(r.id, { extendTrialDays: 14 })}>+14 j d’essai</button><button className="text-xs underline" onClick={() => openPlan(r)}>Formule / statut</button><button className="text-xs underline" onClick={() => void subInvoice(r).catch((e) => setMsg((e as Error).message))}>Facturer 1 mois</button></td></tr>)}</tbody></table></div>
      {msg && <p className="rounded-xl border border-stone-200 bg-white p-3 text-sm">{msg}</p>}

      <div className="card space-y-3"><h2 className="font-bold">Factures d’abonnement AFRISUPPLY</h2><p className="text-sm text-stone-600">Émises à chaque paiement Stripe (PDF envoyé au restaurant) ou à la main pour un virement. Marquées « payée » automatiquement au paiement par carte.</p>
        <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-stone-500"><tr><th className="p-2">N°</th><th className="p-2">Restaurant</th><th className="p-2">Période</th><th className="p-2">Montant HT</th><th className="p-2">Statut</th><th className="p-2">Actions</th></tr></thead><tbody className="divide-y divide-stone-100">{d.subscriptions.map((i) => <tr key={i.id}><td className="p-2 font-semibold">{i.number}{i.founder && <span className="pill ml-1 bg-yellow-50 text-yellow-800">−50 %</span>}</td><td className="p-2">{d.restaurants.find((r) => r.id === i.restaurantId)?.name ?? i.restaurantId.slice(0, 8)}</td><td className="p-2">{fmtDate(i.periodStart)} → {fmtDate(i.periodEnd)}</td><td className="p-2">{fmtEur(i.amountEur)}</td><td className="p-2">{i.status}{i.source === 'stripe' ? ' · carte' : ' · manuel'}</td><td className="p-2 space-x-2 whitespace-nowrap">{i.status !== 'payee' && <button className="text-xs underline" onClick={() => void setPaid(i, 'payee')}>Marquer payée</button>}{i.status !== 'annulee' && <button className="text-xs underline" onClick={() => void setPaid(i, 'annulee')}>Annuler</button>}</td></tr>)}</tbody></table>
        {d.subscriptions.length === 0 && <p className="text-sm text-stone-600">Aucune facture d’abonnement émise pour le moment.</p>}</div>

      <div className="card space-y-3"><h2 className="font-bold">Factures de commission fournisseurs</h2><p className="text-sm text-stone-600">Générées automatiquement le 1er de chaque mois (Stripe si le fournisseur a activé le prélèvement, sinon relevé par e-mail). Vous pouvez aussi lancer à la main.</p>
        <div className="flex flex-wrap items-center gap-2"><input className="input w-32" value={period} onChange={(e) => setPeriod(e.target.value)} /><button className="btn-ghost" onClick={() => void invoice(true)}>Simuler</button><button className="btn-primary" onClick={() => void invoice(false)}>Émettre</button></div>
        <table className="w-full text-sm"><tbody className="divide-y divide-stone-100">{d.invoices.map((i) => <tr key={i.id}><td className="p-2">{i.period}</td><td className="p-2">{i.orders} cmd · base {Number(i.baseEur).toFixed(2)} €</td><td className="p-2 font-bold">{Number(i.amountEur).toFixed(2)} €</td><td className="p-2">{i.status}{i.stripeInvoiceId ? ` · ${i.stripeInvoiceId}` : ''}</td></tr>)}</tbody></table></div>

      {planEdit && <Modal title={`Formule de ${planEdit.name}`} subtitle="Bascule manuelle : utile pour un client qui paie par virement ou en espèces." onClose={() => setPlanEdit(null)}>
        <div className="space-y-3">
          <Field label="Formule"><select className="input" value={planForm.plan} onChange={(e) => setPlanForm({ ...planForm, plan: e.target.value })}>{PLANS.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
          <Field label="Statut d’abonnement" hint="« active » ouvre tous les droits ; « past_due » et « expired » passent le restaurant en lecture seule."><select className="input" value={planForm.status} onChange={(e) => setPlanForm({ ...planForm, status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
          {planErr && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{planErr}</p>}
          <p className="text-xs text-stone-500">Le changement est immédiat côté serveur et tracé dans les journaux d’exploitation, avec l’adresse de l’administrateur qui l’a effectué.</p>
        </div>
        <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setPlanEdit(null)}>Annuler</button><button className="btn-primary" onClick={() => void savePlan()}>Enregistrer la formule</button></div>
      </Modal>}
    </div>
  );
}

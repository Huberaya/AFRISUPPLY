// Admin : vue abonnements (MRR, essais, fondateurs), offre pilote fondateur, factures de commission.
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { PageTitle, ErrorBox, Stat } from '../../components/ui';

type R = { id: string; name: string; city: string | null; plan: string; founder: boolean; subscriptionStatus: string; trialEndsAt: string | null; state: string; trialDaysLeft: number | null; blocked: boolean; createdAt: string };
type D = { restaurants: R[]; founders: number; founderSeatsLeft: number; mrr: number; invoices: { id: string; vendorId: string; period: string; orders: number; baseEur: string; amountEur: string; status: string; stripeInvoiceId: string | null }[]; stripe: boolean; enforced: boolean };
export default function AdminBilling() {
  const [d, setD] = useState<D | null>(null); const [err, setErr] = useState<string | null>(null); const [period, setPeriod] = useState(() => { const p = new Date(); p.setUTCDate(0); return p.toISOString().slice(0, 7); }); const [msg, setMsg] = useState<string | null>(null);
  const load = () => api<D>('/admin/billing').then(setD).catch((e) => setErr((e as Error).message));
  useEffect(() => { void load(); }, []);
  const upd = async (id: string, json: unknown) => { await api(`/admin/billing/restaurants/${id}`, { method: 'PUT', json }); void load(); };
  const invoice = async (dryRun: boolean) => { const r = await api<{ invoices: { vendorName: string; amount: number; via: string }[] }>('/admin/billing/commissions/invoice', { method: 'POST', json: { period, dryRun } }); setMsg(`${dryRun ? 'Simulation' : 'Émis'} ${period} : ${r.invoices.length} relevé(s) — ${r.invoices.map((i) => `${i.vendorName} ${i.amount.toFixed(2)} € (${i.via})`).join(', ') || 'rien à facturer'}`); void load(); };
  if (err) return <ErrorBox message={err} />; if (!d) return null;
  return (
    <div className="animate-fade-up space-y-5">
      <PageTitle title="🛡️ Abonnements & facturation" subtitle={`Stripe ${d.stripe ? 'configuré' : 'NON configuré'} · restrictions ${d.enforced ? 'actives' : 'désactivées'}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="MRR" value={`${d.mrr.toFixed(0)} €`} /><Stat label="Abonnés" value={d.restaurants.filter((r) => r.state === 'active').length} /><Stat label="En essai" value={d.restaurants.filter((r) => r.state === 'trialing').length} /><Stat label="Fondateurs" value={`${d.founders}/${d.founders + d.founderSeatsLeft}`} /></div>
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="p-3">Restaurant</th><th className="p-3">Formule</th><th className="p-3">État</th><th className="p-3">Essai</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y divide-stone-100">
        {d.restaurants.map((r) => <tr key={r.id}><td className="p-3 font-semibold">{r.name}<span className="ml-1 text-xs font-normal text-stone-400">{r.city}</span>{r.founder && <span className="pill ml-2 bg-yellow-50 text-yellow-800">fondateur</span>}</td><td className="p-3 capitalize">{r.plan}</td><td className="p-3">{r.state}{r.blocked ? ' 🔒' : ''}</td><td className="p-3">{r.trialDaysLeft !== null ? `${r.trialDaysLeft} j` : '—'}</td>
          <td className="p-3 space-x-2"><button className="text-xs underline" onClick={() => void upd(r.id, { founder: !r.founder })}>{r.founder ? 'Retirer fondateur' : 'Fondateur −50 %'}</button><button className="text-xs underline" onClick={() => void upd(r.id, { extendTrialDays: 14 })}>+14 j d’essai</button>{r.state !== 'active' && <button className="text-xs underline" onClick={() => void upd(r.id, { plan: 'pro', subscriptionStatus: 'active' })}>Activer Pro (manuel)</button>}</td></tr>)}</tbody></table></div>
      <div className="card space-y-3"><h2 className="font-bold">Factures de commission fournisseurs</h2><p className="text-sm text-stone-600">Générées automatiquement le 1er de chaque mois (Stripe si le fournisseur a activé le prélèvement, sinon relevé par e-mail). Vous pouvez aussi lancer à la main.</p>
        <div className="flex flex-wrap items-center gap-2"><input className="input w-32" value={period} onChange={(e) => setPeriod(e.target.value)} /><button className="btn-ghost" onClick={() => void invoice(true)}>Simuler</button><button className="btn-primary" onClick={() => void invoice(false)}>Émettre</button></div>{msg && <p className="text-sm">{msg}</p>}
        <table className="w-full text-sm"><tbody className="divide-y divide-stone-100">{d.invoices.map((i) => <tr key={i.id}><td className="p-2">{i.period}</td><td className="p-2">{i.orders} cmd · base {Number(i.baseEur).toFixed(2)} €</td><td className="p-2 font-bold">{Number(i.amountEur).toFixed(2)} €</td><td className="p-2">{i.status}{i.stripeInvoiceId ? ` · ${i.stripeInvoiceId}` : ''}</td></tr>)}</tbody></table></div>
    </div>
  );
}

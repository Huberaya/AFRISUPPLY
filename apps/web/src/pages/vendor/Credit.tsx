// Chantier 29 — Encours & conditions de paiement côté grossiste : délais par client, plafonds, factures à encaisser.
import { useState } from 'react';
import { Wallet, Ban, Check } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { api } from '../../lib/api';
import { Loader, ErrorBox, Empty } from '../../components/ui';
import { Modal, Field } from '../../components/Modal';

type Client = { restaurantId: string; name: string; city: string | null; paymentDays: number; creditLimitEur: number | null; blocked: boolean; note: string | null; outstandingEur: number; overdueEur: number; overdueCount: number; openOrders: number; oldestDueAt: string | null };
type Rec = { id: string; reference: string; restaurantId: string; restaurantName: string; dueEur: number; dueAt: string | null; paymentDays: number | null; deliveredAt: string | null; overdue: boolean; paidAmountEur: string | null };
const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`; const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const DAYS = [0, 15, 30, 45, 60];

export function Credit() {
  const { data, loading, error, reload } = useApi<{ clients: Client[]; receivables: Rec[]; totalEur: number; overdueEur: number }>('/vendor/credit');
  const [edit, setEdit] = useState<Client | null>(null); const [f, setF] = useState({ paymentDays: 0, creditLimitEur: '', blocked: false, note: '' }); const [err, setErr] = useState<string | null>(null);
  const [pay, setPay] = useState<Rec | null>(null); const [pf, setPf] = useState({ amountEur: '', method: 'virement' });
  if (loading) return <Loader />; if (error || !data) return <ErrorBox message={error ?? 'Erreur'} onRetry={reload} />;
  const openEdit = (c: Client) => { setEdit(c); setF({ paymentDays: c.paymentDays, creditLimitEur: c.creditLimitEur === null ? '' : String(c.creditLimitEur), blocked: c.blocked, note: c.note ?? '' }); setErr(null); };
  const save = async () => { if (!edit) return; try { await api(`/vendor/credit/${edit.restaurantId}`, { method: 'PUT', json: { paymentDays: Number(f.paymentDays), creditLimitEur: f.creditLimitEur === '' ? null : Number(f.creditLimitEur), blocked: f.blocked, note: f.note || null } }); setEdit(null); await reload(); } catch (e) { setErr((e as Error).message); } };
  const doPay = async () => { if (!pay) return; try { await api(`/vendor/orders/${pay.id}/payment`, { method: 'POST', json: { amountEur: pf.amountEur ? Number(pf.amountEur) : undefined, method: pf.method } }); setPay(null); setPf({ amountEur: '', method: 'virement' }); await reload(); } catch (e) { setErr((e as Error).message); } };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card !p-3"><p className="text-xs text-stone-500">À encaisser</p><p className="text-xl font-extrabold">{eur(data.totalEur)}</p></div>
        <div className="card !p-3"><p className="text-xs text-stone-500">En retard</p><p className={`text-xl font-extrabold ${data.overdueEur > 0 ? 'text-red-700' : ''}`}>{eur(data.overdueEur)}</p></div>
        <div className="card !p-3"><p className="text-xs text-stone-500">Factures ouvertes</p><p className="text-xl font-extrabold">{data.receivables.length}</p></div>
        <div className="card !p-3"><p className="text-xs text-stone-500">Clients à crédit</p><p className="text-xl font-extrabold">{data.clients.filter((c) => c.paymentDays > 0).length}</p></div>
      </div>
      <section>
        <h3 className="mb-2 font-bold">Conditions par client</h3>
        <p className="mb-2 text-sm text-stone-600">Par défaut : <b>comptant</b> (0 jour), sans plafond. Accordez un délai (15/30/45/60 j) et un plafond d'encours aux clients de confiance ; une facture en retard bloque automatiquement les nouvelles commandes à crédit.</p>
        {data.clients.length === 0 ? <Empty><Wallet className="mx-auto mb-2" />Aucun client pour l'instant.</Empty> : (
          <div className="card overflow-x-auto !p-0"><table className="w-full text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="p-3">Client</th><th className="p-3">Délai</th><th className="p-3 text-right">Plafond</th><th className="p-3 text-right">Encours</th><th className="p-3 text-right">Retard</th><th className="p-3"></th></tr></thead>
            <tbody>{data.clients.map((c) => <tr key={c.restaurantId} className="border-t border-stone-100">
              <td className="p-3"><b>{c.name}</b>{c.city && <span className="text-stone-500"> · {c.city}</span>}{c.blocked && <span className="pill ml-2 bg-red-100 text-red-800"><Ban size={12} className="mr-1 inline" />bloqué</span>}</td>
              <td className="p-3">{c.paymentDays === 0 ? 'Comptant' : `${c.paymentDays} jours`}</td>
              <td className="p-3 text-right">{c.creditLimitEur === null ? <span className="text-stone-400">∞</span> : eur(c.creditLimitEur)}</td>
              <td className="p-3 text-right">{eur(c.outstandingEur)}{c.creditLimitEur !== null && c.creditLimitEur > 0 && <div className="mt-1 h-1.5 w-24 overflow-hidden rounded bg-stone-100 ml-auto"><div className={`h-full ${c.outstandingEur / c.creditLimitEur > 0.9 ? 'bg-red-500' : 'bg-brand-600'}`} style={{ width: `${Math.min(100, (c.outstandingEur / c.creditLimitEur) * 100)}%` }} /></div>}</td>
              <td className={`p-3 text-right ${c.overdueEur > 0 ? 'font-semibold text-red-700' : 'text-stone-400'}`}>{c.overdueEur > 0 ? `${eur(c.overdueEur)} (${c.overdueCount})` : '—'}</td>
              <td className="p-3 text-right"><button className="btn-ghost !py-1 text-xs" onClick={() => openEdit(c)}>Conditions</button></td></tr>)}</tbody></table></div>)}
      </section>
      <section>
        <h3 className="mb-2 font-bold">Factures à encaisser</h3>
        {data.receivables.length === 0 ? <Empty><Check className="mx-auto mb-2" />Tout est encaissé.</Empty> : (
          <div className="card overflow-x-auto !p-0"><table className="w-full text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="p-3">Commande</th><th className="p-3">Client</th><th className="p-3">Livrée</th><th className="p-3">Échéance</th><th className="p-3 text-right">Reste dû</th><th className="p-3"></th></tr></thead>
            <tbody>{data.receivables.map((r) => <tr key={r.id} className={`border-t border-stone-100 ${r.overdue ? 'bg-red-50/50' : ''}`}>
              <td className="p-3 font-mono text-xs">{r.reference}</td><td className="p-3">{r.restaurantName}</td><td className="p-3">{fmt(r.deliveredAt)}</td>
              <td className="p-3">{r.dueAt ? <span className={r.overdue ? 'font-semibold text-red-700' : ''}>{fmt(r.dueAt)}{r.overdue && ' · en retard'}</span> : 'comptant'}</td>
              <td className="p-3 text-right font-semibold">{eur(r.dueEur)}{r.paidAmountEur && Number(r.paidAmountEur) > 0 && <div className="text-[11px] font-normal text-stone-500">acompte {eur(Number(r.paidAmountEur))}</div>}</td>
              <td className="p-3 text-right"><button className="btn-primary !py-1 text-xs" onClick={() => { setPay(r); setPf({ amountEur: '', method: 'virement' }); setErr(null); }}>Encaisser</button></td></tr>)}</tbody></table></div>)}
      </section>
      {edit && <Modal title={`Conditions de paiement — ${edit.name}`} onClose={() => setEdit(null)}>
        <div className="space-y-3">
          <Field label="Délai de paiement"><div className="flex flex-wrap gap-1.5">{DAYS.map((d) => <button key={d} type="button" onClick={() => setF({ ...f, paymentDays: d })} className={`rounded-full px-3 py-1 text-sm ${f.paymentDays === d ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-700'}`}>{d === 0 ? 'Comptant' : `${d} j`}</button>)}</div></Field>
          <Field label="Plafond d'encours (€, vide = illimité)"><input type="number" min={0} className="input" value={f.creditLimitEur} onChange={(e) => setF({ ...f, creditLimitEur: e.target.value })} placeholder="ex. 1500" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.blocked} onChange={(e) => setF({ ...f, blocked: e.target.checked })} /> Bloquer ce compte (aucune nouvelle commande tant que le blocage est actif)</label>
          <Field label="Note interne"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          {err && <p className="text-sm text-red-700">{err}</p>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setEdit(null)}>Annuler</button><button className="btn-primary" onClick={() => void save()}>Enregistrer</button></div>
        </div></Modal>}
      {pay && <Modal title={`Encaisser ${pay.reference}`} subtitle={`${pay.restaurantName} — reste dû ${eur(pay.dueEur)}`} onClose={() => setPay(null)}>
        <div className="space-y-3">
          <Field label="Montant reçu (€, vide = solde complet)"><input type="number" min={0} step="0.01" className="input" value={pf.amountEur} onChange={(e) => setPf({ ...pf, amountEur: e.target.value })} placeholder={pay.dueEur.toFixed(2)} /></Field>
          <Field label="Moyen"><select className="input" value={pf.method} onChange={(e) => setPf({ ...pf, method: e.target.value })}><option value="virement">Virement</option><option value="cb">Carte</option><option value="especes">Espèces</option><option value="cheque">Chèque</option><option value="prelevement">Prélèvement</option><option value="avoir">Avoir</option></select></Field>
          {err && <p className="text-sm text-red-700">{err}</p>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setPay(null)}>Annuler</button><button className="btn-primary" onClick={() => void doPay()}>Confirmer l'encaissement</button></div>
        </div></Modal>}
    </div>
  );
}

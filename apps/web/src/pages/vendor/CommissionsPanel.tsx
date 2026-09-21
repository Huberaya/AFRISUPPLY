// Chantier 8 (audit) — Commissions côté fournisseur : ce qu'il doit payer, comment il paie, et les
// factures de commission téléchargeables. Aucun bouton mensonger : si le prélèvement n'est pas
// disponible sur l'installation, l'écran le dit et propose le virement.
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CreditCard, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, openPdf } from '../../lib/api';
import { SUPPORT_EMAIL, mailtoSupport } from '../../lib/support';

type Payment = { stripe: boolean; customer: string | null; card: { id: string; brand: string | null; last4: string | null } | null; mode: 'prelevement' | 'releve_mail'; message: string };
type Billing = {
  commissionPct: number; billingEmail: string | null; contactEmail: string | null; recipient: string | null;
  payment: Payment;
  periods: { period: string; orders: number; base: number; amount: number; invoiced: boolean }[];
  invoices: { id: string; period: string; orders: number; baseEur: number; amountEur: number; status: string; stripeInvoiceId: string | null; createdAt: string }[];
};
const eur = (v: number | string) => `${Number(v).toFixed(2).replace('.', ',')} €`;
const STATUS: Record<string, string> = { emise: 'à régler', payee: 'prélevée', envoyee_par_mail: 'envoyée par e-mail' };

export function Commissions() {
  const [sp] = useSearchParams();
  const [b, setB] = useState<Billing | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => { setB(await api<Billing>('/vendor/billing')); }, []);
  useEffect(() => { void load(); }, [load]);

  // Retour de Stripe après l'enregistrement de la carte.
  useEffect(() => {
    const p = sp.get('paiement');
    if (p === 'ok') {
      setMsg('Carte enregistrée — activation du prélèvement en cours…');
      api<{ synced: boolean; payment?: Payment }>('/vendor/billing/sync', { method: 'POST', json: { sessionId: sp.get('session_id') ?? undefined } })
        .then(async (r) => { await load(); setMsg(r.synced ? '✅ Prélèvement automatique activé : vos commissions seront réglées automatiquement chaque mois.' : `Carte non confirmée (session incomplète) — réessayez ou écrivez à ${SUPPORT_EMAIL}.`); })
        .catch(async () => { await load(); setMsg('Paiement reçu — l’activation prend quelques secondes, rechargez la page.'); });
    }
    if (p === 'annule') setMsg('Enregistrement de carte annulé — vous pouvez réessayer quand vous voulez.');
  }, [sp, load]);

  const setup = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api<{ url: string }>('/vendor/billing/setup', { method: 'POST', json: {} }); window.location.href = r.url; }
    catch (e) { setMsg((e as Error).message); setBusy(false); }
  };
  if (!b) return <p className="text-stone-500">Chargement…</p>;
  const p = b.payment;
  const totalDu = b.periods.filter((x) => !x.invoiced).reduce((a, x) => a + x.amount, 0);

  return (
    <div className="space-y-4">
      {msg && <p className="rounded-xl border border-stone-200 bg-white p-3 text-sm">{msg}</p>}

      <div className={`card text-sm ${p.mode === 'prelevement' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <p className="flex items-center gap-2 font-bold">
          {p.mode === 'prelevement' ? <ShieldCheck size={18} className="text-emerald-700" /> : <AlertTriangle size={18} className="text-amber-700" />}
          Règlement des commissions
        </p>
        <p className="mt-1">{p.message}</p>
        {p.card && <p className="mt-1 text-xs text-stone-600">Carte enregistrée : <b>{p.card.brand ?? 'carte'} •••• {p.card.last4 ?? '????'}</b></p>}
        <p className="mt-1 text-xs text-stone-600">Commission actuelle : <b>{b.commissionPct.toFixed(2).replace('.', ',')} %</b> sur les commandes confirmées. Factures envoyées à <b>{b.recipient ?? '—'}</b> (modifiable dans « Ma fiche »).</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {p.stripe && <button className="btn-primary items-center !text-sm" disabled={busy} onClick={() => void setup()}><CreditCard size={16} /> {p.card ? 'Remplacer ma carte' : 'Activer le prélèvement automatique'}</button>}
          {!p.stripe && <a className="btn-ghost !text-sm" href={mailtoSupport('AFRISUPPLY — règlement des commissions')}>Une question ? Écrire à AFRISUPPLY</a>}
        </div>
        <p className="mt-2 text-xs text-stone-500">Vous ne payez que sur ce que vous vendez : aucune commission si aucune commande confirmée.</p>
      </div>

      {totalDu > 0 && <p className="text-sm text-stone-600">Reste à facturer ce mois-ci (estimé) : <b>{eur(totalDu)}</b> HT — la facture part en fin de mois.</p>}

      {b.invoices.length > 0 && (
        <div className="card">
          <h3 className="flex items-center gap-2 font-bold"><FileText size={18} /> Factures de commission</h3>
          <table className="mt-2 w-full text-sm"><thead className="text-left text-xs uppercase text-stone-500"><tr><th className="p-2">Mois</th><th className="p-2 text-right">Commandes</th><th className="p-2 text-right">Base</th><th className="p-2 text-right">Commission HT</th><th className="p-2">Statut</th><th className="p-2">PDF</th></tr></thead>
            <tbody className="divide-y divide-stone-100">{b.invoices.map((i) => <tr key={i.id}>
              <td className="p-2 font-semibold">{i.period}</td>
              <td className="p-2 text-right">{i.orders}</td>
              <td className="p-2 text-right">{eur(i.baseEur)}</td>
              <td className="p-2 text-right font-bold">{eur(i.amountEur)}</td>
              <td className="p-2">{STATUS[i.status] ?? i.status}</td>
              <td className="p-2"><button className="text-xs underline" onClick={() => void openPdf(`/vendor/billing/invoices/${i.id}/pdf`).catch((e) => setMsg((e as Error).message))}>Télécharger</button></td>
            </tr>)}</tbody></table>
        </div>
      )}

      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="p-3">Mois</th><th className="p-3 text-right">Commandes confirmées</th><th className="p-3 text-right">Chiffre d’affaires</th><th className="p-3 text-right">Commission</th><th className="p-3">Facture</th></tr></thead><tbody className="divide-y divide-stone-100">
        {b.periods.map((r) => <tr key={r.period}><td className="p-3 font-semibold">{r.period}</td><td className="p-3 text-right">{r.orders}</td><td className="p-3 text-right">{eur(r.base)}</td><td className="p-3 text-right font-bold">{eur(r.amount)}</td><td className="p-3">{r.invoiced ? 'Émise' : 'En fin de mois'}</td></tr>)}
        {!b.periods.length && <tr><td colSpan={5} className="p-6 text-center text-stone-500">Aucune commission : la première commande confirmée apparaîtra ici. Vous ne payez que sur ce que vous vendez.</td></tr>}</tbody></table></div>

      <button className="btn-ghost !text-xs" onClick={() => void load()}><RefreshCw size={14} /> Actualiser</button>
    </div>
  );
}

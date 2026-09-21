// Chantier 25 — Paiement en ligne (Stripe Connect Express) : activation du compte, état, volume encaissé en ligne.
import { useState } from 'react';
import { CreditCard, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { api } from '../../lib/api';
import { Loader, ErrorBox } from '../../components/ui';

type P = { configured: boolean; accountId: string | null; payoutsEnabled: boolean; chargesEnabled: boolean; requirements: string[]; commissionPct: number; onlinePayments?: number; onlineEur?: number };

export function Payments() {
  const { data, loading, error, reload } = useApi<P>('/vendor/payments');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  if (loading) return <Loader />; if (error || !data) return <ErrorBox message={error ?? 'Erreur'} />;
  const go = async () => { setBusy(true); setErr(null); try { const r = await api<{ url: string }>('/vendor/payments/onboard', { method: 'POST' }); window.location.href = r.url; } catch (e) { setErr((e as Error).message); setBusy(false); } };
  const ready = data.payoutsEnabled && data.chargesEnabled;
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-start gap-3"><CreditCard className="mt-0.5 shrink-0 text-brand-700" />
          <div className="flex-1">
            <p className="font-bold">Encaisser vos commandes en ligne (carte ou prélèvement SEPA)</p>
            <p className="mt-1 text-sm text-stone-600">Le restaurant paie depuis sa page <i>Achats</i> ; l'argent arrive directement sur votre compte bancaire via Stripe, la commission AFRISUPPLY ({data.commissionPct} %) est prélevée à la source — plus de facture de commission mensuelle sur ces commandes. Vos clients à crédit peuvent aussi régler leurs échéances en ligne.</p>
            {!data.configured && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800"><AlertTriangle size={14} className="mr-1 inline" />Le paiement en ligne n'est pas encore activé sur la plateforme. Vous serez prévenu à l'ouverture ; en attendant, les règlements se font par virement et vous les pointez dans l'onglet <b>Encours</b>.</p>}
            {data.configured && ready && <p className="mt-3 flex items-center gap-1 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} /> Compte actif — vos clients peuvent payer en ligne.</p>}
            {data.configured && !ready && <div className="mt-3 space-y-2">
              {data.accountId ? <p className="text-sm text-amber-800"><AlertTriangle size={14} className="mr-1 inline" />Compte créé, informations à compléter{data.requirements.length ? ` (${data.requirements.length} élément${data.requirements.length > 1 ? 's' : ''} manquant${data.requirements.length > 1 ? 's' : ''})` : ''}.</p> : <p className="text-sm text-stone-600">5 minutes : identité du dirigeant, SIREN, IBAN. Stripe est l'opérateur de paiement (agréé ACPR).</p>}
              <button className="btn-primary" disabled={busy} onClick={() => void go()}><ExternalLink size={16} /> {data.accountId ? 'Compléter mon dossier Stripe' : 'Activer le paiement en ligne'}</button>
              {data.accountId && <button className="btn-ghost ml-2" onClick={() => void reload()}>Actualiser l'état</button>}
              {err && <p className="text-sm text-red-700">{err}</p>}
            </div>}
          </div></div>
      </div>
      {data.configured && <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="card !p-3"><p className="text-xs text-stone-500">Paiements en ligne reçus</p><p className="text-xl font-extrabold">{data.onlinePayments ?? 0}</p></div>
        <div className="card !p-3"><p className="text-xs text-stone-500">Montant encaissé en ligne</p><p className="text-xl font-extrabold">{(data.onlineEur ?? 0).toFixed(2).replace('.', ',')} €</p></div>
        <div className="card !p-3"><p className="text-xs text-stone-500">Commission prélevée à la source</p><p className="text-xl font-extrabold">{data.commissionPct} %</p></div>
      </div>}
    </div>
  );
}

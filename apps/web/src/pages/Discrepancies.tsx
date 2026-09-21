import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, CheckCircle2 } from 'lucide-react';
import { api, fmtEur, fmtQty, fmtDate } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox, Empty, Stat } from '../components/ui';
import { ClaimModal, ClaimsList } from '../components/Claims';

type Item = { id: string; orderId: string; vendorId?: string | null; reference: string; supplierName: string; productName: string; unit: string; ordered: number; received: number; missing: number; valueEur: number; reason: string | null; resolved: boolean; receivedAt: string; isLate: boolean; claimMessage: string | null };

export default function Discrepancies() {
  const [all, setAll] = useState(false); const [claimFor, setClaimFor] = useState<Item | null>(null); const [flash, setFlash] = useState<string | null>(null);
  const { data, loading, error, reload } = useApi<{ items: Item[]; openValue: number }>(`/discrepancies${all ? '?all=1' : ''}`);
  const resolve = async (i: Item, resolution: 'avoir' | 'relivraison' | 'abandon') => { await api(`/discrepancies/${i.id}/resolve`, { method: 'POST', json: { resolution } }); await reload(); };
  if (loading && !data) return <Loader />; if (error) return <ErrorBox message={error} />;
  const items = data?.items ?? []; const openItems = items.filter((i) => !i.resolved);
  const bySup = openItems.reduce<Record<string, number>>((a, i) => { a[i.supplierName] = (a[i.supplierName] ?? 0) + i.valueEur; return a; }, {});
  return (
    <div className="animate-fade-up space-y-6">
      <Link to="/app/achats" className="text-sm text-stone-500">← Achats</Link>
      <PageTitle title="⚠️ Écarts de livraison" subtitle="Manquants et excédents constatés à la réception. Chaque écart a sa réclamation pré-rédigée ; marquez-le résolu quand l’avoir ou la relivraison est obtenu."
        action={<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Afficher les résolus</label>} />
      {flash && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{flash}</p>}
      {claimFor && <ClaimModal discrepancyId={claimFor.id} productName={claimFor.productName} defaultEur={Math.max(0, claimFor.valueEur)} onClose={() => setClaimFor(null)} onDone={(m) => { setClaimFor(null); setFlash(m); void reload(); }} />}
      <ClaimsList />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Écarts ouverts" value={openItems.length} tone={openItems.length ? 'warn' : 'good'} />
        <Stat label="Valeur à récupérer" value={fmtEur(data?.openValue ?? 0)} tone={(data?.openValue ?? 0) > 0 ? 'bad' : 'good'} hint="manquants × prix commandé" />
        <Stat label="Fournisseur le plus concerné" value={Object.entries(bySup).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'} />
      </div>
      {items.length === 0 && <Empty>Aucun écart {all ? '' : 'en cours'}. Vos fournisseurs livrent ce qu’ils facturent 👌</Empty>}
      <div className="space-y-3">
        {items.map((i) => (
          <details key={i.id} className={`card !p-0 ${i.resolved ? 'opacity-60' : ''}`}>
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div><p className="font-bold">{i.productName} <span className="text-sm font-normal text-stone-500">· {i.supplierName}</span></p><p className="text-xs text-stone-500">{i.reference} · reçu le {fmtDate(i.receivedAt)}{i.isLate && ' · en retard'} · commandé {fmtQty(i.ordered, i.unit)}, reçu {fmtQty(i.received, i.unit)}</p></div>
              <div className="flex items-center gap-3">{i.resolved ? <span className="pill bg-emerald-100 text-emerald-800"><CheckCircle2 size={12} /> Résolu</span> : <span className="pill bg-orange-100 text-orange-800">{i.missing > 0 ? `Manque ${fmtQty(i.missing, i.unit)}` : `Excédent ${fmtQty(-i.missing, i.unit)}`}</span>}<span className="font-extrabold">{i.missing > 0 ? fmtEur(i.valueEur) : '—'}</span></div>
            </summary>
            <div className="border-t border-stone-100 px-5 py-4 text-sm">
              {i.claimMessage && <pre className="whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-xs text-stone-700">{i.claimMessage}</pre>}
              {i.reason && <p className="mt-2 text-xs text-stone-500">Motif : {i.reason}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {i.claimMessage && <button className="btn-ghost !py-1.5" onClick={() => void navigator.clipboard.writeText(i.claimMessage!)}><Copy size={14} /> Copier la réclamation</button>}
                {!i.resolved && i.vendorId && <button className="btn-primary !py-1.5 !bg-purple-700" onClick={() => setClaimFor(i)}>⚖️ Ouvrir un litige (avoir)</button>}{!i.resolved && <><button className="btn-primary !py-1.5" onClick={() => void resolve(i, 'avoir')}>Avoir obtenu</button><button className="btn-ghost !py-1.5" onClick={() => void resolve(i, 'relivraison')}>Relivré</button><button className="btn-ghost !py-1.5 text-stone-500" onClick={() => void resolve(i, 'abandon')}>Abandonner</button></>}
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

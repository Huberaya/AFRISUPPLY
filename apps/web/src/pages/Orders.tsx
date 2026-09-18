import { useState } from 'react';
import { Send, PackageCheck, Copy } from 'lucide-react';
import { api, fmtEur, fmtQty, fmtDate, STATUS_LABEL } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox, Empty } from '../components/ui';

type Line = { id: string; productName: string; packLabel: string | null; packs: number; quantity: string; unitPriceEur: string; lineTotalEur: string; receivedQty: string | null };
type O = { id: string; reference: string; supplierName: string; status: string; channel: string; expectedAt: string | null; totalEur: string; source: string; createdAt: string; lines: Line[] };

const STATUS_TONE: Record<string, string> = { preparee: 'bg-sky-100 text-sky-800', envoyee: 'bg-amber-100 text-amber-800', confirmee: 'bg-amber-100 text-amber-800', livree: 'bg-emerald-100 text-emerald-800', livree_partiel: 'bg-orange-100 text-orange-800', annulee: 'bg-stone-100 text-stone-500', brouillon: 'bg-stone-100 text-stone-600' };

export default function Orders() {
  const { data, loading, error, reload } = useApi<{ orders: O[] }>('/orders');
  const [receiving, setReceiving] = useState<O | null>(null);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ claimMessage: string | null; discrepancies: unknown[] } | null>(null);
  const send = async (o: O) => { await api(`/orders/${o.id}/send`, { method: 'POST' }); await reload(); };
  const openReceive = (o: O) => { setReceiving(o); setReceived(Object.fromEntries(o.lines.map((l) => [l.id, l.quantity]))); setResult(null); };
  const confirmReceive = async () => {
    if (!receiving) return;
    const r = await api<{ claimMessage: string | null; discrepancies: unknown[] }>(`/orders/${receiving.id}/receive`, { method: 'POST', json: { lines: receiving.lines.map((l) => ({ lineId: l.id, receivedQty: Number(received[l.id]?.replace(',', '.') || 0) })) } });
    setResult(r); await reload(); if (!r.claimMessage) setReceiving(null);
  };
  if (loading && !data) return <Loader />; if (error) return <ErrorBox message={error} />;
  const open = (data?.orders ?? []).filter((o) => ['preparee', 'envoyee', 'confirmee'].includes(o.status));
  const past = (data?.orders ?? []).filter((o) => !['preparee', 'envoyee', 'confirmee'].includes(o.status));

  const Row = ({ o }: { o: O }) => (
    <details className="card !p-0 group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <div><p className="font-bold">{o.supplierName}</p><p className="text-xs text-stone-500">{o.reference} · {fmtDate(o.createdAt)} · {o.lines.length} ligne{o.lines.length > 1 ? 's' : ''}{o.expectedAt && ` · livraison prévue ${fmtDate(o.expectedAt)}`}{o.source !== 'manuel' && ` · via ${o.source}`}</p></div>
        <div className="flex items-center gap-3"><span className={`pill ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span><span className="font-extrabold">{fmtEur(o.totalEur)}</span></div>
      </summary>
      <div className="border-t border-stone-100 px-5 py-4">
        <table className="w-full text-sm"><tbody className="divide-y divide-stone-100">{o.lines.map((l) => <tr key={l.id}><td className="py-1.5">{l.productName}</td><td className="py-1.5 text-stone-500">{l.packs} × {l.packLabel}</td><td className="py-1.5 text-right">{fmtQty(l.quantity)}{l.receivedQty && Number(l.receivedQty) !== Number(l.quantity) && <span className="text-red-600 text-xs"> (reçu {fmtQty(l.receivedQty)})</span>}</td><td className="py-1.5 text-right font-semibold">{fmtEur(l.lineTotalEur)}</td></tr>)}</tbody></table>
        <div className="mt-3 flex gap-2">
          {o.status === 'preparee' && <button onClick={() => send(o)} className="btn-primary !py-1.5"><Send size={14} /> Marquer envoyée ({o.channel})</button>}
          {['envoyee', 'confirmee', 'preparee'].includes(o.status) && <button onClick={() => openReceive(o)} className="btn-ghost !py-1.5"><PackageCheck size={14} /> Réceptionner</button>}
        </div>
      </div>
    </details>
  );

  return (
    <div className="animate-fade-up space-y-8">
      <PageTitle title="🛒 Achats" subtitle="Commandes en cours et historique. La réception met le stock à jour et détecte les écarts automatiquement." />
      <section><h2 className="mb-3 text-lg font-bold">En cours ({open.length})</h2><div className="space-y-3">{open.map((o) => <Row key={o.id} o={o} />)}{open.length === 0 && <Empty>Aucune commande en cours. Passez par le <b>comparateur</b> depuis le stock pour en créer une.</Empty>}</div></section>
      <section><h2 className="mb-3 text-lg font-bold">Historique</h2><div className="space-y-3">{past.map((o) => <Row key={o.id} o={o} />)}</div></section>

      {receiving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReceiving(null)}>
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold">Réception — {receiving.reference}</h3>
            <p className="text-sm text-stone-500">{receiving.supplierName}. Corrigez les quantités réellement reçues.</p>
            {!result ? (<>
              <div className="mt-4 space-y-2">{receiving.lines.map((l) => <label key={l.id} className="flex items-center justify-between gap-3 text-sm"><span>{l.productName} <span className="text-stone-400">(commandé {fmtQty(l.quantity)})</span></span><input className="input !w-28 text-right" value={received[l.id] ?? ''} onChange={(e) => setReceived({ ...received, [l.id]: e.target.value })} /></label>)}</div>
              <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setReceiving(null)}>Annuler</button><button className="btn-primary" onClick={confirmReceive}>Valider la réception</button></div>
            </>) : (<>
              <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-4"><p className="font-semibold text-red-800">🔴 {result.discrepancies.length} écart{result.discrepancies.length > 1 ? 's' : ''} détecté{result.discrepancies.length > 1 ? 's' : ''}. Le stock a été mis à jour avec les quantités reçues.</p><p className="mt-2 text-xs uppercase text-stone-500">Réclamation pré-rédigée</p><pre className="mt-1 whitespace-pre-wrap text-sm text-stone-800 font-sans">{result.claimMessage}</pre></div>
              <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => navigator.clipboard.writeText(result.claimMessage ?? '')}><Copy size={14} /> Copier</button><button className="btn-primary" onClick={() => setReceiving(null)}>Fermer</button></div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}

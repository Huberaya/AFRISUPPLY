import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { api, fmtEur, fmtQty } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox, StatusPill } from '../components/ui';

type Offer = { offerId: string; supplierId: string; supplierName: string; packLabel: string; packQty: number; packPrice: number; unitPrice: number; inStock: boolean; leadTimeHours: number; deliveryFee: number; reliabilityPct: number; score: number; strengths: string[]; weaknesses: string[] };
type D = { product: { name: string; baseUnit: string }; stock: { quantity: number; daysLeft: number | null; status: 'ok' | 'bas' | 'critique'; targetLevel: number | null } | null; neededQty: number; ranked: Offer[]; recommended?: Offer; headline: string; justification: string[] };

export default function Compare() {
  const { productId } = useParams(); const nav = useNavigate();
  const [qty, setQty] = useState<string>('');
  const { data, loading, error } = useApi<D>(`/compare/${productId}${qty ? `?qty=${qty}` : ''}`);
  const [busy, setBusy] = useState<string | null>(null); const [done, setDone] = useState<string | null>(null);
  const order = async (o: Offer) => {
    setBusy(o.offerId);
    try {
      const packs = Math.max(1, Math.ceil((data?.neededQty ?? 1) / o.packQty));
      const r = await api<{ message: string }>('/orders', { method: 'POST', json: { supplierId: o.supplierId, lines: [{ offerId: o.offerId, packs }], source: 'comparateur' } });
      setDone(r.message);
    } finally { setBusy(null); }
  };
  if (loading && !data) return <Loader />; if (error) return <ErrorBox message={error} />; if (!data) return null;
  const unit = data.product.baseUnit;
  return (
    <div className="animate-fade-up space-y-6">
      <Link to="/app/stock" className="text-sm text-stone-500">← Stock</Link>
      <PageTitle title={`Comparer : ${data.product.name}`} subtitle={data.stock ? <>Stock actuel {fmtQty(data.stock.quantity, unit)}{data.stock.daysLeft !== null && <> · ~{data.stock.daysLeft} jours restants</>} · <StatusPill status={data.stock.status} /></> : 'Produit non suivi en stock'}
        action={<label className="text-sm">Quantité à couvrir <input className="input !w-28 inline-block ml-2" type="number" min={0} placeholder={String(data.neededQty)} value={qty} onChange={(e) => setQty(e.target.value)} /> {unit}</label>} />

      {done && <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-900 flex items-center justify-between gap-3"><span className="flex items-center gap-2"><CheckCircle2 size={18} /> {done}</span><button className="btn-primary !py-1.5" onClick={() => nav('/app/achats')}>Voir mes commandes</button></div>}

      {data.recommended && (
        <div className="rounded-2xl bg-stone-900 p-5 text-white">
          <p className="text-xs uppercase tracking-wide text-brand-300">🤖 Recommandation</p>
          <h2 className="mt-1 text-xl font-extrabold">{data.headline}</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-stone-200">{data.justification.map((j, i) => <li key={i}>• {j}</li>)}</ul>
          <button onClick={() => order(data.recommended!)} disabled={!!busy} className="btn mt-4 bg-brand-500 text-white hover:bg-brand-600">{busy === data.recommended.offerId ? 'Préparation…' : `Commander chez ${data.recommended.supplierName}`}</button>
        </div>
      )}

      <div className="card !p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="px-4 py-2">Fournisseur</th><th className="px-4 py-2">Conditionnement</th><th className="px-4 py-2 text-right">Prix</th><th className="px-4 py-2 text-right">Prix / {unit}</th><th className="px-4 py-2">Livraison</th><th className="px-4 py-2">Stock</th><th className="px-4 py-2 text-right">Fiabilité</th><th className="px-4 py-2 text-right">Score</th><th className="px-4 py-2"></th></tr></thead>
          <tbody className="divide-y divide-stone-100">
            {data.ranked.map((o) => (
              <tr key={o.offerId} className={o.offerId === data.recommended?.offerId ? 'bg-brand-50/50' : ''}>
                <td className="px-4 py-3"><p className="font-semibold">{o.supplierName}</p>{o.weaknesses.length > 0 && <p className="text-xs text-amber-700 flex items-center gap-1 mt-0.5"><AlertTriangle size={11} /> {o.weaknesses[0]}</p>}{o.strengths.length > 0 && <p className="text-xs text-emerald-700 mt-0.5">✓ {o.strengths.join(' · ')}</p>}</td>
                <td className="px-4 py-3 text-stone-600">{o.packLabel}</td>
                <td className="px-4 py-3 text-right">{fmtEur(o.packPrice)}</td>
                <td className="px-4 py-3 text-right font-bold">{fmtEur(o.unitPrice)}</td>
                <td className="px-4 py-3">{o.leadTimeHours <= 24 ? '24h' : `${Math.round(o.leadTimeHours / 24)} jours`}{o.deliveryFee ? <span className="text-xs text-stone-500"> +{fmtEur(o.deliveryFee, 0)}</span> : ''}</td>
                <td className="px-4 py-3">{o.inStock ? '🟢' : '🔴'}</td>
                <td className="px-4 py-3 text-right">{o.reliabilityPct} %</td>
                <td className="px-4 py-3 text-right"><span className={`pill ${o.score >= 70 ? 'bg-emerald-100 text-emerald-800' : o.score >= 40 ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600'}`}>{o.score}</span></td>
                <td className="px-4 py-3 text-right"><button onClick={() => order(o)} disabled={!!busy || !o.inStock} className="btn-ghost !py-1 !px-3">Commander</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.ranked.length === 0 && <p className="p-6 text-sm text-stone-500">Aucun fournisseur ne propose ce produit. Ajoutez une offre depuis la fiche d’un fournisseur.</p>}
      </div>
    </div>
  );
}

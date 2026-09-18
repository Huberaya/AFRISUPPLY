import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { api, fmtQty, CATEGORY_LABEL } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox, StatusPill } from '../components/ui';

type Item = { id: string; productId: string; name: string; category: string; unit: string; quantity: number; criticalLevel: number; targetLevel: number | null; avgDailyUse: number; daysLeft: number | null; status: 'ok' | 'bas' | 'critique'; preferredSupplier: string | null };

export default function Stock() {
  const { data, loading, error, reload } = useApi<{ items: Item[] }>('/stock');
  const [filter, setFilter] = useState<'all' | 'critique' | 'bas'>('all');
  const [editing, setEditing] = useState<string | null>(null); const [val, setVal] = useState('');
  const save = async (item: Item) => { await api(`/stock/${item.id}/movements`, { method: 'POST', json: { type: 'ajustement', quantity: Number(val.replace(',', '.')) } }); setEditing(null); await reload(); };
  if (loading && !data) return <Loader />; if (error) return <ErrorBox message={error} />;
  const items = (data?.items ?? []).filter((i) => filter === 'all' || i.status === filter);
  const groups = items.reduce<Record<string, Item[]>>((acc, i) => { (acc[i.category] ??= []).push(i); return acc; }, {});
  return (
    <div className="animate-fade-up">
      <PageTitle title="📦 Stock" subtitle="Quantités, consommation moyenne et jours restants — cliquez sur une quantité pour la corriger (inventaire)."
        action={<div className="flex gap-2">{(['all', 'critique', 'bas'] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={`btn ${filter === f ? 'bg-stone-900 text-white' : 'bg-stone-100'}`}>{f === 'all' ? 'Tous' : f === 'critique' ? '🔴 Critiques' : '🟠 Bas'}</button>)}</div>} />
      {Object.entries(groups).map(([cat, list]) => (
        <section key={cat} className="mb-8">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-stone-500">{CATEGORY_LABEL[cat] ?? cat}</h2>
          <div className="card overflow-x-auto !p-0">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="px-4 py-2">Produit</th><th className="px-4 py-2 text-right">Quantité</th><th className="px-4 py-2 text-right">Conso / jour</th><th className="px-4 py-2 text-right">Jours restants</th><th className="px-4 py-2 text-right">Seuil</th><th className="px-4 py-2">Statut</th><th className="px-4 py-2">Fournisseur habituel</th><th className="px-4 py-2"></th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {list.map((i) => (
                  <tr key={i.id} className="hover:bg-stone-50/60">
                    <td className="px-4 py-2.5 font-medium">{i.name}</td>
                    <td className="px-4 py-2.5 text-right">
                      {editing === i.id ? <form onSubmit={(e) => { e.preventDefault(); void save(i); }} className="flex justify-end gap-1"><input autoFocus className="input !w-24 !py-1 text-right" value={val} onChange={(e) => setVal(e.target.value)} /><button className="btn-primary !py-1 !px-2">OK</button></form>
                        : <button onClick={() => { setEditing(i.id); setVal(String(i.quantity)); }} className="rounded-lg px-2 py-0.5 font-semibold hover:bg-brand-50 hover:text-brand-700" title="Corriger la quantité">{fmtQty(i.quantity, i.unit)}</button>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-stone-600">{i.avgDailyUse ? fmtQty(i.avgDailyUse, i.unit) : '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${i.daysLeft !== null && i.daysLeft <= 3 ? 'text-red-600' : i.daysLeft !== null && i.daysLeft <= 6 ? 'text-amber-600' : ''}`}>{i.daysLeft !== null ? `${i.daysLeft} j` : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-stone-500">{fmtQty(i.criticalLevel, i.unit)}</td>
                    <td className="px-4 py-2.5"><StatusPill status={i.status} /></td>
                    <td className="px-4 py-2.5 text-stone-600">{i.preferredSupplier ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">{i.status !== 'ok' && <Link to={`/app/achats/comparer/${i.productId}`} className="text-xs font-semibold text-brand-700">Commander →</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {items.length === 0 && <p className="text-stone-500 flex items-center gap-2"><ClipboardList size={16} /> Aucun produit dans ce filtre.</p>}
    </div>
  );
}

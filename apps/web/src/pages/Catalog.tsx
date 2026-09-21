import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Check } from 'lucide-react';
import { api, fmtEur, CATEGORY_LABEL } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox } from '../components/ui';

type P = { id: string; name: string; category: string; baseUnit: string; origin: string | null; aliases: string[]; packs: string[]; tags: string[]; shelfLifeDays: number | null; tracked: boolean; offerCount: number; minUnitPrice: number | null; isCustom: boolean };
const CATS = ['feculents', 'frais', 'viandes_poissons', 'epicerie', 'boissons', 'emballages'];

export default function Catalog() {
  const [q, setQ] = useState(''); const [cat, setCat] = useState<string>('');
  const { data, loading, error, reload } = useApi<{ products: P[]; total: number }>(`/catalog?q=${encodeURIComponent(q)}${cat ? `&category=${cat}` : ''}`);
  const [busy, setBusy] = useState<string | null>(null);
  const track = async (id: string) => { setBusy(id); try { await api('/catalog/track', { method: 'POST', json: { productIds: [id] } }); await reload(); } finally { setBusy(null); } };
  const [showNew, setShowNew] = useState(false);
  const [np, setNp] = useState({ name: '', category: 'epicerie', baseUnit: 'kg' });
  const createProduct = async () => { const p = await api<P>('/catalog/products', { method: 'POST', json: np }); await api('/catalog/track', { method: 'POST', json: { productIds: [p.id] } }); setShowNew(false); setNp({ name: '', category: 'epicerie', baseUnit: 'kg' }); await reload(); };
  const list = useMemo(() => data?.products ?? [], [data?.products]);
  const counts = useMemo(() => list.reduce<Record<string, number>>((a, p) => { a[p.category] = (a[p.category] ?? 0) + 1; return a; }, {}), [list]);

  return (
    <div className="animate-fade-up">
      <PageTitle title="🌍 Catalogue produits africains" subtitle={`${data?.total ?? '…'} références avec alias (attiéké / attieke / garba), conditionnements et origines. Ajoutez au stock ce que vous utilisez.`}
        action={<div className="flex gap-2"><Link to="/app/import" className="btn-ghost">Importer mes fournisseurs (CSV)</Link><button className="btn-primary" onClick={() => setShowNew(true)}><Plus size={16} /> Produit perso</button></div>} />
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-64"><Search size={16} className="absolute left-3 top-2.5 text-stone-400" /><input className="input !pl-9" placeholder="Rechercher : gombo, okra, kandia, maggi, huile rouge…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button onClick={() => setCat('')} className={`btn ${!cat ? 'bg-stone-900 text-white' : 'bg-stone-100'}`}>Tous</button>
        {CATS.map((c) => <button key={c} onClick={() => setCat(c)} className={`btn ${cat === c ? 'bg-stone-900 text-white' : 'bg-stone-100'}`}>{CATEGORY_LABEL[c]}{counts[c] ? <span className="text-xs opacity-60">{counts[c]}</span> : null}</button>)}
      </div>
      {loading && !data ? <Loader /> : error ? <ErrorBox message={error} /> : (
        <div className="card !p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="px-4 py-2">Produit</th><th className="px-4 py-2">Aussi appelé</th><th className="px-4 py-2">Conditionnements</th><th className="px-4 py-2">Origine</th><th className="px-4 py-2 text-right">Meilleur prix</th><th className="px-4 py-2"></th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {list.map((p) => (
                <tr key={p.id} className="hover:bg-stone-50/60">
                  <td className="px-4 py-2.5"><p className="font-medium">{p.name}{p.isCustom && <span className="pill bg-violet-100 text-violet-800 ml-2">perso</span>}</p><p className="text-xs text-stone-500">{CATEGORY_LABEL[p.category]} · {p.baseUnit}{p.shelfLifeDays ? ` · DLC ~${p.shelfLifeDays} j` : ''}</p></td>
                  <td className="px-4 py-2.5 text-xs text-stone-600 max-w-xs">{p.aliases.slice(0, 5).join(', ')}</td>
                  <td className="px-4 py-2.5 text-xs text-stone-600">{p.packs.slice(0, 3).join(' · ')}</td>
                  <td className="px-4 py-2.5 text-xs text-stone-600">{p.origin ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right">{p.minUnitPrice ? <><b>{fmtEur(p.minUnitPrice)}</b><span className="text-xs text-stone-500">/{p.baseUnit} · {p.offerCount} offre{p.offerCount > 1 ? 's' : ''}</span></> : <span className="text-xs text-stone-400">aucune offre</span>}</td>
                  <td className="px-4 py-2.5 text-right">{p.tracked ? <span className="pill bg-emerald-100 text-emerald-800"><Check size={12} /> suivi</span> : <button onClick={() => track(p.id)} disabled={busy === p.id} className="btn-ghost !py-1 !px-2 text-xs"><Plus size={12} /> Suivre</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="p-6 text-sm text-stone-500">Aucun produit trouvé. Créez un <b>produit perso</b>.</p>}
        </div>
      )}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowNew(false)}>
          <div className="card w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-extrabold text-lg">Nouveau produit (privé)</h3>
            <label className="block text-sm">Nom<input className="input mt-1" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">Catégorie<select className="input mt-1" value={np.category} onChange={(e) => setNp({ ...np, category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></label>
              <label className="block text-sm">Unité<select className="input mt-1" value={np.baseUnit} onChange={(e) => setNp({ ...np, baseUnit: e.target.value })}>{['kg', 'L', 'piece', 'botte'].map((u) => <option key={u}>{u}</option>)}</select></label>
            </div>
            <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setShowNew(false)}>Annuler</button><button className="btn-primary" disabled={np.name.length < 2} onClick={createProduct}>Créer et suivre</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { CATEGORY_LABEL } from '../../lib/api';
import ProductCard, { type CatalogItem } from './ProductCard';
import { Loader, ErrorBox } from '../../components/ui';

type Catalog = { items: CatalogItem[]; total: number; origins: string[]; categories: Record<string, number>; withPrice: number };
export default function Catalogue() {
  const [sp, setSp] = useSearchParams(); const q = sp.get('q') ?? ''; const category = sp.get('category') ?? ''; const origin = sp.get('origin') ?? ''; const sort = sp.get('sort') ?? 'relevance'; const only = sp.get('only') ?? '';
  const [input, setInput] = useState(q); useEffect(() => setInput(q), [q]);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  const { data, loading, error, reload } = useApi<Catalog>(`/public/catalog?${new URLSearchParams({ ...(q && { q }), ...(category && { category }), ...(origin && { origin }) })}`);
  const items = useMemo(() => { let l = data?.items ?? []; if (only === 'price') l = l.filter((i) => i.fromUnitPrice !== null); if (sort === 'price_asc') l = [...l].sort((a, b) => (a.fromUnitPrice ?? 1e9) - (b.fromUnitPrice ?? 1e9)); if (sort === 'price_desc') l = [...l].sort((a, b) => (b.fromUnitPrice ?? -1) - (a.fromUnitPrice ?? -1)); if (sort === 'name') l = [...l].sort((a, b) => a.name.localeCompare(b.name, 'fr')); return l; }, [data, only, sort]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <form onSubmit={(e) => { e.preventDefault(); set('q', input.trim()); }} className="flex gap-2"><div className="input flex flex-1 items-center gap-2"><Search size={18} className="text-stone-400" /><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Rechercher : riz, gombo, poisson fumé, plantain…" className="w-full bg-transparent outline-none" /></div><button className="btn-primary">Rechercher</button></form>
      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-5 text-sm">
          <div><p className="mb-2 flex items-center gap-1 font-bold"><SlidersHorizontal size={14} /> Rayon</p><div className="space-y-1">{[['', 'Tous'], ...Object.entries(CATEGORY_LABEL)].map(([k, l]) => <button key={k} onClick={() => set('category', k)} className={`block w-full rounded-lg px-2 py-1 text-left ${category === k ? 'bg-brand-50 font-semibold text-brand-800' : 'hover:bg-stone-50'}`}>{l}{k && data ? <span className="float-right text-xs text-stone-400">{data.categories[k] ?? 0}</span> : null}</button>)}</div></div>
          <div><p className="mb-2 font-bold">Origine</p><select className="input" value={origin} onChange={(e) => set('origin', e.target.value)}><option value="">Toutes</option>{(data?.origins ?? []).map((o) => <option key={o}>{o}</option>)}</select></div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={only === 'price'} onChange={(e) => set('only', e.target.checked ? 'price' : '')} /> Avec prix disponible ({data?.withPrice ?? 0})</label>
        </aside>
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600"><p><b>{items.length}</b> produit{items.length > 1 ? 's' : ''}{q ? <> pour « {q} »</> : null}{category ? <> · {CATEGORY_LABEL[category]}</> : null}</p><select className="input w-auto" value={sort} onChange={(e) => set('sort', e.target.value)}><option value="relevance">Pertinence</option><option value="price_asc">Prix croissant</option><option value="price_desc">Prix décroissant</option><option value="name">Nom A→Z</option></select></div>
          {loading && <Loader />}{error && <ErrorBox message={error} onRetry={() => void reload()} />}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
          {!loading && !items.length && <div className="card text-center text-stone-500">Aucun produit ne correspond. Essayez un autre mot (ex. « attiéké », « plantain ») ou retirez un filtre.</div>}
        </div>
      </div>
    </div>
  );
}

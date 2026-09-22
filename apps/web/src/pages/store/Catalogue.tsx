import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { CATEGORY_LABEL } from '../../lib/api';
import ProductCard, { type CatalogItem } from './ProductCard';
import { Loader, ErrorBox } from '../../components/ui';

type Catalog = { items: CatalogItem[]; total: number; origins: string[]; categories: Record<string, number>; withPrice: number };

export default function Catalogue() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const category = sp.get('category') ?? '';
  const origin = sp.get('origin') ?? '';
  const sort = sp.get('sort') ?? 'relevance';
  const only = sp.get('only') ?? '';

  const [input, setInput] = useState(q);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  useEffect(() => setInput(q), [q]);

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    setSp(n, { replace: true });
  };

  const clearAllFilters = () => {
    const n = new URLSearchParams();
    if (q) n.set('q', q);
    setSp(n, { replace: true });
  };

  const activeFiltersCount = (category ? 1 : 0) + (origin ? 1 : 0) + (only ? 1 : 0);

  const { data, loading, error, reload } = useApi<Catalog>(
    `/public/catalog?${new URLSearchParams({
      ...(q && { q }),
      ...(category && { category }),
      ...(origin && { origin }),
    })}`
  );

  const items = useMemo(() => {
    let l = data?.items ?? [];
    if (only === 'price') l = l.filter((i) => i.fromUnitPrice !== null);
    if (sort === 'price_asc') l = [...l].sort((a, b) => (a.fromUnitPrice ?? 1e9) - (b.fromUnitPrice ?? 1e9));
    if (sort === 'price_desc') l = [...l].sort((a, b) => (b.fromUnitPrice ?? -1) - (a.fromUnitPrice ?? -1));
    if (sort === 'name') l = [...l].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return l;
  }, [data, only, sort]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 lg:px-8">
      {/* Barre de recherche */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          set('q', input.trim());
        }}
        className="flex flex-col sm:flex-row gap-2"
      >
        <div className="input flex flex-1 items-center gap-2 bg-white">
          <Search size={18} className="text-stone-400 shrink-0" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Rechercher : riz, gombo, poisson fumé, plantain…"
            className="w-full bg-transparent outline-none text-sm sm:text-base placeholder:text-stone-400"
          />
          {input && (
            <button
              type="button"
              onClick={() => {
                setInput('');
                set('q', '');
              }}
              className="text-stone-400 hover:text-stone-600 p-1"
              aria-label="Effacer la recherche"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <button className="btn-primary justify-center px-6 py-2.5 shrink-0">
          Rechercher
        </button>
      </form>

      {/* Barre d'actions mobile : bouton filtres + tri */}
      <div className="mt-4 flex lg:hidden items-center justify-between gap-2 border-b border-stone-200 pb-3">
        <button
          type="button"
          onClick={() => setShowFiltersMobile(!showFiltersMobile)}
          className={`btn-ghost flex items-center gap-2 text-sm font-semibold border ${
            showFiltersMobile ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-stone-200 bg-white'
          }`}
        >
          <SlidersHorizontal size={16} />
          <span>Filtres</span>
          {activeFiltersCount > 0 && (
            <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {activeFiltersCount}
            </span>
          )}
        </button>

        <select
          className="input w-auto text-xs sm:text-sm py-1.5"
          value={sort}
          onChange={(e) => set('sort', e.target.value)}
        >
          <option value="relevance">Pertinence</option>
          <option value="price_asc">Prix croissant</option>
          <option value="price_desc">Prix décroissant</option>
          <option value="name">Nom A→Z</option>
        </select>
      </div>

      {/* Pilules de filtres actifs */}
      {(category || origin || only || q) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-stone-500">Filtres actifs :</span>
          {q && (
            <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-stone-800">
              « {q} »
              <button onClick={() => { setInput(''); set('q', ''); }} className="hover:text-stone-900"><X size={12} /></button>
            </span>
          )}
          {category && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-800 px-2.5 py-1 font-medium">
              {CATEGORY_LABEL[category]}
              <button onClick={() => set('category', '')} className="hover:text-brand-900"><X size={12} /></button>
            </span>
          )}
          {origin && (
            <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 text-stone-800 px-2.5 py-1">
              Origine : {origin}
              <button onClick={() => set('origin', '')} className="hover:text-stone-900"><X size={12} /></button>
            </span>
          )}
          {only === 'price' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 text-stone-800 px-2.5 py-1">
              Avec prix
              <button onClick={() => set('only', '')} className="hover:text-stone-900"><X size={12} /></button>
            </span>
          )}
          {activeFiltersCount > 1 && (
            <button
              onClick={clearAllFilters}
              className="text-brand-700 underline hover:text-brand-800 ml-1 font-medium"
            >
              Tout effacer
            </button>
          )}
        </div>
      )}

      {/* Grille principale avec filtres à gauche sur desktop */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside
          className={`space-y-5 text-sm ${
            showFiltersMobile ? 'block card bg-stone-50 border border-stone-200 p-4' : 'hidden lg:block'
          }`}
        >
          <div>
            <p className="mb-2 flex items-center justify-between font-bold text-stone-900">
              <span className="flex items-center gap-1.5">
                <SlidersHorizontal size={15} /> Rayon
              </span>
              {category && (
                <button
                  type="button"
                  onClick={() => set('category', '')}
                  className="text-xs font-normal text-brand-700 hover:underline"
                >
                  Tous
                </button>
              )}
            </p>
            <div className="space-y-1 max-h-64 sm:max-h-none overflow-y-auto pr-1">
              {[['', 'Tous les rayons'], ...Object.entries(CATEGORY_LABEL)].map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => {
                    set('category', k);
                    setShowFiltersMobile(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs sm:text-sm transition touch-manipulation ${
                    category === k ? 'bg-brand-50 font-bold text-brand-800' : 'text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span className="truncate">{l}</span>
                  {k && data?.categories[k] !== undefined && (
                    <span className="ml-2 text-xs text-stone-400 font-mono">{data.categories[k]}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 font-bold text-stone-900">Origine</p>
            <select
              className="input text-xs sm:text-sm bg-white"
              value={origin}
              onChange={(e) => {
                set('origin', e.target.value);
                setShowFiltersMobile(false);
              }}
            >
              <option value="">Toutes les origines</option>
              {(data?.origins ?? []).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer text-stone-800 text-xs sm:text-sm touch-manipulation">
              <input
                type="checkbox"
                className="rounded border-stone-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                checked={only === 'price'}
                onChange={(e) => {
                  set('only', e.target.checked ? 'price' : '');
                  setShowFiltersMobile(false);
                }}
              />
              <span>Avec prix disponible ({data?.withPrice ?? 0})</span>
            </label>
          </div>
        </aside>

        <div>
          {/* Header liste de résultats (desktop) */}
          <div className="mb-4 hidden lg:flex items-center justify-between gap-2 text-sm text-stone-600">
            <p>
              <b>{items.length}</b> produit{items.length > 1 ? 's' : ''}
              {q ? <> pour « <b>{q}</b> »</> : null}
              {category ? <> · {CATEGORY_LABEL[category]}</> : null}
            </p>
            <select
              className="input w-auto text-sm"
              value={sort}
              onChange={(e) => set('sort', e.target.value)}
            >
              <option value="relevance">Pertinence</option>
              <option value="price_asc">Prix croissant</option>
              <option value="price_desc">Prix décroissant</option>
              <option value="name">Nom A→Z</option>
            </select>
          </div>

          {loading && <Loader />}
          {error && <ErrorBox message={error} onRetry={() => void reload()} />}

          <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {items.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>

          {!loading && !items.length && (
            <div className="card text-center text-stone-500 py-12">
              <p className="text-base font-medium">Aucun produit ne correspond à votre recherche.</p>
              <p className="text-xs sm:text-sm text-stone-400 mt-1">
                Essayez un autre mot (ex. « attiéké », « plantain ») ou retirez un filtre.
              </p>
              {(category || origin || only) && (
                <button onClick={clearAllFilters} className="btn-primary mt-4 mx-auto text-xs sm:text-sm">
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat, ArrowRight, Check } from 'lucide-react';
import { api, fmtEur } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox } from '../components/ui';

type T = { name: string; region: string; suggestedPrice: number; category: string; ingredientCount: number; ingredients: { product: string; qty: number; unit: string }[] };
const CAT_LABEL: Record<string, string> = { plat: 'Plats', accompagnement: 'Accompagnements', entree: 'Entrées', boisson: 'Boissons', dessert: 'Desserts' };

export default function Onboarding() {
  const nav = useNavigate();
  const { data, loading, error } = useApi<{ templates: T[]; regions: string[] }>('/onboarding/templates');
  const [sel, setSel] = useState<Set<string>>(new Set()); const [prices, setPrices] = useState<Record<string, number>>({});
  const [region, setRegion] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState<{ createdRecipes: number; trackedProducts: number; totalProducts: number } | null>(null);
  const toggle = (n: string) => setSel((s) => { const c = new Set(s); c.has(n) ? c.delete(n) : c.add(n); return c; });
  const list = (data?.templates ?? []).filter((t) => !region || t.region.includes(region));
  const products = useMemo(() => { const m = new Map<string, string>(); for (const t of data?.templates ?? []) if (sel.has(t.name)) for (const i of t.ingredients) m.set(i.product, i.unit); return [...m.keys()]; }, [sel, data]);
  const apply = async () => { setBusy(true); try { setDone(await api('/onboarding/apply', { method: 'POST', json: { templates: [...sel], prices } })); } finally { setBusy(false); } };
  if (loading && !data) return <Loader />; if (error) return <ErrorBox message={error} />;
  if (done) return (
    <div className="card max-w-lg mx-auto text-center space-y-3 animate-fade-up">
      <div className="text-5xl">🎉</div><h2 className="text-2xl font-extrabold">Votre cuisine est configurée</h2>
      <p className="text-stone-600">{done.createdRecipes} recette{done.createdRecipes > 1 ? 's' : ''} créée{done.createdRecipes > 1 ? 's' : ''} · {done.totalProducts} produits identifiés · {done.trackedProducts} ajouté{done.trackedProducts > 1 ? 's' : ''} à votre stock.</p>
      <p className="text-sm text-stone-500">Étape suivante : importez vos fournisseurs et leurs prix, puis faites un premier inventaire.</p>
      <div className="flex justify-center gap-2 pt-2"><button className="btn-ghost" onClick={() => nav('/app/stock')}>Voir le stock</button><button className="btn-primary" onClick={() => nav('/app/import')}>Importer mes fournisseurs <ArrowRight size={16} /></button></div>
    </div>
  );
  return (
    <div className="animate-fade-up">
      <PageTitle title="👩🏾‍🍳 Configurer ma carte en 5 minutes" subtitle="Cochez les plats que vous servez. AFRISUPPLY en déduit la liste de produits à suivre, avec des grammages moyens que vous pourrez ajuster." />
      <div className="mb-4 flex flex-wrap gap-2"><button onClick={() => setRegion('')} className={`btn ${!region ? 'bg-stone-900 text-white' : 'bg-stone-100'}`}>Toutes cuisines</button>{data?.regions.map((r) => <button key={r} onClick={() => setRegion(r)} className={`btn ${region === r ? 'bg-stone-900 text-white' : 'bg-stone-100'}`}>{r}</button>)}</div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {Object.entries(CAT_LABEL).map(([cat, label]) => { const items = list.filter((t) => t.category === cat); if (!items.length) return null; return (
            <section key={cat}><h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-stone-500">{label}</h2>
              <div className="grid gap-2 sm:grid-cols-2">{items.map((t) => { const on = sel.has(t.name); return (
                <button key={t.name} onClick={() => toggle(t.name)} className={`text-left rounded-xl border p-3 transition ${on ? 'border-brand-600 bg-brand-50' : 'border-stone-200 bg-white hover:border-stone-300'}`}>
                  <div className="flex items-start justify-between gap-2"><p className="font-semibold">{t.name}</p>{on ? <Check size={16} className="text-brand-700" /> : <ChefHat size={16} className="text-stone-300" />}</div>
                  <p className="text-xs text-stone-500">{t.region} · {t.ingredientCount} ingrédients · prix conseillé {fmtEur(t.suggestedPrice)}</p>
                  {on && <label className="mt-2 flex items-center gap-2 text-xs" onClick={(e) => e.stopPropagation()}>Mon prix de vente <input type="number" step="0.5" className="input !w-20 !py-0.5" value={prices[t.name] ?? t.suggestedPrice} onChange={(e) => setPrices({ ...prices, [t.name]: Number(e.target.value) })} /> €</label>}
                </button>); })}</div>
            </section>); })}
        </div>
        <aside className="card h-fit sticky top-20">
          <h3 className="font-bold">{sel.size} plat{sel.size > 1 ? 's' : ''} sélectionné{sel.size > 1 ? 's' : ''}</h3>
          <p className="text-sm text-stone-500">→ {products.length} produits à suivre</p>
          <ul className="mt-3 max-h-72 overflow-y-auto text-xs text-stone-600 space-y-0.5">{products.map((p) => <li key={p}>• {p}</li>)}</ul>
          <button className="btn-primary w-full justify-center mt-4" disabled={!sel.size || busy} onClick={apply}>{busy ? 'Configuration…' : 'Créer mes recettes et mon stock'}</button>
        </aside>
      </div>
    </div>
  );
}

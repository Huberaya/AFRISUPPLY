import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat, ArrowRight, Check } from 'lucide-react';
import { api, fmtEur } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox } from '../components/ui';

type T = { name: string; region: string; suggestedPrice: number; category: string; ingredientCount: number; ingredients: { product: string; qty: number; unit: string }[] };
type DoneItem = { id: string; productId: string; productName: string; unit: string; category: string; criticalLevel: number; targetLevel: number | null };
const CAT_LABEL: Record<string, string> = { plat: 'Plats', accompagnement: 'Accompagnements', entree: 'Entrées', boisson: 'Boissons', dessert: 'Desserts' };
const num = (s: string) => Number(String(s).replace(',', '.')) || 0;

export default function Onboarding() {
  const nav = useNavigate();
  const { data, loading, error } = useApi<{ templates: T[]; regions: string[] }>('/onboarding/templates');
  const [sel, setSel] = useState<Set<string>>(new Set()); const [prices, setPrices] = useState<Record<string, number>>({});
  const [region, setRegion] = useState(''); const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ createdRecipes: number; trackedProducts: number; totalProducts: number; items: DoneItem[] } | null>(null);
  // Chantier 1 (audit) — étape « vos seuils d'alerte » : éditions locales des seuils pré-remplis.
  const [thr, setThr] = useState<Record<string, { c: string; t: string }>>({});
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const toggle = (n: string) => setSel((s) => { const c = new Set(s); if (c.has(n)) c.delete(n); else c.add(n); return c; });
  const list = (data?.templates ?? []).filter((t) => !region || t.region.includes(region));
  const products = useMemo(() => { const m = new Map<string, string>(); for (const t of data?.templates ?? []) if (sel.has(t.name)) for (const i of t.ingredients) m.set(i.product, i.unit); return [...m.keys()]; }, [sel, data]);
  const apply = async () => { setBusy(true); try { setDone(await api('/onboarding/apply', { method: 'POST', json: { templates: [...sel], prices } })); } finally { setBusy(false); } };
  const saveThresholds = async (next: string) => {
    if (!done || busy) return;
    setBusy(true); setSaveErr(null);
    try {
      await api('/stock/thresholds', {
        method: 'POST',
        json: { items: (done.items ?? []).map((i) => {
          const v = thr[i.id] ?? { c: String(i.criticalLevel), t: i.targetLevel === null ? '' : String(i.targetLevel) };
          return { itemId: i.id, criticalLevel: num(v.c), targetLevel: v.t === '' ? null : num(v.t) };
        }) },
      });
      nav(next);
    } catch (e) { setSaveErr(e instanceof Error ? e.message : 'Enregistrement impossible'); setBusy(false); }
  };
  if (loading && !data) return <Loader />; if (error) return <ErrorBox message={error} />;
  if (done) {
    const items = done.items ?? [];
    const val = (i: DoneItem) => thr[i.id] ?? { c: String(i.criticalLevel), t: i.targetLevel === null ? '' : String(i.targetLevel) };
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-up">
        <div className="card text-center space-y-3">
          <div className="text-5xl">🎉</div><h2 className="text-2xl font-extrabold">Votre cuisine est configurée</h2>
          <p className="text-stone-600">{done.createdRecipes} recette{done.createdRecipes > 1 ? 's' : ''} créée{done.createdRecipes > 1 ? 's' : ''} · {done.totalProducts} produits identifiés · {done.trackedProducts} ajouté{done.trackedProducts > 1 ? 's' : ''} à votre stock.</p>
        </div>
        {/* Chantier 1 : sans seuils, la prévision et le panier intelligent restent muets — on les règle tout de suite. */}
        <div className="card space-y-3">
          <div>
            <h3 className="font-bold text-lg">🔔 Réglez vos seuils d’alerte</h3>
            <p className="text-sm text-stone-500">AFRISUPPLY vous prévient quand un produit passe sous le seuil critique, et recommande jusqu’à l’objectif. Valeurs proposées : ≈ 3 jours d’avance (critique), ≈ 7 jours (objectif) — ajustez selon votre activité.</p>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-stone-100">
            {items.map((i) => (
              <div key={i.id} className="flex items-center gap-2 py-2 text-sm">
                <div className="flex-1 min-w-0"><p className="font-medium truncate">{i.productName}</p><p className="text-xs text-stone-400">en {i.unit}</p></div>
                <label className="text-xs text-stone-500">critique
                  <input type="number" min="0" step="0.5" className="input !w-20 !py-1 ml-1" value={val(i).c}
                    onChange={(e) => setThr({ ...thr, [i.id]: { ...val(i), c: e.target.value } })} />
                </label>
                <label className="text-xs text-stone-500">objectif
                  <input type="number" min="0" step="0.5" className="input !w-20 !py-1 ml-1" value={val(i).t}
                    onChange={(e) => setThr({ ...thr, [i.id]: { ...val(i), t: e.target.value } })} />
                </label>
              </div>
            ))}
          </div>
          {saveErr && <ErrorBox message={saveErr} />}
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <button className="btn-primary" disabled={busy} onClick={() => saveThresholds('/app/import')}>{busy ? 'Enregistrement…' : 'Valider mes seuils'} <ArrowRight size={16} /></button>
            <button className="btn-ghost" disabled={busy} onClick={() => saveThresholds('/app/stock')}>Voir le stock</button>
          </div>
          <p className="text-center text-xs text-stone-400">Étape suivante : importez vos fournisseurs et leurs prix, puis faites un premier inventaire.</p>
        </div>
      </div>
    );
  }
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

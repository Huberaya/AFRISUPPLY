import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Info } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { fmtQty } from '../lib/api';
import { PageTitle, Loader, ErrorBox, Empty, Stat } from '../components/ui';

interface ProductForecast { productId: string; productName: string; unit: string; horizonDays: number; predictedNeed: number; currentStock: number; safetyStock: number; recommendedOrder: number; daysOfStockLeft: number | null; stockoutDay: string | null; confidence: number; explanation: string; perDay: number[] }
interface Data { horizonDays: number; products: ProductForecast[]; recipes: { recipeId: string; name: string; total: number; confidence: number; perDay: number[] }[]; salesDays: number }

const dayLabel = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset + 1); return d.toLocaleDateString('fr-FR', { weekday: 'short' }); };

export default function Forecast() {
  const { data, loading, error } = useApi<Data>('/forecast');
  const [open, setOpen] = useState<string | null>(null);
  if (loading) return <Loader />; if (error) return <ErrorBox message={error} />; if (!data) return null;
  const toOrder = data.products.filter((p) => p.recommendedOrder > 0);
  const ruptures = data.products.filter((p) => p.stockoutDay);
  const conf = data.products.length ? Math.round(data.products.reduce((a, p) => a + p.confidence, 0) / data.products.length * 100) : 0;
  return (
    <div className="animate-fade-up">
      <PageTitle title="🔮 Prévision des besoins" subtitle={`Sur ${data.horizonDays} jours, à partir de ${data.salesDays} jours de ventes saisies et de vos fiches recettes. Chaque chiffre est expliqué.`}
        action={<Link to="/app/achats/panier" className="btn-primary"><ShoppingCart size={16} /> Panier intelligent</Link>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-6">
        <Stat label="Produits à commander" value={toOrder.length} tone={toOrder.length ? 'warn' : 'good'} />
        <Stat label="Ruptures prévues" value={ruptures.length} tone={ruptures.length ? 'bad' : 'good'} hint={ruptures[0] ? `1re : ${ruptures[0].productName}` : 'Aucune sur l’horizon'} />
        <Stat label="Confiance moyenne" value={`${conf} %`} hint={data.salesDays < 14 ? 'Saisissez vos ventes chaque jour pour l’améliorer' : 'Basée sur 4 semaines d’historique'} />
        <Stat label="Plats suivis" value={data.recipes.length} hint={<Link to="/app/ventes" className="underline">Saisir les ventes du jour</Link>} />
      </div>
      {data.salesDays === 0 && <div className="card mb-6 border-amber-200 bg-amber-50 text-sm text-amber-900 flex gap-2"><Info size={16} className="mt-0.5 shrink-0" /> Aucune vente saisie : la prévision se rabat sur vos seuils critiques. Saisissez vos couverts par plat dans <Link to="/app/ventes" className="underline font-medium">Ventes du jour</Link> pour obtenir une prévision par jour de semaine.</div>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="p-3">Produit</th><th className="p-3 text-right">Besoin {data.horizonDays} j</th><th className="p-3 text-right">Stock</th><th className="p-3 text-right">À commander</th><th className="p-3">Rupture</th><th className="p-3">Confiance</th><th className="p-3 hidden md:table-cell">Jour par jour</th></tr></thead>
          <tbody>
            {data.products.length === 0 && <tr><td colSpan={7}><Empty>Aucun article en stock. Commencez par <Link to="/app/demarrer" className="underline">configurer votre carte</Link>.</Empty></td></tr>}
            {data.products.map((p) => { const max = Math.max(...p.perDay, 0.001); return (
              <>
                <tr key={p.productId} onClick={() => setOpen(open === p.productId ? null : p.productId)} className="cursor-pointer border-t border-stone-100 hover:bg-stone-50">
                  <td className="p-3 font-medium">{p.productName}</td>
                  <td className="p-3 text-right">{fmtQty(p.predictedNeed, p.unit)}</td>
                  <td className="p-3 text-right text-stone-500">{fmtQty(p.currentStock, p.unit)}</td>
                  <td className={`p-3 text-right font-semibold ${p.recommendedOrder > 0 ? 'text-brand-700' : 'text-stone-400'}`}>{p.recommendedOrder > 0 ? fmtQty(p.recommendedOrder, p.unit) : '—'}</td>
                  <td className="p-3">{p.stockoutDay ? <span className="pill bg-red-50 text-red-700">{new Date(p.stockoutDay).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span> : <span className="text-stone-400">non</span>}</td>
                  <td className="p-3"><div className="h-1.5 w-16 rounded bg-stone-200"><div className="h-1.5 rounded bg-brand-500" style={{ width: `${Math.round(p.confidence * 100)}%` }} /></div></td>
                  <td className="p-3 hidden md:table-cell"><div className="flex items-end gap-0.5 h-6">{p.perDay.map((v, i) => <div key={i} title={`${dayLabel(i)} : ${fmtQty(v, p.unit)}`} className="w-2 rounded-sm bg-brand-300" style={{ height: `${Math.max(2, v / max * 100)}%` }} />)}</div></td>
                </tr>
                {open === p.productId && <tr key={p.productId + '-x'} className="bg-brand-50/50"><td colSpan={7} className="px-4 py-3 text-sm text-stone-700">
                  <p>{p.explanation}</p>
                  <p className="mt-1 text-xs text-stone-500">Stock de sécurité : {fmtQty(p.safetyStock, p.unit)} · Besoin moyen/jour : {fmtQty(p.predictedNeed / p.horizonDays, p.unit)} · {p.daysOfStockLeft !== null ? `${p.daysOfStockLeft} j de stock` : 'consommation inconnue'}</p>
                  <div className="mt-2 flex gap-2"><Link to={`/app/achats/comparer/${p.productId}`} className="btn-secondary !py-1 !px-2 text-xs">Comparer les fournisseurs</Link></div>
                </td></tr>}
              </>); })}
          </tbody>
        </table>
      </div>
      <div className="mt-6 card">
        <h3 className="font-semibold mb-2">Ventes prévues par plat</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.recipes.map((r) => <div key={r.recipeId} className="rounded-xl border border-stone-200 p-3"><div className="flex justify-between text-sm"><span className="font-medium">{r.name}</span><span>{Math.round(r.total)} portions</span></div><div className="mt-1 flex justify-between text-[10px] text-stone-500">{r.perDay.map((v, i) => <span key={i}>{dayLabel(i)} {Math.round(v)}</span>)}</div></div>)}</div>
      </div>
    </div>
  );
}

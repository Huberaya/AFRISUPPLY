import { fmtEur, fmtQty } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox } from '../components/ui';

type R = { id: string; name: string; sellingPriceEur: number | null; cost: number; grossMargin: number | null; marginPct: number | null; suggestedPrice: number | null; unpriced: string[]; drifting: { productName: string; pct: number }[]; ingredients: { productId: string; productName: string; quantity: number; unit: string; unitPrice: number; cost: number }[] };

export default function Recipes() {
  const { data, loading, error } = useApi<{ recipes: R[] }>('/recipes');
  if (loading && !data) return <Loader />; if (error) return <ErrorBox message={error} />;
  return (
    <div className="animate-fade-up">
      <PageTitle title="🍗 Recettes & coût matière" subtitle="Coût calculé à partir des prix fournisseurs actuels. L’IA signale les ingrédients dont le prix dérive." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.recipes.map((r) => (
          <details key={r.id} className="card group">
            <summary className="cursor-pointer list-none">
              <div className="flex items-start justify-between"><h3 className="font-bold">{r.name}</h3>{r.sellingPriceEur && <span className="text-sm text-stone-500">Vente {fmtEur(r.sellingPriceEur)}</span>}</div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-stone-50 p-2"><p className="text-[10px] uppercase text-stone-500">Coût matière</p><p className="font-extrabold">{fmtEur(r.cost)}</p></div>
                <div className="rounded-xl bg-stone-50 p-2"><p className="text-[10px] uppercase text-stone-500">Marge brute</p><p className="font-extrabold text-emerald-700">{fmtEur(r.grossMargin)}</p></div>
                <div className="rounded-xl bg-stone-50 p-2"><p className="text-[10px] uppercase text-stone-500">Taux</p><p className={`font-extrabold ${(r.marginPct ?? 0) < 70 ? 'text-amber-700' : ''}`}>{r.marginPct !== null ? `${r.marginPct} %` : '—'}</p></div>
              </div>
              {r.drifting.length > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">⚠️ {r.drifting.map((d) => `${d.productName} +${d.pct} %`).join(', ')} sur 45 j.{r.suggestedPrice && <> Prix conseillé : <b>{fmtEur(r.suggestedPrice)}</b></>}</p>}
              {r.unpriced.length > 0 && <p className="mt-2 text-xs text-stone-500">Sans prix : {r.unpriced.join(', ')}</p>}
            </summary>
            <table className="mt-4 w-full text-xs"><tbody className="divide-y divide-stone-100">{r.ingredients.map((i) => <tr key={i.productId}><td className="py-1">{i.productName}</td><td className="py-1 text-right text-stone-500">{fmtQty(i.quantity, i.unit)}</td><td className="py-1 text-right">{fmtEur(i.cost, 3)}</td></tr>)}</tbody></table>
          </details>
        ))}
      </div>
    </div>
  );
}

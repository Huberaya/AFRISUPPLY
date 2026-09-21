// Chantier 4 (audit) — « Comprendre ses coûts en une page ».
//
// Avant : 3 compteurs + une barre par fournisseur, avec un reliquat de backlog affiché au client.
// Maintenant : la réponse chiffrée à « pourquoi mes coûts augmentent ? », calculée sur les achats
// réels (prix facturés saisis à la réception), les prix payés mois par mois, les dérives produit
// par produit et la marge de chaque plat. Aucune donnée fictive : chaque chiffre a un lien vers
// l'action qui le concerne (comparer, voir la commande, ouvrir la recette).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, TrendingUp, TrendingDown, ChevronRight, Info } from 'lucide-react';
import { fmtEur, fmtQty, CATEGORY_LABEL } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox, Stat, Empty } from '../components/ui';

type Index = { category: string; points: (number | null)[]; firstPrice: number; lastPrice: number; changePct: number | null; monthCount: number; productsTracked: number; risingProducts: number; avgProductChangePct: number | null };
type Drift = { productId: string; productName: string; unit: string; category: string; supplierName: string; firstPrice: number; lastPrice: number; changePct: number; quantitySince: number; impactEur: number; invoiced: boolean };
type Contributor = { productId: string; productName: string; deltaEur: number; pricePart: number; volumePart: number; reason: 'prix' | 'volume' | 'les deux'; productUrl: string };
type Explanation = { currentMonth: string; previousMonth: string; currentTotal: number; previousTotal: number; deltaTotal: number; priceEffectEur: number; volumeEffectEur: number; contributors: Contributor[]; sentence: string };
type Recipe = { id: string; name: string; costPerPortion: number | null; sellingPriceEur: number | null; marginEur: number | null; marginPct: number | null; targetMarginPct: number | null; portions30: number; marginTotalEur: number | null; missingPrices: string[]; url: string; ingredients: { productName: string; quantity: number; unit: string; unitCostEur: number | null; lineCost: number | null }[] };
type RecipeHistory = { id: string; name: string; points: (number | null)[]; firstCost: number | null; lastCost: number | null; changePct: number | null };
type Analysis = {
  months: string[];
  spend: { months: string[]; totals: number[]; total: number; currentMonth: string; currentMonthTotal: number; invoicedSharePct: number; byCategory: { category: string; totals: number[]; total: number }[] };
  bySupplier: { supplierId: string | null; supplierName: string; total: number; invoiced: boolean }[];
  prices: Index[]; pricesInvoiced: Index[]; drifts: Drift[]; watchlist: Drift[]; explanation: Explanation; recipes: Recipe[]; recipeHistory: RecipeHistory[];
};

/** Pourcentages à la française : virgule décimale et signe, comme les montants. */
const pct = (v: number | null | undefined) => v === null || v === undefined
  ? '—'
  : `${v > 0 ? '+' : ''}${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

const monthLabel = (m: string, short = false) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  return d.toLocaleDateString('fr-FR', short ? { month: 'short' } : { month: 'long', year: 'numeric', timeZone: 'UTC' });
};
const cat = (c: string) => CATEGORY_LABEL[c] ?? c;

/** Petit graphique en barres (aucune bibliothèque externe : SVG inline). */
function Bars({ labels, values, format = (v: number) => fmtEur(v, 0), highlightLast = true }: { labels: string[]; values: number[]; format?: (v: number) => string; highlightLast?: boolean }) {
  const max = Math.max(...values, 1);
  return (
    <div className="mt-4 flex items-end gap-2">
      {values.map((v, i) => (
        <div key={labels[i]} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[11px] font-semibold text-stone-600">{v > 0 ? format(v) : ''}</span>
          <div className={`w-full rounded-t-lg ${highlightLast && i === values.length - 1 ? 'bg-brand-600' : 'bg-brand-200'}`} style={{ height: `${Math.max(4, (v / max) * 120)}px` }} title={`${labels[i]} : ${format(v)}`} />
          <span className="text-[11px] text-stone-500">{monthLabel(labels[i], true)}</span>
        </div>
      ))}
    </div>
  );
}

/** Courbe d'indice base 100 (SVG inline, sans dépendance). */
function IndexLine({ points }: { points: (number | null)[] }) {
  const known = points.map((p, i) => ({ p, i })).filter((x) => x.p !== null) as { p: number; i: number }[];
  if (known.length < 2) return <p className="text-xs text-stone-400">Pas encore assez de relevés de prix (2 minimum).</p>;
  const min = Math.min(...known.map((k) => k.p), 98);
  const max = Math.max(...known.map((k) => k.p), 102);
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * 100;
  const y = (v: number) => 100 - ((v - min) / Math.max(1, max - min)) * 100;
  const path = known.map((k, n) => `${n === 0 ? 'M' : 'L'} ${x(k.i).toFixed(1)} ${y(k.p).toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 -6 100 112" className="h-16 w-full" preserveAspectRatio="none">
      <line x1="0" y1={y(100)} x2="100" y2={y(100)} stroke="#d6d3d1" strokeWidth="0.5" strokeDasharray="2 2" />
      <path d={path} fill="none" stroke={known[known.length - 1].p > 100 ? '#c2410c' : '#15803d'} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {known.map((k) => <circle key={k.i} cx={x(k.i)} cy={y(k.p)} r="1.2" fill={k.p > 100 ? '#c2410c' : '#15803d'} />)}
    </svg>
  );
}

export default function Analysis() {
  const [months, setMonths] = useState(6);
  const { data, loading, error } = useApi<Analysis>(`/analysis?months=${months}`);
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox message={error} />;
  const a = data!;
  const hasData = a.spend.total > 0 || a.recipes.length > 0;
  const maxSpend = Math.max(...a.spend.totals, 1);
  const maxSupplier = Math.max(...a.bySupplier.map((s) => s.total), 1);
  const worst = [...a.recipes].filter((r) => r.marginPct !== null).sort((x, y) => (x.marginPct ?? 0) - (y.marginPct ?? 0))[0];
  const historyByRecipe = new Map(a.recipeHistory.map((h) => [h.id, h]));

  return (
    <div className="animate-fade-up space-y-6">
      <PageTitle
        title="📊 Analyse"
        subtitle="Où part votre argent, et pourquoi ça bouge. Calculé sur vos commandes et sur les prix réellement facturés que vous saisissez à la réception."
        action={
          <div className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
            {[3, 6, 12].map((m) => <button key={m} onClick={() => setMonths(m)} className={`rounded-lg px-3 py-1.5 font-semibold transition ${months === m ? 'bg-white text-brand-800 shadow-sm' : 'text-stone-500'}`}>{m} mois</button>)}
          </div>
        }
      />

      {!hasData && (
        <Empty>
          <p className="font-semibold text-stone-700">Rien à analyser pour l’instant.</p>
          <p className="mt-1 text-sm text-stone-500">Passez une commande, réceptionnez-la, et saisissez le <b>prix facturé</b> : cette page s’alimente automatiquement à partir de là.</p>
        </Empty>
      )}

      {hasData && <>
        {/* 1. La réponse à la question « pourquoi mes coûts augmentent ? » */}
        <section className={`card ${a.explanation.deltaTotal > 1 ? 'border-orange-200 bg-orange-50/40' : ''}`}>
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 rounded-xl p-2 ${a.explanation.deltaTotal > 1 ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {a.explanation.deltaTotal > 1 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            </span>
            <div className="flex-1">
              <h2 className="font-bold">Pourquoi mes coûts {a.explanation.deltaTotal > 1 ? 'augmentent' : 'évoluent'} ?</h2>
              <p className="mt-1 text-sm leading-relaxed text-stone-700">{a.explanation.sentence}</p>

              {(Math.abs(a.explanation.priceEffectEur) > 1 || Math.abs(a.explanation.volumeEffectEur) > 1) && (
                <div className="mt-3 space-y-2">
                  {[['Prix (ce que vous payez)', a.explanation.priceEffectEur], ['Volume (ce que vous achetez)', a.explanation.volumeEffectEur]].map(([label, v]) => {
                    const value = v as number;
                    const total = Math.abs(a.explanation.priceEffectEur) + Math.abs(a.explanation.volumeEffectEur) || 1;
                    return (
                      <div key={label as string}>
                        <div className="flex justify-between text-xs text-stone-600"><span>{label as string}</span><span className={value > 0 ? 'font-semibold text-orange-700' : 'font-semibold text-emerald-700'}>{value > 0 ? '+' : ''}{fmtEur(value)}</span></div>
                        <div className="mt-1 h-2 rounded-full bg-stone-100"><div className={`h-2 rounded-full ${value > 0 ? 'bg-orange-400' : 'bg-emerald-500'}`} style={{ width: `${(Math.abs(value) / total) * 100}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}

              {a.explanation.contributors.length > 0 && (
                <ul className="mt-4 divide-y divide-stone-100 text-sm">
                  {a.explanation.contributors.map((c) => (
                    <li key={c.productId} className="flex items-center justify-between gap-3 py-2">
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{c.productName}</span>
                        <span className={`pill ${c.reason === 'prix' ? 'bg-orange-100 text-orange-800' : c.reason === 'volume' ? 'bg-sky-100 text-sky-800' : 'bg-stone-100 text-stone-600'}`}>
                          {c.reason === 'prix' ? 'prix' : c.reason === 'volume' ? 'volume' : 'prix + volume'}
                        </span>
                        {c.reason !== 'volume' && <span className="text-xs text-stone-500">{c.pricePart > 0 ? '+' : ''}{fmtEur(c.pricePart)} par le prix</span>}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className={`font-semibold ${c.deltaEur > 0 ? 'text-orange-700' : 'text-emerald-700'}`}>{c.deltaEur > 0 ? '+' : ''}{fmtEur(c.deltaEur)}</span>
                        <Link to={c.productUrl} className="text-brand-700 hover:underline" title="Comparer les fournisseurs sur ce produit"><ChevronRight size={16} /></Link>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label={`Achats ${monthLabel(a.spend.currentMonth)}`} value={fmtEur(a.spend.currentMonthTotal, 0)} hint={`mois précédent : ${fmtEur(a.explanation.previousTotal, 0)}`} tone={a.explanation.deltaTotal > 1 ? 'warn' : 'good'} />
          <Stat label={`Total ${months} mois`} value={fmtEur(a.spend.total, 0)} hint={`${a.bySupplier.length} fournisseur${a.bySupplier.length > 1 ? 's' : ''}`} />
          <Stat label="Prix issus de vos factures" value={`${a.spend.invoicedSharePct} %`} hint={a.spend.invoicedSharePct >= 80 ? 'coûts au plus juste' : 'saisissez le prix facturé à la réception pour affiner'} tone={a.spend.invoicedSharePct >= 80 ? 'good' : 'warn'} />
        </div>

        {/* 2. Dépenses mois par mois */}
        <section className="card">
          <h2 className="font-bold">Vos achats mois par mois</h2>
          <Bars labels={a.spend.months} values={a.spend.totals} />
          {a.spend.byCategory.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {a.spend.byCategory.map((c) => (
                <div key={c.category} className="rounded-xl border border-stone-200 p-3">
                  <div className="flex justify-between text-sm"><span className="font-medium">{cat(c.category)}</span><span>{fmtEur(c.total, 0)} · {Math.round((c.total / Math.max(1, a.spend.total)) * 100)} %</span></div>
                  <div className="mt-1 h-2 rounded-full bg-stone-100"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${(c.total / maxSpend) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 3. Évolution des prix par catégorie (base 100) */}
        {a.prices.length > 0 && (
          <section className="card">
            <h2 className="font-bold">Vos prix montent-ils ?</h2>
            <p className="text-sm text-stone-500">Chaque produit est suivi à partir de son premier prix relevé (base 100), puis les produits sont moyennés par catégorie : au-dessus de 100, vous payez plus cher qu’au départ, sans que l’arrivée d’un produit nouveau ne fausse la comparaison.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {a.prices.map((p) => (
                <div key={p.category} className="rounded-xl border border-stone-200 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{cat(p.category)}</span>
                    {p.changePct === null
                      ? <span className="pill bg-stone-100 text-stone-600" title="Il faut au moins deux mois de relevés pour comparer des mois entre eux.">1 mois de relevés</span>
                      : <span className={`text-sm font-bold ${p.changePct > 0 ? 'text-orange-700' : 'text-emerald-700'}`}>{pct(p.changePct)}</span>}
                  </div>
                  {p.changePct !== null && <IndexLine points={p.points} />}
                  <p className="text-xs text-stone-500">
                    {p.productsTracked} produit{p.productsTracked > 1 ? 's' : ''} suivi{p.productsTracked > 1 ? 's' : ''}
                    {p.risingProducts > 0 && <> · <b className="text-orange-700">{p.risingProducts} en hausse</b></>}
                    {p.avgProductChangePct !== null && <> · {pct(p.avgProductChangePct)} en moyenne</>}
                  </p>
                  {p.changePct === null && <p className="mt-1 text-xs text-stone-400">Relevés de ce mois : {fmtEur(p.firstPrice)} → {fmtEur(p.lastPrice)}. La comparaison mois à mois s’affichera le mois prochain.</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 4. Les dérives qui coûtent le plus */}
        <section className="card">
          <h2 className="flex items-center gap-2 font-bold">Ce qui vous coûte le plus cher <AlertTriangle size={16} className="text-orange-500" /></h2>
          {a.drifts.length === 0
            ? <p className="mt-2 text-sm text-stone-500">Aucune hausse de prix détectée sur la période. <span className="text-stone-400">(Chaque réception avec prix facturé alimente ce classement.)</span></p>
            : <table className="mt-3 w-full text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-stone-400"><th className="py-1">Produit</th><th>Prix avant → après</th><th className="text-right">Hausse</th><th className="text-right">Quantité achetée</th><th className="text-right">Ce que ça coûte</th><th /></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {a.drifts.map((d) => (
                    <tr key={d.productId}>
                      <td className="py-2"><p className="font-medium">{d.productName}</p><p className="text-xs text-stone-500">{d.supplierName}{d.invoiced ? ' · prix facturé' : ''}</p></td>
                      <td className="text-stone-600">{fmtEur(d.firstPrice)} → <b>{fmtEur(d.lastPrice)}</b><span className="text-xs text-stone-400"> /{d.unit}</span></td>
                      <td className="text-right font-semibold text-orange-700">{pct(d.changePct)}</td>
                      <td className="text-right text-stone-600">{fmtQty(d.quantitySince, d.unit)}</td>
                      <td className="text-right font-bold text-orange-800">+{fmtEur(d.impactEur, 0)}</td>
                      <td className="pl-2 text-right"><Link to={`/app/achats/comparer/${d.productId}`} className="text-brand-700 hover:underline text-xs font-semibold">Comparer →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>}
          {a.watchlist.length > 0 && (
            <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <p className="text-sm font-semibold text-stone-700">À surveiller : hausses constatées, aucun achat sur la période</p>
              <ul className="mt-1 text-sm text-stone-600">
                {a.watchlist.map((d) => (
                  <li key={d.productId} className="flex items-center justify-between">
                    <span>{d.productName} · {fmtEur(d.firstPrice)} → <b>{fmtEur(d.lastPrice)}</b> /{d.unit}</span>
                    <span className="font-semibold text-orange-700">{pct(d.changePct)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-stone-400">Le montant exact sera chiffré dès votre prochain achat de ces produits.</p>
            </div>
          )}
        </section>

        {/* 5. Marge par plat, au coût réel */}
        <section className="card">
          <h2 className="font-bold">La marge de vos plats</h2>
          <p className="text-sm text-stone-500">Coût matière calculé avec le <b>dernier prix réellement payé</b> de chaque ingrédient.</p>
          {a.recipes.length === 0
            ? <p className="mt-2 text-sm text-stone-500">Aucune recette enregistrée. <Link className="font-semibold text-brand-700 hover:underline" to="/app/recettes">Créer mes recettes →</Link></p>
            : <>
              {worst && worst.marginPct !== null && worst.marginPct < (worst.targetMarginPct ?? 70) && (
                <p className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
                  ⚠️ <b>{worst.name}</b> est en dessous de votre objectif : {pct(worst.marginPct)} de marge au lieu des {pct(worst.targetMarginPct ?? 70)} visés
                  {worst.costPerPortion !== null && worst.sellingPriceEur !== null ? ` (coût ${fmtEur(worst.costPerPortion)} pour un plat vendu ${fmtEur(worst.sellingPriceEur)}).` : '.'}
                </p>
              )}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-stone-400"><th className="py-1">Plat</th><th className="text-right">Coût matière</th><th className="text-right">Prix de vente</th><th className="text-right">Marge</th><th className="text-right">Portions (30 j)</th><th className="text-right">Marge totale</th><th>Coût dans le temps</th></tr></thead>
                  <tbody className="divide-y divide-stone-100">
                    {a.recipes.map((r) => {
                      const h = historyByRecipe.get(r.id);
                      return (
                        <tr key={r.id}>
                          <td className="py-2 font-medium">{r.name}{r.missingPrices.length > 0 && <span className="ml-2 text-xs text-amber-700" title={`Prix manquant : ${r.missingPrices.join(', ')}`}>⚠️ prix manquant</span>}</td>
                          <td className="text-right">{r.costPerPortion === null ? <span className="text-stone-400">—</span> : fmtEur(r.costPerPortion)}</td>
                          <td className="text-right">{r.sellingPriceEur === null ? <span className="text-stone-400">—</span> : fmtEur(r.sellingPriceEur)}</td>
                          <td className={`text-right font-semibold ${r.marginPct === null ? 'text-stone-400' : r.marginPct < (r.targetMarginPct ?? 70) ? 'text-orange-700' : 'text-emerald-700'}`}>{pct(r.marginPct)}<span className="block text-xs font-normal text-stone-500">{r.marginEur === null ? '' : fmtEur(r.marginEur)}</span></td>
                          <td className="text-right text-stone-600">{r.portions30 || '—'}</td>
                          <td className="text-right font-semibold">{r.marginTotalEur === null ? '—' : fmtEur(r.marginTotalEur, 0)}</td>
                          <td className="pl-2">{h && h.changePct !== null
                            ? <span className={`text-xs font-semibold ${h.changePct > 0 ? 'text-orange-700' : 'text-emerald-700'}`} title={`depuis ${monthLabel(a.months[h.points.findIndex((v) => v !== null)] ?? a.months[0])}`}>{pct(h.changePct)} depuis {monthLabel(a.months[h.points.findIndex((v) => v !== null)] ?? a.months[0], true)}</span>
                            : <span className="text-xs text-stone-400">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-stone-400"><Info size={12} className="mr-1 inline" /> La colonne « coût dans le temps » est reconstruite à partir de vos prix réellement payés : elle montre si un plat devient moins rentable sans que vous ayez changé sa recette.</p>
            </>}
        </section>

        {/* 6. Dépenses par fournisseur */}
        <section className="card">
          <h2 className="font-bold">Vos fournisseurs</h2>
          <ul className="mt-4 space-y-3">
            {a.bySupplier.map((x) => (
              <li key={x.supplierId ?? x.supplierName}>
                <div className="flex justify-between text-sm"><span className="font-medium">{x.supplierName} {x.invoiced && <span className="text-xs text-emerald-700">· prix facturés</span>}</span><span>{fmtEur(x.total, 0)} · {Math.round((x.total / Math.max(1, a.spend.total)) * 100)} %</span></div>
                <div className="mt-1 h-2 rounded-full bg-stone-100"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${(x.total / maxSupplier) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
      </>}
    </div>
  );
}

import { useState } from 'react';
import { fmtEur } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox, Stat } from '../components/ui';

type S = { name: string; stats: { spent: number; delivered: number; reliability: number } };
type Dash = { spend: { thisMonth: number; prevMonth: number; last30: number; prev30: number; evolutionPct: number | null } };
type MarginPoint = { month: string; costPerPortion: number | null; marginPct: number | null; grossMarginPerPortion: number | null; portionsSold: number; revenueEur: number };
type Dish = { recipeId: string; name: string; sellingPriceEur: number | null; status: 'complet' | 'incomplet'; points: MarginPoint[]; portionsSold: number; revenueEur: number };
type CatIndex = { category: string; baseMonth: string | null; points: { month: string; index: number | null }[] };
type Margins = { months: string[]; windowStart: string; dishes: Dish[]; priceIndex: CatIndex[] };

const COLORS = ['#b45309', '#0f766e', '#7c3aed', '#be123c', '#1d4ed8', '#4d7c0f'];
const CAT_LABEL: Record<string, string> = { feculents: 'Féculents', frais: 'Frais', viandes_poissons: 'Viandes & poissons', epicerie: 'Épicerie', boissons: 'Boissons', emballages: 'Emballages', autre: 'Autres' };
const monthLabel = (m: string) => new Date(`${m}-02`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });

/** Multi-courbes SVG inline (mêmes conventions que PriceHistory.tsx) — un trou (null) coupe la ligne, jamais d'extrapolation. */
function MultiLineChart({ series, unit, ariaLabel }: { series: { label: string; points: { month: string; value: number | null }[] }[]; unit: string; ariaLabel: string }) {
  const W = 620, H = 200, PAD = 26;
  const all = series.flatMap((s) => s.points.map((p) => p.value).filter((v): v is number => v !== null));
  if (all.length === 0) return null;
  const n = Math.max(...series.map((s) => s.points.length), 2);
  const vmin = Math.min(...all), vmax = Math.max(...all);
  const pmin = vmin === vmax ? vmin - Math.abs(vmin || 1) * 0.1 : vmin - (vmax - vmin) * 0.15;
  const pmax = vmin === vmax ? vmax + Math.abs(vmax || 1) * 0.1 : vmax + (vmax - vmin) * 0.15;
  const x = (i: number) => PAD + (i / (n - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - pmin) / (pmax - pmin || 1)) * (H - 2 * PAD);
  const months = series[0]?.points.map((p) => p.month) ?? [];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full h-52" role="img" aria-label={ariaLabel}>
      {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={PAD} x2={W - PAD} y1={PAD + f * (H - 2 * PAD)} y2={PAD + f * (H - 2 * PAD)} stroke="#e7e5e4" strokeDasharray="3 3" />)}
      {[pmin, (pmin + pmax) / 2, pmax].map((v, i) => <text key={i} x={2} y={y(v) + 3} fontSize="9" fill="#a8a29e">{Math.round(v * 10) / 10}{unit}</text>)}
      {months.map((m, i) => (i === 0 || i === months.length - 1 || months.length <= 6) && <text key={m} x={x(i)} y={H - 8} fontSize="9" fill="#a8a29e" textAnchor="middle">{monthLabel(m)}</text>)}
      {series.map((s, si) => {
        const color = COLORS[si % COLORS.length];
        const runs: { i: number; v: number }[][] = [];
        let cur: { i: number; v: number }[] = [];
        s.points.forEach((p, i) => { if (p.value === null) { if (cur.length) runs.push(cur); cur = []; } else cur.push({ i, v: p.value }); });
        if (cur.length) runs.push(cur);
        return (
          <g key={s.label}>
            {runs.map((run, ri) => run.length >= 2 && <path key={ri} d={run.map((pt, k) => `${k ? 'L' : 'M'}${x(pt.i).toFixed(1)},${y(pt.v).toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth={2} />)}
            {runs.flat().map((pt) => <circle key={`${s.label}-${pt.i}`} cx={x(pt.i)} cy={y(pt.v)} r={3} fill={color}><title>{s.label} · {monthLabel(s.points[pt.i].month)} · {Math.round(pt.v * 10) / 10}{unit}</title></circle>)}
          </g>
        );
      })}
    </svg>
  );
}

export default function Analysis() {
  const [months, setMonths] = useState(6);
  const d = useApi<Dash>('/dashboard');
  const s = useApi<{ suppliers: S[] }>('/suppliers');
  const mg = useApi<Margins>(`/analysis/margins?months=${months}`);
  if ((d.loading && !d.data) || (s.loading && !s.data) || (mg.loading && !mg.data)) return <Loader />;
  if (d.error || s.error || mg.error) return <ErrorBox message={d.error ?? s.error ?? mg.error ?? ''} />;
  const sp = d.data!.spend;
  const sups = [...(s.data?.suppliers ?? [])].sort((a, b) => b.stats.spent - a.stats.spent);
  const total = sups.reduce((a, x) => a + x.stats.spent, 0) || 1;
  const m = mg.data!;
  // top plats vendus — seuls ceux ayant au moins une marge connue sont dessinés
  const dishes = [...m.dishes].sort((a, b) => b.revenueEur - a.revenueEur);
  const drawn = dishes.filter((x) => x.points.some((p) => p.marginPct !== null)).slice(0, 5);
  const marginSeries = drawn.map((x) => ({ label: x.name, points: x.points.map((p) => ({ month: p.month, value: p.marginPct })) }));
  const idxSeries = m.priceIndex
    .filter((c) => c.points.some((p) => p.index !== null))
    .map((c) => ({ label: CAT_LABEL[c.category] ?? c.category, points: c.points.map((p) => ({ month: p.month, value: p.index })) }));
  const last = <T,>(pts: { month: string; value: T | null }[]): T | null => [...pts].reverse().find((p) => p.value !== null)?.value ?? null;

  return (
    <div className="animate-fade-up space-y-8">
      <PageTitle title="📊 Analyse" subtitle="Où part votre argent, et comment ça évolue. Marges par plat dans le temps et indice de prix par catégorie." />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Ce mois-ci" value={fmtEur(sp.thisMonth, 0)} hint={`mois précédent : ${fmtEur(sp.prevMonth, 0)}`} />
        <Stat label="30 derniers jours" value={fmtEur(sp.last30, 0)} hint={`30 j précédents : ${fmtEur(sp.prev30, 0)}`} />
        <Stat label="Évolution des coûts" value={sp.evolutionPct === null ? '—' : `${sp.evolutionPct > 0 ? '+' : ''}${sp.evolutionPct.toLocaleString('fr-FR')} %`} tone={sp.evolutionPct !== null && sp.evolutionPct > 5 ? 'bad' : 'good'} />
      </div>

      {/* Chantier 2 (audit) — la promesse « marges par plat dans le temps » est désormais un graphe. */}
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold">📈 Évolution des marges par plat</h2>
            <p className="text-xs text-stone-500">Marge brute en % du prix de vente, recalculée chaque mois depuis les prix d’achat réels. Un trou = pas de prix connu ce mois-là.</p>
          </div>
          <div className="flex gap-1">{[3, 6, 12].map((k) => <button key={k} onClick={() => setMonths(k)} className={`rounded-lg px-3 py-1 text-sm font-semibold ${months === k ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>{k} mois</button>)}</div>
        </div>
        {marginSeries.length > 0 ? (
          <>
            <MultiLineChart series={marginSeries} unit=" %" ariaLabel="Évolution des marges par plat" />
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {drawn.map((x, i) => {
                const lm = last(x.points.map((p) => ({ month: p.month, value: p.marginPct })));
                return <li key={x.recipeId} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{x.name} <span className="text-stone-500">({lm !== null ? `${Math.round(lm * 10) / 10} %` : '—'}{x.status === 'incomplet' ? ', partiel' : ''})</span></li>;
              })}
            </ul>
          </>
        ) : (
          <p className="mt-3 text-sm text-stone-500">Pas encore assez d’historique pour tracer des marges : saisissez quelques jours de ventes et complétez les prix d’achat (les plats sans prix complet restent masqués plutôt qu’affichés faux).</p>
        )}
        {dishes.length > 0 && (
          <table className="mt-4 w-full text-xs">
            <thead className="text-left text-stone-400"><tr><th className="py-1">Plat</th><th className="py-1 text-right">Ventes ({months} m)</th><th className="py-1 text-right">Coût / portion</th><th className="py-1 text-right">Marge</th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {dishes.slice(0, 8).map((x) => {
                const lc = last(x.points.map((p) => ({ month: p.month, value: p.costPerPortion })));
                const lm = last(x.points.map((p) => ({ month: p.month, value: p.marginPct })));
                return (
                  <tr key={x.recipeId}>
                    <td className="py-1.5 font-medium">{x.name}{x.status === 'incomplet' && <span className="ml-1 text-[9px] text-amber-700">partiel</span>}</td>
                    <td className="py-1.5 text-right">{x.portionsSold}</td>
                    <td className="py-1.5 text-right">{lc !== null ? `${x.status === 'incomplet' ? '≥ ' : ''}${fmtEur(lc)}` : <span className="text-stone-400">à calculer</span>}</td>
                    <td className="py-1.5 text-right">{lm !== null ? `${Math.round(lm * 10) / 10} %` : <span className="text-stone-400">à calculer</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Chantier 2 (audit) — l'« indice de prix par catégorie » est là lui aussi (base 100 = premier mois avec données). */}
      <section className="card">
        <h2 className="font-bold">🧺 Indice de prix par catégorie</h2>
        <p className="text-xs text-stone-500">Évolution des prix d’achat, base 100 = premier mois avec données. Comme un indice des prix : 110 = +10 % sur la période.</p>
        {idxSeries.length > 0 ? (
          <>
            <MultiLineChart series={idxSeries} unit="" ariaLabel="Indice de prix par catégorie" />
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {m.priceIndex.filter((c) => c.points.some((p) => p.index !== null)).map((c, i) => {
                const li = last(c.points.map((p) => ({ month: p.month, value: p.index })));
                return <li key={c.category} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{CAT_LABEL[c.category] ?? c.category} <span className="text-stone-500">({li !== null ? Math.round(li * 10) / 10 : '—'})</span></li>;
              })}
            </ul>
          </>
        ) : (
          <p className="mt-3 text-sm text-stone-500">Pas encore assez d’historique de prix : l’indice se construit à partir de vos réceptions et de vos offres fournisseurs.</p>
        )}
      </section>

      <div className="card">
        <h2 className="font-bold">Dépenses par fournisseur</h2>
        <ul className="mt-4 space-y-3">{sups.map((x) => <li key={x.name}><div className="flex justify-between text-sm"><span className="font-medium">{x.name}</span><span>{fmtEur(x.stats.spent, 0)} · {Math.round((x.stats.spent / total) * 100)} %</span></div><div className="mt-1 h-2 rounded-full bg-stone-100"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${(x.stats.spent / total) * 100}%` }} /></div></li>)}</ul>
      </div>
    </div>
  );
}

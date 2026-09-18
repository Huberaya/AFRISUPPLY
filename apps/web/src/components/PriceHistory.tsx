import { useApi } from '../lib/useApi';
import { fmtEur } from '../lib/api';

type Series = { offerId: string; supplierName: string; packLabel: string; points: { at: string; price: number }[]; first: number; last: number; changePct: number | null };
const COLORS = ['#b45309', '#0f766e', '#7c3aed', '#be123c', '#1d4ed8', '#4d7c0f'];

/** Courbe SVG inline de l'historique de prix par fournisseur (pas de dépendance graphique). */
export function PriceHistory({ productId, unit }: { productId: string; unit: string }) {
  const { data } = useApi<{ days: number; series: Series[] }>(`/prices/${productId}/history?days=180`);
  if (!data || data.series.length === 0) return null;
  const pts = data.series.flatMap((s) => s.points);
  if (pts.length < 2) return null;
  const t0 = Math.min(...pts.map((p) => new Date(p.at).getTime())), t1 = Math.max(...pts.map((p) => new Date(p.at).getTime()), t0 + 86_400_000);
  const pmin = Math.min(...pts.map((p) => p.price)) * 0.95, pmax = Math.max(...pts.map((p) => p.price)) * 1.05;
  const W = 600, H = 160, PAD = 8;
  const x = (iso: string) => PAD + ((new Date(iso).getTime() - t0) / (t1 - t0)) * (W - 2 * PAD);
  const y = (p: number) => H - PAD - ((p - pmin) / (pmax - pmin || 1)) * (H - 2 * PAD);
  return (
    <div className="card">
      <div className="flex items-center justify-between"><h3 className="font-bold">📈 Historique des prix</h3><span className="text-xs text-stone-500">{data.days} derniers jours · €/{unit}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full h-40" role="img" aria-label="Historique des prix">
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={PAD} x2={W - PAD} y1={PAD + f * (H - 2 * PAD)} y2={PAD + f * (H - 2 * PAD)} stroke="#e7e5e4" strokeDasharray="3 3" />)}
        {data.series.map((s, i) => {
          const sorted = [...s.points].sort((a, b) => a.at.localeCompare(b.at));
          const last = sorted[sorted.length - 1];
          const d = sorted.map((p, k) => `${k ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ') + ` L${(W - PAD).toFixed(1)},${y(last.price).toFixed(1)}`;
          return <g key={s.offerId}><path d={d} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth={2} />{sorted.map((p) => <circle key={p.at} cx={x(p.at)} cy={y(p.price)} r={3} fill={COLORS[i % COLORS.length]}><title>{s.supplierName} · {new Date(p.at).toLocaleDateString('fr-FR')} · {fmtEur(p.price)}</title></circle>)}</g>;
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">{data.series.map((s, i) => <li key={s.offerId} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{s.supplierName} <span className="text-stone-500">({s.packLabel})</span> {fmtEur(s.last)}{s.changePct !== null && s.changePct !== 0 && <span className={s.changePct > 0 ? 'text-red-600 font-semibold' : 'text-emerald-700 font-semibold'}>{s.changePct > 0 ? '+' : ''}{s.changePct} %</span>}</li>)}</ul>
    </div>
  );
}

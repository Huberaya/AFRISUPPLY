// Chantier 15 (B) — Tableau de bord fournisseur : ce qui se vend, à qui, tendance, et ce que les restaurants de ma zone cherchent sans me trouver.
import { useEffect, useState } from 'react';
import { TrendingUp, Users, Lightbulb, Bell, Clock, PackagePlus } from 'lucide-react';
import { api, CATEGORY_LABEL } from '../../lib/api';

type A = { period: string; byProduct: { productId: string; name: string; category: string; unit: string; packs: number; qty: number; revenue: number; orders: number; restaurants: number }[]; topCustomers: { restaurantId: string; name: string; city: string | null; orders: number; revenue: number; last: string }[]; monthly: { month: string; revenue: number; orders: number; restaurants: number }[]; funnel: { total: number; refused: number; avgDecisionH: number }; uncovered: { productId: string; name: string; category: string; unit: string; restaurants: number }[]; restaurantsInZone: number; alerts: { product: string; count: number }[] };
const eur = (v: number) => `${Number(v).toFixed(2).replace('.', ',')} €`;
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function Analytics({ onAddOffer }: { onAddOffer: (productId: string, name: string) => void }) {
  const [a, setA] = useState<A | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<A>('/vendor/analytics').then(setA).catch((e) => setErr((e as Error).message)); }, []);
  if (err) return <p className="text-red-700">{err}</p>; if (!a) return <p className="text-stone-500">Calcul en cours…</p>;
  const total = a.byProduct.reduce((s, p) => s + p.revenue, 0); const maxM = Math.max(1, ...a.monthly.map((m) => m.revenue));
  const months = [...Array(6)].map((_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i); const key = d.toISOString().slice(0, 7); return { key, label: MONTHS[d.getMonth()], ...(a.monthly.find((m) => m.month === key) ?? { revenue: 0, orders: 0, restaurants: 0 }) }; });
  const acceptPct = a.funnel.total ? Math.round(100 * (a.funnel.total - a.funnel.refused) / a.funnel.total) : null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['CA 90 jours', eur(total)], ['Restaurants actifs', String(new Set(a.topCustomers.map((c) => c.restaurantId)).size)], ['Taux d’acceptation', acceptPct === null ? '—' : `${acceptPct} %`], ['Délai de réponse moyen', a.funnel.avgDecisionH ? `${Number(a.funnel.avgDecisionH).toFixed(1)} h` : '—']].map(([l, v]) => <div key={l} className="card !p-3"><p className="text-xs text-stone-500">{l}</p><p className="text-xl font-extrabold">{v}</p></div>)}
      </div>

      <section className="card"><h2 className="flex items-center gap-2 font-bold"><TrendingUp size={18} /> Chiffre d’affaires — 6 derniers mois</h2>
        <div className="mt-4 flex h-40 items-end gap-2">{months.map((m) => <div key={m.key} className="flex flex-1 flex-col items-center gap-1"><span className="text-[11px] font-semibold text-stone-600">{m.revenue ? eur(m.revenue) : ''}</span><div className="w-full rounded-t-lg bg-brand-500" style={{ height: `${Math.max(2, 100 * m.revenue / maxM)}%` }} title={`${m.orders} commande(s), ${m.restaurants} restaurant(s)`} /><span className="text-xs text-stone-500">{m.label}</span></div>)}</div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card !p-0"><h2 className="p-4 pb-2 font-bold">Vos produits qui se vendent ({a.period})</h2>
          {a.byProduct.length ? <table className="w-full text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="p-3">Produit</th><th className="p-3 text-right">Colis</th><th className="p-3 text-right">CA</th><th className="p-3 text-right">Part</th></tr></thead><tbody className="divide-y divide-stone-100">{a.byProduct.map((p) => <tr key={p.productId}><td className="p-3"><p className="font-semibold">{p.name}</p><p className="text-xs text-stone-500">{p.restaurants} resto{p.restaurants > 1 ? 's' : ''} · {p.orders} cde</p></td><td className="p-3 text-right">{p.packs}</td><td className="p-3 text-right font-semibold">{eur(p.revenue)}</td><td className="p-3 text-right"><div className="ml-auto h-2 w-16 rounded-full bg-stone-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${total ? 100 * p.revenue / total : 0}%` }} /></div></td></tr>)}</tbody></table>
            : <p className="p-4 pt-0 text-sm text-stone-500">Aucune vente confirmée sur la période. Les commandes confirmées apparaissent ici.</p>}
        </section>
        <section className="card !p-0"><h2 className="flex items-center gap-2 p-4 pb-2 font-bold"><Users size={18} /> Vos meilleurs clients</h2>
          {a.topCustomers.length ? <table className="w-full text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="p-3">Restaurant</th><th className="p-3 text-right">Cdes</th><th className="p-3 text-right">CA</th><th className="p-3 text-right">Dernière</th></tr></thead><tbody className="divide-y divide-stone-100">{a.topCustomers.map((r) => { const days = Math.round((Date.now() - new Date(r.last).getTime()) / 86400000); return <tr key={r.restaurantId}><td className="p-3"><p className="font-semibold">{r.name}</p><p className="text-xs text-stone-500">{r.city ?? ''}</p></td><td className="p-3 text-right">{r.orders}</td><td className="p-3 text-right font-semibold">{eur(r.revenue)}</td><td className={`p-3 text-right text-xs ${days > 30 ? 'text-amber-700' : 'text-stone-500'}`}>{days === 0 ? 'aujourd’hui' : `il y a ${days} j`}{days > 30 ? ' ⚠️' : ''}</td></tr>; })}</tbody></table>
            : <p className="p-4 pt-0 text-sm text-stone-500">Pas encore de client. {a.restaurantsInZone} restaurant{a.restaurantsInZone > 1 ? 's' : ''} AFRISUPPLY dans vos zones de livraison.</p>}
        </section>
      </div>

      <section className="card border-amber-200 bg-amber-50/50"><h2 className="flex items-center gap-2 font-bold"><Lightbulb size={18} className="text-amber-600" /> Ce que les restaurants de votre zone cherchent — et que vous ne proposez pas</h2>
        <p className="mt-1 text-sm text-stone-600">{a.restaurantsInZone} restaurant{a.restaurantsInZone > 1 ? 's' : ''} dans vos zones. Ces produits sont dans leur stock suivi mais absents de votre catalogue : les ajouter, c’est des commandes en plus.</p>
        {a.uncovered.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{a.uncovered.map((u) => <div key={u.productId} className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm"><div><p className="font-semibold">{u.name}</p><p className="text-xs text-stone-500">{CATEGORY_LABEL[u.category] ?? u.category} · {u.restaurants} resto{u.restaurants > 1 ? 's' : ''} le suivent</p></div><button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => onAddOffer(u.productId, u.name)}><PackagePlus size={14} /> Ajouter</button></div>)}</div>
          : <p className="mt-3 text-sm text-stone-500">Rien à signaler : vous couvrez déjà les produits suivis dans votre zone.</p>}
      </section>

      {a.alerts.length > 0 && <section className="card"><h2 className="flex items-center gap-2 font-bold"><Bell size={18} /> Demandes reçues sur la vitrine publique (90 j)</h2><p className="mt-1 text-sm text-stone-600">Des visiteurs ont cliqué « Me prévenir » sur ces produits sans offre :</p><div className="mt-2 flex flex-wrap gap-2">{a.alerts.map((x) => <span key={x.product} className="pill bg-stone-100 text-stone-800">{x.product} <b className="ml-1">×{x.count}</b></span>)}</div></section>}
      <p className="flex items-center gap-1 text-xs text-stone-400"><Clock size={12} /> Données calculées à l’ouverture de l’onglet, sur les commandes confirmées ou livrées.</p>
    </div>
  );
}

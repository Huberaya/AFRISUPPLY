// Marketplace côté restaurant : fournisseurs plateforme de ma zone, catalogue comparé à mes prix, commande, achats groupés.
import { useEffect, useState } from 'react';
import { Store, Link2, ShoppingCart, Users, Check, ArrowLeft } from 'lucide-react';
import { api, CATEGORY_LABEL } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox, Empty } from '../components/ui';

type Vendor = { id: string; name: string; description: string | null; city: string | null; deliveryZones: string[]; categories: string[]; leadTimeHours: number; minOrderEur: string; deliveryFeeEur: string; offerCount: number; coversMyProducts: number; myProductCount: number; linkedSupplierId: string | null };
type Tier = { minPacks: number; packPriceEur: number };
type Quote = { lines: { vendorOfferId: string; packPriceEur: number; listPriceEur: number; source: string; lineTotalEur: number; savedEur: number; nextTier: { minPacks: number; packPriceEur: number; missingPacks: number; extraSavingEur: number } | null }[]; total: number; saved: number };
type Offer = { id: string; productName: string; category: string; unit: string; packLabel: string; packQty: string; packPriceEur: string; listPriceEur?: number; negotiated?: boolean; tiers?: Tier[]; unitPrice: number; myBestUnitPrice: number | null; savingPct: number | null; tracked: boolean; inStock: boolean };
type GB = { id: string; title: string; vendorName: string; productName: string; packLabel: string; packPrice: number; discountedPackPrice: number; discountPct: string; targetPacks: number; committedPacks: number; participants: number; progressPct: number; myPacks: number; hoursLeft: number; status: string; deliveryDate: string | null };
const eur = (v: number | string) => `${Number(v).toFixed(2).replace('.', ',')} €`;

export default function Marketplace() {
  const [sel, setSel] = useState<string | null>(null);
  return sel ? <VendorDetail id={sel} back={() => setSel(null)} /> : <Directory open={setSel} />;
}

function Directory({ open }: { open: (id: string) => void }) {
  const { data, loading, error } = useApi<{ vendors: Vendor[]; zones: string[] }>('/marketplace/vendors');
  const gbs = useApi<{ groupBuys: GB[] }>('/marketplace/group-buys');
  if (loading) return <Loader />; if (error) return <ErrorBox message={error} />; if (!data) return null;
  return (
    <div className="animate-fade-up space-y-6">
      <PageTitle title="🏪 Marketplace" subtitle={`Fournisseurs vérifiés qui livrent votre zone (${data.zones.filter((z) => z !== 'France').join(', ') || 'toute la France'}). Prix comparés aux vôtres, commande en un clic, achats groupés entre restaurants.`} />
      {gbs.data && gbs.data.groupBuys.length > 0 && <GroupBuys list={gbs.data.groupBuys} reload={gbs.reload} />}
      {data.vendors.length === 0 ? <Empty>Aucun fournisseur plateforme ne livre encore votre zone. Vous connaissez un bon grossiste ? Envoyez-lui <a className="underline" href="/fournisseur">afrisupply.fr/fournisseur</a> — il s’inscrit en 5 minutes.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.vendors.map((v) => (
            <button key={v.id} onClick={() => open(v.id)} className="card text-left transition hover:shadow-md">
              <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-bold">{v.name}</p><p className="text-sm text-stone-500">{v.city ?? 'En ligne'} · livraison {v.leadTimeHours} h · min {eur(v.minOrderEur)}{Number(v.deliveryFeeEur) > 0 ? ` · port ${eur(v.deliveryFeeEur)}` : ' · port offert'}</p></div>{v.linkedSupplierId && <span className="pill bg-emerald-50 text-emerald-800"><Check size={12} /> Lié</span>}</div>
              {v.description && <p className="mt-2 text-sm text-stone-600 line-clamp-2">{v.description}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">{v.categories.map((c) => <span key={c} className="pill bg-stone-100 text-stone-700">{CATEGORY_LABEL[c] ?? c}</span>)}</div>
              <p className="mt-3 text-sm"><b>{v.offerCount}</b> produits · couvre <b>{v.coversMyProducts}/{v.myProductCount}</b> de vos produits suivis</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupBuys({ list, reload }: { list: GB[]; reload: () => void }) {
  const [packs, setPacks] = useState<Record<string, string>>({});
  const join = async (id: string) => { await api(`/marketplace/group-buys/${id}/join`, { method: 'POST', json: { packs: Number(packs[id] ?? 0) } }); reload(); };
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Users size={20} /> Achats groupés en cours</h2>
      <div className="grid gap-3 md:grid-cols-2">{list.map((g) => (
        <div key={g.id} className="card space-y-2 border-brand-100 bg-brand-50/40">
          <p className="font-bold">{g.title}</p>
          <p className="text-sm text-stone-600">{g.vendorName} · <s>{eur(g.packPrice)}</s> <b className="text-brand-800">{eur(g.discountedPackPrice)}</b> le {g.packLabel} (−{Number(g.discountPct)} %) · {g.hoursLeft < 48 ? `${g.hoursLeft} h restantes` : `${Math.round(g.hoursLeft / 24)} j restants`}</p>
          <div className="h-2 w-full rounded-full bg-white"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${g.progressPct}%` }} /></div>
          <p className="text-xs text-stone-500">{g.committedPacks}/{g.targetPacks} colis · {g.participants} restaurant{g.participants > 1 ? 's' : ''}{g.status === 'atteint' ? ' · 🎉 palier atteint' : ''}</p>
          <div className="flex gap-2"><input type="number" min={0} className="input w-24" placeholder={String(g.myPacks || '')} value={packs[g.id] ?? ''} onChange={(e) => setPacks({ ...packs, [g.id]: e.target.value })} /><button className="btn-primary" onClick={() => void join(g.id)}>{g.myPacks ? `Modifier (${g.myPacks})` : 'Participer'}</button></div>
        </div>))}</div>
    </section>
  );
}

function VendorDetail({ id, back }: { id: string; back: () => void }) {
  const { data, loading, error, reload } = useApi<{ vendor: Vendor; offers: Offer[]; linkedSupplierId: string | null }>(`/marketplace/vendors/${id}`);
  const [cart, setCart] = useState<Record<string, number>>({}); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [onlyMine, setOnlyMine] = useState(true); const [quote, setQuote] = useState<Quote | null>(null);
  useEffect(() => { setCart({}); setQuote(null); }, [id]);
  useEffect(() => { const lines = Object.entries(cart).filter(([, p]) => p > 0).map(([vendorOfferId, packs]) => ({ vendorOfferId, packs })); if (!lines.length) { setQuote(null); return; } const t = setTimeout(() => api<Quote>(`/marketplace/vendors/${id}/quote`, { method: 'POST', json: { lines } }).then(setQuote).catch(() => setQuote(null)), 250); return () => clearTimeout(t); }, [cart, id]);
  if (loading) return <Loader />; if (error) return <ErrorBox message={error} />; if (!data) return null;
  const v = data.vendor; const offers = data.offers.filter((o) => !onlyMine || o.tracked);
  const total = quote?.total ?? data.offers.reduce((a, o) => a + (cart[o.id] ?? 0) * Number(o.packPriceEur), 0); const nb = Object.values(cart).filter((x) => x > 0).length;
  const link = async () => { setBusy(true); try { const r = await api<{ message: string }>(`/marketplace/vendors/${id}/link`, { method: 'POST' }); setMsg(r.message); reload(); } finally { setBusy(false); } };
  const order = async () => { setBusy(true); setMsg(null); try { const r = await api<{ message: string }>(`/marketplace/vendors/${id}/orders`, { method: 'POST', json: { lines: Object.entries(cart).filter(([, p]) => p > 0).map(([vendorOfferId, packs]) => ({ vendorOfferId, packs })) } }); setMsg(r.message); setCart({}); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };
  return (
    <div className="animate-fade-up space-y-4 pb-28">
      <button className="btn-ghost" onClick={back}><ArrowLeft size={16} /> Marketplace</button>
      <PageTitle title={v.name} subtitle={<>{v.city ?? 'En ligne'} · livraison sous {v.leadTimeHours} h · minimum {eur(v.minOrderEur)}{v.description ? <><br />{v.description}</> : null}</>} action={data.linkedSupplierId ? <span className="pill bg-emerald-50 text-emerald-800"><Check size={12} /> Dans vos fournisseurs</span> : <button className="btn-ghost" disabled={busy} onClick={() => void link()}><Link2 size={16} /> Ajouter à mes fournisseurs</button>} />
      {msg && <p className="rounded-xl bg-brand-50 border border-brand-100 p-3 text-sm text-brand-900">{msg}</p>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Seulement mes produits suivis ({data.offers.filter((o) => o.tracked).length}/{data.offers.length})</label>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="p-3">Produit</th><th className="p-3">Conditionnement</th><th className="p-3 text-right">Prix</th><th className="p-3 text-right">vs mon meilleur prix</th><th className="p-3 text-right">Colis</th></tr></thead>
          <tbody className="divide-y divide-stone-100">{offers.map((o) => (
            <tr key={o.id} className={!o.inStock ? 'opacity-50' : ''}>
              <td className="p-3 font-semibold">{o.productName}<span className="ml-2 text-xs font-normal text-stone-400">{CATEGORY_LABEL[o.category]?.slice(0, 2)}</span></td>
              <td className="p-3 text-stone-600">{o.packLabel}</td>
              <td className="p-3 text-right"><b>{eur(o.packPriceEur)}</b>{o.negotiated && <span className="ml-1 pill bg-purple-100 text-purple-800" title={`Prix catalogue ${eur(String(o.listPriceEur))}`}>négocié</span>}<br /><span className="text-xs text-stone-500">{o.unitPrice.toFixed(2).replace('.', ',')} €/{o.unit}</span>{!!o.tiers?.length && <div className="mt-0.5 text-[11px] text-emerald-700">{o.tiers.map((t) => `${t.minPacks}+ : ${eur(String(t.packPriceEur))}`).join(' · ')}</div>}{(() => { const ql = quote?.lines.find((l) => l.vendorOfferId === o.id); return ql ? <div className="mt-0.5 text-[11px]">{ql.source === 'palier' && <span className="text-emerald-700">✓ palier : {eur(String(ql.packPriceEur))}</span>}{ql.nextTier && <span className="text-amber-700"> +{ql.nextTier.missingPacks} → {eur(String(ql.nextTier.packPriceEur))}</span>}</div> : null; })()}</td>
              <td className="p-3 text-right">{o.savingPct === null ? <span className="text-stone-400">—</span> : o.savingPct > 0 ? <span className="font-semibold text-emerald-700">−{o.savingPct} %</span> : <span className="text-stone-500">+{Math.abs(o.savingPct)} %</span>}</td>
              <td className="p-3 text-right"><input type="number" min={0} className="input w-20 text-right" disabled={!o.inStock} value={cart[o.id] ?? ''} onChange={(e) => setCart({ ...cart, [o.id]: Number(e.target.value) })} /></td>
            </tr>))}</tbody></table>
      </div>
      {nb > 0 && <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 p-4 backdrop-blur lg:left-64"><div className="mx-auto flex max-w-4xl items-center justify-between gap-4"><p className="text-sm"><b>{nb}</b> produit{nb > 1 ? 's' : ''} · <b>{eur(total)}</b>{quote && quote.saved > 0 && <span className="ml-1 text-emerald-700">(−{eur(String(quote.saved))} paliers/négocié)</span>}{total < Number(v.minOrderEur) && <span className="ml-2 text-amber-700">minimum {eur(v.minOrderEur)}</span>}</p><button className="btn-primary" disabled={busy || total < Number(v.minOrderEur)} onClick={() => void order()}><ShoppingCart size={16} /> Commander chez {v.name}</button></div></div>}
      {!offers.length && <Empty><Store className="mx-auto mb-2" />Aucun produit dans cette sélection.</Empty>}
    </div>
  );
}

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ShoppingCart, MapPin, Truck, Bell, Check, ChevronRight } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { api, CATEGORY_LABEL } from '../../lib/api';
import { cart } from '../../lib/cart';
import { ProductImage, unitLabel } from './ProductCard';
import { Loader, ErrorBox } from '../../components/ui';

type Offer = { id: string; packLabel: string; packQty: number; packPriceEur: number; unitPrice: number; inStock: boolean; vendor: { id: string; name: string; city: string | null; deliveryZones: string[]; leadTimeHours: number; minOrderEur: number; deliveryFeeEur: number } };
type Data = { product: { id: string; name: string; slug: string; category: string; baseUnit: string; origin: string | null; aliases: string[]; shelfLifeDays: number | null; seasonality: string | null }; offers: Offer[]; similar: { id: string; name: string; slug: string; category: string }[] };
const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;

export default function ProductDetail() {
  const { id } = useParams(); const { data, loading, error, reload } = useApi<Data>(`/public/products/${id}`);
  const [packs, setPacks] = useState<Record<string, number>>({}); const [added, setAdded] = useState<string | null>(null);
  const [email, setEmail] = useState(''); const [alertMsg, setAlertMsg] = useState<string | null>(null);
  if (loading) return <div className="p-10"><Loader /></div>; if (error) return <div className="p-10"><ErrorBox message={error} onRetry={() => void reload()} /></div>; if (!data) return null;
  const { product: p, offers } = data; const best = offers.find((o) => o.inStock);
  const add = (o: Offer) => { cart.add({ offerId: o.id, productId: p.id, productName: p.name, packLabel: o.packLabel, packPriceEur: o.packPriceEur, packQty: o.packQty, unit: p.baseUnit, vendorId: o.vendor.id, vendorName: o.vendor.name, minOrderEur: o.vendor.minOrderEur }, packs[o.id] ?? 1); setAdded(o.id); setTimeout(() => setAdded(null), 1800); };
  // Chantier 11 : la fonction s'appelait `alert` — même nom que la boîte de dialogue du navigateur.
  const prevenir = async () => { try { const r = await api<{ message: string }>('/public/product-alert', { method: 'POST', json: { productId: p.id, email } }); setAlertMsg(r.message); } catch (e) { setAlertMsg((e as Error).message); } };
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <nav className="mb-4 flex items-center gap-1 text-xs text-stone-500"><Link to="/">Accueil</Link><ChevronRight size={12} /><Link to="/catalogue">Catalogue</Link><ChevronRight size={12} /><Link to={`/catalogue?category=${p.category}`}>{CATEGORY_LABEL[p.category]}</Link><ChevronRight size={12} /><span className="text-stone-800">{p.name}</span></nav>
      <div className="grid gap-8 lg:grid-cols-[2fr_3fr]">
        <div><ProductImage slug={p.slug} category={p.category} name={p.name} className="aspect-square rounded-2xl" /><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="card !p-3"><dt className="text-xs text-stone-500">Origine</dt><dd className="font-semibold"><MapPin size={12} className="mr-1 inline" />{p.origin ?? 'Afrique'}</dd></div><div className="card !p-3"><dt className="text-xs text-stone-500">Unité</dt><dd className="font-semibold">{unitLabel(p.baseUnit)}</dd></div>{p.shelfLifeDays && <div className="card !p-3"><dt className="text-xs text-stone-500">Conservation</dt><dd className="font-semibold">{p.shelfLifeDays} jours</dd></div>}{p.aliases.length > 0 && <div className="card col-span-2 !p-3"><dt className="text-xs text-stone-500">Aussi appelé</dt><dd className="text-xs">{p.aliases.slice(0, 8).join(' · ')}</dd></div>}</dl></div>
        <div>
          <p className="text-sm text-stone-500">{CATEGORY_LABEL[p.category]}</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{p.name}</h1>
          {best ? <p className="mt-2 text-lg">à partir de <b className="text-3xl font-extrabold">{eur(best.unitPrice)}</b> <span className="text-stone-500">/ {unitLabel(p.baseUnit)} HT</span> · {offers.filter((o) => o.inStock).length} offre{offers.length > 1 ? 's' : ''} de {new Set(offers.map((o) => o.vendor.id)).size} grossiste{new Set(offers.map((o) => o.vendor.id)).size > 1 ? 's' : ''}</p>
            : <div className="card mt-4 border-amber-200 bg-amber-50"><p className="font-bold text-amber-900"><Bell size={16} className="mr-1 inline" />Prix sur demande — aucun grossiste ne propose encore ce produit sur AFRISUPPLY.</p><p className="mt-1 text-sm text-amber-800">Laissez votre e-mail : nous démarchons les grossistes de votre zone et vous prévenons dès qu'une offre est en ligne.</p>{alertMsg ? <p className="mt-2 text-sm font-semibold text-emerald-800">{alertMsg}</p> : <div className="mt-3 flex gap-2"><input className="input flex-1" type="email" placeholder="vous@restaurant.fr" value={email} onChange={(e) => setEmail(e.target.value)} /><button className="btn-primary" onClick={() => void prevenir()} disabled={!email.includes('@')}>Me prévenir</button></div>}</div>}
          {offers.length > 0 && <div className="mt-6 space-y-3">
            <h2 className="font-bold">Offres des grossistes</h2>
            {offers.map((o) => <div key={o.id} className={`card flex flex-wrap items-center gap-3 ${!o.inStock ? 'opacity-60' : ''} ${o.id === best?.id ? 'border-brand-300 ring-1 ring-brand-200' : ''}`}>
              <div className="min-w-[160px] flex-1"><p className="font-bold">{o.vendor.name} {o.id === best?.id && <span className="pill bg-brand-50 text-brand-800">Meilleur prix</span>}</p><p className="text-xs text-stone-500"><Truck size={12} className="mr-1 inline" />{o.vendor.city ?? 'En ligne'} · livraison {o.vendor.leadTimeHours} h · min {eur(o.vendor.minOrderEur)}{o.vendor.deliveryFeeEur ? ` · port ${eur(o.vendor.deliveryFeeEur)}` : ' · port offert'}</p></div>
              <div className="text-right"><p className="text-xl font-extrabold">{eur(o.packPriceEur)}</p><p className="text-xs text-stone-500">{o.packLabel} · {eur(o.unitPrice)}/{unitLabel(p.baseUnit)}</p></div>
              {o.inStock ? <div className="flex items-center gap-2"><input type="number" min={1} className="input w-16 text-center" value={packs[o.id] ?? 1} onChange={(e) => setPacks({ ...packs, [o.id]: Math.max(1, Number(e.target.value)) })} /><button className={`btn-primary ${added === o.id ? '!bg-emerald-600' : ''}`} onClick={() => add(o)}>{added === o.id ? <><Check size={16} /> Ajouté</> : <><ShoppingCart size={16} /> Ajouter</>}</button></div> : <span className="pill bg-stone-100 text-stone-500">Rupture</span>}
            </div>)}
            <p className="text-xs text-stone-500">Prix HT. La commande est envoyée au grossiste qui la confirme sous 24 h. Compte restaurant gratuit requis au moment de commander.</p>
          </div>}
        </div>
      </div>
      {data.similar.length > 0 && <section className="mt-12"><h2 className="text-xl font-extrabold">Dans le même rayon</h2><div className="mt-3 flex gap-3 overflow-x-auto pb-2">{data.similar.map((s) => <Link key={s.id} to={`/produit/${s.id}`} className="card w-40 shrink-0 !p-0 hover:shadow-md"><ProductImage slug={s.slug} category={s.category} name={s.name} className="h-28 rounded-t-2xl" /><p className="p-2 text-sm font-semibold leading-tight">{s.name}</p></Link>)}</div></section>}
    </div>
  );
}

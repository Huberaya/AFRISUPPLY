import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { productImage, CAT_EMOJI } from '../../lib/cart';
import { CATEGORY_LABEL } from '../../lib/api';
export type CatalogItem = { id: string; name: string; slug: string; category: string; baseUnit: string; origin: string | null; fromUnitPrice: number | null; offerCount: number; vendorCount: number };
export const unitLabel = (u: string) => u === 'piece' ? 'pièce' : u;
export function ProductImage({ slug, category, name, className = '' }: { slug: string; category: string; name: string; className?: string }) {
  return <div className={`relative overflow-hidden bg-stone-100 ${className}`}><div className="absolute inset-0 flex items-center justify-center text-6xl">{CAT_EMOJI[category] ?? '🛒'}</div><img src={productImage(slug)} alt={name} loading="lazy" className="relative h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /></div>;
}
export default function ProductCard({ p }: { p: CatalogItem }) {
  return (
    <Link to={`/produit/${p.id}`} className="card group flex flex-col overflow-hidden !p-0 transition hover:shadow-lg">
      <ProductImage slug={p.slug} category={p.category} name={p.name} className="h-44" />
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs text-stone-500"><MapPin size={12} className="mr-1 inline" />{p.origin ?? 'Afrique'} · {CATEGORY_LABEL[p.category] ?? p.category}</p>
        <h3 className="mt-1 line-clamp-2 font-semibold leading-tight group-hover:text-brand-700">{p.name}</h3>
        <div className="mt-auto pt-3">
          {p.fromUnitPrice !== null ? <><p className="text-xs text-stone-500">à partir de</p><p className="text-xl font-extrabold">{p.fromUnitPrice.toFixed(2).replace('.', ',')} € <span className="text-sm font-medium text-stone-500">/ {unitLabel(p.baseUnit)}</span></p><p className="text-xs text-emerald-700">{p.vendorCount} grossiste{p.vendorCount > 1 ? 's' : ''} · {p.offerCount} offre{p.offerCount > 1 ? 's' : ''}</p></>
            : <><p className="font-bold text-stone-700">Prix sur demande</p><p className="text-xs text-stone-500">Soyez prévenu dès qu'un grossiste le propose</p></>}
        </div>
      </div>
    </Link>
  );
}

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ShoppingCart, MapPin, Truck, Bell, Check, ChevronRight } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { api, CATEGORY_LABEL } from '../../lib/api';
import { cart } from '../../lib/cart';
import { ProductImage, unitLabel } from './ProductCard';
import { Loader, ErrorBox } from '../../components/ui';

type Offer = {
  id: string;
  packLabel: string;
  packQty: number;
  packPriceEur: number;
  unitPrice: number;
  inStock: boolean;
  vendor: {
    id: string;
    name: string;
    city: string | null;
    deliveryZones: string[];
    leadTimeHours: number;
    minOrderEur: number;
    deliveryFeeEur: number;
  };
};

type Data = {
  product: {
    id: string;
    name: string;
    slug: string;
    category: string;
    baseUnit: string;
    origin: string | null;
    aliases: string[];
    shelfLifeDays: number | null;
    seasonality: string | null;
  };
  offers: Offer[];
  similar: { id: string; name: string; slug: string; category: string }[];
};

const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;

export default function ProductDetail() {
  const { id } = useParams();
  const { data, loading, error, reload } = useApi<Data>(`/public/products/${id}`);
  const [packs, setPacks] = useState<Record<string, number>>({});
  const [added, setAdded] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  if (loading) return <div className="p-10"><Loader /></div>;
  if (error) return <div className="p-10"><ErrorBox message={error} onRetry={() => void reload()} /></div>;
  if (!data) return null;

  const { product: p, offers } = data;
  const best = offers.find((o) => o.inStock);

  const add = (o: Offer) => {
    cart.add(
      {
        offerId: o.id,
        productId: p.id,
        productName: p.name,
        packLabel: o.packLabel,
        packPriceEur: o.packPriceEur,
        packQty: o.packQty,
        unit: p.baseUnit,
        vendorId: o.vendor.id,
        vendorName: o.vendor.name,
        minOrderEur: o.vendor.minOrderEur,
      },
      packs[o.id] ?? 1
    );
    setAdded(o.id);
    setTimeout(() => setAdded(null), 1800);
  };

  const prevenir = async () => {
    try {
      const r = await api<{ message: string }>('/public/product-alert', {
        method: 'POST',
        json: { productId: p.id, email },
      });
      setAlertMsg(r.message);
    } catch (e) {
      setAlertMsg((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 lg:px-8">
      {/* Fil d'Ariane responsive avec défilement horizontal si débordement */}
      <nav className="mb-4 flex items-center gap-1.5 overflow-x-auto text-xs text-stone-500 whitespace-nowrap pb-1">
        <Link to="/" className="hover:text-stone-800">Accueil</Link>
        <ChevronRight size={12} className="shrink-0 text-stone-400" />
        <Link to="/catalogue" className="hover:text-stone-800">Catalogue</Link>
        <ChevronRight size={12} className="shrink-0 text-stone-400" />
        <Link to={`/catalogue?category=${p.category}`} className="hover:text-stone-800">
          {CATEGORY_LABEL[p.category]}
        </Link>
        <ChevronRight size={12} className="shrink-0 text-stone-400" />
        <span className="font-medium text-stone-900 truncate max-w-[180px] sm:max-w-none">{p.name}</span>
      </nav>

      <div className="grid gap-6 sm:gap-8 lg:grid-cols-[2fr_3fr]">
        {/* Colonne gauche : visuel + caractéristiques */}
        <div>
          <ProductImage
            slug={p.slug}
            category={p.category}
            name={p.name}
            className="aspect-square w-full rounded-2xl object-cover shadow-sm max-h-[340px] sm:max-h-none mx-auto"
          />
          <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 text-sm">
            <div className="card !p-3">
              <dt className="text-xs text-stone-500">Origine</dt>
              <dd className="font-semibold text-stone-900 text-xs sm:text-sm mt-0.5 truncate">
                <MapPin size={12} className="mr-1 inline text-stone-400" />
                {p.origin ?? 'Afrique'}
              </dd>
            </div>
            <div className="card !p-3">
              <dt className="text-xs text-stone-500">Unité de base</dt>
              <dd className="font-semibold text-stone-900 text-xs sm:text-sm mt-0.5">{unitLabel(p.baseUnit)}</dd>
            </div>
            {p.shelfLifeDays && (
              <div className="card !p-3">
                <dt className="text-xs text-stone-500">Conservation</dt>
                <dd className="font-semibold text-stone-900 text-xs sm:text-sm mt-0.5">{p.shelfLifeDays} jours</dd>
              </div>
            )}
            {p.aliases.length > 0 && (
              <div className="card col-span-2 !p-3">
                <dt className="text-xs text-stone-500">Aussi appelé</dt>
                <dd className="text-xs text-stone-700 mt-0.5 leading-relaxed">{p.aliases.slice(0, 8).join(' · ')}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Colonne droite : nom, meilleur prix, offres grossistes */}
        <div>
          <p className="text-xs sm:text-sm font-medium text-stone-500">{CATEGORY_LABEL[p.category]}</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900">{p.name}</h1>

          {best ? (
            <div className="mt-3 rounded-2xl bg-stone-50 border border-stone-200 p-4">
              <p className="text-xs sm:text-sm text-stone-500">Meilleur prix disponible :</p>
              <p className="mt-1 text-2xl sm:text-3xl font-extrabold text-stone-900">
                {eur(best.unitPrice)}{' '}
                <span className="text-xs sm:text-sm font-medium text-stone-500">/ {unitLabel(p.baseUnit)} HT</span>
              </p>
              <p className="mt-1 text-xs text-emerald-700 font-medium">
                {offers.filter((o) => o.inStock).length} offre{offers.length > 1 ? 's' : ''} disponible{offers.length > 1 ? 's' : ''} chez{' '}
                {new Set(offers.map((o) => o.vendor.id)).size} grossiste{new Set(offers.map((o) => o.vendor.id)).size > 1 ? 's' : ''}
              </p>
            </div>
          ) : (
            <div className="card mt-4 border-amber-200 bg-amber-50 p-4">
              <p className="font-bold text-amber-900 text-sm sm:text-base">
                <Bell size={16} className="mr-1.5 inline shrink-0" />
                Prix sur demande — aucun grossiste ne propose encore ce produit sur AFRISUPPLY.
              </p>
              <p className="mt-1 text-xs sm:text-sm text-amber-800">
                Laissez votre e-mail : nous démarchons les grossistes de votre zone et vous prévenons dès qu'une offre est en ligne.
              </p>
              {alertMsg ? (
                <p className="mt-2 text-sm font-semibold text-emerald-800 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                  {alertMsg}
                </p>
              ) : (
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <input
                    className="input flex-1 text-sm bg-white"
                    type="email"
                    placeholder="vous@restaurant.fr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <button
                    className="btn-primary justify-center px-4 py-2 shrink-0 text-sm"
                    onClick={() => void prevenir()}
                    disabled={!email.includes('@')}
                  >
                    Me prévenir
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Liste détaillée des offres */}
          {offers.length > 0 && (
            <div className="mt-6 space-y-3">
              <h2 className="text-base sm:text-lg font-bold text-stone-900">Offres des grossistes</h2>
              <div className="space-y-3">
                {offers.map((o) => (
                  <div
                    key={o.id}
                    className={`card p-3.5 sm:p-4 flex flex-col gap-3 transition ${
                      !o.inStock ? 'opacity-60 bg-stone-50' : 'bg-white'
                    } ${o.id === best?.id ? 'border-brand-400 ring-2 ring-brand-100' : 'border-stone-200'}`}
                  >
                    {/* Ligne 1 : Grossiste et livraison */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-bold text-stone-900 text-sm sm:text-base">{o.vendor.name}</p>
                          {o.id === best?.id && (
                            <span className="pill bg-brand-50 text-brand-800 text-[11px] font-semibold border border-brand-200">
                              Meilleur prix
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span><Truck size={12} className="mr-1 inline text-stone-400" />{o.vendor.city ?? 'En ligne'}</span>
                          <span>·</span>
                          <span>délai {o.vendor.leadTimeHours} h</span>
                          <span>·</span>
                          <span>min {eur(o.vendor.minOrderEur)}</span>
                          <span>·</span>
                          <span className={o.vendor.deliveryFeeEur === 0 ? 'text-emerald-700 font-medium' : ''}>
                            {o.vendor.deliveryFeeEur ? `port ${eur(o.vendor.deliveryFeeEur)}` : 'port offert'}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Ligne 2 : Prix du pack + Action panier */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2.5 border-t border-stone-100">
                      <div>
                        <p className="text-lg sm:text-xl font-extrabold text-stone-900 leading-tight">
                          {eur(o.packPriceEur)}
                        </p>
                        <p className="text-xs text-stone-500 mt-0.5">
                          {o.packLabel} · {eur(o.unitPrice)}/{unitLabel(p.baseUnit)}
                        </p>
                      </div>

                      {o.inStock ? (
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <input
                            type="number"
                            min={1}
                            className="input w-16 text-center py-2 text-sm font-semibold shrink-0"
                            value={packs[o.id] ?? 1}
                            onChange={(e) =>
                              setPacks({ ...packs, [o.id]: Math.max(1, Number(e.target.value)) })
                            }
                            aria-label="Quantité"
                          />
                          <button
                            className={`btn-primary flex-1 sm:flex-none justify-center px-4 py-2 text-sm font-semibold touch-manipulation ${
                              added === o.id ? '!bg-emerald-600 !border-emerald-600' : ''
                            }`}
                            onClick={() => add(o)}
                          >
                            {added === o.id ? (
                              <>
                                <Check size={16} /> Ajouté !
                              </>
                            ) : (
                              <>
                                <ShoppingCart size={16} /> Ajouter au panier
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="pill bg-stone-100 text-stone-500 self-start sm:self-auto">
                          Rupture
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Prix HT. La commande est envoyée au grossiste qui la confirme sous 24 h. Compte restaurant gratuit requis au moment de commander.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Dans le même rayon */}
      {data.similar.length > 0 && (
        <section className="mt-10 sm:mt-12 pt-6 border-t border-stone-200">
          <h2 className="text-lg sm:text-xl font-extrabold text-stone-900">Dans le même rayon</h2>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none">
            {data.similar.map((s) => (
              <Link
                key={s.id}
                to={`/produit/${s.id}`}
                className="card w-36 sm:w-44 shrink-0 !p-0 hover:shadow-md transition touch-manipulation"
              >
                <ProductImage slug={s.slug} category={s.category} name={s.name} className="h-24 sm:h-28 rounded-t-2xl object-cover" />
                <p className="p-2 sm:p-2.5 text-xs sm:text-sm font-semibold leading-tight text-stone-900 line-clamp-2">
                  {s.name}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

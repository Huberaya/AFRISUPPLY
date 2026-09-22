// Accueil = vitrine produits (parcours « Amazon ») : recherche, catégories, produits, grossistes — visible sans compte.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Store, ShieldCheck, Truck, Scale } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { CATEGORY_LABEL } from '../../lib/api';
import { ReliabilityBadge, type Reliability } from '../../components/Reliability';
import ProductCard, { type CatalogItem } from './ProductCard';
import { CAT_EMOJI } from '../../lib/cart';

type Catalog = { items: CatalogItem[]; total: number; categories: Record<string, number>; withPrice: number };
type Vendor = { reliability?: Reliability; id: string; name: string; city: string | null; categories: string[]; offerCount: number; leadTimeHours: number; minOrderEur: number };
const POPULAR = ['Riz brisé', 'Huile de palme', 'Attiéké', 'Banane plantain', 'Poisson fumé', 'Gombo', 'Manioc', 'Piment'];

export default function StoreHome() {
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const cat = useApi<Catalog>('/public/catalog');
  const vend = useApi<{ vendors: Vendor[] }>('/public/vendors');
  const items = cat.data?.items ?? [];
  const featured = [...items.filter((i) => i.fromUnitPrice !== null), ...items.filter((i) => i.fromUnitPrice === null)].slice(0, 12);

  return (
    <>
      <section className="relative overflow-hidden bg-stone-950 text-white">
        <img src="/hero-cuisine.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-r from-stone-950 via-stone-950/80 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:py-16 lg:px-8 lg:py-24">
          <span className="pill bg-brand-500/20 text-brand-200 ring-1 ring-brand-400/40 text-xs sm:text-sm">
            Marketplace B2B des restaurants africains
          </span>
          <h1 className="mt-4 max-w-2xl text-3xl sm:text-5xl font-extrabold leading-[1.08] tracking-tight">
            Tous vos produits africains,<br />aux <span className="text-brand-400">prix grossistes</span>, livrés en cuisine.
          </h1>
          <p className="mt-3 sm:mt-4 max-w-xl text-base sm:text-lg text-stone-200">
            {cat.data ? `${cat.data.total} produits` : 'Plus de 300 produits'} — riz, huile de palme, attiéké, poisson fumé, plantain… Comparez les grossistes, commandez en un clic.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              nav(`/catalogue${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
            }}
            className="mt-6 flex flex-col sm:flex-row max-w-2xl gap-2 rounded-2xl bg-white p-2 shadow-2xl"
          >
            <div className="flex flex-1 items-center gap-2 px-3 py-1">
              <Search className="text-stone-400 shrink-0" size={20} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher un produit : riz, gombo, poisson…"
                className="w-full bg-transparent py-1.5 sm:py-2 text-stone-900 outline-none text-sm sm:text-base placeholder:text-stone-400"
              />
            </div>
            <button className="btn-primary justify-center px-5 py-2.5 sm:py-2 shrink-0">
              <span>Rechercher</span>
              <ArrowRight size={16} />
            </button>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
            <span className="text-stone-400 mr-1">Populaires :</span>
            {POPULAR.map((t) => (
              <Link
                key={t}
                to={`/catalogue?q=${encodeURIComponent(t)}`}
                className="rounded-full border border-white/15 bg-white/10 px-2.5 sm:px-3 py-1 text-stone-100 hover:bg-white/20 transition touch-manipulation"
              >
                {t}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Réassurance — 1 col mobile, 2 col tablette, 4 col desktop */}
      <section className="border-b border-stone-100 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-4 py-6 text-sm lg:px-8">
          {[
            [Scale, 'Prix comparés', 'Meilleur prix au kilo, grossistes côte à côte'],
            [ShieldCheck, 'Grossistes vérifiés', 'Chaque fournisseur est validé par AFRISUPPLY'],
            [Truck, 'Livraison en cuisine', 'Délais et minimums affichés avant de commander'],
            [Store, 'Réservé aux pros', 'Prix HT, facture, compte restaurant gratuit'],
          ].map(([I, t, d]) => {
            const Icon = I as typeof Scale;
            return (
              <div key={t as string} className="flex items-start gap-3 p-1">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Icon size={18} />
                </div>
                <div>
                  <p className="font-bold text-stone-900">{t as string}</p>
                  <p className="text-xs text-stone-500 mt-0.5 leading-snug">{d as string}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Rayons */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:py-12 lg:px-8">
        <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">Rayons</h2>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Object.keys(CATEGORY_LABEL).map((k) => (
            <Link
              key={k}
              to={`/catalogue?category=${k}`}
              className="card flex flex-col items-center gap-1.5 sm:gap-2 py-4 sm:py-6 text-center transition hover:shadow-md touch-manipulation"
            >
              <span className="text-3xl sm:text-4xl">{CAT_EMOJI[k]}</span>
              <span className="font-semibold text-xs sm:text-sm text-stone-900">{CATEGORY_LABEL[k].replace(/^\S+\s/, '')}</span>
              <span className="text-[11px] text-stone-500">{cat.data?.categories[k] ?? '…'} produits</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Produits */}
      <section className="bg-stone-50">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12 lg:px-8">
          <div className="flex items-end justify-between gap-2">
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">Produits</h2>
            <Link to="/catalogue" className="text-xs sm:text-sm font-semibold text-brand-700 hover:text-brand-800 shrink-0">
              Voir tout le catalogue →
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      </section>

      {/* Grossistes partenaires */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:py-12 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">Grossistes partenaires</h2>
          <Link to="/fournisseur" className="text-xs sm:text-sm font-semibold text-brand-700 hover:text-brand-800">
            Vous êtes grossiste ? Vendez ici →
          </Link>
        </div>
        {vend.data && vend.data.vendors.length > 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vend.data.vendors.slice(0, 6).map((v) => (
              <div key={v.id} className="card">
                <p className="text-base sm:text-lg font-bold text-stone-900">{v.name}</p>
                <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
                  {v.city ?? 'En ligne'} · livraison {v.leadTimeHours} h · min {v.minOrderEur} €
                </p>
                <p className="mt-2 text-xs sm:text-sm">
                  <b>{v.offerCount}</b> produits
                </p>
                {v.reliability && (
                  <div className="mt-2">
                    <ReliabilityBadge r={v.reliability} />
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {v.categories.map((c) => (
                    <span key={c} className="pill bg-stone-100 text-stone-700">
                      {CATEGORY_LABEL[c] ?? c}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card mt-4 border-dashed text-center text-stone-600 p-6">
            Les premiers grossistes arrivent. Vous êtes grossiste en produits africains ?{' '}
            <Link to="/fournisseur" className="font-semibold text-brand-700 underline">
              Mettez votre catalogue en ligne en 10 minutes
            </Link>{' '}
            — import Excel, photo ou texte.
          </div>
        )}
      </section>

      {/* Bannière d'appel pour restaurateurs */}
      <section className="bg-stone-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16 text-center lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Vous tenez un restaurant ? Allez plus loin que l’achat.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-stone-300">
            AFRISUPPLY suit aussi votre stock, prévoit vos besoins, compare vos fournisseurs habituels et prépare vos commandes chaque matin.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <Link to="/inscription" className="btn-primary justify-center px-6 py-3 text-base">
              Créer mon compte gratuit
            </Link>
            <Link to="/pour-les-restaurants" className="btn bg-white/10 justify-center px-6 py-3 text-base text-white ring-1 ring-white/30 hover:bg-white/20">
              Découvrir l’assistant
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

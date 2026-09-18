import { Link } from 'react-router-dom';
import { Star, Clock, Truck } from 'lucide-react';
import { fmtEur, CATEGORY_LABEL } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox } from '../components/ui';

type S = { id: string; name: string; city: string | null; categories: string[]; leadTimeHours: number; minOrderEur: string; deliveryFeeEur: string; rating: string | null; preferredChannel: string; offerCount: number; stats: { delivered: number; late: number; discrepancies: number; spent: number; reliability: number } };

export default function Suppliers() {
  const { data, loading, error } = useApi<{ suppliers: S[] }>('/suppliers');
  if (loading && !data) return <Loader />; if (error) return <ErrorBox message={error} />;
  const best = [...(data?.suppliers ?? [])].sort((a, b) => b.stats.reliability - a.stats.reliability)[0];
  return (
    <div className="animate-fade-up">
      <PageTitle title="🚚 Fournisseurs" subtitle="Fiabilité calculée sur vos livraisons réelles : retards et écarts." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.suppliers.map((s) => (
          <Link key={s.id} to={`/app/fournisseurs/${s.id}`} className="card hover:shadow-card-hover transition block">
            <div className="flex items-start justify-between gap-2">
              <div><h3 className="font-bold text-stone-900">{s.name}</h3><p className="text-xs text-stone-500">{s.city ?? '—'} · {s.offerCount} produits</p></div>
              {s.rating && <span className="pill bg-amber-100 text-amber-800"><Star size={12} fill="currentColor" /> {Number(s.rating).toLocaleString('fr-FR')}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-1">{s.categories.map((c) => <span key={c} className="pill bg-stone-100 text-stone-700">{CATEGORY_LABEL[c]?.split(' ').slice(1).join(' ') ?? c}</span>)}</div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-stone-50 p-2"><dt className="text-stone-500">Fiabilité</dt><dd className={`text-lg font-extrabold ${s.stats.reliability >= 90 ? 'text-emerald-700' : s.stats.reliability >= 75 ? 'text-amber-700' : 'text-red-700'}`}>{s.stats.reliability} %</dd></div>
              <div className="rounded-xl bg-stone-50 p-2"><dt className="text-stone-500 flex items-center justify-center gap-1"><Clock size={11} /> Délai</dt><dd className="text-lg font-extrabold">{Math.round(s.leadTimeHours / 24)} j</dd></div>
              <div className="rounded-xl bg-stone-50 p-2"><dt className="text-stone-500 flex items-center justify-center gap-1"><Truck size={11} /> Livraison</dt><dd className="text-lg font-extrabold">{Number(s.deliveryFeeEur) ? fmtEur(s.deliveryFeeEur, 0) : 'Offerte'}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-stone-500">{s.stats.delivered} commande{s.stats.delivered > 1 ? 's' : ''} · {s.stats.late} retard{s.stats.late > 1 ? 's' : ''} · {s.stats.discrepancies} écart{s.stats.discrepancies > 1 ? 's' : ''} · {fmtEur(s.stats.spent, 0)} dépensés</p>
            {best?.id === s.id && s.stats.delivered > 0 && <p className="mt-2 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">🤖 Votre fournisseur le plus fiable</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}

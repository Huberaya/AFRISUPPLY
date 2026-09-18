import { useParams, Link } from 'react-router-dom';
import { fmtEur, fmtDate, STATUS_LABEL } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox } from '../components/ui';

type D = { supplier: { name: string; contactName: string | null; phone: string | null; email: string | null; whatsapp: string | null; city: string | null; leadTimeHours: number; minOrderEur: string; deliveryFeeEur: string; preferredChannel: string; notes: string | null }; stats?: { delivered: number; late: number; discrepancies: number; spent: number; reliability: number }; offers: { id: string; productName: string; packLabel: string; packPriceEur: string; unitPrice: number; unit: string; inStock: boolean; productId: string }[]; orders: { id: string; reference: string; status: string; totalEur: string; createdAt: string }[] };

export default function SupplierDetail() {
  const { id } = useParams(); const { data, loading, error } = useApi<D>(`/suppliers/${id}`);
  if (loading && !data) return <Loader />; if (error) return <ErrorBox message={error} />; if (!data) return null;
  const { supplier: s, stats, offers, orders } = data;
  return (
    <div className="animate-fade-up space-y-6">
      <Link to="/app/fournisseurs" className="text-sm text-stone-500">← Fournisseurs</Link>
      <PageTitle title={s.name} subtitle={[s.contactName, s.city, s.phone, s.email, s.whatsapp && `WhatsApp ${s.whatsapp}`].filter(Boolean).join(' · ')} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card"><p className="text-xs uppercase text-stone-500">Fiabilité</p><p className="text-3xl font-extrabold">{stats?.reliability ?? 85} %</p></div>
        <div className="card"><p className="text-xs uppercase text-stone-500">Délai</p><p className="text-3xl font-extrabold">{Math.round(s.leadTimeHours / 24)} j</p></div>
        <div className="card"><p className="text-xs uppercase text-stone-500">Minimum / livraison</p><p className="text-3xl font-extrabold">{fmtEur(s.minOrderEur, 0)} <span className="text-base text-stone-500">/ {Number(s.deliveryFeeEur) ? fmtEur(s.deliveryFeeEur, 0) : 'offerte'}</span></p></div>
        <div className="card"><p className="text-xs uppercase text-stone-500">Historique</p><p className="text-sm mt-1">{stats?.delivered ?? 0} commandes · {stats?.late ?? 0} retards · {stats?.discrepancies ?? 0} écarts</p><p className="text-sm font-semibold">{fmtEur(stats?.spent ?? 0, 0)} dépensés</p></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card !p-0 overflow-x-auto"><h2 className="px-4 pt-4 font-bold">Catalogue & prix</h2>
          <table className="mt-2 w-full text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="px-4 py-2">Produit</th><th className="px-4 py-2">Conditionnement</th><th className="px-4 py-2 text-right">Prix</th><th className="px-4 py-2 text-right">Prix / unité</th><th className="px-4 py-2"></th></tr></thead>
            <tbody className="divide-y divide-stone-100">{offers.map((o) => <tr key={o.id}><td className="px-4 py-2 font-medium"><Link to={`/app/achats/comparer/${o.productId}`} className="hover:text-brand-700">{o.productName}</Link></td><td className="px-4 py-2 text-stone-600">{o.packLabel}</td><td className="px-4 py-2 text-right">{fmtEur(o.packPriceEur)}</td><td className="px-4 py-2 text-right font-semibold">{fmtEur(o.unitPrice)}/{o.unit}</td><td className="px-4 py-2">{o.inStock ? '🟢' : '🔴'}</td></tr>)}</tbody></table></div>
        <div className="card"><h2 className="font-bold">Commandes</h2>
          <ul className="mt-2 divide-y divide-stone-100">{orders.map((o) => <li key={o.id} className="flex justify-between py-2 text-sm"><span>{o.reference} · {fmtDate(o.createdAt)}</span><span className="font-semibold">{fmtEur(o.totalEur)} <span className="text-xs text-stone-500">{STATUS_LABEL[o.status]}</span></span></li>)}</ul>
          {orders.length === 0 && <p className="text-sm text-stone-500 mt-2">Aucune commande pour l’instant.</p>}</div>
      </div>
    </div>
  );
}

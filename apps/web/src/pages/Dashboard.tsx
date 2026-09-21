import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ArrowRight } from 'lucide-react';
import { api, fmtEur, fmtQty, fmtDate, STATUS_LABEL } from '../lib/api';
import { useApi } from '../lib/useApi';
import { OnboardingChecklist } from '../components/Pilot';
import { Steps, FLOW_STEPS } from '../components/Steps';
import { useToast } from '../components/Feedback';
import { useAuth } from '../lib/auth';
import { PageTitle, Stat, SeverityCard, Loader, ErrorBox, StatusPill, Empty } from '../components/ui';

type Alert = { id: string; kind: string; severity: 'red' | 'orange' | 'green' | 'blue'; title: string; message: string; productId: string | null; actionUrl: string | null; isRead: boolean };
type Dash = {
  restaurant: { name: string; plan: string; trialEndsAt: string | null };
  stock: { ok: number; bas: number; critique: number; items: { productId: string; productName: string; unit: string; quantity: number; daysLeft: number | null; status: 'ok' | 'bas' | 'critique' }[] };
  spend: { thisMonth: number; prevMonth: number; last30: number; prev30: number; evolutionPct: number | null };
  alerts: Alert[];
  recentOrders: { id: string; reference: string; supplierName: string; totalEur: string; status: string; createdAt: string }[];
};

export default function Dashboard() {
  const { data, loading, error, reload } = useApi<Dash>('/dashboard');
  const { restaurant: ctxRestaurant } = useAuth();
  const toast = useToast();
  // Les ecritures d'achat sont reservees au responsable et au proprietaire (memes regles que le serveur).
  const peutCommander = (ctxRestaurant?.role ?? 'owner') !== 'staff';
  const [refreshing, setRefreshing] = useState(false);
  const refreshAlerts = useCallback(async () => { setRefreshing(true); try { await api('/alerts/refresh', { method: 'POST' }); await reload(); } finally { setRefreshing(false); } }, [reload]);
  const noAlertYet = data ? data.alerts.length === 0 : false;
  useEffect(() => { if (noAlertYet) void refreshAlerts(); }, [noAlertYet, refreshAlerts]);
  const markRead = async (id: string) => {
    try { await api(`/alerts/${id}/read`, { method: 'POST' }); toast.info('Alerte marquée comme vue.'); } catch (e) { toast.error('Action impossible', (e as Error).message); }
    await reload();
  };

  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />;
  if (!data) return null;
  const { stock, spend } = data;
  const evo = spend.evolutionPct;

  return (
    <div className="space-y-8 animate-fade-up">
      <PageTitle title={`Bonjour 👋 — ${data.restaurant.name}`} subtitle="Votre situation aujourd’hui"
        action={<button onClick={refreshAlerts} className="btn-ghost" disabled={refreshing}><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Actualiser l’analyse</button>} />

      <OnboardingChecklist />

      <Steps steps={FLOW_STEPS} current={0} title="Votre parcours d'achat" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Stock disponible" value={<>🟢 {stock.ok}</>} hint="produits au niveau" tone="good" />
        <Stat label="Bientôt en rupture" value={<>🟠 {stock.bas}</>} hint="à commander cette semaine" tone="warn" />
        <Stat label="Critiques" value={<>🔴 {stock.critique}</>} hint="à commander aujourd’hui" tone="bad" />
        <Stat label="Dépenses fournisseurs (30 j)" value={fmtEur(spend.last30, 0)}
          hint={evo === null ? 'pas d’historique comparable' : <span className={evo > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>{evo > 0 ? '▲' : '▼'} {Math.abs(evo).toLocaleString('fr-FR')} % vs 30 j précédents</span>} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">🤖 Ce qu’il faut commander</h2><div className="flex items-center gap-3"><span className="text-xs text-stone-500">{data.alerts.length} alerte{data.alerts.length > 1 ? 's' : ''} non lue{data.alerts.length > 1 ? 's' : ''}</span>{peutCommander && <Link to="/app/achats/panier" className="btn-primary !py-1.5">🧺 Composer mon panier</Link>}</div></div>
          {data.alerts.length === 0 && <Empty>Aucune alerte pour le moment : aucun produit sous son seuil, aucun prix en hausse. Vous n’avez rien à commander aujourd’hui 🎉</Empty>}
          {data.alerts.map((a) => (
            <SeverityCard key={a.id} severity={a.severity} title={a.title} message={a.message}
              action={<div className="flex gap-2">
                {a.productId && <Link to={`/app/achats/comparer/${a.productId}`} className="btn-primary !py-1.5 !px-3">Comparer les prix <ArrowRight size={14} /></Link>}
                {a.actionUrl && !a.actionUrl.startsWith('/app/achats/comparer') && <Link to={a.actionUrl} className="btn-ghost !py-1.5 !px-3">Voir le détail</Link>}
                <button onClick={() => markRead(a.id)} className="btn-ghost !py-1.5 !px-3">C’est vu</button>
              </div>} />
          ))}
        </section>

        <section className="lg:col-span-2 space-y-6">
          <div className="card">
            <div className="flex items-center justify-between"><h2 className="font-bold">Produits à surveiller</h2><Link to="/app/stock" className="text-sm font-semibold text-brand-700">Tout le stock →</Link></div>
            <ul className="mt-3 divide-y divide-stone-100">
              {stock.items.map((i) => (
                <li key={i.productId} className="flex items-center justify-between py-2.5 text-sm">
                  <div><p className="font-medium">{i.productName}</p><p className="text-xs text-stone-500">{fmtQty(i.quantity, i.unit)}{i.daysLeft !== null && ` · ~${i.daysLeft} j`}</p></div>
                  <StatusPill status={i.status} />
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <div className="flex items-center justify-between"><h2 className="font-bold">Dernières commandes</h2><Link to="/app/achats" className="text-sm font-semibold text-brand-700">Toutes →</Link></div>
            <ul className="mt-3 divide-y divide-stone-100">
              {data.recentOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div><p className="font-medium">{o.supplierName}</p><p className="text-xs text-stone-500">{o.reference} · {fmtDate(o.createdAt)}</p></div>
                  <div className="text-right"><p className="font-semibold">{fmtEur(o.totalEur)}</p><p className="text-xs text-stone-500">{STATUS_LABEL[o.status] ?? o.status}</p></div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

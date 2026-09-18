import { fmtEur } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox, Stat } from '../components/ui';

type S = { name: string; stats: { spent: number; delivered: number; reliability: number } };
type Dash = { spend: { thisMonth: number; prevMonth: number; last30: number; prev30: number; evolutionPct: number | null } };

export default function Analysis() {
  const d = useApi<Dash>('/dashboard'); const s = useApi<{ suppliers: S[] }>('/suppliers');
  if ((d.loading && !d.data) || (s.loading && !s.data)) return <Loader />; if (d.error || s.error) return <ErrorBox message={d.error ?? s.error ?? ''} />;
  const sp = d.data!.spend; const sups = [...(s.data?.suppliers ?? [])].sort((a, b) => b.stats.spent - a.stats.spent); const total = sups.reduce((a, x) => a + x.stats.spent, 0) || 1;
  return (
    <div className="animate-fade-up space-y-8">
      <PageTitle title="📊 Analyse" subtitle="Où part votre argent, et comment ça évolue. (Chantier 4 : indice de prix par catégorie, marges par plat dans le temps.)" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Ce mois-ci" value={fmtEur(sp.thisMonth, 0)} hint={`mois précédent : ${fmtEur(sp.prevMonth, 0)}`} />
        <Stat label="30 derniers jours" value={fmtEur(sp.last30, 0)} hint={`30 j précédents : ${fmtEur(sp.prev30, 0)}`} />
        <Stat label="Évolution des coûts" value={sp.evolutionPct === null ? '—' : `${sp.evolutionPct > 0 ? '+' : ''}${sp.evolutionPct.toLocaleString('fr-FR')} %`} tone={sp.evolutionPct !== null && sp.evolutionPct > 5 ? 'bad' : 'good'} />
      </div>
      <div className="card"><h2 className="font-bold">Dépenses par fournisseur</h2>
        <ul className="mt-4 space-y-3">{sups.map((x) => <li key={x.name}><div className="flex justify-between text-sm"><span className="font-medium">{x.name}</span><span>{fmtEur(x.stats.spent, 0)} · {Math.round((x.stats.spent / total) * 100)} %</span></div><div className="mt-1 h-2 rounded-full bg-stone-100"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${(x.stats.spent / total) * 100}%` }} /></div></li>)}</ul></div>
    </div>
  );
}

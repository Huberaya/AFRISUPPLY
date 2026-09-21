// Admin AFRISUPPLY : validation / suspension des fournisseurs plateforme et réglage de leur commission.
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { PageTitle, ErrorBox } from '../../components/ui';

type V = { id: string; name: string; status: string; city: string | null; deliveryZones: string[]; categories: string[]; commissionPct: string; contactEmail: string | null; contactPhone: string | null; createdAt: string; offerCount: number; orderCount: number };
export default function AdminVendors() {
  const [list, setList] = useState<V[]>([]); const [err, setErr] = useState<string | null>(null); const [pct, setPct] = useState<Record<string, string>>({});
  const load = () => api<{ vendors: V[] }>('/admin/vendors').then((r) => setList(r.vendors)).catch((e) => setErr((e as Error).message));
  useEffect(() => { void load(); }, []);
  const set = async (id: string, status: string) => { await api(`/admin/vendors/${id}`, { method: 'PUT', json: { status, commissionPct: pct[id] ? Number(pct[id]) : undefined } }); void load(); };
  if (err) return <ErrorBox message={err} onRetry={() => void load()} />;
  return (
    <div className="animate-fade-up space-y-4">
      <PageTitle title="🛡️ Fournisseurs plateforme" subtitle="Validez les nouveaux grossistes après vérification (SIRET, agrément sanitaire si frais/viande, échange téléphonique)." />
      {list.map((v) => (
        <div key={v.id} className="card flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-bold">{v.name} <span className={`pill ml-2 ${v.status === 'actif' ? 'bg-emerald-50 text-emerald-800' : v.status === 'en_attente' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800'}`}>{v.status}</span></p><p className="text-sm text-stone-500">{v.city} · zones {v.deliveryZones.join(', ')} · {v.categories.join(', ')} · {v.offerCount} offres · {v.orderCount} commandes · inscrit le {new Date(v.createdAt).toLocaleDateString('fr-FR')}</p><p className="text-sm">{v.contactEmail} {v.contactPhone}</p></div>
          <div className="flex items-center gap-2"><input className="input w-20" type="number" step="0.5" placeholder={`${Number(v.commissionPct)} %`} value={pct[v.id] ?? ''} onChange={(e) => setPct({ ...pct, [v.id]: e.target.value })} />{v.status !== 'actif' && <button className="btn-primary" onClick={() => void set(v.id, 'actif')}>Activer</button>}{v.status === 'actif' && <button className="btn-ghost !text-red-700" onClick={() => void set(v.id, 'suspendu')}>Suspendre</button>}</div>
        </div>))}
      {!list.length && <p className="text-stone-500">Aucun fournisseur inscrit.</p>}
    </div>
  );
}

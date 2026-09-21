import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Settings2, Trash2, Plus, ClipboardCheck, History } from 'lucide-react';
import { api, fmtQty, CATEGORY_LABEL } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox, StatusPill } from '../components/ui';
import { Modal, Field } from '../components/Modal';
import { ProductPicker } from '../components/ProductPicker';

type Item = { id: string; productId: string; name: string; category: string; unit: string; quantity: number; criticalLevel: number; targetLevel: number | null; avgDailyUse: number; daysLeft: number | null; status: 'ok' | 'bas' | 'critique'; preferredSupplier: string | null; preferredSupplierId?: string | null; lastCountedAt: string | null };
type Sup = { id: string; name: string };
// Chantier 3 (audit U2) — journal des mouvements : qui a sorti quoi, et quand.
type Movement = { id: string; type: 'reception' | 'consommation' | 'ajustement' | 'perte'; quantity: number; unitCostEur: number | null; note: string | null; createdBy: string | null; createdAt: string };
const MOVEMENT_LABEL: Record<Movement['type'], string> = { reception: 'Réception', consommation: 'Consommation', ajustement: 'Ajustement', perte: 'Perte' };

export default function Stock() {
  const { data, loading, error, reload } = useApi<{ items: Item[] }>('/stock');
  const sups = useApi<{ suppliers: Sup[] }>('/suppliers');
  const [filter, setFilter] = useState<'all' | 'critique' | 'bas'>('all');
  const [editing, setEditing] = useState<string | null>(null); const [val, setVal] = useState('');
  const [settings, setSettings] = useState<Item | null>(null); const [crit, setCrit] = useState(''); const [target, setTarget] = useState(''); const [pref, setPref] = useState('');
  const [inventory, setInventory] = useState(false); const [counts, setCounts] = useState<Record<string, string>>({}); const [invResult, setInvResult] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [journal, setJournal] = useState<null | { item: Item; movements: Movement[] }>(null);
  const openJournal = async (i: Item) => { try { const r = await api<{ movements: Movement[] }>(`/stock/${i.id}/movements`); setJournal({ item: i, movements: r.movements }); } catch { setJournal({ item: i, movements: [] }); } };
  const save = async (item: Item) => { await api(`/stock/${item.id}/movements`, { method: 'POST', json: { type: 'ajustement', quantity: Number(val.replace(',', '.')) } }); setEditing(null); await reload(); };
  const openSettings = (i: Item) => { setSettings(i); setCrit(String(i.criticalLevel)); setTarget(i.targetLevel != null ? String(i.targetLevel) : ''); setPref(i.preferredSupplierId ?? ''); };
  const saveSettings = async (e: React.FormEvent) => { e.preventDefault(); if (!settings) return; await api(`/stock/${settings.id}`, { method: 'PUT', json: { criticalLevel: Number(crit.replace(',', '.')), targetLevel: target ? Number(target.replace(',', '.')) : null, preferredSupplierId: pref || null } }); setSettings(null); await reload(); };
  const untrack = async (i: Item) => { if (!confirm(`Ne plus suivre « ${i.name} » en stock ?`)) return; await api(`/stock/${i.id}`, { method: 'DELETE' }); setSettings(null); await reload(); };
  const submitInventory = async () => {
    const list = Object.entries(counts).filter(([, v]) => v !== '').map(([itemId, v]) => ({ itemId, quantity: Number(v.replace(',', '.')) }));
    if (!list.length) return;
    const r = await api<{ counted: number; adjusted: number; totalDelta: number }>('/stock/inventory', { method: 'POST', json: { counts: list, note: 'Inventaire' } });
    setInvResult(`${r.counted} article${r.counted > 1 ? 's' : ''} compté${r.counted > 1 ? 's' : ''}, ${r.adjusted} ajusté${r.adjusted > 1 ? 's' : ''}.`); setCounts({}); await reload();
  };
  if (loading && !data) return <Loader />; if (error) return <ErrorBox message={error} />;
  const all = data?.items ?? [];
  const items = all.filter((i) => filter === 'all' || i.status === filter);
  const groups = items.reduce<Record<string, Item[]>>((acc, i) => { (acc[i.category] ??= []).push(i); return acc; }, {});
  return (
    <div className="animate-fade-up">
      <PageTitle title="📦 Stock" subtitle="Quantités, consommation moyenne et jours restants — cliquez sur une quantité pour la corriger, ou lancez l’inventaire du soir."
        action={<div className="flex flex-wrap gap-2">{(['all', 'critique', 'bas'] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={`btn ${filter === f ? 'bg-stone-900 text-white' : 'bg-stone-100'}`}>{f === 'all' ? `Tous (${all.length})` : f === 'critique' ? `🔴 ${all.filter((i) => i.status === 'critique').length}` : `🟠 ${all.filter((i) => i.status === 'bas').length}`}</button>)}<button className="btn-ghost" onClick={() => { setInventory(true); setInvResult(null); }}><ClipboardCheck size={16} /> Inventaire</button><button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Suivre un produit</button></div>} />
      {invResult && <p className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">{invResult}</p>}
      {Object.entries(groups).map(([cat, list]) => (
        <section key={cat} className="mb-8">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-stone-500">{CATEGORY_LABEL[cat] ?? cat}</h2>
          <div className="card overflow-x-auto !p-0">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="px-4 py-2">Produit</th><th className="px-4 py-2 text-right">Quantité</th><th className="px-4 py-2 text-right">Conso / j</th><th className="px-4 py-2 text-right">Jours</th><th className="px-4 py-2 text-right">Seuil</th><th className="px-4 py-2">Statut</th><th className="px-4 py-2">Fournisseur</th><th className="px-4 py-2"></th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {list.map((i) => (
                  <tr key={i.id} className="hover:bg-stone-50/60">
                    <td className="px-4 py-2.5 font-medium">{i.name}</td>
                    <td className="px-4 py-2.5 text-right">
                      {editing === i.id ? <form onSubmit={(e) => { e.preventDefault(); void save(i); }} className="flex justify-end gap-1"><input autoFocus className="input !w-24 !py-1 text-right" value={val} onChange={(e) => setVal(e.target.value)} onBlur={() => setEditing(null)} /></form>
                        : <button onClick={() => { setEditing(i.id); setVal(String(i.quantity)); }} className="rounded-lg px-2 py-0.5 font-semibold hover:bg-brand-50 hover:text-brand-700" title="Corriger la quantité">{fmtQty(i.quantity, i.unit)}</button>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-stone-600">{i.avgDailyUse ? fmtQty(i.avgDailyUse, i.unit) : '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${i.daysLeft !== null && i.daysLeft <= 3 ? 'text-red-600' : i.daysLeft !== null && i.daysLeft <= 6 ? 'text-amber-600' : ''}`}>{i.daysLeft !== null ? `${i.daysLeft} j` : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-stone-500">{fmtQty(i.criticalLevel, i.unit)}</td>
                    <td className="px-4 py-2.5"><StatusPill status={i.status} /></td>
                    <td className="px-4 py-2.5 text-stone-600">{i.preferredSupplier ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">{i.status !== 'ok' && <Link to={`/app/achats/comparer/${i.productId}`} className="text-xs font-semibold text-brand-700 mr-2">Commander →</Link>}<button onClick={() => void openJournal(i)} className="p-1 text-stone-400 hover:text-brand-700" aria-label="Journal des mouvements" title="Journal des mouvements"><History size={14} /></button><button onClick={() => openSettings(i)} className="p-1 text-stone-400 hover:text-brand-700" aria-label="Réglages"><Settings2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {items.length === 0 && <p className="text-stone-500 flex items-center gap-2"><ClipboardList size={16} /> Aucun produit dans ce filtre.</p>}
      {/* Chantier 3 (audit U2) — les 20 derniers mouvements : « qui a sorti 10 kg ? » */}
      {journal && <Modal title={`Journal — ${journal.item.name}`} subtitle="20 derniers mouvements : réceptions, consommations, ajustements, pertes." onClose={() => setJournal(null)}>
        {journal.movements.length === 0 ? <p className="text-sm text-stone-500">Aucun mouvement enregistré pour cet article.</p> : (
          <ul className="divide-y divide-stone-100 text-sm">
            {journal.movements.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{MOVEMENT_LABEL[m.type]} <span className={m.quantity >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>{m.quantity >= 0 ? '+' : ''}{fmtQty(m.quantity, journal.item.unit)}</span></p>
                  <p className="text-xs text-stone-500 truncate">{new Date(m.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}{m.createdBy ? ` · ${m.createdBy}` : ''}{m.note ? ` · ${m.note}` : ''}</p>
                </div>
                {m.unitCostEur !== null && <span className="text-xs text-stone-500 whitespace-nowrap">{m.unitCostEur} €/{journal.item.unit}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end"><button className="btn-ghost" onClick={() => setJournal(null)}>Fermer</button></div>
      </Modal>}
      {settings && <Modal title={settings.name} subtitle="Seuils utilisés par les alertes, la prévision et l’auto-reorder." onClose={() => setSettings(null)}>
        <form onSubmit={saveSettings} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Seuil critique (${settings.unit})`} hint="En dessous : alerte 🔴"><input className="input" value={crit} onChange={(e) => setCrit(e.target.value)} /></Field>
            <Field label={`Niveau cible (${settings.unit})`} hint="Quantité à avoir après commande"><input className="input" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="optionnel" /></Field>
          </div>
          <Field label="Fournisseur habituel"><select className="input" value={pref} onChange={(e) => setPref(e.target.value)}><option value="">— aucun —</option>{sups.data?.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <div className="flex items-center justify-between pt-2"><button type="button" className="btn-ghost text-red-700" onClick={() => void untrack(settings)}><Trash2 size={14} /> Ne plus suivre</button><div className="flex gap-2"><button type="button" className="btn-ghost" onClick={() => setSettings(null)}>Annuler</button><button type="submit" className="btn-primary">Enregistrer</button></div></div>
        </form>
      </Modal>}
      {inventory && <Modal title="Inventaire" subtitle="Saisissez uniquement ce que vous comptez ; les articles vides restent inchangés." onClose={() => setInventory(false)} wide>
        <div className="max-h-[55vh] overflow-y-auto">
          {Object.entries(all.reduce<Record<string, Item[]>>((acc, i) => { (acc[i.category] ??= []).push(i); return acc; }, {})).map(([cat, list]) => <div key={cat} className="mb-3"><p className="text-xs font-bold uppercase text-stone-500 mb-1">{CATEGORY_LABEL[cat] ?? cat}</p>
            {list.map((i) => <div key={i.id} className="flex items-center justify-between gap-3 py-1 text-sm"><span>{i.name} <span className="text-xs text-stone-400">(actuel {fmtQty(i.quantity, i.unit)})</span></span><span className="flex items-center gap-1"><input inputMode="decimal" className="input !w-24 !py-1 text-right" placeholder={String(i.quantity)} value={counts[i.id] ?? ''} onChange={(e) => setCounts({ ...counts, [i.id]: e.target.value })} /><span className="w-8 text-xs text-stone-500">{i.unit}</span></span></div>)}
          </div>)}
        </div>
        <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setInventory(false)}>Fermer</button><button className="btn-primary" onClick={() => { void submitInventory(); setInventory(false); }} disabled={!Object.values(counts).some((v) => v !== '')}>Valider l’inventaire</button></div>
      </Modal>}
      {adding && <Modal title="Suivre un produit en stock" subtitle="Cherchez dans le référentiel de 324 produits africains ou vos produits privés." onClose={() => setAdding(false)}>
        <ProductPicker onPick={async (p) => { await api('/catalog/track', { method: 'POST', json: { productIds: [p.id] } }); setAdding(false); await reload(); }} />
        <p className="mt-3 text-xs text-stone-500">Produit introuvable ? Créez-le dans le <Link to="/app/catalogue" className="underline">catalogue</Link>.</p>
      </Modal>}
    </div>
  );
}

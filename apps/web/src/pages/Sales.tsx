import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Save, Bot, Play, Trash2 } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { api, fmtEur, fmtQty } from '../lib/api';
import { PageTitle, Loader, ErrorBox, Stat } from '../components/ui';

interface SalesData { day: string; recipes: { id: string; name: string; portions: number }[]; history: { day: string; portions: number }[] }
interface Rule { id: string; inventoryItemId: string; enabled: boolean; threshold: string; reorderQty: string; supplierStrategy: 'best' | 'preferred'; productName: string; unit: string; quantity: number }
interface StockItem { id: string; name: string; unit: string; quantity: number; criticalLevel: number; targetLevel: number | null }

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function Sales() {
  const [day, setDay] = useState(todayIso());
  const sales = useApi<SalesData>(`/sales?day=${day}`);
  const rules = useApi<{ rules: Rule[] }>('/reorder-rules');
  const stock = useApi<{ items: StockItem[] }>('/stock');
  const [portions, setPortions] = useState<Record<string, number>>({});
  const [decrement, setDecrement] = useState(true);
  const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [newRule, setNewRule] = useState<{ inventoryItemId: string; threshold: string; reorderQty: string; supplierStrategy: 'best' | 'preferred' }>({ inventoryItemId: '', threshold: '', reorderQty: '', supplierStrategy: 'best' });
  useEffect(() => { if (sales.data) setPortions(Object.fromEntries(sales.data.recipes.map((r) => [r.id, r.portions]))); }, [sales.data]);

  const save = async () => {
    setBusy(true); setMsg(null);
    try { await api('/sales', { method: 'POST', json: { day, lines: Object.entries(portions).map(([recipeId, p]) => ({ recipeId, portions: Number(p) || 0 })), decrementStock: decrement } }); setMsg('Ventes enregistrées' + (decrement ? ' et stock déduit selon les fiches recettes.' : '.')); void sales.reload(); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const saveRule = async () => {
    if (!newRule.inventoryItemId) return;
    await api(`/reorder-rules/${newRule.inventoryItemId}`, { method: 'PUT', json: { enabled: true, threshold: Number(newRule.threshold), reorderQty: Number(newRule.reorderQty), supplierStrategy: newRule.supplierStrategy } });
    setNewRule({ inventoryItemId: '', threshold: '', reorderQty: '', supplierStrategy: 'best' }); void rules.reload();
  };
  const toggle = async (r: Rule) => { await api(`/reorder-rules/${r.inventoryItemId}`, { method: 'PUT', json: { enabled: !r.enabled, threshold: Number(r.threshold), reorderQty: Number(r.reorderQty), supplierStrategy: r.supplierStrategy } }); void rules.reload(); };
  const remove = async (r: Rule) => { await api(`/reorder-rules/${r.inventoryItemId}`, { method: 'DELETE' }); void rules.reload(); };
  const run = async () => {
    setBusy(true);
    try { const r = await api<{ prepared: { productName: string; supplierName: string; packs: number; packLabel: string; total: number; reference: string }[]; skipped: { productName: string; reason: string }[] }>('/reorder-rules/run', { method: 'POST' });
      setMsg(r.prepared.length ? `${r.prepared.length} commande(s) préparée(s) : ${r.prepared.map((p) => `${p.productName} ${p.packs}× ${p.packLabel} chez ${p.supplierName} (${fmtEur(p.total)}, ${p.reference})`).join(' ; ')}` : `Aucune commande à préparer${r.skipped.length ? ` — ${r.skipped.map((s) => `${s.productName} : ${s.reason}`).join(' ; ')}` : ''}.`); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const total14 = sales.data?.history.reduce((a, h) => a + h.portions, 0) ?? 0;
  return (
    <div className="animate-fade-up">
      <PageTitle title="🧾 Ventes du jour & Auto-Reorder" subtitle="Saisissez vos couverts par plat : c’est le carburant de la prévision. Les règles d’auto-reorder préparent des commandes quand un stock passe sous son seuil — jamais d’envoi sans validation." />
      {msg && <div className="card mb-4 text-sm text-brand-900 bg-brand-50 border-brand-100">{msg}</div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3"><h3 className="font-semibold">Ventes par plat</h3><input type="date" className="input !w-auto" value={day} max={todayIso()} onChange={(e) => setDay(e.target.value)} /></div>
          {sales.loading && <Loader />}{sales.error && <ErrorBox message={sales.error} />}
          {sales.data && <div className="space-y-2">
            {sales.data.recipes.length === 0 && <p className="text-sm text-stone-500">Aucune recette. <Link to="/app/demarrer" className="underline">Configurer ma carte</Link>.</p>}
            {sales.data.recipes.map((r) => <div key={r.id} className="flex items-center justify-between gap-3"><span className="text-sm">{r.name}</span><input type="number" min={0} className="input !w-24 text-right" value={portions[r.id] ?? 0} onChange={(e) => setPortions({ ...portions, [r.id]: Number(e.target.value) })} /></div>)}
            <label className="mt-2 flex items-center gap-2 text-xs text-stone-600"><input type="checkbox" checked={decrement} onChange={(e) => setDecrement(e.target.checked)} /> Déduire les ingrédients du stock (selon les fiches recettes)</label>
            <button className="btn-primary mt-2" disabled={busy || !sales.data.recipes.length} onClick={() => void save()}><Save size={16} /> Enregistrer</button>
          </div>}
          <div className="mt-4 border-t border-stone-100 pt-3"><Stat label="14 derniers jours" value={`${total14} portions`} hint={sales.data?.history.length ? `${sales.data.history.length} jours saisis` : 'Aucune saisie'} />
            {sales.data && sales.data.history.length > 0 && <div className="mt-2 flex items-end gap-1 h-12">{sales.data.history.map((h) => { const max = Math.max(...sales.data!.history.map((x) => x.portions), 1); return <div key={h.day} title={`${h.day} : ${h.portions}`} className="flex-1 rounded-sm bg-brand-300" style={{ height: `${h.portions / max * 100}%` }} />; })}</div>}
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between mb-3"><h3 className="font-semibold flex items-center gap-2"><Bot size={18} /> Règles d’auto-reorder</h3><button className="btn-secondary !py-1.5" disabled={busy} onClick={() => void run()}><Play size={14} /> Exécuter maintenant</button></div>
          {rules.loading && <Loader />}{rules.error && <ErrorBox message={rules.error} />}
          <div className="space-y-2">
            {rules.data?.rules.length === 0 && <p className="text-sm text-stone-500">Aucune règle. Ajoutez-en une ci-dessous pour vos produits critiques (riz, huile, plantain…).</p>}
            {rules.data?.rules.map((r) => <div key={r.id} className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-sm ${r.enabled ? 'border-stone-200' : 'border-stone-100 opacity-60'}`}>
              <div><div className="font-medium">{r.productName}</div><div className="text-xs text-stone-500">Si stock &lt; {fmtQty(r.threshold, r.unit)} → préparer {fmtQty(r.reorderQty, r.unit)} · {r.supplierStrategy === 'preferred' ? 'fournisseur habituel' : 'meilleure offre'} · stock actuel {fmtQty(r.quantity, r.unit)}</div></div>
              <div className="flex items-center gap-2"><button onClick={() => void toggle(r)} className={`pill ${r.enabled ? 'bg-green-50 text-green-700' : 'bg-stone-100 text-stone-600'}`}>{r.enabled ? 'Active' : 'Pausée'}</button><button onClick={() => void remove(r)} className="text-stone-400 hover:text-red-600"><Trash2 size={16} /></button></div>
            </div>)}
          </div>
          <div className="mt-4 border-t border-stone-100 pt-3 grid grid-cols-2 gap-2 text-sm">
            <select className="input col-span-2" value={newRule.inventoryItemId} onChange={(e) => { const it = stock.data?.items.find((i) => i.id === e.target.value); setNewRule({ ...newRule, inventoryItemId: e.target.value, threshold: it ? String(it.criticalLevel) : '', reorderQty: it?.targetLevel ? String(it.targetLevel) : '' }); }}>
              <option value="">Ajouter une règle pour…</option>{stock.data?.items.map((i) => <option key={i.id} value={i.id}>{i.name} ({fmtQty(i.quantity, i.unit)})</option>)}
            </select>
            <input className="input" placeholder="Seuil" type="number" value={newRule.threshold} onChange={(e) => setNewRule({ ...newRule, threshold: e.target.value })} />
            <input className="input" placeholder="Quantité à commander" type="number" value={newRule.reorderQty} onChange={(e) => setNewRule({ ...newRule, reorderQty: e.target.value })} />
            <select className="input" value={newRule.supplierStrategy} onChange={(e) => setNewRule({ ...newRule, supplierStrategy: e.target.value as 'best' | 'preferred' })}><option value="best">Meilleure offre</option><option value="preferred">Fournisseur habituel</option></select>
            <button className="btn-primary" disabled={!newRule.inventoryItemId || !newRule.threshold || !newRule.reorderQty} onClick={() => void saveRule()}>Ajouter</button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api, fmtEur, fmtQty } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox, Empty } from '../components/ui';
import { Modal, Field } from '../components/Modal';
import { ProductPicker } from '../components/ProductPicker';

type Ing = { productId: string; productName: string; quantity: number; unit: string; cost: number | null };
type R = { id: string; name: string; sellingPriceEur: number | null; targetMarginPct: string | null; cost: number; grossMargin: number | null; marginPct: number | null; suggestedPrice: number | null; unpriced: string[]; drifting: { productName: string; pct: number }[]; ingredients: Ing[] };
type Draft = { name: string; sellingPriceEur: string; targetMarginPct: string; ingredients: { productId: string; productName: string; unit: string; quantity: string }[] };

export default function Recipes() {
  const { data, loading, error, reload } = useApi<{ recipes: R[] }>('/recipes');
  const [modal, setModal] = useState<null | { id?: string; d: Draft }>(null);
  const [err, setErr] = useState<string | null>(null);
  if (loading && !data) return <Loader />; if (error) return <ErrorBox message={error} />;
  const openNew = () => setModal({ d: { name: '', sellingPriceEur: '', targetMarginPct: '70', ingredients: [] } });
  const openEdit = (r: R) => setModal({ id: r.id, d: { name: r.name, sellingPriceEur: r.sellingPriceEur != null ? String(r.sellingPriceEur) : '', targetMarginPct: r.targetMarginPct ? String(Number(r.targetMarginPct)) : '70', ingredients: r.ingredients.map((i) => ({ productId: i.productId, productName: i.productName, unit: i.unit, quantity: String(i.quantity) })) } });
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!modal) return; setErr(null);
    const d = modal.d; const ingredients = d.ingredients.map((i) => ({ productId: i.productId, quantity: Number(i.quantity.replace(',', '.')) })).filter((i) => i.quantity > 0);
    if (!ingredients.length) { setErr('Ajoutez au moins un ingrédient avec une quantité.'); return; }
    const json = { name: d.name, sellingPriceEur: d.sellingPriceEur ? Number(d.sellingPriceEur.replace(',', '.')) : null, targetMarginPct: Number(d.targetMarginPct) || 70, ingredients };
    try { if (modal.id) await api(`/recipes/${modal.id}`, { method: 'PUT', json }); else await api('/recipes', { method: 'POST', json }); setModal(null); await reload(); } catch (x) { setErr((x as Error).message); }
  };
  const remove = async (r: R) => { if (!confirm(`Supprimer la recette « ${r.name} » ? Les ventes associées seront perdues.`)) return; await api(`/recipes/${r.id}`, { method: 'DELETE' }); await reload(); };
  const setD = (patch: Partial<Draft>) => modal && setModal({ ...modal, d: { ...modal.d, ...patch } });
  return (
    <div className="animate-fade-up">
      <PageTitle title="🍗 Recettes & coût matière" subtitle="Coût calculé à partir des prix fournisseurs actuels. L’IA signale les ingrédients dont le prix dérive."
        action={<div className="flex gap-2"><Link to="/app/demarrer" className="btn-ghost">Recettes types</Link><button className="btn-primary" onClick={openNew}><Plus size={16} /> Nouvelle recette</button></div>} />
      {data?.recipes.length === 0 && <Empty>Aucune recette. Partez des <Link to="/app/demarrer" className="underline">recettes types</Link> ou créez la vôtre.</Empty>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.recipes.map((r) => (
          <details key={r.id} className="card group">
            <summary className="cursor-pointer list-none">
              <div className="flex items-start justify-between gap-2"><h3 className="font-bold">{r.name}</h3><div className="flex items-center gap-1">{r.sellingPriceEur && <span className="text-sm text-stone-500">Vente {fmtEur(r.sellingPriceEur)}</span>}<button onClick={(e) => { e.preventDefault(); openEdit(r); }} className="p-1 text-stone-400 hover:text-brand-700" aria-label="Modifier"><Pencil size={14} /></button><button onClick={(e) => { e.preventDefault(); void remove(r); }} className="p-1 text-stone-400 hover:text-red-600" aria-label="Supprimer"><Trash2 size={14} /></button></div></div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-stone-50 p-2"><p className="text-[10px] uppercase text-stone-500">Coût matière</p><p className="font-extrabold">{fmtEur(r.cost)}</p></div>
                <div className="rounded-xl bg-stone-50 p-2"><p className="text-[10px] uppercase text-stone-500">Marge brute</p><p className="font-extrabold text-emerald-700">{fmtEur(r.grossMargin)}</p></div>
                <div className="rounded-xl bg-stone-50 p-2"><p className="text-[10px] uppercase text-stone-500">Taux</p><p className={`font-extrabold ${(r.marginPct ?? 0) < 70 ? 'text-amber-700' : ''}`}>{r.marginPct !== null ? `${r.marginPct} %` : '—'}</p></div>
              </div>
              {r.drifting.length > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">⚠️ {r.drifting.map((d) => `${d.productName} +${d.pct} %`).join(', ')} sur 45 j.{r.suggestedPrice && r.sellingPriceEur && r.suggestedPrice > r.sellingPriceEur ? ` Prix conseillé : ${fmtEur(r.suggestedPrice)}.` : ''}</p>}
              {r.unpriced.length > 0 && <p className="mt-2 text-xs text-stone-500">Sans prix : {r.unpriced.join(', ')}</p>}
            </summary>
            <table className="mt-4 w-full text-xs"><tbody className="divide-y divide-stone-100">{r.ingredients.map((i) => <tr key={i.productId}><td className="py-1">{i.productName}</td><td className="py-1 text-right text-stone-500">{fmtQty(i.quantity, i.unit)}</td><td className="py-1 text-right font-semibold">{i.cost !== null ? fmtEur(i.cost) : '—'}</td></tr>)}</tbody></table>
          </details>
        ))}
      </div>
      {modal && <Modal title={modal.id ? 'Modifier la recette' : 'Nouvelle recette'} subtitle="Quantités par portion, dans l’unité du produit (kg, L, pièce)." onClose={() => setModal(null)} wide>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1"><Field label="Nom du plat"><input className="input" required minLength={2} value={modal.d.name} onChange={(e) => setD({ name: e.target.value })} placeholder="Thiéboudienne" /></Field></div>
            <Field label="Prix de vente (€)"><input className="input" value={modal.d.sellingPriceEur} onChange={(e) => setD({ sellingPriceEur: e.target.value })} placeholder="15,00" /></Field>
            <Field label="Marge cible (%)"><input className="input" type="number" min={0} max={100} value={modal.d.targetMarginPct} onChange={(e) => setD({ targetMarginPct: e.target.value })} /></Field>
          </div>
          <Field label="Ingrédients"><ProductPicker onPick={(p) => { if (modal.d.ingredients.some((i) => i.productId === p.id)) return; setD({ ingredients: [...modal.d.ingredients, { productId: p.id, productName: p.name, unit: p.baseUnit, quantity: '' }] }); }} /></Field>
          {modal.d.ingredients.length > 0 && <table className="w-full text-sm"><tbody className="divide-y divide-stone-100">{modal.d.ingredients.map((i, idx) => <tr key={i.productId}><td className="py-1.5">{i.productName}</td><td className="py-1.5 text-right"><input className="input !w-28 !py-1 text-right inline-block" placeholder="0,150" value={i.quantity} onChange={(e) => { const list = [...modal.d.ingredients]; list[idx] = { ...i, quantity: e.target.value }; setD({ ingredients: list }); }} /> <span className="text-xs text-stone-500 w-10 inline-block">{i.unit}</span></td><td className="py-1.5 text-right w-8"><button type="button" onClick={() => setD({ ingredients: modal.d.ingredients.filter((x) => x.productId !== i.productId) })} className="text-stone-400 hover:text-red-600"><Trash2 size={14} /></button></td></tr>)}</tbody></table>}
          {err && <p className="text-sm text-red-700">{err}</p>}
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setModal(null)}>Annuler</button><button type="submit" className="btn-primary">{modal.id ? 'Enregistrer' : 'Créer la recette'}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

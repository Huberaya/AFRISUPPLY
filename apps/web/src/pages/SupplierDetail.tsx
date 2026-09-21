import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Pencil, Plus, Trash2, Ban } from 'lucide-react';
import { api, fmtEur, fmtDate, STATUS_LABEL } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox } from '../components/ui';
import { Modal, Field } from '../components/Modal';
import { SupplierForm } from '../components/SupplierForm';
import { useConfirm, useToast } from '../components/Feedback';
import { ProductPicker } from '../components/ProductPicker';

type Sup = { id: string; name: string; contactName: string | null; phone: string | null; email: string | null; whatsapp: string | null; city: string | null; categories: string[]; leadTimeHours: number; minOrderEur: string; deliveryFeeEur: string; preferredChannel: 'email' | 'whatsapp' | 'telephone' | 'plateforme'; rating: string | null; notes: string | null; isActive: boolean };
type Offer = { id: string; productId: string; productName: string; unit: string; packLabel: string; packQty: string; packPriceEur: string; unitPrice: number; inStock: boolean; lastSeenAt: string };
type D = { supplier: Sup; stats?: { reliability: number; delivered: number; late: number; discrepancies: number; spent: number }; offers: Offer[]; orders: { id: string; reference: string; createdAt: string; totalEur: string; status: string }[] };
// Chantier 3 (audit U5) — saisie d'offres en lot : une ligne par produit, plus 100 formulaires à la suite.
type BatchRow = { product: { id: string; name: string; baseUnit: string } | null; packLabel: string; packQty: string; packPrice: string };

export default function SupplierDetail() {
  const { id } = useParams(); const nav = useNavigate();
  const { data, loading, error, reload } = useApi<D>(`/suppliers/${id}`);
  const [editing, setEditing] = useState(false);
  const [offerModal, setOfferModal] = useState<null | { offer?: Offer }>(null);
  const [product, setProduct] = useState<{ id: string; name: string; baseUnit: string } | null>(null);
  const [packLabel, setPackLabel] = useState(''); const [packQty, setPackQty] = useState(''); const [packPrice, setPackPrice] = useState(''); const [inStock, setInStock] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  // Chantier 11 : confirmations et notifications intégrées (déclarées ici, avant tout retour anticipé).
  // Chantier 3 (autre historique) — ajout de prix en lot (plusieurs conditionnements d'un coup).
  const confirmer = useConfirm(); const toast = useToast();
  const [batch, setBatch] = useState<null | { rows: BatchRow[]; busy: boolean }>(null);
  if (loading && !data) return <Loader />; if (error) return <ErrorBox message={error} onRetry={() => void reload()} />; if (!data) return null;

  const setRow = (idx: number, patch: Partial<BatchRow>) => setBatch((b) => b && { ...b, rows: b.rows.map((r, k) => (k === idx ? { ...r, ...patch } : r)) });
  const openBatch = () => { setBatch({ rows: [{ product: null, packLabel: '', packQty: '', packPrice: '' }], busy: false }); setMsg(null); };
  const saveBatch = async (e: React.FormEvent) => {
    e.preventDefault(); if (!batch || batch.busy) return;
    const items = batch.rows.filter((r) => r.product && Number(r.packQty.replace(',', '.')) > 0 && Number(r.packPrice.replace(',', '.')) > 0)
      .map((r) => ({ productId: r.product!.id, packLabel: r.packLabel || 'Sac', packQty: Number(r.packQty.replace(',', '.')), packPrice: Number(r.packPrice.replace(',', '.')), inStock: true }));
    if (!items.length) return;
    setBatch({ ...batch, busy: true });
    try {
      const r = await api<{ saved: number }>(`/suppliers/${s.id}/offers/batch`, { method: 'POST', json: { items } });
      setBatch(null); setMsg(`${r.saved} prix ajoutés au catalogue de ${s.name} — prix historisés et produits suivis en stock.`); await reload();
    } catch (x) { setBatch({ ...batch, busy: false }); setMsg((x as Error).message); }
  };
  const { supplier: s, stats, offers, orders } = data;
  const openOffer = (offer?: Offer) => { setOfferModal({ offer }); setProduct(offer ? { id: offer.productId, name: offer.productName, baseUnit: offer.unit } : null); setPackLabel(offer?.packLabel ?? ''); setPackQty(offer ? String(Number(offer.packQty)) : ''); setPackPrice(offer ? String(Number(offer.packPriceEur)) : ''); setInStock(offer?.inStock ?? true); setMsg(null); };
  const saveOffer = async (e: React.FormEvent) => {
    e.preventDefault(); if (!product) return;
    const body = { packLabel, packQty: Number(packQty.replace(',', '.')), packPrice: Number(packPrice.replace(',', '.')), inStock };
    if (offerModal?.offer) { const r = await api<{ priceChangedPct: number | null }>(`/offers/${offerModal.offer.id}`, { method: 'PUT', json: body }); if (r.priceChangedPct) setMsg(`Prix mis à jour (${r.priceChangedPct > 0 ? '+' : ''}${r.priceChangedPct} %) — enregistré dans l’historique.`); }
    else await api(`/suppliers/${s.id}/offers`, { method: 'POST', json: { ...body, productId: product.id } });
    setOfferModal(null); await reload();
  };
  const deleteOffer = async (o: Offer) => {
    const ok = await confirmer({
      title: `Supprimer l’offre ${o.productName} — ${o.packLabel} ?`,
      body: <>Ce fournisseur ne proposera plus ce conditionnement : le panier intelligent et le comparateur ne l'utiliseront plus.</>,
      confirmLabel: 'Supprimer l’offre', danger: true,
    });
    if (!ok) return;
    try { await api(`/offers/${o.id}`, { method: 'DELETE' }); toast.success('Offre supprimée.'); } catch (e) { toast.error('Suppression impossible', (e as Error).message); }
    await reload();
  };
  const deactivate = async () => {
    const ok = await confirmer({
      title: `Désactiver ${s.name} ?`,
      body: <>Le fournisseur n'apparaîtra plus dans les comparaisons ni dans le panier. L'historique de commandes et les factures sont conservés.</>,
      confirmLabel: 'Désactiver ce fournisseur', danger: true,
    });
    if (!ok) return;
    try { await api(`/suppliers/${s.id}`, { method: 'DELETE' }); toast.success(`${s.name} désactivé.`); } catch (e) { toast.error('Action impossible', (e as Error).message); }
    nav('/app/fournisseurs');
  };
  return (
    <div className="animate-fade-up space-y-6">
      <Link to="/app/fournisseurs" className="text-sm text-stone-500">← Fournisseurs</Link>
      <PageTitle title={s.name} subtitle={[s.contactName, s.city, s.phone, s.email, s.whatsapp && `WhatsApp ${s.whatsapp}`].filter(Boolean).join(' · ') || 'Aucune coordonnée — complétez la fiche'}
        action={<div className="flex gap-2"><button className="btn-ghost" onClick={() => setEditing(true)}><Pencil size={14} /> Modifier</button><button className="btn-ghost text-red-700" onClick={() => void deactivate()}><Ban size={14} /> Désactiver</button></div>} />
      {!s.isActive && <p className="rounded-xl bg-stone-100 p-3 text-sm text-stone-600">Fournisseur désactivé.</p>}
      {msg && <p className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">{msg}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card"><p className="text-xs uppercase text-stone-500">Fiabilité</p><p className="text-3xl font-extrabold">{stats?.reliability ?? 85} %</p></div>
        <div className="card"><p className="text-xs uppercase text-stone-500">Délai</p><p className="text-3xl font-extrabold">{Math.round(s.leadTimeHours / 24)} j</p></div>
        <div className="card"><p className="text-xs uppercase text-stone-500">Minimum / livraison</p><p className="text-3xl font-extrabold">{fmtEur(s.minOrderEur, 0)} <span className="text-base text-stone-500">/ {Number(s.deliveryFeeEur) ? fmtEur(s.deliveryFeeEur, 0) : 'offerte'}</span></p></div>
        <div className="card"><p className="text-xs uppercase text-stone-500">Historique</p><p className="text-sm mt-1">{stats?.delivered ?? 0} commandes · {stats?.late ?? 0} retards · {stats?.discrepancies ?? 0} écarts</p><p className="text-sm text-stone-500">{fmtEur(stats?.spent ?? 0, 0)} dépensés</p></div>
      </div>
      {s.notes && <p className="text-sm text-stone-600">📝 {s.notes}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card !p-0 overflow-x-auto">
          <div className="flex items-center justify-between px-4 pt-4"><h2 className="font-bold">Catalogue & prix</h2><div className="flex gap-2"><button className="btn-ghost !py-1.5" onClick={openBatch}>Ajouter en lot</button><button className="btn-primary !py-1.5" onClick={() => openOffer()}><Plus size={14} /> Ajouter un prix</button></div></div>
          <table className="mt-2 w-full text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="px-4 py-2">Produit</th><th className="px-4 py-2">Conditionnement</th><th className="px-4 py-2 text-right">Prix</th><th className="px-4 py-2 text-right">/ unité</th><th className="px-4 py-2"></th></tr></thead>
            <tbody className="divide-y divide-stone-100">{offers.map((o) => <tr key={o.id} className={o.inStock ? '' : 'opacity-50'}><td className="px-4 py-2 font-medium"><Link to={`/app/achats/comparer/${o.productId}`} className="hover:text-brand-700">{o.productName}</Link>{!o.inStock && <span className="ml-1 text-xs text-stone-400">(indispo.)</span>}</td><td className="px-4 py-2 text-stone-600">{o.packLabel}</td><td className="px-4 py-2 text-right">{fmtEur(o.packPriceEur)}</td><td className="px-4 py-2 text-right font-semibold">{fmtEur(o.unitPrice)}/{o.unit}</td><td className="px-4 py-2 text-right whitespace-nowrap"><button onClick={() => openOffer(o)} className="p-1 text-stone-400 hover:text-brand-700" aria-label="Modifier"><Pencil size={14} /></button><button onClick={() => void deleteOffer(o)} className="p-1 text-stone-400 hover:text-red-600" aria-label="Supprimer"><Trash2 size={14} /></button></td></tr>)}</tbody></table>
          {offers.length === 0 && <p className="p-4 text-sm text-stone-500">Aucun prix saisi. Ajoutez un prix ou passez par <Link to="/app/import" className="underline">l’import CSV</Link>.</p>}
        </div>
        <div className="card"><h2 className="font-bold">Commandes</h2>
          <ul className="mt-2 divide-y divide-stone-100">{orders.map((o) => <li key={o.id} className="flex justify-between py-2 text-sm"><span>{o.reference} · {fmtDate(o.createdAt)}</span><span className="font-semibold">{fmtEur(o.totalEur)} <span className="text-xs font-normal text-stone-500">{STATUS_LABEL[o.status]}</span></span></li>)}</ul>
          {orders.length === 0 && <p className="text-sm text-stone-500 mt-2">Aucune commande pour l’instant.</p>}</div>
      </div>
      {editing && <Modal title="Modifier le fournisseur" onClose={() => setEditing(false)} wide><SupplierForm supplierId={s.id} initial={{ name: s.name, contactName: s.contactName ?? '', email: s.email ?? '', phone: s.phone ?? '', whatsapp: s.whatsapp ?? '', city: s.city ?? '', categories: s.categories, leadTimeHours: s.leadTimeHours, minOrderEur: Number(s.minOrderEur), deliveryFeeEur: Number(s.deliveryFeeEur), preferredChannel: s.preferredChannel, rating: s.rating ? Number(s.rating) : null, notes: s.notes ?? '' }} onDone={() => { setEditing(false); void reload(); }} /></Modal>}
      {offerModal && <Modal title={offerModal.offer ? 'Modifier le prix' : 'Ajouter un prix'} subtitle="Chaque changement de prix alimente l’historique et les alertes de hausse." onClose={() => setOfferModal(null)}>
        <form onSubmit={saveOffer} className="space-y-3">
          <Field label="Produit">{product ? <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-sm"><span className="font-medium">{product.name} <span className="text-stone-500">({product.baseUnit})</span></span>{!offerModal.offer && <button type="button" className="text-xs underline" onClick={() => setProduct(null)}>changer</button>}</div> : <ProductPicker onPick={(p) => { setProduct(p); if (!packLabel) setPackLabel(p.baseUnit === 'kg' ? 'Sac 25 kg' : p.baseUnit === 'L' ? 'Bidon 5 L' : 'Carton'); }} />}</Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Conditionnement"><input className="input" required value={packLabel} onChange={(e) => setPackLabel(e.target.value)} placeholder="Sac 25 kg" /></Field>
            <Field label={`Quantité (${product?.baseUnit ?? 'unité'})`}><input className="input" required value={packQty} onChange={(e) => setPackQty(e.target.value)} placeholder="25" /></Field>
            <Field label="Prix du colis (€)"><input className="input" required value={packPrice} onChange={(e) => setPackPrice(e.target.value)} placeholder="42,00" /></Field>
          </div>
          {packQty && packPrice && Number(packQty.replace(',', '.')) > 0 && <p className="text-xs text-stone-500">= {fmtEur(Number(packPrice.replace(',', '.')) / Number(packQty.replace(',', '.')))} / {product?.baseUnit ?? 'unité'}</p>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} /> Disponible actuellement</label>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOfferModal(null)}>Annuler</button><button type="submit" className="btn-primary" disabled={!product}>{offerModal.offer ? 'Enregistrer' : 'Ajouter'}</button></div>
        </form>
      </Modal>}
      {/* Chantier 3 (audit U5) — ajout d'offres en lot : une ligne par produit. */}
      {batch && <Modal title="Ajouter des prix en lot" subtitle="Une ligne par produit : conditionnement, quantité du colis, prix du colis." onClose={() => setBatch(null)} wide>
        <form onSubmit={saveBatch} className="space-y-3">
          <div className="max-h-[50vh] space-y-3 overflow-y-auto">
            {batch.rows.map((row, idx) => (
              <div key={idx} className="space-y-2 rounded-xl border border-stone-100 p-2">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    {row.product ? <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-sm"><span className="font-medium truncate">{row.product.name} <span className="text-stone-500">({row.product.baseUnit})</span></span><button type="button" className="ml-2 text-xs underline" onClick={() => setRow(idx, { product: null })}>changer</button></div>
                      : <ProductPicker onPick={(p) => setRow(idx, { product: p, packLabel: row.packLabel || (p.baseUnit === 'kg' ? 'Sac 25 kg' : p.baseUnit === 'L' ? 'Bidon 5 L' : 'Carton') })} placeholder={`Produit ${idx + 1} (riz, gombo, attiéké…)`} />}
                  </div>
                  {batch.rows.length > 1 && <button type="button" onClick={() => setBatch({ ...batch, rows: batch.rows.filter((_, k) => k !== idx) })} className="p-1 text-stone-400 hover:text-red-600" aria-label="Retirer la ligne"><Trash2 size={14} /></button>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Conditionnement"><input className="input" required value={row.packLabel} onChange={(e) => setRow(idx, { packLabel: e.target.value })} placeholder="Sac 25 kg" /></Field>
                  <Field label={`Quantité (${row.product?.baseUnit ?? 'unité'})`}><input className="input" required inputMode="decimal" value={row.packQty} onChange={(e) => setRow(idx, { packQty: e.target.value })} placeholder="25" /></Field>
                  <Field label="Prix du colis (€)"><input className="input" required inputMode="decimal" value={row.packPrice} onChange={(e) => setRow(idx, { packPrice: e.target.value })} placeholder="42,00" /></Field>
                </div>
                {row.packQty && row.packPrice && Number(row.packQty.replace(',', '.')) > 0 && <p className="text-xs text-stone-500">= {fmtEur(Number(row.packPrice.replace(',', '.')) / Number(row.packQty.replace(',', '.')))} / {row.product?.baseUnit ?? 'unité'}</p>}
              </div>
            ))}
          </div>
          <button type="button" className="btn-ghost !py-1.5" onClick={() => setBatch({ ...batch, rows: [...batch.rows, { product: null, packLabel: '', packQty: '', packPrice: '' }] })}><Plus size={14} /> Ajouter une ligne</button>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setBatch(null)}>Annuler</button><button type="submit" className="btn-primary" disabled={batch.busy || !batch.rows.some((r) => r.product && r.packQty && r.packPrice)}>{batch.busy ? 'Enregistrement…' : 'Enregistrer les prix'}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

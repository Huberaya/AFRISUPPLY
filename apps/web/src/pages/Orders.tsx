import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, PackageCheck, Copy, MessageCircle, Mail, Pencil, XCircle, AlertTriangle } from 'lucide-react';
import { api, ApiError, fmtEur, fmtQty, fmtDate, STATUS_LABEL, openPdf } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox, Empty } from '../components/ui';
import { Modal } from '../components/Modal';
import { ReorderModal, RecurringList } from '../components/Reorder';
import { ReviewModal } from '../components/Reliability';

type Line = { id: string; productId?: string; productName: string; packLabel: string | null; packs: number; quantity: string; unitPriceEur: string; lineTotalEur: string; receivedQty: string | null; invoicedUnitPriceEur?: string | null };
type PriceVariance = { lineId: string; productName: string; unit: string; orderedUnit: number; invoicedUnit: number; deltaUnit: number; deltaPct: number | null; receivedQty: number; deltaEur: number };
type RecvResult = { claimMessage: string | null; discrepancies: unknown[]; priceVariance?: PriceVariance[]; surchargeEur?: number; orderedTotal?: number; invoicedTotal?: number | null };
type O = { id: string; reference: string; supplierName: string; status: string; channel: string; expectedAt: string | null; totalEur: string; source: string; createdAt: string; receivedAt?: string | null; lines: Line[]; vendorId?: string | null; fulfillment?: string | null; deliverySlot?: string | null; hasProof?: boolean; proposal?: Proposal | null };
type Proposal = { note?: string; expectedAt?: string; newTotalEur: number; lines: { lineId: string; productName: string; packLabel: string | null; packs: number; newPacks: number; lineTotalEur: number; newLineTotalEur: number; replacement?: { productName: string; packLabel: string | null; packs: number; lineTotalEur: number } | null }[] };
type TL = { order: { fulfillment: string | null; deliverySlot: string | null; driverName: string | null; proofPhoto: string | null; proofSignature: string | null; proofReceiverName: string | null; proofNote: string | null; vendorDeliveredAt: string | null }; events: { id: string; at: string; type: string; label: string; actor: string | null }[] };
const STEPS = [['sent', 'Envoyée'], ['confirmed', 'Confirmée'], ['preparing', 'En préparation'], ['shipped', 'En livraison'], ['delivered', 'Livrée'], ['received', 'Réceptionnée']] as const;
function Timeline({ o }: { o: O }) {
  const { data } = useApi<TL>(`/orders/${o.id}/timeline`);
  if (!data) return <p className="text-xs text-stone-400">Chargement du suivi…</p>;
  const done = new Set(data.events.map((e) => e.type)); const refused = done.has('refused') || done.has('cancelled');
  return (
    <div className="mt-3 rounded-xl bg-stone-50 p-3">
      <div className="flex items-center gap-1 overflow-x-auto">{STEPS.map(([k, l], i) => { const ok = done.has(k); return <div key={k} className="flex items-center gap-1"><div className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? 'bg-emerald-600 text-white' : refused ? 'bg-stone-200 text-stone-400' : 'bg-white text-stone-500 ring-1 ring-stone-200'}`}>{ok ? '✓' : i + 1} {l}</div>{i < STEPS.length - 1 && <div className={`h-0.5 w-4 ${ok ? 'bg-emerald-600' : 'bg-stone-200'}`} />}</div>; })}</div>
      <ul className="mt-3 space-y-1 text-xs text-stone-600">{data.events.map((e) => <li key={e.id} className="flex gap-2"><span className="w-28 shrink-0 text-stone-400">{new Date(e.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><span className={e.type === 'refused' ? 'text-red-700' : ''}>{e.label}</span></li>)}{!data.events.length && <li className="text-stone-400">Aucun événement enregistré.</li>}</ul>
      {(data.order.proofReceiverName || data.order.proofSignature || data.order.proofPhoto) && <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3 text-xs"><p className="font-semibold text-emerald-800">📦 Preuve de livraison du fournisseur{data.order.vendorDeliveredAt ? ` — ${new Date(data.order.vendorDeliveredAt).toLocaleString('fr-FR')}` : ''}</p>{data.order.proofReceiverName && <p className="mt-1">Reçue par : <b>{data.order.proofReceiverName}</b></p>}{data.order.proofNote && <p>Remarque : {data.order.proofNote}</p>}<div className="mt-2 flex flex-wrap gap-3">{data.order.proofSignature && <div><p className="text-stone-500">Signature</p><img src={data.order.proofSignature} alt="Signature" className="h-20 rounded-lg border bg-white" /></div>}{data.order.proofPhoto && <div><p className="text-stone-500">Photo</p><img src={data.order.proofPhoto} alt="Livraison" className="h-32 rounded-lg" /></div>}</div></div>}
    </div>
  );
}
type Msg = { subject: string; body: string; whatsappUrl: string; mailtoUrl: string; hasWhatsapp: boolean; hasEmail: boolean };
const STATUS_TONE: Record<string, string> = { preparee: 'bg-sky-100 text-sky-800', envoyee: 'bg-amber-100 text-amber-800', confirmee: 'bg-amber-100 text-amber-800', livree: 'bg-emerald-100 text-emerald-800', livree_partiel: 'bg-orange-100 text-orange-800', annulee: 'bg-stone-100 text-stone-500', brouillon: 'bg-stone-100 text-stone-600' };
const SOURCE_LABEL: Record<string, string> = { manuel: 'manuelle', comparateur: 'comparateur', panier_ia: '🧺 panier IA', auto_reorder: '🤖 auto-reorder' };

export default function Orders() {
  const { data, loading, error, reload } = useApi<{ orders: O[] }>('/orders'); const [reorder, setReorder] = useState<string | null>(null); const [review, setReview] = useState<O | null>(null); const pend = useApi<{ pending: { id: string }[]; reviewedOrderIds: string[] }>('/reviews/pending'); const [flash, setFlash] = useState<string | null>(null);
  const disc = useApi<{ items: unknown[]; openValue: number }>('/discrepancies');
  const [receiving, setReceiving] = useState<O | null>(null);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [result, setResult] = useState<RecvResult | null>(null);
  // Chantier 3 (audit) : prix réellement facturé, saisi à la réception (pré-rempli avec le prix commandé).
  const [invoiced, setInvoiced] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<{ o: O; msg: Msg } | null>(null);
  const [editing, setEditing] = useState<O | null>(null); const [packs, setPacks] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  // Chantier 1 (audit) : anti double-clic + affichage des refus serveur (déjà réceptionnée, quantité invraisemblable)
  const [recvBusy, setRecvBusy] = useState(false);
  const [recvErr, setRecvErr] = useState<{ message: string; code?: string } | null>(null);
  const openSend = async (o: O) => { const msg = await api<Msg>(`/orders/${o.id}/message`); setSending({ o, msg }); setCopied(false); };
  const markSent = async (o: O) => { await api(`/orders/${o.id}`, { method: 'PUT', json: { status: 'envoyee' } }); setSending(null); await reload(); };
  const cancel = async (o: O) => { if (!confirm(`Annuler la commande ${o.reference} ?`)) return; await api(`/orders/${o.id}`, { method: 'PUT', json: { status: 'annulee' } }); await reload(); };
  const openEdit = (o: O) => { setEditing(o); setPacks(Object.fromEntries(o.lines.map((l) => [l.id, String(l.packs)]))); };
  const saveEdit = async () => { if (!editing) return; await api(`/orders/${editing.id}/lines`, { method: 'PUT', json: { lines: editing.lines.map((l) => ({ lineId: l.id, packs: Math.max(0, Number(packs[l.id]) || 0) })) } }); setEditing(null); await reload(); };
  const openReceive = (o: O) => {
    setReceiving(o);
    setReceived(Object.fromEntries(o.lines.map((l) => [l.id, l.quantity])));
    setInvoiced(Object.fromEntries(o.lines.map((l) => [l.id, Number(l.unitPriceEur).toFixed(2)])));
    setResult(null); setRecvErr(null);
  };
  const confirmReceive = async (override = false) => {
    if (!receiving || recvBusy) return;
    if (!override && !confirm(`Réceptionner ${receiving.reference} ?\n\nLe stock sera mis à jour avec les quantités reçues. Une commande ne peut être réceptionnée qu'UNE fois.`)) return;
    setRecvBusy(true); setRecvErr(null);
    try {
      const r = await api<RecvResult>(`/orders/${receiving.id}/receive`, {
        method: 'POST',
        json: {
          lines: receiving.lines.map((l) => {
            const invoicedValue = Number(invoiced[l.id]);
            const sameAsOrdered = Math.abs(invoicedValue - Number(l.unitPriceEur)) < 0.0001;
            return {
              lineId: l.id, receivedQty: Number(received[l.id]) || 0,
              // On n'envoie un prix facturé que s'il est réellement différent : le reste du temps, rien ne change.
              ...(invoicedValue > 0 && !sameAsOrdered ? { invoicedUnitPrice: invoicedValue } : {}),
            };
          }),
          override: override || undefined,
        },
      });
      setResult(r); await reload(); void disc.reload(); if (!r.claimMessage) setReceiving(null);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setRecvErr({ message: e instanceof Error ? e.message : 'Erreur pendant la réception', code });
      await reload(); void disc.reload();
    } finally { setRecvBusy(false); }
  };
  const copy = (t: string) => { void navigator.clipboard.writeText(t); setCopied(true); };
  if (loading && !data) return <Loader />; if (error) return <ErrorBox message={error} />;
  const open = (data?.orders ?? []).filter((o) => ['preparee', 'envoyee', 'confirmee'].includes(o.status));
  const past = (data?.orders ?? []).filter((o) => !['preparee', 'envoyee', 'confirmee'].includes(o.status));
  const Row = ({ o }: { o: O }) => (
    <details className="card !p-0 group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <div><p className="font-bold">{o.supplierName}</p><p className="text-xs text-stone-500">{o.reference} · {fmtDate(o.createdAt)} · {o.lines.length} ligne{o.lines.length > 1 ? 's' : ''}{o.expectedAt && ` · livraison ${fmtDate(o.expectedAt)}`} · {SOURCE_LABEL[o.source] ?? o.source}</p></div>
        <div className="flex items-center gap-3">{o.receivedAt && <span className="pill bg-emerald-100 text-emerald-800">✓ Reçue le {fmtDate(o.receivedAt)}</span>}{o.fulfillment && o.status === 'confirmee' && <span className="pill bg-sky-100 text-sky-800">{({ en_preparation: '🧺 En préparation', en_livraison: '🚚 En livraison', livree: '📦 Livrée — à réceptionner' } as Record<string, string>)[o.fulfillment]}</span>}<span className={`pill ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span><span className="font-extrabold">{fmtEur(o.totalEur)}</span></div>
      </summary>
      <div className="border-t border-stone-100 px-5 py-4">
        <table className="w-full text-sm"><tbody className="divide-y divide-stone-100">{o.lines.map((l) => <tr key={l.id}><td className="py-1.5">{l.productName}</td><td className="py-1.5 text-stone-500">{l.packs} × {l.packLabel}</td><td className="py-1.5 text-right">{fmtQty(l.quantity)}{l.receivedQty !== null && Number(l.receivedQty) !== Number(l.quantity) && <span className="ml-1 text-xs text-red-600">(reçu {fmtQty(l.receivedQty)})</span>}</td><td className="py-1.5 text-right font-semibold">{fmtEur(l.lineTotalEur)}{l.invoicedUnitPriceEur && Math.abs(Number(l.invoicedUnitPriceEur) - Number(l.unitPriceEur)) > 0.0001 && <span className={`ml-1 text-xs ${Number(l.invoicedUnitPriceEur) > Number(l.unitPriceEur) ? 'text-orange-700' : 'text-emerald-700'}`} title="Prix réellement facturé à la réception">(payé {fmtEur(l.invoicedUnitPriceEur)}/unité au lieu de {fmtEur(l.unitPriceEur)})</span>}</td></tr>)}</tbody></table>
        {o.proposal && o.status === 'envoyee' && <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-bold text-amber-900">✏️ {o.supplierName} propose une modification</p>{o.proposal.note && <p className="mt-1 italic text-amber-900">« {o.proposal.note} »</p>}
          <ul className="mt-2 space-y-1">{o.proposal.lines.filter((l) => l.newPacks !== l.packs || l.replacement).map((l) => <li key={l.lineId}>• <b>{l.productName}</b> : {l.newPacks === 0 ? <span className="text-red-700">rupture (0/{l.packs})</span> : <>{l.newPacks}/{l.packs} colis</>}{l.replacement && <> → remplacé par <b>{l.replacement.packs} × {l.replacement.productName}</b> {l.replacement.packLabel} ({fmtEur(l.replacement.lineTotalEur)})</>}</li>)}</ul>
          <p className="mt-2">Nouveau total : <b>{fmtEur(o.proposal.newTotalEur)}</b> <span className="text-stone-500 line-through">{fmtEur(o.totalEur)}</span>{o.proposal.expectedAt && <> · livraison le {o.proposal.expectedAt}</>}</p>
          <div className="mt-2 flex gap-2"><button className="btn-primary !py-1.5" onClick={async () => { await api(`/orders/${o.id}/proposal`, { method: 'POST', json: { action: 'accept' } }); await reload(); }}>✅ Accepter</button><button className="btn-ghost !py-1.5 text-red-700" onClick={async () => { if (confirm('Refuser la proposition annule la commande. Continuer ?')) { await api(`/orders/${o.id}/proposal`, { method: 'POST', json: { action: 'decline' } }); await reload(); } }}>Refuser (annuler la commande)</button><Link to={`/app/achats/comparer/${o.lines[0]?.productId ?? ''}`} className="btn-ghost !py-1.5">Comparer ailleurs</Link></div>
        </div>}
        {o.vendorId && !['brouillon', 'preparee'].includes(o.status) && <Timeline o={o} />}
        <div className="mt-3 flex flex-wrap gap-2">
          {o.status === 'preparee' && <><button onClick={() => void openSend(o)} className="btn-primary !py-1.5"><Send size={14} /> Envoyer au fournisseur</button><button onClick={() => openEdit(o)} className="btn-ghost !py-1.5"><Pencil size={14} /> Modifier</button></>}
          {['envoyee', 'confirmee'].includes(o.status) && <button onClick={() => void openSend(o)} className="btn-ghost !py-1.5"><Copy size={14} /> Revoir le message</button>}
          {!['brouillon', 'annulee'].includes(o.status) && <button onClick={() => void openPdf(`/orders/${o.id}/pdf`)} className="btn-ghost !py-1.5">📄 PDF</button>}
          {o.vendorId && !['brouillon', 'preparee'].includes(o.status) && <button onClick={() => setReorder(o.id)} className="btn-ghost !py-1.5 text-brand-800">🔁 Recommander</button>}
          {o.vendorId && ['livree', 'livree_partiel'].includes(o.status) && !pend.data?.reviewedOrderIds.includes(o.id) && <button onClick={() => setReview(o)} className="btn-ghost !py-1.5 text-amber-700">⭐ Noter le fournisseur</button>}
          {['envoyee', 'confirmee', 'preparee'].includes(o.status) && !o.receivedAt && <button onClick={() => openReceive(o)} className="btn-ghost !py-1.5"><PackageCheck size={14} /> Réceptionner</button>}
          {['preparee', 'envoyee', 'confirmee'].includes(o.status) && <button onClick={() => void cancel(o)} className="btn-ghost !py-1.5 text-red-700 ml-auto"><XCircle size={14} /> Annuler</button>}
        </div>
      </div>
    </details>
  );
  return (
    <div className="animate-fade-up space-y-8">
      <PageTitle title="🛒 Achats" subtitle="Commandes en cours et historique. Rien ne part sans vous : vous envoyez le message par WhatsApp ou e-mail, puis la réception met le stock à jour."
        action={<div className="flex gap-2"><Link to="/app/achats/ecarts" className={`btn-ghost ${disc.data?.items.length ? '!bg-orange-50 !text-orange-800' : ''}`}><AlertTriangle size={16} /> Écarts{disc.data?.items.length ? ` (${disc.data.items.length} · ${fmtEur(disc.data.openValue, 0)})` : ''}</Link><Link to="/app/achats/panier" className="btn-primary">🧺 Panier intelligent</Link></div>} />
      {flash && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{flash}</p>}
      {review && <ReviewModal orderId={review.id} vendorName={review.supplierName} onClose={() => setReview(null)} onDone={(m) => { setReview(null); setFlash(m); void pend.reload(); }} />}
      {reorder && <ReorderModal orderId={reorder} onClose={() => setReorder(null)} onDone={(m) => { setReorder(null); setFlash(m); void reload(); }} />}
      <RecurringList onChanged={() => void reload()} />
      <section><h2 className="mb-3 text-lg font-bold">En cours ({open.length})</h2><div className="space-y-3">{open.map((o) => <Row key={o.id} o={o} />)}{open.length === 0 && <Empty>Aucune commande en cours. Passez par le <Link to="/app/achats/panier" className="underline">panier intelligent</Link> ou le comparateur depuis le stock.</Empty>}</div></section>
      <section><h2 className="mb-3 text-lg font-bold">Historique</h2><div className="space-y-3">{past.map((o) => <Row key={o.id} o={o} />)}</div></section>

      {sending && <Modal title={`Envoyer ${sending.o.reference}`} subtitle={`${sending.o.supplierName} · message prêt à envoyer`} onClose={() => setSending(null)}>
        <pre className="whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-xs text-stone-700 max-h-64 overflow-y-auto">{sending.msg.body}</pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={sending.msg.whatsappUrl} target="_blank" rel="noreferrer" className={`btn ${sending.msg.hasWhatsapp ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-stone-100 text-stone-500'}`} title={sending.msg.hasWhatsapp ? '' : 'Ajoutez un numéro WhatsApp sur la fiche fournisseur'}><MessageCircle size={16} /> WhatsApp</a>
          <a href={sending.msg.mailtoUrl} className={`btn ${sending.msg.hasEmail ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500'}`}><Mail size={16} /> E-mail</a>
          <button className="btn-ghost" onClick={() => copy(sending.msg.body)}><Copy size={16} /> {copied ? 'Copié !' : 'Copier'}</button>
        </div>
        {sending.o.status === 'preparee' && <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={() => void markSent(sending.o)}><Send size={16} /> J’ai envoyé → marquer « Envoyée »</button></div>}
      </Modal>}

      {editing && <Modal title={`Modifier ${editing.reference}`} subtitle="Mettez 0 pour retirer une ligne." onClose={() => setEditing(null)}>
        <div className="space-y-2">{editing.lines.map((l) => <div key={l.id} className="flex items-center justify-between gap-3 text-sm"><span>{l.productName} <span className="text-xs text-stone-400">{l.packLabel}</span></span><input type="number" min={0} className="input !w-24 text-right" value={packs[l.id] ?? ''} onChange={(e) => setPacks({ ...packs, [l.id]: e.target.value })} /></div>)}</div>
        <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setEditing(null)}>Annuler</button><button className="btn-primary" onClick={() => void saveEdit()}>Enregistrer</button></div>
      </Modal>}

      {receiving && <Modal title={`Réception — ${receiving.reference}`} subtitle={`${receiving.supplierName}. Corrigez les quantités réellement reçues.`} onClose={() => setReceiving(null)}>
        {!result ? (<>
          <p className="mb-3 rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
            Saisissez ce que vous avez <b>réellement reçu</b>. Chaque ligne affiche le prix commandé : si la facture indique
            un autre prix, corrigez-le — c'est ce prix qui servira à savoir si vos coûts augmentent.
          </p>
          <div className="space-y-3">{receiving.lines.map((l) => {
            const orderedUnit = Number(l.unitPriceEur);
            const invUnit = Number(invoiced[l.id]);
            const delta = invUnit > 0 ? invUnit - orderedUnit : 0;
            const reçu = Number(received[l.id]) || 0;
            return (
              <div key={l.id} className="rounded-xl border border-stone-200 p-3">
                <p className="text-sm font-semibold">{l.productName} <span className="font-normal text-stone-400">(commandé {fmtQty(l.quantity)}{l.packLabel ? ` — ${l.packs} × ${l.packLabel}` : ''})</span></p>
                <div className="mt-2 flex flex-wrap items-end gap-4 text-sm">
                  <label className="flex flex-col gap-1"><span className="text-xs text-stone-500">Quantité reçue</span>
                    <input inputMode="decimal" className="input !w-28 text-right" value={received[l.id] ?? ''} onChange={(e) => setReceived({ ...received, [l.id]: e.target.value })} /></label>
                  <label className="flex flex-col gap-1"><span className="text-xs text-stone-500">Prix facturé (€ / unité)</span>
                    <input inputMode="decimal" className="input !w-28 text-right" value={invoiced[l.id] ?? ''} onChange={(e) => setInvoiced({ ...invoiced, [l.id]: e.target.value })} /></label>
                  <span className="pb-2 text-xs text-stone-500">commandé : {fmtEur(orderedUnit)}</span>
                  {Math.abs(delta) > 0.0001 && invUnit > 0 && (
                    <span className={`pill pb-1 ${delta > 0 ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {delta > 0 ? `+${fmtEur(delta)} par unité` : `${fmtEur(delta)} par unité`}{reçu > 0 ? ` → ${delta > 0 ? '+' : ''}${fmtEur(delta * reçu)} sur la ligne` : ''}
                    </span>
                  )}
                </div>
              </div>
            );
          })}</div>
          {(() => {
            const total = receiving.lines.reduce((a, l) => {
              const invUnit = Number(invoiced[l.id]) || Number(l.unitPriceEur);
              return a + (invUnit - Number(l.unitPriceEur)) * (Number(received[l.id]) || 0);
            }, 0);
            if (Math.abs(total) < 0.01) return null;
            return (
              <p className={`mt-3 rounded-xl border p-3 text-sm ${total > 0 ? 'border-orange-300 bg-orange-50 text-orange-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
                {total > 0 ? <>💸 Cette facture coûte <b>{fmtEur(total)} de plus</b> que la commande.</> : <>✅ Cette facture coûte <b>{fmtEur(-total)} de moins</b> que la commande.</>}
              </p>
            );
          })()}
          {recvErr && <div className={`mt-3 rounded-xl border p-3 text-sm ${recvErr.code === 'quantity_out_of_range' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-800'}`}>
            <p className="font-semibold">{recvErr.code === 'quantity_out_of_range' ? '⚠️ Quantité invraisemblable' : recvErr.code === 'order_already_received' ? '🔒 Commande déjà réceptionnée' : 'Erreur'}</p>
            <p className="mt-1">{recvErr.message}</p>
            {recvErr.code === 'quantity_out_of_range' && <p className="mt-2 text-xs">Si ce volume est réellement celui livré (lot exceptionnel, stock de saison…), confirmez-le explicitement : la décision sera tracée dans le suivi de la commande.</p>}
          </div>}
          <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setReceiving(null)}>Annuler</button>
            {recvErr?.code === 'quantity_out_of_range' && <button className="btn-ghost" disabled={recvBusy} onClick={() => void confirmReceive(true)}>Le volume est réel, confirmer</button>}
            <button className="btn-primary" disabled={recvBusy} onClick={() => void confirmReceive()}>{recvBusy ? 'Réception…' : 'Valider la réception'}</button></div>
        </>) : (<>
          {(result.surchargeEur ?? 0) > 0 && (
            <div className="mb-3 rounded-xl border border-orange-300 bg-orange-50 p-4">
              <p className="font-semibold text-orange-900">💸 Facture plus élevée que la commande : +{fmtEur(result.surchargeEur ?? 0)}</p>
              <ul className="mt-2 space-y-1 text-xs text-orange-900">
                {(result.priceVariance ?? []).filter((v) => v.deltaEur > 0).map((v) => (
                  <li key={v.lineId}>{v.productName} : {fmtEur(v.orderedUnit)} → {fmtEur(v.invoicedUnit)}/{v.unit}{v.deltaPct !== null ? ` (${v.deltaPct > 0 ? '+' : ''}${v.deltaPct} %)` : ''} — {fmtEur(v.deltaEur)} sur {fmtQty(v.receivedQty, v.unit)}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-orange-800">Un relevé de prix a été enregistré : la prochaine facture au même prix déclenchera une alerte de hausse, avec le montant.</p>
            </div>
          )}
          {result.discrepancies.length > 0 && <div className="rounded-xl bg-red-50 border border-red-200 p-4"><p className="font-semibold text-red-800">🔴 {result.discrepancies.length} écart{result.discrepancies.length > 1 ? 's' : ''} détecté{result.discrepancies.length > 1 ? 's' : ''}</p><pre className="mt-2 whitespace-pre-wrap text-xs text-red-900">{result.claimMessage}</pre></div>}
          {!result.claimMessage && (result.surchargeEur ?? 0) <= 0 && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">✅ Réception enregistrée : aucune anomalie de quantité ni de prix.</div>}
          <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => copy(result.claimMessage ?? '')}><Copy size={14} /> {copied ? 'Copié !' : 'Copier la réclamation'}</button><Link to="/app/achats/ecarts" className="btn-primary" onClick={() => setReceiving(null)}>Suivre l’écart</Link></div>
        </>)}
      </Modal>}
    </div>
  );
}

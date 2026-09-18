import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, PackageCheck, Copy, MessageCircle, Mail, Pencil, XCircle, AlertTriangle } from 'lucide-react';
import { api, fmtEur, fmtQty, fmtDate, STATUS_LABEL } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox, Empty } from '../components/ui';
import { Modal } from '../components/Modal';

type Line = { id: string; productName: string; packLabel: string | null; packs: number; quantity: string; unitPriceEur: string; lineTotalEur: string; receivedQty: string | null };
type O = { id: string; reference: string; supplierName: string; status: string; channel: string; expectedAt: string | null; totalEur: string; source: string; createdAt: string; lines: Line[] };
type Msg = { subject: string; body: string; whatsappUrl: string; mailtoUrl: string; hasWhatsapp: boolean; hasEmail: boolean };
const STATUS_TONE: Record<string, string> = { preparee: 'bg-sky-100 text-sky-800', envoyee: 'bg-amber-100 text-amber-800', confirmee: 'bg-amber-100 text-amber-800', livree: 'bg-emerald-100 text-emerald-800', livree_partiel: 'bg-orange-100 text-orange-800', annulee: 'bg-stone-100 text-stone-500', brouillon: 'bg-stone-100 text-stone-600' };
const SOURCE_LABEL: Record<string, string> = { manuel: 'manuelle', comparateur: 'comparateur', panier_ia: '🧺 panier IA', auto_reorder: '🤖 auto-reorder' };

export default function Orders() {
  const { data, loading, error, reload } = useApi<{ orders: O[] }>('/orders');
  const disc = useApi<{ items: unknown[]; openValue: number }>('/discrepancies');
  const [receiving, setReceiving] = useState<O | null>(null);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ claimMessage: string | null; discrepancies: unknown[] } | null>(null);
  const [sending, setSending] = useState<{ o: O; msg: Msg } | null>(null);
  const [editing, setEditing] = useState<O | null>(null); const [packs, setPacks] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const openSend = async (o: O) => { const msg = await api<Msg>(`/orders/${o.id}/message`); setSending({ o, msg }); setCopied(false); };
  const markSent = async (o: O) => { await api(`/orders/${o.id}`, { method: 'PUT', json: { status: 'envoyee' } }); setSending(null); await reload(); };
  const cancel = async (o: O) => { if (!confirm(`Annuler la commande ${o.reference} ?`)) return; await api(`/orders/${o.id}`, { method: 'PUT', json: { status: 'annulee' } }); await reload(); };
  const openEdit = (o: O) => { setEditing(o); setPacks(Object.fromEntries(o.lines.map((l) => [l.id, String(l.packs)]))); };
  const saveEdit = async () => { if (!editing) return; await api(`/orders/${editing.id}/lines`, { method: 'PUT', json: { lines: editing.lines.map((l) => ({ lineId: l.id, packs: Math.max(0, Number(packs[l.id]) || 0) })) } }); setEditing(null); await reload(); };
  const openReceive = (o: O) => { setReceiving(o); setReceived(Object.fromEntries(o.lines.map((l) => [l.id, l.quantity]))); setResult(null); };
  const confirmReceive = async () => {
    if (!receiving) return;
    const r = await api<{ claimMessage: string | null; discrepancies: unknown[] }>(`/orders/${receiving.id}/receive`, { method: 'POST', json: { lines: receiving.lines.map((l) => ({ lineId: l.id, receivedQty: Number(received[l.id]) || 0 })) } });
    setResult(r); await reload(); void disc.reload(); if (!r.claimMessage) setReceiving(null);
  };
  const copy = (t: string) => { void navigator.clipboard.writeText(t); setCopied(true); };
  if (loading && !data) return <Loader />; if (error) return <ErrorBox message={error} />;
  const open = (data?.orders ?? []).filter((o) => ['preparee', 'envoyee', 'confirmee'].includes(o.status));
  const past = (data?.orders ?? []).filter((o) => !['preparee', 'envoyee', 'confirmee'].includes(o.status));
  const Row = ({ o }: { o: O }) => (
    <details className="card !p-0 group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <div><p className="font-bold">{o.supplierName}</p><p className="text-xs text-stone-500">{o.reference} · {fmtDate(o.createdAt)} · {o.lines.length} ligne{o.lines.length > 1 ? 's' : ''}{o.expectedAt && ` · livraison ${fmtDate(o.expectedAt)}`} · {SOURCE_LABEL[o.source] ?? o.source}</p></div>
        <div className="flex items-center gap-3"><span className={`pill ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span><span className="font-extrabold">{fmtEur(o.totalEur)}</span></div>
      </summary>
      <div className="border-t border-stone-100 px-5 py-4">
        <table className="w-full text-sm"><tbody className="divide-y divide-stone-100">{o.lines.map((l) => <tr key={l.id}><td className="py-1.5">{l.productName}</td><td className="py-1.5 text-stone-500">{l.packs} × {l.packLabel}</td><td className="py-1.5 text-right">{fmtQty(l.quantity)}{l.receivedQty !== null && Number(l.receivedQty) !== Number(l.quantity) && <span className="ml-1 text-xs text-red-600">(reçu {fmtQty(l.receivedQty)})</span>}</td><td className="py-1.5 text-right font-semibold">{fmtEur(l.lineTotalEur)}</td></tr>)}</tbody></table>
        <div className="mt-3 flex flex-wrap gap-2">
          {o.status === 'preparee' && <><button onClick={() => void openSend(o)} className="btn-primary !py-1.5"><Send size={14} /> Envoyer au fournisseur</button><button onClick={() => openEdit(o)} className="btn-ghost !py-1.5"><Pencil size={14} /> Modifier</button></>}
          {['envoyee', 'confirmee'].includes(o.status) && <button onClick={() => void openSend(o)} className="btn-ghost !py-1.5"><Copy size={14} /> Revoir le message</button>}
          {['envoyee', 'confirmee', 'preparee'].includes(o.status) && <button onClick={() => openReceive(o)} className="btn-ghost !py-1.5"><PackageCheck size={14} /> Réceptionner</button>}
          {['preparee', 'envoyee', 'confirmee'].includes(o.status) && <button onClick={() => void cancel(o)} className="btn-ghost !py-1.5 text-red-700 ml-auto"><XCircle size={14} /> Annuler</button>}
        </div>
      </div>
    </details>
  );
  return (
    <div className="animate-fade-up space-y-8">
      <PageTitle title="🛒 Achats" subtitle="Commandes en cours et historique. Rien ne part sans vous : vous envoyez le message par WhatsApp ou e-mail, puis la réception met le stock à jour."
        action={<div className="flex gap-2"><Link to="/app/achats/ecarts" className={`btn-ghost ${disc.data?.items.length ? '!bg-orange-50 !text-orange-800' : ''}`}><AlertTriangle size={16} /> Écarts{disc.data?.items.length ? ` (${disc.data.items.length} · ${fmtEur(disc.data.openValue, 0)})` : ''}</Link><Link to="/app/achats/panier" className="btn-primary">🧺 Panier intelligent</Link></div>} />
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
          <div className="space-y-2">{receiving.lines.map((l) => <label key={l.id} className="flex items-center justify-between gap-3 text-sm"><span>{l.productName} <span className="text-stone-400">(commandé {fmtQty(l.quantity)})</span></span><input inputMode="decimal" className="input !w-28 text-right" value={received[l.id] ?? ''} onChange={(e) => setReceived({ ...received, [l.id]: e.target.value })} /></label>)}</div>
          <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setReceiving(null)}>Annuler</button><button className="btn-primary" onClick={() => void confirmReceive()}>Valider la réception</button></div>
        </>) : (<>
          <div className="rounded-xl bg-red-50 border border-red-200 p-4"><p className="font-semibold text-red-800">🔴 {result.discrepancies.length} écart{result.discrepancies.length > 1 ? 's' : ''} détecté{result.discrepancies.length > 1 ? 's' : ''}</p><pre className="mt-2 whitespace-pre-wrap text-xs text-red-900">{result.claimMessage}</pre></div>
          <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => copy(result.claimMessage ?? '')}><Copy size={14} /> {copied ? 'Copié !' : 'Copier la réclamation'}</button><Link to="/app/achats/ecarts" className="btn-primary" onClick={() => setReceiving(null)}>Suivre l’écart</Link></div>
        </>)}
      </Modal>}
    </div>
  );
}

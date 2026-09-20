// Chantier 20 — Préparation & livraison côté grossiste : liste de picking, étapes, preuve de livraison (photo + signature).
import { useEffect, useRef, useState } from 'react';
import { ClipboardList, Truck, PackageCheck, Camera, PenLine, FileText, Printer } from 'lucide-react';
import { api, openPdf } from '../../lib/api';
import { Field } from '../../components/Modal';

type Picking = { date: string | null; dates: string[]; products: { productId: string; productName: string; packLabel: string | null; packs: number; orders: { reference: string; restaurant: string; packs: number }[] }[]; orders: { id: string; reference: string; restaurant: string; city: string | null; address: string | null; expectedAt: string | null; fulfillment: string | null; deliverySlot: string | null; lines: number; packs: number }[] };
const STEP: Record<string, string> = { '': '⏳ À préparer', en_preparation: '🧺 En préparation', en_livraison: '🚚 En livraison', livree: '📦 Livrée' };
const fmt = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }) : 'date à fixer';

/** Compresse une photo prise au téléphone en JPEG ≤ 1024 px. */
async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file); const img = new Image(); await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; });
  const k = Math.min(1, 1024 / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); return cv.toDataURL('image/jpeg', 0.72);
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null); const drawing = useRef(false); const [empty, setEmpty] = useState(true);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) * (ref.current!.width / r.width), y: (e.clientY - r.top) * (ref.current!.height / r.height) }; };
  return (
    <div>
      <canvas ref={ref} width={600} height={200} className="w-full touch-none rounded-xl border-2 border-dashed border-stone-300 bg-white"
        onPointerDown={(e) => { drawing.current = true; const c = ref.current!.getContext('2d')!; c.lineWidth = 3; c.lineCap = 'round'; c.strokeStyle = '#1c1917'; const p = pos(e); c.beginPath(); c.moveTo(p.x, p.y); ref.current!.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (!drawing.current) return; const c = ref.current!.getContext('2d')!; const p = pos(e); c.lineTo(p.x, p.y); c.stroke(); }}
        onPointerUp={() => { drawing.current = false; setEmpty(false); onChange(ref.current!.toDataURL('image/png')); }} />
      <div className="mt-1 flex items-center justify-between text-xs text-stone-500"><span>{empty ? 'Le client signe ici avec le doigt' : 'Signature enregistrée'}</span><button type="button" className="underline" onClick={() => { ref.current!.getContext('2d')!.clearRect(0, 0, 600, 200); setEmpty(true); onChange(null); }}>Effacer</button></div>
    </div>
  );
}

export function Fulfillment() {
  const [data, setData] = useState<Picking | null>(null); const [date, setDate] = useState<string>(''); const [view, setView] = useState<'orders' | 'picking'>('orders');
  const [proofFor, setProofFor] = useState<Picking['orders'][number] | null>(null); const [p, setP] = useState({ receiverName: '', note: '', photo: null as string | null, signature: null as string | null }); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [slot, setSlot] = useState<Record<string, string>>({}); const [driver, setDriver] = useState('');
  const load = () => api<Picking>(`/vendor/picking${date ? `?date=${date}` : ''}`).then(setData).catch((e) => setErr((e as Error).message));
  useEffect(() => { void load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = async (o: Picking['orders'][number], s: 'en_preparation' | 'en_livraison') => { setErr(null); try { await api(`/vendor/orders/${o.id}/fulfillment`, { method: 'POST', json: { step: s, deliverySlot: slot[o.id] || undefined, driverName: driver || undefined } }); await load(); } catch (e) { setErr((e as Error).message); } };
  const deliver = async () => { if (!proofFor) return; setBusy(true); setErr(null); try { await api(`/vendor/orders/${proofFor.id}/fulfillment`, { method: 'POST', json: { step: 'livree', receiverName: p.receiverName || undefined, note: p.note || undefined, photo: p.photo ?? undefined, signature: p.signature ?? undefined, driverName: driver || undefined } }); setProofFor(null); setP({ receiverName: '', note: '', photo: null, signature: null }); await load(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  if (!data) return <p className="text-stone-500">Chargement…</p>;
  const todo = data.orders.filter((o) => o.fulfillment !== 'livree'); const done = data.orders.filter((o) => o.fulfillment === 'livree');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input !w-auto" value={date} onChange={(e) => setDate(e.target.value)}><option value="">Toutes les dates ({data.orders.length})</option>{data.dates.map((d) => <option key={d} value={d}>{fmt(d)}</option>)}</select>
        <div className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm font-semibold">{([['orders', Truck, 'Tournée'], ['picking', ClipboardList, 'Liste de picking']] as const).map(([k, I, l]) => <button key={k} onClick={() => setView(k)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${view === k ? 'bg-white text-brand-800 shadow-sm' : 'text-stone-600'}`}><I size={15} /> {l}</button>)}</div>
        <input className="input !w-44" placeholder="Nom du livreur" value={driver} onChange={(e) => setDriver(e.target.value)} />
        {view === 'picking' && <button className="btn-ghost ml-auto" onClick={() => window.print()}><Printer size={16} /> Imprimer</button>}
      </div>
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      {!data.orders.length && <div className="card text-center text-stone-500">Aucune commande confirmée à préparer{date ? ' pour cette date' : ''}. Les commandes apparaissent ici dès que vous les confirmez dans l’onglet Commandes.</div>}

      {view === 'picking' && data.products.length > 0 && <div className="card !p-0 print:shadow-none">
        <div className="flex items-center justify-between p-4 pb-2"><h3 className="font-bold">🧺 À préparer — {date ? fmt(date) : 'toutes dates'}</h3><span className="text-sm text-stone-500">{data.products.reduce((a, x) => a + x.packs, 0)} colis · {data.orders.length} commande{data.orders.length > 1 ? 's' : ''}</span></div>
        <table className="w-full text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="px-4 py-2">Produit</th><th className="px-4 py-2">Conditionnement</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2">Répartition</th><th className="w-10 px-2"></th></tr></thead>
          <tbody className="divide-y divide-stone-100">{data.products.map((x) => <tr key={x.productId + x.packLabel}><td className="px-4 py-2 font-semibold">{x.productName}</td><td className="px-4 py-2 text-stone-600">{x.packLabel ?? '—'}</td><td className="px-4 py-2 text-right text-lg font-extrabold">{x.packs}</td><td className="px-4 py-2 text-xs text-stone-500">{x.orders.map((o) => `${o.restaurant} ×${o.packs}`).join(' · ')}</td><td className="px-2 py-2"><input type="checkbox" className="h-5 w-5" /></td></tr>)}</tbody></table>
      </div>}

      {view === 'orders' && <>
        {todo.map((o) => <div key={o.id} className="card space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{o.restaurant} <span className="ml-1 text-xs font-normal text-stone-500">{o.city}{o.address ? ` · ${o.address}` : ''}</span></p><p className="text-xs text-stone-500">{o.reference} · {fmt(o.expectedAt)} · {o.lines} ligne{o.lines > 1 ? 's' : ''}, {o.packs} colis{o.deliverySlot ? ` · ${o.deliverySlot}` : ''}</p></div><span className="pill bg-stone-100 text-stone-700">{STEP[o.fulfillment ?? '']}</span></div>
          <div className="flex flex-wrap items-end gap-2">
            {!o.fulfillment && <><Field label="Créneau"><input className="input !w-32" placeholder="7h–9h" value={slot[o.id] ?? ''} onChange={(e) => setSlot({ ...slot, [o.id]: e.target.value })} /></Field><button className="btn-primary" onClick={() => void step(o, 'en_preparation')}><ClipboardList size={16} /> Commencer la préparation</button></>}
            {o.fulfillment === 'en_preparation' && <button className="btn-primary" onClick={() => void step(o, 'en_livraison')}><Truck size={16} /> Partie en livraison (prévenir le restaurant)</button>}
            {o.fulfillment === 'en_livraison' && <button className="btn-primary !bg-emerald-700" onClick={() => setProofFor(o)}><PackageCheck size={16} /> Livrée — preuve de livraison</button>}
            <button className="btn-ghost" onClick={() => void openPdf(`/vendor/orders/${o.id}/pdf?type=livraison`)}><FileText size={16} /> Bon de livraison</button>
          </div>
        </div>)}
        {done.length > 0 && <details className="card"><summary className="cursor-pointer font-semibold">📦 Livrées ({done.length}) — en attente de confirmation de réception par le restaurant</summary><ul className="mt-2 divide-y divide-stone-100 text-sm">{done.map((o) => <li key={o.id} className="flex justify-between py-1.5"><span>{o.restaurant} · {o.reference}</span><span className="text-stone-500">{fmt(o.expectedAt)}</span></li>)}</ul></details>}
      </>}

      {proofFor && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={() => setProofFor(null)}>
        <div className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-bold">📦 Preuve de livraison — {proofFor.restaurant}</h3><p className="text-xs text-stone-500">{proofFor.reference} · {proofFor.packs} colis. Au moins un élément : nom, signature ou photo.</p>
          <Field label="Reçu par (nom)"><input className="input" value={p.receiverName} onChange={(e) => setP({ ...p, receiverName: e.target.value })} placeholder="Ex. Awa, gérante" /></Field>
          <Field label="Signature du client"><SignaturePad onChange={(s) => setP({ ...p, signature: s })} /></Field>
          <Field label="Photo (colis déposés / bon signé)"><label className="btn-ghost cursor-pointer"><Camera size={16} /> {p.photo ? 'Photo prise ✓ (reprendre)' : 'Prendre une photo'}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setP({ ...p, photo: await compressImage(f) }); }} /></label>{p.photo && <img src={p.photo} alt="" className="mt-2 max-h-40 rounded-xl" />}</Field>
          <Field label="Remarque"><input className="input" value={p.note} onChange={(e) => setP({ ...p, note: e.target.value })} placeholder="Ex. 1 carton abîmé signalé" /></Field>
          {err && <p className="text-sm text-red-700">{err}</p>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setProofFor(null)}>Annuler</button><button className="btn-primary !bg-emerald-700" disabled={busy || (!p.receiverName && !p.signature && !p.photo)} onClick={() => void deliver()}><PenLine size={16} /> {busy ? 'Enregistrement…' : 'Valider la livraison'}</button></div>
        </div>
      </div>}
    </div>
  );
}

// Chantier 26 — Litiges & avoirs (restaurant).
import { useState } from 'react';
import { Scale, Camera } from 'lucide-react';
import { api, fmtEur } from '../lib/api';
import { useApi } from '../lib/useApi';
import { Modal, Field } from './Modal';

export type Claim = { id: string; reference: string; orderReference: string; vendorName: string; productName: string; kind: string; kindLabel: string; orderedQty: string | null; receivedQty: string | null; claimedEur: string; message: string | null; hasPhoto: boolean; status: string; resolution: string | null; creditEur: string | null; vendorMessage: string | null; vendorRespondedAt: string | null; createdAt: string };
export const CLAIM_STATUS: Record<string, [string, string]> = { ouvert: ['⏳ En attente du fournisseur', 'bg-amber-100 text-amber-800'], propose: ['✏️ Réponse partielle à valider', 'bg-blue-100 text-blue-800'], accepte: ['✅ Avoir accordé', 'bg-emerald-100 text-emerald-800'], refuse: ['❌ Refusé par le fournisseur', 'bg-red-100 text-red-800'], escalade: ['⚖️ Arbitrage AFRISUPPLY', 'bg-purple-100 text-purple-800'], clos: ['✔ Clos', 'bg-stone-100 text-stone-700'] };
const KINDS = [['manquant', 'Manquant'], ['abime', 'Abîmé / casse'], ['erreur_produit', 'Erreur de produit'], ['qualite', 'Qualité / DLC'], ['autre', 'Autre']] as const;

async function compress(file: File): Promise<string> { const url = URL.createObjectURL(file); const img = new Image(); await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; }); const k = Math.min(1, 1024 / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); return cv.toDataURL('image/jpeg', 0.72); }

export function ClaimModal({ discrepancyId, orderId, productName, defaultEur, onClose, onDone }: { discrepancyId?: string; orderId?: string; productName?: string; defaultEur?: number; onClose: () => void; onDone: (msg: string) => void }) {
  const [f, setF] = useState({ kind: 'manquant', claimedEur: defaultEur ? String(defaultEur) : '', message: '', photo: null as string | null, productName: productName ?? '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const go = async () => { setBusy(true); setErr(null); try { const r = await api<{ message: string }>('/claims', { method: 'POST', json: { discrepancyId, orderId, productName: f.productName || undefined, kind: f.kind, claimedEur: f.claimedEur ? Number(f.claimedEur) : undefined, message: f.message || undefined, photo: f.photo ?? undefined } }); onDone(r.message); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return (
    <Modal title="⚖️ Ouvrir un litige" subtitle="Le fournisseur doit répondre sous 48 h : avoir, relivraison ou refus motivé. Sinon AFRISUPPLY arbitre." onClose={onClose}>
      <div className="space-y-3">
        {!discrepancyId && <Field label="Produit concerné"><input className="input" value={f.productName} onChange={(e) => setF({ ...f, productName: e.target.value })} /></Field>}
        <Field label="Nature du problème"><div className="flex flex-wrap gap-1.5">{KINDS.map(([k, l]) => <button type="button" key={k} onClick={() => setF({ ...f, kind: k })} className={`rounded-full px-3 py-1 text-sm ${f.kind === k ? 'bg-brand-700 text-white' : 'bg-stone-100 text-stone-700'}`}>{l}</button>)}</div></Field>
        <Field label="Montant réclamé (€ HT)" hint={defaultEur ? `Calculé sur le manquant : ${fmtEur(defaultEur)}` : undefined}><input type="number" step="0.01" min={0} className="input" value={f.claimedEur} onChange={(e) => setF({ ...f, claimedEur: e.target.value })} /></Field>
        <Field label="Photo (recommandé)"><label className="btn-ghost cursor-pointer"><Camera size={16} /> {f.photo ? 'Photo ajoutée ✓' : 'Ajouter une photo'}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const x = e.target.files?.[0]; if (x) setF({ ...f, photo: await compress(x) }); }} /></label>{f.photo && <img src={f.photo} alt="" className="mt-2 max-h-32 rounded-xl" />}</Field>
        <Field label="Message"><textarea className="input" rows={2} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="Ex. 2 cartons écrasés, DLC dépassée…" /></Field>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" disabled={busy || !f.claimedEur} onClick={() => void go()}><Scale size={16} /> Envoyer au fournisseur</button></div>
      </div>
    </Modal>
  );
}

export function ClaimsList() {
  const { data, reload } = useApi<{ items: Claim[]; openCount: number; creditsEur: number }>('/claims'); const [msg, setMsg] = useState<string | null>(null); const [esc, setEsc] = useState<string | null>(null); const [escMsg, setEscMsg] = useState('');
  if (!data?.items.length) return null;
  const act = async (id: string, action: 'accept' | 'escalate') => { const r = await api<{ message?: string }>(`/claims/${id}/close`, { method: 'POST', json: { action, message: escMsg || undefined } }); setMsg(r.message ?? 'Litige clos.'); setEsc(null); setEscMsg(''); await reload(); };
  return (
    <section><h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Scale size={18} /> Litiges ({data.openCount} en cours) <span className="text-sm font-normal text-stone-500">· avoirs obtenus : {fmtEur(data.creditsEur)}</span></h2>
      {msg && <p className="mb-2 rounded-xl bg-emerald-50 p-2 text-sm text-emerald-800">{msg}</p>}
      <div className="space-y-2">{data.items.map((c) => { const [label, cls] = CLAIM_STATUS[c.status] ?? [c.status, 'bg-stone-100']; return <div key={c.id} className="card !p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{c.productName} <span className="font-normal text-stone-500">· {c.kindLabel} · {c.vendorName} · {c.orderReference}</span></p><p className="text-xs text-stone-500">{c.reference} · {new Date(c.createdAt).toLocaleDateString('fr-FR')} · réclamé <b>{fmtEur(Number(c.claimedEur))}</b>{c.creditEur && <> · avoir <b className="text-emerald-700">{fmtEur(Number(c.creditEur))}</b></>}</p></div><span className={`pill ${cls}`}>{label}</span></div>
        {c.vendorMessage && <p className="mt-2 rounded-lg bg-stone-50 p-2 text-xs">💬 {c.vendorMessage}</p>}
        {['propose', 'refuse', 'accepte'].includes(c.status) && <div className="mt-2 flex flex-wrap gap-2">{c.status !== 'accepte' && <button className="btn-primary !py-1" onClick={() => void act(c.id, 'accept')}>Accepter la réponse</button>}{c.status === 'accepte' && <button className="btn-ghost !py-1" onClick={() => void act(c.id, 'accept')}>Clore (avoir reçu)</button>}{esc === c.id ? <div className="flex w-full gap-2"><input className="input" placeholder="Pourquoi contestez-vous ?" value={escMsg} onChange={(e) => setEscMsg(e.target.value)} /><button className="btn-ghost !py-1 text-purple-800" onClick={() => void act(c.id, 'escalate')}>Envoyer à AFRISUPPLY</button></div> : <button className="btn-ghost !py-1 text-purple-800" onClick={() => setEsc(c.id)}>⚖️ Contester (arbitrage AFRISUPPLY)</button>}</div>}
      </div>; })}</div>
    </section>
  );
}

// Chantier 27 — Badge de fiabilité + étoiles + formulaire d'avis.
import { useState } from 'react';
import { Star } from 'lucide-react';
import { api } from '../lib/api';
import { Modal, Field } from './Modal';

export type Reliability = { rating: number | null; reviews: number; onTimePct: number | null; conformPct: number | null; acceptPct: number | null; avgResponseH: number | null; disputePct: number | null; orders90d: number; badge: 'excellent' | 'fiable' | 'nouveau' | 'a_surveiller' };
const BADGE: Record<Reliability['badge'], [string, string]> = { excellent: ['🏅 Excellent', 'bg-emerald-100 text-emerald-800'], fiable: ['✓ Fiable', 'bg-sky-100 text-sky-800'], nouveau: ['Nouveau', 'bg-stone-100 text-stone-600'], a_surveiller: ['⚠ À surveiller', 'bg-amber-100 text-amber-800'] };

export function Stars({ value, size = 14, onChange }: { value: number | null; size?: number; onChange?: (v: number) => void }) {
  return <span className="inline-flex items-center gap-0.5">{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} className={`${value !== null && i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-stone-300'} ${onChange ? 'cursor-pointer hover:scale-110' : ''}`} onClick={onChange ? () => onChange(i) : undefined} />)}</span>;
}
export function ReliabilityBadge({ r, detailed }: { r: Reliability; detailed?: boolean }) {
  const [label, cls] = BADGE[r.badge];
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      <span className={`pill ${cls}`}>{label}</span>
      {r.rating !== null && <span className="inline-flex items-center gap-1"><Stars value={r.rating} /> <b>{r.rating.toFixed(1)}</b> <span className="text-stone-500">({r.reviews} avis)</span></span>}
      {detailed && <>{r.onTimePct !== null && <span className="text-stone-600">⏱ à l'heure {r.onTimePct} %</span>}{r.conformPct !== null && <span className="text-stone-600">✓ conforme {r.conformPct} %</span>}{r.acceptPct !== null && <span className="text-stone-600">accepte {r.acceptPct} %</span>}{r.avgResponseH !== null && <span className="text-stone-600">répond en {r.avgResponseH} h</span>}{r.disputePct !== null && r.disputePct > 0 && <span className="text-amber-700">écarts {r.disputePct} %</span>}</>}
    </span>
  );
}
export function ReviewModal({ orderId, vendorName, onClose, onDone }: { orderId: string; vendorName: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [f, setF] = useState({ rating: 0, onTime: null as boolean | null, conform: null as boolean | null, comment: '' }); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); setErr(null); try { const r = await api<{ message: string }>(`/orders/${orderId}/review`, { method: 'POST', json: { rating: f.rating, onTime: f.onTime ?? undefined, conform: f.conform ?? undefined, comment: f.comment || undefined } }); onDone(r.message); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const YN = ({ k, label }: { k: 'onTime' | 'conform'; label: string }) => <Field label={label}><div className="flex gap-1.5">{[[true, 'Oui'], [false, 'Non']].map(([v, l]) => <button type="button" key={String(v)} onClick={() => setF({ ...f, [k]: v })} className={`rounded-full px-3 py-1 text-sm ${f[k] === v ? (v ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white') : 'bg-stone-100 text-stone-700'}`}>{l as string}</button>)}</div></Field>;
  return (
    <Modal title={`⭐ Noter ${vendorName}`} subtitle="30 secondes. Visible par les autres restaurants (nom masqué) et par le fournisseur." onClose={onClose}>
      <div className="space-y-3">
        <Field label="Note globale"><Stars value={f.rating || null} size={28} onChange={(v) => setF({ ...f, rating: v })} /></Field>
        <div className="grid grid-cols-2 gap-3"><YN k="onTime" label="Livré à l'heure ?" /><YN k="conform" label="Produits conformes ?" /></div>
        <Field label="Commentaire (optionnel)"><textarea className="input" rows={2} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} placeholder="Ex. Bananes plantain parfaites, livreur ponctuel." /></Field>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Plus tard</button><button className="btn-primary" disabled={busy || !f.rating} onClick={() => void go()}>Envoyer mon avis</button></div>
      </div>
    </Modal>
  );
}

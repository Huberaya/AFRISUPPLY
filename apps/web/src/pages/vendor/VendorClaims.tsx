// Chantier 26 — Litiges côté grossiste : répondre (avoir / relivraison / refus motivé).
import { useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import { api } from '../../lib/api';
import { Field } from '../../components/Modal';
import { CLAIM_STATUS, type Claim } from '../../components/Claims';

type VC = Claim & { restaurantName: string; photo?: string | null };
const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;
export function VendorClaims() {
  const [data, setData] = useState<{ items: VC[]; openCount: number; creditsEur: number } | null>(null); const [f, setF] = useState<Record<string, { resolution: 'avoir' | 'relivraison' | 'refus'; creditEur: string; message: string }>>({}); const [err, setErr] = useState<string | null>(null);
  const load = () => api<{ items: VC[]; openCount: number; creditsEur: number }>('/vendor/claims').then(setData).catch((e) => setErr((e as Error).message));
  useEffect(() => { void load(); }, []);
  const respond = async (c: VC) => { const x = f[c.id] ?? { resolution: 'avoir', creditEur: c.claimedEur, message: '' }; setErr(null); try { await api(`/vendor/claims/${c.id}/respond`, { method: 'POST', json: { resolution: x.resolution, creditEur: x.resolution === 'avoir' ? Number(x.creditEur) : undefined, message: x.message || undefined } }); await load(); } catch (e) { setErr((e as Error).message); } };
  if (!data) return <p className="text-stone-500">Chargement…</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm"><span className="pill bg-amber-100 text-amber-800">{data.openCount} à traiter</span><span className="text-stone-500">Avoirs accordés : {eur(data.creditsEur)}</span><span className="ml-auto text-xs text-stone-500">Répondez sous 48 h (CGV art. 5). Un litige sans réponse peut être arbitré par AFRISUPPLY.</span></div>
      {err && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      {!data.items.length && <div className="card text-center text-stone-500"><Scale className="mx-auto mb-2" /> Aucun litige. Les écarts signalés par vos clients à la réception apparaîtront ici.</div>}
      {data.items.map((c) => { const [label, cls] = CLAIM_STATUS[c.status] ?? [c.status, '']; const x = f[c.id] ?? { resolution: 'avoir' as const, creditEur: c.claimedEur, message: '' }; return <div key={c.id} className="card space-y-2 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{c.restaurantName} — {c.productName} <span className="font-normal text-stone-500">· {c.kindLabel} · {c.orderReference}</span></p><p className="text-xs text-stone-500">{c.reference} · {new Date(c.createdAt).toLocaleString('fr-FR')}{c.orderedQty && <> · commandé {Number(c.orderedQty)} / reçu {Number(c.receivedQty)}</>} · réclamé <b>{eur(Number(c.claimedEur))}</b></p></div><span className={`pill ${cls}`}>{label}</span></div>
        {c.message && <p className="rounded-lg bg-stone-50 p-2">💬 {c.message}</p>}{c.photo && <img src={c.photo} alt="" className="max-h-40 rounded-xl" />}
        {c.vendorMessage && <p className="text-xs text-stone-500">Votre réponse : {c.vendorMessage}{c.creditEur && ` — avoir ${eur(Number(c.creditEur))}`}</p>}
        {['ouvert', 'propose'].includes(c.status) && <div className="flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 p-3">
          <Field label="Réponse"><select className="input" value={x.resolution} onChange={(e) => setF({ ...f, [c.id]: { ...x, resolution: e.target.value as 'avoir' } })}><option value="avoir">Avoir (déduit de la prochaine facture)</option><option value="relivraison">Relivraison du manquant</option><option value="refus">Refus motivé</option></select></Field>
          {x.resolution === 'avoir' && <Field label="Montant de l'avoir (€ HT)"><input type="number" step="0.01" className="input !w-32" value={x.creditEur} onChange={(e) => setF({ ...f, [c.id]: { ...x, creditEur: e.target.value } })} /></Field>}
          <Field label={x.resolution === 'refus' ? 'Motif (obligatoire)' : 'Message'}><input className="input !w-64" value={x.message} onChange={(e) => setF({ ...f, [c.id]: { ...x, message: e.target.value } })} /></Field>
          <button className="btn-primary" onClick={() => void respond(c)}>Envoyer la réponse</button>
        </div>}
      </div>; })}
    </div>
  );
}

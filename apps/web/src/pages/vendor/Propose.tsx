// Chantier 21 — Ruptures partielles & substitutions : le grossiste propose, le restaurant accepte en 1 clic.
import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { api } from '../../lib/api';

type Line = { id: string; productName: string; packLabel: string | null; packs: number; lineTotalEur: string };
type Offer = { id: string; productName: string; packLabel: string; packPriceEur: string; inStock: boolean };
const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;

export function Propose({ orderId, lines, onDone, onCancel }: { orderId: string; lines: Line[]; onDone: () => void; onCancel: () => void }) {
  const [offers, setOffers] = useState<Offer[]>([]); const [q, setQ] = useState<Record<string, number>>(Object.fromEntries(lines.map((l) => [l.id, l.packs])));
  const [rep, setRep] = useState<Record<string, string>>({}); const [repPacks, setRepPacks] = useState<Record<string, number>>({}); const [note, setNote] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ offers: Offer[] }>('/vendor/offers').then((r) => setOffers(r.offers.filter((o) => o.inStock))).catch(() => {}); }, []);
  const total = lines.reduce((a, l) => { const unit = Number(l.lineTotalEur) / Math.max(1, l.packs); const r = offers.find((o) => o.id === rep[l.id]); return a + (q[l.id] ?? l.packs) * unit + (r ? (repPacks[l.id] ?? (l.packs - (q[l.id] ?? l.packs))) * Number(r.packPriceEur) : 0); }, 0);
  const changed = lines.some((l) => (q[l.id] ?? l.packs) !== l.packs || rep[l.id]);
  const send = async () => { setBusy(true); setErr(null); try { await api(`/vendor/orders/${orderId}/propose`, { method: 'POST', json: { note: note || undefined, lines: lines.map((l) => ({ lineId: l.id, newPacks: q[l.id] ?? l.packs, replacementOfferId: rep[l.id] || null, replacementPacks: rep[l.id] ? (repPacks[l.id] ?? (l.packs - (q[l.id] ?? l.packs)) || 1) : undefined })) } }); onDone(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
      <p className="font-bold text-amber-900">✏️ Rupture partielle ou substitution — proposez, le restaurant accepte en un clic</p>
      <table className="w-full"><thead className="text-left text-xs uppercase text-stone-500"><tr><th className="py-1">Produit</th><th className="py-1">Commandé</th><th className="py-1">Je peux livrer</th><th className="py-1">Remplacer le manque par</th></tr></thead>
        <tbody>{lines.map((l) => { const missing = l.packs - (q[l.id] ?? l.packs); return <tr key={l.id} className="border-t border-amber-100"><td className="py-1.5 font-semibold">{l.productName} <span className="text-xs font-normal text-stone-500">{l.packLabel}</span></td><td className="py-1.5">{l.packs}</td>
          <td className="py-1.5"><input type="number" min={0} max={l.packs} className="input !w-20 !py-1" value={q[l.id] ?? l.packs} onChange={(e) => setQ({ ...q, [l.id]: Math.max(0, Math.min(l.packs, Number(e.target.value))) })} /></td>
          <td className="py-1.5">{missing > 0 && <div className="flex items-center gap-1"><select className="input !py-1" value={rep[l.id] ?? ''} onChange={(e) => setRep({ ...rep, [l.id]: e.target.value })}><option value="">— aucun (rupture) —</option>{offers.map((o) => <option key={o.id} value={o.id}>{o.productName} · {o.packLabel} · {eur(Number(o.packPriceEur))}</option>)}</select>{rep[l.id] && <input type="number" min={1} className="input !w-16 !py-1" value={repPacks[l.id] ?? missing} onChange={(e) => setRepPacks({ ...repPacks, [l.id]: Math.max(1, Number(e.target.value)) })} />}</div>}</td></tr>; })}</tbody></table>
      <input className="input" placeholder="Message au restaurant (ex. arrivage jeudi, calibre différent…)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap items-center justify-between gap-2"><p>Nouveau total : <b>{eur(total)}</b></p><div className="flex gap-2"><button className="btn-ghost" onClick={onCancel}>Annuler</button><button className="btn-primary" disabled={busy || !changed || total <= 0} onClick={() => void send()}><Send size={16} /> Envoyer la proposition</button></div></div>
      {err && <p className="text-red-700">{err}</p>}
    </div>
  );
}

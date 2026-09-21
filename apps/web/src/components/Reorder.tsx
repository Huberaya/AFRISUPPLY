// Chantier 24 — Recommander en 1 clic + programmer une commande récurrente.
import { useEffect, useState } from 'react';
import { Repeat, CalendarClock, Play, Trash2, Pause } from 'lucide-react';
import { api, fmtEur } from '../lib/api';
import { Modal, Field } from './Modal';
import { useConfirm, useToast } from './Feedback';

type Preview = { vendor: { id: string; name: string; status: string; minOrderEur: string }; items: { productName: string; packLabel: string | null; packs: number; vendorOfferId: string | null; available: boolean; oldPackPrice: number; newPackPrice: number | null }[]; total: number; oldTotal: number };
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']; const DAY_IDX = [1, 2, 3, 4, 5, 6, 0];

export function ReorderModal({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [p, setP] = useState<Preview | null>(null); const [packs, setPacks] = useState<Record<string, number>>({}); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [recurring, setRecurring] = useState(false); const [days, setDays] = useState<number[]>([1]); const [name, setName] = useState(''); const [mode, setMode] = useState<'auto' | 'confirm'>('auto');
  useEffect(() => { api<Preview>(`/orders/${orderId}/reorder-preview`).then((r) => { setP(r); setPacks(Object.fromEntries(r.items.filter((i) => i.vendorOfferId).map((i) => [i.vendorOfferId!, i.packs]))); setName(`Commande ${r.vendor.name}`); }).catch((e) => setErr((e as Error).message)); }, [orderId]);
  const lines = () => Object.entries(packs).filter(([, n]) => n > 0).map(([vendorOfferId, n]) => ({ vendorOfferId, packs: n }));
  const total = p ? p.items.reduce((a, i) => a + (i.vendorOfferId && i.available && i.newPackPrice !== null ? (packs[i.vendorOfferId] ?? 0) * i.newPackPrice : 0), 0) : 0;
  const go = async () => { setBusy(true); setErr(null); try { if (recurring) { const r = await api<{ message: string }>('/recurring', { method: 'POST', json: { fromOrderId: orderId, name, weekdays: days, mode, lines: lines() } }); onDone(r.message); } else { const r = await api<{ message: string }>(`/orders/${orderId}/reorder`, { method: 'POST', json: { lines: lines() } }); onDone(r.message); } } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return (
    <Modal title="🔁 Recommander" subtitle={p ? `Chez ${p.vendor.name} — prix du jour` : undefined} onClose={onClose}>
      {!p && !err && <p className="text-sm text-stone-500">Chargement…</p>}
      {p && <div className="space-y-3">
        {p.vendor.status !== 'actif' && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">Ce fournisseur n'est plus actif.</p>}
        <table className="w-full text-sm"><tbody className="divide-y divide-stone-100">{p.items.map((i, k) => <tr key={k} className={!i.available ? 'opacity-50' : ''}><td className="py-1.5">{i.productName} <span className="text-xs text-stone-500">{i.packLabel}</span>{!i.available && <span className="ml-2 pill bg-red-50 text-red-700">indisponible</span>}</td>
          <td className="py-1.5 text-right text-xs">{i.newPackPrice !== null && <>{fmtEur(i.newPackPrice)}{i.newPackPrice !== i.oldPackPrice && <span className={`ml-1 ${i.newPackPrice > i.oldPackPrice ? 'text-red-600' : 'text-emerald-600'}`}>({i.newPackPrice > i.oldPackPrice ? '+' : ''}{Math.round((i.newPackPrice / i.oldPackPrice - 1) * 100)} %)</span>}</>}</td>
          <td className="py-1.5 text-right">{i.vendorOfferId && i.available ? <input type="number" min={0} className="input !w-16 !py-1 text-right" value={packs[i.vendorOfferId] ?? 0} onChange={(e) => setPacks({ ...packs, [i.vendorOfferId!]: Math.max(0, Number(e.target.value)) })} /> : '—'}</td></tr>)}</tbody></table>
        <p className="text-right">Total : <b>{fmtEur(total)}</b> <span className="text-xs text-stone-500">(précédent {fmtEur(p.oldTotal)})</span></p>
        <label className="flex items-center gap-2 rounded-xl bg-stone-50 p-3 text-sm"><input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} /><span><b>Programmer chaque semaine</b> — la commande part automatiquement, vous êtes prévenu à chaque envoi.</span></label>
        {recurring && <div className="space-y-2 rounded-xl border border-stone-200 p-3">
          <Field label="Nom"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Jours d'envoi"><div className="flex gap-1.5">{DAYS.map((d, i) => { const idx = DAY_IDX[i]; const on = days.includes(idx); return <button type="button" key={i} onClick={() => setDays(on ? days.filter((x) => x !== idx) : [...days, idx])} className={`h-9 w-9 rounded-full text-sm font-bold ${on ? 'bg-brand-700 text-white' : 'bg-stone-100 text-stone-600'}`}>{d}</button>; })}</div></Field>
          <Field label="Mode"><select className="input" value={mode} onChange={(e) => setMode(e.target.value as 'auto')}><option value="auto">Envoi automatique au fournisseur</option><option value="confirm">Me demander avant (à venir — envoi auto pour l'instant)</option></select></Field>
        </div>}
        {err && <p className="text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" disabled={busy || total <= 0 || (recurring && !days.length)} onClick={() => void go()}>{recurring ? <><CalendarClock size={16} /> Programmer</> : <><Repeat size={16} /> Renvoyer la commande</>}</button></div>
      </div>}
      {err && !p && <p className="text-sm text-red-700">{err}</p>}
    </Modal>
  );
}

type Rec = { id: string; name: string; vendorName: string; daysLabel: string; weekdays: number[]; enabled: boolean; mode: string; nextRunOn: string | null; lastRunAt: string | null; estimatedTotal: number; lines: { productName: string; packLabel: string | null; packs: number; available: boolean }[] };
export function RecurringList({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<Rec[] | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const confirmer = useConfirm(); const toast = useToast();
  const load = () => api<{ recurring: Rec[] }>('/recurring').then((r) => setRows(r.recurring)).catch(() => setRows([]));
  useEffect(() => { void load(); }, []);
  if (!rows?.length) return null;
  return (
    <section><h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><CalendarClock size={18} /> Commandes récurrentes ({rows.length})</h2>
      {msg && <p className="mb-2 rounded-xl bg-emerald-50 p-2 text-sm text-emerald-800">{msg}</p>}
      <div className="grid gap-3 md:grid-cols-2">{rows.map((r) => <div key={r.id} className={`card space-y-2 ${!r.enabled ? 'opacity-60' : ''}`}>
        <div className="flex items-start justify-between gap-2"><div><p className="font-bold">{r.name}</p><p className="text-xs text-stone-500">{r.vendorName} · {r.daysLabel} · ≈ {fmtEur(r.estimatedTotal)} · {r.mode === 'confirm' ? '✋ me demander avant' : '⚡ envoi automatique'}</p></div><span className="pill bg-stone-100 text-stone-700">{r.enabled ? (r.nextRunOn ? `prochaine : ${new Date(r.nextRunOn + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}` : '—') : 'en pause'}</span></div>
        <p className="text-xs text-stone-600">{r.lines.map((l) => `${l.packs} × ${l.productName}${l.available ? '' : ' (indispo.)'}`).join(' · ')}</p>
        <div className="flex flex-wrap gap-1.5 text-xs"><button className="btn-ghost !py-1" onClick={async () => { try { const x = await api<{ message: string }>(`/recurring/${r.id}/run`, { method: 'POST', json: {} }); setMsg(x.message); onChanged?.(); } catch (e) { setMsg((e as Error).message); } }}><Play size={13} /> Envoyer maintenant</button><button className="btn-ghost !py-1" onClick={async () => { await api(`/recurring/${r.id}`, { method: 'PUT', json: { enabled: !r.enabled } }); void load(); }}>{r.enabled ? <><Pause size={13} /> Mettre en pause</> : <><Play size={13} /> Réactiver</>}</button><button className="btn-ghost !py-1 text-red-700" onClick={async () => {
            const ok = await confirmer({ title: `Supprimer la commande récurrente « ${r.name} » ?`, body: <>Elle ne sera plus préparée automatiquement. Les commandes déjà créées ne sont pas touchées.</>, confirmLabel: 'Supprimer la récurrence', danger: true });
            if (!ok) return;
            try { await api(`/recurring/${r.id}`, { method: 'DELETE' }); toast.success('Récurrence supprimée.'); } catch (e) { toast.error('Suppression impossible', (e as Error).message); }
            void load();
          }}><Trash2 size={13} /> Supprimer</button></div>
      </div>)}</div>
    </section>
  );
}

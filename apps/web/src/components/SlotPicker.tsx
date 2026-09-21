// Chantier 19 — Choix de la date/créneau de livraison parmi les tournées du grossiste.
import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { api } from '../lib/api';

export type Slot = { routeId: string; routeName: string; date: string; weekday: number; weekdayLabel: string; slots: string[]; cutoffAt: string; remaining: number | null; full: boolean };
export type SlotChoice = { routeId: string; expectedAt: string; deliverySlot?: string } | null;
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

export function SlotPicker({ vendorId, value, onChange }: { vendorId: string; value: SlotChoice; onChange: (v: SlotChoice, hasRoutes: boolean) => void }) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  useEffect(() => { let on = true; api<{ slots: Slot[]; hasRoutes: boolean }>(`/marketplace/vendors/${vendorId}/slots`).then((r) => { if (!on) return; setSlots(r.slots); const f = r.slots.find((s) => !s.full); onChange(f ? { routeId: f.routeId, expectedAt: f.date, deliverySlot: f.slots[0] } : null, r.hasRoutes); }).catch(() => setSlots([])); return () => { on = false; }; }, [vendorId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!slots || !slots.length) return null;
  const cur = slots.find((s) => value && s.routeId === value.routeId && s.date === value.expectedAt);
  return (
    <div className="card !p-3">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><CalendarDays size={16} /> Date de livraison</p>
      <div className="flex gap-2 overflow-x-auto pb-1">{slots.slice(0, 10).map((s) => { const active = cur === s; return (
        <button key={`${s.routeId}${s.date}`} type="button" disabled={s.full} onClick={() => onChange({ routeId: s.routeId, expectedAt: s.date, deliverySlot: s.slots[0] }, true)} className={`shrink-0 rounded-xl border px-3 py-2 text-left text-sm ${active ? 'border-brand-600 bg-brand-50' : 'border-stone-200 bg-white'} ${s.full ? 'opacity-40' : ''}`}>
          <p className="font-semibold capitalize">{fmt(s.date)}</p><p className="text-[11px] text-stone-500">{s.routeName}{s.full ? ' · complet' : s.remaining !== null && s.remaining <= 3 ? ` · ${s.remaining} place${s.remaining > 1 ? 's' : ''}` : ''}</p>
        </button>); })}</div>
      {cur && cur.slots.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm"><span className="text-stone-500">Créneau :</span>{cur.slots.map((h) => <button key={h} type="button" onClick={() => onChange({ routeId: cur.routeId, expectedAt: cur.date, deliverySlot: h }, true)} className={`rounded-full px-3 py-1 ${value?.deliverySlot === h ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-700'}`}>{h}</button>)}</div>}
      {cur && <p className="mt-1 text-[11px] text-stone-500">Commande possible jusqu'au {cur.cutoffAt.replace(' ', ' à ')}.</p>}
    </div>
  );
}

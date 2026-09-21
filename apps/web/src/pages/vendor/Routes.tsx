// Chantier 19 — Tournées de livraison du grossiste : jour, zones, créneaux, heure limite, capacité.
import { useState } from 'react';
import { useConfirm, useToast } from '../../components/Feedback';
import { Plus, Trash2, Route } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { api } from '../../lib/api';
import { Loader, ErrorBox, Empty } from '../../components/ui';
import { Modal, Field } from '../../components/Modal';

type R = { id: string; name: string; weekday: number; zones: string[]; slots: string[]; cutoffDaysBefore: number; cutoffTime: string; capacity: number | null; active: boolean };
type Load = { routeId: string; date: string; count: number };
const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const empty = { name: '', weekday: 1, zones: '', slots: '6h–8h, 8h–10h', cutoffDaysBefore: 1, cutoffTime: '14:00', capacity: '' };

export function VendorRoutes() {
  const { data, loading, error, reload } = useApi<{ routes: R[]; upcoming: Load[] }>('/vendor/routes');
  const [open, setOpen] = useState(false); const [f, setF] = useState(empty); const [err, setErr] = useState<string | null>(null);
  const confirmer = useConfirm(); const toast = useToast();
  if (loading) return <Loader />; if (error || !data) return <ErrorBox message={error ?? 'Erreur'} onRetry={reload} />;
  const save = async () => { setErr(null); try { await api('/vendor/routes', { method: 'POST', json: { name: f.name, weekday: Number(f.weekday), zones: f.zones.split(/[,;]/).map((z) => z.trim()).filter(Boolean), slots: f.slots.split(/[,;]/).map((z) => z.trim()).filter(Boolean), cutoffDaysBefore: Number(f.cutoffDaysBefore), cutoffTime: f.cutoffTime, capacity: f.capacity ? Number(f.capacity) : null } }); setOpen(false); setF(empty); await reload(); } catch (e) { setErr((e as Error).message); } };
  const toggle = async (r: R) => { await api(`/vendor/routes/${r.id}`, { method: 'PUT', json: { active: !r.active } }); await reload(); };
  // Chantier 11 (règle du produit) : aucune boîte de dialogue native du navigateur — la confirmation
  // est intégrée à l'application, avec le nom de la tournée et les conséquences écrites noir sur blanc.
  const del = async (r: R) => {
    const ok = await confirmer({
      title: 'Supprimer cette tournée ?',
      body: <>La tournée « {r.name} » disparaîtra du choix des restaurants. Les commandes déjà passées sur ce créneau ne sont pas modifiées.</>,
      confirmLabel: 'Supprimer la tournée', danger: true,
    });
    if (!ok) return;
    try { await api(`/vendor/routes/${r.id}`, { method: 'DELETE' }); toast.success('Tournée supprimée.'); } catch (e) { toast.error('Suppression impossible', (e as Error).message); }
    await reload();
  };
  const next = (r: R) => data.upcoming.filter((u) => u.routeId === r.id).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-stone-600">Vos tournées définissent <b>quand</b> et <b>où</b> vous livrez : les restaurants choisissent une date parmi vos tournées, et ne peuvent plus commander après l'heure limite.</p><button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Nouvelle tournée</button></div>
      {data.routes.length === 0 ? <Empty><Route className="mx-auto mb-2" />Aucune tournée : les commandes sont livrées sous votre délai standard. Ajoutez vos jours de livraison pour regrouper les commandes par secteur.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2">{ORDER.map((d) => data.routes.filter((r) => r.weekday === d).map((r) => (
          <div key={r.id} className={`card ${r.active ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-2"><div><p className="font-bold">{DAYS[r.weekday]} — {r.name}</p><p className="text-xs text-stone-500">{r.zones.length ? `Zones : ${r.zones.join(', ')}` : 'Toutes vos zones de livraison'}{r.slots.length ? ` · créneaux ${r.slots.join(' / ')}` : ''}</p><p className="text-xs text-stone-500">Commande jusqu'à J-{r.cutoffDaysBefore} {r.cutoffTime}{r.capacity ? ` · ${r.capacity} commandes max` : ''}</p></div>
              <div className="flex gap-1"><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => void toggle(r)}>{r.active ? 'Suspendre' : 'Réactiver'}</button><button className="btn-ghost !px-2 !py-1 text-red-700" onClick={() => void del(r)}><Trash2 size={14} /></button></div></div>
            {next(r).length > 0 && <p className="mt-2 text-xs">Prochaines : {next(r).map((u) => <span key={u.date} className="pill mr-1 bg-brand-50 text-brand-800">{new Date(`${u.date}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · {u.count} cde{u.count > 1 ? 's' : ''}{r.capacity ? `/${r.capacity}` : ''}</span>)}</p>}
          </div>)))}</div>)}
      {open && <Modal title="Nouvelle tournée" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3"><Field label="Nom"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Tournée Est 93/94" /></Field><Field label="Jour"><select className="input" value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>{ORDER.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}</select></Field></div>
          <Field label="Zones desservies (codes postaux ou villes, séparés par des virgules ; vide = toutes)"><input className="input" value={f.zones} onChange={(e) => setF({ ...f, zones: e.target.value })} placeholder="93, 94, Montreuil" /></Field>
          <Field label="Créneaux horaires proposés"><input className="input" value={f.slots} onChange={(e) => setF({ ...f, slots: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-3"><Field label="Heure limite : jours avant"><input type="number" min={0} max={7} className="input" value={f.cutoffDaysBefore} onChange={(e) => setF({ ...f, cutoffDaysBefore: Number(e.target.value) })} /></Field><Field label="Heure limite"><input type="time" className="input" value={f.cutoffTime} onChange={(e) => setF({ ...f, cutoffTime: e.target.value })} /></Field><Field label="Capacité (cdes)"><input type="number" min={1} className="input" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} placeholder="∞" /></Field></div>
          {err && <p className="text-sm text-red-700">{err}</p>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Annuler</button><button className="btn-primary" disabled={f.name.trim().length < 2} onClick={() => void save()}>Créer</button></div>
        </div></Modal>}
    </div>
  );
}

import { useState } from 'react';
import { api, CATEGORY_LABEL } from '../lib/api';
import { Field } from './Modal';

export type SupplierInput = { name: string; contactName: string; email: string; phone: string; whatsapp: string; city: string; categories: string[]; leadTimeHours: number; minOrderEur: number; deliveryFeeEur: number; preferredChannel: 'email' | 'whatsapp' | 'telephone' | 'plateforme'; rating: number | null; notes: string };
const EMPTY: SupplierInput = { name: '', contactName: '', email: '', phone: '', whatsapp: '', city: '', categories: [], leadTimeHours: 48, minOrderEur: 0, deliveryFeeEur: 0, preferredChannel: 'whatsapp', rating: null, notes: '' };

export function SupplierForm({ initial, supplierId, onDone }: { initial?: Partial<SupplierInput>; supplierId?: string; onDone: () => void }) {
  const [f, setF] = useState<SupplierInput>({ ...EMPTY, ...initial });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const set = <K extends keyof SupplierInput>(k: K, v: SupplierInput[K]) => setF({ ...f, [k]: v });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const payload = { ...f, contactName: f.contactName || null, phone: f.phone || null, whatsapp: f.whatsapp || null, city: f.city || null, notes: f.notes || null };
      if (supplierId) await api(`/suppliers/${supplierId}`, { method: 'PUT', json: payload });
      else await api('/suppliers', { method: 'POST', json: { ...payload, contactName: f.contactName || undefined, phone: f.phone || undefined, whatsapp: f.whatsapp || undefined, city: f.city || undefined } });
      onDone();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Nom du fournisseur"><input className="input" required minLength={2} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Afro Distribution Nantes" /></Field></div>
      <Field label="Contact"><input className="input" value={f.contactName} onChange={(e) => set('contactName', e.target.value)} /></Field>
      <Field label="Ville"><input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
      <Field label="Téléphone"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      <Field label="WhatsApp" hint="Sert au bouton « Envoyer sur WhatsApp »"><input className="input" value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="06 12 34 56 78" /></Field>
      <div className="sm:col-span-2"><Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field></div>
      <Field label="Délai de livraison (heures)"><input className="input" type="number" min={1} value={f.leadTimeHours} onChange={(e) => set('leadTimeHours', Number(e.target.value))} /></Field>
      <Field label="Canal préféré"><select className="input" value={f.preferredChannel} onChange={(e) => set('preferredChannel', e.target.value as SupplierInput['preferredChannel'])}><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="telephone">Téléphone</option><option value="plateforme">Plateforme</option></select></Field>
      <Field label="Minimum de commande (€)"><input className="input" type="number" min={0} step="0.01" value={f.minOrderEur} onChange={(e) => set('minOrderEur', Number(e.target.value))} /></Field>
      <Field label="Frais de livraison (€)"><input className="input" type="number" min={0} step="0.01" value={f.deliveryFeeEur} onChange={(e) => set('deliveryFeeEur', Number(e.target.value))} /></Field>
      <div className="sm:col-span-2"><Field label="Catégories"><div className="flex flex-wrap gap-1.5">{Object.entries(CATEGORY_LABEL).map(([k, l]) => <button type="button" key={k} onClick={() => set('categories', f.categories.includes(k) ? f.categories.filter((c) => c !== k) : [...f.categories, k])} className={`pill ${f.categories.includes(k) ? 'bg-brand-700 text-white' : 'bg-stone-100 text-stone-700'}`}>{l}</button>)}</div></Field></div>
      <Field label="Note (0–5)"><input className="input" type="number" min={0} max={5} step="0.5" value={f.rating ?? ''} onChange={(e) => set('rating', e.target.value === '' ? null : Number(e.target.value))} /></Field>
      <div className="sm:col-span-2"><Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Livre le mardi et le vendredi, paiement à 30 j…" /></Field></div>
      {err && <p className="sm:col-span-2 text-sm text-red-700">{err}</p>}
      <div className="sm:col-span-2 flex justify-end gap-2"><button type="submit" className="btn-primary" disabled={busy}>{supplierId ? 'Enregistrer' : 'Créer le fournisseur'}</button></div>
    </form>
  );
}

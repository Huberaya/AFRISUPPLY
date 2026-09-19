// Admin — Prospection : deux sections (Restaurants / Fournisseurs). Chaque fiche : nom, adresse, téléphone, e-mail, contact, statut, notes, relance.
import { useEffect, useState } from 'react';
import { Plus, Phone, Mail, MapPin, Pencil, Trash2, Upload, Search, Send, Copy } from 'lucide-react';
import { api } from '../../lib/api';
import { PageTitle, ErrorBox, Stat } from '../../components/ui';
import { Modal, Field } from '../../components/Modal';

type Kind = 'restaurant' | 'fournisseur';
type P = { id: string; kind: Kind; name: string; address: string | null; city: string | null; phone: string | null; email: string | null; contactName: string | null; status: string; notes: string | null; nextActionAt: string | null; updatedAt: string };
type D = { prospects: P[]; counts: { kind: string; status: string; c: number }[]; statuses: string[] };
const STATUS: Record<string, { label: string; cls: string }> = {
  a_contacter: { label: 'À contacter', cls: 'bg-stone-100 text-stone-700' }, contacte: { label: 'Contacté', cls: 'bg-blue-50 text-blue-800' }, rdv: { label: 'RDV pris', cls: 'bg-violet-50 text-violet-800' },
  interesse: { label: 'Intéressé', cls: 'bg-amber-50 text-amber-800' }, converti: { label: 'Converti ✅', cls: 'bg-emerald-50 text-emerald-800' }, perdu: { label: 'Perdu', cls: 'bg-red-50 text-red-800' },
};
const empty = (kind: Kind): Partial<P> => ({ kind, name: '', address: '', city: '', phone: '', email: '', contactName: '', status: 'a_contacter', notes: '', nextActionAt: null });

export default function AdminProspects() {
  const [kind, setKind] = useState<Kind>('restaurant'); const [d, setD] = useState<D | null>(null); const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [edit, setEdit] = useState<Partial<P> | null>(null); const [importOpen, setImportOpen] = useState(false); const [csv, setCsv] = useState(''); const [msg, setMsg] = useState<string | null>(null);
  const load = () => api<D>(`/admin/prospects?kind=${kind}${q ? `&q=${encodeURIComponent(q)}` : ''}${status ? `&status=${status}` : ''}`).then(setD).catch((e) => setErr((e as Error).message));
  useEffect(() => { const t = setTimeout(() => void load(), 200); return () => clearTimeout(t); }, [kind, q, status]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => { if (!edit) return; const json = { ...edit, email: edit.email || null, nextActionAt: edit.nextActionAt || null }; if (edit.id) await api(`/admin/prospects/${edit.id}`, { method: 'PUT', json }); else await api('/admin/prospects', { method: 'POST', json }); setEdit(null); void load(); };
  const remove = async (p: P) => { if (!confirm(`Supprimer ${p.name} ?`)) return; await api(`/admin/prospects/${p.id}`, { method: 'DELETE' }); void load(); };
  const [inv, setInv] = useState<{ p: P; url?: string; whatsapp?: string; sent?: boolean; message?: string; email: string; busy: boolean } | null>(null);
  const invite = async () => { if (!inv) return; setInv({ ...inv, busy: true }); try { const r = await api<{ url: string; whatsapp: string; sent: boolean; message: string; mailError: string | null }>(`/admin/prospects/${inv.p.id}/invite-vendor`, { method: 'POST', json: { email: inv.email || undefined, send: !!inv.email } }); setInv({ ...inv, ...r, busy: false, message: r.sent ? r.message : `${r.message}${r.mailError ? ` (e-mail : ${r.mailError})` : ''}` }); void load(); } catch (e) { setInv({ ...inv, busy: false, message: (e as Error).message }); } };
  const setSt = async (p: P, s: string) => { await api(`/admin/prospects/${p.id}`, { method: 'PUT', json: { status: s } }); void load(); };
  const doImport = async () => {
    const rows = csv.split(/\r?\n/).map((l) => l.split(/\t|;/).map((x) => x.trim())).filter((c) => c[0] && c[0].length >= 2 && !/^nom$/i.test(c[0])).map((c) => ({ name: c[0], address: c[1] || null, city: c[2] || null, phone: c[3] || null, email: c[4] || null, contactName: c[5] || null }));
    if (!rows.length) { setMsg('Aucune ligne reconnue. Format : Nom ; Adresse ; Ville ; Téléphone ; E-mail ; Contact (une ligne par établissement).'); return; }
    const r = await api<{ imported: number; ignored: number }>(`/admin/prospects/import?kind=${kind}`, { method: 'POST', json: { rows } }); setMsg(`${r.imported} ${kind}s importés${r.ignored ? `, ${r.ignored} ignorés` : ''}.`); setCsv(''); setImportOpen(false); void load();
  };
  if (err) return <ErrorBox message={err} />;
  const count = (k: string, s?: string) => (d?.counts ?? []).filter((c) => c.kind === k && (!s || c.status === s)).reduce((a, c) => a + c.c, 0);
  const list = d?.prospects ?? []; const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="animate-fade-up space-y-5">
      <PageTitle title="📇 Prospection" subtitle="Votre carnet de démarchage : qui appeler, qui relancer, qui a dit oui." action={<div className="flex gap-2"><button className="btn-ghost" onClick={() => { setMsg(null); setImportOpen(true); }}><Upload size={16} /> Importer</button><button className="btn-primary" onClick={() => setEdit(empty(kind))}><Plus size={16} /> Ajouter un {kind}</button></div>} />
      <nav className="flex gap-1 rounded-2xl bg-stone-100 p-1 text-sm font-semibold">
        {(['restaurant', 'fournisseur'] as const).map((k) => <button key={k} onClick={() => { setKind(k); setStatus(''); }} className={`flex-1 rounded-xl px-3 py-2.5 ${kind === k ? 'bg-white text-brand-800 shadow-sm' : 'text-stone-600'}`}>{k === 'restaurant' ? '🍽️ Restaurants' : '🚚 Fournisseurs'} <span className="ml-1 rounded-full bg-stone-200 px-2 text-xs text-stone-700">{count(k)}</span></button>)}
      </nav>
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">{Object.entries(STATUS).map(([s, m]) => <button key={s} onClick={() => setStatus(status === s ? '' : s)} className={`text-left ${status === s ? 'ring-2 ring-brand-500 rounded-2xl' : ''}`}><Stat label={m.label} value={count(kind, s)} /></button>)}</div>
      {msg && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-900">{msg}</p>}
      <div className="relative"><Search size={16} className="absolute left-3 top-3 text-stone-400" /><input className="input pl-9" placeholder="Rechercher un nom, une ville, un téléphone, un e-mail…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {list.length === 0 && <div className="card text-center text-stone-500">Aucun {kind} {status ? `« ${STATUS[status].label} »` : ''}{q ? ` pour « ${q} »` : ''}. Ajoutez-en un ou importez votre liste (copier-coller depuis Excel / Google Sheets).</div>}
      <div className="grid gap-3 md:grid-cols-2">{list.map((p) => (
        <div key={p.id} className={`card space-y-2 ${p.nextActionAt && p.nextActionAt <= today && !['converti', 'perdu'].includes(p.status) ? 'border-amber-300 bg-amber-50/40' : ''}`}>
          <div className="flex items-start justify-between gap-2"><div><p className="text-lg font-bold">{p.name}</p>{p.contactName && <p className="text-sm text-stone-600">👤 {p.contactName}</p>}</div>
            {p.kind === 'fournisseur' && <button className="pill bg-brand-600 !px-2.5 text-white" title="Inviter à créer son espace fournisseur (fiche pré-remplie)" onClick={() => setInv({ p, email: p.email ?? '', busy: false })}><Send size={12} className="mr-1 inline" />Inviter</button>}<select className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-semibold" value={p.status} onChange={(e) => void setSt(p, e.target.value)}>{Object.entries(STATUS).map(([s, m]) => <option key={s} value={s}>{m.label}</option>)}</select></div>
          <div className="space-y-1 text-sm">
            <p className="flex items-center gap-2 text-stone-700"><MapPin size={14} className="shrink-0 text-stone-400" /> {[p.address, p.city].filter(Boolean).join(', ') || <span className="text-stone-400">Adresse non renseignée</span>}</p>
            <p className="flex items-center gap-2"><Phone size={14} className="shrink-0 text-stone-400" /> {p.phone ? <a className="font-semibold text-brand-800 hover:underline" href={`tel:${p.phone.replace(/\s/g, '')}`}>{p.phone}</a> : <span className="text-stone-400">Téléphone non renseigné</span>}</p>
            <p className="flex items-center gap-2"><Mail size={14} className="shrink-0 text-stone-400" /> {p.email ? <a className="text-brand-800 hover:underline" href={`mailto:${p.email}`}>{p.email}</a> : <span className="text-stone-400">E-mail non renseigné</span>}</p>
          </div>
          {p.notes && <p className="rounded-lg bg-stone-50 p-2 text-sm text-stone-600 whitespace-pre-wrap">{p.notes}</p>}
          <div className="flex items-center justify-between text-xs text-stone-500"><span>{p.nextActionAt ? `⏰ Relance le ${new Date(p.nextActionAt).toLocaleDateString('fr-FR')}` : `Modifié le ${new Date(p.updatedAt).toLocaleDateString('fr-FR')}`}</span><span className="flex gap-1"><button className="rounded-lg p-1.5 hover:bg-stone-100" aria-label="Modifier" onClick={() => setEdit(p)}><Pencil size={14} /></button><button className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" aria-label="Supprimer" onClick={() => void remove(p)}><Trash2 size={14} /></button></span></div>
        </div>))}</div>

      {edit && <Modal title={edit.id ? `Modifier ${edit.name}` : `Nouveau ${edit.kind}`} onClose={() => setEdit(null)}>
        <div className="space-y-3">
          <Field label="Nom *"><input className="input" autoFocus value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Adresse"><input className="input" placeholder="12 rue de la Paix" value={edit.address ?? ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Ville"><input className="input" value={edit.city ?? ''} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field><Field label="Contact (prénom nom)"><input className="input" value={edit.contactName ?? ''} onChange={(e) => setEdit({ ...edit, contactName: e.target.value })} /></Field></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Téléphone"><input className="input" type="tel" placeholder="06 12 34 56 78" value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field><Field label="E-mail"><input className="input" type="email" value={edit.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Statut"><select className="input" value={edit.status ?? 'a_contacter'} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{Object.entries(STATUS).map(([s, m]) => <option key={s} value={s}>{m.label}</option>)}</select></Field><Field label="Relance prévue le"><input className="input" type="date" value={edit.nextActionAt ?? ''} onChange={(e) => setEdit({ ...edit, nextActionAt: e.target.value || null })} /></Field></div>
          <Field label="Notes" hint="Ce qu’il a dit, ce qu’il utilise aujourd’hui, ses fournisseurs, le bon moment pour rappeler…"><textarea className="input" rows={3} value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setEdit(null)}>Annuler</button><button className="btn-primary" disabled={!edit.name || edit.name.length < 2} onClick={() => void save()}>Enregistrer</button></div>
        </div>
      </Modal>}
      {inv && <Modal title={`Inviter ${inv.p.name}`} onClose={() => setInv(null)}>
        <div className="space-y-3 text-sm">
          <p className="text-stone-600">Génère un lien personnel (30 jours) : fiche pré-remplie, création du mot de passe, activation immédiate, import du tarif.</p>
          {!inv.url ? <>
            <Field label="E-mail du grossiste (facultatif — sinon lien WhatsApp)"><input className="input" type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Field>
            <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setInv(null)}>Annuler</button><button className="btn-primary" disabled={inv.busy} onClick={() => void invite()}><Send size={14} /> {inv.email ? 'Envoyer l’e-mail + générer le lien' : 'Générer le lien'}</button></div>
          </> : <>
            <p className={`rounded-xl p-3 ${inv.sent ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{inv.message}</p>
            <Field label="Lien d’invitation"><div className="flex gap-2"><input className="input flex-1 text-xs" readOnly value={inv.url} /><button className="btn-ghost" onClick={() => void navigator.clipboard.writeText(inv.url!)}><Copy size={14} /></button></div></Field>
            <Field label="Message WhatsApp prêt à coller"><textarea className="input text-xs" rows={4} readOnly value={inv.whatsapp} /></Field>
            <div className="flex justify-end gap-2">{inv.p.phone && <a className="btn-primary" target="_blank" rel="noreferrer" href={`https://wa.me/${inv.p.phone.replace(/\D/g, '').replace(/^0/, '33')}?text=${encodeURIComponent(inv.whatsapp ?? '')}`}>Ouvrir WhatsApp</a>}<button className="btn-ghost" onClick={() => setInv(null)}>Fermer</button></div>
          </>}
        </div>
      </Modal>}

      {importOpen && <Modal title={`Importer des ${kind}s`} subtitle="Copiez-collez depuis Excel / Google Sheets : une ligne par établissement, colonnes séparées par tabulation ou « ; »" onClose={() => setImportOpen(false)}>
        <div className="space-y-3"><p className="rounded-lg bg-stone-50 p-2 font-mono text-xs">Nom ; Adresse ; Ville ; Téléphone ; E-mail ; Contact</p><textarea className="input font-mono text-xs" rows={8} placeholder={"Chez Fatou ; 12 rue de Strasbourg ; Nantes ; 02 40 00 00 00 ; contact@chezfatou.fr ; Fatou Ndiaye"} value={csv} onChange={(e) => setCsv(e.target.value)} /><div className="flex justify-end"><button className="btn-primary" disabled={!csv.trim()} onClick={() => void doImport()}>Importer</button></div></div>
      </Modal>}
    </div>
  );
}

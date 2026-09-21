// Espace fournisseur (chantier 10) — /fournisseur : inscription, tableau de bord, catalogue, commandes, achats groupés, commissions.
// Volontairement simple et autonome : un grossiste doit pouvoir confirmer une commande depuis son téléphone en 2 taps.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Store, Package, Inbox, Users, Receipt, Check, X, Truck, LogOut, BarChart3, FileText, Scale, Tag, Star, Route } from 'lucide-react';
import { api, tokenStore, CATEGORY_LABEL, openPdf } from '../../lib/api';
import { Field } from '../../components/Modal';
import { CatalogImport, QuickPrice } from './CatalogImport';
import { InviteLanding } from './InviteLanding';
import { Analytics } from './Analytics';
import { Fulfillment } from './Fulfillment';
import { Propose } from './Propose';
import { VendorClaims } from './VendorClaims';
import { Pricing } from './Pricing';
import VendorReviews from './VendorReviews';
import { VendorRoutes } from './Routes';

type Vendor = { id: string; name: string; status: 'en_attente' | 'actif' | 'suspendu'; cgvUpToDate?: boolean; cgvVersion?: string | null; city: string | null; commissionPct: string; deliveryZones: string[]; minOrderEur: string; leadTimeHours: number };
type Tab = 'dashboard' | 'offers' | 'pricing' | 'reviews' | 'routes' | 'orders' | 'fulfillment' | 'claims' | 'groupbuys' | 'commissions' | 'analytics';
const eur = (v: number | string) => `${Number(v).toFixed(2).replace('.', ',')} €`;
const STATUS: Record<string, string> = { envoyee: '🕒 À confirmer', confirmee: '✅ Confirmée', livree: '📦 Livrée', livree_partiel: '📦 Livrée (écarts)', annulee: '❌ Refusée/annulée' };

export default function VendorSpace() {
  const nav = useNavigate(); const [sp] = useSearchParams(); const invite = sp.get('invite');
  const [me, setMe] = useState<{ vendors: Vendor[]; isAdmin: boolean } | null>(null); const [err, setErr] = useState<string | null>(null); const [tab, setTab] = useState<Tab>('orders');
  const load = () => api<{ vendors: Vendor[]; isAdmin: boolean }>('/vendor/me').then(setMe).catch((e) => { if ((e as { status?: number }).status === 401) nav('/connexion?next=/fournisseur'); else setErr((e as Error).message); });
  useEffect(() => { if (!tokenStore.get()) { if (!invite) nav('/connexion?next=/fournisseur'); return; } void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (invite && (!tokenStore.get() || (me && !me.vendors.length))) return <Shell><InviteLanding token={invite} onDone={load} /></Shell>;
  if (err) return <Shell><p className="text-red-700">{err}</p></Shell>;
  if (!me) return <Shell><p className="text-stone-500">Chargement…</p></Shell>;
  if (!me.vendors.length) return <Shell><Register onDone={load} /></Shell>;
  const v = me.vendors[0];
  return (
    <Shell vendor={v}>
      {v.cgvUpToDate === false && <div className="mb-4 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900"><p className="font-bold">📜 Nouvelles conditions générales fournisseur</p><p className="mt-1">Pour continuer à publier des offres et traiter des commandes, merci de lire et d’accepter la nouvelle version des <Link className="underline" to="/cgv-fournisseur" target="_blank">conditions fournisseur</Link>.</p><button className="btn-primary mt-2" onClick={async () => { await api('/vendor/accept-cgv', { method: 'POST', json: {} }); await load(); }}>J’accepte les conditions</button></div>}
      {v.status !== 'actif' && <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{v.status === 'en_attente' ? <>⏳ <b>Espace en cours de validation.</b> Vous pouvez déjà préparer votre catalogue ; les restaurants vous verront dès l’activation (sous 24 h ouvrées).</> : <>⛔ Espace suspendu — contactez bonjour@afrisupply.fr.</>}</div>}
      <nav className="mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-stone-100 p-1 text-sm font-semibold">
        {([['orders', Inbox, 'Commandes'], ['fulfillment', Truck, 'Préparation & livraison'], ['routes', Route, 'Tournées'], ['offers', Package, 'Catalogue'], ['pricing', Tag, 'Tarifs'], ['claims', Scale, 'Litiges'], ['reviews', Star, 'Avis'], ['analytics', BarChart3, 'Analyses'], ['groupbuys', Users, 'Achats groupés'], ['commissions', Receipt, 'Commissions'], ['dashboard', Store, 'Ma fiche']] as const).map(([k, Icon, l]) => <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 ${tab === k ? 'bg-white text-brand-800 shadow-sm' : 'text-stone-600'}`}><Icon size={16} /> {l}</button>)}
      </nav>
      {tab === 'orders' && <Orders />}{tab === 'fulfillment' && <Fulfillment />}{tab === 'claims' && <VendorClaims />}{tab === 'pricing' && <Pricing />}{tab === 'reviews' && <VendorReviews />}{tab === 'routes' && <VendorRoutes />}{tab === 'offers' && <Offers />}{tab === 'analytics' && <Analytics onAddOffer={(_id, name) => { sessionStorage.setItem('afs_vendor_prefill', name); setTab('offers'); }} />}{tab === 'groupbuys' && <GroupBuys />}{tab === 'commissions' && <Commissions />}{tab === 'dashboard' && <Dashboard />}
    </Shell>
  );
}

function Shell({ children, vendor }: { children: React.ReactNode; vendor?: Vendor }) {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3"><Link to="/" className="font-extrabold tracking-tight text-lg">AFRI<span className="text-brand-600">SUPPLY</span> <span className="ml-2 rounded-lg bg-stone-900 px-2 py-0.5 text-xs font-bold text-white">Fournisseur</span></Link>{vendor && <div className="flex items-center gap-3 text-sm"><span className="font-semibold">{vendor.name}</span><button className="btn-ghost !px-2" onClick={() => { tokenStore.clear(); nav('/'); }} aria-label="Déconnexion"><LogOut size={16} /></button></div>}</div></header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

function Register({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: '', description: '', city: '', deliveryZones: '', categories: [] as string[], leadTimeHours: '48', minOrderEur: '0', deliveryFeeEur: '0', acceptCgv: false, contactEmail: '', contactPhone: '', whatsapp: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const submit = async () => { setBusy(true); setErr(null); try { await api('/vendor/register', { method: 'POST', json: { ...f, deliveryZones: f.deliveryZones.split(/[,;]+/).map((s) => s.trim()).filter(Boolean), leadTimeHours: Number(f.leadTimeHours), minOrderEur: Number(f.minOrderEur), deliveryFeeEur: Number(f.deliveryFeeEur), contactEmail: f.contactEmail || undefined, contactPhone: f.contactPhone || undefined, whatsapp: f.whatsapp || undefined, description: f.description || undefined, city: f.city || undefined } }); onDone(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div><h1 className="text-3xl font-extrabold">Vendez aux restaurants africains de votre zone</h1><p className="mt-2 text-stone-600">Les restaurants AFRISUPPLY voient votre catalogue, comparent vos prix et vous commandent en un clic. Vous confirmez, vous livrez. <b>Aucun abonnement</b> : commission de 3 % sur les commandes confirmées, facturée en fin de mois.</p></div>
      <div className="card space-y-3">
        <Field label="Nom de l’entreprise *"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Présentation" hint="Ce que vous vendez, vos points forts (2 lignes)"><textarea className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Ville / entrepôt"><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field><Field label="Zones livrées" hint="Villes ou départements séparés par des virgules, ou « France »"><input className="input" placeholder="Nantes, 44, 49, Rennes" value={f.deliveryZones} onChange={(e) => setF({ ...f, deliveryZones: e.target.value })} /></Field></div>
        <Field label="Catégories"><div className="flex flex-wrap gap-1.5">{Object.entries(CATEGORY_LABEL).map(([k, l]) => <button type="button" key={k} onClick={() => setF({ ...f, categories: f.categories.includes(k) ? f.categories.filter((x) => x !== k) : [...f.categories, k] })} className={`pill !px-3 !py-1.5 ${f.categories.includes(k) ? 'bg-brand-700 text-white' : 'bg-stone-100 text-stone-700'}`}>{l}</button>)}</div></Field>
        <div className="grid gap-3 sm:grid-cols-3"><Field label="Délai de livraison (h)"><input className="input" type="number" value={f.leadTimeHours} onChange={(e) => setF({ ...f, leadTimeHours: e.target.value })} /></Field><Field label="Minimum de commande (€)"><input className="input" type="number" value={f.minOrderEur} onChange={(e) => setF({ ...f, minOrderEur: e.target.value })} /></Field><Field label="Frais de port (€)"><input className="input" type="number" value={f.deliveryFeeEur} onChange={(e) => setF({ ...f, deliveryFeeEur: e.target.value })} /></Field></div>
        <div className="grid gap-3 sm:grid-cols-3"><Field label="E-mail commandes"><input className="input" type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} /></Field><Field label="Téléphone"><input className="input" value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} /></Field><Field label="WhatsApp"><input className="input" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></Field></div>
        <label className="flex items-start gap-2 rounded-xl bg-stone-50 p-3 text-sm"><input type="checkbox" className="mt-0.5" checked={f.acceptCgv} onChange={(e) => setF({ ...f, acceptCgv: e.target.checked })} /><span>J’ai lu et j’accepte les <Link className="font-semibold underline" to="/cgv-fournisseur" target="_blank">conditions générales fournisseur</Link> : confirmation des commandes sous 24 h, facturation et encaissement directs auprès du restaurant, commission de 2 à 5 % HT sur les commandes confirmées via la plateforme.</span></label>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button className="btn-primary w-full !py-3" disabled={busy || f.name.length < 2 || !f.acceptCgv} onClick={() => void submit()}>Créer mon espace fournisseur</button>
        <p className="text-center text-xs text-stone-500">Validation manuelle sous 24 h ouvrées.</p>
      </div>
    </div>
  );
}

function Dashboard() {
  const [d, setD] = useState<{ vendor: Vendor & { description: string | null; deliveryFeeEur: string; contactEmail: string | null; contactPhone: string | null; whatsapp: string | null }; stats: Record<string, number> } | null>(null);
  const [zones, setZones] = useState(''); const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { api<typeof d>('/vendor/dashboard').then((r) => { setD(r); setZones(r!.vendor.deliveryZones.join(', ')); }); }, []);
  if (!d) return <p className="text-stone-500">Chargement…</p>;
  const s = d.stats; const v = d.vendor;
  const save = async () => { await api('/vendor/profile', { method: 'PUT', json: { description: v.description, city: v.city, deliveryZones: zones.split(/[,;]+/).map((x) => x.trim()).filter(Boolean), leadTimeHours: v.leadTimeHours, minOrderEur: Number(v.minOrderEur), deliveryFeeEur: Number(v.deliveryFeeEur), contactEmail: v.contactEmail, contactPhone: v.contactPhone, whatsapp: v.whatsapp } }); setMsg('Fiche mise à jour.'); };
  const up = (k: string, val: unknown) => setD({ ...d, vendor: { ...v, [k]: val } });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[['À confirmer', s.pendingOrders], ['CA du mois', eur(s.monthRevenue)], ['Restaurants clients', s.restaurantsServed], ['Vous suivent', s.restaurantsFollowing], ['Produits au catalogue', s.offers], ['Commission du mois', `${eur(s.commissionThisMonth)} (${s.commissionPct} %)`]].map(([l, val]) => <div key={String(l)} className="card"><p className="text-xs uppercase text-stone-500">{l}</p><p className="mt-1 text-2xl font-extrabold">{val}</p></div>)}</div>
      <div className="card space-y-3"><h2 className="font-bold">Ma fiche</h2>{msg && <p className="text-sm text-emerald-700">{msg}</p>}
        <Field label="Présentation"><textarea className="input" rows={2} value={v.description ?? ''} onChange={(e) => up('description', e.target.value)} /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Ville"><input className="input" value={v.city ?? ''} onChange={(e) => up('city', e.target.value)} /></Field><Field label="Zones livrées"><input className="input" value={zones} onChange={(e) => setZones(e.target.value)} /></Field></div>
        <div className="grid gap-3 sm:grid-cols-3"><Field label="Délai (h)"><input className="input" type="number" value={v.leadTimeHours} onChange={(e) => up('leadTimeHours', Number(e.target.value))} /></Field><Field label="Minimum (€)"><input className="input" type="number" value={v.minOrderEur} onChange={(e) => up('minOrderEur', e.target.value)} /></Field><Field label="Port (€)"><input className="input" type="number" value={v.deliveryFeeEur} onChange={(e) => up('deliveryFeeEur', e.target.value)} /></Field></div>
        <div className="grid gap-3 sm:grid-cols-3"><Field label="E-mail commandes"><input className="input" value={v.contactEmail ?? ''} onChange={(e) => up('contactEmail', e.target.value)} /></Field><Field label="Téléphone"><input className="input" value={v.contactPhone ?? ''} onChange={(e) => up('contactPhone', e.target.value)} /></Field><Field label="WhatsApp"><input className="input" value={v.whatsapp ?? ''} onChange={(e) => up('whatsapp', e.target.value)} /></Field></div>
        <div className="flex justify-end"><button className="btn-primary" onClick={() => void save()}>Enregistrer</button></div></div>
    </div>
  );
}

type Offer = { id: string; productName: string; category: string; unit: string; packLabel: string; packQty: string; packPriceEur: string; unitPrice: number; inStock: boolean };
function Offers() {
  const [offers, setOffers] = useState<Offer[]>([]); const [q, setQ] = useState(() => { const p = sessionStorage.getItem('afs_vendor_prefill') ?? ''; sessionStorage.removeItem('afs_vendor_prefill'); return p; }); const [cands, setCands] = useState<{ id: string; name: string; baseUnit: string }[]>([]); const [sel, setSel] = useState<{ id: string; name: string; baseUnit: string } | null>(null);
  const [f, setF] = useState({ packLabel: '', packQty: '', packPrice: '' }); const [msg, setMsg] = useState<string | null>(null);
  const load = () => api<{ offers: Offer[] }>('/vendor/offers').then((r) => setOffers(r.offers));
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (q.length < 2) { setCands([]); return; } const t = setTimeout(() => api<{ products: { id: string; name: string; baseUnit: string }[] }>(`/public/reference?q=${encodeURIComponent(q)}`).then((r) => setCands(r.products.slice(0, 8))).catch(() => setCands([])), 200); return () => clearTimeout(t); }, [q]);
  const add = async () => { if (!sel) return; const r = await api<{ propagatedTo: number }>('/vendor/offers', { method: 'POST', json: { productId: sel.id, packLabel: f.packLabel, packQty: Number(f.packQty), packPrice: Number(f.packPrice) } }); setMsg(`Offre enregistrée${r.propagatedTo ? ` · prix mis à jour chez ${r.propagatedTo} restaurant(s)` : ''}.`); setSel(null); setQ(''); setF({ packLabel: '', packQty: '', packPrice: '' }); void load(); };
  const toggle = async (o: Offer) => { await api('/vendor/offers', { method: 'POST', json: { productId: (o as unknown as { productId: string }).productId, packLabel: o.packLabel, packQty: Number(o.packQty), packPrice: Number(o.packPriceEur), inStock: !o.inStock } }); void load(); };
  return (
    <div className="space-y-4">
      {msg && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-900">{msg}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3"><h2 className="font-bold">Ajouter un produit</h2>
          {!sel ? <><input className="input" placeholder="Rechercher dans le référentiel (riz brisé, huile de palme, attiéké…)" value={q} onChange={(e) => setQ(e.target.value)} />{cands.length > 0 && <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">{cands.map((c) => <li key={c.id}><button className="w-full px-3 py-2 text-left text-sm hover:bg-stone-50" onClick={() => setSel(c)}>{c.name} <span className="text-stone-400">({c.baseUnit})</span></button></li>)}</ul>}</>
            : <><p className="font-semibold">{sel.name} <button className="ml-2 text-xs text-stone-500 underline" onClick={() => setSel(null)}>changer</button></p><div className="grid grid-cols-3 gap-2"><input className="input" placeholder="Sac 25 kg" value={f.packLabel} onChange={(e) => setF({ ...f, packLabel: e.target.value })} /><input className="input" type="number" placeholder={`Qté (${sel.baseUnit})`} value={f.packQty} onChange={(e) => setF({ ...f, packQty: e.target.value })} /><input className="input" type="number" step="0.01" placeholder="Prix € TTC" value={f.packPrice} onChange={(e) => setF({ ...f, packPrice: e.target.value })} /></div><button className="btn-primary w-full" disabled={!f.packLabel || !f.packQty || !f.packPrice} onClick={() => void add()}>Enregistrer</button></>}
        </div>
        <QuickPrice onDone={() => void load()} />
      </div>
      <CatalogImport onDone={() => void load()} />
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="p-3">Produit</th><th className="p-3">Conditionnement</th><th className="p-3 text-right">Prix</th><th className="p-3 text-right">€/unité</th><th className="p-3">Stock</th></tr></thead><tbody className="divide-y divide-stone-100">
        {offers.map((o) => <tr key={o.id}><td className="p-3 font-semibold">{o.productName}</td><td className="p-3">{o.packLabel}</td><td className="p-3 text-right">{eur(o.packPriceEur)}</td><td className="p-3 text-right text-stone-500">{o.unitPrice.toFixed(2)} €/{o.unit}</td><td className="p-3"><button onClick={() => void toggle(o)} className={`pill ${o.inStock ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-500'}`}>{o.inStock ? 'Disponible' : 'Rupture'}</button></td></tr>)}
        {!offers.length && <tr><td colSpan={5} className="p-6 text-center text-stone-500">Catalogue vide — ajoutez vos produits : les restaurants ne voient que ce qui est ici.</td></tr>}</tbody></table></div>
    </div>
  );
}

type VOrder = { id: string; reference: string; status: string; totalEur: string; expectedAt: string | null; createdAt: string; restaurantName: string; city: string | null; address: string | null; restaurantPhone?: string | null; whatsappLink?: string | null; fulfillment?: string | null; proposal?: { newTotalEur: number; note?: string } | null; notes: string | null; vendorNote: string | null; lines: { id: string; productName: string; packLabel: string | null; packs: number; quantity: string; unit: string; lineTotalEur: string }[] };
function Orders() {
  const [orders, setOrders] = useState<VOrder[]>([]); const [filter, setFilter] = useState<'envoyee' | 'confirmee' | ''>('envoyee'); const [reason, setReason] = useState<Record<string, string>>({}); const [date, setDate] = useState<Record<string, string>>({});
  const load = () => api<{ orders: VOrder[] }>(`/vendor/orders${filter ? `?status=${filter}` : ''}`).then((r) => setOrders(r.orders));
  useEffect(() => { void load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const [proposing, setProposing] = useState<string | null>(null);
  const act = async (id: string, a: 'confirm' | 'refuse') => { await api(`/vendor/orders/${id}/${a}`, { method: 'POST', json: a === 'confirm' ? { expectedAt: date[id] || undefined } : a === 'refuse' ? { reason: reason[id] || 'Indisponible' } : {} }); void load(); };
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 text-sm">{([['envoyee', 'À confirmer'], ['confirmee', 'Confirmées'], ['', 'Toutes']] as const).map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={`pill !px-3 !py-1.5 ${filter === k ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`}>{l}</button>)}</div>
      {!orders.length && <div className="card text-center text-stone-500">Aucune commande {filter === 'envoyee' ? 'en attente' : ''}. Les restaurants de votre zone vous trouvent dans leur Marketplace.</div>}
      {orders.map((o) => (
        <div key={o.id} className="card space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{o.restaurantName} <span className="ml-2 text-xs font-normal text-stone-500">{o.city}{o.address ? ` · ${o.address}` : ''}</span>{o.whatsappLink && <a href={o.whatsappLink} target="_blank" rel="noreferrer" className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100" title={o.restaurantPhone ?? ''}>💬 WhatsApp</a>}</p><p className="text-xs text-stone-500">{o.reference} · {new Date(o.createdAt).toLocaleString('fr-FR')} · {STATUS[o.status] ?? o.status}</p></div><p className="text-xl font-extrabold">{eur(o.totalEur)}</p></div>
          <ul className="text-sm">{o.lines.map((l) => <li key={l.id} className="flex justify-between border-t border-stone-100 py-1"><span>{l.packs} × {l.packLabel ?? l.productName} <span className="text-stone-400">({Number(l.quantity)} {l.unit})</span></span><span>{eur(l.lineTotalEur)}</span></li>)}</ul>
          {o.notes && <p className="rounded-lg bg-stone-50 p-2 text-sm">💬 {o.notes}</p>}{o.vendorNote && <p className="text-xs text-stone-500">Votre note : {o.vendorNote}</p>}
          {o.status === 'envoyee' && o.proposal && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">✏️ Proposition envoyée (nouveau total {Number(o.proposal.newTotalEur).toFixed(2).replace('.', ',')} €) — en attente de la réponse du restaurant.</p>}
          {o.status === 'envoyee' && proposing === o.id && <Propose orderId={o.id} lines={o.lines} onDone={() => { setProposing(null); void load(); }} onCancel={() => setProposing(null)} />}
          {o.status === 'envoyee' && proposing !== o.id && !o.proposal && <button className="btn-ghost text-amber-800" onClick={() => setProposing(o.id)}>✏️ Rupture partielle / substitution</button>}
          {o.status === 'envoyee' && <div className="flex flex-wrap items-end gap-2"><Field label="Livraison le"><input type="date" className="input" value={date[o.id] ?? o.expectedAt ?? ''} onChange={(e) => setDate({ ...date, [o.id]: e.target.value })} /></Field><button className="btn-primary !py-3" onClick={() => void act(o.id, 'confirm')}><Check size={18} /> Confirmer</button><div className="flex items-end gap-1"><input className="input" placeholder="Motif de refus" value={reason[o.id] ?? ''} onChange={(e) => setReason({ ...reason, [o.id]: e.target.value })} /><button className="btn-ghost !text-red-700" onClick={() => void act(o.id, 'refuse')}><X size={16} /> Refuser</button></div></div>}
          <div className="flex flex-wrap gap-2">{o.status === 'confirmee' && <span className="pill bg-stone-100 text-stone-700">{({ en_preparation: '🧺 En préparation', en_livraison: '🚚 En livraison', livree: '📦 Livrée' } as Record<string, string>)[o.fulfillment ?? ''] ?? '⏳ À préparer'} → onglet Préparation & livraison</span>}
          {o.status !== 'annulee' && <><button className="btn-ghost" onClick={() => void openPdf(`/vendor/orders/${o.id}/pdf`)}><FileText size={16} /> Bon de commande PDF</button><button className="btn-ghost" onClick={() => void openPdf(`/vendor/orders/${o.id}/pdf?type=livraison`)}><FileText size={16} /> Bon de livraison PDF</button></>}</div>
        </div>))}
    </div>
  );
}

type GB = { id: string; title: string; zone: string; targetPacks: number; discountPct: string; closesAt: string; status: string; committedPacks: number; participants: { restaurantName: string; city: string | null; packs: number }[] };
function GroupBuys() {
  const [list, setList] = useState<GB[]>([]); const [offers, setOffers] = useState<Offer[]>([]); const [f, setF] = useState({ vendorOfferId: '', zone: '', targetPacks: '20', discountPct: '10', closesInDays: '7' }); const [msg, setMsg] = useState<string | null>(null);
  const load = () => api<{ groupBuys: GB[] }>('/vendor/group-buys').then((r) => setList(r.groupBuys));
  useEffect(() => { void load(); api<{ offers: Offer[] }>('/vendor/offers').then((r) => setOffers(r.offers)); }, []);
  const create = async () => { await api('/vendor/group-buys', { method: 'POST', json: { ...f, targetPacks: Number(f.targetPacks), discountPct: Number(f.discountPct), closesInDays: Number(f.closesInDays) } }); setMsg('Achat groupé ouvert : les restaurants de la zone le voient dans leur Marketplace.'); void load(); };
  const close = async (id: string) => { const r = await api<{ status: string; ordersCreated?: number; committed: number }>(`/vendor/group-buys/${id}/close`, { method: 'POST' }); setMsg(r.status === 'cloture' ? `🎉 Palier atteint : ${r.ordersCreated} commandes confirmées créées.` : `Palier non atteint (${r.committed} colis) : achat groupé annulé, personne n’est engagé.`); void load(); };
  return (
    <div className="space-y-4">
      <div className="card space-y-3"><h2 className="font-bold">Proposer un achat groupé</h2><p className="text-sm text-stone-600">Vous fixez un palier de volume et une remise ; les restaurants de la zone s’engagent ; à la clôture, si le palier est atteint, une commande confirmée est créée pour chacun — une tournée, un prix.</p>{msg && <p className="text-sm text-brand-900">{msg}</p>}
        <div className="grid gap-2 sm:grid-cols-5"><select className="input sm:col-span-2" value={f.vendorOfferId} onChange={(e) => setF({ ...f, vendorOfferId: e.target.value })}><option value="">Produit…</option>{offers.map((o) => <option key={o.id} value={o.id}>{o.productName} — {o.packLabel} ({eur(o.packPriceEur)})</option>)}</select><input className="input" placeholder="Zone (Nantes, 44…)" value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })} /><input className="input" type="number" placeholder="Palier (colis)" value={f.targetPacks} onChange={(e) => setF({ ...f, targetPacks: e.target.value })} /><input className="input" type="number" placeholder="Remise %" value={f.discountPct} onChange={(e) => setF({ ...f, discountPct: e.target.value })} /></div>
        <div className="flex items-center gap-2"><span className="text-sm text-stone-500">Ouvert pendant</span><input className="input w-20" type="number" value={f.closesInDays} onChange={(e) => setF({ ...f, closesInDays: e.target.value })} /><span className="text-sm text-stone-500">jours</span><button className="btn-primary ml-auto" disabled={!f.vendorOfferId || !f.zone} onClick={() => void create()}>Ouvrir</button></div></div>
      {list.map((g) => <div key={g.id} className="card space-y-2"><div className="flex items-start justify-between"><div><p className="font-bold">{g.title}</p><p className="text-xs text-stone-500">Zone {g.zone} · clôture {new Date(g.closesAt).toLocaleDateString('fr-FR')} · {g.status}</p></div><p className="font-extrabold">{g.committedPacks}/{g.targetPacks}</p></div>
        <div className="h-2 w-full rounded-full bg-stone-100"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.min(100, (g.committedPacks / g.targetPacks) * 100)}%` }} /></div>
        {g.participants.length > 0 && <p className="text-sm text-stone-600">{g.participants.map((p) => `${p.restaurantName} (${p.packs})`).join(' · ')}</p>}
        {['ouvert', 'atteint'].includes(g.status) && <button className="btn-ghost" onClick={() => void close(g.id)}>Clôturer maintenant</button>}</div>)}
    </div>
  );
}

function Commissions() {
  const [p, setP] = useState<{ period: string; orders: number; base: number; amount: number; invoiced: boolean }[]>([]);
  useEffect(() => { api<{ periods: typeof p }>('/vendor/commissions').then((r) => setP(r.periods)); }, []);
  return (
    <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="p-3">Mois</th><th className="p-3 text-right">Commandes confirmées</th><th className="p-3 text-right">Chiffre d’affaires</th><th className="p-3 text-right">Commission</th><th className="p-3">Facture</th></tr></thead><tbody className="divide-y divide-stone-100">
      {p.map((r) => <tr key={r.period}><td className="p-3 font-semibold">{r.period}</td><td className="p-3 text-right">{r.orders}</td><td className="p-3 text-right">{eur(r.base)}</td><td className="p-3 text-right font-bold">{eur(r.amount)}</td><td className="p-3">{r.invoiced ? 'Émise' : 'En fin de mois'}</td></tr>)}
      {!p.length && <tr><td colSpan={5} className="p-6 text-center text-stone-500">Aucune commission : la première commande confirmée apparaîtra ici. Vous ne payez que sur ce que vous vendez.</td></tr>}</tbody></table></div>
  );
}

// Panier public → connexion/inscription si besoin → une commande marketplace par grossiste.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, ShoppingCart, LogIn, UserPlus } from 'lucide-react';
import { cart, useCart } from '../../lib/cart';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;

export default function Cart() {
  const { lines, total, byVendor } = useCart(); const { user } = useAuth(); const nav = useNavigate();
  const [busy, setBusy] = useState(false); const [msgs, setMsgs] = useState<string[]>([]); const [err, setErr] = useState<string | null>(null);
  const order = async () => {
    setBusy(true); setErr(null); const out: string[] = [];
    try { for (const g of byVendor) { const r = await api<{ message: string }>(`/marketplace/vendors/${g.vendorId}/orders`, { method: 'POST', json: { lines: g.lines.map((l) => ({ vendorOfferId: l.offerId, packs: l.packs })), source: 'vitrine' } }); out.push(r.message); g.lines.forEach((l) => cart.remove(l.offerId)); } setMsgs(out); }
    catch (e) { setErr((e as Error).message); setMsgs(out); } finally { setBusy(false); }
  };
  if (msgs.length && !lines.length) return <div className="mx-auto max-w-2xl px-4 py-16 text-center"><p className="text-5xl">🎉</p><h1 className="mt-3 text-2xl font-extrabold">Commande envoyée</h1>{msgs.map((m, i) => <p key={i} className="mt-2 text-stone-600">{m}</p>)}<div className="mt-6 flex justify-center gap-3"><Link to="/app/achats" className="btn-primary">Suivre mes commandes</Link><Link to="/catalogue" className="btn-ghost">Continuer mes achats</Link></div></div>;
  if (!lines.length) return <div className="mx-auto max-w-2xl px-4 py-16 text-center"><ShoppingCart className="mx-auto text-stone-300" size={48} /><h1 className="mt-3 text-2xl font-extrabold">Votre panier est vide</h1><p className="mt-2 text-stone-500">Parcourez le catalogue : plus de 300 produits africains aux prix grossistes.</p><Link to="/catalogue" className="btn-primary mt-6 inline-flex">Voir le catalogue</Link></div>;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <h1 className="text-2xl font-extrabold">Mon panier</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">{byVendor.map((g) => <div key={g.vendorId} className="card space-y-3 !p-0">
          <div className="flex items-center justify-between border-b border-stone-100 p-4"><p className="font-bold">{g.vendorName}</p><p className="text-sm">{eur(g.total)}{g.total < g.minOrderEur && <span className="ml-2 text-amber-700">· minimum {eur(g.minOrderEur)}</span>}</p></div>
          {g.lines.map((l) => <div key={l.offerId} className="flex items-center gap-3 px-4 pb-3"><div className="flex-1"><Link to={`/produit/${l.productId}`} className="font-semibold hover:text-brand-700">{l.productName}</Link><p className="text-xs text-stone-500">{l.packLabel} · {eur(l.packPriceEur)} le colis</p></div><input type="number" min={0} className="input w-16 text-center" value={l.packs} onChange={(e) => cart.setPacks(l.offerId, Number(e.target.value))} /><p className="w-24 text-right font-bold">{eur(l.packPriceEur * l.packs)}</p><button onClick={() => cart.remove(l.offerId)} className="text-stone-400 hover:text-red-600"><Trash2 size={16} /></button></div>)}
        </div>)}</div>
        <aside className="card h-fit space-y-3">
          <div className="flex justify-between text-lg"><span>Total HT</span><b>{eur(total)}</b></div>
          <p className="text-xs text-stone-500">{byVendor.length} grossiste{byVendor.length > 1 ? 's' : ''} · {byVendor.length > 1 ? 'une commande par grossiste' : 'une commande'} · frais de port selon grossiste</p>
          {err && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}
          {user ? <button className="btn-primary w-full justify-center" disabled={busy || byVendor.some((g) => g.total < g.minOrderEur)} onClick={() => void order()}>{busy ? 'Envoi…' : 'Commander'}</button>
            : <><p className="text-sm">Un compte restaurant (gratuit) est nécessaire pour commander.</p><button className="btn-primary w-full justify-center" onClick={() => nav('/inscription?next=/panier')}><UserPlus size={16} /> Créer mon compte</button><button className="btn-ghost w-full justify-center" onClick={() => nav('/connexion?next=/panier')}><LogIn size={16} /> J’ai déjà un compte</button></>}
          {byVendor.some((g) => g.total < g.minOrderEur) && <p className="text-xs text-amber-700">Complétez le panier pour atteindre le minimum de commande.</p>}
        </aside>
      </div>
    </div>
  );
}

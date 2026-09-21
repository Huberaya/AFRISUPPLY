import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { api, fmtEur, fmtQty } from '../lib/api';
import { PageTitle, Loader, ErrorBox, Empty, Stat } from '../components/ui';
import { Steps, FLOW_STEPS } from '../components/Steps';
import { useToast } from '../components/Feedback';

interface Offer { offerId: string; supplierId: string; supplierName: string; packLabel: string; packQty: number; packPrice: number; unitPrice: number; leadTimeHours: number; reliabilityPct: number }
interface Line { productId: string; productName: string; unit: string; neededQty: number; offer: Offer; packs: number; quantity: number; lineTotal: number; alternativeSaving: number; reason: string }
interface Sup { supplierId: string; supplierName: string; lines: Line[]; subtotal: number; deliveryFee: number; minOrder: number; belowMinimum: boolean; total: number; leadTimeHours: number }
interface Cart { suppliers: Sup[]; total: number; baselineTotal: number; saving: number; unavailable: { productId: string; productName: string; neededQty: number; unit: string }[]; notes: string[]; needsCount: number; horizonDays: number }

export default function SmartCart() {
  const { data, loading, error, reload } = useApi<Cart>('/smart-cart');
  const [packs, setPacks] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const nav = useNavigate();
  if (loading) return <Loader label="Construction du panier optimal…" />; if (error) return <ErrorBox message={error} onRetry={() => void reload()} />; if (!data) return null;
  const qty = (l: Line) => packs[l.offer.offerId] ?? l.packs;
  const supTotal = (s: Sup) => s.lines.reduce((a, l) => a + qty(l) * l.offer.packPrice, 0);
  const total = data.suppliers.reduce((a, s) => a + supTotal(s) + (supTotal(s) > 0 ? s.deliveryFee : 0), 0);
  const checkout = async () => {
    setBusy(true);
    try {
      const suppliers = data.suppliers.map((s) => ({ supplierId: s.supplierId, lines: s.lines.filter((l) => qty(l) > 0).map((l) => ({ offerId: l.offer.offerId, packs: qty(l) })) })).filter((s) => s.lines.length);
      await api<{ message: string }>('/smart-cart/checkout', { method: 'POST', json: { suppliers } });
      // Chantier 11 : on dit ce qui vient de se passer et ce qui reste a faire, puis on emmene
      // la personne a l'etape suivante (envoi au fournisseur), sans la laisser deviner.
      toast.success('Commandes préparées.', 'Étape suivante : envoyez le message au fournisseur par WhatsApp ou e-mail.');
      setTimeout(() => nav('/app/achats'), 900);
    } catch (e) { toast.error('Impossible de préparer les commandes', (e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="animate-fade-up space-y-6">
      <Steps steps={FLOW_STEPS} current={1} title="Où en suis-je ?" />
      <PageTitle title="🧺 Panier intelligent" subtitle={`Commande recommandée pour les ${data.horizonDays} prochains jours, répartie entre vos fournisseurs au meilleur coût total (prix + livraison + délai + fiabilité).`}
        action={<button className="btn-secondary" onClick={() => void reload()}><RefreshCw size={16} /> Recalculer</button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-6">
        <Stat label="Total panier" value={fmtEur(total)} hint={`${data.suppliers.length} fournisseur${data.suppliers.length > 1 ? 's' : ''}`} />
        <Stat label="Économie vs habitudes" value={fmtEur(data.saving)} tone={data.saving > 0 ? 'good' : 'default'} hint={`au lieu de ${fmtEur(data.baselineTotal)}`} />
        <Stat label="Produits couverts" value={`${data.needsCount - data.unavailable.length}/${data.needsCount}`} tone={data.unavailable.length ? 'warn' : 'good'} />
        <Stat label="Livraison la plus longue" value={data.suppliers.length ? `${Math.ceil(Math.max(...data.suppliers.map((s) => s.leadTimeHours)) / 24)} j` : '—'} />
      </div>
      {data.notes.length > 0 && <div className="card mb-4 text-sm text-stone-700 space-y-1">{data.notes.map((n, i) => <p key={i}>💡 {n}</p>)}</div>}
      {data.suppliers.length === 0 && <div className="card"><Empty>Rien à commander : vos stocks couvrent la prévision. <Link to="/app/stock/prevision" className="underline">Voir la prévision</Link>.</Empty></div>}
      <div className="space-y-4">
        {data.suppliers.map((s) => (
          <div key={s.supplierId} className="card p-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 bg-stone-50 px-4 py-3">
              <div><Link to={`/app/fournisseurs/${s.supplierId}`} className="font-semibold hover:underline">{s.supplierName}</Link><span className="ml-2 text-xs text-stone-500">Délai {Math.ceil(s.leadTimeHours / 24)} j · Livraison {s.deliveryFee ? fmtEur(s.deliveryFee) : 'offerte'}{s.minOrder ? ` · Minimum ${fmtEur(s.minOrder)}` : ''}</span></div>
              <div className="text-right"><div className="font-semibold">{fmtEur(supTotal(s) + s.deliveryFee)}</div>{supTotal(s) < s.minOrder && <div className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /> Sous le minimum de commande</div>}</div>
            </div>
            <table className="w-full text-sm"><tbody>
              {s.lines.map((l) => <tr key={l.offer.offerId} className="border-t border-stone-100">
                <td className="p-3"><div className="font-medium">{l.productName}</div><div className="text-xs text-stone-500">Besoin {fmtQty(l.neededQty, l.unit)} · {l.reason}{l.alternativeSaving > 0 && ` · économie ${fmtEur(l.alternativeSaving)}`}</div></td>
                <td className="p-3 text-stone-600 whitespace-nowrap">{l.offer.packLabel} · {fmtEur(l.offer.packPrice)}</td>
                <td className="p-3"><input type="number" min={0} className="input !w-20 text-right" value={qty(l)} onChange={(e) => setPacks({ ...packs, [l.offer.offerId]: Math.max(0, Number(e.target.value)) })} /></td>
                <td className="p-3 text-right font-medium whitespace-nowrap">{fmtEur(qty(l) * l.offer.packPrice)}</td>
              </tr>)}
            </tbody></table>
          </div>
        ))}
      </div>
      {data.unavailable.length > 0 && <div className="card mt-4 text-sm"><h3 className="font-semibold mb-1">Sans offre fournisseur</h3><p className="text-stone-600">{data.unavailable.map((u) => `${u.productName} (${fmtQty(u.neededQty, u.unit)})`).join(', ')}. Ajoutez une offre via <Link to="/app/import" className="underline">l’import CSV</Link> ou la fiche fournisseur.</p></div>}
      {data.suppliers.length > 0 && <div className="sticky bottom-4 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-lg">
        <div><div className="text-xs text-stone-500">Total avec livraison</div><div className="text-xl font-bold">{fmtEur(total)}</div></div>
        <button className="btn-primary" disabled={busy} onClick={() => void checkout()}><Check size={16} /> Préparer les commandes</button>
      </div>}
      <p className="mt-3 text-xs text-stone-500">Les commandes sont créées en statut « Préparée » : rien n’est envoyé aux fournisseurs sans votre validation dans Achats.</p>
    </div>
  );
}

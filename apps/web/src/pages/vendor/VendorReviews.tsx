// Chantier 27 — Onglet « Avis » de l'espace grossiste : indicateurs de fiabilité + réponse aux avis.
import { useState } from 'react';
import { useApi } from '../../lib/useApi';
import { api } from '../../lib/api';
import { Loader, ErrorBox, Empty } from '../../components/ui';
import { ReliabilityBadge, Stars, type Reliability } from '../../components/Reliability';

type Review = { id: string; rating: number; onTime: boolean | null; conform: boolean | null; comment: string | null; vendorReply: string | null; vendorRepliedAt: string | null; createdAt: string; restaurantName: string; orderReference: string };
const fmt = (d: string) => new Date(d).toLocaleDateString('fr-FR');

export default function VendorReviews() {
  const { data, loading, error, reload } = useApi<{ reliability: Reliability; reviews: Review[] }>('/vendor/reviews');
  const [replying, setReplying] = useState<string | null>(null); const [text, setText] = useState(''); const [err, setErr] = useState<string | null>(null);
  if (loading) return <Loader />; if (error || !data) return <ErrorBox message={error ?? 'Erreur'} onRetry={() => void reload()} />;
  const r = data.reliability;
  const send = async (id: string) => { setErr(null); try { await api(`/vendor/reviews/${id}/reply`, { method: 'POST', json: { reply: text } }); setReplying(null); setText(''); await reload(); } catch (e) { setErr((e as Error).message); } };
  const KPI = ({ l, v }: { l: string; v: string }) => <div className="card !p-3"><p className="text-xs text-stone-500">{l}</p><p className="text-xl font-extrabold">{v}</p></div>;
  return (
    <div className="space-y-4">
      <div className="card"><p className="mb-2 text-sm text-stone-500">Votre fiabilité vue par les restaurants (calculée sur les 90 derniers jours)</p><ReliabilityBadge r={r} detailed />
        <p className="mt-2 text-xs text-stone-500">Badge <b>Excellent</b> : note ≥ 4,5, ≥ 90 % à l'heure et ≥ 5 avis. <b>Fiable</b> : note ≥ 4 et ≥ 3 avis. <b>À surveiller</b> : note &lt; 3,5 ou &gt; 15 % de livraisons avec écart.</p></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><KPI l="Note moyenne" v={r.rating !== null ? `${r.rating.toFixed(1)} / 5` : '—'} /><KPI l="Livrées à l'heure" v={r.onTimePct !== null ? `${r.onTimePct} %` : '—'} /><KPI l="Commandes acceptées" v={r.acceptPct !== null ? `${r.acceptPct} %` : '—'} /><KPI l="Commandes 90 j" v={String(r.orders90d)} /></div>
      {data.reviews.length === 0 ? <Empty>Aucun avis pour l'instant — les restaurants peuvent vous noter après chaque livraison.</Empty> : data.reviews.map((x) => (
        <div key={x.id} className="card">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><Stars value={x.rating} size={16} /> <b className="ml-1">{x.restaurantName}</b> <span className="text-xs text-stone-500">· {x.orderReference} · {fmt(x.createdAt)}</span></div>
            <div className="flex gap-1.5 text-xs">{x.onTime !== null && <span className={`pill ${x.onTime ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{x.onTime ? 'À l\'heure' : 'En retard'}</span>}{x.conform !== null && <span className={`pill ${x.conform ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{x.conform ? 'Conforme' : 'Non conforme'}</span>}</div></div>
          {x.comment && <p className="mt-2 text-sm italic">« {x.comment} »</p>}
          {x.vendorReply ? <div className="mt-2 rounded-lg bg-stone-50 p-2 text-sm"><b>Votre réponse</b> ({x.vendorRepliedAt ? fmt(x.vendorRepliedAt) : ''}) : {x.vendorReply}</div>
            : replying === x.id ? <div className="mt-2 space-y-2"><textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Merci pour votre retour…" />{err && <p className="text-sm text-red-700">{err}</p>}<div className="flex gap-2"><button className="btn-primary !py-1.5" disabled={text.trim().length < 2} onClick={() => void send(x.id)}>Publier la réponse</button><button className="btn-ghost !py-1.5" onClick={() => setReplying(null)}>Annuler</button></div></div>
            : <button className="btn-ghost mt-2 !py-1.5 text-brand-800" onClick={() => { setReplying(x.id); setText(''); }}>Répondre publiquement</button>}
        </div>
      ))}
    </div>
  );
}

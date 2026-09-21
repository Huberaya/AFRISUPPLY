// Chantier 26 — Arbitrage des litiges escaladés.
import { useState } from 'react';
import { api, fmtEur } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { PageTitle, Loader, ErrorBox } from '../../components/ui';
import { Field } from '../../components/Modal';
import { CLAIM_STATUS, type Claim } from '../../components/Claims';

type AC = Claim & { restaurantName: string; vendorName: string; photo?: string | null };
export default function AdminClaims() {
  const { data, loading, error, reload } = useApi<{ items: AC[] }>('/admin/claims'); const [f, setF] = useState<Record<string, { resolution: 'avoir' | 'relivraison' | 'refus'; creditEur: string; message: string }>>({}); const [err, setErr] = useState<string | null>(null);
  if (loading) return <Loader />; if (error) return <ErrorBox message={error} />;
  const items = data?.items ?? []; const esc = items.filter((c) => c.status === 'escalade'); const stale = items.filter((c) => c.status === 'ouvert' && Date.now() - new Date(c.createdAt).getTime() > 48 * 3600_000);
  const arb = async (c: AC) => { const x = f[c.id] ?? { resolution: 'avoir', creditEur: c.claimedEur, message: '' }; try { await api(`/admin/claims/${c.id}/arbitrate`, { method: 'POST', json: { resolution: x.resolution, creditEur: x.resolution === 'avoir' ? Number(x.creditEur) : undefined, message: x.message } }); await reload(); } catch (e) { setErr((e as Error).message); } };
  const Row = ({ c, canArb }: { c: AC; canArb: boolean }) => { const [label, cls] = CLAIM_STATUS[c.status] ?? [c.status, '']; const x = f[c.id] ?? { resolution: 'avoir' as const, creditEur: c.claimedEur, message: '' }; return <div className="card space-y-2 text-sm">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{c.reference} — {c.productName} <span className="font-normal text-stone-500">· {c.kindLabel}</span></p><p className="text-xs text-stone-500">{c.restaurantName} ⇄ {c.vendorName} · {c.orderReference} · {new Date(c.createdAt).toLocaleString('fr-FR')} · réclamé <b>{fmtEur(Number(c.claimedEur))}</b>{c.creditEur && <> · proposé {fmtEur(Number(c.creditEur))}</>}</p></div><span className={`pill ${cls}`}>{label}</span></div>
    {c.message && <p className="rounded-lg bg-stone-50 p-2">Restaurant : {c.message}</p>}{c.vendorMessage && <p className="rounded-lg bg-stone-50 p-2">Grossiste : {c.vendorMessage}</p>}{c.photo && <img src={c.photo} alt="" className="max-h-40 rounded-xl" />}
    {canArb && <div className="flex flex-wrap items-end gap-2 rounded-xl border border-purple-200 bg-purple-50 p-3"><Field label="Décision"><select className="input" value={x.resolution} onChange={(e) => setF({ ...f, [c.id]: { ...x, resolution: e.target.value as 'avoir' } })}><option value="avoir">Avoir</option><option value="relivraison">Relivraison</option><option value="refus">Réclamation rejetée</option></select></Field>{x.resolution === 'avoir' && <Field label="Montant"><input type="number" step="0.01" className="input !w-28" value={x.creditEur} onChange={(e) => setF({ ...f, [c.id]: { ...x, creditEur: e.target.value } })} /></Field>}<Field label="Motivation (envoyée aux deux parties)"><input className="input !w-72" value={x.message} onChange={(e) => setF({ ...f, [c.id]: { ...x, message: e.target.value } })} /></Field><button className="btn-primary !bg-purple-700" disabled={x.message.length < 2} onClick={() => void arb(c)}>⚖️ Trancher</button></div>}
  </div>; };
  return (
    <div className="animate-fade-up space-y-6">
      <PageTitle title="⚖️ Litiges" subtitle="Arbitrage des litiges escaladés par les restaurants et relance des grossistes silencieux (> 48 h)." />
      {err && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      <section><h2 className="mb-2 font-bold">À arbitrer ({esc.length})</h2><div className="space-y-2">{esc.map((c) => <Row key={c.id} c={c} canArb />)}{!esc.length && <p className="text-sm text-stone-500">Rien à arbitrer.</p>}</div></section>
      <section><h2 className="mb-2 font-bold">Sans réponse du grossiste depuis 48 h ({stale.length})</h2><div className="space-y-2">{stale.map((c) => <Row key={c.id} c={c} canArb />)}{!stale.length && <p className="text-sm text-stone-500">Aucun.</p>}</div></section>
      <details className="card"><summary className="cursor-pointer font-bold">Tous les litiges ({items.length})</summary><div className="mt-3 space-y-2">{items.map((c) => <Row key={c.id} c={c} canArb={false} />)}</div></details>
    </div>
  );
}

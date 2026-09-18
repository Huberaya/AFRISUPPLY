// Chantier 7 — composants du programme pilote : checklist semaine 1, bouton retour/bug, question NPS, mesure d'usage.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, Circle, MessageSquareHeart, X } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';

type Step = { id: string; label: string; hint: string; to: string; done: boolean };
type CL = { steps: Step[]; done: number; total: number; pct: number; dayNumber: number; founder: boolean; dismissed: boolean };

export function OnboardingChecklist() {
  const { data, reload } = useApi<CL>('/onboarding/checklist'); const [hidden, setHidden] = useState(false);
  if (!data || data.dismissed || hidden || data.done === data.total) return null;
  const next = data.steps.find((s) => !s.done);
  return (
    <section className="card border-brand-200 bg-gradient-to-br from-brand-50 to-white">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-wide text-brand-700">Semaine 1 · jour {data.dayNumber}{data.founder ? ' · pilote fondateur' : ''}</p><h2 className="mt-1 text-lg font-bold">Vos 7 premiers pas — {data.done}/{data.total} faits</h2></div>
        <button className="text-stone-400 hover:text-stone-700" aria-label="Masquer" onClick={() => { setHidden(true); void api('/onboarding/checklist/_dismissed', { method: 'POST' }); }}><X size={18} /></button>
      </div>
      <div className="mt-3 h-2 w-full rounded-full bg-white"><div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${data.pct}%` }} /></div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">{data.steps.map((s) => (
        <li key={s.id} className={`flex items-start gap-2 rounded-xl p-2 text-sm ${s.done ? 'text-stone-400' : s.id === next?.id ? 'bg-white shadow-sm ring-1 ring-brand-200' : ''}`}>
          {s.done ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" /> : <button aria-label="Marquer comme fait" onClick={async () => { await api(`/onboarding/checklist/${s.id}`, { method: 'POST' }); reload(); }}><Circle size={18} className="mt-0.5 shrink-0 text-stone-300 hover:text-brand-600" /></button>}
          <div><Link to={s.to} className={s.done ? 'line-through' : 'font-semibold hover:underline'}>{s.label}</Link>{!s.done && <p className="text-xs text-stone-500">{s.hint}</p>}</div>
        </li>))}</ul>
      {next && <Link to={next.to} className="btn-primary mt-4">Étape suivante : {next.label} →</Link>}
    </section>
  );
}

/** Bouton flottant « Un avis, un bug ? » + question NPS quand elle est due (J+14, J+45). */
export function FeedbackWidget() {
  const loc = useLocation(); const [open, setOpen] = useState(false); const [kind, setKind] = useState<'bug' | 'idee' | 'question'>('idee'); const [msg, setMsg] = useState(''); const [sent, setSent] = useState<string | null>(null);
  const [nps, setNps] = useState<{ due: boolean } | null>(null); const [score, setScore] = useState<number | null>(null); const [npsMsg, setNpsMsg] = useState('');
  useEffect(() => { api<{ due: boolean }>('/feedback/nps-due').then(setNps).catch(() => null); }, []);
  const send = async () => { const r = await api<{ message: string }>('/feedback', { method: 'POST', json: { kind, message: msg, page: loc.pathname } }); setSent(r.message); setMsg(''); setTimeout(() => { setOpen(false); setSent(null); }, 2500); };
  const sendNps = async () => { await api('/feedback', { method: 'POST', json: { kind: 'nps', score, message: npsMsg || undefined, page: loc.pathname } }); setNps({ due: false }); };
  return (
    <>
      {nps?.due && <div className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white p-4 shadow-xl lg:bottom-6 lg:right-6 lg:left-auto">
        <div className="flex items-start justify-between"><p className="font-bold">Recommanderiez-vous AFRISUPPLY à un autre restaurateur ?</p><button aria-label="Plus tard" onClick={() => setNps({ due: false })}><X size={16} /></button></div>
        <div className="mt-3 flex flex-wrap gap-1">{Array.from({ length: 11 }, (_, i) => <button key={i} onClick={() => setScore(i)} className={`h-9 w-9 rounded-lg text-sm font-bold ${score === i ? 'bg-brand-600 text-white' : 'bg-stone-100 hover:bg-stone-200'}`}>{i}</button>)}</div>
        <div className="mt-1 flex justify-between text-[11px] text-stone-400"><span>Pas du tout</span><span>Absolument</span></div>
        {score !== null && <><textarea className="input mt-3" rows={2} placeholder={score <= 6 ? 'Qu’est-ce qui vous freine ? (franchement)' : 'Qu’est-ce qui vous plaît le plus ?'} value={npsMsg} onChange={(e) => setNpsMsg(e.target.value)} /><button className="btn-primary mt-2 w-full" onClick={() => void sendNps()}>Envoyer</button></>}
      </div>}
      <button onClick={() => setOpen(true)} className="fixed bottom-20 right-3 z-30 flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-stone-700 lg:bottom-6 lg:right-6"><MessageSquareHeart size={18} /> <span className="hidden sm:inline">Un avis, un bug ?</span></button>
      {open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={() => setOpen(false)}>
        <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between"><h2 className="text-lg font-bold">Dites-nous tout</h2><button aria-label="Fermer" onClick={() => setOpen(false)}><X size={18} /></button></div>
          <p className="text-sm text-stone-500">Vous êtes pilote : chaque retour change le produit. Réponse sous 24 h ouvrées.</p>
          <div className="mt-3 flex gap-1.5">{([['bug', '🐛 Un bug'], ['idee', '💡 Une idée'], ['question', '❓ Une question']] as const).map(([k, l]) => <button key={k} onClick={() => setKind(k)} className={`pill !px-3 !py-1.5 ${kind === k ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`}>{l}</button>)}</div>
          <textarea className="input mt-3" rows={4} autoFocus placeholder={kind === 'bug' ? 'Ce que vous faisiez, ce qui s’est passé…' : kind === 'idee' ? 'Ce qui vous ferait gagner du temps…' : 'Votre question…'} value={msg} onChange={(e) => setMsg(e.target.value)} />
          {sent ? <p className="mt-3 text-sm font-semibold text-emerald-700">✅ {sent}</p> : <button className="btn-primary mt-3 w-full" disabled={!msg.trim()} onClick={() => void send()}>Envoyer</button>}
        </div>
      </div>}
    </>
  );
}

/** Mesure d'usage : pages vues (par route) envoyées par lots de 10 ou toutes les 30 s. Aucun tiers, aucune donnée perso. */
const queue: { event: string; meta?: Record<string, unknown>; at: string }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
export function track(event: string, meta?: Record<string, unknown>) {
  queue.push({ event, meta, at: new Date().toISOString() });
  if (queue.length >= 10) void flush(); else if (!timer) timer = setTimeout(() => void flush(), 30_000);
}
async function flush() { if (timer) { clearTimeout(timer); timer = null; } if (!queue.length) return; const events = queue.splice(0, 50); try { await api('/usage', { method: 'POST', json: { events } }); } catch { /* silencieux */ } }
export function UsageBeacon() {
  const loc = useLocation();
  useEffect(() => { track(`page.${loc.pathname.replace(/\/[0-9a-f-]{36}/g, '/:id')}`); }, [loc.pathname]);
  useEffect(() => { const h = () => { if (document.visibilityState === 'hidden') void flush(); }; document.addEventListener('visibilitychange', h); return () => document.removeEventListener('visibilitychange', h); }, []);
  return null;
}

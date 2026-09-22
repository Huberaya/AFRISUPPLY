// Saisie express (chantier 9) — pensée pour le téléphone, en fin de service : une phrase, une confirmation, c'est fait.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Send, Camera, ClipboardList, Check, ChevronRight, RotateCcw } from 'lucide-react';
import { api } from '../lib/api';
import { PageTitle } from '../components/ui';

type Kind = 'vente' | 'comptage' | 'reception' | 'perte';
type Cand = { id: string; name: string; score: number };
type Line = { raw: string; qty: number; unit?: string; match: Cand | null; candidates: Cand[] };
type Parsed = { kind: Kind; lines: Line[]; unmatched: string[] };
const KIND_LABEL: Record<Kind, string> = { vente: 'Ventes du jour', comptage: 'Comptage du stock', reception: 'Réception', perte: 'Pertes' };
const KIND_EMOJI: Record<Kind, string> = { vente: '🍽️', comptage: '📦', reception: '🚚', perte: '🗑️' };
const EXAMPLES = ['vendu 40 mafé 25 yassa 12 thiep', 'reste 3 kg plantain, 2 sacs riz', 'reçu 25 kg riz 10 L huile', 'jeté 2 kg tilapia'];

type SR = { start: () => void; stop: () => void; lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null };
const getSR = (): (new () => SR) | null => (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition ?? null;

export default function Express() {
  const [tab, setTab] = useState<'phrase' | 'inventaire' | 'facture'>('phrase');
  return (
    <div className="animate-fade-up mx-auto max-w-xl space-y-4 pb-24">
      <PageTitle title="⚡ Saisie express" subtitle="Le soir, en 20 secondes, depuis votre téléphone." />
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1 text-xs sm:text-sm font-semibold">
        {([['phrase', 'Une phrase'], ['inventaire', 'Inventaire'], ['facture', 'Photo facture']] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-xl py-2 sm:py-2.5 touch-manipulation transition ${tab === k ? 'bg-white shadow-sm text-brand-800' : 'text-stone-600'}`}>{l}</button>)}
      </div>
      {tab === 'phrase' && <Phrase />}
      {tab === 'inventaire' && <Inventory />}
      {tab === 'facture' && <Invoice />}
    </div>
  );
}

// ---------------- Une phrase ----------------
function Phrase() {
  const [text, setText] = useState(''); const [kind, setKind] = useState<Kind | undefined>(); const [parsed, setParsed] = useState<Parsed | null>(null);
  const [choices, setChoices] = useState<Record<number, string>>({}); const [busy, setBusy] = useState(false); const [done, setDone] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [listening, setListening] = useState(false); const srRef = useRef<SR | null>(null);
  const canVoice = useMemo(() => !!getSR(), []);
  const parse = async (t = text) => { if (t.trim().length < 2) return; setBusy(true); setErr(null); setDone(null); try { setParsed(await api<Parsed>('/quick/parse', { method: 'POST', json: { text: t, kind } })); setChoices({}); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const listen = () => {
    const SRc = getSR(); if (!SRc) return;
    const r = new SRc(); r.lang = 'fr-FR'; r.interimResults = true; srRef.current = r;
    r.onresult = (e) => { const t = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript).join(' '); setText(t); };
    r.onend = () => { setListening(false); setText((t) => { void parse(t); return t; }); };
    setListening(true); r.start();
  };
  const lines = parsed?.lines.map((l, i) => ({ ...l, chosen: l.match ?? l.candidates.find((c) => c.id === choices[i]) ?? null })) ?? [];
  const ready = lines.filter((l) => l.chosen); const pending = lines.filter((l) => !l.chosen);
  const apply = async () => {
    if (!parsed || !ready.length) return; setBusy(true); setErr(null);
    try {
      const r = await api<{ applied: number; stockLinesUpdated?: number }>('/quick/apply', { method: 'POST', json: { kind: parsed.kind, lines: ready.map((l) => ({ id: l.chosen!.id, qty: l.qty })) } });
      setDone(`${KIND_EMOJI[parsed.kind]} ${r.applied} ligne${r.applied > 1 ? 's' : ''} enregistrée${r.applied > 1 ? 's' : ''}${r.stockLinesUpdated ? ` · stock mis à jour sur ${r.stockLinesUpdated} produits` : ''}.`);
      setParsed(null); setText('');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <div className="flex flex-wrap gap-1.5 text-xs">{(['vente', 'comptage', 'reception', 'perte'] as Kind[]).map((k) => <button key={k} onClick={() => setKind(kind === k ? undefined : k)} className={`pill !px-3 !py-1.5 ${kind === k ? 'bg-brand-700 text-white' : 'bg-stone-100 text-stone-700'}`}>{KIND_EMOJI[k]} {KIND_LABEL[k]}</button>)}<span className="self-center text-stone-400">{kind ? '' : '· détection automatique'}</span></div>
        <textarea className="input min-h-[88px] text-base" placeholder="Ex. : vendu 40 mafé 25 yassa 12 thiep" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void parse(); } }} />
        <div className="flex gap-2">
          {canVoice && <button className={`btn-ghost !px-3 ${listening ? 'animate-pulse !bg-red-50 !text-red-700' : ''}`} onClick={listening ? () => srRef.current?.stop() : listen} aria-label="Dicter"><Mic size={18} /> {listening ? 'Écoute…' : 'Dicter'}</button>}
          <button className="btn-primary flex-1 !py-3 text-base" disabled={busy || text.trim().length < 2} onClick={() => void parse()}><Send size={18} /> Comprendre</button>
        </div>
        {!parsed && !done && <div className="flex flex-wrap gap-1.5">{EXAMPLES.map((e) => <button key={e} className="rounded-lg bg-stone-50 px-2 py-1 text-xs text-stone-600 hover:bg-stone-100" onClick={() => { setText(e); void parse(e); }}>{e}</button>)}</div>}
      </div>
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      {done && <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900 flex items-start gap-3"><Check className="mt-0.5 shrink-0" /><div><p className="font-semibold">{done}</p><button className="mt-1 text-sm underline" onClick={() => setDone(null)}>Saisir autre chose</button></div></div>}
      {parsed && (
        <div className="card space-y-3">
          <p className="font-bold">{KIND_EMOJI[parsed.kind]} {KIND_LABEL[parsed.kind]} — {lines.length} ligne{lines.length > 1 ? 's' : ''}</p>
          <ul className="divide-y divide-stone-100">
            {lines.map((l, i) => (
              <li key={i} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><p className="truncate font-semibold">{l.chosen ? l.chosen.name : <span className="text-amber-700">« {l.raw} » — c’est quoi ?</span>}</p><p className="text-xs text-stone-500">{l.raw}</p></div>
                  <span className="shrink-0 rounded-lg bg-stone-100 px-2.5 py-1 text-sm font-bold">{l.qty} {parsed.kind === 'vente' ? 'portions' : (l.unit ?? '')}</span>
                </div>
                {!l.match && l.candidates.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{l.candidates.map((c) => <button key={c.id} onClick={() => setChoices({ ...choices, [i]: c.id })} className={`pill !px-3 !py-1.5 ${choices[i] === c.id ? 'bg-brand-700 text-white' : 'bg-amber-50 text-amber-900'}`}>{c.name}</button>)}<button onClick={() => { const cp = { ...choices }; delete cp[i]; setChoices(cp); }} className="pill !px-3 !py-1.5 bg-stone-100 text-stone-500">ignorer</button></div>}
                {!l.match && l.candidates.length === 0 && <p className="mt-1 text-xs text-stone-500">Aucun produit/plat proche. Ajoutez-le d’abord dans Stock ou Recettes.</p>}
              </li>
            ))}
          </ul>
          <div className="flex gap-2"><button className="btn-ghost" onClick={() => setParsed(null)}><RotateCcw size={16} /> Corriger</button><button className="btn-primary flex-1 !py-3 text-base" disabled={busy || !ready.length} onClick={() => void apply()}><Check size={18} /> Valider {ready.length}/{lines.length}{pending.length ? ` (ignorer ${pending.length})` : ''}</button></div>
        </div>
      )}
    </div>
  );
}

// ---------------- Inventaire rapide ----------------
type InvItem = { id: string; name: string; unit: string; quantity: number; criticalLevel: number; daysSinceCount: number | null };
function Inventory() {
  const [items, setItems] = useState<InvItem[]>([]); const [idx, setIdx] = useState(0); const [val, setVal] = useState(''); const [saved, setSaved] = useState(0); const [countedLast7, setCountedLast7] = useState(0); const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); const r = await api<{ items: InvItem[]; countedLast7Days: number }>('/quick/inventory'); setItems(r.items); setCountedLast7(r.countedLast7Days); setIdx(0); setLoading(false); };
  useEffect(() => { void load(); }, []);
  const cur = items[idx];
  useEffect(() => { setVal(cur ? String(cur.quantity) : ''); }, [cur]);
  const save = async (skip = false) => {
    if (cur && !skip && val !== '') { await api('/quick/apply', { method: 'POST', json: { kind: 'comptage', lines: [{ id: cur.id, qty: Number(val.replace(',', '.')) }] } }); setSaved((s) => s + 1); }
    setIdx((i) => i + 1);
  };
  if (loading) return <p className="text-stone-500">Chargement…</p>;
  if (!items.length) return <div className="card text-sm text-stone-600">Aucun produit suivi. Commencez par « Configurer ma carte ».</div>;
  if (!cur) return <div className="rounded-2xl bg-emerald-50 p-6 text-center text-emerald-900"><p className="text-3xl">🎉</p><p className="mt-2 font-bold">Inventaire terminé — {saved} produits comptés</p><button className="btn-ghost mt-3" onClick={() => void load()}>Recommencer</button></div>;
  const pct = Math.round((idx / items.length) * 100);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-stone-500"><span>{idx + 1} / {items.length} · {countedLast7} comptés cette semaine</span><span>{pct} %</span></div>
      <div className="h-1.5 w-full rounded-full bg-stone-200"><div className="h-1.5 rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} /></div>
      <div className="card text-center space-y-4">
        <p className="text-xs uppercase tracking-wide text-stone-400">{cur.daysSinceCount === null ? 'Jamais compté' : cur.daysSinceCount === 0 ? 'Compté aujourd’hui' : `Compté il y a ${cur.daysSinceCount} j`}</p>
        <h2 className="text-2xl font-extrabold">{cur.name}</h2>
        <p className="text-sm text-stone-500">Théorique : {cur.quantity} {cur.unit}{cur.criticalLevel ? ` · seuil ${cur.criticalLevel}` : ''}</p>
        <div className="flex items-center justify-center gap-3">
          <button className="h-14 w-14 rounded-2xl bg-stone-100 text-2xl font-bold" onClick={() => setVal((v) => String(Math.max(0, Number(v || 0) - 1)))}>−</button>
          <input inputMode="decimal" className="input h-16 w-36 text-center text-3xl font-extrabold" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} autoFocus />
          <button className="h-14 w-14 rounded-2xl bg-stone-100 text-2xl font-bold" onClick={() => setVal((v) => String(Number(v || 0) + 1))}>+</button>
        </div>
        <p className="text-sm text-stone-500">{cur.unit}</p>
        <div className="grid grid-cols-2 gap-2"><button className="btn-ghost !py-3" onClick={() => void save(true)}>Passer <ChevronRight size={16} /></button><button className="btn-primary !py-3 text-base" onClick={() => void save()}><Check size={18} /> OK</button></div>
      </div>
    </div>
  );
}

// ---------------- Photo de facture ----------------
type InvLine = { label: string; qty: number; unit?: string; unitPrice?: number; total?: number; match: Cand | null; candidates: Cand[] };
type InvResult = { supplierName: string | null; supplier: Cand | null; date: string | null; total: number | null; lines: InvLine[]; matched: number };
function Invoice() {
  const [img, setImg] = useState<string | null>(null); const [res, setRes] = useState<InvResult | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [done, setDone] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<number, string>>({}); const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]); const [supplierId, setSupplierId] = useState('');
  useEffect(() => { api<{ suppliers: { id: string; name: string }[] }>('/suppliers').then((r) => setSuppliers(r.suppliers)).catch(() => undefined); }, []);
  const onFile = (f: File | undefined) => {
    if (!f) return; const reader = new FileReader();
    reader.onload = () => { const imgEl = new Image(); imgEl.onload = () => { const max = 1600; const s = Math.min(1, max / Math.max(imgEl.width, imgEl.height)); const cv = document.createElement('canvas'); cv.width = imgEl.width * s; cv.height = imgEl.height * s; cv.getContext('2d')!.drawImage(imgEl, 0, 0, cv.width, cv.height); setImg(cv.toDataURL('image/jpeg', 0.82)); setRes(null); setDone(null); }; imgEl.src = reader.result as string; };
    reader.readAsDataURL(f);
  };
  const analyse = async () => { if (!img) return; setBusy(true); setErr(null); try { const r = await api<InvResult>('/quick/invoice', { method: 'POST', json: { image: img } }); setRes(r); setSupplierId(r.supplier?.id ?? ''); setChoices({}); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const lines = res?.lines.map((l, i) => ({ ...l, chosen: l.match ?? l.candidates.find((c) => c.id === choices[i]) ?? null })) ?? []; const ready = lines.filter((l) => l.chosen);
  const apply = async () => {
    if (!ready.length) return; setBusy(true); setErr(null);
    try { const r = await api<{ received: number; pricesUpdated: number }>('/quick/invoice/apply', { method: 'POST', json: { supplierId: supplierId || undefined, date: res?.date ?? undefined, lines: ready.map((l) => ({ inventoryItemId: l.chosen!.id, qty: l.qty, unitPrice: l.unitPrice && l.unitPrice > 0 ? l.unitPrice : undefined })) } }); setDone(`🚚 ${r.received} produits entrés en stock${r.pricesUpdated ? ` · ${r.pricesUpdated} prix fournisseur mis à jour` : ''}.`); setRes(null); setImg(null); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <p className="text-sm text-stone-600">Photographiez la facture ou le bon de livraison : les lignes sont lues, rapprochées de votre stock, et les prix de votre fournisseur se mettent à jour.</p>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 p-6 text-stone-600 hover:bg-stone-100">
          <Camera size={28} /><span className="font-semibold">{img ? 'Reprendre la photo' : 'Prendre / choisir une photo'}</span>
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {img && <img src={img} alt="Facture" className="max-h-64 w-full rounded-xl object-contain bg-stone-100" />}
        {img && !res && <button className="btn-primary w-full !py-3 text-base" disabled={busy} onClick={() => void analyse()}><ClipboardList size={18} /> {busy ? 'Lecture en cours…' : 'Lire la facture'}</button>}
      </div>
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      {done && <div className="rounded-2xl bg-emerald-50 p-4 font-semibold text-emerald-900">{done}</div>}
      {res && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between"><p className="font-bold">{res.lines.length} lignes lues · {res.matched} reconnues</p>{res.total != null && <span className="text-sm text-stone-500">Total {res.total.toFixed(2)} €</span>}</div>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Fournisseur : {res.supplierName ?? 'non lu'} — choisir…</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <ul className="divide-y divide-stone-100">{lines.map((l, i) => (
            <li key={i} className="py-2.5">
              <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{l.chosen ? l.chosen.name : <span className="text-amber-700">{l.label}</span>}</p><p className="text-xs text-stone-500">{l.label}{l.unitPrice ? ` · ${l.unitPrice.toFixed(2)} €/${l.unit ?? 'u'}` : ''}</p></div><span className="shrink-0 rounded-lg bg-stone-100 px-2.5 py-1 text-sm font-bold">{l.qty} {l.unit ?? ''}</span></div>
              {!l.match && l.candidates.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{l.candidates.map((c) => <button key={c.id} onClick={() => setChoices({ ...choices, [i]: c.id })} className={`pill !px-3 !py-1.5 ${choices[i] === c.id ? 'bg-brand-700 text-white' : 'bg-amber-50 text-amber-900'}`}>{c.name}</button>)}</div>}
            </li>))}</ul>
          <button className="btn-primary w-full !py-3 text-base" disabled={busy || !ready.length} onClick={() => void apply()}><Check size={18} /> Entrer {ready.length} produits en stock</button>
        </div>
      )}
    </div>
  );
}

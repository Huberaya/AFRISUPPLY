// Chantier 12 — Import de catalogue assisté : coller un tarif / fichier CSV-Excel / photo → relecture → publication.
// + « Prix express » : une ligne pour changer un prix ou passer un produit en rupture.
import { useRef, useState } from 'react';
import { Upload, Camera, FileSpreadsheet, ClipboardPaste, Check, AlertTriangle, Zap, X } from 'lucide-react';
import { api } from '../../lib/api';

type Cand = { id: string; name: string; baseUnit: string; score: number };
type Line = { raw: string; label: string; packLabel: string; packQty: number; packUnit: string; price: number; inStock: boolean; match: Cand | null; candidates: Cand[]; warning?: string; currentPrice: number | null; changePct: number | null };
const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;

export function QuickPrice({ onDone }: { onDone: () => void }) {
  const [t, setT] = useState(''); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState(false);
  const go = async () => { if (!t.trim()) return; try { const r = await api<{ message: string }>('/vendor/offers/quick', { method: 'POST', json: { text: t } }); setMsg(r.message); setErr(false); setT(''); onDone(); } catch (e) { setMsg((e as Error).message); setErr(true); } };
  return (
    <div className="card space-y-2 border-brand-100 bg-brand-50/40">
      <h2 className="flex items-center gap-2 font-bold"><Zap size={18} /> Prix express</h2>
      <p className="text-xs text-stone-600">Une ligne, comme un SMS : <code>riz brisé 25 kg 41</code> · <code>huile de palme 5 L 23,50</code> · <code>attiéké rupture</code> · <code>gombo dispo</code></p>
      <div className="flex gap-2"><input className="input flex-1" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void go()} placeholder="riz brisé 25 kg 41" /><button className="btn-primary" onClick={() => void go()}>Appliquer</button></div>
      {msg && <p className={`text-sm ${err ? 'text-red-700' : 'text-emerald-800'}`}>{msg}</p>}
    </div>
  );
}

export function CatalogImport({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState(''); const [lines, setLines] = useState<Line[] | null>(null); const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null); const [replaceMissing, setReplaceMissing] = useState(false);
  const [choice, setChoice] = useState<Record<number, string | null>>({}); const [skip, setSkip] = useState<Record<number, boolean>>({}); const [price, setPrice] = useState<Record<number, number>>({});
  const fileRef = useRef<HTMLInputElement>(null); const photoRef = useRef<HTMLInputElement>(null);

  const analyse = async (payload: { text?: string; image?: string }) => {
    setBusy(true); setMsg(null);
    try { const r = await api<{ lines: Line[]; source: string; matched: number; total: number; hint?: string }>('/vendor/catalog/parse', { method: 'POST', json: payload }); setLines(r.lines); setSource(r.source); setChoice({}); setSkip({}); setPrice({}); if (r.hint) setMsg(r.hint); else setMsg(`${r.matched}/${r.total} ligne(s) reconnue(s) automatiquement. Vérifiez, corrigez, puis publiez.`); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const onFile = async (f: File) => {
    const name = f.name.toLowerCase();
    // Chantier 2 (audit) : plus de bibliothèque Excel dans le navigateur (vulnérabilité HIGH sans correctif).
    // On lit le CSV — qu'Excel produit en deux clics — et on explique comment faire.
    if (/\.(xlsx|xls)$/.test(name)) {
      setMsg('Fichier Excel (.xlsx) : enregistrez-le d’abord en CSV — dans Excel : Fichier ▸ Enregistrer sous ▸ « CSV UTF-8 (délimité par des virgules) ». Le fichier CSV se lit ensuite en un clic, sans risque pour votre poste.');
      return;
    }
    const t = await f.text(); setText(t); void analyse({ text: t });
  };
  const onPhoto = (f: File) => { const rd = new FileReader(); rd.onload = () => void analyse({ image: String(rd.result) }); rd.readAsDataURL(f); };
  const pid = (i: number, l: Line) => (i in choice ? choice[i] : l.match?.id ?? null);
  const ready = (lines ?? []).map((l, i) => ({ l, i, p: pid(i, l) })).filter((x) => x.p && !skip[x.i]);
  const publish = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api<{ message: string }>('/vendor/catalog/apply', { method: 'POST', json: { replaceMissing, lines: ready.map(({ l, i, p }) => ({ productId: p, packLabel: l.packLabel, packQty: l.packQty, packPrice: price[i] ?? l.price, inStock: l.inStock })) } }); setMsg(r.message); setLines(null); setText(''); onDone(); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="flex items-center gap-2 font-bold"><Upload size={18} /> Importer mon tarif en 2 minutes</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <button className="btn-ghost justify-center" onClick={() => fileRef.current?.click()}><FileSpreadsheet size={16} /> Fichier CSV (Excel accepté)</button>
          <button className="btn-ghost justify-center" onClick={() => photoRef.current?.click()}><Camera size={16} /> Photo ou scan du tarif</button>
          <span className="flex items-center justify-center gap-1 text-sm text-stone-500"><ClipboardPaste size={16} /> …ou collez le texte ci-dessous</span>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
          <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
        </div>
        <textarea className="input min-h-[120px] font-mono text-xs" placeholder={'Riz brisé parfumé sac 25 kg 29,90\nHuile de palme rouge bidon 5 L 24,50\nAttiéké 1 kg x 10 32\nGombo frais carton 5 kg 19'} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2"><button className="btn-primary" disabled={busy || !text.trim()} onClick={() => void analyse({ text })}>{busy ? 'Analyse…' : 'Analyser'}</button><span className="text-xs text-stone-500">Formats acceptés : texte libre (produit, conditionnement, prix), colonnes séparées par ; ou tabulation, fichier CSV (Excel : Enregistrer sous ▸ CSV), photo (si l’IA est activée).</span></div>
        {msg && <p className="rounded-xl bg-stone-50 p-3 text-sm">{msg}</p>}
      </div>
      {lines && lines.length > 0 && (
        <div className="card space-y-3 p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-0"><p className="font-bold">Relecture ({source}) — {ready.length}/{lines.length} prêtes à publier</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={replaceMissing} onChange={(e) => setReplaceMissing(e.target.checked)} /> Passer en rupture mes produits absents de ce tarif</label></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="p-3">Ligne lue</th><th className="p-3">Produit du référentiel</th><th className="p-3">Conditionnement</th><th className="p-3 text-right">Prix</th><th className="p-3 text-right">Actuel</th><th className="p-3"></th></tr></thead>
            <tbody className="divide-y divide-stone-100">{lines.map((l, i) => { const p = pid(i, l); const off = skip[i]; return (
              <tr key={i} className={off ? 'opacity-40' : !p ? 'bg-amber-50/60' : ''}>
                <td className="p-3"><p className="font-medium">{l.label}</p><p className="text-xs text-stone-400">{l.raw}</p></td>
                <td className="p-3">{l.candidates.length ? <select className="input text-sm" value={p ?? ''} onChange={(e) => setChoice({ ...choice, [i]: e.target.value || null })}><option value="">— ne pas importer —</option>{l.candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.baseUnit}) {Math.round(c.score * 100)} %</option>)}</select> : <span className="text-amber-800"><AlertTriangle size={14} className="mr-1 inline" />Inconnu du référentiel</span>}{l.warning && <p className="mt-1 text-xs text-amber-700">{l.warning}</p>}</td>
                <td className="p-3">{l.packLabel} <span className="text-xs text-stone-400">({l.packQty} {l.packUnit})</span></td>
                <td className="p-3 text-right"><input type="number" step="0.01" className="input w-24 text-right" value={price[i] ?? l.price} onChange={(e) => setPrice({ ...price, [i]: Number(e.target.value) })} /></td>
                <td className="p-3 text-right text-xs">{l.currentPrice !== null ? <>{eur(l.currentPrice)}<br /><span className={l.changePct! > 0 ? 'text-red-700' : l.changePct! < 0 ? 'text-emerald-700' : 'text-stone-400'}>{l.changePct! > 0 ? '+' : ''}{l.changePct} %</span></> : <span className="text-stone-400">nouveau</span>}</td>
                <td className="p-3"><button className="text-stone-400 hover:text-stone-700" title={off ? 'Réactiver' : 'Ignorer'} onClick={() => setSkip({ ...skip, [i]: !off })}>{off ? <Check size={16} /> : <X size={16} />}</button></td>
              </tr>); })}</tbody></table></div>
          <div className="flex items-center justify-between gap-2 p-4 pt-0"><div className="text-xs text-stone-500">{lines.some((l) => !l.candidates.length) ? <>Produits inconnus : {lines.filter((l) => !l.candidates.length).map((l, i) => <button key={i} className="mr-1 underline" onClick={() => void api<{ message: string }>('/reference/request', { method: 'POST', json: { product: l.label, details: l.raw } }).then((r) => setMsg(r.message)).catch((e) => setMsg((e as Error).message))}>demander l’ajout de « {l.label} »</button>)} (créé sous 24 h, vous serez prévenu)</> : 'Toutes les lignes ont un candidat.'}</div><button className="btn-primary" disabled={busy || !ready.length} onClick={() => void publish()}><Check size={16} /> Publier {ready.length} offre(s)</button></div>
        </div>
      )}
    </div>
  );
}

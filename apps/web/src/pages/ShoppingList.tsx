// Liste de courses : « 10 kg piment, 5 kg riz » → produits retrouvés, prix comparés entre tous les fournisseurs, commande en un clic.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks, ShoppingCart, Sparkles, AlertTriangle, Mic, MicOff, Save, Trash2, RotateCcw, PackageOpen } from 'lucide-react';
import { api, fmtEur } from '../lib/api';
import { PageTitle, Empty } from '../components/ui';
import { useApi } from '../lib/useApi';

interface SavedList { id: string; name: string; text: string; useCount: number; lastUsedAt: string | null }
interface Suggestions { restock: { count: number; text: string }; last: { reference: string; text: string; date: string } | null }

/** Dictée vocale (Web Speech API, Chrome/Safari/Android). Retourne null si non supporté. */
type SpeechRec = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>>; resultIndex: number }) => void;
  onend: () => void; onerror: () => void; start: () => void; stop: () => void;
};
function useDictation(onText: (t: string) => void) {
  const recRef = useRef<{ stop: () => void } | null>(null); const [on, setOn] = useState(false);
  const w = typeof window !== 'undefined' ? (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }) : {};
  const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  const toggle = () => {
    if (!SR) return;
    if (on) { recRef.current?.stop(); setOn(false); return; }
    const rec = new SR(); rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => { const t = Array.from(e.results).slice(e.resultIndex).map((r) => r[0].transcript).join(' ').trim(); if (t) onText(t.replace(/\s+(virgule|et puis|ensuite|puis)\s+/gi, ', ')); };
    rec.onend = () => setOn(false); rec.onerror = () => setOn(false);
    recRef.current = rec; rec.start(); setOn(true);
  };
  useEffect(() => () => recRef.current?.stop(), []);
  return { supported: !!SR, on, toggle };
}

interface Offer { key: string; kind: 'vendor' | 'supplier'; offerId: string; sellerId: string; sellerName: string; packLabel: string; packQty: number; packPrice: number; unitPrice: number; leadTimeHours: number; minOrderEur: number; deliveryFeeEur: number; packs: number; lineTotal: number; linked: boolean }
interface Line { raw: string; qty: number; unit?: string; neededQty?: number; product: { id: string; name: string; unit: string; tracked: boolean } | null; candidates: { id: string; name: string; score: number }[]; offers: Offer[]; selected: string | null; savingPct?: number; note?: string }
interface Parsed { lines: Line[]; unmatched: string[]; sellers?: { vendors: number; suppliers: number }; hint?: string }

const EXAMPLE = '10 kg de piment, 5 kg de riz, 2 cartons de poisson fumé, 3 bidons huile de palme';

export default function ShoppingList() {
  const [text, setText] = useState(''); const [data, setData] = useState<Parsed | null>(null);
  const [sel, setSel] = useState<Record<number, string | null>>({}); const [packs, setPacks] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null); const nav = useNavigate();
  const lists = useApi<{ lists: SavedList[] }>('/shopping/lists'); const sugg = useApi<Suggestions>('/shopping/suggestions');
  const dict = useDictation((t) => setText((prev) => (prev.trim() ? `${prev.trim().replace(/,$/, '')}, ${t}` : t)));
  const [saveName, setSaveName] = useState(''); const [usedList, setUsedList] = useState<string | null>(null);
  const saveList = async () => { if (!saveName.trim() || !text.trim()) return; const r = await api<{ message: string }>('/shopping/lists', { method: 'POST', json: { name: saveName.trim(), text } }); setMsg(r.message); setSaveName(''); lists.reload(); };
  const delList = async (id: string) => { if (!confirm('Supprimer cette liste ?')) return; await api(`/shopping/lists/${id}`, { method: 'DELETE' }); lists.reload(); };
  const applySavedList = (l: SavedList) => { setText(l.text); setUsedList(l.id); setData(null); };

  const search = async () => { if (!text.trim()) return; setBusy(true); setMsg(null); try { const r = await api<Parsed>('/shopping/parse', { method: 'POST', json: { text } }); setData(r); setSel({}); setPacks({}); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };
  const chosen = (i: number, l: Line) => { const k = i in sel ? sel[i] : l.selected; return l.offers.find((o) => o.key === k) ?? null; };
  const qty = (o: Offer) => packs[o.key] ?? o.packs;

  // regroupement par vendeur
  const groups = new Map<string, { kind: 'vendor' | 'supplier'; sellerId: string; name: string; lines: { o: Offer; l: Line }[]; minOrderEur: number; deliveryFeeEur: number }>();
  data?.lines.forEach((l, i) => { const o = chosen(i, l); if (!o || qty(o) <= 0) return; const g = groups.get(o.kind + o.sellerId) ?? { kind: o.kind, sellerId: o.sellerId, name: o.sellerName, lines: [], minOrderEur: o.minOrderEur, deliveryFeeEur: o.deliveryFeeEur }; g.lines.push({ o, l }); groups.set(o.kind + o.sellerId, g); });
  const gTotal = (g: { lines: { o: Offer }[] }) => g.lines.reduce((a, x) => a + qty(x.o) * x.o.packPrice, 0);
  const total = [...groups.values()].reduce((a, g) => a + gTotal(g) + (gTotal(g) > 0 ? g.deliveryFeeEur : 0), 0);
  const belowMin = [...groups.values()].filter((g) => gTotal(g) < g.minOrderEur);
  // économie vs « tout au plus cher »
  const worstTotal = data?.lines.reduce((a, l, i) => { const o = chosen(i, l); if (!o) return a; const w = l.offers[l.offers.length - 1]; return a + qty(o) * o.packQty * w.unitPrice; }, 0) ?? 0;
  const bestTotal = [...groups.values()].reduce((a, g) => a + gTotal(g), 0);

  const order = async () => {
    setBusy(true); setMsg(null); const done: string[] = [];
    try {
      for (const g of groups.values()) {
        const lines = g.lines.map(({ o }) => ({ packs: qty(o), id: o.offerId }));
        if (g.kind === 'vendor') { const r = await api<{ order: { reference: string } }>(`/marketplace/vendors/${g.sellerId}/orders`, { method: 'POST', json: { lines: lines.map((x) => ({ vendorOfferId: x.id, packs: x.packs })), source: 'liste_courses' } }); done.push(`${r.order.reference} → ${g.name}`); }
        else { const r = await api<{ order: { reference: string } }>('/orders', { method: 'POST', json: { supplierId: g.sellerId, lines: lines.map((x) => ({ offerId: x.id, packs: x.packs })), source: 'liste_courses' } }); done.push(`${r.order.reference} → ${g.name} (à envoyer depuis Achats)`); }
      }
      if (usedList) void api(`/shopping/lists/${usedList}`, { method: 'PUT', json: { used: true } });
      setMsg(`✅ ${done.length} commande${done.length > 1 ? 's' : ''} créée${done.length > 1 ? 's' : ''} : ${done.join(' · ')}`); setTimeout(() => nav('/app/achats'), 2500);
    } catch (e) { setMsg(`${done.length ? done.join(' · ') + ' — puis erreur : ' : ''}${(e as Error).message}`); } finally { setBusy(false); }
  };

  return (
    <div className="animate-fade-up space-y-5 pb-28">
      <PageTitle title="🛒 Liste de courses" subtitle="Écrivez ce qu’il vous faut, comme un SMS. AFRISUPPLY retrouve les produits, compare les prix de tous les fournisseurs et prépare les commandes." />
      <div className="card space-y-3">
        <textarea className="input min-h-[96px] w-full" placeholder={`Ex. : ${EXAMPLE}`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void search(); }} />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={busy || !text.trim()} onClick={() => void search()}><Sparkles size={16} /> Trouver les meilleurs prix</button>
          {dict.supported && <button className={dict.on ? 'btn-primary animate-pulse bg-red-600 hover:bg-red-700' : 'btn-ghost'} onClick={dict.toggle} title="Dicter la liste">{dict.on ? <><MicOff size={16} /> Arrêter</> : <><Mic size={16} /> Dicter</>}</button>}
          <button className="btn-ghost text-sm" onClick={() => setText(EXAMPLE)}>Exemple</button>
          {text.trim() && <span className="ml-auto flex items-center gap-1"><input className="input w-40 text-sm" placeholder="Nom (ex. Liste du lundi)" value={saveName} onChange={(e) => setSaveName(e.target.value)} /><button className="btn-ghost text-sm" disabled={!saveName.trim()} onClick={() => void saveList()}><Save size={14} /> Enregistrer</button></span>}
          <span className="text-xs text-stone-500">Quantité + produit, séparés par des virgules. Unités : kg, g, L, carton, sac, bidon, pièce.</span>
        </div>
      </div>
      {(sugg.data || (lists.data && lists.data.lists.length > 0)) && (
        <div className="flex flex-wrap gap-2">
          {sugg.data && sugg.data.restock.count > 0 && <button className="pill border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100" onClick={() => { setText(sugg.data!.restock.text); setUsedList(null); setData(null); }}><PackageOpen size={12} /> Réassort : {sugg.data.restock.count} produit{sugg.data.restock.count > 1 ? 's' : ''} sous le seuil</button>}
          {sugg.data?.last && <button className="pill border border-stone-200 bg-white text-stone-700 hover:bg-stone-50" onClick={() => { setText(sugg.data!.last!.text); setUsedList(null); setData(null); }}><RotateCcw size={12} /> Refaire la dernière commande ({sugg.data.last.reference})</button>}
          {lists.data?.lists.map((l) => <span key={l.id} className="pill border border-brand-200 bg-brand-50 text-brand-900"><button onClick={() => applySavedList(l)} title={l.text}><ListChecks size={12} className="mr-1 inline" />{l.name}{l.useCount ? ` · ${l.useCount}×` : ''}</button><button className="ml-1 text-stone-400 hover:text-red-600" onClick={() => void delList(l.id)} title="Supprimer"><Trash2 size={12} /></button></span>)}
        </div>
      )}
      {msg && <p className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm text-brand-900">{msg}</p>}
      {data && data.lines.length === 0 && <Empty>{data.hint}</Empty>}
      {data && data.lines.length > 0 && (
        <>
          {data.sellers && data.sellers.vendors + data.sellers.suppliers === 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle size={14} className="mr-1 inline" /> Aucun fournisseur ne livre encore votre zone et vous n’avez pas encore saisi vos propres fournisseurs : ajoutez-les dans <b>Fournisseurs</b> pour comparer.</p>}
          <div className="space-y-3">
            {data.lines.map((l, i) => {
              const cur = chosen(i, l);
              return (
                <div key={i} className="card space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase text-stone-400">« {l.raw} »</p>
                      {l.product ? <p className="text-lg font-bold">{l.product.name} <span className="text-sm font-normal text-stone-500">· besoin {l.neededQty} {l.product.unit}{l.product.tracked ? ' · suivi en stock' : ''}</span></p>
                        : <p className="text-lg font-bold text-amber-800">Produit non reconnu{l.candidates.length ? ` — vouliez-vous dire : ${l.candidates.map((c) => c.name).join(', ')} ?` : ''}</p>}
                    </div>
                    {l.offers.length > 1 && (l.savingPct ?? 0) > 0 && <span className="pill bg-emerald-50 text-emerald-800">jusqu’à −{l.savingPct} % entre fournisseurs</span>}
                  </div>
                  {l.product && l.offers.length === 0 && <p className="text-sm text-stone-500">{l.note}. Aucun fournisseur ne propose ce produit pour l’instant.</p>}
                  {l.offers.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-stone-500"><tr><th className="p-2"></th><th className="p-2">Fournisseur</th><th className="p-2">Conditionnement</th><th className="p-2 text-right">Prix / {l.product!.unit}</th><th className="p-2 text-right">Colis</th><th className="p-2 text-right">Total</th><th className="p-2">Délai</th></tr></thead>
                        <tbody className="divide-y divide-stone-100">{l.offers.map((o, j) => { const on = cur?.key === o.key; return (
                          <tr key={o.key} className={on ? 'bg-brand-50/60' : ''}>
                            <td className="p-2"><input type="radio" name={`l${i}`} checked={on} onChange={() => setSel({ ...sel, [i]: o.key })} /></td>
                            <td className="p-2 font-semibold">{o.sellerName} {j === 0 && <span className="pill ml-1 bg-emerald-50 text-emerald-800">moins cher</span>}{o.kind === 'vendor' && <span className="pill ml-1 bg-stone-100 text-stone-600">Marketplace</span>}</td>
                            <td className="p-2 text-stone-600">{o.packLabel}</td>
                            <td className="p-2 text-right"><b>{fmtEur(o.unitPrice)}</b></td>
                            <td className="p-2 text-right"><input type="number" min={0} className="input w-20 text-right" value={on ? qty(o) : o.packs} disabled={!on} onChange={(e) => setPacks({ ...packs, [o.key]: Number(e.target.value) })} /></td>
                            <td className="p-2 text-right">{fmtEur((on ? qty(o) : o.packs) * o.packPrice)}</td>
                            <td className="p-2 text-stone-500">{o.leadTimeHours} h</td>
                          </tr>); })}</tbody></table>
                    </div>
                  )}
                  {l.note && l.offers.length > 0 && <p className="text-xs text-amber-700">{l.note}</p>}
                </div>
              );
            })}
          </div>
          {groups.size > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 p-4 backdrop-blur lg:left-64">
              <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p><ListChecks size={14} className="mr-1 inline" /><b>{[...groups.values()].reduce((a, g) => a + g.lines.length, 0)}</b> produit(s) chez <b>{groups.size}</b> fournisseur(s) · <b>{fmtEur(total)}</b>{worstTotal > bestTotal + 0.5 && <span className="ml-2 text-emerald-700">économie {fmtEur(worstTotal - bestTotal)} vs le plus cher</span>}</p>
                  <p className="text-xs text-stone-500">{[...groups.values()].map((g) => `${g.name} ${fmtEur(gTotal(g))}${g.deliveryFeeEur ? ` + port ${fmtEur(g.deliveryFeeEur)}` : ''}`).join(' · ')}</p>
                  {belowMin.length > 0 && <p className="text-xs text-amber-700">Minimum non atteint : {belowMin.map((g) => `${g.name} (min ${fmtEur(g.minOrderEur)})`).join(', ')}</p>}
                </div>
                <button className="btn-primary" disabled={busy || belowMin.length > 0} onClick={() => void order()}><ShoppingCart size={16} /> Commander ({groups.size})</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

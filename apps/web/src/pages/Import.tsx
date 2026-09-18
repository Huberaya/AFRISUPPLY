import { useState } from 'react';
import { Upload, Download, CheckCircle2 } from 'lucide-react';
import { api, fmtEur } from '../lib/api';
import { PageTitle } from '../components/ui';

type Preview = { line: number; supplier: string; product: string; matched: string | null; pack: string; packQty: number | null; packPrice: number | null; unitPrice: number | null; status: 'ok' | 'nouveau_produit' | 'erreur'; message?: string };
type Res = { headers: string[]; summary: { total: number; ok: number; newProducts: number; errors: number; suppliers: string[] }; previews?: Preview[]; createdSuppliers?: number; createdProducts?: number; upsertedOffers?: number };

const SAMPLE = `fournisseur;produit;conditionnement;prix;telephone;ville;delai_h\nAfro Distribution;Riz parfumé;Sac 25 kg;42,00;02 40 00 11 22;Nantes;24\nAfro Distribution;Attieke;Carton 10 kg;34,00;;;\nPrimeurs du Marché;Gombo;Carton 4 kg;18,00;02 40 33 44 55;Rezé;24\nTropic Import;Huile rouge;Bidon 5 L;22,00;;Paris;72\nTropic Import;Maggi;Carton 240 cubes;19,00;;;`;

export default function Import() {
  const [csv, setCsv] = useState(''); const [defaultSupplier, setDefaultSupplier] = useState('');
  const [preview, setPreview] = useState<Res | null>(null); const [result, setResult] = useState<Res | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const run = async (dryRun: boolean) => { setBusy(true); setErr(null); try { const r = await api<Res>('/import/suppliers', { method: 'POST', json: { csv, dryRun, defaultSupplier: defaultSupplier || undefined } }); dryRun ? setPreview(r) : setResult(r); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const onFile = (f: File | undefined) => { if (!f) return; const r = new FileReader(); r.onload = () => { setCsv(String(r.result)); setPreview(null); setResult(null); }; r.readAsText(f, 'utf-8'); };
  const tone = { ok: 'bg-emerald-100 text-emerald-800', nouveau_produit: 'bg-violet-100 text-violet-800', erreur: 'bg-red-100 text-red-800' };
  return (
    <div className="animate-fade-up space-y-6">
      <PageTitle title="📥 Importer mes fournisseurs et leurs prix" subtitle="Un fichier CSV / export Excel (colonnes libres : fournisseur, produit, conditionnement, prix…). Les produits sont reconnus par leurs alias — « attieke », « huile rouge », « maggi » fonctionnent."
        action={<div className="flex gap-2"><a className="btn-ghost" href="/api/import/template.csv" download><Download size={16} /> Modèle CSV</a><a className="btn-ghost" href="/api/export/offers.csv" download><Download size={16} /> Exporter mes offres</a></div>} />
      {result ? (
        <div className="card border-emerald-200 bg-emerald-50/50"><p className="flex items-center gap-2 font-bold text-emerald-900"><CheckCircle2 /> Import terminé</p>
          <p className="mt-1 text-sm text-emerald-900">{result.createdSuppliers} fournisseur{(result.createdSuppliers ?? 0) > 1 ? 's' : ''} créé{(result.createdSuppliers ?? 0) > 1 ? 's' : ''} · {result.upsertedOffers} offres/prix enregistrés · {result.createdProducts} produit{(result.createdProducts ?? 0) > 1 ? 's' : ''} privé{(result.createdProducts ?? 0) > 1 ? 's' : ''} créé{(result.createdProducts ?? 0) > 1 ? 's' : ''}. Les produits importés sont maintenant suivis en stock.</p>
          <div className="mt-3 flex gap-2"><a href="/app/fournisseurs" className="btn-primary">Voir mes fournisseurs</a><button className="btn-ghost" onClick={() => { setResult(null); setPreview(null); setCsv(''); }}>Nouvel import</button></div></div>
      ) : (<>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 card space-y-3">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 p-6 text-sm text-stone-600 hover:border-brand-400"><Upload size={18} /> Choisir un fichier CSV<input type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} /></label>
            <p className="text-center text-xs text-stone-400">ou collez le contenu ci-dessous</p>
            <textarea className="input font-mono text-xs h-48" value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} placeholder={SAMPLE} />
            <div className="flex flex-wrap items-center gap-2"><input className="input !w-64" placeholder="Fournisseur par défaut (si colonne absente)" value={defaultSupplier} onChange={(e) => setDefaultSupplier(e.target.value)} /><button className="btn-ghost" onClick={() => setCsv(SAMPLE)}>Exemple</button><button className="btn-primary ml-auto" disabled={!csv.trim() || busy} onClick={() => run(true)}>Analyser</button></div>
            {err && <p className="text-sm text-red-700">{err}</p>}
          </div>
          <div className="card text-sm space-y-2"><h3 className="font-bold">Colonnes reconnues</h3>
            <ul className="text-stone-600 space-y-1 text-xs"><li><b>fournisseur</b> / grossiste</li><li><b>produit</b> / désignation / article</li><li><b>conditionnement</b> (« Sac 25 kg », « Bidon 5 L », « Carton 24 × 33 cl »)</li><li><b>prix</b> (du colis) ou <b>prix_kg</b></li><li>téléphone, whatsapp, email, ville</li><li>delai_h, minimum, frais_livraison</li></ul>
            <p className="text-xs text-stone-500 pt-2">Séparateur « ; » ou « , » auto-détecté. Export Excel → « CSV UTF-8 ».</p></div>
        </div>
        {preview && (
          <div className="card !p-0 overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-stone-100">
              <p className="text-sm"><b>{preview.summary.total}</b> lignes · <span className="text-emerald-700">{preview.summary.ok} reconnues</span> · <span className="text-violet-700">{preview.summary.newProducts} nouveaux produits</span> · <span className="text-red-700">{preview.summary.errors} erreurs</span> · fournisseurs : {preview.summary.suppliers.join(', ') || '—'}</p>
              <button className="btn-primary" disabled={busy || preview.summary.ok + preview.summary.newProducts === 0} onClick={() => run(false)}>{busy ? 'Import…' : `Importer ${preview.summary.ok + preview.summary.newProducts} lignes`}</button>
            </div>
            <table className="w-full text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="px-4 py-2">#</th><th className="px-4 py-2">Fournisseur</th><th className="px-4 py-2">Votre libellé</th><th className="px-4 py-2">→ Produit reconnu</th><th className="px-4 py-2">Colis</th><th className="px-4 py-2 text-right">Prix</th><th className="px-4 py-2 text-right">Prix / unité</th><th className="px-4 py-2">Statut</th></tr></thead>
              <tbody className="divide-y divide-stone-100">{preview.previews?.map((p) => <tr key={p.line}><td className="px-4 py-2 text-stone-400">{p.line}</td><td className="px-4 py-2">{p.supplier}</td><td className="px-4 py-2">{p.product}</td><td className="px-4 py-2 font-medium">{p.matched ?? <span className="text-stone-400">—</span>}</td><td className="px-4 py-2 text-stone-600">{p.pack}{p.packQty ? ` (${p.packQty})` : ''}</td><td className="px-4 py-2 text-right">{fmtEur(p.packPrice)}</td><td className="px-4 py-2 text-right">{fmtEur(p.unitPrice)}</td><td className="px-4 py-2"><span className={`pill ${tone[p.status]}`}>{p.status === 'ok' ? 'OK' : p.status === 'nouveau_produit' ? 'Nouveau' : 'Erreur'}</span>{p.message && <p className="text-[11px] text-stone-500 mt-0.5">{p.message}</p>}</td></tr>)}</tbody></table>
          </div>
        )}
      </>)}
    </div>
  );
}

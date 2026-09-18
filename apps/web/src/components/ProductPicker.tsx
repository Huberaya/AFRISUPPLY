import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type P = { id: string; name: string; category: string; baseUnit: string };
/** Recherche dans le catalogue (référentiel + produits privés) — renvoie le produit choisi. */
export function ProductPicker({ onPick, placeholder = 'Rechercher un produit (riz, gombo, attiéké…)' }: { onPick: (p: P) => void; placeholder?: string }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState<P[]>([]); const [open, setOpen] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const t = setTimeout(() => { void api<{ products: P[] }>(`/catalog?q=${encodeURIComponent(q)}`).then((d) => { setRes(d.products.slice(0, 8)); setOpen(true); }); }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative">
      <input className="input" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => res.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && res.length > 0 && <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-lg text-sm">
        {res.map((p) => <li key={p.id}><button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-brand-50" onMouseDown={() => { onPick(p); setQ(''); setRes([]); setOpen(false); }}><span>{p.name}</span><span className="text-xs text-stone-400">{p.baseUnit}</span></button></li>)}
      </ul>}
    </div>
  );
}

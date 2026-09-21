// Chantier 11 (audit UX) — le fil « Rupture → Commander → Recevoir ».
//
// Constat de l'audit : chaque écran était correct isolément, mais rien ne disait au restaurateur
// *où il en est* ni *ce qui vient après*. Ces 3 étapes reviennent donc en tête des écrans du
// parcours d'achat, avec l'étape courante en évidence et un lien vers les autres.
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';

export type Step = { label: string; to?: string; hint?: string };

export function Steps({ steps, current, title }: { steps: Step[]; current: number; title?: string }) {
  return (
    <nav aria-label={title ?? 'Étapes'} className="card !p-0">
      {title && <p className="border-b border-stone-100 px-4 py-2 text-xs font-bold uppercase tracking-wide text-stone-500">{title}</p>}
      <ol className="flex items-stretch divide-x divide-stone-100 overflow-x-auto">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const content = (
            <>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-emerald-600 text-white' : active ? 'bg-brand-600 text-white' : 'bg-stone-200 text-stone-600'}`}>
                {done ? <Check size={13} /> : i + 1}
              </span>
              <span className="min-w-0 text-left">
                <span className={`block whitespace-nowrap text-sm font-semibold ${active ? 'text-brand-800' : done ? 'text-stone-600' : 'text-stone-500'}`}>{s.label}</span>
                {s.hint && <span className="block whitespace-nowrap text-[11px] text-stone-500">{s.hint}</span>}
              </span>
            </>
          );
          return (
            <li key={s.label} className={`flex-1 ${active ? 'bg-brand-50/60' : ''}`} aria-current={active ? 'step' : undefined}>
              {s.to && !active
                ? <Link to={s.to} className="flex min-w-[9.5rem] items-center gap-2 px-4 py-3 hover:bg-stone-50">{content}</Link>
                : <span className="flex min-w-[9.5rem] items-center gap-2 px-4 py-3">{content}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Les 3 étapes du parcours d'achat, partagées par le stock, le panier, les achats et les écarts. */
export const FLOW_STEPS: Step[] = [
  { label: 'Rupture repérée', to: '/app', hint: 'le stock passe sous le seuil' },
  { label: 'Commander', to: '/app/achats/panier', hint: 'panier au meilleur coût' },
  { label: 'Envoyer & réceptionner', to: '/app/achats', hint: 'stock mis à jour' },
];

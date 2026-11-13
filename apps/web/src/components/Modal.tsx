import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Fenêtre de dialogue. Elle est rendue directement dans `document.body` (portail) : son voile couvre
 * donc toujours TOUT l'écran et son contenu est centré dans la fenêtre du navigateur, quel que soit
 * l'endroit de la page qui l'ouvre. Rendue à l'intérieur de la page, elle héritait du repère d'un
 * ancêtre transformé (animation d'entrée) : voile réduit à la zone de la page, haut du formulaire hors
 * de l'écran quand la page est courte.
 *
 * La touche Échap ferme la fenêtre, comme le bouton « Fermer » et le clic sur le voile.
 */
export function Modal({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-lg font-extrabold">{title}</h3>{subtitle && <p className="text-sm text-stone-500">{subtitle}</p>}</div>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block text-sm"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-stone-400">{hint}</span>}</label>;
}

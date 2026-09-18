import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-lg font-extrabold">{title}</h3>{subtitle && <p className="text-sm text-stone-500">{subtitle}</p>}</div>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block text-sm"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-stone-400">{hint}</span>}</label>;
}

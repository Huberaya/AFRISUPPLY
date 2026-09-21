import type { ReactNode } from 'react';

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold tracking-tight text-stone-900">{title}</h1>{subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}</div>
      {action}
    </div>
  );
}

export function StatusPill({ status }: { status: 'ok' | 'bas' | 'critique' }) {
  const map = { ok: ['bg-emerald-100 text-emerald-800', '🟢 OK'], bas: ['bg-amber-100 text-amber-800', '🟠 Bas'], critique: ['bg-red-100 text-red-800', '🔴 Critique'] } as const;
  return <span className={`pill ${map[status][0]}`}>{map[status][1]}</span>;
}

export function SeverityCard({ severity, title, message, action }: { severity: 'red' | 'orange' | 'green' | 'blue'; title: string; message: string; action?: ReactNode }) {
  const border = { red: 'border-l-red-500 bg-red-50/60', orange: 'border-l-amber-500 bg-amber-50/60', green: 'border-l-emerald-500 bg-emerald-50/60', blue: 'border-l-sky-500 bg-sky-50/60' }[severity];
  return (
    <div className={`rounded-xl border border-stone-100 border-l-4 p-4 ${border}`}>
      <p className="font-semibold text-stone-900">{title}</p>
      <p className="mt-1 text-sm text-stone-700 leading-relaxed">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Loader({ label = 'Chargement…' }: { label?: string }) {
  return <div className="flex items-center gap-3 py-10 text-stone-500"><div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" /> {label}</div>;
}

/**
 * Chantier 11 : une erreur réseau ne doit pas laisser la personne sans issue.
 * On affiche le message du serveur tel quel et, quand l'écran sait recharger, un bouton « Réessayer ».
 */
export function ErrorBox({ message, onRetry, title }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-semibold">{title ?? 'Impossible d’afficher cet écran'}</p>
      <p className="mt-1">{message}</p>
      <p className="mt-2 text-xs text-red-700">Vérifiez votre connexion internet, puis réessayez. Vos données ne sont pas perdues.</p>
      {onRetry && <button className="btn-ghost mt-3 !py-1.5" onClick={onRetry}>Réessayer</button>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">{children}</div>;
}

export function Stat({ label, value, hint, tone = 'default' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  const t = { default: 'text-stone-900', good: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700' }[tone];
  return <div className="card"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p><p className={`mt-2 text-3xl font-extrabold ${t}`}>{value}</p>{hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}</div>;
}

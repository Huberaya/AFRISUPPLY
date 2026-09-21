// Chantier 11 (audit UX) — fin des boîtes de dialogue du navigateur.
//
// Avant : `confirm()` et `alert()` natifs (F5 « Ce site tente d'ouvrir une boîte de dialogue… »,
// boutons anglais « OK / Annuler », texte inaccessible, aucun message de succès après l'action).
// Maintenant : une confirmation dans la charte AFRISUPPLY (titre en français, action nommée,
// libellé du bouton explicite) et des notifications empilables qui disent ce qui vient de se passer.
//
// Accessibilité : dialogue `role="dialog" aria-modal`, titre relié par `aria-labelledby`,
// Échap = refus, focus piégé dans le dialogue puis rendu à l'élément déclencheur ;
// notifications annoncées par `role="status"`/`aria-live`.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type Tone = 'success' | 'error' | 'info';
export type ToastInput = { title: string; detail?: string; tone?: Tone; durationMs?: number };
type Toast = ToastInput & { id: number; tone: Tone };

export type ConfirmRequest = {
  title: string;
  body?: ReactNode;
  /** Libellé du bouton qui agit (« Annuler la commande », « Réceptionner »…). Jamais « OK ». */
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ToastApi = {
  push: (t: ToastInput) => void;
  success: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
  dismiss: (id: number) => void;
};

const ToastCtx = createContext<ToastApi | null>(null);
const ConfirmCtx = createContext<((req: ConfirmRequest) => Promise<boolean>) | null>(null);

export const TOAST_CONTAINER_ID = 'afs-toasts';

/** Notifications : messages courts, en bas à droite, jamais bloquants. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  return useMemo<ToastApi>(() => ctx ?? {
    // Hors provider (test isolé d'un composant) : on n'échoue pas, on écrit dans la console.
    push: (t) => console.warn('[afs] notification sans provider :', t.title),
    success: (t) => console.warn('[afs] notification sans provider :', t),
    error: (t) => console.warn('[afs] notification sans provider :', t),
    info: (t) => console.warn('[afs] notification sans provider :', t),
    dismiss: () => undefined,
  }, [ctx]);
}

/**
 * Demande de confirmation. Renvoie `true` si la personne confirme, `false` sinon.
 * Sans provider (composant monté seul dans un test), rien ne s'affiche et l'action est refusée :
 * on ne supprime jamais de données sans une confirmation réellement visible.
 */
export function useConfirm(): (req: ConfirmRequest) => Promise<boolean> {
  const ctx = useContext(ConfirmCtx);
  return useMemo(() => ctx ?? (() => { console.error('[afs] confirmation sans <FeedbackProvider> : action annulée'); return Promise.resolve(false); }), [ctx]);
}

// ---------------------------------------------------------------- provider

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ask, setAsk] = useState<{ req: ConfirmRequest; resolve: (v: boolean) => void } | null>(null);
  const nextId = useRef(1);
  // On garde le dernier élément qui a déclenché la confirmation pour lui rendre le focus.
  const opener = useRef<Element | null>(null);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback((t: ToastInput) => {
    const id = nextId.current++;
    const tone: Tone = t.tone ?? 'info';
    setToasts((list) => [...list.slice(-3), { ...t, id, tone }]);
    const ms = t.durationMs ?? (tone === 'error' ? 9000 : 6000);
    if (ms > 0) window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), ms);
  }, []);

  const toastApi = useMemo<ToastApi>(() => ({
    push,
    success: (title, detail) => push({ title, detail, tone: 'success' }),
    error: (title, detail) => push({ title, detail, tone: 'error' }),
    info: (title, detail) => push({ title, detail, tone: 'info' }),
    dismiss,
  }), [push, dismiss]);

  const confirm = useCallback((req: ConfirmRequest) => new Promise<boolean>((resolve) => {
    opener.current = document.activeElement;
    setAsk({ req, resolve });
  }), []);

  const answer = useCallback((value: boolean) => {
    setAsk((cur) => {
      if (cur) cur.resolve(value);
      return null;
    });
    const el = opener.current as HTMLElement | null;
    if (el && typeof el.focus === 'function') el.focus();
  }, []);

  return (
    <ToastCtx.Provider value={toastApi}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        {ask && <ConfirmDialog req={ask.req} onAnswer={answer} />}
        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------- dialogue

function ConfirmDialog({ req, onAnswer }: { req: ConfirmRequest; onAnswer: (v: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Focus initial sur le bouton sûr (refuser) quand l'action est destructrice.
    const target = req.danger ? cancelRef.current : box.current?.querySelector<HTMLButtonElement>('[data-confirm]');
    (req.danger ? cancelRef.current : target)?.focus();
  }, [req.danger]);

  // Échap = refus ; Tab reste dans le dialogue (ce que la boîte native faisait gratuitement).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onAnswer(false); return; }
      if (e.key !== 'Tab' || !box.current) return;
      const focusables = [...box.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea')].filter((el) => !el.hasAttribute('disabled'));
      if (!focusables.length) return;
      const first = focusables[0]; const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onAnswer]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => onAnswer(false)}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="afs-confirm-title"
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${req.danger ? 'bg-red-100 text-red-700' : 'bg-brand-100 text-brand-700'}`}>
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h3 id="afs-confirm-title" className="text-lg font-extrabold text-stone-900">{req.title}</h3>
            {req.body && <div className="mt-1 text-sm leading-relaxed text-stone-600">{req.body}</div>}
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} className="btn-ghost" onClick={() => onAnswer(false)}>{req.cancelLabel ?? 'Annuler'}</button>
          <button data-confirm className={req.danger ? 'btn bg-red-700 text-white hover:bg-red-800' : 'btn-primary'} onClick={() => onAnswer(true)}>
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- notifications

const TONE_STYLE: Record<Tone, { card: string; icon: ReactNode }> = {
  success: { card: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" /> },
  error: { card: 'border-red-200 bg-red-50 text-red-900', icon: <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" /> },
  info: { card: 'border-stone-200 bg-white text-stone-900', icon: <Info size={18} className="mt-0.5 shrink-0 text-stone-500" /> },
};

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div id={TOAST_CONTAINER_ID} role="status" aria-live="polite" aria-atomic="false"
      // bottom-24 : au-dessus de la barre d’onglets mobile et du bouton « Un avis, un bug ? »
      className="pointer-events-none fixed inset-x-3 bottom-24 z-[70] flex flex-col items-center gap-2 sm:left-auto sm:right-4 sm:items-end lg:right-6">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border p-3 shadow-lg ${TONE_STYLE[t.tone].card} animate-fade-up`}>
          {TONE_STYLE[t.tone].icon}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t.title}</p>
            {t.detail && <p className="mt-0.5 text-xs opacity-90">{t.detail}</p>}
          </div>
          <button aria-label="Fermer le message" className="rounded p-0.5 opacity-60 hover:opacity-100" onClick={() => onDismiss(t.id)}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

// Chantier 5 (audit) — CONFIRMATION DE L'ADRESSE E-MAIL.
//
// Page ouverte depuis le lien reçu par e-mail (/verifier-email?token=…).
// Elle dit exactement ce qui s'est passé : confirmée, déjà confirmée, expirée, lien inconnu.
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MailCheck, MailWarning } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Logo, HomeButton } from '../components/AppLayout';

type Result = { ok: true; email: string; alreadyVerified: boolean; message: string };

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { user, refresh } = useAuth();
  const [state, setState] = useState<{ done: boolean; ok: boolean; message: string; email?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // `useCallback` : la tentative est unique mais l'effet ci-dessous doit dépendre d'une fonction
  // stable, sinon il se relancerait à chaque rendu.
  const send = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      const r = await api<Result>('/auth/verify-email', { method: 'POST', json: { token } });
      setState({ done: true, ok: true, message: r.message, email: r.email });
      if (user) await refresh().catch(() => null);   // le bandeau disparaît tout de suite
    } catch (e) {
      setState({ done: true, ok: false, message: (e as Error).message });
    } finally { setBusy(false); }
  }, [token, user, refresh]);

  // `send()` gère déjà les erreurs ; le `.catch` est une ceinture de sécurité : aucun échec
  // de cette page ne doit finir en « promesse non gérée » dans la console de l'utilisateur.
  useEffect(() => { send().catch(() => {}); }, [send]);   // `send` dépend du jeton : une seule tentative, un lien ne sert qu'une fois

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="mb-2 flex items-center justify-between gap-2"><Logo /><HomeButton /></div>
        <h1 className="text-2xl font-extrabold">Confirmation de mon adresse</h1>

        {!token && (
          <>
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Ce lien est incomplet : il manque le jeton de confirmation. Ouvrez le lien tel qu’il figure dans l’e-mail reçu.
            </p>
            <p className="text-sm text-stone-500">Pas reçu d’e-mail ? Vous pouvez demander un nouveau lien depuis vos paramètres, section « Mon compte ».</p>
          </>
        )}

        {token && (!state || busy) && <p className="text-sm text-stone-500">Vérification du lien…</p>}

        {token && state && !busy && (
          state.ok ? (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <MailCheck size={20} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">{state.message}</p>
                  {state.email && <p className="mt-1 text-xs opacity-80">Adresse confirmée : {state.email}</p>}
                </div>
              </div>
              <Link to={user ? '/app' : '/connexion'} className="btn-primary w-full justify-center">{user ? 'Retourner dans mon restaurant' : 'Se connecter'}</Link>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <MailWarning size={20} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">{state.message}</p>
                  <p className="mt-1 text-xs opacity-80">Un lien de confirmation est valable 48 heures et ne sert qu’une fois.</p>
                </div>
              </div>
              <Link to={user ? '/app/equipe' : '/connexion'} className="btn-primary w-full justify-center">{user ? 'Demander un nouveau lien' : 'Se connecter'}</Link>
            </>
          )
        )}
      </div>
    </div>
  );
}

// Chantier 2 (audit) — ÉQUIPE & SÉCURITÉ : rôles réellement attribuables et appliqués côté serveur,
// changement de mot de passe, déconnexion de tous les appareils.
import { useState } from 'react';
import { UserPlus, KeyRound, ShieldOff, Trash2, Shield } from 'lucide-react';
import { api, tokenStore } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { PageTitle, Loader, ErrorBox } from '../components/ui';
import { Field } from '../components/Modal';
import { useConfirm, useToast } from '../components/Feedback';

type Member = { userId: string; email: string; fullName: string; role: string; lastLoginAt: string | null; isYou?: boolean };
type Data = { members: Member[]; me: { userId: string; role: string }; roles: { role: string; label: string; can: string[] }[] };
const ROLE_LABEL: Record<string, string> = { owner: 'Propriétaire', manager: 'Responsable', staff: 'Équipe' };
const ROLE_TONE: Record<string, string> = { owner: 'bg-stone-900 text-white', manager: 'bg-sky-100 text-sky-800', staff: 'bg-stone-100 text-stone-700' };

export default function Team() {
  const { data, loading, error, reload } = useApi<Data>('/members');
  const { refresh } = useAuth();
  const [email, setEmail] = useState(''); const [fullName, setFullName] = useState(''); const [role, setRole] = useState('staff');
  const [msg, setMsg] = useState<string | null>(null); const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [errSec, setErrSec] = useState<string | null>(null); const [msgSec, setMsgSec] = useState<string | null>(null);
  // Chantier 11 : confirmations et notifications intégrées (déclarées ici, avant tout retour anticipé).
  const confirmer = useConfirm(); const toast = useToast();

  if (loading && !data) return <Loader />; if (error) return <ErrorBox message={error} onRetry={() => void reload()} />; if (!data) return null;
  const isOwner = data.me.role === 'owner';

  const invite = async () => {
    setBusy(true); setMsg(null); setInviteLink(null);
    try {
      const r = await api<{ message: string; devLink?: string }>('/members', { method: 'POST', json: { email, fullName: fullName || undefined, role } });
      setMsg(r.message); setInviteLink(r.devLink ?? null); setEmail(''); setFullName('');
      await reload();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const changeRole = async (userId: string, newRole: string) => {
    setMsg(null);
    try { await api(`/members/${userId}`, { method: 'PATCH', json: { role: newRole } }); await reload(); }
    catch (e) { setMsg((e as Error).message); }
  };
  const remove = async (m: Member) => {
    const ok = await confirmer({
      title: `Retirer ${m.fullName} de l’équipe ?`,
      body: <>Cette personne perdra immédiatement l'accès aux stocks, commandes et prix de votre restaurant. Vous pourrez l'inviter à nouveau plus tard.</>,
      confirmLabel: 'Retirer de l’équipe', danger: true,
    });
    if (!ok) return;
    setMsg(null);
    try { await api(`/members/${m.userId}`, { method: 'DELETE' }); toast.success(`${m.fullName} a été retiré·e de l’équipe.`); await reload(); }
    catch (e) { setMsg((e as Error).message); }
  };
  const changePassword = async () => {
    setErrSec(null); setMsgSec(null);
    if (pw !== pw2) { setErrSec('Les deux mots de passe ne sont pas identiques.'); return; }
    setBusy(true);
    try {
      const r = await api<{ token: string; message: string }>('/auth/password', { method: 'POST', json: { currentPassword: cur, newPassword: pw } });
      tokenStore.set(r.token); setMsgSec(r.message); setCur(''); setPw(''); setPw2('');
    } catch (e) { setErrSec((e as Error).message); } finally { setBusy(false); }
  };
  const logoutAll = async () => {
    const ok = await confirmer({
      title: 'Fermer toutes les sessions ?',
      body: <>Vous serez déconnecté·e de <b>tous</b> vos appareils, y compris le téléphone et la tablette de la cuisine. Vos données restent intactes : il suffit de vous reconnecter.</>,
      confirmLabel: 'Déconnecter partout', danger: true,
    });
    if (!ok) return;
    try { await api('/auth/logout-all', { method: 'POST' }); } finally {
      tokenStore.clear(); await refresh().catch(() => null); window.location.href = '/connexion';
    }
  };

  return (
    <div className="animate-fade-up max-w-3xl space-y-6">
      <PageTitle title="👥 Équipe & sécurité" subtitle="Qui peut faire quoi dans votre restaurant, et la sécurité de votre compte." />

      <section className="card space-y-3">
        <h2 className="font-bold flex items-center gap-2"><Shield size={18} /> Rôles</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {data.roles.map((r) => (
            <div key={r.role} className="rounded-xl border border-stone-200 p-3 text-sm">
              <p className={`pill ${ROLE_TONE[r.role]}`}>{r.label}</p>
              <p className="mt-2 text-xs text-stone-600">{r.can.join(' · ')}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">Membres ({data.members.length})</h2>
        {msg && <p className="rounded-xl bg-brand-50 border border-brand-100 p-3 text-sm text-brand-900">{msg}</p>}
        {inviteLink && (
          <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
            Environnement de développement (aucun e-mail réel) : <a className="underline break-all" href={inviteLink}>{inviteLink}</a>
          </p>
        )}
        <ul className="divide-y divide-stone-100">
          {data.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="font-semibold">{m.fullName}{m.isYou && <span className="ml-2 text-xs text-stone-500">(vous)</span>}</p>
                <p className="text-xs text-stone-500">{m.email}{m.lastLoginAt ? ` · dernière connexion ${new Date(m.lastLoginAt).toLocaleDateString('fr-FR')}` : ' · jamais connecté'}</p>
              </div>
              <div className="flex items-center gap-2">
                {isOwner && !m.isYou ? (
                  <select className="input !w-auto !py-1.5 text-sm" value={m.role} onChange={(e) => void changeRole(m.userId, e.target.value)}>
                    <option value="owner">Propriétaire</option><option value="manager">Responsable</option><option value="staff">Équipe</option>
                  </select>
                ) : <span className={`pill ${ROLE_TONE[m.role]}`}>{ROLE_LABEL[m.role] ?? m.role}</span>}
                {isOwner && !m.isYou && <button className="btn-ghost !py-1.5 text-red-700" onClick={() => void remove(m)}><Trash2 size={14} /> Retirer</button>}
              </div>
            </li>
          ))}
        </ul>
        {isOwner ? (
          <div className="rounded-xl bg-stone-50 p-3">
            <p className="text-sm font-semibold flex items-center gap-2"><UserPlus size={16} /> Inviter quelqu’un</p>
            <p className="mt-1 text-xs text-stone-500">La personne reçoit un lien personnel pour choisir son mot de passe (aucun mot de passe ne circule par e-mail).</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <Field label="E-mail"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="chef@resto.fr" /></Field>
              <Field label="Nom (facultatif)"><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
              <Field label="Rôle">
                <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="staff">Équipe (quotidien)</option><option value="manager">Responsable</option><option value="owner">Propriétaire</option>
                </select>
              </Field>
              <div className="flex items-end"><button className="btn-primary w-full justify-center" disabled={busy || !email} onClick={() => void invite()}>Inviter</button></div>
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-stone-50 p-3 text-xs text-stone-600">Seul le propriétaire du compte peut inviter ou retirer des membres.</p>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold flex items-center gap-2"><KeyRound size={18} /> Mon mot de passe</h2>
        <p className="text-xs text-stone-500">Modifier votre mot de passe déconnecte automatiquement vos autres appareils.</p>
        {errSec && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{errSec}</p>}
        {msgSec && <p className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">{msgSec}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Mot de passe actuel"><input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
          <Field label="Nouveau mot de passe"><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Confirmer"><input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-ghost" onClick={() => void logoutAll()}><ShieldOff size={16} /> Déconnecter tous mes appareils</button>
          <button className="btn-primary" disabled={busy || !cur || !pw} onClick={() => void changePassword()}>Changer mon mot de passe</button>
        </div>
      </section>
    </div>
  );
}

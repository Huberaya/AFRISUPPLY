// Chantier 12 (audit) — EXPLOITATION : le back-office qui répond à trois questions de la nuit :
//   1. les tâches planifiées ont-elles réellement tourné ? (un cron muet = rupture non détectée) ;
//   2. les sauvegardes existent-elles, et se rechargent-elles vraiment (essai sur base neuve) ?
//   3. qui a fait quoi (journal d'audit, exportable) ?
import { useState } from 'react';
import { Download, PlayCircle, RefreshCw, ShieldAlert, ShieldCheck, Database, Activity, Eye, LifeBuoy } from 'lucide-react';
import { api, downloadFile } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { PageTitle, Loader, ErrorBox, Stat } from '../../components/ui';
import { useConfirm, useToast } from '../../components/Feedback';
import { Field } from '../../components/Modal';
import { SUPPORT_EMAIL, SUPPORT_HOURS, SUPPORT_RESPONSE, mailtoSupport } from '../../lib/support';

type Job = { state: 'ok' | 'never' | 'degraded' | 'stale'; maxHours: number; lastRun: { status: string; finishedAt: string; hoursAgo: number; error: string | null; summary: unknown } | null };
type Ops = {
  jobs: Record<string, Job>;
  backup: { dir: string; files: number; bytes: number; keep: number; restaurants: number; version: number; last?: { name: string; createdAt: string; restaurantName: string | null; rows: number } | null };
  support: { email: string; hours: string; responseTime: string; phone: string | null };
};
type Stored = { name: string; sizeBytes: number; createdAt: string; restaurantId: string | null; restaurantName: string | null; rows: number; tables: number; checksum: string | null; mode: string | null };
type AuditRow = { at: string; actorEmail: string | null; action: string; target: string | null; meta: Record<string, unknown> | null };
type Drill = { ok: boolean; tookMs: number; inserted: Record<string, number>; relu: { restaurants: number; rows: number }; accountsToReset?: string[]; incomplets?: string[]; error?: string };
type Restore = { ok: boolean; totals: { inserted: number; skipped: number }; accountsToReset?: string[]; error?: string };

const JOB_LABEL: Record<string, string> = { daily: 'Digest du matin', reminders: 'Relances grossistes', 'alerts-notify': 'Alertes urgentes', backup: 'Sauvegardes' };
const DOT: Record<Job['state'], string> = { ok: '🟢', never: '⚪', degraded: '🔴', stale: '🟠' };
const ETAT: Record<Job['state'], string> = { ok: 'à jour', never: 'jamais exécutée', degraded: 'en échec', stale: 'en retard' };
const taille = (b: number) => (b < 1024 ? `${b} o` : b < 1_048_576 ? `${(b / 1024).toFixed(0)} Ko` : `${(b / 1_048_576).toFixed(1)} Mo`);

export default function AdminOps() {
  const { data, error, loading, reload } = useApi<Ops>('/admin/ops');
  const { data: files, reload: reloadFiles } = useApi<{ backups: Stored[] }>('/admin/backups');
  const { data: audit, reload: reloadAudit } = useApi<{ rows: AuditRow[]; total: number }>('/admin/audit?limit=25');
  const confirmer = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [drill, setDrill] = useState<{ name: string; r: Drill } | null>(null);
  const [form, setForm] = useState({ name: '', confirm: '', force: false });

  const refresh = async () => { await Promise.all([reload(), reloadFiles(), reloadAudit()]); };

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(label);
    try { await action(); await refresh(); } finally { setBusy(null); }
  };

  const backupNow = () => run('sauvegarde', async () => {
    const ok = await confirmer({
      title: 'Sauvegarder maintenant ?',
      body: <>La plateforme écrit un fichier de sauvegarde pour <b>chaque restaurant</b>. Les anciens fichiers au-delà de la conservation ({data?.backup.keep ?? 14} par restaurant) sont supprimés.</>,
      confirmLabel: 'Sauvegarder', cancelLabel: 'Annuler',
    });
    if (!ok) return;
    const r = await api<{ written: Stored[]; errors: { error: string }[] }>('/admin/backups/run', { method: 'POST', json: {} });
    toast.success(`${r.written.length} sauvegarde(s) écrite(s)`, r.errors.length ? `⚠️ ${r.errors.length} échec(s) : ${r.errors.map((e) => e.error).join(' · ')}` : 'Tous les fichiers ont été écrits et vérifiables.');
  });

  const vérifier = (name: string) => run(`verify:${name}`, async () => {
    const r = await api<{ ok: boolean; problems: string[]; notes: string[]; createdAt: string; totals: { rows: number } }>('/admin/backups/verify', { method: 'POST', json: { name } });
    if (r.ok) toast.success('Fichier intact', `${r.totals.rows} ligne(s), empreinte conforme.${r.notes.length ? ' ' + r.notes[0] : ''}`);
    else toast.error('Fichier non conforme', r.problems.join(' '));
  });

  const essai = (name: string) => run(`drill:${name}`, async () => {
    const r = await api<Drill>('/admin/backups/drill', { method: 'POST', json: { name } });
    setDrill({ name, r });
    if (r.ok) toast.success('Restauration prouvée', `${r.relu.rows} ligne(s) rechargée(s) dans une base neuve en ${Math.round(r.tookMs / 100) / 10} s.`);
    else toast.error('Restauration impossible', (r.incomplets ?? []).join(', ') || r.error || 'voir le détail');
  });

  const restaurer = () => run('restore', async () => {
    if (!form.name) { toast.info('Choisissez un fichier', 'Sélectionnez la sauvegarde à restaurer.'); return; }
    const ok = await confirmer({
      title: 'Restaurer cette sauvegarde ?',
      body: <>Cette action écrit les données du fichier dans la base <b>actuelle</b>. Elle est réservée à une reprise après sinistre, sur une base vide. Un essai de restauration ne modifie rien, lui.</>,
      confirmLabel: 'Restaurer', cancelLabel: 'Annuler', danger: true,
    });
    if (!ok) return;
    try {
      const r = await api<Restore>('/admin/backups/restore', { method: 'POST', json: { name: form.name, confirm: form.confirm, force: form.force } });
      toast.success('Restauration terminée', `${r.totals.inserted} ligne(s) insérée(s)${r.totals.skipped ? `, ${r.totals.skipped} ignorée(s)` : ''}.${r.accountsToReset?.length ? ` ${r.accountsToReset.length} compte(s) doivent réinitialiser leur mot de passe.` : ''}`);
      setForm({ name: '', confirm: '', force: false });
    } catch (e) { toast.error('Restauration refusée', (e as Error).message); }
  });

  if (error) return <ErrorBox message={error} onRetry={() => void refresh()} />;
  if (!data && loading) return <Loader label="Lecture de l’état d’exploitation…" />;
  if (!data) return <Loader />;
  const enProbleme = Object.entries(data.jobs).filter(([, j]) => j.state !== 'ok');

  return (
    <div className="animate-fade-up space-y-5">
      <PageTitle
        title="🛠️ Exploitation"
        subtitle="Tâches planifiées, sauvegardes vérifiées et journal d’audit — pour savoir la nuit ce qui s’est passé, sans deviner."
        action={<button className="btn-ghost" onClick={() => void refresh()}><RefreshCw size={16} /> Rafraîchir</button>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tâches en bonne santé" value={`${Object.keys(data.jobs).length - enProbleme.length}/${Object.keys(data.jobs).length}`} tone={enProbleme.length ? 'bad' : 'good'} />
        <Stat label="Sauvegardes sur disque" value={data.backup.files} hint={`${taille(data.backup.bytes)} · ${data.backup.restaurants} restaurant(s)`} />
        <Stat label="Dernière sauvegarde" value={data.backup.last ? new Date(data.backup.last.createdAt).toLocaleString('fr-FR') : '—'} hint={data.backup.last?.restaurantName ?? undefined} />
        <Stat label="Format" value={`v${data.backup.version}`} hint={`conservation ${data.backup.keep} fichiers/restaurant`} />
      </div>

      {enProbleme.length > 0 && (
        <ErrorBox
          title="Tâches à surveiller"
          message={`${enProbleme.map(([k, j]) => `${JOB_LABEL[k] ?? k} : ${ETAT[j.state]}`).join(' · ')}. Une tâche « jamais exécutée » signifie presque toujours un cron non branché ou un CRON_SECRET manquant.`}
        />
      )}

      <section className="card space-y-3">
        <h2 className="flex items-center gap-2 font-bold"><Activity size={18} /> Tâches planifiées</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500">
              <tr><th className="p-3">Tâche</th><th className="p-3">État</th><th className="p-3">Dernier passage</th><th className="p-3">Délai attendu</th><th className="p-3">Détail</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {Object.entries(data.jobs).map(([job, j]) => (
                <tr key={job}>
                  <td className="p-3 font-semibold">{JOB_LABEL[job] ?? job}</td>
                  <td className="p-3">{DOT[j.state]} {ETAT[j.state]}</td>
                  <td className="p-3 text-stone-600">{j.lastRun ? `${j.lastRun.status} · il y a ${j.lastRun.hoursAgo} h` : '—'}</td>
                  <td className="p-3 text-stone-500">≤ {j.maxHours} h</td>
                  <td className="p-3 text-xs text-stone-500">{j.lastRun?.error ?? (j.lastRun ? JSON.stringify(j.lastRun.summary).slice(0, 120) : 'aucun passage enregistré')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary !py-1.5" disabled={busy !== null} onClick={() => void backupNow()}><PlayCircle size={16} /> {busy === 'sauvegarde' ? 'Sauvegarde…' : 'Sauvegarder maintenant'}</button>
          <button className="btn-ghost !py-1.5" disabled={busy !== null} onClick={() => void run('watchdog', async () => {
            const r = await api<{ checked: number; late: { job: string; state: string }[] }>('/admin/ops/watchdog', { method: 'POST', json: {} });
            if (r.late.length) toast.error('Tâches en problème détectées', r.late.map((l) => `${JOB_LABEL[l.job] ?? l.job} (${l.state})`).join(' · '));
            else toast.success('Tout tourne', `${r.checked} tâche(s) vérifiée(s) : rien en retard.`);
          })}><ShieldCheck size={16} /> Vérifier les tâches</button>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="flex items-center gap-2 font-bold"><Database size={18} /> Sauvegardes ({files?.backups.length ?? 0})</h2>
        <p className="text-sm text-stone-600">Chaque fichier est chiffré compressé (gzip) et porte une empreinte SHA-256. « Tester » recharge réellement la sauvegarde dans une base neuve et compte les lignes : c’est la seule preuve qui vaut avant une reprise.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500">
              <tr><th className="p-3">Fichier</th><th className="p-3">Restaurant</th><th className="p-3 text-right">Lignes</th><th className="p-3 text-right">Taille</th><th className="p-3">Écrite le</th><th className="p-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {(files?.backups ?? []).slice(0, 30).map((b) => (
                <tr key={b.name}>
                  <td className="p-3 font-mono text-xs">{b.name}<br /><span className="text-stone-400">{b.mode ?? 'admin'} · v{b.checksum ? '1' : '?'}</span></td>
                  <td className="p-3">{b.restaurantName ?? '—'}</td>
                  <td className="p-3 text-right">{b.rows}</td>
                  <td className="p-3 text-right">{taille(b.sizeBytes)}</td>
                  <td className="p-3 text-xs text-stone-500">{new Date(b.createdAt).toLocaleString('fr-FR')}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-2 text-xs">
                      <button className="underline" disabled={busy !== null} onClick={() => void essai(b.name)}>{busy === `drill:${b.name}` ? '…' : 'Tester'}</button>
                      <button className="underline" disabled={busy !== null} onClick={() => void vérifier(b.name)}>Vérifier</button>
                      <button className="underline" onClick={() => void downloadFile(`/admin/backups/${b.name}`, b.name)}><Download size={12} className="inline" /> Télécharger</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!files?.backups.length && <p className="text-sm text-stone-500">Aucun fichier pour l’instant — lancez « Sauvegarder maintenant ».</p>}

        {drill && (
          <div className={`rounded-xl border p-3 text-sm ${drill.r.ok ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            <p className="font-semibold">{drill.r.ok ? '✅' : '❌'} Essai de restauration — {drill.name}</p>
            <p className="mt-1">{drill.r.ok
              ? `${drill.r.inserted ? Object.values(drill.r.inserted).reduce((a, b) => a + b, 0) : 0} ligne(s) rechargée(s) dans une base neuve (${drill.r.relu?.rows ?? '?'} relues) en ${Math.round((drill.r.tookMs ?? 0) / 100) / 10} s.`
              : (drill.r.error ?? `Tables incomplètes : ${(drill.r.incomplets ?? []).join(', ') || 'voir les journaux'}`)}</p>
            {!!drill.r.accountsToReset?.length && <p className="mt-1 text-amber-800">{drill.r.accountsToReset.length} compte(s) à réinitialiser après restauration (le fichier ne contient pas les mots de passe).</p>}
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="flex items-center gap-2 font-bold text-red-900"><ShieldAlert size={18} /> Reprise après sinistre — restauration</h2>
        <p className="text-sm text-amber-900">À n’utiliser que sur une base <b>vide</b> (nouvelle installation). La restauration refuse d’écraser des données existantes, sauf « forcer » coché explicitement. Pour vérifier une sauvegarde, utilisez « Tester » ci-dessus : cela n’écrit rien.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Fichier à restaurer">
            <select className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}>
              <option value="">— choisir —</option>
              {(files?.backups ?? []).map((b) => <option key={b.name} value={b.name}>{b.restaurantName} · {new Date(b.createdAt).toLocaleString('fr-FR')}</option>)}
            </select>
          </Field>
          <Field label="Écrivez RESTAURER pour confirmer">
            <input className="input" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} placeholder="RESTAURER" />
          </Field>
          <label className="flex items-end gap-2 text-sm">
            <input type="checkbox" checked={form.force} onChange={(e) => setForm({ ...form, force: e.target.checked })} /> Forcer (base non vide)
          </label>
        </div>
        <button className="btn-primary !bg-red-700 hover:!bg-red-800" disabled={busy !== null || form.confirm !== 'RESTAURER' || !form.name} onClick={() => void restaurer()}>
          {busy === 'restore' ? 'Restauration…' : 'Restaurer cette sauvegarde'}
        </button>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold"><Eye size={18} /> Journal d’audit ({audit?.total ?? 0} entrées)</h2>
          <button className="btn-ghost !py-1.5" onClick={() => void downloadFile('/admin/audit?format=csv', `journal-audit-${new Date().toISOString().slice(0, 10)}.csv`)}><Download size={16} /> Exporter en CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr><th className="p-3">Quand</th><th className="p-3">Qui</th><th className="p-3">Action</th><th className="p-3">Cible</th><th className="p-3">Détail</th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {(audit?.rows ?? []).map((r, i) => (
                <tr key={`${r.at}-${i}`}>
                  <td className="p-3 text-xs text-stone-500">{new Date(r.at).toLocaleString('fr-FR')}</td>
                  <td className="p-3 text-xs">{r.actorEmail ?? '—'}</td>
                  <td className="p-3 font-medium">{r.action}</td>
                  <td className="p-3 font-mono text-xs">{r.target ?? '—'}</td>
                  <td className="p-3 text-xs text-stone-500">{r.meta ? JSON.stringify(r.meta).slice(0, 120) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card space-y-1 text-sm">
        <h2 className="flex items-center gap-2 font-bold"><LifeBuoy size={18} /> Support annoncé aux restaurants</h2>
        <p>{SUPPORT_EMAIL} · {SUPPORT_HOURS}</p>
        <p className="text-stone-600">{SUPPORT_RESPONSE}</p>
        {data.support.phone && <p className="text-stone-600">Téléphone : {data.support.phone}</p>}
        <a className="underline" href={mailtoSupport('AFRISUPPLY — exploitation')}>Écrire au support</a>
      </section>
    </div>
  );
}

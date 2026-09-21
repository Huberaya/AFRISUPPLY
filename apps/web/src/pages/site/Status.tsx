// Chantier 12 (audit) — page publique « État de la plateforme ».
//
// Elle lit désormais EXACTEMENT la même source que le back-office d'exploitation
// (`lib/ops-health.ts` côté API) : plus de règle « job en retard » écrite deux fois, donc plus
// de page verte pendant qu'un cron est muet. Elle affiche aussi l'état réel des sauvegardes
// (dernier fichier écrit) et le contact du support.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SUPPORT_EMAIL, SUPPORT_HOURS, SUPPORT_RESPONSE, mailtoSupport } from '../../lib/support';

type Job = { state: 'ok' | 'never' | 'degraded' | 'stale'; maxHours: number; lastRun: { status: string; finishedAt: string; hoursAgo: number } | null };
type S = {
  ok: boolean; version: string; commit: string; env: string; checkedAt: string;
  checks: {
    database: { ok: boolean; latencyMs: number };
    jobs: Record<string, Job>;
    dailyJob: Job;
    mail: { transport: string; configured: boolean; delivered: boolean; stats?: { sent: number; failed: number } };
    sms: { configured: boolean; delivered: boolean; stats?: { sent: number } };
    errorTracking: { configured: boolean };
    cron: { configured: boolean; jobs: string[] };
    backups: { files: number; lastAt: string | null; ageHours: number | null; retentionDays: number; ok: boolean };
  };
  support: { email: string; hours: string; responseTime: string; phone: string | null };
};

const JOB_LABEL: Record<string, string> = { daily: 'E-mail du matin', reminders: 'Relances grossistes', 'alerts-notify': 'Alertes urgentes', backup: 'Sauvegardes' };
const dot = (ok: boolean | 'warn') => <span className={`inline-block h-3 w-3 rounded-full ${ok === true ? 'bg-emerald-500' : ok === 'warn' ? 'bg-amber-500' : 'bg-red-500'}`} />;

export default function Status() {
  const [s, setS] = useState<S | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch('/api/status').then(async (r) => setS(await r.json())).catch((e) => setErr(String(e))); }, []);
  const support = s?.support;
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 lg:px-8">
      <h1 className="text-3xl font-extrabold text-stone-900">État de la plateforme</h1>
      <p className="mt-2 text-stone-600">Vérifié automatiquement en continu. Cette page lit les mêmes données que notre outil d’exploitation : aucun indicateur n’est saisi à la main, aucun n’est inventé.</p>
      {err && <p className="mt-4 text-red-700">API injoignable : {err}</p>}
      {!s && !err && <p className="mt-4 text-stone-500">Vérification…</p>}
      {s && (
        <div className="mt-6 space-y-3">
          <div className={`rounded-2xl p-4 font-bold ${s.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>
            {s.ok ? '✅ Tous les systèmes fonctionnent' : '⚠️ Un système nécessite notre attention — nous sommes prévenus automatiquement'}
          </div>
          <Row label="API" ok={true} detail={`version ${s.version} · ${s.commit} · ${s.env}`} />
          <Row label="Base de données" ok={s.checks.database.ok} detail={`${s.checks.database.latencyMs} ms`} />
          {Object.entries(s.checks.jobs).map(([job, j]) => (
            <Row
              key={job}
              label={JOB_LABEL[job] ?? job}
              ok={j.state === 'ok' ? true : j.state === 'never' ? 'warn' : false}
              detail={j.lastRun
                ? `dernier passage ${j.lastRun.status} il y a ${j.lastRun.hoursAgo} h (maximum accepté : ${j.maxHours} h)`
                : `aucun passage enregistré — tâche en cours de mise en service`}
            />
          ))}
          <Row
            label="Sauvegardes des restaurants"
            ok={s.checks.backups.ok ? true : s.checks.backups.files ? 'warn' : false}
            detail={s.checks.backups.files
              ? `${s.checks.backups.files} fichier(s) · dernier ${s.checks.backups.lastAt ? new Date(s.checks.backups.lastAt).toLocaleString('fr-FR') : '—'} · conservation ${s.checks.backups.retentionDays} jours`
              : 'aucune sauvegarde écrite pour l’instant'}
          />
          <Row label="Envoi d’e-mails" ok={s.checks.mail.delivered ? true : 'warn'} detail={s.checks.mail.delivered ? `${s.checks.mail.transport}${s.checks.mail.stats ? ` · ${s.checks.mail.stats.sent} envoyé(s), ${s.checks.mail.stats.failed} échec(s)` : ''}` : 'non configuré (aucun e-mail ne partirait)'} />
          <Row label="Suivi des erreurs" ok={s.checks.errorTracking.configured ? true : 'warn'} detail={s.checks.errorTracking.configured ? 'Sentry' : 'non configuré'} />
          <Row label="Tâches planifiées branchées" ok={s.checks.cron.configured ? true : false} detail={s.checks.cron.configured ? s.checks.cron.jobs.join(' · ') : 'CRON_SECRET absent : aucune tâche ne peut être déclenchée'} />
          <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
            <p className="font-bold">Un souci ? Écrivez-nous.</p>
            <p className="mt-1 text-stone-700">
              <a className="underline" href={mailtoSupport('AFRISUPPLY — incident')}>{support?.email ?? SUPPORT_EMAIL}</a> — {support?.hours ?? SUPPORT_HOURS}. {support?.responseTime ?? SUPPORT_RESPONSE}
            </p>
            {support?.phone && <p className="mt-1 text-stone-600">Téléphone : {support.phone}</p>}
            <p className="mt-2 text-xs text-stone-500">Pour un incident bloquant, précisez « bloquant » en objet : il passe en tête.</p>
          </div>
          <p className="pt-2 text-xs text-stone-500">
            Vérifié le {new Date(s.checkedAt).toLocaleString('fr-FR')}. Historique et incidents : <Link className="underline" to="/faq">questions fréquentes</Link>. Vous êtes restaurateur ? Suivez vos propres sauvegardes depuis <Link className="underline" to="/app/mes-donnees">Mes données</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
function Row({ label, ok, detail }: { label: string; ok: boolean | 'warn'; detail: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3"><span className="flex items-center gap-3 font-semibold">{dot(ok)} {label}</span><span className="text-sm text-stone-500">{detail}</span></div>;
}

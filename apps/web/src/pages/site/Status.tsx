import { useEffect, useState } from 'react';

type S = { ok: boolean; version: string; commit: string; env: string; checkedAt: string; checks: { database: { ok: boolean; latencyMs: number }; dailyJob: { state: string; lastRun: { status: string; finishedAt: string; hoursAgo: number; sent?: number; count?: number } | null }; mail: { configured: boolean }; errorTracking: { configured: boolean }; cron: { configured: boolean } } };
const dot = (ok: boolean | 'warn') => <span className={`inline-block h-3 w-3 rounded-full ${ok === true ? 'bg-emerald-500' : ok === 'warn' ? 'bg-amber-500' : 'bg-red-500'}`} />;

export default function Status() {
  const [s, setS] = useState<S | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch('/api/status').then(async (r) => setS(await r.json())).catch((e) => setErr(String(e))); }, []);
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 lg:px-8">
      <h1 className="text-3xl font-extrabold text-stone-900">État de la plateforme</h1>
      {err && <p className="mt-4 text-red-700">API injoignable : {err}</p>}
      {!s && !err && <p className="mt-4 text-stone-500">Vérification…</p>}
      {s && (
        <div className="mt-6 space-y-3">
          <div className={`rounded-2xl p-4 font-bold ${s.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>{s.ok ? '✅ Tous les systèmes fonctionnent' : '⚠️ Incident en cours'}</div>
          <Row label="API" ok={true} detail={`version ${s.version} · ${s.commit} · ${s.env}`} />
          <Row label="Base de données" ok={s.checks.database.ok} detail={`${s.checks.database.latencyMs} ms`} />
          <Row label="E-mail du matin" ok={s.checks.dailyJob.state === 'ok' ? true : s.checks.dailyJob.state === 'never' ? 'warn' : false} detail={s.checks.dailyJob.lastRun ? `dernier envoi il y a ${s.checks.dailyJob.lastRun.hoursAgo} h · ${s.checks.dailyJob.lastRun.sent ?? 0}/${s.checks.dailyJob.lastRun.count ?? 0} restaurants` : 'jamais exécuté'} />
          <Row label="Envoi d’e-mails" ok={s.checks.mail.configured ? true : 'warn'} detail={s.checks.mail.configured ? 'Resend' : 'non configuré'} />
          <Row label="Suivi des erreurs" ok={s.checks.errorTracking.configured ? true : 'warn'} detail={s.checks.errorTracking.configured ? 'Sentry' : 'non configuré'} />
          <p className="pt-2 text-xs text-stone-500">Vérifié le {new Date(s.checkedAt).toLocaleString('fr-FR')}. Un souci ? bonjour@afrisupply.fr</p>
        </div>
      )}
    </div>
  );
}
function Row({ label, ok, detail }: { label: string; ok: boolean | 'warn'; detail: string }) {
  return <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3"><span className="flex items-center gap-3 font-semibold">{dot(ok)} {label}</span><span className="text-sm text-stone-500">{detail}</span></div>;
}

import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Mail, Save, Send, Eye, Download, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox, Stat } from '../components/ui';
import { Field } from '../components/Modal';

type S = { restaurant: { name: string; city: string | null; coversPerDay: number | null; plan: string; trialEndsAt: string | null }; settings: { priceIncreaseAlertPct: number; forecastHorizonDays: number; autoReorderEnabled: boolean; dailyDigestEnabled: boolean; digestRecipients: string[]; closedWeekdays: number[]; notifyPhone: string }; mail: { transport: 'resend' | 'file'; from: string }; sms?: { configured: boolean; whatsapp: boolean } };
const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export default function Settings() {
  const { data, loading, error, reload } = useApi<S>('/settings');
  const [f, setF] = useState<S['settings'] & { name: string; city: string; coversPerDay: string; recipientsText: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false); const [delPw, setDelPw] = useState(''); const [delConfirm, setDelConfirm] = useState('');
  const [preview, setPreview] = useState<{ subject: string; text: string; html: string } | null>(null);
  useEffect(() => { if (data) setF({ ...data.settings, name: data.restaurant.name, city: data.restaurant.city ?? '', coversPerDay: data.restaurant.coversPerDay ? String(data.restaurant.coversPerDay) : '', recipientsText: data.settings.digestRecipients.join(', ') }); }, [data]);
  if (loading && !data) return <Loader />; if (error) return <ErrorBox message={error} />; if (!data || !f) return null;
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const recipients = f.recipientsText.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
      await api('/settings', { method: 'PUT', json: { name: f.name, city: f.city || null, coversPerDay: f.coversPerDay ? Number(f.coversPerDay) : null, priceIncreaseAlertPct: f.priceIncreaseAlertPct, forecastHorizonDays: f.forecastHorizonDays, autoReorderEnabled: f.autoReorderEnabled, dailyDigestEnabled: f.dailyDigestEnabled, digestRecipients: recipients, closedWeekdays: f.closedWeekdays, notifyPhone: f.notifyPhone ?? '' } });
      setMsg('Réglages enregistrés.'); await reload();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const sendTest = async () => { setBusy(true); try { const r = await api<{ digest: string; recipients: string[]; transport?: string; error?: string }>('/digest/send-test', { method: 'POST' }); setMsg(r.digest === 'sent' ? `Mail envoyé à ${r.recipients.join(', ')}${r.transport === 'file' ? ' (mode développement : écrit dans .outbox)' : ''}.` : `Non envoyé : ${r.error ?? r.digest}`); } finally { setBusy(false); } };
  const exportData = async () => {
    const token = localStorage.getItem('afs_token'); const res = await fetch('/api/account/export', { headers: token ? { authorization: `Bearer ${token}` } : {}, credentials: 'include' });
    const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `afrisupply-export-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  const deleteAccount = async () => {
    setBusy(true); try { await api('/account', { method: 'DELETE', json: { password: delPw, confirm: delConfirm } }); localStorage.removeItem('afs_token'); location.href = '/?compte=supprime'; } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const showPreview = async () => { setPreview(await api<{ subject: string; text: string; html: string }>('/digest/preview')); };
  return (
    <div className="animate-fade-up max-w-3xl space-y-6">
      <PageTitle title="⚙️ Paramètres" subtitle="Restaurant, seuils d’alerte, auto-reorder et e-mail du matin."
        action={<Link to="/app/equipe" className="btn-ghost">👥 Équipe & sécurité</Link>} />
      {msg && <p className="rounded-xl bg-brand-50 border border-brand-100 p-3 text-sm text-brand-900">{msg}</p>}
      <div className="grid grid-cols-3 gap-3"><Stat label="Formule" value={<Link to="/app/abonnement" className="underline capitalize">{data.restaurant.plan === 'trial' ? 'Essai' : data.restaurant.plan}</Link>} /><Stat label="Essai jusqu’au" value={data.restaurant.trialEndsAt ? new Date(data.restaurant.trialEndsAt).toLocaleDateString('fr-FR') : '—'} /><Stat label="Envoi e-mail" value={data.mail.transport === 'resend' ? 'Actif' : 'Dév.'} hint={data.mail.from} /></div>
      <section className="card space-y-3">
        <h2 className="font-bold">Restaurant</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nom"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Ville"><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
          <Field label="Couverts / jour"><input className="input" type="number" value={f.coversPerDay} onChange={(e) => setF({ ...f, coversPerDay: e.target.value })} /></Field>
        </div>
        <Field label="Jours de fermeture" hint="Pas de mail du matin ces jours-là"><div className="flex gap-1.5">{DAYS.map((d, i) => <button type="button" key={d} onClick={() => setF({ ...f, closedWeekdays: f.closedWeekdays.includes(i) ? f.closedWeekdays.filter((x) => x !== i) : [...f.closedWeekdays, i] })} className={`pill !px-3 !py-1.5 ${f.closedWeekdays.includes(i) ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-700'}`}>{d}</button>)}</div></Field>
      </section>
      <section className="card space-y-3">
        <h2 className="font-bold">Intelligence</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Alerte hausse de prix à partir de (%)"><input className="input" type="number" min={1} max={50} value={f.priceIncreaseAlertPct} onChange={(e) => setF({ ...f, priceIncreaseAlertPct: Number(e.target.value) })} /></Field>
          <Field label="Horizon de prévision (jours)"><input className="input" type="number" min={3} max={14} value={f.forecastHorizonDays} onChange={(e) => setF({ ...f, forecastHorizonDays: Number(e.target.value) })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.autoReorderEnabled} onChange={(e) => setF({ ...f, autoReorderEnabled: e.target.checked })} /> Exécuter mes règles d’auto-reorder chaque matin (commandes préparées, jamais envoyées)</label>
      </section>
      <section className="card space-y-3">
        <h2 className="font-bold flex items-center gap-2"><Mail size={18} /> « Votre matin AFRISUPPLY »</h2>
        <p className="text-sm text-stone-600">Chaque matin vers 6 h 30 : ce qu’il faut commander, le panier prêt, les hausses de prix, les écarts à réclamer, les livraisons attendues.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.dailyDigestEnabled} onChange={(e) => setF({ ...f, dailyDigestEnabled: e.target.checked })} /> Recevoir l’e-mail quotidien</label>
        <Field label="📱 WhatsApp / SMS de suivi de commande" hint={data?.sms?.configured ? 'Vous recevrez confirmation, refus et départ de livraison de vos commandes marketplace.' : 'Enregistré ; les envois seront activés dès la mise en service du canal WhatsApp/SMS.'}><div className="flex gap-2"><input className="input" value={f.notifyPhone ?? ''} onChange={(e) => setF({ ...f, notifyPhone: e.target.value })} placeholder="06 12 34 56 78" /><button type="button" className="btn-ghost whitespace-nowrap" disabled={!f.notifyPhone} onClick={async () => { try { await api('/settings', { method: 'PUT', json: { notifyPhone: f.notifyPhone } }); const r = await api<{ ok: boolean; channel: string; error?: string; configured: boolean }>('/settings/test-sms', { method: 'POST', json: {} }); setMsg(r.configured ? (r.ok ? `Message test envoyé par ${r.channel}` : `Échec : ${r.error}`) : 'Numéro enregistré (canal WhatsApp/SMS pas encore en service : le test est journalisé).'); } catch (e) { setMsg((e as Error).message); } }}>Tester</button></div></Field>
        <Field label="Destinataires" hint="Vide = propriétaires et managers du restaurant. Séparez par des virgules."><input className="input" value={f.recipientsText} onChange={(e) => setF({ ...f, recipientsText: e.target.value })} placeholder="awa@chezawa.fr, chef@chezawa.fr" /></Field>
        <div className="flex flex-wrap gap-2"><button className="btn-ghost" onClick={() => void showPreview()}><Eye size={16} /> Aperçu</button><button className="btn-ghost" disabled={busy} onClick={() => void sendTest()}><Send size={16} /> M’envoyer le mail maintenant</button></div>
        {preview && <div className="rounded-xl border border-stone-200 overflow-hidden"><p className="bg-stone-50 px-3 py-2 text-sm font-semibold">{preview.subject}</p><iframe title="Aperçu du mail" srcDoc={preview.html} sandbox="" className="h-[520px] w-full bg-white" /></div>}
      </section>
      <div className="flex justify-end"><button className="btn-primary" disabled={busy} onClick={() => void save()}><Save size={16} /> Enregistrer</button></div>
      <section className="card space-y-3">
        <h2 className="font-bold">Mes données (RGPD)</h2>
        <p className="text-sm text-stone-600">Vos données vous appartiennent. Exportez tout (fournisseurs, prix, stock, commandes, ventes, recettes) en un fichier JSON, ou supprimez définitivement votre compte.</p>
        <div className="flex flex-wrap gap-2"><button className="btn-ghost" onClick={() => void exportData()}><Download size={16} /> Exporter toutes mes données</button><button className="btn-ghost !text-red-700" onClick={() => setDel(true)}><Trash2 size={16} /> Supprimer mon compte</button></div>
        {del && <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-red-900">Suppression définitive — irréversible. Les restaurants dont vous êtes l’unique propriétaire seront effacés.</p>
          <div className="grid gap-2 sm:grid-cols-2"><input className="input" type="password" placeholder="Votre mot de passe" value={delPw} onChange={(e) => setDelPw(e.target.value)} /><input className="input" placeholder="Tapez SUPPRIMER" value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} /></div>
          <div className="flex gap-2"><button className="btn-primary !bg-red-600" disabled={busy || delConfirm !== 'SUPPRIMER' || !delPw} onClick={() => void deleteAccount()}>Supprimer définitivement</button><button className="btn-ghost" onClick={() => setDel(false)}>Annuler</button></div>
        </div>}
      </section>
    </div>
  );
}

// Chantier 18 — Notifications WhatsApp / SMS (Twilio). Sans clés : transport « log » (journalisé en base, rien d'envoyé).
// Env : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (ex. whatsapp:+14155238886), TWILIO_SMS_FROM (ex. +33757…)
//
// Chantier 6 (audit) — le canal « log » ne remet rien : hors développement, l'envoi est REFUSÉ
// (ok:false + alerte admin) au lieu d'être annoncé comme réussi. En développement il reste toléré,
// mais retourne toujours `delivered:false` pour que l'interface ne promette jamais un envoi fictif.
import { getDb, notifications } from '@afrisupply/db';
import { alertAdmin } from './ops.js';
import { channelsDevAllowed } from './mailer.js';

export type Channel = 'whatsapp' | 'sms' | 'log';
export type Kind = 'order.new' | 'order.reminder' | 'order.confirmed' | 'order.refused' | 'order.shipped' | 'test';
export type SendOpts = { to: string; body: string; kind: Kind; orderId?: string | null; vendorId?: string | null; restaurantId?: string | null; prefer?: 'whatsapp' | 'sms' };

/** Normalise un numéro FR/international en E.164 (+33…). Renvoie null si inexploitable. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/^whatsapp:/i, '').replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (s.startsWith('0') && s.length === 10) s = `+33${s.slice(1)}`;
  if (!s.startsWith('+') && /^\d{9,15}$/.test(s)) s = `+${s}`;
  return /^\+\d{9,15}$/.test(s) ? s : null;
}

export function smsConfig() {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  const wa = process.env.TWILIO_WHATSAPP_FROM, sms = process.env.TWILIO_SMS_FROM;
  return { enabled: !!(sid && token && (wa || sms)), whatsapp: !!(sid && token && wa), sms: !!(sid && token && sms), sid, token, wa: wa ? (wa.startsWith('whatsapp:') ? wa : `whatsapp:${wa}`) : undefined, smsFrom: sms };
}

/** Lien « cliquer pour ouvrir WhatsApp » (fonctionne sans Twilio : utilisé dans les e-mails et l'interface). */
export const waLink = (phone: string | null | undefined, text: string) => { const p = normalizePhone(phone); return p ? `https://wa.me/${p.slice(1)}?text=${encodeURIComponent(text)}` : null; };

async function log(row: Omit<typeof notifications.$inferInsert, 'id' | 'createdAt'>) { try { const db = await getDb(); await db.insert(notifications).values(row); } catch (e) { console.warn('[sms] log KO', (e as Error).message); } }

// ---------- Supervision des envois (par instance) ----------
const stats = { sent: 0, simulated: 0, failed: 0, lastAt: null as string | null, lastChannel: null as Channel | null, lastError: null as string | null };
export const smsStats = () => ({ ...stats, configured: smsConfig().enabled, whatsapp: smsConfig().whatsapp });
export const _resetSmsStats = () => { stats.sent = 0; stats.simulated = 0; stats.failed = 0; stats.lastAt = null; stats.lastChannel = null; stats.lastError = null; };

export type SendResult = { ok: boolean; channel: Channel; delivered: boolean; error?: string; id?: string };

export async function sendMessage(o: SendOpts): Promise<SendResult> {
  const to = normalizePhone(o.to); const cfg = smsConfig();
  const base = { kind: o.kind, orderId: o.orderId ?? null, vendorId: o.vendorId ?? null, restaurantId: o.restaurantId ?? null, body: o.body };
  if (!to) { stats.failed += 1; stats.lastAt = new Date().toISOString(); stats.lastChannel = 'log'; stats.lastError = 'numéro invalide';
    await log({ ...base, channel: 'log', to: o.to, ok: false, error: 'numéro invalide' }); return { ok: false, channel: 'log', delivered: false, error: 'numéro invalide' }; }
  const channel: Channel = !cfg.enabled ? 'log' : (o.prefer ?? 'whatsapp') === 'whatsapp' && cfg.whatsapp ? 'whatsapp' : cfg.sms ? 'sms' : cfg.whatsapp ? 'whatsapp' : 'log';
  if (channel === 'log') {
    const reason = `Canal WhatsApp/SMS non configuré (Twilio absent) : le message pour ${to} n'a pas été envoyé.`;
    if (channelsDevAllowed()) {
      console.warn(`[sms] ${reason} (mode développement : message journalisé, rien n'est remis) — ${o.body.slice(0, 80)}…`);
      stats.simulated += 1; stats.lastAt = new Date().toISOString(); stats.lastChannel = 'log'; stats.lastError = null;
      await log({ ...base, channel, to, ok: false, providerId: 'logged', error: 'canal non configuré — message journalisé (mode développement), non envoyé' });
      return { ok: true, channel, delivered: false, id: 'logged' };
    }
    // Hors développement : refus explicite + alerte admin (le tableau de bord des réglages ne doit jamais dire « envoyé »).
    await alertAdmin({ key: 'sms_not_configured', message: `[WhatsApp/SMS] envoi impossible : ${reason}`, detail: { to, kind: o.kind, orderId: o.orderId ?? null } });
    stats.failed += 1; stats.lastAt = new Date().toISOString(); stats.lastChannel = 'log'; stats.lastError = reason;
    await log({ ...base, channel, to, ok: false, error: reason });
    return { ok: false, channel, delivered: false, error: reason };
  }
  try {
    const params = new URLSearchParams({ To: channel === 'whatsapp' ? `whatsapp:${to}` : to, From: channel === 'whatsapp' ? cfg.wa! : cfg.smsFrom!, Body: o.body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.sid}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${cfg.sid}:${cfg.token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params, signal: AbortSignal.timeout(10_000) });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) { const err = data.message ?? `HTTP ${res.status}`; stats.failed += 1; stats.lastAt = new Date().toISOString(); stats.lastChannel = channel; stats.lastError = err;
      await log({ ...base, channel, to, ok: false, error: err }); return { ok: false, channel, delivered: false, error: err }; }
    stats.sent += 1; stats.lastAt = new Date().toISOString(); stats.lastChannel = channel; stats.lastError = null;
    await log({ ...base, channel, to, ok: true, providerId: data.sid });
    return { ok: true, channel, delivered: true, id: data.sid };
  } catch (e) { const error = (e as Error).message; stats.failed += 1; stats.lastAt = new Date().toISOString(); stats.lastChannel = channel; stats.lastError = error;
    await log({ ...base, channel, to, ok: false, error }); return { ok: false, channel, delivered: false, error }; }
}

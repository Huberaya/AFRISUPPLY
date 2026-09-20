// Chantier 18 — Notifications WhatsApp / SMS (Twilio). Sans clés : transport « log » (journalisé en base, rien d'envoyé).
// Env : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (ex. whatsapp:+14155238886), TWILIO_SMS_FROM (ex. +33757…)
import { getDb, notifications } from '@afrisupply/db';

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

export async function sendMessage(o: SendOpts): Promise<{ ok: boolean; channel: Channel; error?: string; id?: string }> {
  const to = normalizePhone(o.to); const cfg = smsConfig();
  const base = { kind: o.kind, orderId: o.orderId ?? null, vendorId: o.vendorId ?? null, restaurantId: o.restaurantId ?? null, body: o.body };
  if (!to) { await log({ ...base, channel: 'log', to: o.to, ok: false, error: 'numéro invalide' }); return { ok: false, channel: 'log', error: 'numéro invalide' }; }
  const channel: Channel = !cfg.enabled ? 'log' : (o.prefer ?? 'whatsapp') === 'whatsapp' && cfg.whatsapp ? 'whatsapp' : cfg.sms ? 'sms' : cfg.whatsapp ? 'whatsapp' : 'log';
  if (channel === 'log') { console.warn(`[sms] Twilio non configuré — message non envoyé à ${to} : ${o.body.slice(0, 80)}…`); await log({ ...base, channel, to, ok: true, providerId: 'logged' }); return { ok: true, channel, id: 'logged' }; }
  try {
    const params = new URLSearchParams({ To: channel === 'whatsapp' ? `whatsapp:${to}` : to, From: channel === 'whatsapp' ? cfg.wa! : cfg.smsFrom!, Body: o.body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.sid}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${cfg.sid}:${cfg.token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params, signal: AbortSignal.timeout(10_000) });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) { await log({ ...base, channel, to, ok: false, error: data.message ?? `HTTP ${res.status}` }); return { ok: false, channel, error: data.message ?? `HTTP ${res.status}` }; }
    await log({ ...base, channel, to, ok: true, providerId: data.sid });
    return { ok: true, channel, id: data.sid };
  } catch (e) { const error = (e as Error).message; await log({ ...base, channel, to, ok: false, error }); return { ok: false, channel, error }; }
}

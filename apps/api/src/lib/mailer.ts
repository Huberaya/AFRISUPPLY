// Envoi d'e-mails : Resend (API HTTP, zéro dépendance) si RESEND_API_KEY, sinon mode « fichier » (dev) :
// les mails sont écrits dans MAIL_OUTBOX_DIR (défaut ./.outbox) pour être relus.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface Mail { to: string; subject: string; text: string; html: string; tags?: Record<string, string> }
export type Transport = 'resend' | 'file' | 'log';
export type MailResult = { ok: true; id: string; transport: Transport } | { ok: false; error: string; transport: Transport };

export function mailerConfig() {
  return {
    // resend en prod ; fichier en dev ; « log » (console uniquement) sur serverless sans clé : rien n'est perdu, rien ne casse
    transport: (process.env.RESEND_API_KEY ? 'resend' : process.env.VERCEL || process.env.NODE_ENV === 'production' ? 'log' : 'file') as Transport,
    from: process.env.MAIL_FROM ?? 'AFRISUPPLY <bonjour@afrisupply.fr>',
    outbox: process.env.MAIL_OUTBOX_DIR ?? path.resolve(process.cwd(), '.outbox'),
  };
}

export async function sendMail(m: Mail): Promise<MailResult> {
  const cfg = mailerConfig();
  if (cfg.transport === 'resend') {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: cfg.from, to: [m.to], subject: m.subject, text: m.text, html: m.html, tags: m.tags ? Object.entries(m.tags).map(([name, value]) => ({ name, value })) : undefined }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) return { ok: false, error: data.message ?? `HTTP ${res.status}`, transport: 'resend' };
      return { ok: true, id: data.id ?? 'unknown', transport: 'resend' };
    } catch (e) { return { ok: false, error: (e as Error).message, transport: 'resend' }; }
  }
  if (cfg.transport === 'log') { console.warn(`[mail] RESEND_API_KEY absent — mail non envoyé à ${m.to} : « ${m.subject} »`); return { ok: true, id: 'logged', transport: 'log' }; }
  // mode fichier
  try {
    await mkdir(cfg.outbox, { recursive: true });
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}_${m.to.replace(/[^a-z0-9@.]/gi, '_')}`;
    await writeFile(path.join(cfg.outbox, `${id}.html`), m.html, 'utf8');
    await writeFile(path.join(cfg.outbox, `${id}.txt`), `To: ${m.to}\nSubject: ${m.subject}\n\n${m.text}`, 'utf8');
    return { ok: true, id, transport: 'file' };
  } catch (e) { return { ok: false, error: (e as Error).message, transport: 'file' }; }
}

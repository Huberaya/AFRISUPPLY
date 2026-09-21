// Envoi d'e-mails : Resend (API HTTP, zéro dépendance) si RESEND_API_KEY, sinon mode « fichier » (dev) :
// les mails sont écrits dans MAIL_OUTBOX_DIR (défaut ./.outbox) pour être relus.
//
// Chantier 6 (audit) — un envoi n'est « réussi » que s'il est réellement parti chez un prestataire.
// Hors développement (VERCEL / NODE_ENV=production) et sans RESEND_API_KEY, l'envoi est REFUSÉ
// (ok:false, code mail_not_configured) et une alerte admin est déposée : plus jamais de ok:true qui ne remet rien.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { alertAdmin } from './ops.js';

export interface Mail { to: string; subject: string; text: string; html: string; tags?: Record<string, string> }
export type Transport = 'resend' | 'file' | 'log';
export type MailResult =
  | { ok: true; id: string; transport: Transport; delivered: boolean }
  | { ok: false; error: string; transport: Transport; delivered: false; code?: 'mail_not_configured' | 'send_failed' };

export function mailerConfig() {
  return {
    // resend en prod ; fichier en dev ; « log » (console uniquement) sur serverless sans clé
    transport: (process.env.RESEND_API_KEY ? 'resend' : process.env.VERCEL || process.env.NODE_ENV === 'production' ? 'log' : 'file') as Transport,
    from: process.env.MAIL_FROM ?? 'AFRISUPPLY <bonjour@afrisupply.fr>',
    outbox: process.env.MAIL_OUTBOX_DIR ?? path.resolve(process.cwd(), '.outbox'),
  };
}

/** L'envoi est-il réellement remis à un prestataire (et non simulé) ? */
export const mailDeliverable = () => mailerConfig().transport !== 'log';

/**
 * Chantier 5 (audit) — un jeton en clair dans une réponse HTTP n'est tolérable que sur un poste
 * de développement : ni clé d'envoi, ni NODE_ENV=production, ni déploiement (VERCEL).
 * Évalué à chaque appel : un environnement qui change ne doit pas continuer à exposer des jetons.
 */
export const devLinksAllowed = () => !process.env.RESEND_API_KEY && process.env.NODE_ENV !== 'production' && !process.env.VERCEL;

/**
 * Chantier 6 — un envoi « simulé » (journalisé en console) n'est acceptable que sur un poste de
 * développement : en déploiement, accepter un message sans le remettre serait un mensonge au client.
 */
export const channelsDevAllowed = () => process.env.NODE_ENV !== 'production' && !process.env.VERCEL;

// ---------- Supervision des envois (par instance) ----------
const stats = { sent: 0, simulated: 0, failed: 0, lastAt: null as string | null, lastTransport: null as Transport | null, lastError: null as string | null };
const bump = (kind: 'sent' | 'simulated' | 'failed', transport: Transport, error?: string) => {
  stats[kind] += 1; stats.lastAt = new Date().toISOString(); stats.lastTransport = transport; stats.lastError = error ?? null;
};
/** Compteurs d'envoi depuis le démarrage de l'instance (supervision légère, exposée par /api/status). */
export const mailStats = () => ({ ...stats, transport: mailerConfig().transport, deliverable: mailDeliverable() });
export const _resetMailStats = () => { stats.sent = 0; stats.simulated = 0; stats.failed = 0; stats.lastAt = null; stats.lastTransport = null; stats.lastError = null; };

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
      if (!res.ok) { bump('failed', 'resend', data.message ?? `HTTP ${res.status}`); return { ok: false, error: data.message ?? `HTTP ${res.status}`, transport: 'resend', delivered: false, code: 'send_failed' }; }
      bump('sent', 'resend');
      return { ok: true, id: data.id ?? 'unknown', transport: 'resend', delivered: true };
    } catch (e) { bump('failed', 'resend', (e as Error).message); return { ok: false, error: (e as Error).message, transport: 'resend', delivered: false, code: 'send_failed' }; }
  }
  if (cfg.transport === 'log') {
    const reason = `Aucun service d'envoi d'e-mails n'est configuré (RESEND_API_KEY absent) : le message pour ${m.to} (« ${m.subject} ») n'a pas été envoyé.`;
    if (channelsDevAllowed()) {
      console.warn(`[mail] ${reason} (mode développement : envoi simulé, rien n'est remis)`);
      bump('simulated', 'log', reason);
      return { ok: true, id: 'logged', transport: 'log', delivered: false };
    }
    // Hors développement : on refuse de dire « envoyé » et on alerte l'exploitant (audit + Sentry).
    await alertAdmin({ key: 'mail_not_configured', message: `[e-mail] envoi impossible : ${reason}`, detail: { to: m.to, subject: m.subject, tags: m.tags } });
    bump('failed', 'log', reason);
    return { ok: false, error: reason, transport: 'log', delivered: false, code: 'mail_not_configured' };
  }
  // mode fichier (développement) : le message est écrit dans .outbox et donc réellement consultable
  try {
    await mkdir(cfg.outbox, { recursive: true });
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}_${m.to.replace(/[^a-z0-9@.]/gi, '_')}`;
    await writeFile(path.join(cfg.outbox, `${id}.html`), m.html, 'utf8');
    await writeFile(path.join(cfg.outbox, `${id}.txt`), `To: ${m.to}\nSubject: ${m.subject}\n\n${m.text}`, 'utf8');
    bump('sent', 'file');
    return { ok: true, id, transport: 'file', delivered: true };
  } catch (e) { bump('failed', 'file', (e as Error).message); return { ok: false, error: (e as Error).message, transport: 'file', delivered: false, code: 'send_failed' }; }
}

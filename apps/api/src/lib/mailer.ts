// Envoi d'e-mails : Resend (API HTTP, zéro dépendance) si RESEND_API_KEY, sinon mode « fichier » (dev) :
// les mails sont écrits dans MAIL_OUTBOX_DIR (défaut ./.outbox) pour être relus.
//
// Chantier 6 (audit) — un envoi n'est « réussi » que s'il est réellement parti chez un prestataire.
// Hors développement (VERCEL / NODE_ENV=production) et sans RESEND_API_KEY, l'envoi est REFUSÉ
// (ok:false, code mail_not_configured) et une alerte admin est déposée : plus jamais de ok:true qui ne remet rien.
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { alertAdmin } from './ops.js';
import { SUPPORT } from './ops-health.js';

export interface MailAttachment { filename: string; content: Buffer | string; contentType?: string }
export interface Mail { to: string; subject: string; text: string; html: string; tags?: Record<string, string>; attachments?: MailAttachment[] }
export type Transport = 'resend' | 'file' | 'log';
/**
 * Levée des blocages (chantier E) — motif d'un échec d'envoi, lisible par une machine.
 *   mail_not_configured          aucune clé d'envoi : rien ne peut partir
 *   mail_key_invalid             la clé est refusée par le prestataire
 *   mail_test_sender_restricted  l'expéditeur est l'adresse d'essai du prestataire : seul le titulaire de son compte est servi
 *   mail_domain_not_verified     le domaine de l'expéditeur n'est pas vérifié chez le prestataire
 *   mail_from_invalid            l'adresse d'expéditeur est refusée
 *   mail_recipient_rejected      l'adresse du destinataire est refusée
 *   mail_rejected                message refusé pour une autre raison (contenu, format)
 *   mail_rate_limited            limite de débit ou quota du prestataire (réessayer plus tard)
 *   mail_provider_error          panne du prestataire (réessayer plus tard)
 *   mail_network_error           prestataire injoignable ou trop lent (réessayer plus tard)
 *   send_failed                  écriture locale impossible (mode fichier, développement)
 */
export type MailErrorCode =
  | 'mail_not_configured' | 'mail_key_invalid' | 'mail_test_sender_restricted' | 'mail_domain_not_verified' | 'mail_from_invalid'
  | 'mail_recipient_rejected' | 'mail_rejected' | 'mail_rate_limited' | 'mail_provider_error' | 'mail_network_error' | 'send_failed';

/** Échecs qui tiennent à la configuration de l'envoi : ils frappent TOUS les messages, réessayer ne sert à rien. */
export const MAIL_CONFIG_ERRORS: readonly MailErrorCode[] = ['mail_not_configured', 'mail_key_invalid', 'mail_domain_not_verified', 'mail_from_invalid'];
/** Échecs passagers : le même message peut partir plus tard. */
export const MAIL_RETRYABLE_ERRORS: readonly MailErrorCode[] = ['mail_rate_limited', 'mail_provider_error', 'mail_network_error'];

/** Phrase associée à chaque motif. Elle est fixe : aucune adresse, aucune clé, aucun texte du prestataire n'y entre. */
export const MAIL_ERROR_MESSAGES: Record<MailErrorCode, string> = {
  mail_not_configured: 'Aucun service d\'envoi d\'e-mails n\'est configuré (clé absente) : le message n\'a pas été envoyé.',
  mail_key_invalid: 'La clé du service d\'envoi d\'e-mails est refusée par le prestataire.',
  mail_test_sender_restricted: 'L\'expéditeur est l\'adresse d\'essai du prestataire : il ne remet qu\'au titulaire de son compte. Vérifiez un domaine d\'envoi et réglez MAIL_FROM.',
  mail_domain_not_verified: 'Le domaine de l\'adresse d\'expéditeur n\'est pas vérifié chez le prestataire d\'e-mails.',
  mail_from_invalid: 'L\'adresse d\'expéditeur (MAIL_FROM) est refusée par le prestataire d\'e-mails.',
  mail_recipient_rejected: 'L\'adresse du destinataire est refusée par le prestataire d\'e-mails.',
  mail_rejected: 'Le message a été refusé par le prestataire d\'e-mails.',
  mail_rate_limited: 'Le prestataire d\'e-mails limite le débit ou le quota est atteint : à réessayer plus tard.',
  mail_provider_error: 'Le prestataire d\'e-mails est en panne : à réessayer plus tard.',
  mail_network_error: 'Le prestataire d\'e-mails est injoignable ou n\'a pas répondu à temps : à réessayer plus tard.',
  send_failed: 'Le message n\'a pas pu être écrit dans le dossier local des e-mails.',
};

/**
 * Classe un refus du prestataire d'après son code HTTP, son nom d'erreur et son message.
 * Le message du prestataire n'est QUE lu : il n'est ni renvoyé ni journalisé (il contient par exemple
 * l'adresse e-mail du titulaire du compte quand l'expéditeur d'essai est utilisé).
 */
export function classifyProviderFailure(status: number, body: { name?: unknown; message?: unknown } | null | undefined): MailErrorCode {
  const name = String(body?.name ?? '').toLowerCase();
  const message = String(body?.message ?? '').toLowerCase();
  if (status === 429 || /rate_limit|quota/.test(name)) return 'mail_rate_limited';
  if (status >= 500) return 'mail_provider_error';
  if (status === 401 || /api_key/.test(name) || /api key/.test(message)) return 'mail_key_invalid';
  if (/only send testing emails to your own email address/.test(message)) return 'mail_test_sender_restricted';
  if (/domain is not verified|verify (a|your) domain/.test(message)) return 'mail_domain_not_verified';
  if (name === 'invalid_from_address' || /`?from`? (address|field)/.test(message)) return 'mail_from_invalid';
  if (name === 'invalid_to_address' || /`?to`? (address|field)|recipient/.test(message)) return 'mail_recipient_rejected';
  return 'mail_rejected';
}

/**
 * Masque ce qui ne doit jamais figurer dans un journal, une réponse ou une ligne de suivi :
 * adresses e-mail (« a***@domaine.fr »), clés et jetons.
 */
export function redact(text: string): string {
  return text
    .replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***@$2')
    .replace(/\b(re|sk|pk|whsec|rk)_[A-Za-z0-9_]{8,}/g, '$1_***')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 ***')
    .replace(/([?&](?:token|secret|code|key)=)[^&\s"']{6,}/gi, '$1***');
}
/** Adresse masquée pour un journal : « a***@domaine.fr ». */
export const maskEmail = (email: string): string => redact(email);

export type MailResult =
  | { ok: true; id: string; transport: Transport; delivered: boolean }
  | { ok: false; error: string; transport: Transport; delivered: false; code: MailErrorCode; retryable: boolean };

const failure = (code: MailErrorCode, transport: Transport): Extract<MailResult, { ok: false }> =>
  ({ ok: false, error: MAIL_ERROR_MESSAGES[code], transport, delivered: false, code, retryable: MAIL_RETRYABLE_ERRORS.includes(code) });

/** Adresse du prestataire d'e-mails. Modifiable uniquement hors production (tests avec un faux prestataire). */
const providerUrl = () => {
  const prod = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  return ((!prod && process.env.RESEND_API_URL?.trim()) || 'https://api.resend.com').replace(/\/$/, '');
};

export function mailerConfig() {
  return {
    // resend en prod ; fichier en dev ; « log » (console uniquement) sur serverless sans clé
    transport: (process.env.RESEND_API_KEY ? 'resend' : process.env.VERCEL || process.env.NODE_ENV === 'production' ? 'log' : 'file') as Transport,
    from: process.env.MAIL_FROM ?? `AFRISUPPLY <${SUPPORT.email()}>`,
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
// `lastError` est exposé par la page de statut PUBLIQUE : ce n'est jamais le texte du prestataire (qui
// peut contenir une adresse e-mail), seulement la phrase fixe du motif — et `lastErrorCode` le motif.
const stats = { sent: 0, simulated: 0, failed: 0, lastAt: null as string | null, lastTransport: null as Transport | null, lastError: null as string | null, lastErrorCode: null as MailErrorCode | null };
const bump = (kind: 'sent' | 'simulated' | 'failed', transport: Transport, code?: MailErrorCode) => {
  stats[kind] += 1; stats.lastAt = new Date().toISOString(); stats.lastTransport = transport;
  stats.lastErrorCode = code ?? null; stats.lastError = code ? MAIL_ERROR_MESSAGES[code] : null;
};
/** Compteurs d'envoi depuis le démarrage de l'instance (supervision légère, exposée par /api/status). */
export const mailStats = () => ({ ...stats, transport: mailerConfig().transport, deliverable: mailDeliverable() });
export const _resetMailStats = () => { stats.sent = 0; stats.simulated = 0; stats.failed = 0; stats.lastAt = null; stats.lastTransport = null; stats.lastError = null; stats.lastErrorCode = null; };

/** Nombre de messages déposés dans le dossier local (mode fichier) — preuve d'envoi en développement. */
export async function outboxCount(): Promise<number> {
  try { return (await readdir(mailerConfig().outbox)).length; } catch { return 0; }
}

export async function sendMail(m: Mail): Promise<MailResult> {
  const cfg = mailerConfig();
  if (cfg.transport === 'resend') {
    try {
      const res = await fetch(`${providerUrl()}/emails`, {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: cfg.from, to: [m.to], subject: m.subject, text: m.text, html: m.html,
          tags: m.tags ? Object.entries(m.tags).map(([name, value]) => ({ name, value })) : undefined,
          // Chantier 7 de l'audit 2 : factures PDF réellement jointes (Resend accepte le contenu encodé).
          attachments: m.attachments?.map((a) => ({ filename: a.filename, content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : Buffer.from(a.content).toString('base64') })),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; name?: string; message?: string };
      if (!res.ok) { const code = classifyProviderFailure(res.status, data); bump('failed', 'resend', code); return failure(code, 'resend'); }
      bump('sent', 'resend');
      return { ok: true, id: data.id ?? 'unknown', transport: 'resend', delivered: true };
    } catch { bump('failed', 'resend', 'mail_network_error'); return failure('mail_network_error', 'resend'); }
  }
  if (cfg.transport === 'log') {
    // Le destinataire n'apparaît que masqué dans les journaux et les alertes (« a***@domaine.fr »).
    const reason = `Aucun service d'envoi d'e-mails n'est configuré (RESEND_API_KEY absent) : le message pour ${maskEmail(m.to)} (« ${m.subject} ») n'a pas été envoyé.`;
    if (channelsDevAllowed()) {
      console.warn(`[mail] ${reason} (mode développement : envoi simulé, rien n'est remis)`);
      bump('simulated', 'log');
      return { ok: true, id: 'logged', transport: 'log', delivered: false };
    }
    // Hors développement : on refuse de dire « envoyé » et on alerte l'exploitant (audit + Sentry).
    await alertAdmin({ key: 'mail_not_configured', message: `[e-mail] envoi impossible : ${reason}`, detail: { to: maskEmail(m.to), subject: m.subject, tags: m.tags } });
    bump('failed', 'log', 'mail_not_configured');
    return failure('mail_not_configured', 'log');
  }
  // mode fichier (développement) : le message est écrit dans .outbox et donc réellement consultable
  try {
    await mkdir(cfg.outbox, { recursive: true });
    // Le nom d'un message se construisait sur « milliseconde + destinataire » : deux messages au même
    // destinataire dans la même milliseconde s'écrivaient au MÊME fichier, le second écrasant le
    // premier — les deux envois annonçant pourtant « ok ». Cas réel : une alerte d'écart de livraison
    // et une confirmation de commande parties ensemble, l'alerte réduite au silence. On n'écrase plus
    // jamais un message : en cas de collision, le nom reçoit un suffixe (-2, -3…).
    const base = `${new Date().toISOString().replace(/[:.]/g, '-')}_${m.to.replace(/[^a-z0-9@.]/gi, '_')}`;
    const nomTxt = await ecrireSansEcraser(cfg.outbox, base, '.txt', `To: ${m.to}\nSubject: ${m.subject}\n\n${m.text}`);
    // Le nom réellement retenu (avant le suffixe éventuel) sert de base au HTML et aux pièces jointes.
    const id = nomTxt.replace(/\.txt$/, '');
    await ecrireSansEcraser(cfg.outbox, id, '.html', m.html);
    // En développement, les pièces jointes sont écrites à côté du message : on peut ouvrir la facture.
    for (const [i, a] of (m.attachments ?? []).entries()) {
      const name = `${id}${(m.attachments?.length ?? 0) > 1 ? `-${i + 1}` : ''}-${a.filename.replace(/[^a-z0-9._-]/gi, '_')}`;
      await writeFile(path.join(cfg.outbox, name), Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content));
    }
    bump('sent', 'file');
    return { ok: true, id, transport: 'file', delivered: true };
  } catch { bump('failed', 'file', 'send_failed'); return failure('send_failed', 'file'); }
}

/**
 * Écrit un fichier en refusant d'écraser un message déjà déposé (`flag: 'wx'`). En cas de collision de
 * nom — même destinataire, même milliseconde — le fichier prend un suffixe `-2`, `-3`… : aucun message
 * ne peut en supprimer un autre.
 */
async function ecrireSansEcraser(dir: string, base: string, ext: string, contenu: string): Promise<string> {
  for (let i = 1; i <= 50; i++) {
    const nom = i === 1 ? `${base}${ext}` : `${base}-${i}${ext}`;
    try { await writeFile(path.join(dir, nom), contenu, { flag: 'wx', encoding: 'utf8' }); return nom; }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      // Nom déjà pris : on essaie le suivant.
    }
  }
  throw new Error(`Impossible de nommer le message dans ${dir} : trop de collisions sur « ${base} ».`);
}

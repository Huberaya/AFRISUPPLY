// Chantier 2 (audit) — émission des liens de mot de passe (oubli et invitation d'un membre).
// Un seul lien actif par personne : les précédents sont neutralisés. Le jeton n'est jamais stocké en clair.
import { and, eq, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { getDb, passwordResets, emailVerifications } from '@afrisupply/db';

export const hashResetToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** Crée un jeton à usage unique (valable `ttlMinutes`) et renvoie l'URL complète à envoyer. */
export async function issuePasswordLink(
  userId: string,
  opts: { ttlMinutes?: number; requestedIp?: string | null; path?: 'reinitialiser' | 'bienvenue' } = {},
): Promise<{ token: string; link: string; expiryMinutes: number }> {
  const db = await getDb();
  const ttlMinutes = opts.ttlMinutes ?? Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 60);
  await db.update(passwordResets).set({ usedAt: new Date() })
    .where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));
  const token = randomBytes(32).toString('base64url');
  await db.insert(passwordResets).values({
    userId, tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + ttlMinutes * 60_000), requestedIp: opts.requestedIp ?? null,
  });
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return { token, link: `${appUrl}/${opts.path ?? 'reinitialiser'}?token=${token}`, expiryMinutes: ttlMinutes };
}

// -------------------------------------------------------------
// Chantier 5 (audit) — confirmation de l'adresse e-mail.
// Même discipline que les liens de mot de passe : jeton aléatoire, stocké haché,
// à usage unique, expiré au bout de 48 h, et un seul jeton actif à la fois.
// -------------------------------------------------------------
export const hashEmailToken = (t: string) => createHash('sha256').update(t).digest('hex');

export async function issueEmailVerification(
  userId: string,
  email: string,
  opts: { ttlHours?: number; requestedIp?: string | null } = {},
): Promise<{ token: string; link: string; expiryHours: number }> {
  const db = await getDb();
  const ttlHours = opts.ttlHours ?? Number(process.env.EMAIL_VERIFY_TTL_HOURS ?? 48);
  await db.update(emailVerifications).set({ usedAt: new Date() })
    .where(and(eq(emailVerifications.userId, userId), isNull(emailVerifications.usedAt)));
  const token = randomBytes(32).toString('base64url');
  await db.insert(emailVerifications).values({
    userId, email, tokenHash: hashEmailToken(token),
    expiresAt: new Date(Date.now() + ttlHours * 3_600_000), requestedIp: opts.requestedIp ?? null,
  });
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return { token, link: `${appUrl}/verifier-email?token=${token}`, expiryHours: ttlHours };
}

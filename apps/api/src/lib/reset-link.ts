// Chantier 2 (audit) — émission des liens de mot de passe (oubli et invitation d'un membre).
// Un seul lien actif par personne : les précédents sont neutralisés. Le jeton n'est jamais stocké en clair.
import { and, eq, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { getDb, passwordResets } from '@afrisupply/db';

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

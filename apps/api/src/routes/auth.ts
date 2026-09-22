import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { setCookie, deleteCookie } from 'hono/cookie';
import { getDb, users, restaurants, restaurantMembers, leads, passwordResets, emailVerifications } from '@afrisupply/db';
import { hashPassword, verifyPassword, signToken, requireAuth, tokenTtlSeconds, type Env } from '../lib/auth.js';
import { passwordProblem, PASSWORD_MIN_LENGTH } from '../lib/security.js';
import { issuePasswordLink, issueEmailVerification, hashEmailToken } from '../lib/reset-link.js';
import { sendMail, mailerConfig, devLinksAllowed, type MailResult } from '../lib/mailer.js';
import { audit } from '../lib/ops.js';

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// Chantier 2 (audit) : la durée du cookie suit celle du jeton (7 j par défaut, au lieu de 30 j).
const cookieOpts = { httpOnly: true, sameSite: 'Lax' as const, path: '/', maxAge: tokenTtlSeconds(), secure: process.env.NODE_ENV === 'production' };
const hashResetToken = (t: string) => createHash('sha256').update(t).digest('hex');

export const authRoutes = new Hono<Env>();

/**
 * Chantier 5 (audit) — dire la vérité sur un envoi d'e-mail.
 * Le transport « log » (production sans RESEND_API_KEY) ne remet RIEN : on ne peut donc pas
 * répondre « e-mail envoyé ». On distingue « remis » de « non configuré », et en développement
 * on renvoie le lien pour pouvoir tester le parcours de bout en bout.
 */
const mailStatus = (res: MailResult, link: string, kind: 'verification' | 'reset' | 'invitation') => {
  const delivered = res.ok && res.transport !== 'log';
  const { transport } = res;
  return {
    delivered, transport,
    ...(delivered ? {} : {
      code: 'mail_not_delivered',
      warning: kind === 'verification'
        ? "Votre adresse n'a pas encore pu être confirmée : l'envoi d'e-mails n'est pas configuré sur ce serveur."
        : "L'e-mail n'a pas pu être envoyé : l'envoi d'e-mails n'est pas configuré sur ce serveur. Prévenez le support.",
    }),
    ...(devLinksAllowed() ? { devLink: link } : {}),
  };
};


authRoutes.post('/register', async (c) => {
  const body = z.object({
    email: z.string().email(), password: z.string().min(8), fullName: z.string().min(2),
    restaurantName: z.string().min(2), city: z.string().optional(), coversPerDay: z.number().int().positive().optional(), inviteCode: z.string().max(20).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const d = body.data; const db = await getDb();

  // Chantier 2 (audit) : politique de mot de passe minimale (refus des mots de passe les plus courants)
  const weak = passwordProblem(d.password);
  if (weak) return c.json({ error: weak, code: 'weak_password' }, 400);

  const dup = await db.select({ id: users.id }).from(users).where(eq(users.email, d.email.toLowerCase())).limit(1);
  if (dup.length) return c.json({ error: 'Un compte existe déjà avec cet e-mail' }, 409);

  const [user] = await db.insert(users).values({ email: d.email.toLowerCase(), passwordHash: await hashPassword(d.password), fullName: d.fullName, lastLoginAt: new Date() }).returning();
  const slug = `${slugify(d.restaurantName)}-${user.id.slice(0, 6)}`;
  const trialEndsAt = new Date(Date.now() + 30 * 86_400_000);
  // Chantier 7 : code d'invitation pilote → restaurant fondateur (−50 % à vie), lead marqué « client »
  const code = d.inviteCode?.toUpperCase().trim();
  const [lead] = code ? await db.select().from(leads).where(eq(leads.inviteCode, code)) : [];
  const founder = !!lead && !lead.restaurantId;
  const [restaurant] = await db.insert(restaurants).values({ name: d.restaurantName, slug, city: d.city, coversPerDay: d.coversPerDay, plan: 'trial', trialEndsAt, founder, inviteCode: founder ? code : null }).returning();
  if (founder) await db.update(leads).set({ restaurantId: restaurant.id, status: 'client' }).where(eq(leads.id, lead.id));
  await db.insert(restaurantMembers).values({ restaurantId: restaurant.id, userId: user.id, role: 'owner' });

  // Chantier 5 (audit) : adresse e-mail à confirmer. On n'empêche PAS l'usage (un restaurateur
  // ne doit jamais être bloqué à l'ouverture), mais on le lui demande et on le trace.
  const { link } = await issueEmailVerification(user.id, user.email, { requestedIp: c.req.header('x-forwarded-for') ?? null });
  const TTL_H = Number(process.env.EMAIL_VERIFY_TTL_HOURS ?? 48);
  const mail = await sendMail({
    to: user.email, subject: 'AFRISUPPLY — confirmez votre adresse e-mail',
    text: `Bonjour ${user.fullName.split(' ')[0] || 'chef'},\n\nBienvenue sur AFRISUPPLY. Confirmez votre adresse e-mail en ouvrant ce lien (valable ${TTL_H} heures) : ${link}\n\nTant que l'adresse n'est pas confirmée, nous ne pouvons pas vous envoyer les alertes de rupture ni les rappels de commande.`,
    html: `<p>Bonjour ${user.fullName.split(' ')[0] || 'chef'},</p><p>Bienvenue sur AFRISUPPLY. <a href="${link}">Confirmez votre adresse e-mail</a> (lien valable ${TTL_H} heures).</p><p>Tant que l'adresse n'est pas confirmée, nous ne pouvons pas vous envoyer les alertes de rupture ni les rappels de commande.</p>`,
    tags: { type: 'email_verification' },
  });
  void audit('email.verification.sent', { actorEmail: user.email, target: user.id, meta: { transport: mail.transport, delivered: mail.ok && mail.transport !== 'log' } });

  const token = await signToken({ id: user.id, email: user.email, fullName: user.fullName, tokenVersion: user.tokenVersion ?? 0 });
  setCookie(c, 'afs_token', token, cookieOpts);
  // Chantier 6 (audit) — e-mail de bienvenue : le nouveau pilote sait quoi faire dans les 30 minutes
  // (critère : « s'inscrit, … et commande sans aide en < 30 min »).
  const firstName2 = user.fullName.split(' ')[0] || 'chef';
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  await sendMail({
    to: user.email, subject: 'AFRISUPPLY — bienvenue ! Votre tableau de bord en 20 minutes',
    text: `Bonjour ${firstName2},\n\nVotre espace « ${d.restaurantName} » est prêt : ${appUrl}/app/demarrer\n\nEn 20 minutes, pas à pas :\n1. Configurez votre carte (vos produits sont déduits des recettes)\n2. Fixez vos seuils : vous serez alerté avant les ruptures\n3. Préparez votre première commande — rien ne part sans vous\n\nUne question ? Répondez à cet e-mail, on répond sous 24 h.\n\nBienvenue à bord,\nL'équipe AFRISUPPLY`,
    html: `<p>Bonjour ${firstName2},</p><p>Votre espace <b>« ${d.restaurantName} »</b> est prêt.</p><p><a href="${appUrl}/app/demarrer" style="display:inline-block;padding:10px 16px;background:#c2410c;color:#fff;border-radius:10px;text-decoration:none">Commencer (20 minutes)</a></p><ol><li>Configurez votre carte (vos produits sont déduits des recettes)</li><li>Fixez vos seuils : vous serez alerté avant les ruptures</li><li>Préparez votre première commande — rien ne part sans vous</li></ol><p>Une question ? Répondez à cet e-mail, on répond sous 24 h.</p><p>Bienvenue à bord,<br>L'équipe AFRISUPPLY</p>`,
    tags: { type: 'welcome' },
  });
  return c.json({
    token, user: { id: user.id, email: user.email, fullName: user.fullName },
    restaurant, emailVerified: false, emailVerification: mailStatus(mail, link, 'verification'),
  }, 201);
});

/**
 * Chantier 5 (audit) — confirmation de l'adresse e-mail.
 * Jeton à usage unique, expiré au bout de 48 h, avec invalidation des autres jetons en attente.
 */
authRoutes.post('/verify-email', async (c) => {
  const body = z.object({ token: z.string().min(10) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Lien de confirmation incomplet.', code: 'verify_invalid' }, 400);
  const db = await getDb();
  const [row] = await db.select().from(emailVerifications)
    .where(eq(emailVerifications.tokenHash, hashEmailToken(body.data.token))).limit(1);
  if (!row) return c.json({ error: 'Ce lien de confirmation n’est pas reconnu. Demandez-en un nouveau.', code: 'verify_invalid' }, 400);
  const [user] = await db.select().from(users).where(eq(users.id, row.userId));
  if (!user) return c.json({ error: 'Compte introuvable.', code: 'verify_invalid' }, 400);
  // Deuxième clic sur le même lien : ce n'est pas une erreur, l'adresse est simplement déjà confirmée.
  if (row.usedAt || user.emailVerifiedAt) {
    if (user.emailVerifiedAt) return c.json({ ok: true, email: user.email, alreadyVerified: true, message: 'Cette adresse est déjà confirmée : rien à faire.' }, 200);
    return c.json({ error: 'Ce lien a déjà été utilisé. Demandez un nouveau lien depuis vos paramètres.', code: 'verify_invalid' }, 400);
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return c.json({ error: 'Ce lien de confirmation a expiré (48 heures). Demandez-en un nouveau depuis vos paramètres.', code: 'verify_expired' }, 400);
  }

  await db.update(emailVerifications).set({ usedAt: new Date() }).where(eq(emailVerifications.userId, user.id));
  const already = user.emailVerifiedAt !== null;
  if (!already) await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
  void audit('email.verified', { actorEmail: user.email, target: user.id });
  return c.json({
    ok: true, email: user.email, alreadyVerified: already,
    message: already
      ? 'Cette adresse était déjà confirmée : vous pouvez envoyer et recevoir les alertes par e-mail.'
      : 'Adresse e-mail confirmée. Vous recevrez désormais les alertes de rupture et les rappels de commande.',
  });
});

/** Chantier 5 (audit) — renvoyer le lien de confirmation (personne connectée, jamais bloquante). */
authRoutes.post('/resend-verification', requireAuth, async (c) => {
  const db = await getDb(); const me = c.get('user');
  const [user] = await db.select().from(users).where(eq(users.id, me.id));
  if (!user) return c.json({ error: 'Utilisateur inconnu' }, 401);
  if (user.emailVerifiedAt) return c.json({ ok: true, alreadyVerified: true, message: 'Votre adresse e-mail est déjà confirmée.' }, 200);

  const { link } = await issueEmailVerification(user.id, user.email, { requestedIp: c.req.header('x-forwarded-for') ?? null });
  const TTL_H = Number(process.env.EMAIL_VERIFY_TTL_HOURS ?? 48);
  const mail = await sendMail({
    to: user.email, subject: 'AFRISUPPLY — votre lien de confirmation',
    text: `Bonjour ${user.fullName.split(' ')[0] || 'chef'},\n\nVoici un nouveau lien pour confirmer votre adresse (valable ${TTL_H} heures) : ${link}\n\nLes liens précédents ne fonctionnent plus.`,
    html: `<p>Bonjour ${user.fullName.split(' ')[0] || 'chef'},</p><p><a href="${link}">Confirmer mon adresse e-mail</a> (valable ${TTL_H} heures). Les liens précédents ne fonctionnent plus.</p>`,
    tags: { type: 'email_verification' },
  });
  void audit('email.verification.resent', { actorEmail: user.email, target: user.id, meta: { transport: mail.transport } });
  const status = mailStatus(mail, link, 'verification');
  return c.json({
    ok: true, ...status,
    message: status.delivered
      ? `Nouveau lien envoyé à ${user.email} (valable ${TTL_H} heures).`
      : status.warning,
  });
});

authRoutes.post('/login', async (c) => {
  const body = z.object({ email: z.string().email(), password: z.string() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, body.data.email.toLowerCase())).limit(1);
  if (!user || !(await verifyPassword(body.data.password, user.passwordHash))) { void audit('login.failed', { actorEmail: body.data.email.toLowerCase(), meta: { ip: c.req.header('x-forwarded-for') } }); return c.json({ error: 'E-mail ou mot de passe incorrect' }, 401); }
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  const token = await signToken({ id: user.id, email: user.email, fullName: user.fullName, tokenVersion: user.tokenVersion ?? 0 });
  setCookie(c, 'afs_token', token, cookieOpts);
  return c.json({
    token, user: { id: user.id, email: user.email, fullName: user.fullName },
    emailVerified: user.emailVerifiedAt !== null,
  });
});

authRoutes.post('/logout', (c) => { deleteCookie(c, 'afs_token', { path: '/' }); return c.json({ ok: true }); });

/** Règles de mot de passe, exposées publiquement pour que le web affiche les mêmes que le serveur. */
authRoutes.get('/password-policy', (c) => c.json({
  minLength: PASSWORD_MIN_LENGTH,
  hint: `Au moins ${PASSWORD_MIN_LENGTH} caractères, et pas un mot de passe courant (par exemple trois mots qui n’ont rien à voir entre eux).`,
}));

/**
 * Chantier 2 (audit) — mot de passe oublié.
 * Répond toujours 200 (aucune information sur l'existence du compte), mais n'envoie un lien
 * que si l'adresse correspond à un compte. Jeton aléatoire de 32 octets, stocké **haché**,
 * valable 1 h, à usage unique.
 */
authRoutes.post('/forgot-password', async (c) => {
  const body = z.object({ email: z.string().email() }).safeParse(await c.req.json().catch(() => ({})));
  const generic = { ok: true, message: 'Si un compte existe avec cette adresse, un lien de réinitialisation vient d’être envoyé (valable 1 heure).' };
  if (!body.success) return c.json(generic);
  const db = await getDb();
  const email = body.data.email.toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) { void audit('password.forgot.unknown', { actorEmail: email, meta: { ip: c.req.header('x-forwarded-for') } }); return c.json(generic); }

  const { link, expiryMinutes: RESET_TTL } = await issuePasswordLink(user.id, { requestedIp: c.req.header('x-forwarded-for') ?? null });
  const firstName = user.fullName.split(' ')[0] || 'chef';
  const res = await sendMail({
    to: user.email, subject: 'AFRISUPPLY — réinitialiser votre mot de passe',
    text: `Bonjour ${firstName},\n\nVous avez demandé à réinitialiser votre mot de passe AFRISUPPLY.\n\nLien (valable ${RESET_TTL} minutes) : ${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.`,
    html: `<p>Bonjour ${firstName},</p><p>Vous avez demandé à réinitialiser votre mot de passe AFRISUPPLY.</p><p><a href="${link}">Choisir un nouveau mot de passe</a> (lien valable ${RESET_TTL} minutes).</p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.</p>`,
    tags: { type: 'password_reset' },
  });
  void audit('password.forgot', { actorEmail: email, target: user.id, meta: { transport: res.transport } });
  const status = mailStatus(res, link, 'reset');
  return c.json({
    ...generic,
    ...status,
    // Chantier 5 : on ne prétend plus « lien envoyé » quand aucun e-mail ne peut partir.
    message: status.delivered
      ? generic.message
      : 'Compte trouvé, mais l’envoi d’e-mails n’est pas configuré sur ce serveur : demandez au support de vous transmettre votre lien, ou réessayez plus tard.',
  });
});

/** Chantier 2 (audit) — réinitialisation : jeton à usage unique, expiration, révocation des sessions ouvertes. */
authRoutes.post('/reset-password', async (c) => {
  const body = z.object({ token: z.string().min(10), password: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Lien incomplet : demandez un nouveau lien de réinitialisation.', code: 'reset_invalid' }, 400);
  const weak = passwordProblem(body.data.password);
  if (weak) return c.json({ error: weak, code: 'weak_password' }, 400);
  const db = await getDb();
  const [row] = await db.select().from(passwordResets)
    .where(and(eq(passwordResets.tokenHash, hashResetToken(body.data.token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date()))).limit(1);
  if (!row) return c.json({ error: 'Ce lien n’est plus valable (expiré ou déjà utilisé). Demandez-en un nouveau.', code: 'reset_invalid' }, 400);
  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user) return c.json({ error: 'Compte introuvable', code: 'reset_invalid' }, 400);

  await db.update(users).set({
    passwordHash: await hashPassword(body.data.password), tokenVersion: (user.tokenVersion ?? 0) + 1,
    // Chantier 5 : ouvrir un lien reçu par e-mail prouve la maîtrise de la boîte → adresse confirmée.
    ...(user.emailVerifiedAt === null ? { emailVerifiedAt: new Date() } : {}),
  }).where(eq(users.id, user.id));
  await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.userId, user.id));
  void audit('password.reset', { actorEmail: user.email, target: user.id, meta: { ip: c.req.header('x-forwarded-for') } });
  deleteCookie(c, 'afs_token', { path: '/' });
  return c.json({ ok: true, message: 'Mot de passe modifié. Toutes les sessions ouvertes ont été déconnectées : connectez-vous avec votre nouveau mot de passe.' });
});

/** Chantier 2 (audit) — changement de mot de passe (utilisateur connecté). Révoque toutes les autres sessions. */
authRoutes.post('/password', requireAuth, async (c) => {
  const body = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Mot de passe actuel et nouveau mot de passe requis.' }, 400);
  const db = await getDb(); const me = c.get('user');
  const [user] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  if (!user || !(await verifyPassword(body.data.currentPassword, user.passwordHash))) return c.json({ error: 'Mot de passe actuel incorrect.' }, 401);
  const weak = passwordProblem(body.data.newPassword);
  if (weak) return c.json({ error: weak, code: 'weak_password' }, 400);
  if (body.data.currentPassword === body.data.newPassword) return c.json({ error: 'Le nouveau mot de passe doit être différent de l’ancien.', code: 'weak_password' }, 400);

  const tokenVersion = (user.tokenVersion ?? 0) + 1;
  await db.update(users).set({ passwordHash: await hashPassword(body.data.newPassword), tokenVersion }).where(eq(users.id, user.id));
  // Le poste courant reste connecté : on lui délivre un jeton à jour, les autres sessions tombent.
  const token = await signToken({ id: user.id, email: user.email, fullName: user.fullName }, tokenVersion);
  setCookie(c, 'afs_token', token, cookieOpts);
  void audit('password.change', { actorEmail: user.email, target: user.id });
  return c.json({ ok: true, token, message: 'Mot de passe modifié. Vos autres appareils ont été déconnectés.' });
});

/** Chantier 2 (audit) — déconnexion de tous les appareils (révocation immédiate des jetons émis). */
authRoutes.post('/logout-all', requireAuth, async (c) => {
  const db = await getDb(); const me = c.get('user');
  const [user] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  if (!user) return c.json({ error: 'Utilisateur inconnu' }, 401);
  await db.update(users).set({ tokenVersion: (user.tokenVersion ?? 0) + 1 }).where(eq(users.id, user.id));
  deleteCookie(c, 'afs_token', { path: '/' });
  void audit('session.logout_all', { actorEmail: user.email, target: user.id });
  return c.json({ ok: true, message: 'Toutes vos sessions ont été fermées. Reconnectez-vous.' });
});

authRoutes.get('/me', requireAuth, async (c) => {
  const db = await getDb(); const user = c.get('user');
  const rows = await db.select({ restaurant: restaurants, role: restaurantMembers.role })
    .from(restaurantMembers).innerJoin(restaurants, eq(restaurants.id, restaurantMembers.restaurantId))
    .where(eq(restaurantMembers.userId, user.id));
  const isAdmin = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(user.email.toLowerCase());
  const [row] = await db.select({ emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, user.id));
  const emailVerifiedAt = row?.emailVerifiedAt ?? null;
  return c.json({
    user: { ...user, isAdmin, emailVerified: emailVerifiedAt !== null, emailVerifiedAt },
    restaurants: rows.map((r) => ({ ...r.restaurant, role: r.role })),
    mailTransport: mailerConfig().transport,
  });
});

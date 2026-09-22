// =============================================================
// Chantier 2 (audit) — MEMBRES ET RÔLES
//
// Les rôles existaient dans la base mais n'étaient ni attribuables ni appliqués.
// Ici : liste des membres, invitation par e-mail, changement de rôle, retrait.
// Règle de sécurité : le dernier propriétaire d'un restaurant ne peut être ni rétrogradé ni retiré.
// =============================================================
import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, ne, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { getDb, users, restaurants, restaurantMembers } from '@afrisupply/db';
import { requireAuth, requireRestaurant, requireMinRole, hashPassword, type Env } from '../lib/auth.js';
import { memberCap } from '../lib/billing.js';
import { issuePasswordLink } from '../lib/reset-link.js';
import { sendMail, devLinksAllowed } from '../lib/mailer.js';
import { audit } from '../lib/ops.js';

export const memberRoutes = new Hono<Env>();
memberRoutes.use('*', requireAuth, requireRestaurant);

const ROLES = ['owner', 'manager', 'staff'] as const;
type Role = (typeof ROLES)[number];

const membersOf = async (rid: string) =>
  (await getDb().then((db) => db.select({
    userId: restaurantMembers.userId, role: restaurantMembers.role, createdAt: restaurantMembers.createdAt,
    email: users.email, fullName: users.fullName, lastLoginAt: users.lastLoginAt,
  }).from(restaurantMembers).innerJoin(users, eq(users.id, restaurantMembers.userId))
    .where(eq(restaurantMembers.restaurantId, rid))));

const countOwners = async (rid: string) => {
  const db = await getDb();
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(restaurantMembers)
    .where(and(eq(restaurantMembers.restaurantId, rid), eq(restaurantMembers.role, 'owner')));
  return Number(row?.n ?? 0);
};

memberRoutes.get('/members', async (c) => {
  const rid = c.get('restaurantId');
  const list = await membersOf(rid);
  return c.json({
    members: list.map((m) => ({ ...m, isYou: m.userId === c.get('user').id })),
    me: { userId: c.get('user').id, role: c.get('role') },
    cap: memberCap(c.get('plan') ?? 'trial'),
    count: list.length,
    roles: ROLES.map((r) => ({
      role: r,
      label: r === 'owner' ? 'Propriétaire' : r === 'manager' ? 'Responsable' : 'Équipe',
      can: r === 'owner' ? ['tout'] : r === 'manager'
        ? ['fournisseurs', 'recettes', 'commandes', 'écarts', 'réglages', 'export des données']
        : ['stock', 'inventaire', 'réception', 'ventes', 'saisie express', 'listes de courses'],
    })),
  });
});

/** Invitation d'un membre par e-mail (propriétaire). */
memberRoutes.post('/members', requireMinRole('owner'), async (c) => {
  const body = z.object({
    email: z.string().email(), fullName: z.string().min(2).optional(), role: z.enum(ROLES).default('staff'),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const db = await getDb(); const rid = c.get('restaurantId'); const me = c.get('user');
  const email = body.data.email.toLowerCase();
  const [r] = await db.select({ name: restaurants.name }).from(restaurants).where(eq(restaurants.id, rid));

  let [user] = await db.select().from(users).where(eq(users.email, email));
  let invited = false;
  if (!user) {
    // Compte créé avec un mot de passe aléatoire jamais communiqué : la personne le définit via le lien reçu.
    const [created] = await db.insert(users).values({
      email, passwordHash: await hashPassword(randomBytes(24).toString('base64url')), fullName: body.data.fullName ?? email.split('@')[0],
    }).returning();
    user = created; invited = true;
  }
  const existing = await db.select({ role: restaurantMembers.role }).from(restaurantMembers)
    .where(and(eq(restaurantMembers.restaurantId, rid), eq(restaurantMembers.userId, user.id)));
  if (existing.length) return c.json({ error: `${user.fullName} fait déjà partie de l'équipe (${existing[0].role === 'owner' ? 'propriétaire' : existing[0].role === 'manager' ? 'responsable' : 'équipe'}).` }, 409);

  // Audit final G2 — « 3 utilisateurs » Starter doit être vrai : plafond par offre (Pro/essai 5, Business illimité).
  const cap = memberCap(c.get('plan') ?? 'trial');
  if (cap !== null) {
    const [row] = await db.select({ n: sql<number>`count(*)` }).from(restaurantMembers).where(eq(restaurantMembers.restaurantId, rid));
    if (Number(row?.n ?? 0) >= cap) {
      return c.json({ error: `Votre offre inclut ${cap} utilisateur${cap > 1 ? 's' : ''}. Passez à une formule supérieure (Abonnement) pour inviter toute votre équipe.`, code: 'member_limit', cap }, 402);
    }
  }

  await db.insert(restaurantMembers).values({ restaurantId: rid, userId: user.id, role: body.data.role });
  let devLink: string | undefined; let delivered = true;
  if (invited) {
    const { link, expiryMinutes } = await issuePasswordLink(user.id, { path: 'bienvenue', requestedIp: c.req.header('x-forwarded-for') ?? null, ttlMinutes: 7 * 24 * 60 });
    const res = await sendMail({
      to: email, subject: `${me.fullName} vous invite sur AFRISUPPLY — ${r?.name ?? 'restaurant'}`,
      text: `Bonjour,\n\n${me.fullName} vous ouvre l'accès à AFRISUPPLY pour « ${r?.name ?? 'le restaurant'} » avec le rôle ${body.data.role}.\n\nChoisissez votre mot de passe (lien personnel, valable ${Math.round(expiryMinutes / 1440)} jours) : ${link}\n\nÀ bientôt,\nAFRISUPPLY`,
      html: `<p>Bonjour,</p><p><b>${me.fullName}</b> vous ouvre l’accès à AFRISUPPLY pour « ${r?.name ?? 'le restaurant'} » avec le rôle <b>${body.data.role}</b>.</p><p><a href="${link}">Choisir mon mot de passe</a> (lien personnel, valable ${Math.round(expiryMinutes / 1440)} jours).</p><p>À bientôt,<br/>AFRISUPPLY</p>`,
      tags: { type: 'member_invite' },
    });
    // Chantier 5 (audit) : le lien n'est renvoyé que sur un poste de développement, et le message
    // ne prétend jamais que l'invitation est partie quand aucun e-mail ne peut être remis.
    delivered = res.ok && res.transport !== 'log';
    if (devLinksAllowed()) devLink = link;
    void audit('member.invite', { actorEmail: me.email, target: email, meta: { role: body.data.role, transport: res.transport, delivered } });
  } else {
    void audit('member.add', { actorEmail: me.email, target: email, meta: { role: body.data.role } });
  }
  return c.json({
    ok: true, invited, delivered,
    message: invited
      ? delivered
        ? `${email} a reçu un lien pour choisir son mot de passe et rejoindre l'équipe (${body.data.role}).`
        : `${user.fullName} est enregistré comme ${body.data.role}, mais l'e-mail d'invitation n'a pas pu être envoyé (envoi d'e-mails non configuré sur ce serveur). Demandez au support de vous transmettre le lien.`
      : `${user.fullName} a été ajouté à l'équipe avec le rôle ${body.data.role}.`,
    ...(delivered ? {} : { code: 'mail_not_delivered' }),
    ...(devLink ? { devLink } : {}),
  }, 201);
});

/** Changement de rôle (propriétaire). Le dernier propriétaire ne peut pas être rétrogradé. */
memberRoutes.patch('/members/:userId', requireMinRole('owner'), async (c) => {
  const body = z.object({ role: z.enum(ROLES) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Rôle invalide' }, 400);
  const db = await getDb(); const rid = c.get('restaurantId'); const target = c.req.param('userId');
  const [row] = await db.select().from(restaurantMembers).where(and(eq(restaurantMembers.restaurantId, rid), eq(restaurantMembers.userId, target)));
  if (!row) return c.json({ error: 'Membre introuvable' }, 404);
  if (row.role === 'owner' && body.data.role !== 'owner' && (await countOwners(rid)) <= 1) {
    return c.json({ error: 'Impossible : il doit rester au moins un propriétaire. Nommez d’abord quelqu’un d’autre propriétaire.' }, 409);
  }
  await db.update(restaurantMembers).set({ role: body.data.role }).where(and(eq(restaurantMembers.restaurantId, rid), eq(restaurantMembers.userId, target)));
  void audit('member.role', { actorEmail: c.get('user').email, target, meta: { from: row.role, to: body.data.role } });
  return c.json({ ok: true, role: body.data.role });
});

/** Retrait d'un membre (propriétaire). Le dernier propriétaire ne peut pas être retiré. */
memberRoutes.delete('/members/:userId', requireMinRole('owner'), async (c) => {
  const db = await getDb(); const rid = c.get('restaurantId'); const target = c.req.param('userId');
  if (target === c.get('user').id) return c.json({ error: 'Vous ne pouvez pas vous retirer vous-même : transférez d’abord la propriété du compte.' }, 409);
  const [row] = await db.select().from(restaurantMembers).where(and(eq(restaurantMembers.restaurantId, rid), eq(restaurantMembers.userId, target)));
  if (!row) return c.json({ error: 'Membre introuvable' }, 404);
  if (row.role === 'owner' && (await countOwners(rid)) <= 1) return c.json({ error: 'Impossible : il doit rester au moins un propriétaire.' }, 409);
  await db.delete(restaurantMembers).where(and(eq(restaurantMembers.restaurantId, rid), eq(restaurantMembers.userId, target)));
  // Si la personne n'est membre d'aucun autre restaurant, son compte est supprimé (elle n'a plus rien ici).
  const [other] = await db.select({ n: sql<number>`count(*)` }).from(restaurantMembers)
    .where(and(eq(restaurantMembers.userId, target), ne(restaurantMembers.restaurantId, rid)));
  if (Number(other?.n ?? 0) === 0) await db.delete(users).where(eq(users.id, target));
  void audit('member.remove', { actorEmail: c.get('user').email, target, meta: { role: row.role, accountDeleted: Number(other?.n ?? 0) === 0 } });
  return c.json({ ok: true });
});

export type { Role };

// Chantier 7 — Programme pilote : codes d'invitation, checklist « semaine 1 », retours (NPS/bugs/idées),
// mesure d'usage, cockpit admin (santé de chaque pilote) et rapport hebdo.
import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getDb, restaurants, restaurantMembers, users, leads, feedback, usageEvents, suppliers, supplierOffers, inventoryItems, recipes, sales, orders, deliveries, stockMovements, alerts } from '@afrisupply/db';
import { requireAuth, requireRestaurant, type Env } from '../lib/auth.js';
import { sendMail } from '../lib/mailer.js';
import { audit } from '../lib/ops.js';
import { FOUNDER_OFFER } from './public.js';

const isAdmin = (email: string) => (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
const APP = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const n = (v: unknown) => Number(v ?? 0);

/** Code d'invitation lisible : PILOTE-XXXX (sans caractères ambigus). */
export function makeInviteCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; return `PILOTE-${s}`; }

/** Étapes de la première semaine : id, libellé, comment on la détecte automatiquement. */
export const ONBOARDING_STEPS = [
  { id: 'carte', label: 'Configurer ma carte (recettes)', hint: 'Choisissez vos plats : le stock à suivre se déduit tout seul.', to: '/app/demarrer', auto: 'recipes' },
  { id: 'inventaire', label: 'Faire mon premier inventaire', hint: '10 minutes en saisie express, ou produit par produit.', to: '/app/express', auto: 'inventory' },
  { id: 'fournisseur', label: 'Ajouter mon fournisseur principal et ses prix', hint: 'Même 5 produits suffisent pour voir le comparateur travailler.', to: '/app/fournisseurs', auto: 'supplier' },
  { id: 'ventes', label: 'Saisir les ventes d’une journée', hint: '« vendu 40 mafé 25 yassa » — la prévision démarre.', to: '/app/express', auto: 'sales' },
  { id: 'commande', label: 'Envoyer une commande depuis l’app', hint: 'Panier intelligent → WhatsApp ou e-mail au fournisseur.', to: '/app/achats/panier', auto: 'order' },
  { id: 'reception', label: 'Réceptionner une livraison', hint: 'Cochez les écarts : le stock et les prix se mettent à jour.', to: '/app/achats', auto: 'delivery' },
  { id: 'app', label: 'Installer l’app sur mon téléphone', hint: 'Depuis le navigateur : « Ajouter à l’écran d’accueil ».', to: '/app/express', auto: null },
] as const;

/** Compte les objets clés d'un restaurant (sert à la checklist ET au score de santé). */
export async function activityCounts(rid: string) {
  const db = await getDb();
  const one = async (q: Promise<{ c: number }[]>) => n((await q)[0]?.c);
  const [recipesC, invC, supC, offC, salesC, ordersC, delivC, movC, alertsUnread] = await Promise.all([
    one(db.select({ c: sql<number>`count(*)` }).from(recipes).where(eq(recipes.restaurantId, rid))),
    one(db.select({ c: sql<number>`count(*)` }).from(inventoryItems).where(and(eq(inventoryItems.restaurantId, rid), sql`${inventoryItems.quantity} > 0`))),
    one(db.select({ c: sql<number>`count(*)` }).from(suppliers).where(eq(suppliers.restaurantId, rid))),
    one(db.select({ c: sql<number>`count(*)` }).from(supplierOffers).innerJoin(suppliers, eq(suppliers.id, supplierOffers.supplierId)).where(eq(suppliers.restaurantId, rid))),
    one(db.select({ c: sql<number>`count(*)` }).from(sales).where(eq(sales.restaurantId, rid))),
    one(db.select({ c: sql<number>`count(*)` }).from(orders).where(and(eq(orders.restaurantId, rid), sql`${orders.status} <> 'brouillon'`))),
    one(db.select({ c: sql<number>`count(*)` }).from(deliveries).where(eq(deliveries.restaurantId, rid))),
    one(db.select({ c: sql<number>`count(*)` }).from(stockMovements).where(eq(stockMovements.restaurantId, rid))),
    one(db.select({ c: sql<number>`count(*)` }).from(alerts).where(and(eq(alerts.restaurantId, rid), eq(alerts.isRead, false)))),
  ]);
  return { recipes: recipesC, inventory: invC, supplier: supC, offers: offC, sales: salesC, order: ordersC, delivery: delivC, movements: movC, alertsUnread };
}

export function stepsFor(counts: Awaited<ReturnType<typeof activityCounts>>, manual: string[]) {
  return ONBOARDING_STEPS.map((s) => {
    const auto = s.auto === 'recipes' ? counts.recipes > 0 : s.auto === 'inventory' ? counts.inventory > 0 : s.auto === 'supplier' ? counts.supplier > 0 && counts.offers > 0 : s.auto === 'sales' ? counts.sales > 0 : s.auto === 'order' ? counts.order > 0 : s.auto === 'delivery' ? counts.delivery > 0 : false;
    return { id: s.id, label: s.label, hint: s.hint, to: s.to, done: auto || manual.includes(s.id) };
  });
}

// ---------- Public : validation d'un code d'invitation ----------
export const pilotPublicRoutes = new Hono<Env>();
pilotPublicRoutes.get('/public/invite/:code', async (c) => {
  const code = c.req.param('code').toUpperCase().trim(); const db = await getDb();
  const [lead] = await db.select().from(leads).where(eq(leads.inviteCode, code));
  if (!lead) return c.json({ valid: false }, 404);
  if (lead.restaurantId) return c.json({ valid: false, used: true }, 410);
  return c.json({ valid: true, restaurantName: lead.restaurantName, contactName: lead.contactName, email: lead.email, city: lead.city, coversPerDay: lead.coversPerDay, offer: FOUNDER_OFFER });
});

// ---------- Restaurant : checklist, retours, usage ----------
export const pilotRoutes = new Hono<Env>();
pilotRoutes.use('*', requireAuth, requireRestaurant);

pilotRoutes.get('/onboarding/checklist', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const [r] = await db.select({ onboardingDone: restaurants.onboardingDone, founder: restaurants.founder, createdAt: restaurants.createdAt }).from(restaurants).where(eq(restaurants.id, rid));
  const steps = stepsFor(await activityCounts(rid), r.onboardingDone ?? []);
  const done = steps.filter((s) => s.done).length;
  const dayNumber = Math.floor((Date.now() - r.createdAt.getTime()) / 86_400_000) + 1;
  return c.json({ steps, done, total: steps.length, pct: Math.round((done / steps.length) * 100), dayNumber, founder: r.founder, dismissed: (r.onboardingDone ?? []).includes('_dismissed') });
});
pilotRoutes.post('/onboarding/checklist/:step', async (c) => {
  const rid = c.get('restaurantId'); const step = c.req.param('step'); const db = await getDb();
  if (![...ONBOARDING_STEPS.map((s) => s.id as string), '_dismissed'].includes(step)) return c.json({ error: 'Étape inconnue' }, 400);
  const [r] = await db.select({ onboardingDone: restaurants.onboardingDone }).from(restaurants).where(eq(restaurants.id, rid));
  const set = new Set(r.onboardingDone ?? []); set.add(step);
  await db.update(restaurants).set({ onboardingDone: [...set] }).where(eq(restaurants.id, rid));
  return c.json({ ok: true });
});

pilotRoutes.post('/feedback', async (c) => {
  const b = z.object({ kind: z.enum(['nps', 'bug', 'idee', 'question']), score: z.number().int().min(0).max(10).optional(), message: z.string().max(2000).optional(), page: z.string().max(200).optional() }).parse(await c.req.json());
  if (b.kind !== 'nps' && !b.message?.trim()) return c.json({ error: 'Dites-nous en un mot ce qui se passe 🙂' }, 400);
  const db = await getDb(); const rid = c.get('restaurantId'); const u = c.get('user');
  const [row] = await db.insert(feedback).values({ restaurantId: rid, userId: u.id, kind: b.kind, score: b.score, message: b.message?.trim() || null, page: b.page }).returning();
  const [r] = await db.select({ name: restaurants.name }).from(restaurants).where(eq(restaurants.id, rid));
  const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (admins.length && (b.kind === 'bug' || (b.kind === 'nps' && (b.score ?? 10) <= 6) || b.kind === 'question')) {
    const subject = b.kind === 'bug' ? `🐛 Bug signalé par ${r.name}` : b.kind === 'question' ? `❓ Question de ${r.name}` : `⚠️ NPS ${b.score}/10 — ${r.name}`;
    for (const to of admins) void sendMail({ to, subject, text: `${r.name} (${u.email}) — page ${b.page ?? '?'}\n\n${b.message ?? '(sans message)'}\n\n${APP()}/app/admin/pilotes`, html: `<p><b>${r.name}</b> (${u.email}) — page ${b.page ?? '?'}</p><p>${(b.message ?? '(sans message)').replace(/\n/g, '<br>')}</p><p><a href="${APP()}/app/admin/pilotes">Cockpit pilotes</a></p>`, tags: { type: 'feedback' } });
  }
  return c.json({ feedback: row, message: b.kind === 'nps' ? 'Merci ! Votre avis compte vraiment.' : 'Bien reçu — on vous répond sous 24 h ouvrées.' }, 201);
});
pilotRoutes.get('/feedback/nps-due', async (c) => {
  // Demander le NPS à J+14 et J+45, une seule fois par fenêtre.
  const db = await getDb(); const rid = c.get('restaurantId');
  const [r] = await db.select({ createdAt: restaurants.createdAt }).from(restaurants).where(eq(restaurants.id, rid));
  const day = Math.floor((Date.now() - r.createdAt.getTime()) / 86_400_000);
  const window = day >= 45 ? 45 : day >= 14 ? 14 : 0; if (!window) return c.json({ due: false });
  const since = new Date(r.createdAt.getTime() + (window - 1) * 86_400_000);
  const [last] = await db.select({ id: feedback.id }).from(feedback).where(and(eq(feedback.restaurantId, rid), eq(feedback.kind, 'nps'), gte(feedback.createdAt, since))).limit(1);
  return c.json({ due: !last, window });
});

/** Mesure d'usage minimaliste : le front envoie des lots d'événements (page vue, action). Pas de tiers, pas de cookie. */
pilotRoutes.post('/usage', async (c) => {
  const b = z.object({ events: z.array(z.object({ event: z.string().max(80), meta: z.record(z.unknown()).optional(), at: z.string().optional() })).max(50) }).parse(await c.req.json());
  if (!b.events.length) return c.json({ ok: true });
  const db = await getDb(); const rid = c.get('restaurantId'); const uid = c.get('user').id;
  await db.insert(usageEvents).values(b.events.map((e) => ({ restaurantId: rid, userId: uid, event: e.event, meta: e.meta, at: e.at ? new Date(e.at) : new Date() })));
  return c.json({ ok: true });
});

// ---------- Admin : cockpit pilotes ----------
export const pilotAdminRoutes = new Hono<Env>();
pilotAdminRoutes.use('/admin/pilots/*', requireAuth); pilotAdminRoutes.use('/admin/pilots', requireAuth);

/** Santé d'un pilote : activité 7 j, checklist, dernier login, NPS, retours ouverts → statut 🟢🟠🔴. */
export async function pilotHealth(rid: string, now = new Date()) {
  const db = await getDb();
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, rid));
  const counts = await activityCounts(rid); const steps = stepsFor(counts, r.onboardingDone ?? []);
  const since7 = new Date(now.getTime() - 7 * 86_400_000);
  const [{ c: events7 }] = await db.select({ c: sql<number>`count(*)` }).from(usageEvents).where(and(eq(usageEvents.restaurantId, rid), gte(usageEvents.at, since7)));
  const [{ c: sales7 }] = await db.select({ c: sql<number>`count(*)` }).from(sales).where(and(eq(sales.restaurantId, rid), gte(sales.day, since7.toISOString().slice(0, 10))));
  const [{ c: mov7 }] = await db.select({ c: sql<number>`count(*)` }).from(stockMovements).where(and(eq(stockMovements.restaurantId, rid), gte(stockMovements.createdAt, since7)));
  const [{ c: orders7 }] = await db.select({ c: sql<number>`count(*)` }).from(orders).where(and(eq(orders.restaurantId, rid), gte(orders.createdAt, since7), sql`${orders.status} <> 'brouillon'`));
  const members = await db.select({ email: users.email, fullName: users.fullName, lastLoginAt: users.lastLoginAt, role: restaurantMembers.role }).from(restaurantMembers).innerJoin(users, eq(users.id, restaurantMembers.userId)).where(eq(restaurantMembers.restaurantId, rid));
  const lastLogin = members.map((m) => m.lastLoginAt?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0);
  const daysSinceLogin = lastLogin ? Math.floor((now.getTime() - lastLogin) / 86_400_000) : null;
  const [nps] = await db.select({ score: feedback.score, at: feedback.createdAt }).from(feedback).where(and(eq(feedback.restaurantId, rid), eq(feedback.kind, 'nps'))).orderBy(desc(feedback.createdAt)).limit(1);
  const [{ c: openFeedback }] = await db.select({ c: sql<number>`count(*)` }).from(feedback).where(and(eq(feedback.restaurantId, rid), eq(feedback.status, 'nouveau'), sql`${feedback.kind} <> 'nps'`));
  const dayNumber = Math.floor((now.getTime() - r.createdAt.getTime()) / 86_400_000) + 1;
  const doneSteps = steps.filter((s) => s.done).length;
  const active7 = n(sales7) + n(mov7) + n(orders7) > 0 || n(events7) >= 5;
  let status: 'vert' | 'orange' | 'rouge' = 'vert'; const reasons: string[] = [];
  if (daysSinceLogin === null ? dayNumber > 3 : daysSinceLogin >= 7) { status = 'rouge'; reasons.push(daysSinceLogin === null ? 'jamais connecté' : `pas connecté depuis ${daysSinceLogin} j`); }
  else if (daysSinceLogin !== null && daysSinceLogin >= 3) { status = 'orange'; reasons.push(`pas connecté depuis ${daysSinceLogin} j`); }
  else if (!active7 && dayNumber > 3) { status = 'orange'; reasons.push('connecté mais sans saisie cette semaine'); }
  if (dayNumber >= 7 && doneSteps < 3) { status = status === 'rouge' ? 'rouge' : 'orange'; reasons.push(`checklist ${doneSteps}/${steps.length} après ${dayNumber} j`); }
  if (nps && (nps.score ?? 10) <= 6) { status = 'rouge'; reasons.push(`NPS ${nps.score}/10`); }
  if (n(openFeedback) > 0) reasons.push(`${n(openFeedback)} retour(s) sans réponse`);
  return { id: r.id, name: r.name, city: r.city, founder: r.founder, plan: r.plan, subscriptionStatus: r.subscriptionStatus, trialEndsAt: r.trialEndsAt, createdAt: r.createdAt, dayNumber, status, reasons, checklist: { done: doneSteps, total: steps.length }, counts, week: { events: n(events7), sales: n(sales7), movements: n(mov7), orders: n(orders7) }, daysSinceLogin, nps: nps ? { score: nps.score, at: nps.at } : null, openFeedback: n(openFeedback), members: members.map((m) => ({ email: m.email, fullName: m.fullName, role: m.role, lastLoginAt: m.lastLoginAt })) };
}

pilotAdminRoutes.get('/admin/pilots', async (c) => {
  if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403);
  const db = await getDb();
  const all = await db.select({ id: restaurants.id }).from(restaurants).orderBy(desc(restaurants.createdAt)).limit(200);
  const pilots = []; for (const r of all) pilots.push(await pilotHealth(r.id));
  const fb = await db.select({ f: feedback, restaurantName: restaurants.name }).from(feedback).innerJoin(restaurants, eq(restaurants.id, feedback.restaurantId)).orderBy(desc(feedback.createdAt)).limit(100);
  const npsScores = pilots.map((p) => p.nps?.score).filter((s): s is number => typeof s === 'number');
  const npsValue = npsScores.length ? Math.round(((npsScores.filter((s) => s >= 9).length - npsScores.filter((s) => s <= 6).length) / npsScores.length) * 100) : null;
  const invited = await db.select({ id: leads.id, restaurantName: leads.restaurantName, contactName: leads.contactName, email: leads.email, inviteCode: leads.inviteCode, invitedAt: leads.invitedAt, restaurantId: leads.restaurantId, status: leads.status }).from(leads).where(sql`${leads.inviteCode} is not null`).orderBy(desc(leads.invitedAt));
  return c.json({ pilots, feedback: fb.map(({ f, restaurantName }) => ({ ...f, restaurantName })), summary: { total: pilots.length, vert: pilots.filter((p) => p.status === 'vert').length, orange: pilots.filter((p) => p.status === 'orange').length, rouge: pilots.filter((p) => p.status === 'rouge').length, activeThisWeek: pilots.filter((p) => p.week.sales + p.week.movements + p.week.orders > 0).length, nps: npsValue, npsResponses: npsScores.length, founders: pilots.filter((p) => p.founder).length, founderSeatsLeft: Math.max(0, FOUNDER_OFFER.seats - pilots.filter((p) => p.founder).length) }, invited, steps: ONBOARDING_STEPS });
});

/** Inviter un lead : génère un code, envoie l'e-mail d'invitation avec le lien d'inscription pré-rempli. */
pilotAdminRoutes.post('/admin/pilots/invite', async (c) => {
  if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403);
  const b = z.object({ leadId: z.string().uuid().optional(), email: z.string().email().optional(), restaurantName: z.string().min(2).optional(), contactName: z.string().min(2).optional(), city: z.string().optional(), resend: z.boolean().optional() }).parse(await c.req.json());
  const db = await getDb();
  let lead = b.leadId ? (await db.select().from(leads).where(eq(leads.id, b.leadId)))[0] : undefined;
  if (!lead) {
    if (!b.email || !b.restaurantName || !b.contactName) return c.json({ error: 'E-mail, restaurant et contact requis' }, 400);
    [lead] = await db.insert(leads).values({ email: b.email.toLowerCase(), restaurantName: b.restaurantName, contactName: b.contactName, city: b.city, source: 'invitation', planInterest: 'pilote', status: 'pilote' }).returning();
  }
  if (lead.restaurantId) return c.json({ error: 'Ce lead a déjà un compte' }, 409);
  const code = lead.inviteCode && b.resend ? lead.inviteCode : makeInviteCode();
  await db.update(leads).set({ inviteCode: code, invitedAt: new Date(), status: 'pilote' }).where(eq(leads.id, lead.id));
  const link = `${APP()}/inscription?code=${code}`; const first = lead.contactName.split(' ')[0];
  const mail = await sendMail({ to: lead.email, subject: `${first}, votre accès pilote AFRISUPPLY est prêt 🎁`, tags: { type: 'invite' },
    text: `Bonjour ${first},\n\nBienvenue parmi les ${FOUNDER_OFFER.seats} restaurants pilotes fondateurs d'AFRISUPPLY !\n\nVotre code : ${code}\nCréez votre compte ici (2 minutes) : ${link}\n\nCe que ça vous donne :\n- ${FOUNDER_OFFER.trialDays} jours gratuits, sans carte bancaire\n- puis −${FOUNDER_OFFER.discountPct} % à vie sur la formule de votre choix\n- une ligne directe avec l'équipe (on répond sous 24 h)\n\nEn échange : vous utilisez l'app au quotidien et vous nous dites franchement ce qui coince.\n\nÀ très vite,\nL'équipe AFRISUPPLY`,
    html: `<p>Bonjour ${first},</p><p>Bienvenue parmi les <b>${FOUNDER_OFFER.seats} restaurants pilotes fondateurs</b> d'AFRISUPPLY !</p><p>Votre code : <b style="font-size:18px">${code}</b><br><a href="${link}" style="display:inline-block;margin-top:8px;padding:10px 16px;background:#c2410c;color:#fff;border-radius:10px;text-decoration:none">Créer mon compte (2 minutes)</a></p><ul><li>${FOUNDER_OFFER.trialDays} jours gratuits, sans carte bancaire</li><li>puis <b>−${FOUNDER_OFFER.discountPct} % à vie</b> sur la formule de votre choix</li><li>une ligne directe avec l'équipe (réponse sous 24 h)</li></ul><p>En échange : vous utilisez l'app au quotidien et vous nous dites franchement ce qui coince.</p><p>À très vite,<br>L'équipe AFRISUPPLY</p>` });
  await audit('pilot.invite', { actorEmail: c.get('user').email, target: lead.id, meta: { code, mail: mail.ok } });
  return c.json({ code, link, mail: mail.ok ? 'envoyé' : `non envoyé (${(mail as { error?: string }).error ?? mail.transport})`, lead: { ...lead, inviteCode: code } });
});

pilotAdminRoutes.put('/admin/pilots/feedback/:id', async (c) => {
  if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403);
  const b = z.object({ status: z.enum(['nouveau', 'traite']).optional(), published: z.boolean().optional() }).parse(await c.req.json());
  if (b.status === undefined && b.published === undefined) return c.json({ error: 'Rien à mettre à jour (status ou published).' }, 400);
  const db = await getDb();
  const [row] = await db.update(feedback).set({ ...(b.status !== undefined ? { status: b.status } : {}), ...(b.published !== undefined ? { published: b.published } : {}) }).where(eq(feedback.id, c.req.param('id'))).returning();
  return c.json({ feedback: row });
});

/** Rapport hebdo pilotes (envoyé le lundi par le job quotidien aux ADMIN_EMAILS). */
export async function buildWeeklyPilotReport(now = new Date()) {
  const db = await getDb();
  const all = await db.select({ id: restaurants.id }).from(restaurants);
  const pilots = []; for (const r of all) pilots.push(await pilotHealth(r.id, now));
  const since7 = new Date(now.getTime() - 7 * 86_400_000);
  const newFb = await db.select({ f: feedback, restaurantName: restaurants.name }).from(feedback).innerJoin(restaurants, eq(restaurants.id, feedback.restaurantId)).where(gte(feedback.createdAt, since7)).orderBy(desc(feedback.createdAt));
  const line = (p: Awaited<ReturnType<typeof pilotHealth>>) => `${p.status === 'vert' ? '🟢' : p.status === 'orange' ? '🟠' : '🔴'} ${p.name} (J${p.dayNumber}, checklist ${p.checklist.done}/${p.checklist.total}, ${p.week.sales} ventes · ${p.week.movements} mvts · ${p.week.orders} cmd)${p.reasons.length ? ' — ' + p.reasons.join(', ') : ''}`;
  const text = [`Rapport pilotes — semaine du ${now.toLocaleDateString('fr-FR')}`, '', `${pilots.length} restaurants · ${pilots.filter((p) => p.status === 'vert').length} 🟢 · ${pilots.filter((p) => p.status === 'orange').length} 🟠 · ${pilots.filter((p) => p.status === 'rouge').length} 🔴`, `Actifs cette semaine : ${pilots.filter((p) => p.week.sales + p.week.movements + p.week.orders > 0).length}`, '', ...pilots.sort((a, b) => ['rouge', 'orange', 'vert'].indexOf(a.status) - ['rouge', 'orange', 'vert'].indexOf(b.status)).map(line), '', `Retours de la semaine (${newFb.length}) :`, ...newFb.map(({ f, restaurantName }) => `- [${f.kind}${f.score !== null ? ` ${f.score}/10` : ''}] ${restaurantName} : ${f.message ?? ''}`), '', `${APP()}/app/admin/pilotes`].join('\n');
  return { text, html: `<pre style="font-family:ui-sans-serif,system-ui;white-space:pre-wrap">${text.replace(/</g, '&lt;')}</pre>`, pilots: pilots.length };
}

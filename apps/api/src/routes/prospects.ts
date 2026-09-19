// Admin — Prospection : carnet des restaurants et fournisseurs à démarcher (nom, adresse, téléphone, e-mail, suivi).
import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { getDb, prospects } from '@afrisupply/db';
import { requireAuth, type Env } from '../lib/auth.js';
import { audit } from '../lib/ops.js';
import { SignJWT, jwtVerify } from 'jose';
import { sendMail } from '../lib/mailer.js';
import { APP_URL } from '../jobs/daily.js';

// ---- Chantier 14 : invitation fournisseur pré-remplie (lien signé 30 jours) ----
const inviteSecret = () => new TextEncoder().encode(`invite:${process.env.JWT_SECRET ?? 'dev-secret-change-me-in-production'}`);
export type VendorInvite = { pid: string; name: string; city: string | null; phone: string | null; email: string | null; contactName: string | null };
export async function signVendorInvite(v: VendorInvite) { return new SignJWT(v).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(inviteSecret()); }
export async function readVendorInvite(token: string): Promise<VendorInvite | null> { try { const { payload } = await jwtVerify(token, inviteSecret()); return payload as unknown as VendorInvite; } catch { return null; } }
export const prospectPublicRoutes = new Hono<Env>();
prospectPublicRoutes.get('/public/vendor-invite/:token', async (c) => {
  const inv = await readVendorInvite(c.req.param('token')); if (!inv) return c.json({ error: 'Invitation invalide ou expirée' }, 404);
  const db = await getDb(); const [p] = await db.select({ status: prospects.status }).from(prospects).where(eq(prospects.id, inv.pid));
  return c.json({ invite: { ...inv, converted: p?.status === 'converti' } });
});

const isAdmin = (email: string) => (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
export const PROSPECT_STATUS = ['a_contacter', 'contacte', 'rdv', 'interesse', 'converti', 'perdu'] as const;
const body = z.object({
  kind: z.enum(['restaurant', 'fournisseur']), name: z.string().min(2).max(120), address: z.string().max(200).nullable().optional(), city: z.string().max(80).nullable().optional(),
  phone: z.string().max(30).nullable().optional(), email: z.string().email().nullable().optional().or(z.literal('')), contactName: z.string().max(80).nullable().optional(),
  status: z.enum(PROSPECT_STATUS).optional(), notes: z.string().max(4000).nullable().optional(), nextActionAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const prospectRoutes = new Hono<Env>();
prospectRoutes.use('/admin/prospects', requireAuth); prospectRoutes.use('/admin/prospects/*', requireAuth);
prospectRoutes.use('/admin/prospects', async (c, next) => { if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403); await next(); });
prospectRoutes.use('/admin/prospects/*', async (c, next) => { if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403); await next(); });

prospectRoutes.get('/admin/prospects', async (c) => {
  const db = await getDb(); const kind = c.req.query('kind'); const q = c.req.query('q')?.trim(); const status = c.req.query('status');
  const where = and(kind ? eq(prospects.kind, kind) : undefined, status ? eq(prospects.status, status) : undefined, q ? or(ilike(prospects.name, `%${q}%`), ilike(prospects.city, `%${q}%`), ilike(prospects.email, `%${q}%`), ilike(prospects.phone, `%${q}%`), ilike(prospects.contactName, `%${q}%`)) : undefined);
  const rows = await db.select().from(prospects).where(where).orderBy(desc(prospects.updatedAt)).limit(1000);
  const counts = await db.select({ kind: prospects.kind, status: prospects.status, c: sql<number>`count(*)` }).from(prospects).groupBy(prospects.kind, prospects.status);
  return c.json({ prospects: rows, counts: counts.map((x) => ({ ...x, c: Number(x.c) })), statuses: PROSPECT_STATUS });
});

prospectRoutes.post('/admin/prospects', async (c) => {
  const d = body.parse(await c.req.json()); const db = await getDb();
  const [row] = await db.insert(prospects).values({ ...d, email: d.email || null }).returning();
  await audit('prospect.create', { actorEmail: c.get('user').email, target: row.id, meta: { kind: d.kind, name: d.name } });
  return c.json({ prospect: row }, 201);
});

/** Import en masse : lignes { kind, name, address, city, phone, email, contactName } (collées depuis un tableur). */
prospectRoutes.post('/admin/prospects/import', async (c) => {
  const { rows } = z.object({ rows: z.array(z.record(z.unknown())).max(500) }).parse(await c.req.json());
  const kindDefault = (c.req.query('kind') as 'restaurant' | 'fournisseur' | undefined) ?? 'restaurant'; const db = await getDb();
  const rowSchema = body.partial({ kind: true });
  const valid = rows.map((r) => rowSchema.safeParse({ ...r, email: (r.email as string) || undefined })).filter((p) => p.success).map((p) => ({ ...p.data, kind: p.data.kind ?? kindDefault, email: p.data.email || null }));
  if (!valid.length) return c.json({ imported: 0 });
  const ins = await db.insert(prospects).values(valid).returning({ id: prospects.id });
  return c.json({ imported: ins.length, ignored: rows.length - valid.length });
});

prospectRoutes.put('/admin/prospects/:id', async (c) => {
  const d = body.partial().parse(await c.req.json()); const db = await getDb();
  const [row] = await db.update(prospects).set({ ...d, email: d.email === '' ? null : d.email, updatedAt: new Date() }).where(eq(prospects.id, c.req.param('id'))).returning();
  if (!row) return c.json({ error: 'Introuvable' }, 404);
  return c.json({ prospect: row });
});

prospectRoutes.delete('/admin/prospects/:id', async (c) => {
  const db = await getDb(); await db.delete(prospects).where(eq(prospects.id, c.req.param('id')));
  return c.json({ ok: true });
});

/** Génère un lien d'invitation fournisseur pré-rempli ; envoie l'e-mail si le prospect en a un ; renvoie aussi le texte WhatsApp. */
prospectRoutes.post('/admin/prospects/:id/invite-vendor', async (c) => {
  const db = await getDb(); const [p] = await db.select().from(prospects).where(eq(prospects.id, c.req.param('id')));
  if (!p) return c.json({ error: 'Introuvable' }, 404); if (p.kind !== 'fournisseur') return c.json({ error: 'Réservé aux prospects fournisseurs' }, 400);
  const body = z.object({ email: z.string().email().optional(), send: z.boolean().default(true) }).safeParse(await c.req.json().catch(() => ({}))); if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const email = body.data.email ?? p.email ?? null; if (body.data.email && body.data.email !== p.email) await db.update(prospects).set({ email: body.data.email, updatedAt: new Date() }).where(eq(prospects.id, p.id));
  const token = await signVendorInvite({ pid: p.id, name: p.name, city: p.city, phone: p.phone, email, contactName: p.contactName });
  const url = `${APP_URL()}/fournisseur?invite=${token}`;
  const first = p.contactName ? `Bonjour ${p.contactName}` : 'Bonjour';
  const text = `${first},\n\nAFRISUPPLY est la marketplace des restaurants africains de France : ils y comparent les grossistes et commandent en un clic.\n\nVotre fiche « ${p.name} » est déjà préparée. Il vous suffit de cliquer, de créer un mot de passe et de coller votre tarif (Excel, texte ou photo) : vous êtes en ligne en 10 minutes, sans engagement, commission uniquement sur les ventes.\n\n👉 ${url}\n\nLe lien est valable 30 jours. Répondez à ce message pour toute question.\n\nL'équipe AFRISUPPLY`;
  const whatsapp = `${first}, c'est AFRISUPPLY, la marketplace des restaurants africains. Votre fiche « ${p.name} » est prête : cliquez, créez un mot de passe, collez votre tarif et vous êtes en ligne en 10 min 👉 ${url}`;
  let mail: { ok: boolean; error?: string } = { ok: false, error: 'Pas d\'e-mail' };
  if (email && body.data.send) mail = await sendMail({ to: email, subject: `${p.name} : votre catalogue devant 200 restaurants africains — fiche déjà prête`, text, html: `<p>${text.replace(/\n/g, '<br/>').replace(url, `<a href="${url}">${url}</a>`)}</p>`, tags: { type: 'vendor-invite' } });
  await db.update(prospects).set({ status: p.status === 'a_contacter' ? 'contacte' : p.status, notes: `${p.notes ? p.notes + '\n' : ''}[${new Date().toLocaleDateString('fr-FR')}] Invitation fournisseur ${mail.ok ? 'envoyée par e-mail' : 'générée'}${email ? ` (${email})` : ''}`, updatedAt: new Date() }).where(eq(prospects.id, p.id));
  await audit('prospect.invite_vendor', { actorEmail: c.get('user').email, target: p.id, meta: { email, sent: mail.ok } });
  return c.json({ url, whatsapp, email, sent: mail.ok, mailError: mail.ok ? null : mail.error ?? null, message: mail.ok ? `Invitation envoyée à ${email}.` : 'Lien généré : copiez-le ou envoyez le message WhatsApp.' });
});

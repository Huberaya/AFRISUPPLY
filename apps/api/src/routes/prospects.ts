// Admin — Prospection : carnet des restaurants et fournisseurs à démarcher (nom, adresse, téléphone, e-mail, suivi).
import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { getDb, prospects } from '@afrisupply/db';
import { requireAuth, type Env } from '../lib/auth.js';
import { audit } from '../lib/ops.js';

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
  const { rows } = z.object({ rows: z.array(body.partial({ kind: true })).max(500) }).parse(await c.req.json());
  const kindDefault = (c.req.query('kind') as 'restaurant' | 'fournisseur' | undefined) ?? 'restaurant'; const db = await getDb();
  const valid = rows.filter((r) => r.name && r.name.length >= 2).map((r) => ({ ...r, kind: r.kind ?? kindDefault, email: r.email || null }));
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

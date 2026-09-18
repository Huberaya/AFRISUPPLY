// Routes publiques (site vitrine) : tarifs, demande d'accès (lead), + admin léger des leads.
import { Hono } from 'hono';
import { z } from 'zod';
import { desc, eq, sql } from 'drizzle-orm';
import { getDb, leads } from '@afrisupply/db';
import { requireAuth, type Env } from '../lib/auth.js';

export const publicRoutes = new Hono<Env>();

/** Source de vérité de l'offre commerciale (partagée site + app). */
export const PLANS = [
  { id: 'starter', name: 'Starter', priceMonthly: 39, tagline: 'Fini le cahier et les ruptures.', highlight: false,
    features: ['Stock avec statuts 🟢🟠🔴 et jours restants', 'Fiches fournisseurs & prix', 'Commandes WhatsApp / e-mail', 'Réception & écarts de livraison', 'Alertes rupture et hausse de prix', '1 établissement · 3 utilisateurs'] },
  { id: 'pro', name: 'Pro', priceMonthly: 89, tagline: 'L’intelligence qui fait gagner de la marge.', highlight: true,
    features: ['Tout Starter', 'Prévision des besoins 7 jours', 'Comparateur multi-fournisseurs', 'Panier intelligent & auto-reorder', 'Recettes, coût matière et marges', 'Assistant « Demander à l’IA »', 'Import CSV illimité'] },
  { id: 'business', name: 'Business', priceMonthly: 199, tagline: 'Pour les groupes et les ambitieux.', highlight: false,
    features: ['Tout Pro', 'Multi-établissements & consolidation', 'Achats groupés entre restaurants', 'Accès API & exports comptables', 'Accompagnement dédié', 'Utilisateurs illimités'] },
] as const;

export const FOUNDER_OFFER = { label: 'Offre pilote fondateur', discountPct: 50, seats: 20, trialDays: 30, description: '−50 % à vie pour les 20 premiers restaurants qui nous aident à construire le produit. Essai gratuit 30 jours, sans carte bancaire.' };

publicRoutes.get('/public/plans', (c) => c.json({ plans: PLANS, founderOffer: FOUNDER_OFFER, marketplaceCommissionPct: '2–5' }));

const leadBody = z.object({
  restaurantName: z.string().min(2).max(120), contactName: z.string().min(2).max(120), email: z.string().email(), phone: z.string().max(40).optional(),
  city: z.string().max(80).optional(), cuisine: z.string().max(80).optional(), coversPerDay: z.number().int().positive().max(5000).optional(),
  message: z.string().max(2000).optional(), planInterest: z.enum(['starter', 'pro', 'business', 'pilote']).optional(), source: z.string().max(40).optional(),
  utm: z.record(z.string()).optional(), website: z.string().optional(), // honeypot anti-spam : doit rester vide (sinon on répond ok sans enregistrer)
});

// anti-abus minimal en mémoire : 5 demandes / IP / heure
const hits = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now(); const arr = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  arr.push(now); hits.set(ip, arr); return arr.length > 5;
}

publicRoutes.post('/public/leads', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'local';
  if (rateLimited(ip)) return c.json({ error: 'Trop de demandes, réessayez dans une heure.' }, 429);
  const body = leadBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Formulaire incomplet', details: body.error.flatten() }, 400);
  if (body.data.website) return c.json({ ok: true }); // bot : on fait semblant
  const db = await getDb(); const d = body.data;
  const [lead] = await db.insert(leads).values({ ...d, source: d.source ?? 'site' }).returning({ id: leads.id });
  return c.json({ ok: true, id: lead.id, message: `Merci ${d.contactName.split(' ')[0]} ! On vous rappelle sous 24 h pour ouvrir votre accès.` }, 201);
});

// Admin léger : liste des leads (réservé aux utilisateurs dont l'e-mail est dans ADMIN_EMAILS)
publicRoutes.get('/admin/leads', requireAuth, async (c) => {
  const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!admins.includes(c.get('user').email.toLowerCase())) return c.json({ error: 'Accès réservé' }, 403);
  const db = await getDb();
  const rows = await db.select().from(leads).orderBy(desc(leads.createdAt)).limit(500);
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(leads);
  return c.json({ leads: rows, total: Number(total) });
});

publicRoutes.put('/admin/leads/:id', requireAuth, async (c) => {
  const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!admins.includes(c.get('user').email.toLowerCase())) return c.json({ error: 'Accès réservé' }, 403);
  const body = z.object({ status: z.enum(['nouveau', 'contacte', 'demo', 'pilote', 'client', 'perdu']).optional(), notes: z.string().nullable().optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb();
  const [row] = await db.update(leads).set(body.data).where(eq(leads.id, c.req.param('id') ?? '')).returning();
  if (!row) return c.json({ error: 'Lead introuvable' }, 404);
  return c.json(row);
});

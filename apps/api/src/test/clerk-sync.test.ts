import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations, getDb, users, restaurants, restaurantMembers } from '@afrisupply/db';
import { app } from '../app.js';
import { eq } from 'drizzle-orm';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_URL = '';
process.env.PGLITE_DIR = 'memory://clerk-test';

describe('Intégration Clerk & Base de données Neon', () => {
  beforeAll(async () => {
    await runMigrations();
  }, 60_000);

  it('synchronise un nouvel utilisateur Clerk, crée son profil et son restaurant', async () => {
    const clerkId = `user_clerk_test_${Date.now()}`;
    const email = `chef-${Date.now()}@afrisupply.com`;
    const fullName = 'Chef Ibrahim Test';

    const res = await app.request('/api/auth/clerk-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clerkId,
        email,
        fullName,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.token).toBeDefined();
    expect(data.user.email).toBe(email);
    expect(data.user.clerkId).toBe(clerkId);
    expect(data.restaurants.length).toBeGreaterThanOrEqual(1);
    expect(data.restaurants[0].role).toBe('owner');

    // Vérification en base de données
    const db = await getDb();
    const [dbUser] = await db.select().from(users).where(eq(users.clerkId, clerkId));
    expect(dbUser).toBeDefined();
    expect(dbUser.email).toBe(email);
    expect(dbUser.fullName).toBe(fullName);

    // Vérification des routes protégées avec le jeton généré
    const meRes = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${data.token}` },
    });
    expect(meRes.status).toBe(200);
    const meData = await meRes.json() as any;
    expect(meData.user.email).toBe(email);
  });

  it('associe clerk_id à un utilisateur existant par son e-mail sans perte de données', async () => {
    const db = await getDb();
    const existingEmail = `existant-${Date.now()}@afrisupply.com`;
    
    // Insérer un utilisateur pré-existant
    const [inserted] = await db.insert(users).values({
      email: existingEmail,
      fullName: 'Ancien Compte',
      lastLoginAt: new Date(),
    }).returning();

    const [existingRest] = await db.insert(restaurants).values({
      name: 'Mon Beau Restaurant',
      slug: `beau-resto-${Date.now()}`,
      plan: 'pro',
    }).returning();

    await db.insert(restaurantMembers).values({
      restaurantId: existingRest.id,
      userId: inserted.id,
      role: 'owner',
    });

    // Appel clerk-sync avec un nouveau clerkId pour le même e-mail
    const clerkId = `user_clerk_link_${Date.now()}`;
    const res = await app.request('/api/auth/clerk-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clerkId,
        email: existingEmail,
        fullName: 'Ancien Compte',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.user.id).toBe(inserted.id);
    expect(data.user.clerkId).toBe(clerkId);
    expect(data.restaurants.some((r: any) => r.id === existingRest.id)).toBe(true);

    // Vérifier la mise à jour en base
    const [updated] = await db.select().from(users).where(eq(users.id, inserted.id));
    expect(updated.clerkId).toBe(clerkId);
  });
});

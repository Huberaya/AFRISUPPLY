// Chantier 6 (audit) — destinataires des e-mails d'un restaurant, en un seul endroit :
// liste saisie dans les réglages si elle existe, sinon les membres non « staff » (propriétaire + managers).
import { eq } from 'drizzle-orm';
import { getDb, restaurantMembers, users } from '@afrisupply/db';

export interface Recipient { email: string; firstName: string }

export async function recipientsFor(rid: string, settingsRecipients?: string[]): Promise<Recipient[]> {
  if (settingsRecipients?.length) return settingsRecipients.map((e) => ({ email: e, firstName: 'chef' }));
  const db = await getDb();
  const rows = await db.select({ email: users.email, fullName: users.fullName, role: restaurantMembers.role })
    .from(restaurantMembers).innerJoin(users, eq(users.id, restaurantMembers.userId))
    .where(eq(restaurantMembers.restaurantId, rid));
  return rows.filter((r) => r.role !== 'staff').map((r) => ({ email: r.email, firstName: r.fullName.split(' ')[0] || 'chef' }));
}

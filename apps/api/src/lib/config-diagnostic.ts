// =============================================================
// Diagnostic de configuration (levée des réserves, chantiers B, C et D)
//
// Ce que l'application constate d'elle-même, là où elle tourne : quelles variables sont en place,
// quelles clés Clerk et pour quelle instance, quelle base et avec quel rôle PostgreSQL, quelles
// régions. C'est la réponse aux questions qu'on ne peut pas trancher depuis le dépôt — et que
// personne ne devrait trancher en lisant des secrets à l'écran.
//
// Règle : AUCUNE valeur de variable n'est renvoyée. Pour chaque variable : présente ou non. Pour un
// secret : conforme ou non. Les seules chaînes renvoyées sont des informations publiques par nature
// (domaine de l'instance Clerk, région) ou des identifiants techniques sans valeur d'accès (nom
// d'hôte de la base, nom du rôle PostgreSQL), et l'accès est réservé à l'exploitant.
// =============================================================
import { sql } from 'drizzle-orm';
import { getDb, getDatabaseUrl, databaseRegion, regionCheck, migrationStatus } from '@afrisupply/db';
import { checkSecureConfig, jwtSecretProblem, adminEmails, usesTestSender } from './security.js';
import { deploymentKind } from './environment.js';
import { clerkDiagnostic } from './clerk.js';
import { buildInfo, sentryEnabled } from './ops.js';
import { mailerConfig } from './mailer.js';
import { offsiteConfigured } from './offsite.js';

/** Variables dont la présence est rapportée (jamais la valeur). Tenue à jour par un test : toute variable lue par le code y figure. */
export const VARIABLES_SUIVIES = [
  // base et environnement
  'DATABASE_URL', 'PREVIEW_DATABASE_URL', 'MIGRATE_ON_BUILD', 'AUTO_MIGRATE', 'SKIP_MIGRATE', 'SEED_DEMO', 'ALLOW_DEMO_SEED', 'ALLOW_INSECURE_CONFIG',
  // sessions, origines, exploitation
  'JWT_SECRET', 'AUTH_TOKEN_TTL', 'CRON_SECRET', 'ADMIN_EMAILS', 'APP_URL', 'ALLOWED_ORIGINS', 'TRUST_PROXY', 'JOBS_SELF_URL', 'VENDOR_AUTO_APPROVE',
  // Clerk
  'VITE_CLERK_PUBLISHABLE_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY', 'CLERK_JWT_KEY', 'CLERK_AUTHORIZED_PARTIES',
  // e-mail, SMS
  'RESEND_API_KEY', 'MAIL_FROM', 'SUPPORT_EMAIL', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_SMS_FROM', 'TWILIO_WHATSAPP_FROM',
  // paiement, factures
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'BILLING_ENFORCE', 'INVOICE_COMPANY', 'INVOICE_SIRET', 'INVOICE_VAT',
  // sauvegardes, supervision, assistant
  'BACKUP_S3_ENDPOINT', 'BACKUP_S3_BUCKET', 'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY', 'BACKUP_S3_REGION', 'SENTRY_DSN', 'LLM_API_KEY',
] as const;

export type DatabaseDiagnostic = {
  driver: 'neon' | 'pglite';
  /** Nom d'hôte de la base (sans identifiant ni mot de passe) : il désigne la branche Neon réellement utilisée. */
  host: string | null;
  region: string | null;
  /** Rôle PostgreSQL de la connexion et ce qu'il peut faire au-delà de lire et d'écrire des lignes. */
  role: string | null; superuser: boolean | null; bypassRls: boolean | null; createRole: boolean | null; createDb: boolean | null;
  canCreateTables: boolean | null; canCreateTempTables: boolean | null;
  tables: number | null; rlsTables: number | null; rlsForced: number | null; policies: number | null;
  migrations: { state: string; expected: number | null; applied: number | null } | null;
  error: string | null;
};

export async function databaseDiagnostic(env: NodeJS.ProcessEnv = process.env): Promise<DatabaseDiagnostic> {
  const url = getDatabaseUrl(env);
  let host: string | null = null;
  try { host = url ? new URL(url).hostname : null; } catch { host = null; }
  const r = databaseRegion(env);
  const out: DatabaseDiagnostic = {
    driver: url ? 'neon' : 'pglite', host, region: r ? `${r.provider}/${r.region}` : null,
    role: null, superuser: null, bypassRls: null, createRole: null, createDb: null, canCreateTables: null, canCreateTempTables: null, tables: null, rlsTables: null, rlsForced: null, policies: null, migrations: null, error: null,
  };
  try {
    const db = await getDb();
    const res = await db.execute(sql`
      select current_user::text as role,
             (select rolsuper from pg_roles where rolname = current_user) as superuser,
             (select rolbypassrls from pg_roles where rolname = current_user) as bypass_rls,
             (select rolcreaterole from pg_roles where rolname = current_user) as create_role,
             (select rolcreatedb from pg_roles where rolname = current_user) as create_db,
             has_schema_privilege(current_user, 'public', 'CREATE') as can_create,
             has_database_privilege(current_user, current_database(), 'TEMPORARY') as can_temp,
             (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r') as tables,
             (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity) as rls_tables,
             (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relforcerowsecurity) as rls_forced,
             (select count(*)::int from pg_policies where schemaname = 'public') as policies`);
    const row = (res.rows ?? [])[0] as Record<string, unknown> | undefined;
    if (row) {
      const bool = (v: unknown) => (v === null || v === undefined ? null : v === true || v === 't' || v === 'true');
      out.role = row.role === null || row.role === undefined ? null : String(row.role);
      out.superuser = bool(row.superuser); out.bypassRls = bool(row.bypass_rls); out.createRole = bool(row.create_role); out.createDb = bool(row.create_db);
      out.canCreateTables = bool(row.can_create); out.canCreateTempTables = bool(row.can_temp);
      out.tables = Number(row.tables); out.rlsTables = Number(row.rls_tables); out.rlsForced = Number(row.rls_forced); out.policies = Number(row.policies);
    }
    const m = await migrationStatus();
    out.migrations = { state: m.state, expected: m.expected, applied: m.applied };
  } catch (e) {
    out.error = (e as Error).message.slice(0, 200);
  }
  return out;
}

export async function configDiagnostic(env: NodeJS.ProcessEnv = process.env) {
  const check = checkSecureConfig(env);
  const mc = mailerConfig();
  const from = mc.from ?? '';
  return {
    ...buildInfo(),
    environment: deploymentKind(env),
    checkedAt: new Date().toISOString(),
    // Conforme = présent, 32 caractères au moins, pas une valeur d'exemple. Ni la valeur ni sa longueur ne sortent d'ici.
    sessionSecret: { ok: jwtSecretProblem(env.JWT_SECRET) === null },
    config: { errors: check.errors.length, warnings: check.warnings },
    admins: { declared: adminEmails(env).length },
    clerk: await clerkDiagnostic(env),
    database: await databaseDiagnostic(env),
    regions: regionCheck(env),
    mail: { transport: mc.transport, from, testSender: mc.transport === 'resend' && usesTestSender(from) },
    backups: { offsiteConfigured: offsiteConfigured() },
    errorTracking: { configured: sentryEnabled() },
    cron: { configured: !!env.CRON_SECRET?.trim() },
    variables: Object.fromEntries(VARIABLES_SUIVIES.map((name) => [name, !!env[name]?.trim()])) as Record<(typeof VARIABLES_SUIVIES)[number], boolean>,
  };
}

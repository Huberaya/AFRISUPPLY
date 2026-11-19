// Nettoyage d'état d'un test : ce n'est PAS une opération de l'application.
//
// Sous AFS_DB_MINIMAL_ROLE=true, la base embarquée tourne sous le rôle applicatif `afrisupply_app`.
// Depuis la reprise P0-M (17 novembre 2026) ce rôle n'a plus le droit de supprimer des lignes des
// journaux (audit_log, price_history, stock_movements, order_events, usage_events, forecasts) ni des
// deux tables écrites en UPSERT (sales, vendor_credit_terms). Un test qui remet son décor à zéro doit
// donc le faire en propriétaire, puis rendre la main au rôle applicatif.
//
// Sur une base distante (Neon), le rôle est celui de la chaîne de connexion : on n'y touche pas.
import { getDb, type Db } from '@afrisupply/db';

const ROLE_APPLICATIF = 'afrisupply_app';
type Brut = { exec: (q: string) => Promise<unknown> };

/** Exécute `travail` avec les droits du propriétaire de la base, puis rend la main au rôle applicatif. */
export const enProprietaire = async <T>(travail: (db: Db) => Promise<T> | T): Promise<T> => {
  const db = await getDb();
  const brut = (db as unknown as { $client?: Brut }).$client;
  if (process.env.AFS_DB_MINIMAL_ROLE !== 'true' || !brut || typeof brut.exec !== 'function') return travail(db);
  await brut.exec('RESET ROLE');
  try {
    return await travail(db);
  } finally {
    await brut.exec(`SET ROLE ${ROLE_APPLICATIF}`);
  }
};

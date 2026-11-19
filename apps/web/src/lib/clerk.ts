// Clerk côté navigateur — activé uniquement si une clé publique est fournie au build.
//
// Chantier P0.2 : il n'y a plus de clé de repli écrite dans le code. Avant, sans variable, le site
// se branchait en silence sur une instance Clerk de développement (clé `pk_test_…`), y compris en
// production. Sans `VITE_CLERK_PUBLISHABLE_KEY`, la connexion Clerk n'est simplement pas proposée :
// la connexion par e-mail et mot de passe reste disponible.
//
// Levée des réserves (chantier B) : la clé doit convenir à l'environnement du déploiement.
//   - en production, une clé d'instance de développement (`pk_test_…`) n'est jamais activée ;
//   - sur une prévisualisation, une clé d'instance de production (`pk_live_…`) ne l'est pas non plus.
// Dans les deux cas le site se comporte comme sans clé : rien de Clerk n'est chargé. Le serveur
// applique la même règle de son côté (apps/api/src/lib/clerk-config.ts).
export const CLERK_PUBLISHABLE_KEY: string = ((import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) ?? '').trim();

/** Environnement du déploiement, fixé au build par vite.config.ts : « production », « preview », ou vide en local. */
declare const __AFS_DEPLOY_ENV__: string | undefined;
export const DEPLOY_ENV: string = typeof __AFS_DEPLOY_ENV__ === 'string' ? __AFS_DEPLOY_ENV__ : '';

export type ClerkActivation = { enabled: boolean; reason: null | 'cle_absente' | 'cle_de_developpement_en_production' | 'cle_de_production_en_previsualisation' };

export function clerkActivation(key: string, deployEnv: string): ClerkActivation {
  if (!key) return { enabled: false, reason: 'cle_absente' };
  if (deployEnv === 'production' && key.startsWith('pk_test_')) return { enabled: false, reason: 'cle_de_developpement_en_production' };
  if (deployEnv === 'preview' && key.startsWith('pk_live_')) return { enabled: false, reason: 'cle_de_production_en_previsualisation' };
  return { enabled: true, reason: null };
}

export const clerkEnabled = clerkActivation(CLERK_PUBLISHABLE_KEY, DEPLOY_ENV).enabled;

// Clerk côté navigateur — activé uniquement si une clé publique est fournie au build.
//
// Chantier P0.2 : il n'y a plus de clé de repli écrite dans le code. Avant, sans variable, le site
// se branchait en silence sur une instance Clerk de développement (clé `pk_test_…`), y compris en
// production. Sans `VITE_CLERK_PUBLISHABLE_KEY`, la connexion Clerk n'est simplement pas proposée :
// la connexion par e-mail et mot de passe reste disponible.
export const CLERK_PUBLISHABLE_KEY: string = ((import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) ?? '').trim();
export const clerkEnabled = CLERK_PUBLISHABLE_KEY.length > 0;

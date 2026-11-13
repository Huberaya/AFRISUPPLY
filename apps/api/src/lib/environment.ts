// Nature du déploiement (levée des réserves, chantier B) : production réelle, prévisualisation ou
// développement. Sur Vercel, NODE_ENV vaut « production » pour TOUS les déploiements, prévisualisations
// comprises : seul VERCEL_ENV les distingue. Les règles « réservé à la production » et « interdit en
// production » s'appuient sur cette fonction, jamais sur NODE_ENV seul.
export type DeploymentKind = 'production' | 'preview' | 'development';

export function deploymentKind(env: NodeJS.ProcessEnv = process.env): DeploymentKind {
  if (env.VERCEL || env.VERCEL_ENV) {
    return env.VERCEL_ENV === 'production' ? 'production' : env.VERCEL_ENV === 'preview' ? 'preview' : 'development';
  }
  return env.NODE_ENV === 'production' ? 'production' : 'development';
}

// Point d'entrée Vercel (fonction serverless Node) : toute l'API Hono sous /api/*.
// Les migrations ne sont pas exécutées ici (cold start) : lancer `npm run db:migrate` avant déploiement (voir docs/DEPLOIEMENT.md).
import { handle } from 'hono/vercel';
import { app } from '../apps/api/src/app.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

const handler = handle(app);
export default handler;
export const GET = handler, POST = handler, PUT = handler, PATCH = handler, DELETE = handler, OPTIONS = handler;

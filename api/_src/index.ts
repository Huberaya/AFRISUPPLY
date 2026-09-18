// Point d'entrée Vercel (fonction Node) : toute l'API Hono sous /api/*.
// Signature Node (req, res) via @hono/node-server → compatible quel que soit le mode de détection de Vercel.
// Les migrations ne sont pas exécutées ici (cold start) : `npm run db:migrate` avant déploiement (docs/DEPLOIEMENT.md).
import { getRequestListener } from '@hono/node-server';
import { app } from '../../apps/api/src/app.js';

export default getRequestListener(app.fetch);

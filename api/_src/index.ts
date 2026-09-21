// Point d'entrée Vercel (fonction Node) : toute l'API Hono sous /api/*.
// Signature Node (req, res) via @hono/node-server → compatible quel que soit le mode de détection de Vercel.
// Les migrations ne sont pas exécutées ici (cold start) : `npm run db:migrate` avant déploiement (docs/DEPLOIEMENT.md).
import { getRequestListener } from '@hono/node-server';
import { app } from '../../apps/api/src/app.js';
import { checkSecureConfig } from '../../apps/api/src/lib/security.js';

// Chantier 2 (audit) : la configuration est vérifiée au chargement de la fonction (cold start).
// On n'interrompt pas le service (une API en ligne vaut mieux qu'une API absente côté Vercel),
// mais toute anomalie est journalisée en clair pour être corrigée immédiatement.
const { errors, warnings } = checkSecureConfig();
if (warnings.length) console.warn('[config]', warnings.join(' | '));
if (errors.length) console.error('[config] 🛑 Configuration non sûre :', errors.join(' | '));

export default getRequestListener(app.fetch);

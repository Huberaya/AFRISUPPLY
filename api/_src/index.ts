// Point d'entrée Vercel (fonction Node) : toute l'API Hono sous /api/*.
// Signature Node (req, res) via @hono/node-server → compatible quel que soit le mode de détection de Vercel.
// Les migrations ne sont jamais exécutées ici (démarrage à froid) : voir scripts/deploy-migrate.mjs et docs/DEPLOIEMENT.md.
import { getRequestListener } from '@hono/node-server';
import { app } from '../../apps/api/src/app.js';
import { checkSecureConfig, configGateState } from '../../apps/api/src/lib/security.js';

// Chantier P0.4 : même règle que le serveur autonome. Celui-ci refuse de démarrer avec une
// configuration dangereuse ; une fonction ne peut pas « ne pas démarrer », donc l'application refuse
// de répondre (503 sur toutes les routes sauf /api/health) tant que la configuration n'est pas
// corrigée — voir le garde d'entrée dans apps/api/src/app.ts. Ici, on journalise le détail au
// chargement de la fonction pour que la cause soit lisible dans les journaux de la plateforme.
const { errors, warnings } = checkSecureConfig();
if (warnings.length) console.warn('[config]', warnings.join(' | '));
if (errors.length) console.error(`[config] 🛑 Configuration non sûre${configGateState().blocked ? ' — l\'API répond 503 tant qu\'elle n\'est pas corrigée' : ''} :`, errors.join(' | '));

export default getRequestListener(app.fetch);

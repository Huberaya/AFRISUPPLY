// Miroir client de l'offre (source serveur : GET /api/public/plans). Gardé en local pour un rendu instantané du site.
export type Plan = { id: 'starter' | 'pro' | 'business'; name: string; priceMonthly: number; tagline: string; highlight: boolean; features: readonly string[] };
export const PLANS: Plan[] = [
  { id: 'starter', name: 'Starter', priceMonthly: 39, tagline: 'Fini le cahier et les ruptures.', highlight: false, features: ['Stock avec statuts 🟢🟠🔴 et jours restants', 'Fiches fournisseurs & prix', 'Commandes WhatsApp / e-mail', 'Réception & écarts de livraison', 'Alertes rupture et hausse de prix', '1 établissement · 3 utilisateurs'] },
  { id: 'pro', name: 'Pro', priceMonthly: 89, tagline: 'L’intelligence qui fait gagner de la marge.', highlight: true, features: ['Tout Starter', 'Prévision des besoins 7 jours', 'Comparateur multi-fournisseurs', 'Panier intelligent & auto-reorder', 'Recettes, coût matière et marges', 'Assistant « Demander à l’IA »', 'Import CSV illimité'] },
  { id: 'business', name: 'Business', priceMonthly: 199, tagline: 'Pour les groupes et les ambitieux.', highlight: false, features: ['Tout Pro', 'Multi-établissements & consolidation', 'Achats groupés entre restaurants', 'Accès API & exports comptables', 'Accompagnement dédié', 'Utilisateurs illimités'] },
];
export const FOUNDER = { discountPct: 50, seats: 20, trialDays: 30 };
export const FAQ: { q: string; a: string }[] = [
  { q: 'Mes fournisseurs doivent-ils s’inscrire ?', a: 'Non. Vous envoyez vos commandes par WhatsApp ou e-mail depuis AFRISUPPLY, avec un message déjà rédigé. Vos fournisseurs ne changent rien à leurs habitudes.' },
  { q: 'Combien de temps pour démarrer ?', a: '15 minutes : vous choisissez vos plats parmi nos recettes types (mafé, thiéb, attiéké poisson, ndolé…), l’app en déduit vos produits, vous saisissez ou importez vos fournisseurs, et vous faites un premier inventaire.' },
  { q: 'D’où viennent les prévisions ?', a: 'De vos propres ventes : vous saisissez vos couverts par plat chaque soir (30 secondes). L’app apprend votre semaine (le samedi n’est pas le mardi) et calcule les besoins par produit. Chaque chiffre est expliqué, rien n’est une boîte noire.' },
  { q: 'L’IA commande-t-elle à ma place ?', a: 'Jamais. Elle prépare des commandes et vous alerte ; c’est toujours vous qui validez et envoyez.' },
  { q: 'Connaissez-vous vraiment les produits africains ?', a: 'Le référentiel compte 324 produits (attiéké, gari, placali, bissap, huile de palme rouge, poisson fumé, épices…) avec leurs alias (garba, okra, gombo, lalo…). Vous pouvez ajouter vos produits privés.' },
  { q: 'Et si j’ai plusieurs restaurants ?', a: 'Le plan Business consolide vos établissements et permet les achats groupés. Le plan Pro couvre un établissement.' },
  { q: 'Mes données sont-elles à moi ?', a: 'Oui. Hébergées en Europe, exportables en CSV à tout moment, jamais revendues. Vous pouvez résilier à tout moment.' },
  { q: 'Comment fonctionne l’offre pilote ?', a: '30 jours gratuits sans carte bancaire. Les 20 premiers restaurants qui nous aident à améliorer le produit gardent −50 % à vie sur leur abonnement.' },
];

import { SUPPORT_EMAIL } from '../../lib/support';
export default function Legal() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 lg:px-8 space-y-4 text-stone-700 [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:text-stone-900 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-stone-900 text-sm leading-relaxed">
      <h1>Mentions légales & confidentialité</h1>
      <p className="text-sm text-stone-500">Version de travail — à compléter avec la raison sociale, le SIREN et l’adresse du siège avant mise en ligne (chantier 7).</p>
      <h2>Éditeur</h2><p>AFRISUPPLY — [forme juridique, capital, SIREN, adresse], Nantes, France. Contact : {SUPPORT_EMAIL}.</p>
      <h2>Hébergement</h2><p>Application et base de données hébergées dans l’Union européenne (Neon — région Francfort ; front sur Vercel — région Paris).</p>
      <h2>Données personnelles (RGPD)</h2>
      <p>Données collectées : identité et coordonnées de contact (formulaire d’accès, compte utilisateur), données d’exploitation saisies par le restaurant (stocks, fournisseurs, prix, recettes, ventes). Finalités : fourniture du service, support, amélioration du produit. Base légale : exécution du contrat et intérêt légitime. Durée : durée du contrat + 3 ans pour les prospects.</p>
      <p>Vous disposez d’un droit d’accès, de rectification, d’effacement, de portabilité (export complet JSON et CSV depuis Paramètres → Mes données) et de suppression du compte (Paramètres → Zone dangereuse) et d’opposition : {SUPPORT_EMAIL}. Aucune donnée n’est vendue à des tiers. Les données de prix agrégées et anonymisées peuvent servir à des indices de marché sans jamais identifier un restaurant ou un fournisseur.</p>
      <h2>Cookies</h2><p>Le site vitrine n’utilise aucun cookie tiers. L’application stocke un jeton de session dans le navigateur, strictement nécessaire au fonctionnement.</p>
      <h2>Propriété intellectuelle</h2><p>Le référentiel de produits, les recettes types et les moteurs d’analyse sont la propriété d’AFRISUPPLY. Les données saisies par le restaurant restent sa propriété.</p>
    </div>
  );
}

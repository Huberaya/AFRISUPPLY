const cls = 'mx-auto max-w-3xl px-4 py-16 lg:px-8 space-y-4 text-stone-700 [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:text-stone-900 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-stone-900 text-sm leading-relaxed';
export default function Terms() {
  return (
    <div className={cls}>
      <h1>Conditions générales de vente et d’utilisation</h1>
      <p className="text-sm text-stone-500">Version 1.0 — septembre 2026. À faire relire par un conseil avant la première facturation.</p>
      <h2>1. Objet</h2><p>AFRISUPPLY est un logiciel en ligne (SaaS) d’aide à l’approvisionnement destiné aux restaurants : suivi de stock, comparaison de fournisseurs, prévisions, alertes et préparation de commandes. AFRISUPPLY n’est ni vendeur ni transporteur : les commandes sont conclues directement entre le restaurant et ses fournisseurs.</p>
      <h2>2. Compte et accès</h2><p>Le compte est ouvert au nom d’un restaurant par une personne habilitée à l’engager. Les identifiants sont personnels ; le titulaire est responsable des accès qu’il attribue à son équipe. Période d’essai : 30 jours, sans carte bancaire.</p>
      <h2>3. Formules et prix</h2><p>Starter 39 € HT/mois, Pro 89 € HT/mois, Business 199 € HT/mois, sans engagement, payables mensuellement d’avance par carte. Offre pilote : −50 % à vie pour les 20 premiers restaurants, tant que l’abonnement reste actif. Les prix peuvent évoluer avec un préavis de 30 jours ; les remises pilotes sont maintenues.</p>
      <h2>4. Résiliation</h2><p>À tout moment depuis les paramètres ; l’accès reste ouvert jusqu’à la fin de la période payée. Les données restent exportables 30 jours après la fermeture, puis sont supprimées.</p>
      <h2>5. Prévisions et recommandations</h2><p>Les prévisions, alertes et paniers proposés sont des aides à la décision calculées à partir des données saisies. Le restaurant reste seul décisionnaire de ses commandes ; AFRISUPPLY ne garantit ni l’absence de rupture ni un niveau d’économie.</p>
      <h2>6. Données</h2><p>Les données saisies restent la propriété du restaurant. AFRISUPPLY les héberge dans l’Union européenne, ne les vend pas et ne les partage pas avec des tiers, hors sous-traitants techniques (hébergement, envoi d’e-mails). Des indices de prix agrégés et anonymisés peuvent être calculés sans jamais identifier un restaurant ou un fournisseur. Export complet et suppression du compte disponibles à tout moment dans l’application.</p>
      <h2>7. Disponibilité et support</h2><p>Objectif de disponibilité 99,5 % mensuel hors maintenance annoncée. État de la plateforme : <a className="underline" href="/statut">/statut</a>. Support par e-mail et WhatsApp, jours ouvrés 9 h–19 h.</p>
      <h2>8. Responsabilité</h2><p>La responsabilité d’AFRISUPPLY est limitée aux sommes versées au cours des 12 derniers mois. Elle ne couvre pas les pertes indirectes (marchandises, chiffre d’affaires) liées à une décision d’achat.</p>
      <h2>9. Droit applicable</h2><p>Droit français. Tribunal de commerce de Nantes, après tentative de règlement amiable.</p>
    </div>
  );
}

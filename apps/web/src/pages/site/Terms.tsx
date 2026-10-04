const cls = 'mx-auto max-w-3xl px-4 py-16 lg:px-8 space-y-4 text-stone-700 [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:text-stone-900 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-stone-900 text-sm leading-relaxed';

export default function Terms() {
  return (
    <div className={cls}>
      <h1>Conditions générales de vente et d’utilisation</h1>
      <p className="text-sm text-stone-500">Version 1.0 — En vigueur au 1er octobre 2026. Applicable aux restaurants abonnés au service AFRISUPPLY.</p>

      <h2>1. Objet</h2>
      <p>
        AFRISUPPLY est un logiciel en ligne (SaaS) d’aide à l’approvisionnement destiné aux restaurants professionnels : suivi de stock, comparaison de fournisseurs, prévisions des besoins, alertes de rupture et préparation de commandes.
      </p>
      <p>
        <b>Rôle d’intermédiaire technique :</b> AFRISUPPLY n’est ni vendeur grossiste, ni transporteur, ni mandataire d’achat : les contrats d'achat de marchandises sont conclus directement et exclusivement entre le restaurant et ses fournisseurs indépendants.
      </p>

      <h2>2. Compte et accès</h2>
      <p>
        Le compte est ouvert au nom d’un restaurant professionnel par son gérant ou une personne habilitée à l’engager. Les identifiants sont personnels et confidentiels ; le titulaire est seul responsable des accès qu’il attribue aux membres de son équipe.
      </p>
      <p>
        <b>Période d’essai :</b> Chaque nouvel établissement bénéficie de 30 jours d’essai gratuit, sans engagement et sans carte bancaire requise.
      </p>

      <h2>3. Formules, tarifs et facturation</h2>
      <p>
        Les tarifs sont établis en euros hors taxes (HT) : <b>Starter à 39 € HT/mois</b>, <b>Pro à 89 € HT/mois</b>, et <b>Business à 199 € HT/mois</b>. Les abonnements sont sans engagement de durée, payables mensuellement d’avance par carte bancaire.
      </p>
      <p>
        <b>Offre pilote fondateur :</b> Une remise exclusive de −50 % à vie est garantie aux 20 premiers restaurants inscrits au programme pilote, tant que leur abonnement demeure actif.
      </p>

      <h2>4. Résiliation</h2>
      <p>
        L'abonnement peut être résilié à tout moment en un clic depuis l'espace <i>Paramètres → Abonnement</i>. L’accès au service reste ouvert jusqu’à la fin de la période mensuelle en cours. L’ensemble des données métier reste exportable pendant 30 jours consécutifs à la fermeture.
      </p>

      <h2>5. Prévisions et recommandations (Aide à la décision)</h2>
      <p>
        Les prévisions de consommation, suggestions de commandes (SmartCart) et alertes sont des <b>aides à la décision</b> purement algorithmiques calculées à partir des déclarations saisies par le restaurant.
      </p>
      <p>
        Le restaurant demeure le seul et unique décisionnaire de ses commandes et de ses approvisionnements. AFRISUPPLY ne saurait garantir l’absence totale de rupture d'ingrédients ni un niveau forfaitaire d’économies financières.
      </p>

      <h2>6. Propriété et protection des données (RGPD)</h2>
      <p>
        Les données métier saisies (mercuriales de prix, stocks, fiches recettes, contacts fournisseurs) demeurent la <b>propriété exclusive du restaurant</b>.
      </p>
      <p>
        AFRISUPPLY héberge l'ensemble des données au sein de l’Union européenne, ne commercialise aucune donnée à des tiers et assure un droit d’accès, d'export universel (JSON) et d'effacement total dans le respect du RGPD.
      </p>

      <h2>7. Disponibilité et support technique</h2>
      <p>
        AFRISUPPLY s'engage sur un objectif de disponibilité mensuelle de 99,5 % hors fenêtres de maintenance programmées. L'état en direct des services est consultable publiquement sur <a className="underline text-brand-700" href="/statut">/statut</a>.
      </p>
      <p>
        Le support client est assuré par e-mail et messagerie WhatsApp dédiée, du lundi au vendredi de 9 h à 19 h.
      </p>

      <h2>8. Limitation de responsabilité</h2>
      <p>
        La responsabilité globale d’AFRISUPPLY au titre du service SaaS est expressément plafonnée au montant cumulé des sommes effectivement versées par le restaurant au cours des 12 derniers mois. AFRISUPPLY ne saurait être tenu responsable des pertes indirectes d'exploitation (marchandises avariées, manque à gagner sur un service).
      </p>

      <h2>9. Droit applicable et attribution de juridiction</h2>
      <p>
        Les présentes conditions sont régies par le droit français. En cas de contestation sur l'interprétation ou l'exécution du contrat, les parties s'engagent à rechercher préalablement un règlement amiable. À défaut, compétence expresse est attribuée au <b>Tribunal de commerce de Nantes</b>.
      </p>
    </div>
  );
}

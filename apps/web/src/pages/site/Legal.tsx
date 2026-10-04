import { SUPPORT_EMAIL } from '../../lib/support';

export default function Legal() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 lg:px-8 space-y-4 text-stone-700 [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:text-stone-900 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-stone-900 text-sm leading-relaxed">
      <h1>Mentions légales & politique de confidentialité</h1>
      <p className="text-sm text-stone-500">Dernière mise à jour : octobre 2026 — Conforme au Règlement Général sur la Protection des Données (RGPD 2016/679) et au Code de commerce français.</p>

      <h2>1. Éditeur de la plateforme</h2>
      <p>
        La plateforme <b>AFRISUPPLY</b> est éditée par la société <b>AFRISUPPLY SAS</b> (société par actions simplifiée en cours d'immatriculation au Registre du Commerce et des Sociétés de Nantes).
      </p>
      <p>
        <b>Siège social :</b> 1 rue des Halles, 44000 Nantes, France.<br />
        <b>Direction de la publication :</b> Direction générale AFRISUPPLY.<br />
        <b>Contact et support client :</b> <a href={`mailto:${SUPPORT_EMAIL}`} className="underline text-brand-700">{SUPPORT_EMAIL}</a>.
      </p>

      <h2>2. Hébergement & infrastructure technique</h2>
      <p>
        L'ensemble des serveurs et des bases de données d'AFRISUPPLY est situé sur le territoire de l'<b>Union européenne</b> :
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <b>Base de données relationnelle (PostgreSQL) :</b> Hébergée par <b>Neon Inc.</b> sur l'infrastructure AWS située à Francfort (région <code>eu-central-1</code>, Allemagne). Chiffrement au repos (AES-256) et en transit (TLS 1.3).
        </li>
        <li>
          <b>Serveurs applicatifs et distribution web :</b> Hébergés par <b>Vercel Inc.</b> sur des points de présence situés à Paris (France) et au sein de l'Union européenne.
        </li>
      </ul>

      <h2>3. Données personnelles & Conformité RGPD</h2>
      <p>
        AFRISUPPLY traite les données personnelles dans le strict respect du Règlement (UE) 2016/679 (RGPD) et de la loi Informatique et Libertés.
      </p>
      <p>
        <b>Données traitées :</b> données d'identité (nom, prénom, adresse e-mail professionnelle, numéro de téléphone), informations sur l'établissement (nom du restaurant, ville, capacité de couverts), et données opérationnelles d'approvisionnement (stocks, fiches fournisseurs, mercuriales de prix, commandes, factures et fiches recettes).
      </p>
      <p>
        <b>Finalités du traitement :</b>
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Exécution du contrat de service SaaS et gestion de l'abonnement.</li>
        <li>Génération déterministe des calculs de réapprovisionnement, prévisions et alertes de rupture.</li>
        <li>Émission et transmission des bons de commande aux fournisseurs choisis par le restaurant.</li>
        <li>Support technique, sécurisation du compte et assistance client.</li>
      </ul>
      <p>
        <b>Durée de conservation :</b> les données d'exploitation sont conservées pendant toute la durée active de l'abonnement, puis archivées pendant 30 jours après résiliation avant purge définitive. Les factures et pièces comptables sont archivées 10 ans conformément aux obligations du Code de commerce.
      </p>

      <h2>4. Droits des utilisateurs (Droit d'accès, portabilité et effacement)</h2>
      <p>
        Chaque utilisateur et restaurateur bénéficie des droits garantis par les articles 15 à 22 du RGPD :
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <b>Droit d'accès et à la portabilité (Art. 20) :</b> Un export exhaustif de l'intégralité de vos données (recettes, prix, stocks, commandes, historique) au format universel JSON est accessible à tout moment dans l'application via <i>Paramètres → Exporter mes données</i> (route <code>/api/account/export</code>).
        </li>
        <li>
          <b>Droit à l'effacement (« Droit à l'oubli » - Art. 17) :</b> Vous pouvez demander à tout moment la suppression totale et irréversible de votre compte et de vos données d'établissement depuis <i>Paramètres → Zone dangereuse</i> (route <code>/api/account</code>). La suppression purge en cascade toutes les données rattachées.
        </li>
        <li>
          <b>Droit d'opposition et de rectification :</b> Exerçable par e-mail direct à <a href={`mailto:${SUPPORT_EMAIL}`} className="underline text-brand-700">{SUPPORT_EMAIL}</a>. Vous disposez également du droit d'introduire une réclamation auprès de la CNIL (Commission Nationale de l'Informatique et des Libertés - <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="underline">cnil.fr</a>).
        </li>
      </ul>

      <h2>5. Registre des sous-traitants ultérieurs (DPA)</h2>
      <p>
        Pour assurer le fonctionnement du service, AFRISUPPLY fait appel à des prestataires techniques spécialisés respectant des engagements de conformité stricts :
      </p>
      <div className="overflow-x-auto my-2">
        <table className="w-full text-xs border border-stone-200 divide-y divide-stone-200">
          <thead className="bg-stone-50 text-stone-700 font-semibold">
            <tr>
              <th className="p-2 text-left">Sous-traitant</th>
              <th className="p-2 text-left">Rôle / Prestation</th>
              <th className="p-2 text-left">Localisation</th>
              <th className="p-2 text-left">Garantie de transfert</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            <tr>
              <td className="p-2 font-medium">Neon Inc.</td>
              <td className="p-2">Base de données PostgreSQL managée</td>
              <td className="p-2">Francfort (Allemagne, UE)</td>
              <td className="p-2">Serveurs hébergés dans l'UE, DPA conforme RGPD</td>
            </tr>
            <tr>
              <td className="p-2 font-medium">Vercel Inc.</td>
              <td className="p-2">Hébergement frontend et fonctions API edge</td>
              <td className="p-2">Paris (France, UE)</td>
              <td className="p-2">Clauses contractuelles types (CCT) & DPA</td>
            </tr>
            <tr>
              <td className="p-2 font-medium">Stripe Payments Europe Ltd</td>
              <td className="p-2">Gestion des paiements et abonnements récurrents</td>
              <td className="p-2">Dublin (Irlande, UE)</td>
              <td className="p-2">Agrément bancaire européen, certifié PCI-DSS Level 1</td>
            </tr>
            <tr>
              <td className="p-2 font-medium">Resend Inc.</td>
              <td className="p-2">Acheminement des e-mails transactionnels</td>
              <td className="p-2">Irlande / UE</td>
              <td className="p-2">DPA avec chiffrement TLS en transit</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>6. Cookies & Traceurs</h2>
      <p>
        AFRISUPPLY applique le principe de sobriété numérique :
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><b>Aucun cookie publicitaire ou tiers</b> n'est déposé sur le site vitrine.</li>
        <li>
          <b>Cookie technique de session (<code>afs_token</code>) :</b> Strictement nécessaire à la fourniture du service, configuré avec les drapeaux de sécurité maximaux (<code>HttpOnly</code>, <code>Secure</code>, <code>SameSite=Lax</code>). Exempté de consentement préalable au titre de l'art. 82 de la loi Informatique et Libertés.
        </li>
      </ul>

      <h2>7. Propriété intellectuelle</h2>
      <p>
        Le référentiel standardisé de 324 produits alimentaires africains, les 31 fiches techniques types et les algorithmes d'arbitrage de coûts sont la propriété exclusive d'AFRISUPPLY.
      </p>
      <p>
        Les données métier saisies par chaque restaurant (prix négociés, inventaires réels, volumes de vente) demeurent la <b>propriété exclusive et inaliénable du restaurateur</b>.
      </p>
    </div>
  );
}

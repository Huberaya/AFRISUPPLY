// Chantier 22 — Conditions générales fournisseur (grossistes). Version suivie dans VENDOR_CGV_VERSION (api/lib/cgv.ts).
import { Link } from 'react-router-dom';
export const VENDOR_CGV_VERSION = '1.0';
const cls = 'mx-auto max-w-3xl px-4 py-16 lg:px-8 space-y-4 text-stone-700 [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:text-stone-900 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-stone-900 [&_li]:ml-5 [&_li]:list-disc';
export function VendorTermsBody() {
  return (<>
    <h2>1. Objet</h2><p>AFRISUPPLY met à disposition des grossistes et fournisseurs de produits alimentaires (« le Fournisseur ») une place de marché B2B permettant de présenter leur catalogue à des restaurants professionnels et de recevoir leurs commandes. AFRISUPPLY est un <b>intermédiaire technique</b> : il n’achète ni ne revend les marchandises. Le contrat de vente est conclu directement entre le Fournisseur et le restaurant.</p>
    <h2>2. Inscription et vérification</h2><p>L’espace fournisseur est ouvert aux professionnels immatriculés (SIREN, agrément sanitaire le cas échéant). AFRISUPPLY peut demander tout justificatif et refuser, suspendre ou fermer un espace en cas d’informations inexactes, de manquements répétés (commandes non honorées, retards, produits non conformes) ou de fraude.</p>
    <h2>3. Catalogue et prix</h2><ul>
      <li>Le Fournisseur publie ses prix <b>hors taxes</b>, par conditionnement, et les maintient à jour ; un prix affiché engage le Fournisseur pour toute commande reçue tant qu’il est en ligne.</li>
      <li>Il indique ses zones de livraison, son minimum de commande, ses frais de livraison et son délai habituel.</li>
      <li>Il garantit la conformité réglementaire des produits (traçabilité, étiquetage, chaîne du froid, DLC/DDM) et détient les autorisations nécessaires.</li>
      <li>Les photos et descriptions du référentiel commun sont fournies à titre indicatif ; le Fournisseur signale toute différence.</li></ul>
    <h2>4. Commandes</h2><ul>
      <li>Une commande envoyée via la plateforme doit être <b>confirmée ou refusée sous 24 h ouvrées</b>. Au-delà, le restaurant peut l’annuler sans frais et AFRISUPPLY peut la réattribuer.</li>
      <li>La confirmation vaut engagement de livrer les quantités confirmées à la date indiquée. Les ruptures partielles doivent être signalées avant expédition.</li>
      <li>Le Fournisseur émet lui-même la <b>facture</b> (TVA incluse) au restaurant et encaisse directement le règlement selon ses conditions (comptant, à réception, virement…). AFRISUPPLY ne perçoit pas le prix des marchandises.</li></ul>
    <h2>5. Livraison et réception</h2><p>Le Fournisseur livre à l’adresse du restaurant dans le créneau convenu. Le restaurant contrôle la marchandise à la réception et enregistre les écarts (manquants, casse, non-conformité) dans la plateforme sous 24 h. Les écarts reconnus donnent lieu à un avoir ou un remplacement par le Fournisseur ; le bon de livraison signé fait foi.</p>
    <h2>6. Commission</h2><ul>
      <li>AFRISUPPLY perçoit une commission de <b>2 à 5 % HT</b> (taux indiqué sur la fiche du Fournisseur, 3 % par défaut) calculée sur le montant HT des commandes <b>confirmées</b> passées via la plateforme, frais de livraison exclus.</li>
      <li>Aucune commission n’est due sur les commandes refusées ou annulées avant livraison, ni sur les ventes réalisées hors plateforme.</li>
      <li>La commission est facturée par AFRISUPPLY le 1er de chaque mois pour le mois écoulé, payable à 30 jours. Le détail des commandes est joint.</li>
      <li>Interdiction de contournement : inciter un restaurant rencontré via AFRISUPPLY à commander hors plateforme pour éviter la commission constitue un manquement pouvant entraîner la fermeture de l’espace.</li></ul>
    <h2>7. Données et confidentialité</h2><p>Le Fournisseur reste propriétaire de son catalogue. AFRISUPPLY utilise les données de commande pour faire fonctionner le service et produire des statistiques agrégées et anonymisées (tendances de prix, demande par produit). Les coordonnées des restaurants ne peuvent être utilisées que pour l’exécution des commandes.</p>
    <h2>8. Responsabilité</h2><p>Le Fournisseur est seul responsable des produits vendus, de leur conformité et de leur livraison. La responsabilité d’AFRISUPPLY, limitée à son rôle d’intermédiaire technique, ne peut excéder le montant des commissions perçues au cours des 12 derniers mois.</p>
    <h2>9. Durée, résiliation</h2><p>Sans engagement de durée. Le Fournisseur peut fermer son espace à tout moment ; les commandes confirmées doivent être honorées et les commissions dues restent exigibles. AFRISUPPLY peut modifier les présentes conditions avec un préavis de 30 jours ; la poursuite de l’utilisation vaut acceptation, une nouvelle acceptation explicite étant demandée à la connexion.</p>
    <h2>10. Litiges</h2><p>Règlement amiable d’abord, AFRISUPPLY pouvant servir de médiateur entre les parties. À défaut, droit français et Tribunal de commerce de Nantes.</p>
  </>);
}
export default function VendorTerms() {
  return (
    <div className={cls}>
      <h1>Conditions générales fournisseur</h1>
      <p className="text-sm text-stone-500">Version {VENDOR_CGV_VERSION} — septembre 2026. Complètent les <Link className="underline" to="/cgv">CGV/CGU</Link> et les <Link className="underline" to="/mentions-legales">mentions légales</Link>. À faire relire par un conseil avant les premières commissions.</p>
      <VendorTermsBody />
    </div>
  );
}

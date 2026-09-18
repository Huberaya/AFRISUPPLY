import { Link } from 'react-router-dom';
import { Boxes, Truck, Scale, TrendingUp, ShoppingBasket, ChefHat, Sparkles, Bell, PackageCheck, FileSpreadsheet } from 'lucide-react';

const FEATURES = [
  { icon: Boxes, title: 'Stock vivant', text: 'Quantités, consommation moyenne calculée à partir de vos ventes, jours restants et statuts 🟢🟠🔴. Inventaire du soir en 2 minutes sur mobile.' },
  { icon: Truck, title: 'Fournisseurs notés sur du réel', text: 'Fiabilité calculée sur vos livraisons : retards, manquants, erreurs. Prix, délais, minimums et frais au même endroit.' },
  { icon: Scale, title: 'Comparateur qui explique', text: '« Fournisseur C est moins cher mais livre en 5 jours ; votre stock ne tient que 3 jours. » Prix au kilo, délai vs urgence, fiabilité, frais.' },
  { icon: TrendingUp, title: 'Prévision 7 jours', text: 'Apprend votre semaine plat par plat (le samedi n’est pas le mardi), déduit vos besoins par produit et la date de rupture. Chaque chiffre est justifié.' },
  { icon: ShoppingBasket, title: 'Panier intelligent', text: 'Répartit la commande de la semaine entre vos fournisseurs au meilleur coût total, regroupe pour éviter les minimums, montre l’économie.' },
  { icon: ChefHat, title: 'Recettes & coût matière', text: '31 recettes types africaines pour démarrer, coût réel par portion, marge brute, prix conseillé, alerte quand un ingrédient dérive.' },
  { icon: Sparkles, title: 'Demander à l’IA', text: '« Qu’est-ce que je dois commander ? », « Pourquoi mes coûts augmentent ? » — des réponses avec vos chiffres et un bouton pour agir.' },
  { icon: Bell, title: 'Alertes utiles', text: 'Rupture imminente, stock bas, hausse de prix, alternative moins chère, fournisseur à réévaluer. Dédupliquées, jamais du bruit.' },
  { icon: PackageCheck, title: 'Réception & écarts', text: 'Cochez ce qui arrive : le stock se met à jour, les écarts sont chiffrés et la réclamation est déjà écrite.' },
  { icon: FileSpreadsheet, title: 'Import CSV & référentiel', text: '324 produits africains avec alias (garba = attiéké, okra = gombo…). Importez la grille de prix de vos fournisseurs en un fichier.' },
];

export default function Features() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
      <h1 className="text-4xl font-extrabold tracking-tight">Tout ce qu’il faut pour acheter comme un pro</h1>
      <p className="mt-3 max-w-2xl text-stone-600">Conçu avec des restaurateurs sénégalais, ivoiriens, camerounais et congolais de Nantes et Paris. Pas un ERP : un assistant.</p>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{FEATURES.map((f) => <div key={f.title} className="card"><f.icon className="text-brand-600" size={26} /><h2 className="mt-3 text-lg font-bold">{f.title}</h2><p className="mt-1.5 text-sm text-stone-600">{f.text}</p></div>)}</div>
      <div className="mt-16 rounded-3xl bg-stone-900 p-10 text-center text-white"><h2 className="text-2xl font-extrabold">Envie de voir avec vos propres produits ?</h2><p className="mt-2 text-stone-300">Une démo de 20 minutes sur votre carte, pas sur la nôtre.</p><Link to="/demander-un-acces" className="btn-primary mt-6">Demander une démo</Link></div>
    </div>
  );
}

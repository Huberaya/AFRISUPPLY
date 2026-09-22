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
    <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16 lg:px-8">
      <div className="max-w-3xl">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-900">
          Tout ce qu’il faut pour acheter comme un pro
        </h1>
        <p className="mt-3 text-sm sm:text-base text-stone-600">
          Conçu avec des restaurateurs sénégalais, ivoiriens, camerounais et congolais de Nantes et Paris. Pas un ERP : un assistant.
        </p>
      </div>

      <div className="mt-8 sm:mt-12 grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card p-5 sm:p-6 flex flex-col">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <f.icon size={22} />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-stone-900 leading-snug">{f.title}</h2>
            </div>
            <p className="mt-3 text-xs sm:text-sm text-stone-600 leading-relaxed flex-1">{f.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 sm:mt-16 rounded-2xl sm:rounded-3xl bg-stone-900 p-6 sm:p-10 text-center text-white">
        <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
          Envie de voir avec vos propres produits ?
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-stone-300 max-w-md mx-auto">
          Une démo de 20 minutes sur votre carte, pas sur la nôtre.
        </p>
        <div className="mt-6 flex justify-center">
          <Link to="/demander-un-acces" className="btn-primary w-full sm:w-auto justify-center px-6 py-2.5">
            Demander une démo
          </Link>
        </div>
      </div>
    </div>
  );
}

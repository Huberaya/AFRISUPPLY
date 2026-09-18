// =============================================================
// AFRISUPPLY — Recettes types pour l'onboarding
// 25 plats emblématiques, grammages moyens PAR PORTION (restaurant),
// exprimés dans l'unité de base du produit référentiel.
// Le restaurateur coche ses plats → l'app déduit sa liste de produits.
// =============================================================

export interface RecipeTemplate {
  name: string;
  region: string;                 // origine culinaire principale
  suggestedPrice: number;         // € TTC indicatif en restaurant (France 2026)
  category: 'plat' | 'accompagnement' | 'entree' | 'boisson' | 'dessert';
  ingredients: [product: string, qtyPerPortion: number][];  // product = nom canonique référentiel
}

export const RECIPE_TEMPLATES: RecipeTemplate[] = [
  // ---------------- Sénégal ----------------
  { name: 'Thiéboudienne (riz au poisson)', region: 'Sénégal', suggestedPrice: 17, category: 'plat', ingredients: [
    ['Capitaine (thiof / mérou)', 0.25], ['Riz brisé', 0.18], ['Tomate', 0.08], ['Double concentré de tomate', 0.03], ['Chou blanc', 0.08], ['Carotte', 0.06], ['Manioc frais', 0.06],
    ['Aubergine africaine (djakatou)', 0.05], ['Navet', 0.04], ['Huile d\'arachide', 0.04], ['Poisson fumé (guedj / kong fumé)', 0.02], ['Yet (mollusque fermenté)', 0.005], ['Oignon jaune', 0.05], ['Persil plat', 0.1], ['Ail frais', 0.005], ['Cube bouillon (volaille / bœuf)', 1], ['Piment frais fort (habanero / antillais)', 0.005], ['Tamarin (pulpe)', 0.01] ] },
  { name: 'Yassa poulet', region: 'Sénégal', suggestedPrice: 16, category: 'plat', ingredients: [
    ['Cuisses de poulet', 0.35], ['Oignon jaune', 0.25], ['Citron vert', 0.06], ['Moutarde de Dijon', 0.02], ['Riz parfumé', 0.15], ['Huile de tournesol', 0.03], ['Vinaigre blanc', 0.01], ['Ail frais', 0.005], ['Laurier', 0.001], ['Cube bouillon (volaille / bœuf)', 1], ['Piment frais fort (habanero / antillais)', 0.005] ] },
  { name: 'Yassa poisson', region: 'Sénégal', suggestedPrice: 16, category: 'plat', ingredients: [
    ['Daurade royale / grise', 0.35], ['Oignon jaune', 0.25], ['Citron vert', 0.06], ['Moutarde de Dijon', 0.02], ['Riz parfumé', 0.15], ['Huile de tournesol', 0.04], ['Ail frais', 0.005], ['Cube bouillon (volaille / bœuf)', 1] ] },
  { name: 'Mafé bœuf (sauce arachide)', region: 'Sénégal / Mali', suggestedPrice: 16, category: 'plat', ingredients: [
    ['Bœuf à braiser (paleron / macreuse)', 0.2], ['Pâte d\'arachide', 0.08], ['Riz parfumé', 0.15], ['Tomate', 0.08], ['Double concentré de tomate', 0.02], ['Oignon jaune', 0.06], ['Patate douce', 0.08], ['Carotte', 0.05], ['Chou blanc', 0.04], ['Huile de tournesol', 0.02], ['Ail frais', 0.005], ['Cube bouillon (volaille / bœuf)', 1], ['Piment frais fort (habanero / antillais)', 0.005] ] },
  { name: 'Mafé poulet', region: 'Sénégal / Mali', suggestedPrice: 15, category: 'plat', ingredients: [
    ['Cuisses de poulet', 0.3], ['Pâte d\'arachide', 0.08], ['Riz parfumé', 0.15], ['Tomate', 0.08], ['Double concentré de tomate', 0.02], ['Oignon jaune', 0.06], ['Patate douce', 0.08], ['Carotte', 0.05], ['Huile de tournesol', 0.02], ['Cube bouillon (volaille / bœuf)', 1] ] },
  { name: 'Thiou / soupou kandia (sauce gombo)', region: 'Sénégal', suggestedPrice: 16, category: 'plat', ingredients: [
    ['Gombo frais', 0.15], ['Bœuf à bouillir (jarret / plat de côte)', 0.15], ['Poisson fumé (guedj / kong fumé)', 0.03], ['Crevettes séchées', 0.01], ['Huile de palme rouge', 0.04], ['Riz brisé', 0.18], ['Oignon jaune', 0.05], ['Cube bouillon (volaille / bœuf)', 1], ['Piment frais fort (habanero / antillais)', 0.005] ] },
  { name: 'Dibi (mouton grillé)', region: 'Sénégal', suggestedPrice: 19, category: 'plat', ingredients: [
    ['Mouton (épaule / gigot)', 0.35], ['Oignon jaune', 0.12], ['Moutarde de Dijon', 0.015], ['Huile de tournesol', 0.02], ['Poivre noir grains / moulu', 0.002], ['Cube bouillon (volaille / bœuf)', 1], ['Pain (baguette)', 0.5], ['Pomme de terre', 0.15] ] },
  { name: 'Pastels (beignets farcis au poisson)', region: 'Sénégal', suggestedPrice: 7, category: 'entree', ingredients: [
    ['Farine de blé T55', 0.08], ['Thon en boîte', 0.05], ['Oignon jaune', 0.03], ['Persil plat', 0.05], ['Huile de tournesol', 0.06], ['Tomate', 0.04], ['Piment frais fort (habanero / antillais)', 0.003], ['Levure chimique / boulangère', 0.002], ['Cube bouillon (volaille / bœuf)', 0.5] ] },
  { name: 'Thiakry (dessert mil-yaourt)', region: 'Sénégal', suggestedPrice: 5, category: 'dessert', ingredients: [
    ['Thiakry (araw)', 0.06], ['Yaourt nature', 0.12], ['Lait concentré sucré', 0.03], ['Sucre en poudre', 0.01], ['Vanille (gousses / arôme)', 0.01], ['Muscade', 0.0005] ] },

  // ---------------- Côte d'Ivoire ----------------
  { name: 'Attiéké poisson braisé', region: 'Côte d\'Ivoire', suggestedPrice: 15, category: 'plat', ingredients: [
    ['Attiéké', 0.25], ['Tilapia entier', 0.4], ['Tomate', 0.08], ['Oignon jaune', 0.06], ['Piment frais fort (habanero / antillais)', 0.01], ['Huile de tournesol', 0.04], ['Citron vert', 0.03], ['Mélange épices poisson braisé', 0.01], ['Moutarde de Dijon', 0.01], ['Ail frais', 0.005], ['Gingembre frais', 0.005], ['Cube bouillon (volaille / bœuf)', 1] ] },
  { name: 'Poulet braisé + attiéké / alloco', region: 'Côte d\'Ivoire', suggestedPrice: 18, category: 'plat', ingredients: [
    ['Poulet entier PAC', 0.45], ['Attiéké', 0.15], ['Plantain', 0.15], ['Oignon jaune', 0.08], ['Tomate', 0.05], ['Huile de tournesol', 0.05], ['Moutarde de Dijon', 0.015], ['Mélange épices poulet (tandoori / yaourt)', 0.01], ['Ail frais', 0.005], ['Gingembre frais', 0.005], ['Piment frais fort (habanero / antillais)', 0.01], ['Cube bouillon (volaille / bœuf)', 1] ] },
  { name: 'Alloco (plantain frit)', region: 'Côte d\'Ivoire', suggestedPrice: 6, category: 'accompagnement', ingredients: [
    ['Plantain', 0.3], ['Huile de tournesol', 0.06], ['Piment frais fort (habanero / antillais)', 0.005], ['Oignon jaune', 0.03], ['Œufs', 0.5] ] },
  { name: 'Garba (attiéké + thon frit)', region: 'Côte d\'Ivoire', suggestedPrice: 9, category: 'plat', ingredients: [
    ['Garba (attiéké grain moyen)', 0.25], ['Thon en boîte', 0.12], ['Huile de tournesol', 0.05], ['Tomate', 0.05], ['Oignon jaune', 0.04], ['Piment frais fort (habanero / antillais)', 0.01], ['Cube bouillon (volaille / bœuf)', 0.5] ] },
  { name: 'Kedjenou de poulet', region: 'Côte d\'Ivoire', suggestedPrice: 17, category: 'plat', ingredients: [
    ['Poulet fermier / bicyclette', 0.4], ['Tomate', 0.1], ['Oignon jaune', 0.08], ['Aubergine africaine (djakatou)', 0.06], ['Gingembre frais', 0.01], ['Ail frais', 0.005], ['Piment frais fort (habanero / antillais)', 0.01], ['Laurier', 0.001], ['Thym séché', 0.001], ['Cube bouillon (volaille / bœuf)', 1], ['Attiéké', 0.2] ] },
  { name: 'Sauce graine (noix de palme) + riz / foutou', region: 'Côte d\'Ivoire', suggestedPrice: 16, category: 'plat', ingredients: [
    ['Concentré de noix de palme (sauce graine)', 0.15], ['Bœuf à braiser (paleron / macreuse)', 0.12], ['Poisson fumé (guedj / kong fumé)', 0.03], ['Aubergine africaine (djakatou)', 0.05], ['Gombo frais', 0.03], ['Oignon jaune', 0.04], ['Tomate', 0.04], ['Piment frais fort (habanero / antillais)', 0.005], ['Cube bouillon (volaille / bœuf)', 1], ['Riz parfumé', 0.15] ] },
  { name: 'Foutou banane / igname', region: 'Côte d\'Ivoire', suggestedPrice: 5, category: 'accompagnement', ingredients: [
    ['Plantain', 0.2], ['Manioc frais', 0.1], ['Igname', 0.15] ] },

  // ---------------- Cameroun / Afrique centrale ----------------
  { name: 'Ndolé crevettes + plantain / bâton de manioc', region: 'Cameroun', suggestedPrice: 17, category: 'plat', ingredients: [
    ['Ndolé (feuilles)', 0.12], ['Pâte d\'arachide', 0.06], ['Crevettes séchées', 0.02], ['Crevettes fraîches / surgelées', 0.06], ['Bœuf à braiser (paleron / macreuse)', 0.12], ['Oignon jaune', 0.06], ['Ail frais', 0.005], ['Huile de tournesol', 0.03], ['Cube bouillon (volaille / bœuf)', 1], ['Bicarbonate de soude', 0.002], ['Plantain', 0.15], ['Bâton de manioc', 0.5] ] },
  { name: 'Poulet DG (directeur général)', region: 'Cameroun', suggestedPrice: 19, category: 'plat', ingredients: [
    ['Poulet fermier / bicyclette', 0.4], ['Plantain', 0.25], ['Carotte', 0.05], ['Haricot vert', 0.05], ['Poivron vert', 0.04], ['Poivron rouge', 0.04], ['Tomate', 0.06], ['Oignon jaune', 0.06], ['Ail frais', 0.005], ['Gingembre frais', 0.005], ['Céleri branche', 0.05], ['Huile de tournesol', 0.06], ['Cube bouillon (volaille / bœuf)', 1] ] },
  { name: 'Poisson braisé camerounais + miondo', region: 'Cameroun', suggestedPrice: 18, category: 'plat', ingredients: [
    ['Daurade royale / grise', 0.45], ['Bâton de manioc', 1], ['Mélange épices poisson braisé', 0.015], ['Poivre blanc de Penja', 0.002], ['Ail frais', 0.005], ['Gingembre frais', 0.01], ['Céleri branche', 0.05], ['Persil plat', 0.05], ['Basilic africain (djindja / nchanwu)', 0.05], ['Huile de tournesol', 0.04], ['Tomate', 0.06], ['Oignon jaune', 0.05], ['Piment frais fort (habanero / antillais)', 0.01], ['Cube bouillon (volaille / bœuf)', 1] ] },
  { name: 'Saka-saka / pondu (feuilles de manioc)', region: 'Congo / RDC', suggestedPrice: 14, category: 'plat', ingredients: [
    ['Feuilles de manioc', 0.2], ['Huile de palme rouge', 0.04], ['Poisson fumé (guedj / kong fumé)', 0.05], ['Pâte d\'arachide', 0.03], ['Oignon jaune', 0.04], ['Aubergine violette', 0.04], ['Riz parfumé', 0.15], ['Cube bouillon (volaille / bœuf)', 1], ['Piment frais fort (habanero / antillais)', 0.005] ] },
  { name: 'Eru / okok', region: 'Cameroun', suggestedPrice: 16, category: 'plat', ingredients: [
    ['Eru / okok (gnetum)', 0.1], ['Waterleaf', 0.5], ['Huile de palme rouge', 0.05], ['Peau de bœuf (kanda / ponmo)', 0.06], ['Bœuf à bouillir (jarret / plat de côte)', 0.1], ['Crevettes séchées', 0.02], ['Poisson séché salé (kethiakh / stockfish)', 0.03], ['Cube bouillon (volaille / bœuf)', 1], ['Gari', 0.1] ] },

  // ---------------- Nigeria / Ghana ----------------
  { name: 'Jollof rice + poulet', region: 'Nigeria / Ghana', suggestedPrice: 15, category: 'plat', ingredients: [
    ['Riz étuvé', 0.18], ['Tomates pelées', 0.1], ['Double concentré de tomate', 0.03], ['Poivron rouge', 0.05], ['Oignon jaune', 0.06], ['Piment frais fort (habanero / antillais)', 0.008], ['Huile de tournesol', 0.04], ['Curry en poudre', 0.002], ['Thym séché', 0.001], ['Laurier', 0.001], ['Cube bouillon (volaille / bœuf)', 1], ['Cuisses de poulet', 0.3] ] },
  { name: 'Egusi soup + pounded yam / eba', region: 'Nigeria', suggestedPrice: 16, category: 'plat', ingredients: [
    ['Graines d\'egusi', 0.08], ['Huile de palme rouge', 0.05], ['Épinard surgelé', 0.08], ['Bœuf à bouillir (jarret / plat de côte)', 0.12], ['Silure fumé (catfish)', 0.04], ['Crevettes séchées', 0.015], ['Peau de bœuf (kanda / ponmo)', 0.04], ['Oignon jaune', 0.04], ['Piment frais fort (habanero / antillais)', 0.008], ['Cube bouillon (volaille / bœuf)', 1], ['Farine de foufou (igname)', 0.15] ] },
  { name: 'Suya (brochettes bœuf épicées)', region: 'Nigeria', suggestedPrice: 12, category: 'entree', ingredients: [
    ['Bavette / faux-filet', 0.2], ['Suya / yaji (épices kilichi)', 0.015], ['Huile de tournesol', 0.01], ['Oignon rouge', 0.05], ['Tomate', 0.05] ] },
  { name: 'Pepper soup (poisson / chèvre)', region: 'Nigeria / Cameroun', suggestedPrice: 14, category: 'plat', ingredients: [
    ['Silure (poisson-chat)', 0.3], ['Pebe (épices pepper soup)', 0.008], ['Poivre de Guinée (maniguette)', 0.002], ['Basilic africain (djindja / nchanwu)', 0.05], ['Oignon jaune', 0.04], ['Piment frais fort (habanero / antillais)', 0.008], ['Cube bouillon (volaille / bœuf)', 1], ['Igname', 0.1] ] },
  { name: 'Red red (haricots à l\'huile de palme + plantain)', region: 'Ghana', suggestedPrice: 12, category: 'plat', ingredients: [
    ['Haricots blancs (niébé)', 0.12], ['Huile de palme rouge', 0.04], ['Tomate', 0.06], ['Oignon jaune', 0.05], ['Gingembre frais', 0.005], ['Plantain', 0.25], ['Huile de tournesol', 0.04], ['Cube bouillon (volaille / bœuf)', 1] ] },

  // ---------------- Boissons ----------------
  { name: 'Jus de bissap 33 cl', region: 'Panafricain', suggestedPrice: 3.5, category: 'boisson', ingredients: [
    ['Fleurs de bissap séchées', 0.02], ['Sucre en poudre', 0.04], ['Menthe fraîche', 0.05], ['Vanille (gousses / arôme)', 0.002], ['Gobelet PET 33 cl / 50 cl (froid)', 1] ] },
  { name: 'Jus de gingembre (gnamakoudji) 33 cl', region: 'Panafricain', suggestedPrice: 3.5, category: 'boisson', ingredients: [
    ['Gingembre frais', 0.06], ['Sucre en poudre', 0.04], ['Citron vert', 0.02], ['Ananas', 0.05], ['Gobelet PET 33 cl / 50 cl (froid)', 1] ] },
  { name: 'Jus de bouye (baobab) 33 cl', region: 'Sénégal / Mali', suggestedPrice: 3.5, category: 'boisson', ingredients: [
    ['Poudre de baobab (bouye)', 0.03], ['Sucre en poudre', 0.035], ['Lait concentré sucré', 0.02], ['Vanille (gousses / arôme)', 0.002], ['Gobelet PET 33 cl / 50 cl (froid)', 1] ] },
  { name: 'Jus de tamarin (dakhar) 33 cl', region: 'Sénégal', suggestedPrice: 3.5, category: 'boisson', ingredients: [
    ['Tamarin (pulpe)', 0.03], ['Sucre en poudre', 0.04], ['Gobelet PET 33 cl / 50 cl (froid)', 1] ] },
  { name: 'Ataya (thé à la menthe)', region: 'Sénégal / Mali', suggestedPrice: 2.5, category: 'boisson', ingredients: [
    ['Thé vert de Chine (ataya)', 0.01], ['Sucre en poudre', 0.03], ['Menthe fraîche', 0.1] ] },
];

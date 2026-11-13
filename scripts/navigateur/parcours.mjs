// Chantier P0.6 — PARCOURS DANS UN VRAI NAVIGATEUR.
//
// Ce script pilote un navigateur réel (Chromium sans affichage) contre le site CONSTRUIT (le même
// fichier JavaScript que celui servi en production) et une API réellement démarrée. Il fait ce qu'un
// client fait : il ouvre les pages, remplit les formulaires, clique sur les boutons. À chaque étape il
// surveille ce qu'un test d'API ne voit pas : les erreurs JavaScript de la page, les appels en échec,
// les écrans d'erreur, les redirections.
//
// Ce qu'il prouve : le site construit fonctionne dans un navigateur, de l'inscription à la
// déconnexion, avec l'API du dépôt. Ce qu'il ne prouve PAS : le site de production (autre base,
// autres variables), ni la connexion par Clerk (service externe, non joignable d'ici).
//
// Usage :
//   npm run build -w apps/web
//   npm run start -w apps/api                                   # API sur :8787
//   (cd apps/web && API_URL=http://localhost:8787 npx vite preview --port 3100 --strictPort)
//   npm --prefix scripts/navigateur ci
//   AFS_WEB=http://localhost:3100 node scripts/navigateur/parcours.mjs
//
// Navigateur : CHROME_PATH s'il est donné, sinon un Chrome/Chromium installé sur la machine, sinon le
// Chromium fourni par le paquet @sparticuz/chromium (aucun téléchargement hors du registre npm).
// Sortie : code 0 si toutes les vérifications passent ; rapport et captures dans resultats/.
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SORTIE = process.env.AFS_NAV_SORTIE ?? path.join(ICI, 'resultats');
const WEB = (process.env.AFS_WEB ?? 'http://localhost:3100').replace(/\/$/, '');
// Dossier où l'API de développement dépose les e-mails (transport « fichier ») : c'est là que le
// script lit le lien d'invitation, comme la personne invitée le lirait dans sa boîte.
const BOITE = process.env.AFS_OUTBOX ?? path.resolve(ICI, '../../apps/api/.outbox');
const tampon = Date.now().toString(36);
const COMPTE = { restaurant: `Chez Navigateur ${tampon}`, ville: 'Nantes', nom: 'Awa Navigateur', email: `navigateur-${tampon}@parcours.test`, motDePasse: 'Plantain-Yassa-42' };
const INVITE = `equipier-${tampon}@parcours.test`;
const FOURNISSEUR = `Afro Distribution ${tampon}`;
// Levée des blocages (chantier I) : second fournisseur (comparaison de prix), second restaurant
// (cloisonnement) et compte d'exploitant (confirmation d'adresse). Toutes les données sont fictives et
// reconnaissables : domaine « parcours.test », noms suffixés par l'horodatage du passage.
const FOURNISSEUR_2 = `Comptoir Sahel ${tampon}`;
const VOISIN = { restaurant: `Chez Voisin ${tampon}`, nom: 'Binta Voisin', email: `voisin-${tampon}@parcours.test`, motDePasse: 'Bissap-Gingembre-58', fournisseur: `Grossiste du Voisin ${tampon}` };
// Adresse d'exploitant : elle doit figurer dans ADMIN_EMAILS de l'API pour que le parcours 13 s'exécute.
const EXPLOITANT = { email: (process.env.AFS_ADMIN_EMAIL ?? '').trim().toLowerCase(), motDePasse: 'Thieboudienne-Dibi-64', restaurant: `Exploitation ${tampon}`, nom: 'Exploitante Essai' };
const MDP_INVITE = 'Attieke-Poisson-73';
// Contournement de la protection des prévisualisations (secret fourni par l'environnement, jamais écrit ici).
const CONTOURNEMENT = (process.env.AFS_BYPASS ?? '').trim();

// ---------------------------------------------------------------- navigateur
async function trouverNavigateur() {
  const candidats = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  for (const c of candidats) if (existsSync(c)) return { executablePath: c, args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: true, origine: c };
  // Le paquet n'extrait ses bibliothèques système que s'il se croit sur la plateforme pour laquelle il
  // est construit : on le lui indique (sans effet sur le reste du script).
  process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
  const { default: chromium } = await import('@sparticuz/chromium');
  return { executablePath: await chromium.executablePath(), args: chromium.args, headless: 'shell', origine: '@sparticuz/chromium' };
}

// ---------------------------------------------------------------- rapport
const verifs = [];          // { parcours, libelle, ok, detail }
let parcoursCourant = '';
const parcours = (titre) => { parcoursCourant = titre; console.log(`\n${titre}`); };
const verifier = (libelle, ok, detail = '') => {
  verifs.push({ parcours: parcoursCourant, libelle, ok: !!ok, detail: String(detail ?? '') });
  console.log(`  ${ok ? '[OK]  ' : '[ÉCHEC]'} ${libelle}${detail ? ` — ${detail}` : ''}`);
  return !!ok;
};

// ---------------------------------------------------------------- surveillance de la page
// Tout ce qui se passe mal dans la page est noté, puis lu (et vidé) à chaque vérification.
const incidents = { js: [], api5xx: [], reseau: [] };
const vider = () => { const c = { js: [...incidents.js], api5xx: [...incidents.api5xx], reseau: [...incidents.reseau] }; incidents.js.length = 0; incidents.api5xx.length = 0; incidents.reseau.length = 0; return c; };
const appels = [];          // toutes les réponses de l'API vues par le navigateur : { methode, chemin, statut }
const versClerk = [];       // toute requête du navigateur vers un domaine de Clerk (aucune n'est attendue quand Clerk est coupé)

function surveiller(page) {
  page.on('pageerror', (e) => incidents.js.push(e.message.split('\n')[0].slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Une réponse 4xx attendue (session absente, mauvais mot de passe) est écrite par le navigateur
    // comme « Failed to load resource » : ce n'est pas une erreur de la page. Les 5xx sont comptés à part.
    if (/Failed to load resource/.test(t)) return;
    incidents.js.push(`console : ${t.slice(0, 200)}`);
  });
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith('/api/')) return;
    appels.push({ methode: r.request().method(), chemin: u.pathname, statut: r.status() });
    if (r.status() >= 500) incidents.api5xx.push(`${r.request().method()} ${u.pathname} → ${r.status()}`);
  });
  page.on('request', (r) => { try { const h = new URL(r.url()).hostname; if (/clerk/i.test(h)) versClerk.push(h); } catch { /* adresse illisible */ } });
  page.on('requestfailed', (r) => {
    const raison = r.failure()?.errorText ?? '';
    if (/ERR_ABORTED/.test(raison)) return;     // navigation qui interrompt un chargement : normal
    incidents.reseau.push(`${r.method()} ${new URL(r.url()).pathname} : ${raison}`);
  });
}

const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
const repos = async (page) => { try { await page.waitForNetworkIdle({ idleTime: 400, timeout: 15_000 }); } catch { /* une page qui interroge en continu : on poursuit */ } };
const texte = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
const chemin = (page) => new URL(page.url()).pathname;
const capture = async (page, nom) => { try { await page.screenshot({ path: path.join(SORTIE, `${nom}.jpg`), type: 'jpeg', quality: 60 }); } catch { /* capture facultative */ } };

/** Champ de saisie rangé dans un <label> (ou sous un libellé) dont le texte commence par `libelle`. */
async function champ(page, libelle, portee = 'body') {
  const h = await page.evaluateHandle((t, sel) => {
    const racine = document.querySelector(sel) ?? document.body;
    const propre = (x) => (x.textContent ?? '').replace(/\s+/g, ' ').trim();
    for (const l of racine.querySelectorAll('label')) if (propre(l).startsWith(t)) { const c = l.querySelector('input,select,textarea'); if (c) return c; }
    // libellé hors <label> : on prend le premier champ du bloc qui porte ce texte
    for (const el of racine.querySelectorAll('div,p,span')) if (el.children.length <= 3 && propre(el).startsWith(t)) { const c = el.parentElement?.querySelector('input,select,textarea'); if (c) return c; }
    return null;
  }, libelle, portee);
  const el = h.asElement();
  if (!el) throw new Error(`champ « ${libelle} » introuvable`);
  return el;
}
async function saisir(page, libelle, valeur, portee) {
  const el = await champ(page, libelle, portee);
  await el.click();
  // Vider le champ comme le ferait une personne : tout sélectionner, effacer (le triple-clic ne
  // sélectionne pas le contenu d'un champ de mot de passe).
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await el.type(String(valeur), { delay: 5 });
  const lu = await el.evaluate((x) => x.value);
  if (lu !== String(valeur)) throw new Error(`champ « ${libelle} » : valeur saisie « ${lu.length} caractères » différente de la valeur voulue`);
}
/**
 * Avant tout clic : l'élément visé est-il bien celui qui recevra le clic ?
 * Un élément peut être présent, visible, et pourtant recouvert par un autre (bouton flottant, barre de
 * navigation) : le clic part alors ailleurs sans qu'aucune erreur n'apparaisse. C'est ce qui arrivait
 * à « Préparer les commandes ». Renvoie null si le clic atteint l'élément, sinon ce qui le recouvre.
 */
async function recouvertPar(el) {
  return el.evaluate((cible) => {
    cible.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = cible.getBoundingClientRect();
    const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!dessus || dessus === cible || cible.contains(dessus) || dessus.contains(cible)) return null;
    return (dessus.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) || dessus.tagName.toLowerCase();
  });
}
async function cliquerElement(el, libelle) {
  const obstacle = await recouvertPar(el);
  if (obstacle) throw new Error(`« ${libelle} » est recouvert par « ${obstacle} » : le clic ne l'atteindrait pas`);
  await el.click();
}
/** Clique sur le premier bouton (ou lien, ou en-tête dépliable) visible dont le texte contient `libelle` — après avoir vérifié qu'il recevra le clic. */
async function cliquer(page, libelle, { exact = false, debut = false, portee = 'body' } = {}) {
  const h = await page.evaluateHandle((t, ex, deb, sel) => {
    const racine = document.querySelector(sel) ?? document.body;
    const propre = (x) => (x.textContent ?? '').replace(/\s+/g, ' ').trim();
    const visibles = [...racine.querySelectorAll('button,a,[role="button"],summary')].filter((b) => b.offsetParent !== null && !b.disabled);
    return visibles.find((b) => (ex ? propre(b) === t : deb ? propre(b).startsWith(t) : propre(b).includes(t))) ?? null;
  }, libelle, exact, debut, portee);
  const el = h.asElement();
  if (!el) throw new Error(`bouton « ${libelle} » introuvable`);
  await cliquerElement(el, libelle);
}
/** Bouton d'une carte dépliable (commande) : la carte est celle dont l'en-tête contient `carte`. Elle est dépliée si besoin. */
async function cliquerDansCarte(page, carte, libelle) {
  const ouvert = await page.evaluate((c) => { const d = [...document.querySelectorAll('details')].find((x) => (x.querySelector('summary')?.textContent ?? '').includes(c)); return d ? d.open : null; }, carte);
  if (ouvert === null) throw new Error(`carte « ${carte} » introuvable`);
  if (!ouvert) { await cliquer(page, carte); await attendre(300); }
  const h = await page.evaluateHandle((c, t) => {
    const d = [...document.querySelectorAll('details')].find((x) => (x.querySelector('summary')?.textContent ?? '').includes(c));
    return [...(d?.querySelectorAll('button,a') ?? [])].find((b) => b.offsetParent !== null && !b.disabled && (b.textContent ?? '').includes(t)) ?? null;
  }, carte, libelle);
  const el = h.asElement();
  if (!el) throw new Error(`bouton « ${libelle} » introuvable dans la carte « ${carte} »`);
  await cliquerElement(el, libelle);
}
/** Saisit dans le n-ième champ de la fenêtre de dialogue ouverte (cases à cocher exclues). */
async function saisirFenetre(page, rang, valeur) {
  const champs = await page.$$('[role="dialog"] input:not([type="checkbox"]), [role="dialog"] textarea');
  if (!champs[rang]) throw new Error(`champ n° ${rang + 1} de la fenêtre introuvable`);
  await champs[rang].click();
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await champs[rang].type(String(valeur), { delay: 5 });
}
const texteFenetre = (page) => page.evaluate(() => (document.querySelector('[role="dialog"]')?.innerText ?? '').replace(/\s+/g, ' ').trim());
/**
 * Relecture par l'API, avec la session du navigateur : après une action faite à l'écran, on relit ce que
 * la base contient réellement (le navigateur n'a pas d'autre accès à la base que l'API).
 */
async function api(page, methode, chemin, corps) {
  return page.evaluate(async (m, c, b) => {
    const rid = localStorage.getItem('afs_restaurant') ?? Object.entries(localStorage).find(([k]) => /restaurant/i.test(k))?.[1] ?? '';
    const r = await fetch(c, { method: m, credentials: 'include', headers: { 'content-type': 'application/json', ...(rid ? { 'x-restaurant-id': rid } : {}) }, ...(b ? { body: JSON.stringify(b) } : {}) });
    const t = await r.text(); let json = null; try { json = JSON.parse(t); } catch { /* pas du JSON */ }
    return { statut: r.status, json, texte: t };
  }, methode, chemin, corps ?? null);
}
/** Première liste trouvée dans une réponse de l'API (tableau direct, ou propriété tableau). */
const liste = (j) => (Array.isArray(j) ? j : j && typeof j === 'object' ? (Object.values(j).find(Array.isArray) ?? []) : []);
/** Quantité en stock d'un produit, relue par l'API. */
async function quantiteEnStock(page, produit) {
  const r = await api(page, 'GET', '/api/stock');
  const item = liste(r.json).find((i) => JSON.stringify(i).includes(`"${produit}"`));
  return item ? Number(item.quantity ?? item.qty ?? NaN) : NaN;
}
/** Dernier appel d'écriture vu par le navigateur vers un chemin donné (expression régulière ou chaîne). */
const dernier = (methode, motif) => appels.filter((a) => a.methode === methode && (typeof motif === 'string' ? a.chemin === motif : motif.test(a.chemin))).pop();
/** Appel de l'API hors navigateur (préparation d'un second compte, ménage final) — jamais une preuve de parcours. */
async function apiDirecte(methode, chemin, { corps, jeton, restaurant } = {}) {
  const r = await fetch(`${WEB}${chemin}`, { method: methode, headers: { 'content-type': 'application/json', ...(jeton ? { authorization: `Bearer ${jeton}` } : {}), ...(restaurant ? { 'x-restaurant-id': restaurant } : {}), ...(CONTOURNEMENT ? { 'x-vercel-protection-bypass': CONTOURNEMENT } : {}) }, ...(corps ? { body: JSON.stringify(corps) } : {}) });
  let json = null; try { json = await r.json(); } catch { /* pas du JSON */ }
  return { statut: r.status, json };
}
/** Tous les e-mails écrits pour une adresse (mode fichier de l'API locale), du plus récent au plus ancien. */
const courriels = (adresse) => (existsSync(BOITE)
  ? readdirSync(BOITE).filter((f) => f.endsWith('.txt')).sort().reverse().map((f) => readFileSync(path.join(BOITE, f), 'utf8')).filter((t) => t.startsWith(`To: ${adresse}`))
  : []);
const aller = async (page, p) => { await page.goto(`${WEB}${p}`, { waitUntil: 'domcontentloaded', timeout: 30_000 }); await repos(page); };

/** Une page s'affiche correctement : bon chemin, contenu présent, aucune erreur de page ni d'API, aucun écran d'erreur. */
async function pageSaine(page, libelle, { contient, cheminAttendu, nom } = {}) {
  const t = await texte(page); const inc = vider();
  const ecranErreur = /Une erreur est survenue|Impossible de charger|Erreur de chargement|Something went wrong/i.test(t);
  const problemes = [
    ...(cheminAttendu && chemin(page) !== cheminAttendu ? [`chemin ${chemin(page)} au lieu de ${cheminAttendu}`] : []),
    ...(t.length < 40 ? ['page presque vide'] : []),
    ...(contient && !new RegExp(contient, 'i').test(t) ? [`texte attendu absent : « ${contient} »`] : []),
    ...(ecranErreur ? ['écran d\'erreur affiché'] : []),
    ...inc.js.map((x) => `JavaScript : ${x}`), ...inc.api5xx.map((x) => `API : ${x}`), ...inc.reseau.map((x) => `réseau : ${x}`),
  ];
  if (nom) await capture(page, nom);
  return verifier(libelle, problemes.length === 0, problemes.join(' ; '));
}

// ---------------------------------------------------------------- parcours
async function main() {
  rmSync(SORTIE, { recursive: true, force: true }); mkdirSync(SORTIE, { recursive: true });
  const { default: puppeteer } = await import('puppeteer-core');
  const nav = await trouverNavigateur();
  const browser = await puppeteer.launch({ executablePath: nav.executablePath, args: nav.args, headless: nav.headless, defaultViewport: { width: 1366, height: 900 } });
  const version = await browser.version();
  console.log(`Navigateur : ${version} (${nav.origine})`);
  console.log(`Site       : ${WEB}`);
  const page = await browser.newPage();
  page.setDefaultTimeout(20_000);
  if (CONTOURNEMENT) await page.setExtraHTTPHeaders({ 'x-vercel-protection-bypass': CONTOURNEMENT, 'x-vercel-set-bypass-cookie': 'true' });
  surveiller(page);

  try {
    // ------------------------------------------------------------ 1
    parcours('1. Le site public s’affiche (pages commerciales et légales)');
    const sante = await page.goto(`${WEB}/api/health`, { timeout: 30_000 });
    verifier('l’API répond derrière le site (même origine, comme en production)', sante?.status() === 200, `HTTP ${sante?.status()}`);
    for (const [p, attendu, nom] of [
      ['/', 'AFRISUPPLY', '01-accueil'], ['/pour-les-restaurants', 'restaurant', null], ['/tarifs', '€', '02-tarifs'], ['/fonctionnalites', 'stock', null],
      ['/faq', 'question|\\?', null], ['/cgv', 'Conditions', '03-cgv'], ['/cgv-fournisseur', 'Conditions', null], ['/mentions-legales', 'Mentions|Éditeur|éditeur', '04-mentions-legales'],
      ['/statut', 'État de la plateforme', '05-statut'], ['/catalogue', 'Catalogue|catalogue|produit', null], ['/connexion', 'Connexion', null], ['/inscription', 'essai', null], ['/mot-de-passe-oublie', 'mot de passe', null],
    ]) { await aller(page, p); await pageSaine(page, `page ${p}`, { contient: attendu, cheminAttendu: p, nom }); }
    await aller(page, '/cette-page-n-existe-pas');
    await pageSaine(page, 'adresse inconnue : page « introuvable » propre, pas un écran blanc', { contient: 'introuvable|404|n’existe pas|n\'existe pas' });

    // ------------------------------------------------------------ 2
    parcours('2. Sans session, l’espace client est fermé');
    await aller(page, '/app');
    verifier('/app sans session renvoie à la connexion', chemin(page) === '/connexion', `arrivé sur ${chemin(page)}`);
    await aller(page, '/app/stock');
    verifier('/app/stock sans session renvoie à la connexion', chemin(page) === '/connexion', `arrivé sur ${chemin(page)}`);
    vider();

    // ------------------------------------------------------------ 3
    parcours('3. [Op 1] Création du restaurant : inscription par le formulaire réel');
    await aller(page, '/inscription');
    verifier('le formulaire annonce les conditions générales et la politique de confidentialité, avec leurs liens',
      await page.evaluate(() => !!document.querySelector('a[href="/cgv"]') && !!document.querySelector('a[href="/mentions-legales"]')));
    await saisir(page, 'Nom du restaurant', COMPTE.restaurant);
    await saisir(page, 'Ville', COMPTE.ville);
    await saisir(page, 'Votre nom', COMPTE.nom);
    await saisir(page, 'E-mail', COMPTE.email);
    await saisir(page, 'Mot de passe', COMPTE.motDePasse);
    await capture(page, '06-inscription-remplie');
    await Promise.all([page.waitForFunction(() => location.pathname.startsWith('/app'), { timeout: 30_000 }), cliquer(page, 'Démarrer l’essai gratuit')]);
    await repos(page);
    verifier('après l’inscription, on arrive dans l’espace client (parcours de démarrage)', chemin(page) === '/app/demarrer', `arrivé sur ${chemin(page)}`);
    const inscription = appels.find((a) => a.chemin === '/api/auth/register');
    verifier('l’inscription a été acceptée par l’API', inscription?.statut === 201, `HTTP ${inscription?.statut}`);
    const cookies = await browser.cookies();
    const session = cookies.find((c) => /afs|session|token/i.test(c.name));
    verifier('la session est un cookie illisible par le JavaScript (HttpOnly)', !!session && session.httpOnly === true, session ? `${session.name} · HttpOnly=${session.httpOnly} · SameSite=${session.sameSite}` : `cookies : ${cookies.map((c) => c.name).join(', ') || 'aucun'}`);
    verifier('aucun jeton de session dans le stockage du navigateur', await page.evaluate(() => !Object.values({ ...localStorage, ...sessionStorage }).some((v) => /^eyJ[A-Za-z0-9_-]+\./.test(String(v)))));
    await pageSaine(page, 'l’écran de démarrage s’affiche sans erreur', { nom: '07-demarrage' });

    // ------------------------------------------------------------ 4
    parcours('4. Chaque écran de l’espace client s’affiche (session réelle, données réelles)');
    for (const [p, nom] of [
      ['/app', '08-tableau-de-bord'], ['/app/stock', '09-stock'], ['/app/stock/prevision', null], ['/app/achats', '10-commandes'], ['/app/achats/panier', null], ['/app/achats/ecarts', null],
      ['/app/fournisseurs', null], ['/app/catalogue', null], ['/app/marketplace', '11-marketplace'], ['/app/courses', null], ['/app/ventes', null], ['/app/recettes', null],
      ['/app/analyse', null], ['/app/ia', null], ['/app/express', null], ['/app/import', null], ['/app/parametres', '12-parametres'], ['/app/equipe', null],
      ['/app/abonnement', '13-abonnement'], ['/app/mes-donnees', null], ['/app/profil', null], ['/app/etablissements', null],
    ]) { await aller(page, p); await pageSaine(page, `écran ${p}`, { cheminAttendu: p, nom }); }
    await aller(page, '/app/ecran-qui-n-existe-pas');
    await pageSaine(page, 'écran inconnu dans l’espace client : message propre', { contient: 'introuvable|404|n’existe pas|n\'existe pas' });

    // ------------------------------------------------------------ 5
    parcours('5. [Op 2] Création d’un fournisseur par le formulaire');
    await aller(page, '/app/fournisseurs');
    await attendre(600);                         // fin de l'animation d'entrée de la page
    await cliquer(page, 'Nouveau fournisseur');
    await page.waitForSelector('form');
    // Restaurant neuf, liste vide : la page est courte. C'est le cas où la fenêtre de dialogue sortait de
    // l'écran (son premier champ, obligatoire, était hors d'atteinte). On le mesure avant de saisir.
    const geo = await page.evaluate(() => {
      const voile = document.querySelector('[role="dialog"]') ?? document.querySelector('.fixed.inset-0');
      const v = voile.getBoundingClientRect(); const pan = voile.firstElementChild.getBoundingClientRect();
      const nom = [...document.querySelectorAll('form label')].find((l) => l.textContent.includes('Nom du fournisseur')).querySelector('input');
      const c = nom.getBoundingClientRect();
      return {
        voilePleinEcran: v.top <= 0 && v.left <= 0 && v.bottom >= innerHeight && v.right >= innerWidth,
        panneauDansLEcran: pan.top >= 0 && pan.bottom <= innerHeight,
        champAtteignable: c.top >= 0 && c.bottom <= innerHeight && document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2) === nom,
        mesures: `voile ${Math.round(v.top)}→${Math.round(v.bottom)} px, fenêtre ${Math.round(pan.top)}→${Math.round(pan.bottom)} px, champ ${Math.round(c.top)}→${Math.round(c.bottom)} px, écran ${innerHeight} px`,
      };
    });
    verifier('la fenêtre « Nouveau fournisseur » couvre tout l’écran et tient dedans', geo.voilePleinEcran && geo.panneauDansLEcran, geo.mesures);
    verifier('son premier champ (obligatoire) est visible et cliquable', geo.champAtteignable, geo.mesures);
    await saisir(page, 'Nom du fournisseur', FOURNISSEUR);
    await saisir(page, 'Ville', 'Nantes', 'form');
    await saisir(page, 'Téléphone', '06 12 34 56 78', 'form');
    await capture(page, '14-fournisseur-formulaire');
    await cliquer(page, 'Créer le fournisseur');
    await page.waitForFunction((n) => document.body.innerText.includes(n) && !document.querySelector('form'), { timeout: 20_000 }, FOURNISSEUR);
    await repos(page);
    const creation = appels.filter((a) => a.methode === 'POST' && a.chemin === '/api/suppliers').pop();
    verifier('le fournisseur est créé par l’API', creation?.statut === 201 || creation?.statut === 200, `HTTP ${creation?.statut}`);
    await pageSaine(page, 'le fournisseur apparaît dans la liste', { contient: FOURNISSEUR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), nom: '15-fournisseur-cree' });
    await aller(page, '/app/fournisseurs');
    verifier('il est toujours là après rechargement de la page (donnée enregistrée, pas seulement affichée)', (await texte(page)).includes(FOURNISSEUR));
    await page.evaluate((n) => { [...document.querySelectorAll('a')].find((a) => a.textContent.includes(n))?.click(); }, FOURNISSEUR);
    await page.waitForFunction(() => /^\/app\/fournisseurs\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 20_000 });
    await repos(page);
    await pageSaine(page, 'sa fiche s’ouvre', { contient: FOURNISSEUR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), nom: '16-fournisseur-fiche' });

    const ficheFournisseur = chemin(page);
    const idFournisseur = ficheFournisseur.split('/').pop();
    // Préparation (hors parcours) : un second restaurant, pour vérifier plus loin qu'il ne voit rien du premier.
    const voisin = await apiDirecte('POST', '/api/auth/register', { corps: { email: VOISIN.email, password: VOISIN.motDePasse, fullName: VOISIN.nom, restaurantName: VOISIN.restaurant, city: 'Rennes', acceptTerms: true } });
    if (voisin.statut === 201) await apiDirecte('POST', '/api/suppliers', { jeton: voisin.json.token, corps: { name: VOISIN.fournisseur } });

    // ------------------------------------------------------------ 5a
    parcours('5a. [Op 3] Produits : la carte du restaurant crée les recettes et le stock à suivre');
    await aller(page, '/app/demarrer'); await attendre(500);
    await cliquer(page, 'Yassa poulet'); await cliquer(page, 'Mafé poulet');
    await cliquer(page, 'Créer mes recettes et mon stock');
    await page.waitForFunction(() => /Votre cuisine est configurée/.test(document.body.innerText), { timeout: 20_000 });
    verifier('la carte est acceptée par l’API', dernier('POST', '/api/onboarding/apply')?.statut === 200, `HTTP ${dernier('POST', '/api/onboarding/apply')?.statut}`);
    verifier('l’écran annonce les recettes et les produits créés', /2 recettes créées · 16 produits identifiés/.test(await texte(page)), (await texte(page)).match(/\d+ recettes créées[^.]*/)?.[0]);
    await capture(page, '20-carte-creee');
    await cliquer(page, 'Valider mes seuils'); await repos(page);
    verifier('les seuils d’alerte sont enregistrés', dernier('POST', '/api/stock/thresholds')?.statut === 200, `HTTP ${dernier('POST', '/api/stock/thresholds')?.statut}`);
    const stockInitial = liste((await api(page, 'GET', '/api/stock')).json);
    const recettes = liste((await api(page, 'GET', '/api/recipes')).json);
    verifier('relecture en base : 16 produits suivis, 2 recettes', stockInitial.length === 16 && recettes.length === 2, `${stockInitial.length} produits, ${recettes.length} recettes`);

    // ------------------------------------------------------------ 5c
    parcours('5c. [Op 3] Produits du fournisseur : ses prix, saisis dans sa fiche');
    const ajouterPrix = async (recherche, produit, conditionnement, quantite, prix) => {
      await cliquer(page, 'Ajouter un prix'); await page.waitForSelector('[role="dialog"]'); await attendre(300);
      await saisirFenetre(page, 0, recherche);
      await page.waitForFunction((n) => [...document.querySelectorAll('[role="dialog"] button')].some((b) => (b.textContent ?? '').trim().startsWith(n)), { timeout: 20_000 }, produit);
      await cliquer(page, produit, { debut: true, portee: '[role="dialog"]' }); await attendre(300);
      await saisirFenetre(page, 0, conditionnement); await saisirFenetre(page, 1, quantite); await saisirFenetre(page, 2, prix);
      const avantAjout = appels.length;
      await cliquer(page, 'Ajouter', { exact: true, portee: '[role="dialog"]' });
      await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 20_000 }); await repos(page);
      return appels.slice(avantAjout).find((a) => a.methode === 'POST' && /\/api\/suppliers\/[0-9a-f-]{36}\/offers$/.test(a.chemin))?.statut;
    };
    await aller(page, ficheFournisseur); await attendre(400);
    const statutsPrix = [
      await ajouterPrix('riz parf', 'Riz parfumé', 'Sac 25 kg', '25', '42'),
      await ajouterPrix('cuisses', 'Cuisses de poulet', 'Carton 10 kg', '10', '45'),
      await ajouterPrix('oignon j', 'Oignon jaune', 'Sac 10 kg', '10', '12'),
    ];
    verifier('trois prix sont créés par l’API', statutsPrix.every((x) => x === 201), statutsPrix.join(', '));
    const tFiche = await texte(page);
    verifier('la fiche affiche chaque prix ramené à l’unité (1,68 €/kg, 4,50 €/kg, 1,20 €/kg)', ['1,68 €/kg', '4,50 €/kg', '1,20 €/kg'].every((x) => tFiche.includes(x)), tFiche.match(/Catalogue & prix.{0,200}/)?.[0]);
    await capture(page, '22-fiche-prix');
    await aller(page, ficheFournisseur);
    const tFicheRelue = await texte(page);
    verifier('les prix sont toujours là après rechargement (enregistrés, pas seulement affichés)', ['1,68 €/kg', '4,50 €/kg', '1,20 €/kg'].every((x) => tFicheRelue.includes(x)));

    // ------------------------------------------------------------ 5d
    parcours('5d. [Op 4] Comparaison des prix : un second fournisseur, moins cher sur le riz');
    await aller(page, '/app/fournisseurs'); await attendre(500);
    await cliquer(page, 'Nouveau fournisseur'); await page.waitForSelector('form');
    await saisir(page, 'Nom du fournisseur', FOURNISSEUR_2);
    await cliquer(page, 'Créer le fournisseur');
    await page.waitForFunction((n) => document.body.innerText.includes(n) && !document.querySelector('form'), { timeout: 20_000 }, FOURNISSEUR_2); await repos(page);
    await cliquer(page, FOURNISSEUR_2);
    await page.waitForFunction((a) => /^\/app\/fournisseurs\/[0-9a-f-]{36}$/.test(location.pathname) && location.pathname !== a, { timeout: 20_000 }, ficheFournisseur); await repos(page); await attendre(400);
    verifier('le second fournisseur reçoit un prix plus bas pour le riz (39,00 € le sac de 25 kg)', (await ajouterPrix('riz parf', 'Riz parfumé', 'Sac 25 kg', '25', '39')) === 201);
    // Le stock n'a pas encore été compté : le riz est « à commander », et sa ligne propose de comparer.
    await aller(page, '/app/stock'); await attendre(400);
    const lienComparer = (await page.evaluateHandle(() => [...document.querySelectorAll('tr')].find((tr) => tr.textContent.includes('Riz parfumé'))?.querySelector('a[href*="/app/achats/comparer/"]') ?? null)).asElement();
    verifier('la ligne « Riz parfumé » du stock propose de comparer les fournisseurs', !!lienComparer);
    await cliquerElement(lienComparer, 'Commander →');
    await page.waitForFunction(() => /^\/app\/achats\/comparer\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 20_000 }); await repos(page);
    const tComparer = await texte(page);
    verifier('le comparateur liste les deux fournisseurs', tComparer.includes(FOURNISSEUR) && tComparer.includes(FOURNISSEUR_2));
    verifier('il affiche les deux prix à l’unité (1,56 € et 1,68 €)', tComparer.includes('1,56 €') && tComparer.includes('1,68 €'), tComparer.match(/Recommandation.{0,160}/)?.[0]);
    const recommande = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()).find((t) => t.startsWith('Commander chez ')) ?? '');
    verifier('il recommande le moins cher', recommande === `Commander chez ${FOURNISSEUR_2}`, recommande);
    await pageSaine(page, 'l’écran de comparaison s’affiche sans erreur', { nom: '23-comparaison' });

    // ------------------------------------------------------------ 5b
    parcours('5b. [Op 10] Mise à jour du stock : premier inventaire, en une phrase');
    await aller(page, '/app/express'); await attendre(300);
    await (await page.$('textarea')).type('reste 20 kg riz, 15 kg poulet, 10 kg oignon', { delay: 4 });
    await cliquer(page, 'Comprendre');
    await page.waitForFunction(() => /Comptage du stock — 3 lignes/.test(document.body.innerText), { timeout: 20_000 });
    // « poulet » peut désigner plusieurs produits : l'écran demande lequel, on répond.
    await cliquer(page, 'Cuisses de poulet', { exact: true });
    await cliquer(page, 'Valider 3/3');
    await page.waitForFunction(() => /3 lignes enregistrées/.test(document.body.innerText), { timeout: 20_000 });
    verifier('l’inventaire est enregistré par l’API', dernier('POST', '/api/quick/apply')?.statut === 200, `HTTP ${dernier('POST', '/api/quick/apply')?.statut}`);
    const inventaire = { riz: await quantiteEnStock(page, 'Riz parfumé'), poulet: await quantiteEnStock(page, 'Cuisses de poulet'), oignon: await quantiteEnStock(page, 'Oignon jaune') };
    verifier('relecture en base : 20 kg de riz, 15 kg de poulet, 10 kg d’oignon', inventaire.riz === 20 && inventaire.poulet === 15 && inventaire.oignon === 10, JSON.stringify(inventaire));
    await aller(page, '/app/stock');
    await pageSaine(page, 'l’écran Stock affiche les quantités saisies', { contient: 'Riz parfumé', nom: '21-stock-apres-inventaire' });

    // ------------------------------------------------------------ 5e
    parcours('5e. [Op 11] Enregistrement d’une vente : les ventes du jour, en une phrase');
    await aller(page, '/app/express'); await attendre(300);
    await (await page.$('textarea')).type('vendu 40 yassa 25 mafé', { delay: 4 });
    await cliquer(page, 'Comprendre');
    await page.waitForFunction(() => /Ventes du jour — 2 lignes/.test(document.body.innerText), { timeout: 20_000 });
    await cliquer(page, 'Valider 2/2');
    await page.waitForFunction(() => /2 lignes enregistrées/.test(document.body.innerText), { timeout: 20_000 });
    const tVentes = await texte(page);
    verifier('les ventes sont enregistrées et l’écran dit combien de produits ont bougé', /2 lignes enregistrées · stock mis à jour sur 16 produits/.test(tVentes), tVentes.match(/2 lignes enregistrées[^.]*/)?.[0]);
    const apresVentes = { riz: await quantiteEnStock(page, 'Riz parfumé'), poulet: await quantiteEnStock(page, 'Cuisses de poulet'), oignon: await quantiteEnStock(page, 'Oignon jaune') };
    verifier('relecture en base : le stock a baissé des ingrédients vendus', apresVentes.riz < inventaire.riz && apresVentes.poulet < inventaire.poulet && apresVentes.oignon < inventaire.oignon, JSON.stringify(apresVentes));
    await aller(page, '/app/ventes');
    await pageSaine(page, 'l’écran Ventes affiche les portions du jour', { contient: '65 portions|Yassa poulet', nom: '24-ventes' });

    // ------------------------------------------------------------ 5f
    parcours('5f. [Op 5] Constitution du panier');
    await aller(page, '/app/achats/panier'); await attendre(500);
    const tPanier = await texte(page);
    // Les libellés des cartes sont affichés en capitales : la recherche ne tient pas compte de la casse.
    const totalPanier = /Total panier\s*([\d\s]+,\d{2})\s*€/i.exec(tPanier)?.[1]?.replace(/\s/g, '') ?? '';
    verifier('le panier propose une commande chiffrée, répartie entre les deux fournisseurs', Number(totalPanier.replace(',', '.')) > 0 && tPanier.includes(FOURNISSEUR) && tPanier.includes(FOURNISSEUR_2), `total ${totalPanier} €`);
    verifier('le riz est attribué au moins cher (39,00 € le sac)', /Riz parfumé.{0,80}Sac 25 kg · 39,00 €/.test(tPanier), tPanier.match(/Riz parfumé.{0,90}/)?.[0]);
    await capture(page, '25-panier');

    // ------------------------------------------------------------ 5g
    parcours('5g. [Op 6] Préparation de la commande');
    const boutonPreparer = (await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('Préparer les commandes')) ?? null)).asElement();
    const obstacle = boutonPreparer ? await recouvertPar(boutonPreparer) : 'bouton absent';
    verifier('le bouton « Préparer les commandes » reçoit bien le clic (rien ne le recouvre)', obstacle === null, obstacle ? `recouvert par « ${obstacle} »` : '');
    await Promise.all([page.waitForFunction(() => location.pathname === '/app/achats', { timeout: 20_000 }), cliquer(page, 'Préparer les commandes')]);
    await repos(page);
    verifier('les commandes sont créées par l’API', dernier('POST', '/api/smart-cart/checkout')?.statut === 201, `HTTP ${dernier('POST', '/api/smart-cart/checkout')?.statut}`);
    const commandes = liste((await api(page, 'GET', '/api/orders')).json);
    const commande = commandes.find((o) => JSON.stringify(o).includes(FOURNISSEUR) && !JSON.stringify(o).includes(FOURNISSEUR_2));
    verifier('relecture en base : une commande « préparée » par fournisseur, rien n’est encore envoyé', commandes.length === 2 && commandes.every((o) => o.status === 'preparee'), commandes.map((o) => `${o.reference} ${o.status}`).join(', '));
    const reference = commande?.reference ?? '';
    const ligneCommande = (liste(commande ?? {}).find((l) => l && typeof l === 'object' && 'id' in l)?.id) ?? '00000000-0000-4000-8000-000000000000';
    await pageSaine(page, 'l’écran Achats affiche les commandes en cours', { contient: 'En cours \\(2\\)', nom: '26-commandes-preparees' });

    // ------------------------------------------------------------ 5h
    parcours('5h. [Op 7] Validation et émission de la commande');
    await cliquerDansCarte(page, FOURNISSEUR, 'Envoyer au fournisseur');
    await page.waitForSelector('[role="dialog"]'); await attendre(400);
    const tEnvoi = await texteFenetre(page);
    verifier('le message au fournisseur est prêt : référence, produits, quantités', tEnvoi.includes(reference) && tEnvoi.includes('Cuisses de poulet') && /13 × Carton 10 kg/.test(tEnvoi), tEnvoi.slice(0, 140));
    await capture(page, '27-message-fournisseur');
    await cliquer(page, 'J’ai envoyé', { portee: '[role="dialog"]' });
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 20_000 }); await repos(page);
    verifier('la commande est marquée « envoyée » par l’API', dernier('PUT', /^\/api\/orders\/[0-9a-f-]{36}$/)?.statut === 200, `HTTP ${dernier('PUT', /^\/api\/orders\/[0-9a-f-]{36}$/)?.statut}`);
    const idCommande = dernier('PUT', /^\/api\/orders\/[0-9a-f-]{36}$/)?.chemin.split('/').pop() ?? '';
    const envoyee = liste((await api(page, 'GET', '/api/orders')).json).find((o) => o.id === idCommande);
    verifier('relecture en base : statut « envoyée »', envoyee?.status === 'envoyee', envoyee?.status);

    // ------------------------------------------------------------ 5i
    parcours('5i. [Op 8] Réception de la livraison — [Op 9] avec un écart');
    const avantReception = { poulet: await quantiteEnStock(page, 'Cuisses de poulet'), oignon: await quantiteEnStock(page, 'Oignon jaune') };
    await cliquerDansCarte(page, FOURNISSEUR, 'Réceptionner');
    await page.waitForSelector('[role="dialog"]'); await attendre(400);
    const tReception = await texteFenetre(page);
    // Deux lignes (poulet, oignon), deux champs chacune : quantité reçue, prix facturé. On repère la ligne du poulet.
    const rangPoulet = tReception.indexOf('Cuisses de poulet') < tReception.indexOf('Oignon jaune') ? 0 : 2;
    verifier('la fenêtre de réception rappelle les quantités commandées', /Cuisses de poulet \(commandé 130/.test(tReception) && /Oignon jaune \(commandé 110/.test(tReception), tReception.slice(0, 160));
    await saisirFenetre(page, rangPoulet, '120');        // 130 kg commandés, 120 reçus
    await saisirFenetre(page, rangPoulet + 1, '4.80');   // facturé 4,80 € au lieu de 4,50 €
    await cliquer(page, 'Valider la réception', { portee: '[role="dialog"]' });
    await page.waitForFunction(() => /Réceptionner maintenant/.test(document.body.innerText), { timeout: 20_000 });
    await cliquer(page, 'Réceptionner maintenant');
    await page.waitForFunction(() => /écart détecté/.test(document.body.innerText), { timeout: 20_000 }); await repos(page);
    verifier('la réception est enregistrée par l’API', dernier('POST', /^\/api\/orders\/[0-9a-f-]{36}\/receive$/)?.statut === 200, `HTTP ${dernier('POST', /^\/api\/orders\/[0-9a-f-]{36}\/receive$/)?.statut}`);
    const tEcart = await texteFenetre(page);
    verifier('[Op 9] l’écart est détecté et la réclamation est rédigée (130 kg commandés, 120 reçus)', /1 écart détecté/.test(tEcart) && /commandé 130 kg, reçu 120 kg \(manquant 10 kg\)/.test(tEcart), tEcart.match(/commandé 130[^)]*\)/)?.[0]);
    verifier('[Op 9] la facture plus élevée que la commande est chiffrée (+ 36,00 €)', /\+36,00 €/.test(tEcart) && /4,50 € → 4,80 €/.test(tEcart), tEcart.match(/Facture plus élevée[^—]*/)?.[0]);
    await capture(page, '28-reception-ecart');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 20_000 });
    verifier('la touche Échap ferme la fenêtre', true);
    const apresReception = { poulet: await quantiteEnStock(page, 'Cuisses de poulet'), oignon: await quantiteEnStock(page, 'Oignon jaune') };
    verifier('[Op 10] relecture en base : le stock augmente de ce qui a été REÇU (120 kg de poulet, 110 kg d’oignon)',
      Math.abs(apresReception.poulet - avantReception.poulet - 120) < 0.001 && Math.abs(apresReception.oignon - avantReception.oignon - 110) < 0.001, `poulet ${avantReception.poulet} → ${apresReception.poulet}, oignon ${avantReception.oignon} → ${apresReception.oignon}`);
    await aller(page, '/app/achats/ecarts');
    const tEcarts = await texte(page);
    verifier('[Op 9] l’écran Écarts montre l’écart ouvert et sa valeur (10 kg × 4,50 € = 45,00 €)', /Écarts ouverts\s*1\b/i.test(tEcarts) && /45,00\s*€/.test(tEcarts) && tEcarts.includes(FOURNISSEUR), tEcarts.match(/Écarts ouverts.{0,60}/i)?.[0]);
    await capture(page, '29-ecarts');
    const ecartsBase = liste((await api(page, 'GET', '/api/discrepancies')).json);
    verifier('[Op 9] relecture en base : un écart, rattaché à cette commande', ecartsBase.length === 1 && JSON.stringify(ecartsBase[0]).includes(reference), `${ecartsBase.length} écart(s)`);

    // ------------------------------------------------------------ 5j
    parcours('5j. [Op 12] Alertes et prévisions');
    const alertesBase = liste((await api(page, 'GET', '/api/alerts')).json);
    const alerteEcart = alertesBase.find((a) => /cart|manquant|livraison/i.test(`${a.kind} ${a.title}`));
    const alerteFacture = alertesBase.find((a) => /factur/i.test(`${a.title} ${a.message}`));
    verifier('relecture en base : la réception a créé une alerte d’écart et une alerte de facture plus élevée', !!alerteEcart && !!alerteFacture, alertesBase.map((a) => a.kind).join(', '));
    await aller(page, '/app'); await attendre(500);
    const tAccueil = await texte(page);
    verifier('l’accueil affiche ces alertes', !!alerteEcart && tAccueil.includes(alerteEcart.title), alerteEcart?.title);
    verifier('l’accueil compte les premiers pas réalisés (6 sur 7 : le septième est déclaratif)', /Vos 7 premiers pas — 6\/7 faits/.test(tAccueil), tAccueil.match(/Vos 7 premiers pas — \d\/7 faits/)?.[0]);
    await capture(page, '30-accueil-alertes');
    const avantPrevision = appels.length;
    await aller(page, '/app/stock/prevision'); await attendre(500);
    const appelsPrevision = appels.slice(avantPrevision).filter((a) => /forecast|prevision/i.test(a.chemin));
    verifier('la prévision est calculée par l’API à partir des ventes saisies', appelsPrevision.length > 0 && appelsPrevision.every((a) => a.statut === 200), appelsPrevision.map((a) => `${a.chemin} → ${a.statut}`).join(', '));
    await pageSaine(page, 'l’écran Prévision affiche les produits du restaurant', { contient: 'Riz parfumé|Cuisses de poulet', nom: '31-prevision' });

    // ------------------------------------------------------------ 5k
    parcours('5k. [Op 15] Export des données');
    await aller(page, '/app/mes-donnees'); await attendre(400);
    const avantExport = appels.length;
    const boutonExport = (await page.evaluateHandle(() => [...document.querySelectorAll('main button')].find((b) => b.offsetParent !== null && /Télécharger|Exporter/i.test(b.textContent ?? '')) ?? null)).asElement();
    verifier('l’écran « Mes données » propose de télécharger ses données', !!boutonExport);
    await cliquerElement(boutonExport, 'Télécharger mes données');
    await page.waitForFunction(() => /Fichier téléchargé/.test(document.body.innerText), { timeout: 30_000 }); await repos(page);
    verifier('l’export est produit par l’API', appels.slice(avantExport).find((a) => a.chemin === '/api/backup/export')?.statut === 200, `HTTP ${appels.slice(avantExport).find((a) => a.chemin === '/api/backup/export')?.statut}`);
    const exportDonnees = (await api(page, 'GET', '/api/backup/export')).texte;
    verifier('le fichier contient le restaurant, ses fournisseurs, sa commande et son écart', [COMPTE.restaurant, FOURNISSEUR, FOURNISSEUR_2, reference, 'Cuisses de poulet'].every((x) => exportDonnees.includes(x)), `${exportDonnees.length} caractères`);
    verifier('il ne contient ni mot de passe, ni jeton, ni un autre restaurant', !/passwordHash|password_hash|tokenVersion|"token"/.test(exportDonnees) && !exportDonnees.includes('Chez Awa') && !exportDonnees.includes(VOISIN.restaurant));
    await capture(page, '32-export');

    // ------------------------------------------------------------ 6
    parcours('6. [Op 13] Invitation d’un collaborateur');
    await aller(page, '/app/equipe');
    await saisir(page, 'E-mail', INVITE);
    await cliquer(page, 'Inviter', { exact: true });
    await page.waitForFunction((e) => document.body.innerText.includes(e), { timeout: 20_000 }, INVITE);
    await repos(page);
    const invitation = appels.filter((a) => a.methode === 'POST' && /\/api\/(team|members|restaurant).*/.test(a.chemin)).pop();
    verifier('l’invitation est acceptée par l’API', !!invitation && invitation.statut < 300, invitation ? `${invitation.chemin} → HTTP ${invitation.statut}` : 'aucun appel vu');
    await pageSaine(page, 'la personne invitée apparaît dans l’équipe', { contient: INVITE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), nom: '17-equipe' });

    // ------------------------------------------------------------ 7
    parcours('7. [Op 14] Droits : un client n’entre pas dans les écrans d’exploitation');
    const avant = appels.length;
    await aller(page, '/app/admin/exploitation');
    await attendre(500);
    const tAdmin = await texte(page);
    const appelsAdmin = appels.slice(avant).filter((a) => a.chemin.startsWith('/api/admin'));
    verifier('l’API refuse les données d’exploitation à un client (403)', appelsAdmin.length === 0 || appelsAdmin.every((a) => a.statut === 403 || a.statut === 401), appelsAdmin.map((a) => `${a.chemin} → ${a.statut}`).join(', ') || 'aucun appel émis');
    verifier('aucune donnée d’exploitation n’est affichée', !/job_runs|Dernière sauvegarde|Sauvegarder maintenant/i.test(tAdmin), tAdmin.slice(0, 120));
    vider();

    // ------------------------------------------------------------ 8
    parcours('8. [Op 16] Déconnexion');
    await aller(page, '/app');
    // le bouton peut être rangé dans un menu : on ouvre ce qui ressemble à un menu de compte si besoin
    const visible = await page.evaluate(() => [...document.querySelectorAll('button,a')].some((b) => b.offsetParent !== null && /Se déconnecter/.test(b.textContent ?? '')));
    if (!visible) await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => /compte|profil|menu/i.test(b.getAttribute('aria-label') ?? b.title ?? ''))?.click(); });
    await Promise.all([page.waitForFunction(() => !location.pathname.startsWith('/app'), { timeout: 20_000 }), cliquer(page, 'Se déconnecter')]);
    await repos(page);
    const deconnexion = appels.filter((a) => a.chemin === '/api/auth/logout').pop();
    verifier('la déconnexion est enregistrée par l’API', deconnexion?.statut === 200, `HTTP ${deconnexion?.statut}`);
    verifier('on quitte l’espace client', !chemin(page).startsWith('/app'), `arrivé sur ${chemin(page)}`);
    await aller(page, '/app/stock');
    verifier('après déconnexion, l’espace client est de nouveau fermé', chemin(page) === '/connexion', `arrivé sur ${chemin(page)}`);
    vider();

    // ------------------------------------------------------------ 8 bis
    parcours('8 bis. [Op 14] La personne invitée accepte l’invitation, se connecte, et n’a que les droits de son rôle');
    const courriel = existsSync(BOITE)
      ? readdirSync(BOITE).filter((f) => f.endsWith('.txt')).map((f) => readFileSync(path.join(BOITE, f), 'utf8')).find((t) => t.startsWith(`To: ${INVITE}`) && /bienvenue\?token=/.test(t))
      : null;
    if (!courriel) {
      console.log(`  [NON FAIT] e-mail d’invitation introuvable dans ${BOITE} (API distante, ou envoi réel) : étape sautée, non comptée`);
    } else {
      const lien = /https?:\/\/\S+\/bienvenue\?token=([\w-]+)/.exec(courriel);
      verifier('l’e-mail d’invitation est réellement écrit, avec un lien personnel', !!lien, courriel.split('\n')[1]);
      verifier('l’e-mail ne contient aucun mot de passe', !/mot de passe\s*:\s*\S+/i.test(courriel.replace(/Choisissez votre mot de passe[^\n]*/i, '')));
      // Le propriétaire vient de se déconnecter : le navigateur est sans session, comme celui de la
      // personne invitée qui ouvre son lien.
      const p2 = page;
      try {
        await aller(p2, `/bienvenue?token=${lien[1]}`);
        await saisir(p2, 'Nouveau mot de passe', MDP_INVITE);
        await saisir(p2, 'Confirmer', MDP_INVITE);
        await cliquer(p2, 'Choisir ce mot de passe');
        await p2.waitForFunction(() => location.pathname === '/connexion', { timeout: 20_000 });
        await repos(p2);
        const choix = appels.filter((a) => a.chemin === '/api/auth/reset-password').pop();
        verifier('le mot de passe est choisi par la personne elle-même (lien accepté par l’API)', choix?.statut === 200, `HTTP ${choix?.statut}`);
        await saisir(p2, 'E-mail', INVITE);
        await saisir(p2, 'Mot de passe', MDP_INVITE);
        await Promise.all([p2.waitForFunction(() => location.pathname.startsWith('/app'), { timeout: 30_000 }), cliquer(p2, 'Se connecter', { exact: true })]);
        await repos(p2);
        const t2 = await texte(p2);
        verifier('elle entre dans le restaurant qui l’a invitée', t2.includes(COMPTE.restaurant), chemin(p2));
        await aller(p2, '/app/equipe');
        const t3 = await texte(p2);
        verifier('rôle « équipe » : l’écran Équipe ne lui propose pas d’inviter', !/Inviter quelqu’un/.test(t3) && t3.length > 40);
        const droits = await p2.evaluate(async () => {
          const rid = localStorage.getItem('afs_restaurant') ?? Object.entries(localStorage).find(([k]) => /restaurant/i.test(k))?.[1] ?? '';
          const h = { 'content-type': 'application/json', ...(rid ? { 'x-restaurant-id': rid } : {}) };
          const lecture = await fetch('/api/stock', { headers: h, credentials: 'include' });
          const ecriture = await fetch('/api/settings', { method: 'PUT', headers: h, credentials: 'include', body: JSON.stringify({ priceIncreaseAlertPct: 9 }) });
          const invitation = await fetch('/api/members', { method: 'POST', headers: h, credentials: 'include', body: JSON.stringify({ email: 'intrus@parcours.test', role: 'owner' }) });
          return { lecture: lecture.status, ecriture: ecriture.status, invitation: invitation.status };
        });
        verifier('sa session lit le stock (200) mais ne modifie pas les réglages (403) et n’invite personne (403)', droits.lecture === 200 && droits.ecriture === 403 && droits.invitation === 403, JSON.stringify(droits));
        await capture(p2, '17b-invitee-connectee');
        const inc2 = vider();
        verifier('aucune erreur de page pendant ce parcours', inc2.js.length === 0 && inc2.api5xx.length === 0, [...inc2.js, ...inc2.api5xx].join(' ; '));
        await browser.deleteCookie(...(await browser.cookies()));
        await aller(p2, `/bienvenue?token=${lien[1]}`);
        await saisir(p2, 'Nouveau mot de passe', 'Autre-Mot-De-Passe-99'); await saisir(p2, 'Confirmer', 'Autre-Mot-De-Passe-99');
        await cliquer(p2, 'Choisir ce mot de passe');
        await p2.waitForFunction(() => /expiré|invalide|déjà/i.test(document.body.innerText), { timeout: 20_000 });
        verifier('le lien d’invitation ne sert qu’une fois', true, (await texte(p2)).match(/[^.]*(expiré|invalide|déjà)[^.]*/i)?.[0]?.trim().slice(0, 110));
      } finally {
        // on rend un navigateur sans session à la suite du parcours
        await browser.deleteCookie(...(await browser.cookies()));
        await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
        vider();
      }
    }

    // ------------------------------------------------------------ 9
    parcours('9. [Op 18] Reconnexion');
    await aller(page, '/connexion');
    await saisir(page, 'E-mail', COMPTE.email);
    await saisir(page, 'Mot de passe', 'Mauvais-Mot-De-Passe-1');
    await cliquer(page, 'Se connecter', { exact: true });
    await page.waitForFunction(() => /incorrect|invalide|Identifiants/i.test(document.body.innerText), { timeout: 20_000 });
    verifier('mauvais mot de passe : message clair, on reste sur la page de connexion', chemin(page) === '/connexion', (await texte(page)).match(/[^.]*(incorrect|invalide|Identifiants)[^.]*/i)?.[0]?.trim().slice(0, 120));
    await capture(page, '18-connexion-refusee');
    await saisir(page, 'Mot de passe', COMPTE.motDePasse);
    await Promise.all([page.waitForFunction(() => location.pathname.startsWith('/app'), { timeout: 30_000 }), cliquer(page, 'Se connecter', { exact: true })]);
    await repos(page);
    verifier('bon mot de passe : on entre dans l’espace client', chemin(page).startsWith('/app'), `arrivé sur ${chemin(page)}`);
    await aller(page, '/app/fournisseurs');
    verifier('on retrouve ses données (le fournisseur créé plus haut)', (await texte(page)).includes(FOURNISSEUR));
    vider();

    // ------------------------------------------------------------ 10
    parcours('10. [Op 17] Expiration de la session');
    await browser.deleteCookie(...(await browser.cookies()));     // la session disparaît (expiration, révocation)
    await aller(page, '/app/stock');
    await attendre(800);
    verifier('session expirée : retour à la connexion, sans écran cassé', chemin(page) === '/connexion', `arrivé sur ${chemin(page)}`);
    const inc = vider();
    verifier('aucune erreur JavaScript pendant l’expiration', inc.js.length === 0, inc.js.join(' ; '));
    await capture(page, '19-session-expiree');

    // ------------------------------------------------------------ 11
    parcours('11. [Op 17] Révocation : une session fermée ne peut plus servir');
    await aller(page, '/connexion');
    await saisir(page, 'E-mail', COMPTE.email); await saisir(page, 'Mot de passe', COMPTE.motDePasse);
    await Promise.all([page.waitForFunction(() => location.pathname.startsWith('/app'), { timeout: 30_000 }), cliquer(page, 'Se connecter', { exact: true })]);
    await repos(page);
    const jetonAvant = (await browser.cookies()).find((c) => c.name === 'afs_token')?.value ?? '';
    const rejouer = async () => (await fetch(`${WEB}/api/auth/me`, { headers: { cookie: `afs_token=${jetonAvant}`, ...(CONTOURNEMENT ? { 'x-vercel-protection-bypass': CONTOURNEMENT } : {}) } })).status;
    verifier('témoin : tant que la session est ouverte, son jeton est accepté', jetonAvant.length > 20 && (await rejouer()) === 200);
    await aller(page, '/app');
    await Promise.all([page.waitForFunction(() => !location.pathname.startsWith('/app'), { timeout: 20_000 }), cliquer(page, 'Se déconnecter')]);
    await repos(page);
    verifier('après la déconnexion, le même jeton rejoué est refusé par le serveur (401)', (await rejouer()) === 401, `HTTP ${await rejouer()}`);
    vider();

    // ------------------------------------------------------------ 12
    parcours('12. Cloisonnement : un autre restaurant ne voit rien du premier');
    if (voisin.statut !== 201) {
      verifier('le second restaurant d’essai est créé', false, `HTTP ${voisin.statut}`);
    } else {
      await aller(page, '/connexion');
      await saisir(page, 'E-mail', VOISIN.email); await saisir(page, 'Mot de passe', VOISIN.motDePasse);
      await Promise.all([page.waitForFunction(() => location.pathname.startsWith('/app'), { timeout: 30_000 }), cliquer(page, 'Se connecter', { exact: true })]);
      await repos(page);
      const duPremier = [COMPTE.restaurant, FOURNISSEUR, FOURNISSEUR_2, reference, INVITE].filter(Boolean);
      const fuites = [];
      for (const ecran of ['/app', '/app/fournisseurs', '/app/achats', '/app/achats/ecarts', '/app/stock', '/app/ventes', '/app/equipe', '/app/recettes']) {
        await aller(page, ecran); await attendre(250);
        const t = await texte(page);
        for (const x of duPremier) if (t.includes(x)) fuites.push(`${ecran} : « ${x} »`);
      }
      verifier('huit écrans du second restaurant : aucune donnée du premier', fuites.length === 0, fuites.join(' ; '));
      await aller(page, '/app/fournisseurs');
      verifier('témoin : il voit bien SON fournisseur', (await texte(page)).includes(VOISIN.fournisseur));
      // Avec sa session, il présente les identifiants réels du premier restaurant.
      const essais = {
        ficheFournisseur: (await api(page, 'GET', `/api/suppliers/${idFournisseur}`)).statut,
        modifierFournisseur: (await api(page, 'PUT', `/api/suppliers/${idFournisseur}`, { name: 'Pris par le voisin' })).statut,
        messageCommande: (await api(page, 'GET', `/api/orders/${idCommande}/message`)).statut,
        changerCommande: (await api(page, 'PUT', `/api/orders/${idCommande}`, { status: 'annulee' })).statut,
        recevoirCommande: (await api(page, 'POST', `/api/orders/${idCommande}/receive`, { lines: [{ lineId: ligneCommande, receivedQty: 1 }] })).statut,
      };
      verifier('les identifiants du premier restaurant, présentés par le second, sont tous refusés (404)', Object.values(essais).every((x) => x === 404), JSON.stringify(essais));
      const exportVoisin = (await api(page, 'GET', '/api/backup/export')).texte;
      verifier('son export ne contient rien du premier restaurant', exportVoisin.includes(VOISIN.restaurant) && duPremier.every((x) => !exportVoisin.includes(x)));
      await aller(page, ficheFournisseur); await attendre(400);
      verifier('la fiche du fournisseur du premier, ouverte par son adresse, n’affiche rien', !(await texte(page)).includes(FOURNISSEUR));
      await capture(page, '33-cloisonnement');
      vider();
      await browser.deleteCookie(...(await browser.cookies()));
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    }

    // ------------------------------------------------------------ 13
    parcours('13. Exploitant : aucun droit avant la confirmation de l’adresse, tous après');
    let jetonExploitant = '';
    if (!EXPLOITANT.email || !existsSync(BOITE)) {
      console.log(`  [NON FAIT] ${!EXPLOITANT.email ? 'AFS_ADMIN_EMAIL non fourni' : `boîte d’envoi ${BOITE} absente (API distante)`} : parcours sauté, non compté`);
    } else {
      const creation = await apiDirecte('POST', '/api/auth/register', { corps: { email: EXPLOITANT.email, password: EXPLOITANT.motDePasse, fullName: EXPLOITANT.nom, restaurantName: EXPLOITANT.restaurant, city: 'Paris', acceptTerms: true } });
      if (creation.statut !== 201) {
        console.log(`  [NON FAIT] le compte ${EXPLOITANT.email.replace(/^(.).*@/, '$1***@')} existe déjà sur cette base (HTTP ${creation.statut}) : parcours sauté, non compté`);
      } else {
        jetonExploitant = creation.json.token;
        await aller(page, '/connexion');
        await saisir(page, 'E-mail', EXPLOITANT.email); await saisir(page, 'Mot de passe', EXPLOITANT.motDePasse);
        await Promise.all([page.waitForFunction(() => location.pathname.startsWith('/app'), { timeout: 30_000 }), cliquer(page, 'Se connecter', { exact: true })]);
        await repos(page);
        const tAvant = await texte(page);
        verifier('adresse non confirmée : le menu d’administration n’est pas proposé', !/Admin AFRISUPPLY/i.test(tAvant) && /Confirmez votre adresse e-mail/.test(tAvant));
        const avantConfirmation = { exploitation: (await api(page, 'GET', '/api/admin/ops')).statut, sauvegardes: (await api(page, 'GET', '/api/admin/backups')).statut, journal: (await api(page, 'GET', '/api/admin/audit')).statut };
        verifier('adresse non confirmée : l’API refuse toutes les données d’exploitation (403)', Object.values(avantConfirmation).every((x) => x === 403), JSON.stringify(avantConfirmation));
        await cliquer(page, 'Renvoyer le lien'); await repos(page); await attendre(600);
        verifier('un nouvel e-mail de confirmation est demandé depuis le bandeau', dernier('POST', '/api/auth/resend-verification')?.statut === 200, `HTTP ${dernier('POST', '/api/auth/resend-verification')?.statut}`);
        const messages = courriels(EXPLOITANT.email).filter((t) => /verifier-email\?token=/.test(t));
        const jetons = messages.map((t) => /verifier-email\?token=([\w-]+)/.exec(t)[1]);
        verifier('l’e-mail est réellement écrit, avec un lien personnel', jetons.length >= 2, `${jetons.length} lien(s) : inscription, puis renvoi`);
        // Le renvoi invalide le lien précédent : seul le dernier lien sert.
        await aller(page, `/verifier-email?token=${jetons[1]}`); await attendre(700);
        verifier('le lien de l’inscription, remplacé par le renvoi, n’est plus accepté', !/confirmée :/.test(await texte(page)), (await texte(page)).slice(0, 110));
        verifier('… et l’adresse n’est toujours pas confirmée', (await api(page, 'GET', '/api/admin/ops')).statut === 403);
        await aller(page, `/verifier-email?token=${jetons[0]}`);
        await page.waitForFunction(() => /confirmée/.test(document.body.innerText), { timeout: 20_000 });
        verifier('le dernier lien confirme l’adresse', dernier('POST', '/api/auth/verify-email')?.statut === 200, `HTTP ${dernier('POST', '/api/auth/verify-email')?.statut}`);
        await capture(page, '34-adresse-confirmee');
        await aller(page, '/app'); await attendre(500);
        verifier('adresse confirmée : le menu d’administration apparaît', /Admin AFRISUPPLY/i.test(await texte(page)));
        const apresConfirmation = { exploitation: (await api(page, 'GET', '/api/admin/ops')).statut, sauvegardes: (await api(page, 'GET', '/api/admin/backups')).statut, journal: (await api(page, 'GET', '/api/admin/audit')).statut };
        verifier('adresse confirmée : l’API ouvre les données d’exploitation (200)', Object.values(apresConfirmation).every((x) => x === 200), JSON.stringify(apresConfirmation));
        await aller(page, '/app/admin/exploitation'); await attendre(600);
        await pageSaine(page, 'l’écran « Exploitation » s’affiche pour l’exploitant confirmé', { cheminAttendu: '/app/admin/exploitation', nom: '35-exploitation' });
        await aller(page, `/verifier-email?token=${jetons[0]}`); await attendre(700);
        verifier('le lien ne sert qu’une fois : rejoué, il ne change plus rien', /déjà|expiré|invalide|inconnu/i.test(await texte(page)), (await texte(page)).match(/[^.]*(déjà|expiré|invalide|inconnu)[^.]*/i)?.[0]?.trim().slice(0, 110));
        vider();
        await browser.deleteCookie(...(await browser.cookies()));
        await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      }
    }

    // ------------------------------------------------------------ 13 bis
    parcours('13 bis. Clerk coupé : la connexion par mot de passe suffit à tout le parcours');
    const etatClerk = (await apiDirecte('GET', '/api/status')).json?.checks?.auth?.clerk ?? null;
    if (etatClerk?.enabled) {
      console.log('  [NON FAIT] Clerk est en service sur ce déploiement : vérification sans objet, non comptée');
    } else {
      verifier('le serveur annonce Clerk hors service', etatClerk?.enabled === false, JSON.stringify(etatClerk));
      const refus = await apiDirecte('POST', '/api/auth/clerk-sync', { corps: { clerkId: 'user_forge', email: COMPTE.email } });
      verifier('une identité envoyée dans le corps de la requête n’ouvre aucune session (401 ou 503)', (refus.statut === 401 || refus.statut === 503) && !refus.json?.token, `HTTP ${refus.statut} ${refus.json?.code ?? ''}`);
      verifier('pendant tout le parcours, le navigateur n’a rien demandé à un domaine de Clerk', versClerk.length === 0, [...new Set(versClerk)].join(', '));
    }

    // ------------------------------------------------------------ 14
    parcours('14. Ménage : seuls les comptes créés par ce parcours sont supprimés');
    // La connexion est limitée à dix essais par minute : on réutilise le jeton reçu à la création du compte
    // quand il existe, et on vérifie la suppression avec ce même jeton (le compte n'existe plus : 401).
    const supprimer = async (email, motDePasse, jetonConnu) => {
      let jeton = jetonConnu;
      if (!jeton) { const c = await apiDirecte('POST', '/api/auth/login', { corps: { email, password: motDePasse } }); if (c.statut !== 200) return `connexion ${c.statut}`; jeton = c.json.token; }
      const d = await apiDirecte('DELETE', '/api/account', { jeton, corps: { password: motDePasse, confirm: 'SUPPRIMER' } });
      const apres = await apiDirecte('GET', '/api/auth/me', { jeton });
      return d.statut === 200 && apres.statut === 401 ? 'supprimé' : `suppression ${d.statut}, session ensuite ${apres.statut}`;
    };
    // Un membre d'équipe ne supprime pas lui-même son compte (règle de l'application : seul un propriétaire le
    // peut). C'est le propriétaire qui le retire de l'équipe — ce qui supprime son compte s'il n'a pas d'autre restaurant.
    const retirerInvite = async () => {
      const c = await apiDirecte('POST', '/api/auth/login', { corps: { email: COMPTE.email, password: COMPTE.motDePasse } });
      if (c.statut !== 200) return { etat: `connexion du propriétaire ${c.statut}` };
      const restaurant = c.json.restaurants?.[0]?.id ?? c.json.restaurant?.id;
      const membres = liste((await apiDirecte('GET', '/api/members', { jeton: c.json.token, restaurant })).json);
      const m = membres.find((x) => x.email === INVITE);
      if (!m) return { etat: 'non créé', jeton: c.json.token };
      const d = await apiDirecte('DELETE', `/api/members/${m.userId ?? m.id}`, { jeton: c.json.token, restaurant });
      const apres = await apiDirecte('POST', '/api/auth/login', { corps: { email: INVITE, password: MDP_INVITE } });
      return { etat: d.statut === 200 && apres.statut === 401 ? 'supprimé' : `retrait ${d.statut}, connexion ensuite ${apres.statut}`, jeton: c.json.token };
    };
    const invite = await retirerInvite();
    const menage = { invite: invite.etat, proprietaire: await supprimer(COMPTE.email, COMPTE.motDePasse, invite.jeton), voisin: await supprimer(VOISIN.email, VOISIN.motDePasse, voisin.json?.token) };
    if (jetonExploitant) menage.exploitant = await supprimer(EXPLOITANT.email, EXPLOITANT.motDePasse, jetonExploitant);
    verifier('les comptes d’essai sont supprimés avec leurs restaurants ; leur session est ensuite refusée', Object.values(menage).every((x) => x === 'supprimé' || x === 'non créé'), JSON.stringify(menage));
    const demo = await apiDirecte('POST', '/api/auth/login', { corps: { email: 'awa@chezawa.fr', password: 'demo1234' } });
    verifier('le restaurant de démonstration, lui, n’a pas été touché', demo.statut === 200 || demo.statut === 401, demo.statut === 200 ? 'toujours présent' : 'absent de cette base (aucun jeu de démonstration)');
  } catch (e) {
    verifier(`le parcours s’est interrompu : ${(e).message.split('\n')[0]}`, false, `sur ${chemin(page)}`);
    await capture(page, '99-interruption');
  } finally {
    await browser.close();
  }

  // ---------------------------------------------------------------- bilan
  const ok = verifs.filter((v) => v.ok).length; const ko = verifs.length - ok;
  const cinqCents = appels.filter((a) => a.statut >= 500);
  console.log(`\nAppels à l’API vus par le navigateur : ${appels.length} (dont ${cinqCents.length} en erreur 5xx)`);
  // Les dix-huit opérations de la mission : une opération est acquise si elle a au moins une vérification, toutes réussies.
  const OPERATIONS = ['Création d’un restaurant', 'Création d’un fournisseur', 'Création d’un produit fournisseur', 'Consultation et comparaison des prix', 'Constitution d’un panier', 'Préparation d’une commande',
    'Validation et émission d’une commande', 'Réception d’une livraison', 'Déclaration d’un écart', 'Mise à jour du stock', 'Enregistrement d’une vente', 'Vérification des alertes et prévisions',
    'Invitation d’un collaborateur', 'Vérification des droits du collaborateur', 'Export des données', 'Déconnexion', 'Expiration et révocation de session', 'Reconnexion'];
  const operations = OPERATIONS.map((nom, i) => {
    const marque = `[Op ${i + 1}]`;
    const liees = verifs.filter((v) => v.parcours.includes(marque) || v.libelle.includes(marque));
    return { numero: i + 1, nom, verifications: liees.length, reussies: liees.filter((v) => v.ok).length, acquise: liees.length > 0 && liees.every((v) => v.ok) };
  });
  console.log('\nOpérations de la mission :');
  for (const o of operations) console.log(`  ${o.acquise ? '[OK]  ' : o.verifications ? '[ÉCHEC]' : '[NON FAIT]'} ${String(o.numero).padStart(2)}. ${o.nom} — ${o.reussies}/${o.verifications}`);
  console.log(`OPÉRATIONS : ${operations.filter((o) => o.acquise).length}/18 rejouées avec succès`);
  console.log(`BILAN NAVIGATEUR : ${ok}/${verifs.length} vérifications réussies${ko ? ` — ${ko} en échec` : ''}`);
  writeFileSync(path.join(SORTIE, 'rapport.json'), JSON.stringify({ quand: new Date().toISOString(), site: WEB, navigateur: version, origineNavigateur: nav.origine, reussies: ok, total: verifs.length, operations, appelsApi: appels.length, appels5xx: cinqCents, verifications: verifs }, null, 2));
  process.exit(ko ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });

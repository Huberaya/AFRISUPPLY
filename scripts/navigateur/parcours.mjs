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
/** Clique sur le premier bouton (ou lien) visible dont le texte contient `libelle`. */
async function cliquer(page, libelle, { exact = false, portee = 'body' } = {}) {
  const h = await page.evaluateHandle((t, ex, sel) => {
    const racine = document.querySelector(sel) ?? document.body;
    const propre = (x) => (x.textContent ?? '').replace(/\s+/g, ' ').trim();
    const visibles = [...racine.querySelectorAll('button,a,[role="button"]')].filter((b) => b.offsetParent !== null && !b.disabled);
    return visibles.find((b) => (ex ? propre(b) === t : propre(b).includes(t))) ?? null;
  }, libelle, exact, portee);
  const el = h.asElement();
  if (!el) throw new Error(`bouton « ${libelle} » introuvable`);
  await el.click();
}
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
    parcours('3. Inscription et création du restaurant (formulaire réel)');
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
    parcours('5. Fournisseurs : création par le formulaire');
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

    // ------------------------------------------------------------ 6
    parcours('6. Équipe : invitation d’un membre');
    await aller(page, '/app/equipe');
    await saisir(page, 'E-mail', INVITE);
    await cliquer(page, 'Inviter', { exact: true });
    await page.waitForFunction((e) => document.body.innerText.includes(e), { timeout: 20_000 }, INVITE);
    await repos(page);
    const invitation = appels.filter((a) => a.methode === 'POST' && /\/api\/(team|members|restaurant).*/.test(a.chemin)).pop();
    verifier('l’invitation est acceptée par l’API', !!invitation && invitation.statut < 300, invitation ? `${invitation.chemin} → HTTP ${invitation.statut}` : 'aucun appel vu');
    await pageSaine(page, 'la personne invitée apparaît dans l’équipe', { contient: INVITE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), nom: '17-equipe' });

    // ------------------------------------------------------------ 7
    parcours('7. Droits : un client n’entre pas dans les écrans d’exploitation');
    const avant = appels.length;
    await aller(page, '/app/admin/exploitation');
    await attendre(500);
    const tAdmin = await texte(page);
    const appelsAdmin = appels.slice(avant).filter((a) => a.chemin.startsWith('/api/admin'));
    verifier('l’API refuse les données d’exploitation à un client (403)', appelsAdmin.length === 0 || appelsAdmin.every((a) => a.statut === 403 || a.statut === 401), appelsAdmin.map((a) => `${a.chemin} → ${a.statut}`).join(', ') || 'aucun appel émis');
    verifier('aucune donnée d’exploitation n’est affichée', !/job_runs|Dernière sauvegarde|Sauvegarder maintenant/i.test(tAdmin), tAdmin.slice(0, 120));
    vider();

    // ------------------------------------------------------------ 8
    parcours('8. Déconnexion');
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
    parcours('8 bis. La personne invitée accepte l’invitation, se connecte, et n’a que les droits de son rôle');
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
      const MDP_INVITE = 'Attieke-Poisson-73';
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
    parcours('9. Connexion');
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
    parcours('10. Expiration de la session');
    await browser.deleteCookie(...(await browser.cookies()));     // la session disparaît (expiration, révocation)
    await aller(page, '/app/stock');
    await attendre(800);
    verifier('session expirée : retour à la connexion, sans écran cassé', chemin(page) === '/connexion', `arrivé sur ${chemin(page)}`);
    const inc = vider();
    verifier('aucune erreur JavaScript pendant l’expiration', inc.js.length === 0, inc.js.join(' ; '));
    await capture(page, '19-session-expiree');
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
  console.log(`BILAN NAVIGATEUR : ${ok}/${verifs.length} vérifications réussies${ko ? ` — ${ko} en échec` : ''}`);
  writeFileSync(path.join(SORTIE, 'rapport.json'), JSON.stringify({ quand: new Date().toISOString(), site: WEB, navigateur: version, origineNavigateur: nav.origine, reussies: ok, total: verifs.length, appelsApi: appels.length, appels5xx: cinqCents, verifications: verifs }, null, 2));
  process.exit(ko ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });

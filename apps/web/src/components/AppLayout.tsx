// Chantier 11 (audit UX) — navigation regroupée par tâche, recherche d'écran, barre mobile.
//
// Constat de l'audit : 18 entrées à plat dans une seule colonne. Un restaurateur qui n'a jamais vu
// l'app ne pouvait pas deviner que « Panier intelligent » se trouvait sous « Achats », ni que
// « Prévision 7 j » vivait dans le menu principal. Le menu est désormais découpé en 5 sections
// (ce que je fais aujourd'hui → ce que je commande → mon stock → comprendre → mon compte),
// chaque entrée porte une phrase courte, une recherche filtre les écrans, et le téléphone a une
// barre d'onglets en bas pour les 4 gestes du quotidien.
import { useMemo, useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Boxes, Truck, BarChart3, Sparkles, LogOut, Menu, X, ChefHat, Bell, BookOpen, Rocket, TrendingUp, ShoppingBasket as Basket, Receipt, Settings as SettingsIcon, Zap, Store, ShieldCheck, ListChecks, Users, Building2, CreditCard, Search, type LucideIcon } from 'lucide-react';
import { api } from '../lib/api';
import { FeedbackWidget, UsageBeacon } from './Pilot';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/useApi';

type Role = 'staff' | 'manager' | 'owner';
type NavItem = { to: string; icon: LucideIcon; label: string; hint: string; end?: boolean; minRole?: Role };

// minRole : mêmes règles que le serveur (les écritures sont refusées en 403 au-delà du rôle).
// L'employé voit donc ce qu'il peut réellement utiliser ; le responsable gère achats et réglages ;
// seul le propriétaire touche aux membres, à l'abonnement et à la suppression du compte.
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Aujourd’hui',
    items: [
      { to: '/app', icon: LayoutDashboard, label: 'Accueil', hint: 'alertes, ruptures, dépenses du mois', end: true },
    ],
  },
  {
    title: 'Commander',
    items: [
      { to: '/app/achats', icon: ShoppingCart, label: 'Achats', hint: 'commandes en cours et historique' },
      { to: '/app/achats/panier', icon: Basket, label: 'Panier intelligent', hint: 'quoi commander, chez qui, à quel prix', minRole: 'manager' },
      { to: '/app/fournisseurs', icon: Truck, label: 'Fournisseurs', hint: 'fiches, offres, fiabilité', minRole: 'manager' },
      { to: '/app/marketplace', icon: Store, label: 'Marketplace', hint: 'grossistes et produits', minRole: 'manager' },
      { to: '/app/courses', icon: ListChecks, label: 'Liste de courses', hint: 'liste à imprimer ou partager' },
    ],
  },
  {
    title: 'Mon stock',
    items: [
      { to: '/app/stock', icon: Boxes, label: 'Stock', hint: 'quantités, seuils, inventaire' },
      { to: '/app/stock/prevision', icon: TrendingUp, label: 'Prévision 7 j', hint: 'besoins estimés produit par produit' },
      { to: '/app/express', icon: Zap, label: 'Saisie express', hint: 'entrées, sorties, pertes en quelques clics' },
      { to: '/app/ventes', icon: Receipt, label: 'Ventes & auto-reorder', hint: 'ventes du jour, réappro automatique' },
      { to: '/app/recettes', icon: ChefHat, label: 'Recettes', hint: 'plats et quantités par portion', minRole: 'manager' },
      { to: '/app/catalogue', icon: BookOpen, label: 'Catalogue', hint: 'références produits, vos produits' },
    ],
  },
  {
    title: 'Comprendre',
    items: [
      { to: '/app/analyse', icon: BarChart3, label: 'Analyse des coûts', hint: 'pourquoi mes coûts augmentent' },
      { to: '/app/ia', icon: Sparkles, label: 'Demander à l’IA', hint: 'questions sur vos données réelles' },
    ],
  },
  {
    title: 'Mon compte',
    items: [
      { to: '/app/demarrer', icon: Rocket, label: 'Configurer ma carte', hint: 'menu, produits, fournisseurs' },
      { to: '/app/etablissements', icon: Building2, label: 'Mes établissements', hint: 'gérer plusieurs restaurants' },
      { to: '/app/equipe', icon: Users, label: 'Équipe & sécurité', hint: 'membres, rôles, mot de passe' },
      { to: '/app/parametres', icon: SettingsIcon, label: 'Paramètres', hint: 'alertes, seuils, envois', minRole: 'manager' },
      { to: '/app/abonnement', icon: CreditCard, label: 'Abonnement', hint: 'formule, factures, paiement' },
      { to: '/app/mes-donnees', icon: ShieldCheck, label: 'Mes données', hint: 'export, sauvegardes, support', minRole: 'owner' },
    ],
  },
];

// Recherche insensible aux accents : « equipe » doit trouver « Équipe ».
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const ROLE_RANK: Record<string, number> = { staff: 0, manager: 1, owner: 2 };
const ROLE_LABEL: Record<string, string> = { staff: 'Employé', manager: 'Responsable', owner: 'Propriétaire' };

/** Les 4 gestes du quotidien, accessibles au pouce sur téléphone. */
const MOBILE_TABS: NavItem[] = [
  { to: '/app', icon: LayoutDashboard, label: 'Accueil', hint: '', end: true },
  { to: '/app/stock', icon: Boxes, label: 'Stock', hint: '' },
  { to: '/app/achats', icon: ShoppingCart, label: 'Achats', hint: '' },
  { to: '/app/ia', icon: Sparkles, label: 'IA', hint: '' },
];

export function Logo({ light = false, to = '/app' }: { light?: boolean; to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2">
      <svg viewBox="0 0 64 64" className="h-8 w-8"><rect width="64" height="64" rx="14" fill="#c2410c" /><path d="M18 44 L32 16 L46 44 Z" fill="none" stroke="#fff7ed" strokeWidth="5" strokeLinejoin="round" /><circle cx="32" cy="38" r="4" fill="#facc15" /></svg>
      <span className={`font-extrabold tracking-tight text-lg ${light ? 'text-white' : 'text-stone-900'}`}>AFRI<span className="text-brand-600">SUPPLY</span></span>
    </Link>
  );
}

export default function AppLayout() {
  const { user, restaurant, restaurants, logout, switchRestaurant, accessNotice, clearAccessNotice } = useAuth();
  const myRole = restaurant?.role ?? 'owner';
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const { data: alerts, reload: reloadAlerts } = useApi<{ alerts: { isRead: boolean }[] }>('/alerts');
  const unread = alerts?.alerts.filter((a) => !a.isRead).length ?? 0;
  // Chantier 6 : la cloche se met à jour toute seule — une rupture détectée pendant la journée
  // doit se voir sans recharger la page (et sans attendre le mail du matin).
  useEffect(() => {
    const t = window.setInterval(() => { void reloadAlerts(); }, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void reloadAlerts(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [reloadAlerts]);

  const groups = useMemo(() => {
    const allowed = (i: NavItem) => ROLE_RANK[myRole] >= ROLE_RANK[i.minRole ?? 'staff'];
    const needle = norm(q.trim());
    return NAV_GROUPS
      .map((g) => ({ ...g, items: g.items.filter(allowed).filter((i) => !needle || norm(`${i.label} ${i.hint}`).includes(needle)) }))
      .filter((g) => g.items.length);
  }, [myRole, q]);
  const searching = q.trim().length > 0;

  const Sidebar = (
    <aside className="flex h-full w-64 flex-col bg-stone-900 text-stone-200">
      <div className="px-5 py-5 border-b border-stone-800"><Logo light /></div>
      <div className="px-4 py-4 border-b border-stone-800">
        <p className="text-[11px] uppercase tracking-wide text-stone-500">Restaurant</p>
        {restaurants.length > 1 ? (
          <select className="mt-1 w-full rounded-lg bg-stone-800 px-2 py-1.5 text-sm" value={restaurant?.id} onChange={(e) => switchRestaurant(e.target.value)}>
            {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        ) : <p className="mt-1 font-semibold text-white truncate">{restaurant?.name}</p>}
        <Link to="/app/abonnement" onClick={() => setOpen(false)} className="pill mt-2 bg-brand-700/30 text-brand-200 capitalize hover:bg-brand-700/50">{restaurant?.plan === 'trial' ? 'Essai gratuit' : `Offre ${restaurant?.plan}`}</Link>
        <p className="mt-1.5 text-[11px] text-stone-500">Connecté·e comme <span className="font-semibold text-stone-300">{ROLE_LABEL[myRole] ?? myRole}</span></p>
      </div>
      <div className="border-b border-stone-800 px-3 py-3">
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher un écran…"
            aria-label="Chercher un écran"
            className="w-full rounded-lg border border-stone-700 bg-stone-800 py-2 pl-8 pr-2 text-sm text-white placeholder:text-stone-500 focus:border-brand-500 focus:outline-none"
          />
        </label>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-stone-500">{g.title}</p>
            <div className="space-y-1">
              {g.items.map(({ to, icon: Icon, label, hint, end }) => (
                <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
                  title={hint}
                  className={({ isActive }) => `flex items-start gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-brand-700 text-white' : 'hover:bg-stone-800 text-stone-300'}`}>
                  <Icon className="mt-0.5 shrink-0" size={18} />
                  <span className="min-w-0">
                    {label}
                    <span className="block truncate text-[11px] font-normal opacity-70">{hint}</span>
                  </span>
                  {to === '/app' && unread > 0 && <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
        {searching && groups.length === 0 && (
          <p className="px-3 text-xs text-stone-400">Aucun écran ne correspond à « {q} ». Essayez « stock », « panier », « facture », « équipe »…</p>
        )}
        {user?.isAdmin && (
          <div>
            <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-stone-500">Admin AFRISUPPLY</p>
            <div className="space-y-1">
              {[['/app/admin', 'Tableau de bord'], ['/app/admin/pilotes', 'Cockpit pilotes'], ['/app/admin/prospection', 'Prospection'], ['/app/admin/abonnements', 'Abonnements'], ['/app/admin/fournisseurs', 'Fournisseurs plateforme'], ['/app/admin/referentiel', 'Référentiel produits'], ['/app/admin/litiges', 'Litiges'], ['/app/admin/exploitation', 'Exploitation']].map(([to, label]) => <NavLink key={to} to={to} end={to === '/app/admin'} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-brand-700 text-white' : 'hover:bg-stone-800 text-stone-300'}`}><ShieldCheck size={18} /> {label}</NavLink>)}
            </div>
          </div>
        )}
      </nav>
      <div className="border-t border-stone-800 px-4 py-4">
        <p className="text-sm font-semibold text-white truncate">{user?.fullName}</p>
        <p className="text-xs text-stone-500 truncate">{user?.email}</p>
        <button onClick={async () => { await logout(); nav('/connexion'); }} className="mt-3 flex items-center gap-2 text-xs text-stone-400 hover:text-white"><LogOut size={14} /> Se déconnecter</button>
      </div>
    </aside>
  );

  const mobileTabs = MOBILE_TABS.filter((t) => ROLE_RANK[myRole] >= ROLE_RANK[t.minRole ?? 'staff']);

  return (
    <div className="min-h-screen bg-stone-50 lg:flex">
      <div className="hidden lg:block lg:fixed lg:inset-y-0">{Sidebar}</div>
      {open && <div className="fixed inset-0 z-40 flex lg:hidden"><div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} /><div className="relative z-50">{Sidebar}</div></div>}
      <div className="flex-1 lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-8">
          <button className="rounded-lg p-1 hover:bg-stone-100 lg:hidden" onClick={() => setOpen(!open)} aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}>{open ? <X /> : <Menu />}</button>
          <div className="lg:hidden"><Logo /></div>
          <div className="hidden lg:block text-sm text-stone-500">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div className="flex items-center gap-2">
            <Link to="/app" className="relative rounded-xl p-2 hover:bg-stone-100" aria-label={unread > 0 ? `${unread} alerte(s) non lue(s)` : 'Alertes'}><Bell size={18} />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 h-4 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white">{unread}</span>}</Link>
            <Link to="/app/ia" className="btn-primary !py-1.5"><Sparkles size={16} /> <span className="hidden sm:inline">Demander à l’IA</span></Link>
          </div>
        </header>
        <TrialBanner />
        {accessNotice && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            <div className="mx-auto flex max-w-7xl items-start justify-between gap-3">
              <p>⚠️ {accessNotice}{' '}
                {restaurants.length > 1 && <Link to="/app/etablissements" className="underline">Choisir un autre établissement</Link>}
              </p>
              <button className="shrink-0 text-xs underline" onClick={clearAccessNotice}>Fermer</button>
            </div>
          </div>
        )}
        <EmailVerifyBanner />
        <main id="main-content" className="px-4 pt-6 pb-24 max-w-7xl lg:px-8 lg:py-8 lg:pb-8"><Outlet /></main>
        <FeedbackWidget /><UsageBeacon />
      </div>

      {/* Barre mobile : les 4 gestes du quotidien, sans ouvrir le menu. */}
      <nav aria-label="Navigation rapide" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-stone-200 bg-white/95 backdrop-blur lg:hidden">
        {mobileTabs.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${isActive ? 'text-brand-700' : 'text-stone-500'}`}>
            <Icon size={20} />
            {label}
            {to === '/app' && unread > 0 && <span className="absolute right-1/4 top-1.5 h-2 w-2 rounded-full bg-red-500" />}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/**
 * Chantier 5 (audit) — l'adresse e-mail n'est pas confirmée.
 * On ne bloque rien (un restaurateur doit pouvoir travailler tout de suite) mais on le dit clairement
 * et on donne le bouton pour renvoyer le lien. Aucun message ne promet un envoi qui n'a pas eu lieu.
 */
export function EmailVerifyBanner() {
  const { user, refresh } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (!user || user.emailVerified !== false || hidden) return null;
  const resend = async () => {
    setBusy(true); setMsg(null); setDevLink(null);
    try {
      const r = await api<{ message: string; devLink?: string }>('/auth/resend-verification', { method: 'POST' });
      setMsg(r.message); setDevLink(r.devLink ?? null);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          📧 <b>Confirmez votre adresse e-mail</b> ({user.email}) pour recevoir les alertes de rupture, les rappels de commande et le mail du matin.
        </span>
        <span className="flex items-center gap-2">
          <button className="btn-ghost !py-1" disabled={busy} onClick={() => void resend()}>{busy ? 'Envoi…' : 'Renvoyer le lien'}</button>
          <button className="text-xs underline opacity-70" onClick={() => setHidden(true)}>Plus tard</button>
        </span>
      </div>
      {msg && <p className="mt-2 text-xs">{msg}</p>}
      {devLink && (
        <p className="mt-2 rounded-lg border border-amber-300 bg-white/70 p-2 text-xs">
          Développement (aucun e-mail réel envoyé) : <a className="break-all underline" href={devLink}>{devLink}</a>
        </p>
      )}
      <p className="mt-1 text-[11px] opacity-80">Vérifié par erreur ? <button className="underline" onClick={() => void refresh()}>Rafraîchir l’état</button></p>
    </div>
  );
}

/** Bandeau fin d'essai / paiement (chantier 6) + interception des réponses 402 de l'API. */
function TrialBanner() {
  const [b, setB] = useState<{ state: string; trialDaysLeft: number | null; blocked: boolean; enforced: boolean } | null>(null);
  const [paywall, setPaywall] = useState<string | null>(null);
  useEffect(() => { api<typeof b>('/billing').then(setB).catch(() => null); const h = (e: Event) => setPaywall((e as CustomEvent<string>).detail); window.addEventListener('afs:paywall', h); return () => window.removeEventListener('afs:paywall', h); }, []);
  if (!b) return null;
  const show = paywall || b.blocked || b.state === 'past_due' || (b.state === 'trialing' && b.trialDaysLeft !== null && b.trialDaysLeft <= 7);
  if (!show) return null;
  const tone = paywall || b.blocked ? 'bg-amber-100 text-amber-900' : b.state === 'past_due' ? 'bg-red-100 text-red-900' : 'bg-brand-100 text-brand-900';
  const text = paywall ?? (b.state === 'expired' ? 'Votre essai gratuit est terminé : l’app est en lecture seule, vos données sont conservées.' : b.state === 'past_due' ? 'Dernier paiement refusé : mettez à jour votre carte pour éviter l’interruption.' : `Plus que ${b.trialDaysLeft} jour${(b.trialDaysLeft ?? 0) > 1 ? 's' : ''} d’essai gratuit.`);
  return <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm ${tone}`}><span>{text}</span><Link to="/app/abonnement" className="font-bold underline" onClick={() => setPaywall(null)}>Choisir ma formule →</Link></div>;
}

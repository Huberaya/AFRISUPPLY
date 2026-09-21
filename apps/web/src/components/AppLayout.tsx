// Port de ethimarket/src/components/DashboardLayout.tsx — navigation à 6 entrées du concept AFRISUPPLY
import { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Boxes, Truck, BarChart3, Sparkles, LogOut, Menu, X, ChefHat, Bell, BookOpen, Rocket, TrendingUp, ShoppingBasket as Basket, Receipt, Settings as SettingsIcon, Zap, Store, ShieldCheck, ListChecks, Users, Building2 } from 'lucide-react';
import { api } from '../lib/api';
import { FeedbackWidget, UsageBeacon } from './Pilot';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/useApi';

// minRole : mêmes règles que le serveur (les écritures sont refusées en 403 au-delà du rôle).
// L'employé voit donc ce qu'il peut réellement utiliser ; le responsable gère achats et réglages ;
// seul le propriétaire touche aux membres, à l'abonnement et à la suppression du compte.
const NAV = [
  { to: '/app', icon: LayoutDashboard, label: 'Accueil', end: true },
  { to: '/app/achats', icon: ShoppingCart, label: 'Achats' },
  { to: '/app/express', icon: Zap, label: 'Saisie express' },
  { to: '/app/stock', icon: Boxes, label: 'Stock' },
  { to: '/app/stock/prevision', icon: TrendingUp, label: 'Prévision 7 j' },
  { to: '/app/achats/panier', icon: Basket, label: 'Panier intelligent', minRole: 'manager' as const },
  { to: '/app/ventes', icon: Receipt, label: 'Ventes & auto-reorder' },
  { to: '/app/fournisseurs', icon: Truck, label: 'Fournisseurs', minRole: 'manager' as const },
  { to: '/app/courses', icon: ListChecks, label: 'Liste de courses' },
  { to: '/app/marketplace', icon: Store, label: 'Marketplace', minRole: 'manager' as const },
  { to: '/app/recettes', icon: ChefHat, label: 'Recettes', minRole: 'manager' as const },
  { to: '/app/catalogue', icon: BookOpen, label: 'Catalogue' },
  { to: '/app/analyse', icon: BarChart3, label: 'Analyse' },
  { to: '/app/ia', icon: Sparkles, label: 'Demander à l’IA' },
  { to: '/app/demarrer', icon: Rocket, label: 'Configurer ma carte' },
  { to: '/app/etablissements', icon: Building2, label: 'Mes établissements' },
  { to: '/app/equipe', icon: Users, label: 'Équipe & sécurité' },
  { to: '/app/parametres', icon: SettingsIcon, label: 'Paramètres', minRole: 'manager' as const },
];

const ROLE_RANK: Record<string, number> = { staff: 0, manager: 1, owner: 2 };
const ROLE_LABEL: Record<string, string> = { staff: 'Employé', manager: 'Responsable', owner: 'Propriétaire' };

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
  const visibleNav = NAV.filter((item) => ROLE_RANK[myRole] >= ROLE_RANK[(item as { minRole?: string }).minRole ?? 'staff']);
  const [open, setOpen] = useState(false);
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
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleNav.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-brand-700 text-white' : 'hover:bg-stone-800 text-stone-300'}`}>
            <Icon className="h-4.5 w-4.5" size={18} /> {label}
            {label === 'Accueil' && unread > 0 && <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
          </NavLink>
        ))}
        {user?.isAdmin && <>
          <p className="px-3 pt-4 pb-1 text-[11px] uppercase tracking-wide text-stone-500">Admin AFRISUPPLY</p>
          {[['/app/admin', 'Tableau de bord'], ['/app/admin/pilotes', 'Cockpit pilotes'], ['/app/admin/prospection', 'Prospection'], ['/app/admin/abonnements', 'Abonnements'], ['/app/admin/fournisseurs', 'Fournisseurs plateforme'], ['/app/admin/referentiel', 'Référentiel produits'], ['/app/admin/litiges', 'Litiges']].map(([to, label]) => <NavLink key={to} to={to} end={to === "/app/admin"} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-brand-700 text-white' : 'hover:bg-stone-800 text-stone-300'}`}><ShieldCheck size={18} /> {label}</NavLink>)}
        </>}
      </nav>
      <div className="border-t border-stone-800 px-4 py-4">
        <p className="text-sm font-semibold text-white truncate">{user?.fullName}</p>
        <p className="text-xs text-stone-500 truncate">{user?.email}</p>
        <button onClick={async () => { await logout(); nav('/connexion'); }} className="mt-3 flex items-center gap-2 text-xs text-stone-400 hover:text-white"><LogOut size={14} /> Se déconnecter</button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-stone-50 lg:flex">
      <div className="hidden lg:block lg:fixed lg:inset-y-0">{Sidebar}</div>
      {open && <div className="fixed inset-0 z-40 flex lg:hidden"><div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} /><div className="relative z-50">{Sidebar}</div></div>}
      <div className="flex-1 lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-8">
          <button className="lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X /> : <Menu />}</button>
          <div className="lg:hidden"><Logo /></div>
          <div className="hidden lg:block text-sm text-stone-500">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div className="flex items-center gap-2">
            <Link to="/app" className="relative rounded-xl p-2 hover:bg-stone-100" aria-label="Alertes"><Bell size={18} />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 h-4 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white">{unread}</span>}</Link>
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
        <main id="main-content" className="px-4 py-6 lg:px-8 lg:py-8 max-w-7xl"><Outlet /></main>
        <FeedbackWidget /><UsageBeacon />
      </div>
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

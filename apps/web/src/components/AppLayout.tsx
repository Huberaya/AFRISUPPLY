// Port de ethimarket/src/components/DashboardLayout.tsx — navigation à 6 entrées du concept AFRISUPPLY
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Boxes, Truck, BarChart3, Sparkles, LogOut, Menu, X, ChefHat, Bell, BookOpen, Rocket, TrendingUp, ShoppingBasket as Basket, Receipt, Settings as SettingsIcon, Zap, Store } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/useApi';

const NAV = [
  { to: '/app', icon: LayoutDashboard, label: 'Accueil', end: true },
  { to: '/app/achats', icon: ShoppingCart, label: 'Achats' },
  { to: '/app/express', icon: Zap, label: 'Saisie express' },
  { to: '/app/stock', icon: Boxes, label: 'Stock' },
  { to: '/app/stock/prevision', icon: TrendingUp, label: 'Prévision 7 j' },
  { to: '/app/achats/panier', icon: Basket, label: 'Panier intelligent' },
  { to: '/app/ventes', icon: Receipt, label: 'Ventes & auto-reorder' },
  { to: '/app/fournisseurs', icon: Truck, label: 'Fournisseurs' },
  { to: '/app/marketplace', icon: Store, label: 'Marketplace' },
  { to: '/app/recettes', icon: ChefHat, label: 'Recettes' },
  { to: '/app/catalogue', icon: BookOpen, label: 'Catalogue' },
  { to: '/app/analyse', icon: BarChart3, label: 'Analyse' },
  { to: '/app/ia', icon: Sparkles, label: 'Demander à l’IA' },
  { to: '/app/demarrer', icon: Rocket, label: 'Configurer ma carte' },
  { to: '/app/parametres', icon: SettingsIcon, label: 'Paramètres' },
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
  const { user, restaurant, restaurants, logout, switchRestaurant } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const { data: alerts } = useApi<{ alerts: { isRead: boolean }[] }>('/alerts');
  const unread = alerts?.alerts.filter((a) => !a.isRead).length ?? 0;

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
        <span className="pill mt-2 bg-brand-700/30 text-brand-200 capitalize">{restaurant?.plan === 'trial' ? 'Essai gratuit' : `Offre ${restaurant?.plan}`}</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-brand-700 text-white' : 'hover:bg-stone-800 text-stone-300'}`}>
            <Icon className="h-4.5 w-4.5" size={18} /> {label}
            {label === 'Accueil' && unread > 0 && <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
          </NavLink>
        ))}
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
        <main id="main-content" className="px-4 py-6 lg:px-8 lg:py-8 max-w-7xl"><Outlet /></main>
      </div>
    </div>
  );
}

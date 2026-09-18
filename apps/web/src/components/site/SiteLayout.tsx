import { Link, NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Logo } from '../AppLayout';

const NAV = [{ to: '/fonctionnalites', label: 'Fonctionnalités' }, { to: '/tarifs', label: 'Tarifs' }, { to: '/faq', label: 'FAQ' }];

export default function SiteLayout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-white text-stone-900">
      <header className="sticky top-0 z-40 border-b border-stone-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
          <Logo to="/" />
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">{NAV.map((n) => <NavLink key={n.to} to={n.to} className={({ isActive }) => isActive ? 'text-brand-700' : 'text-stone-600 hover:text-stone-900'}>{n.label}</NavLink>)}</nav>
          <div className="hidden items-center gap-2 md:flex"><Link to="/connexion" className="btn-ghost">Se connecter</Link><Link to="/demander-un-acces" className="btn-primary">Demander un accès</Link></div>
          <button className="md:hidden rounded-lg p-2" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X /> : <Menu />}</button>
        </div>
        {open && <div className="border-t border-stone-100 px-4 py-3 md:hidden flex flex-col gap-2 text-sm">{NAV.map((n) => <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="py-1.5">{n.label}</Link>)}<Link to="/connexion" onClick={() => setOpen(false)} className="py-1.5">Se connecter</Link><Link to="/demander-un-acces" onClick={() => setOpen(false)} className="btn-primary justify-center">Demander un accès</Link></div>}
      </header>
      <main><Outlet /></main>
      <footer className="border-t border-stone-100 bg-stone-50">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4 lg:px-8">
          <div className="md:col-span-2"><Logo to="/" /><p className="mt-3 max-w-sm text-sm text-stone-600">L’assistant d’approvisionnement intelligent des restaurants africains. Achetez mieux. Gaspillez moins. Gagnez plus.</p><p className="mt-3 text-xs text-stone-500">Nantes, France · bonjour@afrisupply.fr</p></div>
          <div className="text-sm"><p className="font-bold">Produit</p><ul className="mt-2 space-y-1 text-stone-600"><li><Link to="/fonctionnalites">Fonctionnalités</Link></li><li><Link to="/tarifs">Tarifs</Link></li><li><Link to="/faq">FAQ</Link></li><li><Link to="/connexion">Connexion</Link></li></ul></div>
          <div className="text-sm"><p className="font-bold">Entreprise</p><ul className="mt-2 space-y-1 text-stone-600"><li><Link to="/demander-un-acces">Devenir restaurant pilote</Link></li><li><a href="mailto:bonjour@afrisupply.fr">Contact</a></li><li><Link to="/mentions-legales">Mentions légales & confidentialité</Link></li><li><Link to="/cgv">CGV / CGU</Link></li><li><Link to="/statut">État de la plateforme</Link></li></ul></div>
        </div>
        <p className="pb-8 text-center text-xs text-stone-400">© {new Date().getFullYear()} AFRISUPPLY — Fait avec ❤️ pour les cuisines africaines de France.</p>
      </footer>
    </div>
  );
}

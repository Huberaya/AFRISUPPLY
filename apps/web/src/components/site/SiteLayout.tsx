import { Link, NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { Menu, X, ShoppingCart } from 'lucide-react';
import { useCart } from '../../lib/cart';
import { useAuth } from '../../lib/auth';
import { Logo, HomeButton } from '../AppLayout';
import { SUPPORT_EMAIL, mailtoSupport } from '../../lib/support';

const NAV = [
  { to: '/catalogue', label: 'Catalogue' },
  { to: '/pour-les-restaurants', label: 'Pour les restaurants' },
  { to: '/fournisseur', label: 'Grossistes' },
  { to: '/tarifs', label: 'Tarifs' },
  { to: '/faq', label: 'FAQ' },
];

export default function SiteLayout() {
  const [open, setOpen] = useState(false);
  const { count } = useCart();
  const { user } = useAuth();

  const CartBtn = (
    <Link to="/panier" className="relative rounded-xl p-2 text-stone-700 hover:bg-stone-100 touch-manipulation" aria-label="Panier">
      <ShoppingCart size={20} />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">
          {count}
        </span>
      )}
    </Link>
  );

  return (
    <div className="min-h-screen bg-white text-stone-900">
      <header className="sticky top-0 z-40 border-b border-stone-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 lg:px-8">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
            <Logo to="/" />
            <HomeButton />
          </div>
          <nav className="hidden items-center gap-5 xl:gap-6 text-sm font-medium lg:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => (isActive ? 'text-brand-700 font-bold' : 'text-stone-600 hover:text-stone-900 transition')}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex shrink-0">
            {CartBtn}
            {user ? (
              <Link to="/app" className="btn-primary">
                Mon espace
              </Link>
            ) : (
              <>
                <Link to="/connexion" className="btn-ghost">
                  Se connecter
                </Link>
                <Link to="/inscription" className="btn-primary">
                  Créer un compte
                </Link>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 lg:hidden shrink-0">
            {CartBtn}
            <button
              className="rounded-xl p-2 text-stone-700 hover:bg-stone-100 touch-manipulation"
              onClick={() => setOpen(!open)}
              aria-label={open ? 'Fermer le menu' : 'Menu'}
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Tiroir mobile & tablette avec fond occultant */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setOpen(false)} aria-hidden="true" />
            <div className="relative z-50 flex max-h-[92vh] flex-col overflow-y-auto bg-white px-5 py-6 shadow-2xl animate-fade-up">
              <div className="flex items-center justify-between pb-4 border-b border-stone-100">
                <Logo to="/" />
                <button
                  className="rounded-xl p-2 text-stone-500 hover:bg-stone-100 touch-manipulation"
                  onClick={() => setOpen(false)}
                  aria-label="Fermer le menu"
                >
                  <X size={22} />
                </button>
              </div>
              <div className="py-3 border-b border-stone-100" onClick={() => setOpen(false)}>
                <HomeButton />
              </div>
              <nav className="flex flex-col py-2 divide-y divide-stone-50 text-base font-semibold">
                {NAV.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center justify-between py-3.5 transition touch-manipulation ${
                        isActive ? 'text-brand-700 font-bold' : 'text-stone-700 hover:text-stone-900'
                      }`
                    }
                  >
                    <span>{n.label}</span>
                    <span className="text-stone-400 text-sm">→</span>
                  </NavLink>
                ))}
              </nav>
              <div className="pt-4 border-t border-stone-100 flex flex-col gap-2.5">
                {user ? (
                  <Link to="/app" onClick={() => setOpen(false)} className="btn-primary justify-center !py-3 text-base">
                    Mon espace
                  </Link>
                ) : (
                  <>
                    <Link to="/inscription" onClick={() => setOpen(false)} className="btn-primary justify-center !py-3 text-base">
                      Créer un compte restaurant
                    </Link>
                    <Link to="/connexion" onClick={() => setOpen(false)} className="btn-ghost justify-center !py-3 text-base">
                      Se connecter
                    </Link>
                  </>
                )}
                <p className="mt-2 text-center text-xs text-stone-500">
                  Besoin d’aide ?{' '}
                  <a className="underline" href={mailtoSupport('AFRISUPPLY — contact')}>
                    {SUPPORT_EMAIL}
                  </a>
                </p>
              </div>
            </div>
          </div>
        )}
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="border-t border-stone-100 bg-stone-50">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
          <div className="sm:col-span-2">
            <Logo to="/" />
            <p className="mt-3 max-w-sm text-sm text-stone-600">
              L’assistant d’approvisionnement intelligent des restaurants africains. Achetez mieux. Gaspillez moins. Gagnez plus.
            </p>
            <p className="mt-3 text-xs text-stone-500">Nantes, France · {SUPPORT_EMAIL}</p>
          </div>
          <div className="text-sm">
            <p className="font-bold text-stone-900">Produit</p>
            <ul className="mt-2 space-y-2 text-stone-600">
              <li>
                <Link to="/fonctionnalites" className="hover:text-stone-900 transition">
                  Fonctionnalités
                </Link>
              </li>
              <li>
                <Link to="/tarifs" className="hover:text-stone-900 transition">
                  Tarifs
                </Link>
              </li>
              <li>
                <Link to="/faq" className="hover:text-stone-900 transition">
                  FAQ
                </Link>
              </li>
              <li>
                <Link to="/connexion" className="hover:text-stone-900 transition">
                  Connexion
                </Link>
              </li>
            </ul>
          </div>
          <div className="text-sm">
            <p className="font-bold text-stone-900">Entreprise</p>
            <ul className="mt-2 space-y-2 text-stone-600">
              <li>
                <Link to="/demander-un-acces" className="hover:text-stone-900 transition">
                  Devenir restaurant pilote
                </Link>
              </li>
              <li>
                <Link to="/fournisseur" className="hover:text-stone-900 transition">
                  Vous êtes grossiste ? Vendre sur AFRISUPPLY
                </Link>
              </li>
              <li>
                <a href={mailtoSupport('AFRISUPPLY — contact')} className="hover:text-stone-900 transition">
                  Contact
                </a>
              </li>
              <li>
                <Link to="/mentions-legales" className="hover:text-stone-900 transition">
                  Mentions légales & confidentialité
                </Link>
              </li>
              <li>
                <Link to="/cgv" className="hover:text-stone-900 transition">
                  CGV / CGU
                </Link>
              </li>
              <li>
                <Link to="/cgv-fournisseur" className="hover:text-stone-900 transition">
                  Conditions fournisseur
                </Link>
              </li>
              <li>
                <Link to="/statut" className="hover:text-stone-900 transition">
                  État de la plateforme
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <p className="pb-8 text-center text-xs text-stone-400">© {new Date().getFullYear()} AFRISUPPLY — Fait avec ❤️ pour les cuisines africaines de France.</p>
      </footer>
    </div>
  );
}

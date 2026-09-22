// Navigation — 404 utile : au lieu de renvoyer vers /app en boucle, on propose les bons départs.
import { Link } from 'react-router-dom';
import { Logo } from '../components/AppLayout';
import { useAuth } from '../lib/auth';

export default function NotFound() {
  const { user } = useAuth();
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <Logo />
      <div>
        <p className="text-6xl font-extrabold text-stone-300">404</p>
        <h1 className="mt-2 text-2xl font-extrabold text-stone-900">Page introuvable</h1>
        <p className="mt-2 text-sm text-stone-600">Cette page n’existe pas (ou plus). Voici où aller :</p>
      </div>
      <nav className="flex flex-wrap justify-center gap-3 text-sm font-semibold">
        <Link to="/" className="btn-ghost">Accueil du site</Link>
        <Link to="/catalogue" className="btn-ghost">Catalogue</Link>
        <Link to="/tarifs" className="btn-ghost">Tarifs</Link>
        <Link to="/faq" className="btn-ghost">FAQ</Link>
        {user ? <Link to="/app" className="btn-primary">Mon espace</Link> : <Link to="/connexion" className="btn-primary">Se connecter</Link>}
      </nav>
    </div>
  );
}

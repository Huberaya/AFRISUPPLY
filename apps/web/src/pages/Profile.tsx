import { UserProfile, useUser } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { clerkEnabled } from '../lib/clerk';
import { User, Shield, Building2, Mail, CheckCircle2, AlertTriangle } from 'lucide-react';

type ClerkView = { fullName: string | null; email: string | null; isLoaded: boolean; signedIn: boolean };

/** Lecture du compte Clerk : composant séparé, monté uniquement quand Clerk est configuré. */
function WithClerk({ children }: { children: (c: ClerkView) => JSX.Element }) {
  const { user, isLoaded, isSignedIn } = useUser();
  return children({ fullName: user?.fullName ?? null, email: user?.primaryEmailAddress?.emailAddress ?? null, isLoaded, signedIn: !!isSignedIn });
}

export default function Profile() {
  if (!clerkEnabled) return <ProfileView clerk={null} />;
  return <WithClerk>{(clerk) => <ProfileView clerk={clerk} />}</WithClerk>;
}

function ProfileView({ clerk }: { clerk: ClerkView | null }) {
  const { user: localUser, restaurant } = useAuth();
  // Le compte est-il géré par Clerk ? (Clerk configuré ET personne connectée par Clerk)
  const viaClerk = !!clerk?.signedIn;
  const clerkUser = clerk ? { fullName: clerk.fullName, primaryEmailAddress: clerk.email ? { emailAddress: clerk.email } : null } : null;
  const isLoaded = clerk?.isLoaded ?? true;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* En-tête de la page */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight flex items-center gap-3">
            <span className="p-2 rounded-xl bg-brand-50 text-brand-700">
              <User className="h-6 w-6" />
            </span>
            Profil utilisateur & Sécurité
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {viaClerk ? 'Gérez vos identifiants, votre adresse e-mail, votre mot de passe et vos paramètres de sécurité.' : 'Votre identité, l’état de votre adresse e-mail et la sécurité de votre compte.'}
          </p>
        </div>

        {restaurant && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-100 border border-stone-200 text-xs font-medium text-stone-700">
            <Building2 className="h-3.5 w-3.5 text-stone-500" />
            <span>Établissement : <strong className="text-stone-900">{restaurant.name}</strong></span>
            <span className="px-1.5 py-0.5 rounded bg-brand-100 text-brand-800 text-[10px] uppercase font-bold">
              {restaurant.role || 'owner'}
            </span>
          </div>
        )}
      </div>

      {/* Résumé du compte synchronisé */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4 bg-white border border-stone-200 rounded-2xl shadow-sm space-y-1">
          <div className="text-xs font-semibold uppercase text-stone-500 flex items-center gap-1.5">
            <User className="h-4 w-4 text-stone-400" />
            Nom complet
          </div>
          <div className="text-base font-bold text-stone-900">
            {clerkUser?.fullName || localUser?.fullName || 'Utilisateur AFRISUPPLY'}
          </div>
          <div className="text-xs text-stone-500">
            {viaClerk ? 'Compte connecté par Clerk' : 'Compte AFRISUPPLY (e-mail et mot de passe)'}
          </div>
        </div>

        <div className="card p-4 bg-white border border-stone-200 rounded-2xl shadow-sm space-y-1">
          <div className="text-xs font-semibold uppercase text-stone-500 flex items-center gap-1.5">
            <Mail className="h-4 w-4 text-stone-400" />
            Adresse e-mail
          </div>
          <div className="text-base font-bold text-stone-900 truncate">
            {clerkUser?.primaryEmailAddress?.emailAddress || localUser?.email || '—'}
          </div>
          {/* L'état affiché est celui que le serveur connaît — jamais une mention « vérifiée » par défaut. */}
          {localUser?.emailVerified ? (
            <div className="text-xs text-emerald-600 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Adresse confirmée
            </div>
          ) : (
            <div className="text-xs text-amber-700 font-medium flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Adresse non confirmée
            </div>
          )}
        </div>

        <div className="card p-4 bg-white border border-stone-200 rounded-2xl shadow-sm space-y-1">
          <div className="text-xs font-semibold uppercase text-stone-500 flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-stone-400" />
            Sécurité & Rôle
          </div>
          <div className="text-base font-bold text-stone-900">
            {localUser?.isAdmin ? 'Administrateur Plateforme' : 'Restaurateur Partenaire'}
          </div>
          <div className="text-xs text-stone-500">
            Session protégée, révocable depuis « Équipe &amp; sécurité »
          </div>
        </div>
      </div>

      {/* Composant officiel Clerk UserProfile */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-4 sm:p-6 overflow-hidden flex justify-center">
        {!viaClerk ? (
          <div className="py-8 text-center text-sm text-stone-600 space-y-2">
            <p>Votre compte utilise la connexion par e-mail et mot de passe.</p>
            <p>
              Changer de mot de passe ou fermer toutes vos sessions :{' '}
              <Link to="/app/equipe" className="font-semibold text-brand-700 underline">Équipe &amp; sécurité</Link>.
            </p>
          </div>
        ) : isLoaded ? (
          <UserProfile
            routing="path"
            path="/app/profil"
            appearance={{
              elements: {
                rootBox: 'w-full',
                card: 'w-full shadow-none border-0 p-0',
                navbar: 'hidden md:flex border-r border-stone-200',
                headerTitle: 'text-xl font-bold text-stone-900',
                headerSubtitle: 'text-sm text-stone-500',
              },
            }}
          />
        ) : (
          <div className="py-12 text-center text-sm text-stone-500 animate-pulse">
            Chargement des paramètres de profil Clerk…
          </div>
        )}
      </div>
    </div>
  );
}

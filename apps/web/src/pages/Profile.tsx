import { UserProfile, useUser } from '@clerk/clerk-react';
import { useAuth } from '../lib/auth';
import { User, Shield, Building2, Mail, CheckCircle2 } from 'lucide-react';

export default function Profile() {
  const { user: localUser, restaurant } = useAuth();
  const { user: clerkUser, isLoaded } = useUser();

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
            Gérez vos identifiants Clerk, votre adresse e-mail, votre mot de passe et vos paramètres de sécurité.
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
            Compte synchronisé avec Clerk & Neon
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
          <div className="text-xs text-emerald-600 font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Vérifiée par Clerk
          </div>
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
            Session chiffrée SSL / Neon Database
          </div>
        </div>
      </div>

      {/* Composant officiel Clerk UserProfile */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-4 sm:p-6 overflow-hidden flex justify-center">
        {isLoaded ? (
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

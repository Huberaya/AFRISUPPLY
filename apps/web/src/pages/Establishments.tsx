// Chantier 8 — /app/etablissements : mes établissements (rôle, formule, essai) et choix de celui
// que j'ouvre. Utile dès qu'un utilisateur appartient à plusieurs restaurants (gérant multi-sites,
// comptable, franchisé) : il voit où il a le droit d'agir et bascule en un clic.
import { Building2, Check, ChevronRight, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { PageTitle, Loader } from '../components/ui';

const ROLE_LABEL: Record<string, string> = { owner: 'Propriétaire', manager: 'Responsable', staff: 'Employé' };
const PLAN_LABEL: Record<string, string> = { trial: 'Essai gratuit', starter: 'Starter', pro: 'Pro', business: 'Business' };

export default function Establishments() {
  const { restaurants, restaurant, switchRestaurant, loading } = useAuth();
  if (loading) return <Loader />;
  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  return (
    <div className="animate-fade-up max-w-4xl space-y-5">
      <PageTitle title="🏠 Mes établissements" subtitle="Vous pouvez appartenir à plusieurs restaurants : choisissez celui que vous ouvrez (le changement est immédiat)." />
      {restaurants.length === 0 && <p className="card text-sm text-stone-600">Aucun établissement associé à ce compte. Si vous venez de recevoir une invitation, ouvrez le lien reçu par e-mail.</p>}
      <div className="space-y-3">
        {restaurants.map((r) => {
          const current = r.id === restaurant?.id;
          return (
            <div key={r.id} className={`card flex flex-wrap items-center justify-between gap-3 ${current ? 'ring-2 ring-brand-500' : ''}`}>
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-bold">
                  <Building2 size={18} className="text-stone-400" /> {r.name}
                  {current && <span className="pill bg-emerald-50 text-emerald-800">ouvert en ce moment</span>}
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  {r.city ? `${r.city} · ` : ''}Votre rôle : <b>{ROLE_LABEL[r.role] ?? r.role}</b> · Formule : <b>{PLAN_LABEL[r.plan] ?? r.plan}</b>
                  {r.plan === 'trial' && fmt(r.trialEndsAt) ? ` (jusqu’au ${fmt(r.trialEndsAt)})` : ''}
                </p>
                {r.role === 'staff' && <p className="mt-1 text-xs text-stone-500">Employé : achats, stock et réception — pas de réglages ni de commandes fournisseur.</p>}
                {r.role === 'manager' && <p className="mt-1 text-xs text-stone-500">Responsable : tout au quotidien, sauf la gestion des utilisateurs et la suppression du compte.</p>}
              </div>
              {current
                ? <span className="btn-ghost cursor-default items-center"><Check size={16} /> Établissement ouvert</span>
                : <button className="btn-primary items-center" onClick={() => switchRestaurant(r.id)}>Ouvrir cet établissement <ChevronRight size={16} /></button>}
            </div>
          );
        })}
      </div>
      <div className="card flex gap-2 text-sm text-stone-600">
        <Info size={18} className="mt-0.5 shrink-0 text-stone-400" />
        <p>Chaque établissement garde ses propres stocks, fournisseurs, commandes et ventes : rien n’est mélangé entre deux restaurants. Les factures AFRISUPPLY arrivent séparément pour chacun (rubrique <Link className="underline" to="/app/abonnement">Mon abonnement</Link>).</p>
      </div>
    </div>
  );
}

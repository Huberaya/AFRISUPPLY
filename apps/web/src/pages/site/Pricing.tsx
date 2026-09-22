import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Minus } from 'lucide-react';
import { PLANS, FOUNDER } from '../../lib/plans';
import { SUPPORT_EMAIL, mailtoSupport } from '../../lib/support';
import SocialProof from '../../components/site/SocialProof';

const MATRIX: { group: string; rows: { label: string; starter: boolean | string; pro: boolean | string; business: boolean | string }[] }[] = [
  {
    group: 'Achats au quotidien',
    rows: [
      { label: 'Stock, statuts et jours restants', starter: true, pro: true, business: true },
      { label: 'Fiches fournisseurs, prix, historique', starter: true, pro: true, business: true },
      { label: 'Commandes WhatsApp / e-mail', starter: true, pro: true, business: true },
      { label: 'Réception, écarts et réclamations', starter: true, pro: true, business: true },
      { label: 'Alertes rupture, stock bas, hausse de prix', starter: true, pro: true, business: true },
      { label: 'Import / export CSV', starter: true, pro: true, business: true },
    ],
  },
  {
    group: 'Intelligence',
    rows: [
      { label: 'Prévision des besoins 7 jours', starter: false, pro: true, business: true },
      { label: 'Comparateur multi-fournisseurs', starter: false, pro: true, business: true },
      { label: 'Panier intelligent & auto-reorder', starter: false, pro: true, business: true },
      { label: 'Recettes, coût matière, marges', starter: false, pro: true, business: true },
      { label: 'Assistant « Demander à l’IA »', starter: false, pro: true, business: true },
    ],
  },
  {
    group: 'Organisation',
    rows: [
      { label: 'Utilisateurs', starter: '3', pro: '5', business: 'Illimités' },
      { label: 'Achats groupés entre restaurants', starter: false, pro: false, business: true },
      { label: 'Support', starter: 'E-mail', pro: 'E-mail + WhatsApp', business: 'Accompagnement dédié' },
    ],
  },
];

const Cell = ({ v }: { v: boolean | string }) =>
  typeof v === 'string' ? (
    <span className="text-xs sm:text-sm font-medium">{v}</span>
  ) : v ? (
    <Check className="mx-auto text-emerald-600" size={18} />
  ) : (
    <Minus className="mx-auto text-stone-300" size={18} />
  );

export default function Pricing() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16 lg:px-8">
      <h1 className="text-center text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-900">Tarifs</h1>
      <p className="mt-3 text-center text-sm sm:text-base text-stone-600 max-w-2xl mx-auto">
        Sans engagement, résiliable en un clic. Prix HT par établissement, facture PDF chaque mois.
      </p>

      {/* Bannière offre pilote */}
      <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-brand-200 bg-brand-50 p-4 sm:p-5 text-center text-xs sm:text-sm text-brand-900">
        <b>Offre pilote fondateur</b> — {FOUNDER.trialDays} jours gratuits sans carte, puis <b>−{FOUNDER.discountPct} % à vie</b> pour les {FOUNDER.seats} premiers restaurants.{' '}
        <Link to="/demander-un-acces?plan=pilote" className="underline font-semibold text-brand-800">
          Je candidate
        </Link>
        <p className="mt-2 text-[11px] sm:text-xs text-brand-800 leading-relaxed">
          Paiement par carte bancaire (Stripe) ou par virement sur facture. Le guichet carte est en cours d’ouverture : en attendant, écrivez-nous, l’activation est faite à la main sous 24 h ouvrées.
        </p>
      </div>

      <SocialProof />

      {/* Cartes des formules */}
      <div className="mt-8 sm:mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PLANS.map((p) => (
          <div key={p.id} className={`card relative flex flex-col ${p.highlight ? 'ring-2 ring-brand-500' : ''}`}>
            {p.highlight && <span className="absolute -top-3 left-5 pill bg-brand-600 text-white">Le plus choisi</span>}
            <h2 className="text-lg sm:text-xl font-bold text-stone-900">{p.name}</h2>
            <p className="text-xs sm:text-sm text-stone-500">{p.tagline}</p>
            <p className="mt-4">
              <span className="text-3xl sm:text-4xl font-extrabold text-stone-900">{p.priceMonthly} €</span>
              <span className="text-xs sm:text-sm text-stone-500"> / mois</span>
            </p>
            <p className="text-xs text-stone-500 mt-0.5">
              soit {Math.round(p.priceMonthly * (1 - FOUNDER.discountPct / 100))} € / mois en offre pilote
            </p>
            <ul className="mt-4 space-y-2 text-xs sm:text-sm text-stone-700 flex-1">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              to={`/demander-un-acces?plan=${p.id}`}
              className={`mt-6 w-full justify-center ${p.highlight ? 'btn-primary' : 'btn-ghost'}`}
            >
              Essayer {FOUNDER.trialDays} jours
            </Link>
          </div>
        ))}
      </div>

      {/* Tableau comparatif complet avec défilement horizontal garanti */}
      <div className="card mt-12 overflow-x-auto !p-0 border border-stone-200">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="bg-stone-50 text-xs uppercase text-stone-500">
              <th className="px-4 py-3 font-bold">Fonctionnalité</th>
              {PLANS.map((p) => (
                <th key={p.id} className="px-4 py-3 text-center font-bold">
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((g) => (
              <React.Fragment key={g.group}>
                <tr className="bg-stone-50/70 border-t border-stone-200">
                  <td colSpan={4} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-stone-700">
                    {g.group}
                  </td>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.label} className="border-t border-stone-100 hover:bg-stone-50/40">
                    <td className="px-4 py-2.5 text-xs sm:text-sm text-stone-800">{r.label}</td>
                    <td className="px-4 py-2.5 text-center"><Cell v={r.starter} /></td>
                    <td className="px-4 py-2.5 text-center"><Cell v={r.pro} /></td>
                    <td className="px-4 py-2.5 text-center"><Cell v={r.business} /></td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Questions & Précisions */}
      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        <div className="card p-5">
          <h3 className="font-bold text-stone-900 text-base sm:text-lg">Marketplace fournisseurs (bientôt)</h3>
          <p className="mt-2 text-xs sm:text-sm text-stone-600 leading-relaxed">
            Commandez chez des fournisseurs partenaires directement dans l’app. Gratuit pour vous : une commission de 2 à 5 % est prise côté fournisseur.
          </p>
        </div>
        <div className="card p-5">
          <h3 className="font-bold text-stone-900 text-base sm:text-lg">Une question sur les tarifs ?</h3>
          <p className="mt-2 text-xs sm:text-sm text-stone-600 leading-relaxed">
            Écrivez-nous à{' '}
            <a className="underline font-semibold text-brand-700" href={mailtoSupport('AFRISUPPLY — question sur les tarifs')}>
              {SUPPORT_EMAIL}
            </a>{' '}
            ou demandez une démo de 20 minutes.
          </p>
          <div className="mt-4">
            <Link to="/demander-un-acces" className="btn-primary text-xs sm:text-sm">
              Demander une démo
            </Link>
          </div>
        </div>
        <div className="card sm:col-span-2 p-5 sm:p-6">
          <h3 className="font-bold text-stone-900 text-base sm:text-lg">Comment ça se passe concrètement ?</h3>
          <ul className="mt-3 space-y-2 text-xs sm:text-sm text-stone-600">
            <li>
              <b>Essai :</b> {FOUNDER.trialDays} jours, toutes les fonctions Pro, sans carte bancaire. Aucun prélèvement automatique à la fin : nous vous demandons confirmation.
            </li>
            <li>
              <b>Paiement :</b> carte bancaire (prélèvement mensuel automatique) ou virement mensuel sur facture. Facture AFRISUPPLY en PDF envoyée par e-mail à chaque échéance, également téléchargeable dans votre espace, rubrique Abonnement.
            </li>
            <li>
              <b>Résiliation :</b> en un clic depuis votre espace (ou par simple e-mail). L’accès reste actif jusqu’à la fin de la période déjà payée ; vos données restent exportables.
            </li>
            <li>
              <b>Utilisateurs inclus :</b> 3 en Starter, 5 en Pro, illimités en Business — vous ajoutez vos équipes vous-même depuis les Paramètres.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

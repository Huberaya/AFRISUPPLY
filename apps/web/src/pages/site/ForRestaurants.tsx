import { Link } from 'react-router-dom';
import { ArrowRight, Boxes, TrendingUp, Scale, Sparkles, ShieldCheck, MessageCircle, Check } from 'lucide-react';
import { PLANS, FOUNDER } from '../../lib/plans';

const BENEFITS = [
  { icon: Boxes, title: 'Zéro rupture surprise', text: 'Chaque produit affiche ses jours de stock restants. Les ruptures sont annoncées 3 jours avant, pas au moment du coup de feu.', kpi: '−80 %', kpiLabel: 'de ruptures constatées chez nos pilotes' },
  { icon: Scale, title: 'Payez le juste prix', text: 'Le comparateur met vos fournisseurs côte à côte, prix au kilo, délai et fiabilité compris, et vous dit lequel choisir — et pourquoi.', kpi: '8 à 12 %', kpiLabel: 'd’économie sur les achats' },
  { icon: TrendingUp, title: 'Vos marges, plat par plat', text: 'Coût matière réel du mafé, du thiéb, de l’alloco. Quand l’huile de palme grimpe, vous le savez avant votre comptable.', kpi: '3 h', kpiLabel: 'gagnées par semaine sur les achats' },
];
const STEPS = [
  { n: '1', t: 'Choisissez vos plats', d: 'Parmi 31 recettes types de la cuisine ouest et centre-africaine. L’app en déduit votre liste de produits.' },
  { n: '2', t: 'Ajoutez vos fournisseurs', d: 'Saisie rapide ou import CSV de vos prix. Vos fournisseurs n’ont rien à installer.' },
  { n: '3', t: 'Laissez l’assistant travailler', d: 'Stock, prévision, panier intelligent, alertes : chaque matin, vous savez quoi commander.' },
];
const QUESTIONS = ['Qu’est-ce que je dois commander cette semaine ?', 'Pourquoi mes coûts augmentent ?', 'Trouve-moi moins cher pour le riz.', 'Combien me coûte réellement mon mafé ?'];

export default function Home() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-stone-950 text-white">
        <img src="/hero-cuisine.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-r from-stone-950 via-stone-950/80 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 py-24 lg:px-8 lg:py-36">
          <span className="pill bg-brand-500/20 text-brand-200 ring-1 ring-brand-400/40">Pour les restaurants africains de France</span>
          <h1 className="mt-5 max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">Achetez mieux.<br />Gaspillez moins.<br /><span className="text-brand-400">Gagnez plus.</span></h1>
          <p className="mt-6 max-w-xl text-lg text-stone-200">AFRISUPPLY suit vos stocks, compare vos fournisseurs, prévoit vos besoins et prépare vos commandes. Vous gardez la main — et vos marges.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/demander-un-acces" className="btn bg-brand-500 px-6 py-3 text-base text-white hover:bg-brand-600">Demander un accès <ArrowRight size={18} /></Link>
            <Link to="/connexion" className="btn bg-white/10 px-6 py-3 text-base text-white ring-1 ring-white/30 hover:bg-white/20">Voir la démo</Link>
          </div>
          <p className="mt-4 text-sm text-stone-400">Essai {FOUNDER.trialDays} jours · sans carte bancaire · −{FOUNDER.discountPct} % à vie pour les {FOUNDER.seats} premiers pilotes</p>
        </div>
      </section>

      {/* PROBLÈME */}
      <section className="mx-auto max-w-6xl px-4 py-20 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight">Le cahier, WhatsApp et la mémoire. Ça tenait… jusqu’au samedi soir.</h2>
            <ul className="mt-6 space-y-3 text-stone-700">
              {['Le plantain manque au moment du rush, le fournisseur ne livre que mardi.', 'L’huile de palme a pris 12 % en deux mois et personne ne l’a vu.', 'Trois fournisseurs pour le même riz, sans savoir lequel est vraiment le moins cher au kilo.', 'Une livraison incomplète, jamais réclamée, jamais remboursée.'].map((t) => <li key={t} className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" /> {t}</li>)}
            </ul>
            <p className="mt-6 font-semibold">Ce n’est pas un problème de cuisine. C’est un problème d’information. On le règle.</p>
          </div>
          <div className="card bg-stone-900 text-white">
            <p className="text-xs uppercase tracking-wide text-brand-300">🤖 Ce matin, l’IA recommande</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-xl border-l-4 border-red-500 bg-white/5 p-3"><p className="font-bold">🔴 Plantain : rupture samedi</p><p className="text-stone-300">14 kg en stock, besoin 53,8 kg sur 7 jours (pic samedi). Commander 31 kg aujourd’hui — Primeurs du Marché livre en 24 h.</p></div>
              <div className="rounded-xl border-l-4 border-amber-500 bg-white/5 p-3"><p className="font-bold">📈 Huile de palme rouge +12 %</p><p className="text-stone-300">Chez Afro Distribution (4,38 → 4,90 €/L). Sahel Épices est à 4,30 €/L, délai 3 jours : votre stock le permet.</p></div>
              <div className="rounded-xl border-l-4 border-emerald-500 bg-white/5 p-3"><p className="font-bold">🟢 Mafé bœuf : 79 % de marge</p><p className="text-stone-300">Coût matière 3,33 € pour 16 € vendus. Pas besoin d’augmenter le prix.</p></div>
            </div>
          </div>
        </div>
      </section>

      {/* BÉNÉFICES */}
      <section className="bg-stone-50 py-20">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Trois bénéfices, mesurables dès le premier mois</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {BENEFITS.map((b) => <div key={b.title} className="card"><b.icon className="text-brand-600" size={28} /><h3 className="mt-4 text-xl font-bold">{b.title}</h3><p className="mt-2 text-sm text-stone-600">{b.text}</p><p className="mt-6 text-4xl font-extrabold text-brand-700">{b.kpi}</p><p className="text-xs text-stone-500">{b.kpiLabel}*</p></div>)}
          </div>
          <p className="mt-6 text-center text-xs text-stone-400">* Objectifs mesurés avec nos restaurants pilotes ; vos résultats dépendent de votre carte et de vos fournisseurs.</p>
        </div>
      </section>

      {/* ASSISTANT */}
      <section className="mx-auto max-w-6xl px-4 py-20 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="order-2 lg:order-1 card">
            <p className="flex items-center gap-2 text-sm font-bold"><Sparkles size={16} className="text-brand-600" /> Demander à l’IA</p>
            <div className="mt-4 space-y-3">{QUESTIONS.map((q) => <div key={q} className="rounded-2xl rounded-bl-sm bg-stone-100 px-4 py-2 text-sm">{q}</div>)}</div>
            <div className="mt-3 rounded-2xl rounded-br-sm bg-brand-700 px-4 py-3 text-sm text-white">Pour <b>riz parfumé</b>, 3 fournisseurs : Sahel Épices à 1,56 €/kg, Afro Distribution à 1,68 €/kg, Tropic Import à 1,80 €/kg. Meilleur choix : Afro Distribution — 24 h de délai et 95 % de fiabilité, votre stock ne tient que 3 jours.</div>
          </div>
          <div className="order-1 lg:order-2">
            <h2 className="text-3xl font-extrabold tracking-tight">Posez la question comme à votre second de cuisine</h2>
            <p className="mt-4 text-stone-700">L’assistant répond avec <b>vos</b> chiffres : stock, prix payés, recettes, fiabilité réelle de vos fournisseurs. Il n’invente jamais un prix et chaque réponse ouvre l’écran pour agir.</p>
            <ul className="mt-6 space-y-2 text-sm text-stone-700">{['Prévision 7 jours expliquée produit par produit', 'Panier intelligent réparti entre fournisseurs au meilleur coût total', 'Auto-reorder : commandes préparées, jamais envoyées sans vous', 'Écarts de livraison chiffrés avec réclamation prête'].map((t) => <li key={t} className="flex gap-2"><Check size={16} className="mt-0.5 text-emerald-600" /> {t}</li>)}</ul>
          </div>
        </div>
      </section>

      {/* ÉTAPES */}
      <section className="bg-stone-900 py-20 text-white">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Opérationnel en 15 minutes</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">{STEPS.map((s) => <div key={s.n} className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-lg font-extrabold">{s.n}</span><h3 className="mt-4 text-lg font-bold">{s.t}</h3><p className="mt-2 text-sm text-stone-300">{s.d}</p></div>)}</div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-stone-300"><span className="flex items-center gap-2"><MessageCircle size={16} /> Vos fournisseurs n’installent rien</span><span className="flex items-center gap-2"><ShieldCheck size={16} /> Données hébergées en Europe</span><span className="flex items-center gap-2"><Check size={16} /> Export CSV à tout moment</span></div>
        </div>
      </section>

      {/* TARIFS (aperçu) */}
      <section className="mx-auto max-w-6xl px-4 py-20 lg:px-8">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">Un tarif simple, sans engagement</h2>
        <p className="mt-2 text-center text-stone-600">Moins qu’une livraison ratée par mois.</p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => <div key={p.id} className={`card relative ${p.highlight ? 'ring-2 ring-brand-500' : ''}`}>{p.highlight && <span className="absolute -top-3 left-5 pill bg-brand-600 text-white">Le plus choisi</span>}<h3 className="text-lg font-bold">{p.name}</h3><p className="text-sm text-stone-500">{p.tagline}</p><p className="mt-4"><span className="text-4xl font-extrabold">{p.priceMonthly} €</span><span className="text-stone-500"> / mois HT</span></p><ul className="mt-4 space-y-1.5 text-sm text-stone-700">{p.features.slice(0, 4).map((f) => <li key={f} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-600" /> {f}</li>)}</ul><Link to={`/demander-un-acces?plan=${p.id}`} className={`mt-6 w-full justify-center ${p.highlight ? 'btn-primary' : 'btn-ghost'}`}>Essayer {FOUNDER.trialDays} jours</Link></div>)}
        </div>
        <p className="mt-6 text-center text-sm"><Link to="/tarifs" className="font-semibold text-brand-700 underline">Comparer les plans en détail →</Link></p>
      </section>

      {/* CTA FINAL */}
      <section className="bg-brand-700 py-16 text-white">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-extrabold">Devenez l’un des {FOUNDER.seats} restaurants pilotes</h2>
          <p className="mt-3 text-brand-100">−{FOUNDER.discountPct} % à vie, un accompagnement direct avec l’équipe, et un produit construit avec vous.</p>
          <Link to="/demander-un-acces?plan=pilote" className="btn mt-8 bg-white px-6 py-3 text-base text-brand-800 hover:bg-brand-50">Demander un accès <ArrowRight size={18} /></Link>
        </div>
      </section>
    </>
  );
}

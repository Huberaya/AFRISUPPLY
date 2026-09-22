// Chantier 6 (audit) — preuve sociale HONNÊTE : chiffres réels (référentiel, NPS mesuré) et
// témoignages publiés UNIQUEMENT avec l'accord du pilote (feedback.published). Jamais inventés.
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/useApi';

type Proof = {
  testimonials: { quote: string; restaurant: string; city: string | null; score: number | null }[];
  metrics: { referenceProducts: number; recipeTemplates: number; nps: number | null; npsResponses: number; founderSeats: number };
};

export default function SocialProof() {
  const { data } = useApi<Proof>('/public/proof');
  const m = data?.metrics;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:py-12 lg:px-8">
      {/* Chiffres réels — jamais de promesse chiffrée non mesurée */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 text-center lg:grid-cols-4">
        <div className="card p-4 sm:p-5">
          <p className="text-2xl sm:text-3xl font-extrabold text-brand-700">{m?.referenceProducts ?? '—'}</p>
          <p className="mt-1 text-xs sm:text-sm text-stone-600">produits africains référencés (avec alias)</p>
        </div>
        <div className="card p-4 sm:p-5">
          <p className="text-2xl sm:text-3xl font-extrabold text-brand-700">{m?.recipeTemplates ?? '—'}</p>
          <p className="mt-1 text-xs sm:text-sm text-stone-600">recettes types prêtes à l'emploi</p>
        </div>
        <div className="card p-4 sm:p-5">
          <p className="text-2xl sm:text-3xl font-extrabold text-brand-700">{m?.npsResponses ? `${m.nps}/10` : '—'}</p>
          <p className="mt-1 text-xs sm:text-sm text-stone-600">
            {m?.npsResponses ? `NPS moyen (n=${m.npsResponses} avis)` : 'NPS : mesuré en continu chez nos pilotes'}
          </p>
        </div>
        <div className="card p-4 sm:p-5">
          <p className="text-2xl sm:text-3xl font-extrabold text-brand-700">{m?.founderSeats ?? 20}</p>
          <p className="mt-1 text-xs sm:text-sm text-stone-600">places pilotes fondateurs (−50 % à vie)</p>
        </div>
      </div>

      {/* Témoignages : uniquement publiés avec accord — état vide assumé tant qu'il n'y en a pas */}
      <div className="mt-8 sm:mt-10">
        <h2 className="text-center text-xl sm:text-2xl font-extrabold tracking-tight text-stone-900">
          Ils construisent AFRISUPPLY avec nous
        </h2>
        {(data?.testimonials.length ?? 0) > 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data!.testimonials.map((t, i) => (
              <figure key={i} className="card p-4 sm:p-5 flex flex-col justify-between">
                <blockquote className="text-xs sm:text-sm text-stone-700 italic">« {t.quote} »</blockquote>
                <figcaption className="mt-3 text-xs sm:text-sm text-stone-500 font-medium">
                  — {t.restaurant}{t.city ? `, ${t.city}` : ''}{t.score != null ? ` · note ${t.score}/10` : ''}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="mx-auto mt-3 max-w-2xl text-center text-xs sm:text-sm text-stone-600 leading-relaxed">
            Les premiers retours de nos pilotes arrivent. Les témoignages seront publiés ici{' '}
            <b>uniquement avec leur accord</b> — nous n'en inventerons aucun.{' '}
            <Link to="/demander-un-acces?plan=pilote" className="underline font-semibold text-brand-700">
              Soyez du voyage
            </Link>.
          </p>
        )}
      </div>
    </section>
  );
}

import { Link } from 'react-router-dom';
import { FAQ } from '../../lib/plans';
import { SUPPORT_EMAIL, mailtoSupport } from '../../lib/support';

export default function Faq() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16 lg:px-8">
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-900">
        Questions fréquentes
      </h1>
      <p className="mt-2 text-sm sm:text-base text-stone-600">
        Tout ce que vous voulez savoir avant de tester AFRISUPPLY dans votre restaurant.
      </p>

      <div className="mt-8 sm:mt-10 divide-y divide-stone-200 border-y border-stone-200">
        {FAQ.map((f) => (
          <details key={f.q} className="group py-4 sm:py-5">
            <summary className="cursor-pointer list-none font-semibold text-sm sm:text-base text-stone-900 flex items-center justify-between gap-4 touch-manipulation select-none">
              <span>{f.q}</span>
              <span className="text-stone-400 group-open:rotate-45 transition shrink-0 text-xl font-mono leading-none">
                +
              </span>
            </summary>
            <p className="mt-3 text-xs sm:text-sm text-stone-600 leading-relaxed pr-6">
              {f.a}
            </p>
          </details>
        ))}
      </div>

      <div className="mt-10 rounded-2xl bg-stone-50 border border-stone-200 p-5 text-center sm:text-left sm:flex sm:items-center sm:justify-between gap-4">
        <div>
          <p className="font-bold text-stone-900 text-sm sm:text-base">Une autre question ?</p>
          <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
            Écrivez à{' '}
            <a className="underline font-semibold text-brand-700" href={mailtoSupport('AFRISUPPLY — question')}>
              {SUPPORT_EMAIL}
            </a>{' '}
            ou demandez une démonstration en direct.
          </p>
        </div>
        <Link to="/demander-un-acces" className="btn-primary mt-3 sm:mt-0 justify-center text-xs sm:text-sm shrink-0">
          Demander une démo
        </Link>
      </div>
    </div>
  );
}

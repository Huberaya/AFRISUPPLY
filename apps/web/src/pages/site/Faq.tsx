import { Link } from 'react-router-dom';
import { FAQ } from '../../lib/plans';
import { SUPPORT_EMAIL, mailtoSupport } from '../../lib/support';

export default function Faq() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 lg:px-8">
      <h1 className="text-4xl font-extrabold tracking-tight">Questions fréquentes</h1>
      <div className="mt-10 divide-y divide-stone-100">{FAQ.map((f) => <details key={f.q} className="group py-4"><summary className="cursor-pointer list-none font-semibold flex justify-between gap-4">{f.q}<span className="text-stone-400 group-open:rotate-45 transition">+</span></summary><p className="mt-2 text-sm text-stone-600">{f.a}</p></details>)}</div>
      <p className="mt-10 text-sm text-stone-600">Une autre question ? <a className="underline" href={mailtoSupport('AFRISUPPLY — question')}>{SUPPORT_EMAIL}</a> ou <Link to="/demander-un-acces" className="underline">demandez une démo</Link>.</p>
    </div>
  );
}

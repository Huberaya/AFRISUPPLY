import { useState, type FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import { FOUNDER } from '../../lib/plans';
import { Field } from '../../components/Modal';

const CUISINES = ['Sénégalaise', 'Ivoirienne', 'Camerounaise', 'Congolaise', 'Malienne', 'Guinéenne', 'Panafricaine', 'Afro-fusion', 'Autre'];

export default function RequestAccess() {
  const [sp] = useSearchParams();
  const [f, setF] = useState({
    restaurantName: '',
    contactName: '',
    email: '',
    phone: '',
    city: '',
    cuisine: '',
    coversPerDay: '',
    message: '',
    planInterest: sp.get('plan') ?? 'pilote',
    website: '',
  });
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const utm: Record<string, string> = {};
    sp.forEach((v, k) => {
      if (k.startsWith('utm_')) utm[k] = v;
    });
    try {
      const r = await api<{ message: string }>('/public/leads', {
        method: 'POST',
        json: {
          ...f,
          phone: f.phone || undefined,
          city: f.city || undefined,
          cuisine: f.cuisine || undefined,
          message: f.message || undefined,
          coversPerDay: f.coversPerDay ? Number(f.coversPerDay) : undefined,
          utm: Object.keys(utm).length ? utm : undefined,
          source: sp.get('source') ?? 'site',
        },
      });
      setDone(r.message);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:py-24 text-center">
        <CheckCircle2 className="mx-auto text-emerald-600" size={54} />
        <h1 className="mt-4 text-2xl sm:text-3xl font-extrabold text-stone-900">{done}</h1>
        <p className="mt-3 text-sm sm:text-base text-stone-600">
          En attendant, vous pouvez explorer la démo avec le restaurant fictif « Chez Awa ».
        </p>
        <div className="mt-6">
          <Link to="/connexion" className="btn-primary inline-flex justify-center px-6 py-2.5">
            Voir la démo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:gap-12 px-4 py-12 sm:py-16 lg:grid-cols-5 lg:px-8">
      <div className="lg:col-span-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900">Demander un accès</h1>
        <p className="mt-3 text-sm sm:text-base text-stone-600">
          On ouvre les accès par petits groupes pour accompagner chaque restaurant. Réponse sous 24 h ouvrées.
        </p>
        <div className="mt-6 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-xs sm:text-sm text-brand-900 leading-relaxed">
          <b>Offre pilote fondateur</b>
          <br />
          {FOUNDER.trialDays} jours gratuits sans carte bancaire, puis −{FOUNDER.discountPct} % à vie. Il reste des places parmi les {FOUNDER.seats} premiers.
        </div>
        <ul className="mt-6 space-y-2.5 text-xs sm:text-sm text-stone-700">
          <li className="flex items-center gap-2"><span>✅</span> <span>Mise en route ensemble en visio (20 min)</span></li>
          <li className="flex items-center gap-2"><span>✅</span> <span>Import de vos fournisseurs par nos soins</span></li>
          <li className="flex items-center gap-2"><span>✅</span> <span>Ligne WhatsApp directe avec l’équipe</span></li>
        </ul>
      </div>

      <form onSubmit={submit} className="card lg:col-span-3 grid gap-4 sm:grid-cols-2 p-5 sm:p-6 border border-stone-200">
        <div className="sm:col-span-2">
          <Field label="Nom du restaurant">
            <input
              className="input text-sm"
              required
              value={f.restaurantName}
              onChange={(e) => set('restaurantName', e.target.value)}
              placeholder="Chez Awa"
            />
          </Field>
        </div>
        <Field label="Votre nom">
          <input
            className="input text-sm"
            required
            value={f.contactName}
            onChange={(e) => set('contactName', e.target.value)}
            placeholder="Awa Diop"
          />
        </Field>
        <Field label="E-mail">
          <input
            className="input text-sm"
            type="email"
            required
            value={f.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="contact@chezawa.fr"
          />
        </Field>
        <Field label="Téléphone / WhatsApp">
          <input
            className="input text-sm"
            value={f.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="06 12 34 56 78"
          />
        </Field>
        <Field label="Ville">
          <input
            className="input text-sm"
            value={f.city}
            onChange={(e) => set('city', e.target.value)}
            placeholder="Nantes"
          />
        </Field>
        <Field label="Cuisine">
          <select className="input text-sm bg-white" value={f.cuisine} onChange={(e) => set('cuisine', e.target.value)}>
            <option value="">Sélectionner…</option>
            {CUISINES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Couverts par jour (environ)">
          <input
            className="input text-sm"
            type="number"
            min={1}
            value={f.coversPerDay}
            onChange={(e) => set('coversPerDay', e.target.value)}
            placeholder="80"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Formule qui vous intéresse">
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {[
                ['pilote', '⭐ Pilote fondateur'],
                ['starter', 'Starter'],
                ['pro', 'Pro'],
                ['business', 'Business'],
              ].map(([v, l]) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => set('planInterest', v)}
                  className={`pill !px-3 !py-1.5 text-xs sm:text-sm touch-manipulation transition ${
                    f.planInterest === v ? 'bg-brand-700 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Votre plus gros casse-tête d’achats aujourd’hui (optionnel)">
            <textarea
              className="input text-sm"
              rows={3}
              value={f.message}
              onChange={(e) => set('message', e.target.value)}
              placeholder="Les ruptures de plantain le week-end, les prix qui bougent sans prévenir…"
            />
          </Field>
        </div>
        <input
          type="text"
          className="hidden"
          tabIndex={-1}
          autoComplete="off"
          value={f.website}
          onChange={(e) => set('website', e.target.value)}
          aria-hidden="true"
        />
        {err && <p className="sm:col-span-2 text-xs sm:text-sm text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200">{err}</p>}
        <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
          <p className="text-[11px] sm:text-xs text-stone-500 leading-snug">
            En envoyant, vous acceptez d’être recontacté(e). Aucune revente de données.
          </p>
          <button className="btn-primary w-full sm:w-auto justify-center px-6 py-2.5 touch-manipulation text-sm shrink-0" disabled={busy}>
            {busy ? 'Envoi en cours…' : 'Envoyer ma demande'}
          </button>
        </div>
      </form>
    </div>
  );
}

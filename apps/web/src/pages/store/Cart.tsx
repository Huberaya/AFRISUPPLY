// Panier public → connexion/inscription si besoin → une commande marketplace par grossiste.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, ShoppingCart, LogIn, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cart, useCart } from '../../lib/cart';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';

const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;

export default function Cart() {
  const { lines, total, byVendor } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const order = async () => {
    setBusy(true);
    setErr(null);
    const out: string[] = [];
    try {
      for (const g of byVendor) {
        const r = await api<{ message: string }>(`/marketplace/vendors/${g.vendorId}/orders`, {
          method: 'POST',
          json: {
            lines: g.lines.map((l) => ({ vendorOfferId: l.offerId, packs: l.packs })),
            source: 'vitrine',
          },
        });
        out.push(r.message);
        g.lines.forEach((l) => cart.remove(l.offerId));
      }
      setMsgs(out);
    } catch (e) {
      setErr((e as Error).message);
      setMsgs(out);
    } finally {
      setBusy(false);
    }
  };

  if (msgs.length && !lines.length) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-5xl">🎉</p>
        <h1 className="mt-3 text-2xl font-extrabold text-stone-900">Commande envoyée</h1>
        <div className="mt-4 space-y-2">
          {msgs.map((m, i) => (
            <p key={i} className="text-sm text-stone-700 bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
              {m}
            </p>
          ))}
        </div>
        <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
          <Link to="/app/achats" className="btn-primary justify-center">
            Suivre mes commandes
          </Link>
          <Link to="/catalogue" className="btn-ghost justify-center">
            Continuer mes achats
          </Link>
        </div>
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <ShoppingCart className="mx-auto text-stone-300" size={54} />
        <h1 className="mt-4 text-2xl font-extrabold text-stone-900">Votre panier est vide</h1>
        <p className="mt-2 text-sm text-stone-500 max-w-md mx-auto">
          Parcourez le catalogue : plus de 300 produits africains aux prix grossistes livrés en cuisine.
        </p>
        <Link to="/catalogue" className="btn-primary mt-6 inline-flex justify-center px-6 py-2.5">
          Voir le catalogue
        </Link>
      </div>
    );
  }

  const hasUnmetMinimum = byVendor.some((g) => g.total < g.minOrderEur);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8 lg:px-8">
      <h1 className="text-xl sm:text-2xl font-extrabold text-stone-900">Mon panier</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Liste des paniers groupés par grossiste */}
        <div className="space-y-4">
          {byVendor.map((g) => {
            const isMinReached = g.total >= g.minOrderEur;
            const diff = g.minOrderEur - g.total;
            return (
              <div key={g.vendorId} className="card space-y-3 !p-0 overflow-hidden border border-stone-200">
                {/* En-tête grossiste responsive */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-stone-100 bg-stone-50/70 p-3.5 sm:p-4">
                  <div>
                    <p className="font-bold text-stone-900 text-sm sm:text-base">{g.vendorName}</p>
                    <p className="text-xs text-stone-500">Minimum de commande : {eur(g.minOrderEur)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base font-extrabold text-stone-900">
                      Sous-total : {eur(g.total)}
                    </span>
                    {isMinReached ? (
                      <span className="pill bg-emerald-50 text-emerald-800 text-[11px] font-semibold flex items-center gap-1">
                        <CheckCircle2 size={12} /> Minimum atteint
                      </span>
                    ) : (
                      <span className="pill bg-amber-50 text-amber-800 text-[11px] font-semibold flex items-center gap-1">
                        <AlertCircle size={12} /> Manque {eur(diff)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Articles */}
                <div className="divide-y divide-stone-100 px-3.5 sm:px-4 pb-2">
                  {g.lines.map((l) => (
                    <div key={l.offerId} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      {/* Titre et détails */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 sm:block">
                          <Link
                            to={`/produit/${l.productId}`}
                            className="font-semibold text-stone-900 hover:text-brand-700 text-sm leading-snug truncate block"
                          >
                            {l.productName}
                          </Link>
                          {/* Poubelle mobile */}
                          <button
                            type="button"
                            onClick={() => cart.remove(l.offerId)}
                            className="sm:hidden text-stone-400 hover:text-red-600 p-1 touch-manipulation shrink-0"
                            aria-label="Supprimer l'article"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <p className="text-xs text-stone-500 mt-0.5">
                          {l.packLabel} · {eur(l.packPriceEur)} / colis
                        </p>
                      </div>

                      {/* Contrôles de quantité et sous-total */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <label htmlFor={`qty-${l.offerId}`} className="text-xs text-stone-500 sm:hidden">
                            Qté :
                          </label>
                          <input
                            id={`qty-${l.offerId}`}
                            type="number"
                            min={0}
                            className="input w-16 text-center text-sm font-semibold py-1.5"
                            value={l.packs}
                            onChange={(e) => cart.setPacks(l.offerId, Number(e.target.value))}
                            aria-label="Nombre de colis"
                          />
                        </div>
                        <p className="w-20 sm:w-24 text-right font-extrabold text-stone-900 text-sm sm:text-base">
                          {eur(l.packPriceEur * l.packs)}
                        </p>
                        {/* Poubelle desktop */}
                        <button
                          type="button"
                          onClick={() => cart.remove(l.offerId)}
                          className="hidden sm:inline-flex text-stone-400 hover:text-red-600 p-1 transition"
                          aria-label="Supprimer l'article"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Panneau récapitulatif / validation */}
        <aside className="card h-fit space-y-4 p-4 sm:p-5 border border-stone-200">
          <div className="flex justify-between items-baseline text-lg">
            <span className="font-semibold text-stone-700">Total HT</span>
            <b className="text-2xl font-extrabold text-stone-900">{eur(total)}</b>
          </div>

          <p className="text-xs text-stone-500 leading-snug">
            {byVendor.length} grossiste{byVendor.length > 1 ? 's' : ''} ·{' '}
            {byVendor.length > 1 ? 'une commande distincte par grossiste' : 'une commande'} · frais de port selon grossiste
          </p>

          {err && <p className="rounded-xl bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">{err}</p>}

          {hasUnmetMinimum && (
            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200 flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-700" />
              <span>Complétez le panier pour atteindre le minimum de commande requis par chaque grossiste.</span>
            </div>
          )}

          {user ? (
            <button
              className="btn-primary w-full justify-center py-3 text-base touch-manipulation"
              disabled={busy || hasUnmetMinimum}
              onClick={() => void order()}
            >
              {busy ? 'Envoi en cours…' : 'Valider la commande'}
            </button>
          ) : (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-stone-600">
                Un compte restaurant (gratuit) est nécessaire pour valider la commande.
              </p>
              <button
                className="btn-primary w-full justify-center text-sm py-2.5 touch-manipulation"
                onClick={() => nav('/inscription?next=/panier')}
              >
                <UserPlus size={16} /> Créer mon compte
              </button>
              <button
                className="btn-ghost w-full justify-center text-sm py-2.5 touch-manipulation border border-stone-200"
                onClick={() => nav('/connexion?next=/panier')}
              >
                <LogIn size={16} /> J’ai déjà un compte
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// « Votre matin AFRISUPPLY » — e-mail quotidien : construit à partir des données du restaurant,
// rendu en texte + HTML (inline, compatible clients mail). Zéro dépendance.
export interface DigestInput {
  restaurantName: string; firstName: string; date: Date; appUrl: string;
  stock: { critique: number; bas: number; ok: number; urgent: { productName: string; unit: string; quantity: number; daysLeft: number | null; stockoutDay: string | null; recommendedOrder: number }[] };
  cart: { total: number; saving: number; supplierCount: number; lineCount: number } | null;
  autoReorder: { productName: string; supplierName: string; total: number; reference: string }[];
  priceAlerts: { title: string; message: string }[];
  opportunities: { title: string; message: string }[];
  discrepancies: { count: number; openValue: number };
  pendingOrders: { reference: string; supplierName: string; status: string; expectedAt: string | null }[];
  salesYesterday: number | null;  // portions saisies hier, null si rien
  /** Chantier 9 : relance « ventes non saisies » en attente — annoncée dans le mail du matin,
   *  sinon elle resterait marquée « déjà prévenu » sans jamais avoir été lue. */
  salesReminder?: { title: string; message: string } | null;
  spend: { thisMonth: number; evolutionPct: number | null };
}

const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;
const UNIT_FR: Record<string, string> = { piece: 'pièces', botte: 'bottes', sac: 'sacs', carton: 'cartons' };
const q = (v: number, u: string) => { const isCount = u in UNIT_FR; const nb = isCount ? Math.ceil(v) : Math.round(v * 10) / 10; return `${Number.isInteger(nb) ? nb : nb.toFixed(1).replace('.', ',')} ${UNIT_FR[u] ?? u}`; };
const days = (d: number) => `${(Math.round(d * 10) / 10).toString().replace('.', ',')} j`;
const dayFr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' }) : null);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Résumé en une phrase pour l'objet et le début du mail. */
export function digestHeadline(d: DigestInput): string {
  if (d.stock.urgent.length) { const f = d.stock.urgent[0]; return `${d.stock.urgent.length} produit${d.stock.urgent.length > 1 ? 's' : ''} à commander aujourd’hui — ${f.productName} en premier`; }
  if (d.priceAlerts.length) return `${d.priceAlerts.length} hausse${d.priceAlerts.length > 1 ? 's' : ''} de prix à regarder`;
  if (d.discrepancies.count) return `${eur(d.discrepancies.openValue)} à récupérer sur des livraisons incomplètes`;
  // Chantier 9 : ne pas annoncer « tout est sous contrôle » dans l'objet quand on demande
  // justement au restaurateur de saisir ses ventes (sinon l'objet contredit le mail).
  if (d.salesReminder) return 'pensez à saisir vos ventes (30 secondes)';
  return 'Tout est sous contrôle — bonne journée en cuisine';
}

export function buildDigest(d: DigestInput): { subject: string; text: string; html: string; isEmpty: boolean } {
  const dateStr = d.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const headline = digestHeadline(d);
  const subject = `☀️ Votre matin AFRISUPPLY — ${headline}`;
  const sections: { emoji: string; title: string; lines: string[]; cta?: { label: string; path: string } }[] = [];

  if (d.stock.urgent.length) sections.push({
    emoji: '🔴', title: 'À commander aujourd’hui',
    lines: d.stock.urgent.slice(0, 6).map((u) => `${u.productName} : ${q(u.quantity, u.unit)} en stock${u.daysLeft !== null ? ` (${days(u.daysLeft)})` : ''}${u.stockoutDay ? `, rupture ${dayFr(u.stockoutDay)}` : ''} → commander ${q(u.recommendedOrder, u.unit)}`),
    cta: { label: 'Ouvrir le panier intelligent', path: '/app/achats/panier' },
  });
  if (d.cart && d.cart.lineCount) sections.push({
    emoji: '🧺', title: 'Panier de la semaine prêt',
    lines: [`${d.cart.lineCount} produit${d.cart.lineCount > 1 ? 's' : ''} chez ${d.cart.supplierCount} fournisseur${d.cart.supplierCount > 1 ? 's' : ''} pour ${eur(d.cart.total)}${d.cart.saving > 0 ? ` — ${eur(d.cart.saving)} d’économie vs vos habitudes` : ''}.`],
    cta: { label: 'Valider le panier', path: '/app/achats/panier' },
  });
  if (d.autoReorder.length) sections.push({
    emoji: '🤖', title: 'Commandes préparées automatiquement (à valider)',
    lines: d.autoReorder.map((a) => `${a.productName} chez ${a.supplierName} — ${eur(a.total)} (${a.reference})`),
    cta: { label: 'Voir mes achats', path: '/app/achats' },
  });
  if (d.salesReminder) sections.push({
    emoji: '📝', title: d.salesReminder.title.replace(/^[^\p{L}]*(?=\p{L})/u, '') || 'Saisie des ventes',
    lines: [d.salesReminder.message], cta: { label: 'Saisir mes ventes (30 secondes)', path: '/app/ventes' },
  });
  if (d.priceAlerts.length) sections.push({ emoji: '📈', title: 'Prix en hausse', lines: d.priceAlerts.slice(0, 5).map((a) => a.message), cta: { label: 'Comparer les fournisseurs', path: '/app/stock' } });
  if (d.opportunities.length) sections.push({ emoji: '🟢', title: 'Moins cher ailleurs', lines: d.opportunities.slice(0, 4).map((a) => a.message) });
  if (d.discrepancies.count) sections.push({ emoji: '⚠️', title: 'Écarts de livraison à réclamer', lines: [`${d.discrepancies.count} écart${d.discrepancies.count > 1 ? 's' : ''} ouvert${d.discrepancies.count > 1 ? 's' : ''} — ${eur(d.discrepancies.openValue)} à récupérer.`], cta: { label: 'Voir les écarts', path: '/app/achats/ecarts' } });
  if (d.pendingOrders.length) sections.push({ emoji: '🚚', title: 'Livraisons attendues', lines: d.pendingOrders.slice(0, 5).map((o) => `${o.supplierName} (${o.reference})${o.expectedAt ? ` — ${dayFr(o.expectedAt)}` : ''}`) });

  const footerFacts = [
    `Stock : ${d.stock.ok} 🟢 · ${d.stock.bas} 🟠 · ${d.stock.critique} 🔴`,
    d.salesYesterday === null ? 'Ventes d’hier non saisies — 30 secondes pour améliorer la prévision' : `${d.salesYesterday} portions saisies hier`,
    `Achats du mois : ${eur(d.spend.thisMonth)}${d.spend.evolutionPct !== null ? ` (${d.spend.evolutionPct > 0 ? '+' : ''}${d.spend.evolutionPct} % vs 30 j précédents)` : ''}`,
  ];
  const isEmpty = sections.length === 0;

  // ---- texte
  const text = [
    `Bonjour ${d.firstName},`, '', `${d.restaurantName} — ${dateStr}`, headline.toUpperCase(), '',
    ...sections.flatMap((s) => [`${s.emoji} ${s.title}`, ...s.lines.map((l) => `  • ${l}`), s.cta ? `  → ${d.appUrl}${s.cta.path}` : '', '']),
    ...(isEmpty ? ['Rien d’urgent aujourd’hui. Vos stocks couvrent la prévision.', ''] : []),
    '—', ...footerFacts, '', `Ouvrir AFRISUPPLY : ${d.appUrl}/app`, `Se désabonner : ${d.appUrl}/app/parametres`,
  ].join('\n');

  // ---- html (tables + styles inline)
  const sec = (s: (typeof sections)[number]) => `
    <tr><td style="padding:18px 24px 0 24px">
      <p style="margin:0 0 8px 0;font:700 15px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c1917">${s.emoji} ${esc(s.title)}</p>
      <ul style="margin:0;padding-left:18px;font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#44403c">${s.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      ${s.cta ? `<a href="${d.appUrl}${s.cta.path}" style="display:inline-block;margin-top:10px;padding:8px 14px;border-radius:10px;background:#c2410c;color:#fff;text-decoration:none;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif">${esc(s.cta.label)} →</a>` : ''}
    </td></tr>`;
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#fafaf9;padding:24px 0">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;border:1px solid #e7e5e4;overflow:hidden">
    <tr><td style="background:#1c1917;padding:20px 24px">
      <p style="margin:0;font:800 18px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#fff">AFRI<span style="color:#fb923c">SUPPLY</span></p>
      <p style="margin:6px 0 0 0;font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#a8a29e">${esc(d.restaurantName)} · ${esc(dateStr)}</p>
    </td></tr>
    <tr><td style="padding:22px 24px 0 24px">
      <p style="margin:0;font:14px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#44403c">Bonjour ${esc(d.firstName)},</p>
      <h1 style="margin:8px 0 0 0;font:800 22px/1.25 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c1917">${esc(headline)}</h1>
    </td></tr>
    ${sections.map(sec).join('')}
    ${isEmpty ? `<tr><td style="padding:18px 24px 0 24px;font:14px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#44403c">Rien d’urgent aujourd’hui. Vos stocks couvrent la prévision. 🎉</td></tr>` : ''}
    <tr><td style="padding:22px 24px 0 24px"><hr style="border:0;border-top:1px solid #e7e5e4;margin:0"></td></tr>
    <tr><td style="padding:14px 24px 22px 24px;font:12px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#78716c">
      ${footerFacts.map(esc).join('<br>')}<br><br>
      <a href="${d.appUrl}/app" style="color:#c2410c;font-weight:600;text-decoration:none">Ouvrir AFRISUPPLY →</a> · <a href="${d.appUrl}/app/parametres" style="color:#a8a29e">Gérer mes notifications</a>
    </td></tr>
  </table></td></tr></table></body></html>`;
  return { subject, text, html, isEmpty };
}

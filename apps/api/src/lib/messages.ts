// Messages de commande prêts à envoyer (WhatsApp / e-mail) — les fournisseurs n'ont pas de compte en V1.
export interface OrderMessageInput {
  reference: string; restaurantName: string; senderName: string; senderPhone: string | null;
  supplier: { name: string; contactName: string | null; email: string | null; whatsapp: string | null };
  expectedAt: string | null; notes: string | null; total: number; deliveryFee: number;
  lines: { productName: string; packLabel: string | null; packs: number; quantity: number; unit: string; lineTotal: number }[];
}

const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;
const qty = (q: number, u: string) => `${Number.isInteger(q) ? q : q.toFixed(1).replace('.', ',')} ${u}`;
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : null);

/** Normalise un numéro pour un lien wa.me (chiffres uniquement, indicatif FR par défaut). */
export function waNumber(raw: string | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 10) d = '33' + d.slice(1);
  return d.length >= 8 ? d : null;
}

export function buildOrderMessage(i: OrderMessageInput) {
  const greeting = i.supplier.contactName ? `Bonjour ${i.supplier.contactName},` : 'Bonjour,';
  const lines = i.lines.map((l) => `• ${l.productName} — ${l.packs} × ${l.packLabel ?? 'unité'} (${qty(l.quantity, l.unit)})`).join('\n');
  const when = fmtDate(i.expectedAt);
  const body = [
    greeting, '',
    `Merci de préparer la commande ${i.reference} pour ${i.restaurantName} :`, '',
    lines, '',
    `Total estimé : ${eur(i.total)}${i.deliveryFee ? ` (+ ${eur(i.deliveryFee)} de livraison)` : ''}.`,
    when ? `Livraison souhaitée : ${when}.` : null,
    i.notes ? `Remarque : ${i.notes}` : null,
    '', 'Merci de confirmer la disponibilité et le prix.', '',
    `${i.senderName}${i.senderPhone ? ` — ${i.senderPhone}` : ''}`, i.restaurantName,
  ].filter((x) => x !== null).join('\n');
  const subject = `Commande ${i.reference} — ${i.restaurantName}`;
  const wa = waNumber(i.supplier.whatsapp);
  return {
    subject, body,
    whatsappUrl: `https://wa.me/${wa ?? ''}?text=${encodeURIComponent(body)}`,
    mailtoUrl: `mailto:${i.supplier.email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    hasWhatsapp: !!wa, hasEmail: !!i.supplier.email,
  };
}

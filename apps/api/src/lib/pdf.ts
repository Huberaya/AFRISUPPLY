// Générateur PDF minimal (sans dépendance) : texte Helvetica, lignes, tableau. Suffisant pour un bon de commande / bon de livraison.
// Encodage WinAnsi : les caractères accentués français passent ; le reste est remplacé.
type Op = string;
export class Pdf {
  private ops: Op[] = []; private pages: Op[][] = []; private y = 800; readonly w = 595; readonly h = 842; readonly margin = 40;
  private esc(s: string) { return s.normalize('NFC').replace(/[\\()]/g, (m) => '\\' + m).replace(/[^\x20-\x7e\xa0-\xff€]/g, '?').replace(/€/g, '\x80'); }
  text(s: string, x: number, size = 10, opts: { bold?: boolean; align?: 'left' | 'right'; width?: number; color?: string } = {}) {
    const font = opts.bold ? 'F2' : 'F1'; let xx = x;
    if (opts.align === 'right') xx = x + (opts.width ?? 0) - this.width(s, size);
    this.ops.push(`BT /${font} ${size} Tf ${opts.color ?? '0 0 0'} rg ${xx.toFixed(1)} ${this.y.toFixed(1)} Td (${this.esc(s)}) Tj ET`);
  }
  width(s: string, size: number) { return s.length * size * 0.52; }
  line(x1: number, y1: number, x2: number, y2: number, gray = 0.8) { this.ops.push(`${gray} G 0.5 w ${x1} ${y1} m ${x2} ${y2} l S`); }
  rect(x: number, y: number, w: number, h: number, gray = 0.95) { this.ops.push(`${gray} g ${x} ${y} ${w} ${h} re f 0 g`); }
  down(n: number) { this.y -= n; if (this.y < 60) this.newPage(); }
  get cursor() { return this.y; } set cursor(v: number) { this.y = v; }
  newPage() { this.pages.push(this.ops); this.ops = []; this.y = 800; }
  row(cols: { text: string; x: number; w: number; align?: 'left' | 'right'; bold?: boolean }[], size = 9) { for (const c of cols) this.text(c.text, c.x, size, { align: c.align, width: c.w, bold: c.bold }); }
  build(): Buffer {
    this.pages.push(this.ops); const objs: string[] = [];
    const add = (s: string) => { objs.push(s); return objs.length; };
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const pagesId = objs.length + 1 + this.pages.length * 2; const pageIds: number[] = [];
    for (const ops of this.pages) { const content = ops.join('\n'); const cid = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`); pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this.w} ${this.h}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cid} 0 R >>`)); }
    add(`<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`); const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    let out = '%PDF-1.4\n'; const offs: number[] = [];
    objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(out, 'latin1');
  }
}

export type OrderDoc = { kind: 'bon_commande' | 'bon_livraison'; reference: string; date: Date; status: string; expectedAt?: Date | null; notes?: string | null;
  vendor: { name: string; city?: string | null; email?: string | null; phone?: string | null }; restaurant: { name: string; address?: string | null; city?: string | null; email?: string | null };
  lines: { productName: string; packLabel: string | null; packs: number; quantity: number; unit: string; unitPriceEur: number; lineTotalEur: number }[]; totalEur: number; deliveryFeeEur: number };
const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;
const fd = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function orderPdf(d: OrderDoc): Buffer {
  const p = new Pdf(); const m = p.margin; const W = p.w - 2 * m;
  p.rect(0, 812, p.w, 30, 0.93); p.cursor = 822; p.text('AFRISUPPLY', m, 14, { bold: true, color: '0.76 0.25 0.05' }); p.text('Marketplace B2B des restaurants africains', m + 110, 9, { color: '0.4 0.4 0.4' });
  p.cursor = 780; p.text(d.kind === 'bon_commande' ? 'BON DE COMMANDE' : 'BON DE LIVRAISON', m, 18, { bold: true }); p.text(d.reference, m, 18, { bold: true, align: 'right', width: W });
  p.down(16); p.text(`Émis le ${fd(d.date)} · Statut : ${d.status}${d.expectedAt ? ` · Livraison prévue : ${fd(d.expectedAt)}` : ''}`, m, 9, { color: '0.35 0.35 0.35' });
  p.down(26); const top = p.cursor; p.text('FOURNISSEUR', m, 8, { bold: true, color: '0.5 0.5 0.5' }); p.text('CLIENT (RESTAURANT)', m + W / 2, 8, { bold: true, color: '0.5 0.5 0.5' });
  p.down(13); p.text(d.vendor.name, m, 11, { bold: true }); p.text(d.restaurant.name, m + W / 2, 11, { bold: true });
  const vl = [d.vendor.city, d.vendor.phone, d.vendor.email].filter(Boolean) as string[]; const rl = [d.restaurant.address, d.restaurant.city, d.restaurant.email].filter(Boolean) as string[];
  for (let i = 0; i < Math.max(vl.length, rl.length); i++) { p.down(12); if (vl[i]) p.text(vl[i], m, 9); if (rl[i]) p.text(rl[i], m + W / 2, 9); }
  p.cursor = Math.min(p.cursor, top - 60) - 22;
  const cols = [{ k: 'prod', x: m, w: 200 }, { k: 'pack', x: m + 205, w: 90 }, { k: 'packs', x: m + 300, w: 40 }, { k: 'qty', x: m + 345, w: 60 }, { k: 'pu', x: m + 410, w: 50 }, { k: 'tot', x: m + 465, w: 50 }];
  p.rect(m, p.cursor - 5, W, 16, 0.92); p.row([{ text: 'Produit', x: cols[0].x, w: cols[0].w, bold: true }, { text: 'Conditionnement', x: cols[1].x, w: cols[1].w, bold: true }, { text: 'Colis', x: cols[2].x, w: cols[2].w, align: 'right', bold: true }, { text: 'Quantité', x: cols[3].x, w: cols[3].w, align: 'right', bold: true }, { text: 'P.U. HT', x: cols[4].x, w: cols[4].w, align: 'right', bold: true }, { text: 'Total HT', x: cols[5].x, w: cols[5].w, align: 'right', bold: true }]);
  for (const l of d.lines) { p.down(16); p.row([{ text: l.productName.slice(0, 42), x: cols[0].x, w: cols[0].w }, { text: (l.packLabel ?? '').slice(0, 20), x: cols[1].x, w: cols[1].w }, { text: String(l.packs), x: cols[2].x, w: cols[2].w, align: 'right' }, { text: `${Number.isInteger(l.quantity) ? l.quantity : l.quantity.toFixed(2)} ${l.unit}`, x: cols[3].x, w: cols[3].w, align: 'right' }, { text: eur(l.unitPriceEur), x: cols[4].x, w: cols[4].w, align: 'right' }, { text: eur(l.lineTotalEur), x: cols[5].x, w: cols[5].w, align: 'right' }]); p.line(m, p.cursor - 5, m + W, p.cursor - 5, 0.9); }
  p.down(18); if (d.deliveryFeeEur) { p.text('Frais de livraison HT', m + 300, 9, { align: 'right', width: 160 }); p.text(eur(d.deliveryFeeEur), cols[5].x, 9, { align: 'right', width: cols[5].w }); p.down(14); }
  p.text('TOTAL HT', m + 300, 11, { bold: true, align: 'right', width: 160 }); p.text(eur(d.totalEur + d.deliveryFeeEur), cols[5].x, 11, { bold: true, align: 'right', width: cols[5].w });
  p.down(14); p.text('TVA et facture établies par le fournisseur. Règlement directement au fournisseur selon ses conditions.', m, 8, { color: '0.4 0.4 0.4' });
  if (d.notes) { p.down(20); p.text('Notes : ' + d.notes.slice(0, 180), m, 9); }
  if (d.kind === 'bon_livraison') { p.down(40); p.text('Réception — Date : ____ / ____ / ________     Nom : ____________________     Signature et cachet :', m, 9); p.down(50); p.line(m, p.cursor, m + W, p.cursor, 0.7); }
  p.cursor = 30; p.text(`Document généré par AFRISUPPLY le ${fd(new Date())} — ${d.reference}. AFRISUPPLY est un intermédiaire technique : la vente est conclue entre le fournisseur et le restaurant.`, m, 7, { color: '0.5 0.5 0.5' });
  return p.build();
}

// ---------- Facture d'abonnement AFRISUPPLY (chantier 7 de l'audit 2) ----------
export type InvoiceDoc = {
  number: string; issuedAt: Date; paidAt?: Date | null; status: 'payee' | 'ouverte' | 'annulee';
  restaurant: { name: string; city?: string | null; address?: string | null; email?: string | null };
  plan: string; founder: boolean; periodStart: Date; periodEnd: Date;
  amountHt: number; vatRate: number; source: 'stripe' | 'manuel';
  vatNumber?: string | null; note?: string | null;
};

/** Coordonnées de l'émetteur : renseignées par variables d'environnement (mentions légales obligatoires). */
export const emitter = () => ({
  company: process.env.INVOICE_COMPANY ?? 'AFRISUPPLY SAS',
  address: process.env.INVOICE_ADDRESS ?? '1 rue des Halles, 44000 Nantes',
  siret: process.env.INVOICE_SIRET ?? '',
  vat: process.env.INVOICE_VAT ?? '',
  email: process.env.INVOICE_EMAIL ?? 'bonjour@afrisupply.fr',
  iban: process.env.INVOICE_IBAN ?? '',
});
/** Les mentions obligatoires sont-elles complètes ? Sinon la facture le dit explicitement. */
export const emitterComplete = () => { const e = emitter(); return !!(e.siret && e.vat); };

const PLAN_LABEL: Record<string, string> = { starter: 'Starter', pro: 'Pro', business: 'Business' };

export function invoicePdf(d: InvoiceDoc): Buffer {
  const p = new Pdf(); const m = p.margin; const W = p.w - 2 * m; const e = emitter();
  const ttc = Math.round(d.amountHt * (1 + d.vatRate / 100) * 100) / 100;
  const vat = Math.round((ttc - d.amountHt) * 100) / 100;
  p.rect(0, 812, p.w, 30, 0.93); p.cursor = 822; p.text('AFRISUPPLY', m, 14, { bold: true, color: '0.76 0.25 0.05' }); p.text('Assistant d’approvisionnement des restaurants africains', m + 110, 9, { color: '0.4 0.4 0.4' });
  p.cursor = 780; p.text('FACTURE', m, 18, { bold: true }); p.text(d.number, m, 18, { bold: true, align: 'right', width: W });
  p.down(15); p.text(`Émise le ${fd(d.issuedAt)}${d.paidAt ? ` · payée le ${fd(d.paidAt)}` : ''} · Statut : ${d.status === 'payee' ? 'payée' : d.status}`, m, 9, { color: '0.35 0.35 0.35' });
  p.down(26); const top = p.cursor;
  p.text('ÉMETTEUR', m, 8, { bold: true, color: '0.5 0.5 0.5' }); p.text('CLIENT', m + W / 2, 8, { bold: true, color: '0.5 0.5 0.5' });
  p.down(13); p.text(e.company, m, 11, { bold: true }); p.text(d.restaurant.name, m + W / 2, 11, { bold: true });
  const left = [e.address, e.siret ? `SIRET ${e.siret}` : 'SIRET non renseigné (INVOICE_SIRET)', e.vat ? `TVA ${e.vat}` : 'N° TVA non renseigné (INVOICE_VAT)', e.email];
  const right = [d.restaurant.address, d.restaurant.city, d.restaurant.email, d.vatNumber ? `TVA ${d.vatNumber}` : null].filter(Boolean) as string[];
  for (let i = 0; i < Math.max(left.length, right.length); i++) { p.down(12); if (left[i]) p.text(left[i], m, 9); if (right[i]) p.text(right[i], m + W / 2, 9); }
  p.cursor = Math.min(p.cursor, top - 60) - 26;
  p.rect(m, p.cursor - 5, W, 16, 0.92);
  p.row([{ text: 'Désignation', x: m + 5, w: 240, bold: true }, { text: 'Période', x: m + 250, w: 110, bold: true }, { text: 'Montant HT', x: m + 370, w: 70, align: 'right', bold: true }, { text: 'TVA', x: m + 450, w: 40, align: 'right', bold: true }, { text: 'Total TTC', x: m + 495, w: 60, align: 'right', bold: true }]);
  p.down(17);
  const label = `Abonnement AFRISUPPLY ${PLAN_LABEL[d.plan] ?? d.plan}${d.founder ? ' (tarif pilote fondateur −50 %)' : ''}`;
  p.row([{ text: label, x: m + 5, w: 240 }, { text: `${fd(d.periodStart)} → ${fd(d.periodEnd)}`, x: m + 250, w: 110 }, { text: eur(d.amountHt), x: m + 370, w: 70, align: 'right' }, { text: `${d.vatRate.toFixed(0)} %`, x: m + 450, w: 40, align: 'right' }, { text: eur(ttc), x: m + 495, w: 60, align: 'right' }]);
  p.line(m, p.cursor - 5, m + W, p.cursor - 5, 0.9);
  p.down(20); p.text('Total HT', m + 370, 10, { align: 'right', width: 70 }); p.text(eur(d.amountHt), m + 495, 10, { align: 'right', width: 60 });
  p.down(14); p.text(`TVA ${d.vatRate.toFixed(0)} %`, m + 370, 10, { align: 'right', width: 70 }); p.text(eur(vat), m + 495, 10, { align: 'right', width: 60 });
  p.down(16); p.text('TOTAL À PAYER TTC', m + 340, 12, { bold: true, align: 'right', width: 100 }); p.text(eur(ttc), m + 495, 12, { bold: true, align: 'right', width: 60 });
  p.down(22);
  p.text(d.source === 'stripe'
    ? 'Règlement par carte bancaire via Stripe (prélèvement automatique mensuel). Aucun virement à effectuer.'
    : `Règlement par virement : ${e.iban || 'IBAN communiqué sur demande (INVOICE_IBAN)'} — merci d’indiquer la référence ${d.number}.`, m, 9, { color: '0.3 0.3 0.3' });
  p.down(14); p.text('TVA sur les encaissements. En cas de retard de paiement : pénalités au taux légal + indemnité forfaitaire de recouvrement de 40 € (art. L441-10 du Code de commerce).', m, 8, { color: '0.35 0.35 0.35' });
  p.down(12); p.text('Prestation de service numérique — autoliquidation non applicable. Facture émise par AFRISUPPLY, éditeur de la solution.', m, 8, { color: '0.35 0.35 0.35' });
  if (!emitterComplete()) { p.down(14); p.rect(m, p.cursor - 4, W, 22, 0.95); p.text('⚠ Mentions légales incomplètes : renseignez INVOICE_SIRET et INVOICE_VAT pour une facture conforme.', m + 5, 8, { bold: true, color: '0.6 0.3 0.05' }); }
  if (d.note) { p.down(16); p.text(`Note : ${d.note.slice(0, 160)}`, m, 8, { color: '0.35 0.35 0.35' }); }
  p.cursor = 30; p.text(`Facture ${d.number} — générée par AFRISUPPLY le ${fd(new Date())}. Service client : ${e.email}.`, m, 7, { color: '0.5 0.5 0.5' });
  return p.build();
}

// ---------- Facture de commission fournisseur (chantier 8) ----------
export type CommissionDoc = {
  number: string;                       // FC-2026-0007
  periodLabel: string;                  // « juillet 2026 »
  issuedAt: Date; dueAt?: Date | null;  // échéance (15 jours en général)
  vendor: { name: string; city?: string | null; address?: string | null; email?: string | null; siret?: string | null; vat?: string | null };
  orders: number; baseEur: number; pct: number; amountHt: number; vatRate: number;
  payment: { mode: 'prelevement' | 'virement'; card?: string | null; stripeUrl?: string | null };
};

/** Facture de commission AFRISUPPLY → fournisseur (sur ses ventes confirmées du mois). */
export function commissionPdf(d: CommissionDoc): Buffer {
  const p = new Pdf(); const m = p.margin; const W = p.w - 2 * m; const e = emitter();
  const ttc = Math.round(d.amountHt * (1 + d.vatRate / 100) * 100) / 100;
  const vat = Math.round((ttc - d.amountHt) * 100) / 100;
  p.rect(0, 812, p.w, 30, 0.93); p.cursor = 822;
  p.text('AFRISUPPLY', m, 14, { bold: true, color: '0.76 0.25 0.05' }); p.text('Marketplace des restaurants africains', m + 110, 9, { color: '0.4 0.4 0.4' });
  p.cursor = 780; p.text('FACTURE DE COMMISSION', m, 16, { bold: true }); p.text(d.number, m, 16, { bold: true, align: 'right', width: W });
  p.down(15); p.text(`Période : ${d.periodLabel} · émise le ${fd(d.issuedAt)}${d.dueAt ? ` · à régler avant le ${fd(d.dueAt)}` : ''}`, m, 9, { color: '0.35 0.35 0.35' });
  p.down(26); p.text('ÉMETTEUR', m, 8, { bold: true, color: '0.5 0.5 0.5' }); p.text('FOURNISSEUR', m + W / 2, 8, { bold: true, color: '0.5 0.5 0.5' });
  p.down(13); p.text(e.company, m, 11, { bold: true }); p.text(d.vendor.name, m + W / 2, 11, { bold: true });
  const left = [e.address, e.siret ? `SIRET ${e.siret}` : 'SIRET non renseigné (INVOICE_SIRET)', e.vat ? `TVA ${e.vat}` : 'N° TVA non renseigné (INVOICE_VAT)', e.email];
  const right = [d.vendor.address, d.vendor.city, d.vendor.email, d.vendor.siret ? `SIRET ${d.vendor.siret}` : null, d.vendor.vat ? `TVA ${d.vendor.vat}` : null].filter(Boolean) as string[];
  for (let i = 0; i < Math.max(left.length, right.length); i++) { p.down(12); if (left[i]) p.text(left[i], m, 9); if (right[i]) p.text(right[i], m + W / 2, 9); }
  p.down(30);
  p.rect(m, p.cursor - 5, W, 16, 0.92);
  p.row([{ text: 'Désignation', x: m + 5, w: 250, bold: true }, { text: 'Base', x: m + 260, w: 90, align: 'right', bold: true }, { text: 'Taux', x: m + 355, w: 45, align: 'right', bold: true }, { text: 'Montant HT', x: m + 410, w: 70, align: 'right', bold: true }, { text: 'Total TTC', x: m + 490, w: 65, align: 'right', bold: true }]);
  p.down(17);
  p.row([{ text: `Commission sur commandes confirmées (${d.orders} commande${d.orders > 1 ? 's' : ''})`, x: m + 5, w: 250 }, { text: eur(d.baseEur), x: m + 260, w: 90, align: 'right' }, { text: `${d.pct.toFixed(2).replace('.', ',')} %`, x: m + 355, w: 45, align: 'right' }, { text: eur(d.amountHt), x: m + 410, w: 70, align: 'right' }, { text: eur(ttc), x: m + 490, w: 65, align: 'right' }]);
  p.line(m, p.cursor - 5, m + W, p.cursor - 5, 0.9);
  p.down(20); p.text('Total HT', m + 410, 10, { align: 'right', width: 70 }); p.text(eur(d.amountHt), m + 490, 10, { align: 'right', width: 65 });
  p.down(14); p.text(`TVA ${d.vatRate.toFixed(0)} %`, m + 410, 10, { align: 'right', width: 70 }); p.text(eur(vat), m + 490, 10, { align: 'right', width: 65 });
  p.down(16); p.text('TOTAL À PAYER TTC', m + 380, 12, { bold: true, align: 'right', width: 100 }); p.text(eur(ttc), m + 490, 12, { bold: true, align: 'right', width: 65 });
  p.down(22);
  p.text(d.payment.mode === 'prelevement'
    ? `Règlement : prélèvement automatique sur la carte enregistrée${d.payment.card ? ` (${d.payment.card})` : ''} — aucun virement à effectuer.`
    : `Règlement par virement : ${e.iban || 'IBAN communiqué sur demande (INVOICE_IBAN)'} — merci d'indiquer la référence ${d.number}.${d.payment.stripeUrl ? ' Un lien de paiement en ligne figure dans l’e-mail accompagnant cette facture.' : ''}`, m, 9, { color: '0.3 0.3 0.3' });
  p.down(14); p.text('Commission de mise en relation commerciale (marketplace). En cas de retard de paiement : pénalités au taux légal + indemnité forfaitaire de 40 € (art. L441-10 du Code de commerce).', m, 8, { color: '0.35 0.35 0.35' });
  if (!emitterComplete()) { p.down(14); p.rect(m, p.cursor - 4, W, 22, 0.95); p.text('⚠ Mentions légales incomplètes : renseignez INVOICE_SIRET et INVOICE_VAT pour une facture conforme.', m + 5, 8, { bold: true, color: '0.6 0.3 0.05' }); }
  p.cursor = 30; p.text(`Facture de commission ${d.number} — AFRISUPPLY · service fournisseurs : ${e.email}.`, m, 7, { color: '0.5 0.5 0.5' });
  return p.build();
}

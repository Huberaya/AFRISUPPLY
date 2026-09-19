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

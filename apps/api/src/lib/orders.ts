// =============================================================
// AFRISUPPLY — Machine à états des commandes (chantier 1 de l'audit)
//
// Avant : chaque route écrivait `status` de son côté. On pouvait donc
// réceptionner deux fois la même commande (stock compté deux fois) et
// renvoyer une commande déjà livrée. Les règles sont désormais
// centralisées ici et utilisées par TOUTES les routes qui touchent
// au cycle de vie d'une commande.
//
// Cycle nominal :
//   brouillon → preparee → envoyee → confirmee → livree_partiel | livree
//   (annulee : possible tant que la commande n'est pas réceptionnée)
//
// Règles non négociables :
//   • une commande réceptionnée (received_at renseigné) est définitive ;
//   • `livree`, `livree_partiel` et `annulee` sont des états terminaux ;
//   • `confirmee` est un sous-état : il ne fait pas partie des états terminaux
//     (le grossiste peut fermer la livraison et le restaurant doit pouvoir
//     réceptionner dans tous les cas).
// =============================================================

export type OrderStatus =
  | 'brouillon' | 'preparee' | 'envoyee' | 'confirmee' | 'livree_partiel' | 'livree' | 'annulee';

/** États après lesquels plus aucune modification n'est permise. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = ['livree', 'livree_partiel', 'annulee'];

/** États à partir desquels une réception est légitime. */
export const RECEIVABLE_STATUSES: readonly OrderStatus[] = ['preparee', 'envoyee', 'confirmee'];

/** États à partir desquels on peut envoyer (au fournisseur) la commande. */
export const SENDABLE_STATUSES: readonly OrderStatus[] = ['brouillon', 'preparee', 'envoyee'];

/** États dont les lignes peuvent encore être modifiées. */
export const LINE_EDITABLE_STATUSES: readonly OrderStatus[] = ['brouillon', 'preparee', 'envoyee', 'confirmee'];

/**
 * Transitions autorisées via `PUT /orders/:id` (correction manuelle du restaurant).
 * Règle : on avance, on n'encaisse jamais de retour en arrière — sauf « envoyée → préparée »
 * (le restaurant corrige une commande partie quelques secondes plus tôt, avant confirmation),
 * et « annulée » possible tant que rien n'a été réceptionné.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  brouillon: ['preparee', 'envoyee', 'annulee'],
  preparee: ['preparee', 'envoyee', 'annulee'],
  envoyee: ['preparee', 'envoyee', 'confirmee', 'annulee'],
  confirmee: ['confirmee', 'annulee'],
  livree_partiel: [],
  livree: [],
  annulee: [],
};

/** Forme minimale d'une commande dont on veut vérifier l'état. */
export type OrderState = { status: string; receivedAt?: Date | null; sentAt?: Date | null };

export type Refusal = { error: string; code: string; status: 400 | 409 };
const refuse = (error: string, code: string, status: 400 | 409 = 409): Refusal => ({ error, code, status });

export const asStatus = (s: string): OrderStatus => s as OrderStatus;

/** Une commande est-elle réceptionnée (donc définitive) ? */
export function isReceived(o: OrderState): boolean {
  return !!o.receivedAt;
}

/** Une commande est-elle close (état terminal ou déjà réceptionnée) ? */
export function isClosed(o: OrderState): boolean {
  return isReceived(o) || TERMINAL_STATUSES.includes(asStatus(o.status));
}

/** `POST /orders/:id/send` — envoyer la commande au fournisseur. */
export function checkSend(o: OrderState): Refusal | null {
  if (isReceived(o)) {
    return refuse(
      `Cette commande a déjà été réceptionnée le ${new Date(o.receivedAt!).toLocaleDateString('fr-FR')} : elle ne peut plus être renvoyée.`,
      'order_already_received',
    );
  }
  const s = asStatus(o.status);
  if (TERMINAL_STATUSES.includes(s)) {
    return refuse(`Commande ${s === 'annulee' ? 'annulée' : 'clôturée'} : elle ne peut plus être envoyée.`, 'order_closed');
  }
  if (!SENDABLE_STATUSES.includes(s)) {
    return refuse(`Une commande « ${s} » n'est pas envoyée manuellement (elle est déjà chez le fournisseur).`, 'order_not_sendable', 400);
  }
  return null;
}

/** `POST /orders/:id/receive` — réceptionner la livraison. */
export function checkReceive(o: OrderState): Refusal | null {
  if (isReceived(o)) {
    return refuse(
      `Cette commande a déjà été réceptionnée le ${new Date(o.receivedAt!).toLocaleDateString('fr-FR')}. ` +
      'Pour corriger une quantité déjà comptée, utilisez un ajustement de stock ou un inventaire.',
      'order_already_received',
    );
  }
  const s = asStatus(o.status);
  if (s === 'annulee') return refuse('Commande annulée : il n\'y a rien à réceptionner.', 'order_cancelled');
  if (s === 'livree' || s === 'livree_partiel') return refuse('Commande déjà clôturée : réception impossible.', 'order_closed');
  if (!RECEIVABLE_STATUSES.includes(s)) {
    return refuse('Cette commande doit d\'abord être préparée puis envoyée avant d\'être réceptionnée.', 'order_not_receivable', 400);
  }
  return null;
}

/** `PUT /orders/:id` — changement de statut manuel. */
export function checkStatusChange(from: string, to: OrderStatus): Refusal | null {
  const o: OrderState = { status: from };
  if (to === 'annulee') {
    if (TERMINAL_STATUSES.includes(asStatus(from))) return refuse('Commande déjà clôturée ou annulée : modification impossible.', 'order_closed');
    return null;
  }
  if (isClosed(o)) {
    return refuse(
      `Commande clôturée (${from === 'annulee' ? 'annulée' : 'réceptionnée'}) : modification impossible.`,
      'order_closed',
    );
  }
  const allowed = TRANSITIONS[asStatus(from)] ?? [];
  if (!allowed.includes(to)) {
    return refuse(`Transition « ${from} » → « ${to} » refusée : cette commande est déjà dans un état plus avancé.`, 'invalid_transition', 400);
  }
  return null;
}

/** `PUT /orders/:id/lines` — modifier les lignes. */
export function checkLineEdit(o: OrderState): Refusal | null {
  if (isReceived(o)) return refuse('Commande déjà réceptionnée : les lignes ne peuvent plus être modifiées.', 'order_already_received');
  const s = asStatus(o.status);
  if (s === 'annulee' || s === 'livree' || s === 'livree_partiel') {
    return refuse('Commande clôturée : les lignes ne peuvent plus être modifiées.', 'order_closed');
  }
  if (!LINE_EDITABLE_STATUSES.includes(s)) {
    return refuse('Modification impossible dans cet état.', 'order_not_editable', 400);
  }
  return null;
}

/** Violation d'unicité PostgreSQL (code 23505) portant sur la contrainte nommée. */
export function isUniqueViolation(e: unknown, constraint: string): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { code?: string; constraint?: string; message?: string; cause?: { code?: string; constraint?: string; message?: string } };
  const probe = [err, err.cause].filter(Boolean) as { code?: string; constraint?: string; message?: string }[];
  return probe.some((p) => p.code === '23505' && `${p.constraint ?? ''}${p.message ?? ''}`.includes(constraint));
}

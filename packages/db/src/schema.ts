// =============================================================
// AFRISUPPLY — Schéma Postgres (Neon) via Drizzle ORM
//
// 16 tables, une seule source de vérité typée.
// Isolation multi-tenant : toute table métier porte restaurant_id ;
// l'API filtre systématiquement dessus (équivalent applicatif de la RLS).
// =============================================================

import {
  primaryKey,
  pgTable, uuid, text, timestamp, numeric, integer, boolean,
  date, jsonb, pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// -------------------------------------------------------------
// Enums
// -------------------------------------------------------------
export const memberRole = pgEnum('member_role', ['owner', 'manager', 'staff']);
export const productCategory = pgEnum('product_category', [
  'feculents', 'frais', 'viandes_poissons', 'epicerie', 'boissons', 'emballages',
]);
export const unit = pgEnum('unit', ['kg', 'g', 'L', 'mL', 'piece', 'botte', 'sac', 'carton']);
export const movementType = pgEnum('movement_type', ['reception', 'consommation', 'ajustement', 'perte']);
export const orderStatus = pgEnum('order_status', [
  'brouillon', 'preparee', 'envoyee', 'confirmee', 'livree_partiel', 'livree', 'annulee',
]);
export const orderChannel = pgEnum('order_channel', ['email', 'whatsapp', 'telephone', 'plateforme']);
export const alertKind = pgEnum('alert_kind', ['rupture', 'stock_bas', 'hausse_prix', 'opportunite', 'fournisseur', 'ecart_livraison']);
export const alertSeverity = pgEnum('alert_severity', ['red', 'orange', 'green', 'blue']);
export const plan = pgEnum('plan', ['trial', 'starter', 'pro', 'business']);

// -------------------------------------------------------------
// Comptes & restaurants
// -------------------------------------------------------------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const restaurants = pgTable('restaurants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  city: text('city'),
  postalCode: text('postal_code'),
  address: text('address'),
  cuisine: text('cuisine'),                       // « sénégalaise », « ivoirienne », « panafricaine »…
  coversPerDay: integer('covers_per_day'),        // couverts moyens / jour (sert à la prévision)
  plan: plan('plan').default('trial').notNull(),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  subscriptionStatus: text('subscription_status').default('trialing').notNull(), // trialing | active | past_due | canceled | expired
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  founder: boolean('founder').default(false).notNull(),        // offre pilote fondateur (−50 % à vie)
  inviteCode: text('invite_code'),                            // code d'invitation pilote utilisé à l'inscription
  onboardingDone: jsonb('onboarding_done').$type<string[]>().default([]).notNull(), // étapes de la checklist « semaine 1 » cochées
  settings: jsonb('settings').$type<RestaurantSettings>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type OrderProposal = {
  note?: string; expectedAt?: string;
  lines: { lineId: string; productName: string; packLabel: string | null; packs: number; newPacks: number; lineTotalEur: number; newLineTotalEur: number;
    replacement?: { vendorOfferId: string; productId: string; productName: string; packLabel: string | null; packQty: number; packPriceEur: number; packs: number; lineTotalEur: number } | null }[];
  newTotalEur: number;
};
export type RestaurantSettings = {
  currency?: 'EUR';
  priceIncreaseAlertPct?: number;   // défaut 8 %
  forecastHorizonDays?: number;     // défaut 7
  autoReorderEnabled?: boolean;     // le job quotidien exécute les règles (défaut true)
  dailyDigestEnabled?: boolean;     // e-mail « Votre matin AFRISUPPLY » (défaut true)
  digestRecipients?: string[];      // e-mails ; défaut : membres owner/manager
  closedWeekdays?: number[];        // 0=dimanche… pas de mail ces jours-là
  notifyPhone?: string;             // chantier 18 : WhatsApp/SMS du restaurant pour le suivi de commande
};

export const restaurantMembers = pgTable('restaurant_members', {
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: memberRole('role').default('owner').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('restaurant_members_pk').on(t.restaurantId, t.userId)]);

// -------------------------------------------------------------
// Référentiel produits (partagé) & fournisseurs (par restaurant)
// -------------------------------------------------------------
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  // NULL = produit du référentiel AFRISUPPLY ; sinon produit privé du restaurant
  restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  aliases: text('aliases').array().default(sql`'{}'::text[]`).notNull(), // attiéké / attieke / garba
  category: productCategory('category').notNull(),
  baseUnit: unit('base_unit').notNull(),          // unité de stock et de prix (kg, L, pièce)
  origin: text('origin'),                          // « Côte d'Ivoire », « Sénégal »…
  shelfLifeDays: integer('shelf_life_days'),
  seasonality: text('seasonality'),                // texte libre ou JSON mois
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('products_category_idx').on(t.category), index('products_restaurant_idx').on(t.restaurantId)]);

export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  contactName: text('contact_name'),
  email: text('email'),
  phone: text('phone'),
  whatsapp: text('whatsapp'),
  city: text('city'),
  categories: productCategory('categories').array().default(sql`'{}'::product_category[]`).notNull(),
  leadTimeHours: integer('lead_time_hours').default(48).notNull(),
  deliveryDays: integer('delivery_days').array().default(sql`'{1,2,3,4,5}'::int[]`).notNull(), // 1=lundi
  minOrderEur: numeric('min_order_eur', { precision: 10, scale: 2 }).default('0').notNull(),
  deliveryFeeEur: numeric('delivery_fee_eur', { precision: 10, scale: 2 }).default('0').notNull(),
  preferredChannel: orderChannel('preferred_channel').default('whatsapp').notNull(),
  rating: numeric('rating', { precision: 2, scale: 1 }),   // note manuelle 0–5
  notes: text('notes'),
  isActive: boolean('is_active').default(true).notNull(),
  vendorId: uuid('vendor_id'),                       // fournisseur inscrit sur la plateforme (chantier 10)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('suppliers_restaurant_idx').on(t.restaurantId)]);

/** Offre = un produit chez un fournisseur, dans un conditionnement, à un prix courant. */
export const supplierOffers = pgTable('supplier_offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  packLabel: text('pack_label').notNull(),          // « Sac 25 kg », « Bidon 5 L »
  packQty: numeric('pack_qty', { precision: 10, scale: 3 }).notNull(), // quantité en baseUnit par colis
  packPriceEur: numeric('pack_price_eur', { precision: 10, scale: 2 }).notNull(),
  inStock: boolean('in_stock').default(true).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('offers_restaurant_idx').on(t.restaurantId),
  index('offers_product_idx').on(t.productId),
  uniqueIndex('offers_unique').on(t.supplierId, t.productId, t.packLabel),
]);

/** Historique de prix — alimente le suivi des hausses et l'indice de prix. */
export const priceHistory = pgTable('price_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  offerId: uuid('offer_id').notNull().references(() => supplierOffers.id, { onDelete: 'cascade' }),
  unitPriceEur: numeric('unit_price_eur', { precision: 10, scale: 4 }).notNull(), // € / baseUnit
  source: text('source').default('manuel').notNull(),  // manuel | reception | catalogue
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('price_history_offer_idx').on(t.offerId, t.recordedAt)]);

// -------------------------------------------------------------
// Stock
// -------------------------------------------------------------
export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).default('0').notNull(),
  criticalLevel: numeric('critical_level', { precision: 12, scale: 3 }).default('0').notNull(),
  targetLevel: numeric('target_level', { precision: 12, scale: 3 }),
  avgDailyUse: numeric('avg_daily_use', { precision: 12, scale: 3 }), // recalculé par le moteur
  preferredSupplierId: uuid('preferred_supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  lastCountedAt: timestamp('last_counted_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('inventory_unique').on(t.restaurantId, t.productId)]);

export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  inventoryItemId: uuid('inventory_item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  type: movementType('type').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(), // signée : + entrée, - sortie
  unitCostEur: numeric('unit_cost_eur', { precision: 10, scale: 4 }),
  orderId: uuid('order_id'),
  note: text('note'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('movements_item_idx').on(t.inventoryItemId, t.createdAt)]);

// -------------------------------------------------------------
// Commandes & réceptions
// -------------------------------------------------------------
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'restrict' }),
  reference: text('reference').notNull(),           // AFS-2026-000123
  status: orderStatus('status').default('brouillon').notNull(),
  channel: orderChannel('channel').default('whatsapp').notNull(),
  expectedAt: date('expected_at'),
  totalEur: numeric('total_eur', { precision: 10, scale: 2 }).default('0').notNull(),
  deliveryFeeEur: numeric('delivery_fee_eur', { precision: 10, scale: 2 }).default('0').notNull(),
  source: text('source').default('manuel').notNull(), // manuel | panier_ia | auto_reorder
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  vendorId: uuid('vendor_id'),                       // commande « plateforme » (chantier 10)
  vendorDecisionAt: timestamp('vendor_decision_at', { withTimezone: true }),
  vendorNote: text('vendor_note'),
  vendorRemindedAt: timestamp('vendor_reminded_at', { withTimezone: true }), // chantier 18 : rappel WhatsApp/SMS envoyé au grossiste
  // chantier 20 : exécution côté grossiste (sous-étapes de 'confirmee')
  fulfillment: text('fulfillment'),                     // null | en_preparation | en_livraison | livree
  preparedAt: timestamp('prepared_at', { withTimezone: true }),
  shippedAt: timestamp('shipped_at', { withTimezone: true }),
  vendorDeliveredAt: timestamp('vendor_delivered_at', { withTimezone: true }),
  deliverySlot: text('delivery_slot'),                  // ex. « 7h–9h »
  driverName: text('driver_name'),
  proofReceiverName: text('proof_receiver_name'),
  proofPhoto: text('proof_photo'),                      // data URL jpeg compressée (≤ 400 Ko)
  proofSignature: text('proof_signature'),              // data URL png
  proofNote: text('proof_note'),
  // chantier 21 : proposition de modification du grossiste (ruptures / substitutions) en attente du restaurant
  proposal: jsonb('proposal').$type<OrderProposal>(),
  proposalAt: timestamp('proposal_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('orders_restaurant_idx').on(t.restaurantId, t.createdAt), uniqueIndex('orders_ref').on(t.reference)]);

export const orderLines = pgTable('order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),
  offerId: uuid('offer_id').references(() => supplierOffers.id, { onDelete: 'set null' }),
  packLabel: text('pack_label'),
  packs: integer('packs').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),  // en baseUnit (packs × packQty)
  unitPriceEur: numeric('unit_price_eur', { precision: 10, scale: 4 }).notNull(),
  lineTotalEur: numeric('line_total_eur', { precision: 10, scale: 2 }).notNull(),
  receivedQty: numeric('received_qty', { precision: 12, scale: 3 }),
});

export const deliveries = pgTable('deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  receivedBy: uuid('received_by').references(() => users.id, { onDelete: 'set null' }),
  isLate: boolean('is_late').default(false).notNull(),
  hasDiscrepancy: boolean('has_discrepancy').default(false).notNull(),
  invoiceUrl: text('invoice_url'),
  notes: text('notes'),
});

export const deliveryDiscrepancies = pgTable('delivery_discrepancies', {
  id: uuid('id').primaryKey().defaultRandom(),
  deliveryId: uuid('delivery_id').notNull().references(() => deliveries.id, { onDelete: 'cascade' }),
  orderLineId: uuid('order_line_id').notNull().references(() => orderLines.id, { onDelete: 'cascade' }),
  orderedQty: numeric('ordered_qty', { precision: 12, scale: 3 }).notNull(),
  receivedQty: numeric('received_qty', { precision: 12, scale: 3 }).notNull(),
  reason: text('reason'),                            // manquant | abîmé | erreur produit
  claimMessage: text('claim_message'),              // réclamation pré-rédigée
  resolved: boolean('resolved').default(false).notNull(),
});

// -------------------------------------------------------------
// Recettes & ventes
// -------------------------------------------------------------
export const recipes = pgTable('recipes', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),                      // « Poulet braisé »
  sellingPriceEur: numeric('selling_price_eur', { precision: 10, scale: 2 }),
  targetMarginPct: numeric('target_margin_pct', { precision: 5, scale: 2 }).default('70'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('recipes_restaurant_idx').on(t.restaurantId)]);

export const recipeIngredients = pgTable('recipe_ingredients', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),
  quantity: numeric('quantity', { precision: 12, scale: 4 }).notNull(), // en baseUnit par portion
}, (t) => [uniqueIndex('recipe_ing_unique').on(t.recipeId, t.productId)]);

/** Ventes par plat et par jour — source de la prévision et du décrément auto du stock. */
export const sales = pgTable('sales', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  portions: integer('portions').notNull(),
}, (t) => [uniqueIndex('sales_unique').on(t.restaurantId, t.recipeId, t.day)]);

// -------------------------------------------------------------
// Intelligence : alertes, règles, prévisions
// -------------------------------------------------------------
export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  dedupeKey: text('dedupe_key').notNull(),
  kind: alertKind('kind').notNull(),
  severity: alertSeverity('severity').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'cascade' }),
  actionUrl: text('action_url'),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('alerts_dedupe').on(t.restaurantId, t.dedupeKey)]);

export const reorderRules = pgTable('reorder_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  inventoryItemId: uuid('inventory_item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').default(true).notNull(),
  threshold: numeric('threshold', { precision: 12, scale: 3 }).notNull(),
  reorderQty: numeric('reorder_qty', { precision: 12, scale: 3 }).notNull(),
  supplierStrategy: text('supplier_strategy').default('best').notNull(), // best | preferred
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('reorder_rules_unique').on(t.inventoryItemId)]);

export const forecasts = pgTable('forecasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  horizonDays: integer('horizon_days').notNull(),
  predictedNeed: numeric('predicted_need', { precision: 12, scale: 3 }).notNull(),
  currentStock: numeric('current_stock', { precision: 12, scale: 3 }).notNull(),
  recommendedOrder: numeric('recommended_order', { precision: 12, scale: 3 }).notNull(),
  daysOfStockLeft: numeric('days_of_stock_left', { precision: 6, scale: 1 }),
  confidence: numeric('confidence', { precision: 3, scale: 2 }),
  explanation: text('explanation'),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('forecasts_restaurant_idx').on(t.restaurantId, t.computedAt)]);


// -------------------------------------------------------------
// Leads (site vitrine « Demander un accès ») — chantier 5
// -------------------------------------------------------------
export const leadStatus = pgEnum('lead_status', ['nouveau', 'contacte', 'demo', 'pilote', 'client', 'perdu']);
export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantName: text('restaurant_name').notNull(),
  contactName: text('contact_name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  city: text('city'),
  cuisine: text('cuisine'),
  coversPerDay: integer('covers_per_day'),
  message: text('message'),
  planInterest: text('plan_interest'),          // starter | pro | business | pilote
  source: text('source').default('site').notNull(), // site | salon | bouche_a_oreille | partenaire
  utm: jsonb('utm').$type<Record<string, string>>(),
  status: leadStatus('status').default('nouveau').notNull(),
  notes: text('notes'),
  inviteCode: text('invite_code'),                 // chantier 7 : code d'invitation pilote envoyé
  invitedAt: timestamp('invited_at', { withTimezone: true }),
  restaurantId: uuid('restaurant_id'),             // rempli quand le lead s'inscrit avec son code
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('leads_created_idx').on(t.createdAt)]);

// -------------------------------------------------------------
// Relations (pour db.query.*)
// -------------------------------------------------------------
export const restaurantsRelations = relations(restaurants, ({ many }) => ({
  members: many(restaurantMembers), suppliers: many(suppliers), inventory: many(inventoryItems),
  orders: many(orders), recipes: many(recipes), alerts: many(alerts),
}));
export const suppliersRelations = relations(suppliers, ({ many, one }) => ({
  offers: many(supplierOffers), orders: many(orders),
  restaurant: one(restaurants, { fields: [suppliers.restaurantId], references: [restaurants.id] }),
}));
export const supplierOffersRelations = relations(supplierOffers, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [supplierOffers.supplierId], references: [suppliers.id] }),
  product: one(products, { fields: [supplierOffers.productId], references: [products.id] }),
  history: many(priceHistory),
}));
export const priceHistoryRelations = relations(priceHistory, ({ one }) => ({
  offer: one(supplierOffers, { fields: [priceHistory.offerId], references: [supplierOffers.id] }),
}));
export const inventoryItemsRelations = relations(inventoryItems, ({ one, many }) => ({
  product: one(products, { fields: [inventoryItems.productId], references: [products.id] }),
  preferredSupplier: one(suppliers, { fields: [inventoryItems.preferredSupplierId], references: [suppliers.id] }),
  movements: many(stockMovements),
}));
export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  item: one(inventoryItems, { fields: [stockMovements.inventoryItemId], references: [inventoryItems.id] }),
}));
export const ordersRelations = relations(orders, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [orders.supplierId], references: [suppliers.id] }),
  lines: many(orderLines), deliveries: many(deliveries),
}));
export const orderLinesRelations = relations(orderLines, ({ one }) => ({
  order: one(orders, { fields: [orderLines.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderLines.productId], references: [products.id] }),
}));
export const deliveriesRelations = relations(deliveries, ({ one, many }) => ({
  order: one(orders, { fields: [deliveries.orderId], references: [orders.id] }),
  discrepancies: many(deliveryDiscrepancies),
}));
export const deliveryDiscrepanciesRelations = relations(deliveryDiscrepancies, ({ one }) => ({
  delivery: one(deliveries, { fields: [deliveryDiscrepancies.deliveryId], references: [deliveries.id] }),
}));
export const recipesRelations = relations(recipes, ({ many }) => ({
  ingredients: many(recipeIngredients), sales: many(sales),
}));
export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
  product: one(products, { fields: [recipeIngredients.productId], references: [products.id] }),
}));
export const salesRelations = relations(sales, ({ one }) => ({
  recipe: one(recipes, { fields: [sales.recipeId], references: [recipes.id] }),
}));
export const alertsRelations = relations(alerts, ({ one }) => ({
  product: one(products, { fields: [alerts.productId], references: [products.id] }),
  supplier: one(suppliers, { fields: [alerts.supplierId], references: [suppliers.id] }),
}));

// Types inférés
export type User = typeof users.$inferSelect;
export type Restaurant = typeof restaurants.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type SupplierOffer = typeof supplierOffers.$inferSelect;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderLine = typeof orderLines.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type Forecast = typeof forecasts.$inferSelect;

// -------------------------------------------------------------
// Exploitation (chantier 8) : historique des jobs + journal d'audit RGPD
// -------------------------------------------------------------
export const jobRuns = pgTable('job_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  job: text('job').notNull(),                       // daily
  status: text('status').notNull(),                 // ok | partial | error
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }).notNull(),
  durationMs: integer('duration_ms').notNull(),
  summary: jsonb('summary').$type<Record<string, unknown>>(),
  error: text('error'),
}, (t) => [index('job_runs_job_idx').on(t.job, t.startedAt)]);

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
  actorEmail: text('actor_email'),
  action: text('action').notNull(),                 // account.export | account.delete | restaurant.delete | login.failed…
  target: text('target'),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
}, (t) => [index('audit_at_idx').on(t.at)]);

// -------------------------------------------------------------
// Marketplace B2B (chantier 10) : fournisseurs inscrits sur la plateforme, catalogue public,
// commandes « plateforme » confirmées par le fournisseur, achats groupés, commission.
// -------------------------------------------------------------
export const vendorStatus = pgEnum('vendor_status', ['en_attente', 'actif', 'suspendu']);
export const vendors = pgTable('vendors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  city: text('city'),
  deliveryZones: text('delivery_zones').array().default(sql`'{}'::text[]`).notNull(), // codes postaux / villes / « France » (livraison en ligne)
  categories: productCategory('categories').array().default(sql`'{}'::product_category[]`).notNull(),
  leadTimeHours: integer('lead_time_hours').default(48).notNull(),
  deliveryDays: integer('delivery_days').array().default(sql`'{1,2,3,4,5}'::int[]`).notNull(),
  minOrderEur: numeric('min_order_eur', { precision: 10, scale: 2 }).default('0').notNull(),
  deliveryFeeEur: numeric('delivery_fee_eur', { precision: 10, scale: 2 }).default('0').notNull(),
  commissionPct: numeric('commission_pct', { precision: 4, scale: 2 }).default('3.00').notNull(), // 2–5 %
  cgvVersion: text('cgv_version'),                                   // chantier 22 : version des CGV fournisseur acceptées
  cgvAcceptedAt: timestamp('cgv_accepted_at', { withTimezone: true }),
  cgvAcceptedBy: text('cgv_accepted_by'),
  stripeCustomerId: text('stripe_customer_id'),           // facturation mensuelle des commissions
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  whatsapp: text('whatsapp'),
  status: vendorStatus('status').default('en_attente').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const vendorMembers = pgTable('vendor_members', {
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').default('owner').notNull(), // owner | staff
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.vendorId, t.userId] })]);

/** Catalogue public d'un fournisseur plateforme (produits du référentiel commun uniquement). */
export const vendorOffers = pgTable('vendor_offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  packLabel: text('pack_label').notNull(),
  packQty: numeric('pack_qty', { precision: 10, scale: 3 }).notNull(),
  packPriceEur: numeric('pack_price_eur', { precision: 10, scale: 2 }).notNull(),
  inStock: boolean('in_stock').default(true).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('vendor_offers_vendor_idx').on(t.vendorId), index('vendor_offers_product_idx').on(t.productId), uniqueIndex('vendor_offers_unique').on(t.vendorId, t.productId, t.packLabel)]);

/** Achat groupé : plusieurs restaurants d'une zone se regroupent sur une offre ; palier de remise atteint → commandes créées. */
export const groupBuyStatus = pgEnum('group_buy_status', ['ouvert', 'atteint', 'cloture', 'annule']);
export const groupBuys = pgTable('group_buys', {
  id: uuid('id').primaryKey().defaultRandom(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  vendorOfferId: uuid('vendor_offer_id').notNull().references(() => vendorOffers.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),                    // « Riz brisé 25 kg — palier 40 sacs = −12 % »
  zone: text('zone').notNull(),                       // « Nantes », « 44 », « Île-de-France »
  targetPacks: integer('target_packs').notNull(),
  discountPct: numeric('discount_pct', { precision: 4, scale: 2 }).notNull(),
  closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
  deliveryDate: date('delivery_date'),
  status: groupBuyStatus('status').default('ouvert').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('group_buys_zone_idx').on(t.zone, t.status)]);

export const groupBuyParticipations = pgTable('group_buy_participations', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupBuyId: uuid('group_buy_id').notNull().references(() => groupBuys.id, { onDelete: 'cascade' }),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  packs: integer('packs').notNull(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }), // créée à la clôture
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('gbp_unique').on(t.groupBuyId, t.restaurantId)]);

/** Commission plateforme par commande « plateforme » confirmée (base de facturation fournisseur). */
export const commissions = pgTable('commissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }).unique(),
  orderTotalEur: numeric('order_total_eur', { precision: 10, scale: 2 }).notNull(),
  pct: numeric('pct', { precision: 4, scale: 2 }).notNull(),
  amountEur: numeric('amount_eur', { precision: 10, scale: 2 }).notNull(),
  period: text('period').notNull(),                  // AAAA-MM
  invoiced: boolean('invoiced').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('commissions_vendor_period_idx').on(t.vendorId, t.period)]);

// ---------- Chantier 6 : facturation (idempotence des webhooks Stripe + factures de commission) ----------
export const billingEvents = pgTable('billing_events', {
  id: text('id').primaryKey(),                       // evt_… Stripe
  type: text('type').notNull(),
  restaurantId: uuid('restaurant_id'),
  payload: jsonb('payload'),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const commissionInvoices = pgTable('commission_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  period: text('period').notNull(),                  // AAAA-MM
  orders: integer('orders').notNull(),
  baseEur: numeric('base_eur', { precision: 10, scale: 2 }).notNull(),
  amountEur: numeric('amount_eur', { precision: 10, scale: 2 }).notNull(),
  stripeInvoiceId: text('stripe_invoice_id'),
  status: text('status').default('emise').notNull(), // emise | payee | envoyee_par_mail
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('commission_invoices_vendor_period').on(t.vendorId, t.period)]);

// ---------- Chantier 7 : pilotes — retours utilisateurs et usage ----------
export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),                      // nps | bug | idee | question
  score: integer('score'),                           // NPS 0–10
  message: text('message'),
  page: text('page'),
  status: text('status').default('nouveau').notNull(), // nouveau | traite
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('feedback_restaurant_idx').on(t.restaurantId, t.createdAt)]);

export const usageEvents = pgTable('usage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id'),
  event: text('event').notNull(),                    // page.<route> | action.<nom>
  meta: jsonb('meta').$type<Record<string, unknown>>(),
  at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('usage_restaurant_at_idx').on(t.restaurantId, t.at)]);

// ---------- Prospection (admin) : restaurants et fournisseurs à démarcher ----------
export const prospects = pgTable('prospects', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),                     // restaurant | fournisseur
  name: text('name').notNull(),
  address: text('address'),
  city: text('city'),
  phone: text('phone'),
  email: text('email'),
  contactName: text('contact_name'),
  status: text('status').default('a_contacter').notNull(), // a_contacter | contacte | rdv | interesse | converti | perdu
  notes: text('notes'),
  nextActionAt: date('next_action_at'),             // relance prévue
  leadId: uuid('lead_id'),                          // si invitation pilote envoyée
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('prospects_kind_idx').on(t.kind, t.status)]);

// ---------- Listes de courses enregistrées (chantier 11) : « ma liste du lundi », rejouée en un clic ----------
export const shoppingLists = pgTable('shopping_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),                     // « Liste du lundi »
  text: text('text').notNull(),                     // texte libre tel que saisi/dicté
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  useCount: integer('use_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('shopping_lists_restaurant_idx').on(t.restaurantId)]);

// ---------- Chantier 18 : journal des notifications WhatsApp / SMS ----------
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  channel: text('channel').notNull(),              // whatsapp | sms | log
  to: text('to').notNull(),
  kind: text('kind').notNull(),                    // order.new | order.reminder | order.confirmed | order.refused | order.shipped
  orderId: uuid('order_id'),
  vendorId: uuid('vendor_id'),
  restaurantId: uuid('restaurant_id'),
  body: text('body').notNull(),
  ok: boolean('ok').notNull(),
  error: text('error'),
  providerId: text('provider_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('notif_created_idx').on(t.createdAt), index('notif_order_idx').on(t.orderId)]);

// ---------- Chantier 20/23 : chronologie des commandes ----------
export const orderEvents = pgTable('order_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
  type: text('type').notNull(),        // sent | confirmed | refused | preparing | shipped | delivered | received | cancelled | note
  actor: text('actor'),                // restaurant | vendor | system
  label: text('label').notNull(),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
}, (t) => [index('order_events_order_idx').on(t.orderId)]);

// ---------- Chantier 24 : commandes récurrentes ----------
export const recurringOrders = pgTable('recurring_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),                                   // « Commande du lundi »
  weekdays: jsonb('weekdays').$type<number[]>().notNull(),        // 0=dim … 6=sam
  lines: jsonb('lines').$type<{ vendorOfferId: string; packs: number }[]>().notNull(),
  mode: text('mode').default('auto').notNull(),                   // auto : envoyée directement | confirm : e-mail « valider en 1 clic »
  enabled: boolean('enabled').default(true).notNull(),
  notes: text('notes'),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastOrderId: uuid('last_order_id'),
  nextRunOn: date('next_run_on'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('recurring_restaurant_idx').on(t.restaurantId)]);

// ---------- Chantier 26 : litiges & avoirs (commandes marketplace) ----------
export const claims = pgTable('claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  discrepancyId: uuid('discrepancy_id').references(() => deliveryDiscrepancies.id, { onDelete: 'set null' }),
  reference: text('reference').notNull(),                 // LIT-2026-0001
  productName: text('product_name').notNull(),
  kind: text('kind').notNull(),                           // manquant | abime | erreur_produit | qualite | autre
  orderedQty: numeric('ordered_qty', { precision: 12, scale: 3 }),
  receivedQty: numeric('received_qty', { precision: 12, scale: 3 }),
  claimedEur: numeric('claimed_eur', { precision: 10, scale: 2 }).notNull(),   // montant demandé par le restaurant
  message: text('message'),
  photo: text('photo'),                                    // data URL
  status: text('status').default('ouvert').notNull(),     // ouvert | propose | accepte | refuse | escalade | clos
  resolution: text('resolution'),                          // avoir | relivraison | refus
  creditEur: numeric('credit_eur', { precision: 10, scale: 2 }),                // avoir accordé
  vendorMessage: text('vendor_message'),
  vendorRespondedAt: timestamp('vendor_responded_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('claims_vendor_idx').on(t.vendorId), index('claims_restaurant_idx').on(t.restaurantId)]);

// ---------- Chantier 28 : tarifs par volume & prix négociés ----------
export const vendorPriceTiers = pgTable('vendor_price_tiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  vendorOfferId: uuid('vendor_offer_id').notNull().references(() => vendorOffers.id, { onDelete: 'cascade' }),
  minPacks: integer('min_packs').notNull(),                                   // à partir de N colis
  packPriceEur: numeric('pack_price_eur', { precision: 10, scale: 2 }).notNull(),
}, (t) => [index('price_tiers_offer_idx').on(t.vendorOfferId), uniqueIndex('price_tiers_unique').on(t.vendorOfferId, t.minPacks)]);

export const vendorCustomerPrices = pgTable('vendor_customer_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  vendorOfferId: uuid('vendor_offer_id').references(() => vendorOffers.id, { onDelete: 'cascade' }), // null = remise globale sur tout le catalogue
  packPriceEur: numeric('pack_price_eur', { precision: 10, scale: 2 }),       // prix négocié ferme (si offre)
  discountPct: numeric('discount_pct', { precision: 5, scale: 2 }),           // ou remise % (offre ou globale)
  validUntil: date('valid_until'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('customer_prices_vendor_idx').on(t.vendorId), index('customer_prices_restaurant_idx').on(t.restaurantId)]);

// =============================================================
// AFRISUPPLY — Schéma Postgres (Neon) via Drizzle ORM
//
// 16 tables, une seule source de vérité typée.
// Isolation multi-tenant : toute table métier porte restaurant_id ;
// l'API filtre systématiquement dessus (équivalent applicatif de la RLS).
// =============================================================

import {
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
  settings: jsonb('settings').$type<RestaurantSettings>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type RestaurantSettings = {
  currency?: 'EUR';
  priceIncreaseAlertPct?: number;   // défaut 8 %
  forecastHorizonDays?: number;     // défaut 7
  autoReorderEnabled?: boolean;
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

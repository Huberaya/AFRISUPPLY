import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// packages/db/src/schema.ts
var schema_exports = {};
__export(schema_exports, {
  alertKind: () => alertKind,
  alertSeverity: () => alertSeverity,
  alerts: () => alerts,
  alertsRelations: () => alertsRelations,
  auditLog: () => auditLog,
  billingEvents: () => billingEvents,
  claims: () => claims,
  commissionInvoices: () => commissionInvoices,
  commissions: () => commissions,
  deliveries: () => deliveries,
  deliveriesRelations: () => deliveriesRelations,
  deliveryDiscrepancies: () => deliveryDiscrepancies,
  deliveryDiscrepanciesRelations: () => deliveryDiscrepanciesRelations,
  feedback: () => feedback,
  forecasts: () => forecasts,
  groupBuyParticipations: () => groupBuyParticipations,
  groupBuyStatus: () => groupBuyStatus,
  groupBuys: () => groupBuys,
  inventoryItems: () => inventoryItems,
  inventoryItemsRelations: () => inventoryItemsRelations,
  jobRuns: () => jobRuns,
  leadStatus: () => leadStatus,
  leads: () => leads,
  memberRole: () => memberRole,
  movementType: () => movementType,
  notifications: () => notifications,
  orderChannel: () => orderChannel,
  orderEvents: () => orderEvents,
  orderLines: () => orderLines,
  orderLinesRelations: () => orderLinesRelations,
  orderStatus: () => orderStatus,
  orders: () => orders,
  ordersRelations: () => ordersRelations,
  passwordResets: () => passwordResets,
  plan: () => plan,
  priceHistory: () => priceHistory,
  priceHistoryRelations: () => priceHistoryRelations,
  productCategory: () => productCategory,
  products: () => products,
  prospects: () => prospects,
  recipeIngredients: () => recipeIngredients,
  recipeIngredientsRelations: () => recipeIngredientsRelations,
  recipes: () => recipes,
  recipesRelations: () => recipesRelations,
  recurringOrders: () => recurringOrders,
  reorderRules: () => reorderRules,
  restaurantMembers: () => restaurantMembers,
  restaurants: () => restaurants,
  restaurantsRelations: () => restaurantsRelations,
  sales: () => sales,
  salesRelations: () => salesRelations,
  shoppingLists: () => shoppingLists,
  stockMovements: () => stockMovements,
  stockMovementsRelations: () => stockMovementsRelations,
  supplierOffers: () => supplierOffers,
  supplierOffersRelations: () => supplierOffersRelations,
  suppliers: () => suppliers,
  suppliersRelations: () => suppliersRelations,
  unit: () => unit,
  usageEvents: () => usageEvents,
  users: () => users,
  vendorCustomerPrices: () => vendorCustomerPrices,
  vendorMembers: () => vendorMembers,
  vendorOffers: () => vendorOffers,
  vendorPriceTiers: () => vendorPriceTiers,
  vendorReviews: () => vendorReviews,
  vendorRoutes: () => vendorRoutes,
  vendorStatus: () => vendorStatus,
  vendors: () => vendors
});
import {
  primaryKey,
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  date,
  jsonb,
  pgEnum,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
var memberRole, productCategory, unit, movementType, orderStatus, orderChannel, alertKind, alertSeverity, plan, users, passwordResets, restaurants, restaurantMembers, products, suppliers, supplierOffers, priceHistory, inventoryItems, stockMovements, orders, orderLines, deliveries, deliveryDiscrepancies, recipes, recipeIngredients, sales, alerts, reorderRules, forecasts, leadStatus, leads, restaurantsRelations, suppliersRelations, supplierOffersRelations, priceHistoryRelations, inventoryItemsRelations, stockMovementsRelations, ordersRelations, orderLinesRelations, deliveriesRelations, deliveryDiscrepanciesRelations, recipesRelations, recipeIngredientsRelations, salesRelations, alertsRelations, jobRuns, auditLog, vendorStatus, vendors, vendorMembers, vendorOffers, groupBuyStatus, groupBuys, groupBuyParticipations, commissions, billingEvents, commissionInvoices, feedback, usageEvents, prospects, shoppingLists, notifications, orderEvents, recurringOrders, claims, vendorPriceTiers, vendorCustomerPrices, vendorReviews, vendorRoutes;
var init_schema = __esm({
  "packages/db/src/schema.ts"() {
    "use strict";
    memberRole = pgEnum("member_role", ["owner", "manager", "staff"]);
    productCategory = pgEnum("product_category", [
      "feculents",
      "frais",
      "viandes_poissons",
      "epicerie",
      "boissons",
      "emballages"
    ]);
    unit = pgEnum("unit", ["kg", "g", "L", "mL", "piece", "botte", "sac", "carton"]);
    movementType = pgEnum("movement_type", ["reception", "consommation", "ajustement", "perte"]);
    orderStatus = pgEnum("order_status", [
      "brouillon",
      "preparee",
      "envoyee",
      "confirmee",
      "livree_partiel",
      "livree",
      "annulee"
    ]);
    orderChannel = pgEnum("order_channel", ["email", "whatsapp", "telephone", "plateforme"]);
    alertKind = pgEnum("alert_kind", ["rupture", "stock_bas", "hausse_prix", "opportunite", "fournisseur", "ecart_livraison"]);
    alertSeverity = pgEnum("alert_severity", ["red", "orange", "green", "blue"]);
    plan = pgEnum("plan", ["trial", "starter", "pro", "business"]);
    users = pgTable("users", {
      id: uuid("id").primaryKey().defaultRandom(),
      email: text("email").notNull().unique(),
      passwordHash: text("password_hash").notNull(),
      fullName: text("full_name").notNull(),
      phone: text("phone"),
      // Chantier 2 (audit) : numéro de génération de session. Incrémenté à chaque changement de mot de
      // passe / déconnexion globale → tous les jetons déjà émis deviennent invalides (révocation immédiate).
      tokenVersion: integer("token_version").default(0).notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
      lastLoginAt: timestamp("last_login_at", { withTimezone: true })
    });
    passwordResets = pgTable("password_resets", {
      id: uuid("id").primaryKey().defaultRandom(),
      userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      tokenHash: text("token_hash").notNull().unique(),
      expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
      usedAt: timestamp("used_at", { withTimezone: true }),
      requestedIp: text("requested_ip"),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("password_resets_user_idx").on(t.userId, t.createdAt)]);
    restaurants = pgTable("restaurants", {
      id: uuid("id").primaryKey().defaultRandom(),
      name: text("name").notNull(),
      slug: text("slug").notNull().unique(),
      city: text("city"),
      postalCode: text("postal_code"),
      address: text("address"),
      cuisine: text("cuisine"),
      // « sénégalaise », « ivoirienne », « panafricaine »…
      coversPerDay: integer("covers_per_day"),
      // couverts moyens / jour (sert à la prévision)
      plan: plan("plan").default("trial").notNull(),
      trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
      stripeCustomerId: text("stripe_customer_id"),
      stripeSubscriptionId: text("stripe_subscription_id"),
      subscriptionStatus: text("subscription_status").default("trialing").notNull(),
      // trialing | active | past_due | canceled | expired
      currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
      founder: boolean("founder").default(false).notNull(),
      // offre pilote fondateur (−50 % à vie)
      inviteCode: text("invite_code"),
      // code d'invitation pilote utilisé à l'inscription
      onboardingDone: jsonb("onboarding_done").$type().default([]).notNull(),
      // étapes de la checklist « semaine 1 » cochées
      settings: jsonb("settings").$type().default({}).notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    });
    restaurantMembers = pgTable("restaurant_members", {
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      role: memberRole("role").default("owner").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [uniqueIndex("restaurant_members_pk").on(t.restaurantId, t.userId)]);
    products = pgTable("products", {
      id: uuid("id").primaryKey().defaultRandom(),
      // NULL = produit du référentiel AFRISUPPLY ; sinon produit privé du restaurant
      restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      aliases: text("aliases").array().default(sql`'{}'::text[]`).notNull(),
      // attiéké / attieke / garba
      category: productCategory("category").notNull(),
      baseUnit: unit("base_unit").notNull(),
      // unité de stock et de prix (kg, L, pièce)
      origin: text("origin"),
      // « Côte d'Ivoire », « Sénégal »…
      shelfLifeDays: integer("shelf_life_days"),
      seasonality: text("seasonality"),
      // texte libre ou JSON mois
      imageUrl: text("image_url"),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("products_category_idx").on(t.category), index("products_restaurant_idx").on(t.restaurantId)]);
    suppliers = pgTable("suppliers", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      contactName: text("contact_name"),
      email: text("email"),
      phone: text("phone"),
      whatsapp: text("whatsapp"),
      city: text("city"),
      categories: productCategory("categories").array().default(sql`'{}'::product_category[]`).notNull(),
      leadTimeHours: integer("lead_time_hours").default(48).notNull(),
      deliveryDays: integer("delivery_days").array().default(sql`'{1,2,3,4,5}'::int[]`).notNull(),
      // 1=lundi
      minOrderEur: numeric("min_order_eur", { precision: 10, scale: 2 }).default("0").notNull(),
      deliveryFeeEur: numeric("delivery_fee_eur", { precision: 10, scale: 2 }).default("0").notNull(),
      preferredChannel: orderChannel("preferred_channel").default("whatsapp").notNull(),
      rating: numeric("rating", { precision: 2, scale: 1 }),
      // note manuelle 0–5
      notes: text("notes"),
      isActive: boolean("is_active").default(true).notNull(),
      vendorId: uuid("vendor_id"),
      // fournisseur inscrit sur la plateforme (chantier 10)
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("suppliers_restaurant_idx").on(t.restaurantId)]);
    supplierOffers = pgTable("supplier_offers", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
      productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
      packLabel: text("pack_label").notNull(),
      // « Sac 25 kg », « Bidon 5 L »
      packQty: numeric("pack_qty", { precision: 10, scale: 3 }).notNull(),
      // quantité en baseUnit par colis
      packPriceEur: numeric("pack_price_eur", { precision: 10, scale: 2 }).notNull(),
      inStock: boolean("in_stock").default(true).notNull(),
      lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [
      index("offers_restaurant_idx").on(t.restaurantId),
      index("offers_product_idx").on(t.productId),
      uniqueIndex("offers_unique").on(t.supplierId, t.productId, t.packLabel)
    ]);
    priceHistory = pgTable("price_history", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      offerId: uuid("offer_id").notNull().references(() => supplierOffers.id, { onDelete: "cascade" }),
      unitPriceEur: numeric("unit_price_eur", { precision: 10, scale: 4 }).notNull(),
      // € / baseUnit
      source: text("source").default("manuel").notNull(),
      // manuel | reception | catalogue
      recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("price_history_offer_idx").on(t.offerId, t.recordedAt)]);
    inventoryItems = pgTable("inventory_items", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
      quantity: numeric("quantity", { precision: 12, scale: 3 }).default("0").notNull(),
      criticalLevel: numeric("critical_level", { precision: 12, scale: 3 }).default("0").notNull(),
      targetLevel: numeric("target_level", { precision: 12, scale: 3 }),
      avgDailyUse: numeric("avg_daily_use", { precision: 12, scale: 3 }),
      // recalculé par le moteur
      preferredSupplierId: uuid("preferred_supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
      lastCountedAt: timestamp("last_counted_at", { withTimezone: true }),
      updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [uniqueIndex("inventory_unique").on(t.restaurantId, t.productId)]);
    stockMovements = pgTable("stock_movements", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      inventoryItemId: uuid("inventory_item_id").notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
      type: movementType("type").notNull(),
      quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
      // signée : + entrée, - sortie
      unitCostEur: numeric("unit_cost_eur", { precision: 10, scale: 4 }),
      orderId: uuid("order_id"),
      note: text("note"),
      createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("movements_item_idx").on(t.inventoryItemId, t.createdAt)]);
    orders = pgTable("orders", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "restrict" }),
      reference: text("reference").notNull(),
      // AFS-2026-000123
      status: orderStatus("status").default("brouillon").notNull(),
      channel: orderChannel("channel").default("whatsapp").notNull(),
      expectedAt: date("expected_at"),
      totalEur: numeric("total_eur", { precision: 10, scale: 2 }).default("0").notNull(),
      deliveryFeeEur: numeric("delivery_fee_eur", { precision: 10, scale: 2 }).default("0").notNull(),
      source: text("source").default("manuel").notNull(),
      // manuel | panier_ia | auto_reorder
      notes: text("notes"),
      createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
      sentAt: timestamp("sent_at", { withTimezone: true }),
      deliveredAt: timestamp("delivered_at", { withTimezone: true }),
      vendorId: uuid("vendor_id"),
      // commande « plateforme » (chantier 10)
      vendorDecisionAt: timestamp("vendor_decision_at", { withTimezone: true }),
      vendorNote: text("vendor_note"),
      vendorRemindedAt: timestamp("vendor_reminded_at", { withTimezone: true }),
      // chantier 18 : rappel WhatsApp/SMS envoyé au grossiste
      // chantier 20 : exécution côté grossiste (sous-étapes de 'confirmee')
      fulfillment: text("fulfillment"),
      // null | en_preparation | en_livraison | livree
      preparedAt: timestamp("prepared_at", { withTimezone: true }),
      shippedAt: timestamp("shipped_at", { withTimezone: true }),
      vendorDeliveredAt: timestamp("vendor_delivered_at", { withTimezone: true }),
      deliverySlot: text("delivery_slot"),
      // ex. « 7h–9h »
      driverName: text("driver_name"),
      proofReceiverName: text("proof_receiver_name"),
      proofPhoto: text("proof_photo"),
      // data URL jpeg compressée (≤ 400 Ko)
      proofSignature: text("proof_signature"),
      // data URL png
      proofNote: text("proof_note"),
      routeId: uuid("route_id"),
      // chantier 19 : tournée choisie (vendor_routes.id)
      // chantier 21 : proposition de modification du grossiste (ruptures / substitutions) en attente du restaurant
      proposal: jsonb("proposal").$type(),
      proposalAt: timestamp("proposal_at", { withTimezone: true }),
      // chantier 1 (audit) : horodatage de la réception — une commande n'est réceptionnable qu'une seule fois
      receivedAt: timestamp("received_at", { withTimezone: true }),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("orders_restaurant_idx").on(t.restaurantId, t.createdAt), uniqueIndex("orders_ref").on(t.reference)]);
    orderLines = pgTable("order_lines", {
      id: uuid("id").primaryKey().defaultRandom(),
      orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
      productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
      offerId: uuid("offer_id").references(() => supplierOffers.id, { onDelete: "set null" }),
      packLabel: text("pack_label"),
      packs: integer("packs").notNull(),
      quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
      // en baseUnit (packs × packQty)
      unitPriceEur: numeric("unit_price_eur", { precision: 10, scale: 4 }).notNull(),
      lineTotalEur: numeric("line_total_eur", { precision: 10, scale: 2 }).notNull(),
      receivedQty: numeric("received_qty", { precision: 12, scale: 3 }),
      // chantier 3 (audit) : prix réellement facturé (€ / unité de base), saisi à la réception.
      // Sans lui, l'historique de prix reste plat (il ne contient que les prix commandés) et
      // l'alerte « vos prix augmentent » ne peut jamais se déclencher.
      invoicedUnitPriceEur: numeric("invoiced_unit_price_eur", { precision: 10, scale: 4 })
    });
    deliveries = pgTable("deliveries", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
      receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
      receivedBy: uuid("received_by").references(() => users.id, { onDelete: "set null" }),
      isLate: boolean("is_late").default(false).notNull(),
      hasDiscrepancy: boolean("has_discrepancy").default(false).notNull(),
      invoiceUrl: text("invoice_url"),
      notes: text("notes")
      // chantier 1 (audit) : une commande = une seule livraison. Contrainte de base empêchant
      // le double comptage du stock en cas de double validation (course ou double clic).
    }, (t) => [uniqueIndex("deliveries_order_unique").on(t.orderId)]);
    deliveryDiscrepancies = pgTable("delivery_discrepancies", {
      id: uuid("id").primaryKey().defaultRandom(),
      deliveryId: uuid("delivery_id").notNull().references(() => deliveries.id, { onDelete: "cascade" }),
      orderLineId: uuid("order_line_id").notNull().references(() => orderLines.id, { onDelete: "cascade" }),
      orderedQty: numeric("ordered_qty", { precision: 12, scale: 3 }).notNull(),
      receivedQty: numeric("received_qty", { precision: 12, scale: 3 }).notNull(),
      reason: text("reason"),
      // manquant | abîmé | erreur produit
      claimMessage: text("claim_message"),
      // réclamation pré-rédigée
      resolved: boolean("resolved").default(false).notNull()
    });
    recipes = pgTable("recipes", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      // « Poulet braisé »
      sellingPriceEur: numeric("selling_price_eur", { precision: 10, scale: 2 }),
      targetMarginPct: numeric("target_margin_pct", { precision: 5, scale: 2 }).default("70"),
      isActive: boolean("is_active").default(true).notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("recipes_restaurant_idx").on(t.restaurantId)]);
    recipeIngredients = pgTable("recipe_ingredients", {
      id: uuid("id").primaryKey().defaultRandom(),
      recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
      productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
      quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull()
      // en baseUnit par portion
    }, (t) => [uniqueIndex("recipe_ing_unique").on(t.recipeId, t.productId)]);
    sales = pgTable("sales", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
      day: date("day").notNull(),
      portions: integer("portions").notNull()
    }, (t) => [uniqueIndex("sales_unique").on(t.restaurantId, t.recipeId, t.day)]);
    alerts = pgTable("alerts", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      dedupeKey: text("dedupe_key").notNull(),
      kind: alertKind("kind").notNull(),
      severity: alertSeverity("severity").notNull(),
      title: text("title").notNull(),
      message: text("message").notNull(),
      productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
      supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "cascade" }),
      actionUrl: text("action_url"),
      payload: jsonb("payload").$type(),
      isRead: boolean("is_read").default(false).notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [uniqueIndex("alerts_dedupe").on(t.restaurantId, t.dedupeKey)]);
    reorderRules = pgTable("reorder_rules", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      inventoryItemId: uuid("inventory_item_id").notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
      enabled: boolean("enabled").default(true).notNull(),
      threshold: numeric("threshold", { precision: 12, scale: 3 }).notNull(),
      reorderQty: numeric("reorder_qty", { precision: 12, scale: 3 }).notNull(),
      supplierStrategy: text("supplier_strategy").default("best").notNull(),
      // best | preferred
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [uniqueIndex("reorder_rules_unique").on(t.inventoryItemId)]);
    forecasts = pgTable("forecasts", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
      horizonDays: integer("horizon_days").notNull(),
      predictedNeed: numeric("predicted_need", { precision: 12, scale: 3 }).notNull(),
      currentStock: numeric("current_stock", { precision: 12, scale: 3 }).notNull(),
      recommendedOrder: numeric("recommended_order", { precision: 12, scale: 3 }).notNull(),
      daysOfStockLeft: numeric("days_of_stock_left", { precision: 6, scale: 1 }),
      confidence: numeric("confidence", { precision: 3, scale: 2 }),
      explanation: text("explanation"),
      computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("forecasts_restaurant_idx").on(t.restaurantId, t.computedAt)]);
    leadStatus = pgEnum("lead_status", ["nouveau", "contacte", "demo", "pilote", "client", "perdu"]);
    leads = pgTable("leads", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantName: text("restaurant_name").notNull(),
      contactName: text("contact_name").notNull(),
      email: text("email").notNull(),
      phone: text("phone"),
      city: text("city"),
      cuisine: text("cuisine"),
      coversPerDay: integer("covers_per_day"),
      message: text("message"),
      planInterest: text("plan_interest"),
      // starter | pro | business | pilote
      source: text("source").default("site").notNull(),
      // site | salon | bouche_a_oreille | partenaire
      utm: jsonb("utm").$type(),
      status: leadStatus("status").default("nouveau").notNull(),
      notes: text("notes"),
      inviteCode: text("invite_code"),
      // chantier 7 : code d'invitation pilote envoyé
      invitedAt: timestamp("invited_at", { withTimezone: true }),
      restaurantId: uuid("restaurant_id"),
      // rempli quand le lead s'inscrit avec son code
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("leads_created_idx").on(t.createdAt)]);
    restaurantsRelations = relations(restaurants, ({ many }) => ({
      members: many(restaurantMembers),
      suppliers: many(suppliers),
      inventory: many(inventoryItems),
      orders: many(orders),
      recipes: many(recipes),
      alerts: many(alerts)
    }));
    suppliersRelations = relations(suppliers, ({ many, one }) => ({
      offers: many(supplierOffers),
      orders: many(orders),
      restaurant: one(restaurants, { fields: [suppliers.restaurantId], references: [restaurants.id] })
    }));
    supplierOffersRelations = relations(supplierOffers, ({ one, many }) => ({
      supplier: one(suppliers, { fields: [supplierOffers.supplierId], references: [suppliers.id] }),
      product: one(products, { fields: [supplierOffers.productId], references: [products.id] }),
      history: many(priceHistory)
    }));
    priceHistoryRelations = relations(priceHistory, ({ one }) => ({
      offer: one(supplierOffers, { fields: [priceHistory.offerId], references: [supplierOffers.id] })
    }));
    inventoryItemsRelations = relations(inventoryItems, ({ one, many }) => ({
      product: one(products, { fields: [inventoryItems.productId], references: [products.id] }),
      preferredSupplier: one(suppliers, { fields: [inventoryItems.preferredSupplierId], references: [suppliers.id] }),
      movements: many(stockMovements)
    }));
    stockMovementsRelations = relations(stockMovements, ({ one }) => ({
      item: one(inventoryItems, { fields: [stockMovements.inventoryItemId], references: [inventoryItems.id] })
    }));
    ordersRelations = relations(orders, ({ one, many }) => ({
      supplier: one(suppliers, { fields: [orders.supplierId], references: [suppliers.id] }),
      lines: many(orderLines),
      deliveries: many(deliveries)
    }));
    orderLinesRelations = relations(orderLines, ({ one }) => ({
      order: one(orders, { fields: [orderLines.orderId], references: [orders.id] }),
      product: one(products, { fields: [orderLines.productId], references: [products.id] })
    }));
    deliveriesRelations = relations(deliveries, ({ one, many }) => ({
      order: one(orders, { fields: [deliveries.orderId], references: [orders.id] }),
      discrepancies: many(deliveryDiscrepancies)
    }));
    deliveryDiscrepanciesRelations = relations(deliveryDiscrepancies, ({ one }) => ({
      delivery: one(deliveries, { fields: [deliveryDiscrepancies.deliveryId], references: [deliveries.id] })
    }));
    recipesRelations = relations(recipes, ({ many }) => ({
      ingredients: many(recipeIngredients),
      sales: many(sales)
    }));
    recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
      recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
      product: one(products, { fields: [recipeIngredients.productId], references: [products.id] })
    }));
    salesRelations = relations(sales, ({ one }) => ({
      recipe: one(recipes, { fields: [sales.recipeId], references: [recipes.id] })
    }));
    alertsRelations = relations(alerts, ({ one }) => ({
      product: one(products, { fields: [alerts.productId], references: [products.id] }),
      supplier: one(suppliers, { fields: [alerts.supplierId], references: [suppliers.id] })
    }));
    jobRuns = pgTable("job_runs", {
      id: uuid("id").primaryKey().defaultRandom(),
      job: text("job").notNull(),
      // daily
      status: text("status").notNull(),
      // ok | partial | error
      startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
      finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
      durationMs: integer("duration_ms").notNull(),
      summary: jsonb("summary").$type(),
      error: text("error")
    }, (t) => [index("job_runs_job_idx").on(t.job, t.startedAt)]);
    auditLog = pgTable("audit_log", {
      id: uuid("id").primaryKey().defaultRandom(),
      at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
      actorEmail: text("actor_email"),
      action: text("action").notNull(),
      // account.export | account.delete | restaurant.delete | login.failed…
      target: text("target"),
      meta: jsonb("meta").$type()
    }, (t) => [index("audit_at_idx").on(t.at)]);
    vendorStatus = pgEnum("vendor_status", ["en_attente", "actif", "suspendu"]);
    vendors = pgTable("vendors", {
      id: uuid("id").primaryKey().defaultRandom(),
      name: text("name").notNull(),
      slug: text("slug").notNull().unique(),
      description: text("description"),
      city: text("city"),
      deliveryZones: text("delivery_zones").array().default(sql`'{}'::text[]`).notNull(),
      // codes postaux / villes / « France » (livraison en ligne)
      categories: productCategory("categories").array().default(sql`'{}'::product_category[]`).notNull(),
      leadTimeHours: integer("lead_time_hours").default(48).notNull(),
      deliveryDays: integer("delivery_days").array().default(sql`'{1,2,3,4,5}'::int[]`).notNull(),
      minOrderEur: numeric("min_order_eur", { precision: 10, scale: 2 }).default("0").notNull(),
      deliveryFeeEur: numeric("delivery_fee_eur", { precision: 10, scale: 2 }).default("0").notNull(),
      commissionPct: numeric("commission_pct", { precision: 4, scale: 2 }).default("3.00").notNull(),
      // 2–5 %
      cgvVersion: text("cgv_version"),
      // chantier 22 : version des CGV fournisseur acceptées
      cgvAcceptedAt: timestamp("cgv_accepted_at", { withTimezone: true }),
      cgvAcceptedBy: text("cgv_accepted_by"),
      stripeCustomerId: text("stripe_customer_id"),
      // facturation mensuelle des commissions
      contactEmail: text("contact_email"),
      contactPhone: text("contact_phone"),
      whatsapp: text("whatsapp"),
      status: vendorStatus("status").default("en_attente").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    });
    vendorMembers = pgTable("vendor_members", {
      vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
      userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      role: text("role").default("owner").notNull(),
      // owner | staff
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [primaryKey({ columns: [t.vendorId, t.userId] })]);
    vendorOffers = pgTable("vendor_offers", {
      id: uuid("id").primaryKey().defaultRandom(),
      vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
      productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
      packLabel: text("pack_label").notNull(),
      packQty: numeric("pack_qty", { precision: 10, scale: 3 }).notNull(),
      packPriceEur: numeric("pack_price_eur", { precision: 10, scale: 2 }).notNull(),
      inStock: boolean("in_stock").default(true).notNull(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("vendor_offers_vendor_idx").on(t.vendorId), index("vendor_offers_product_idx").on(t.productId), uniqueIndex("vendor_offers_unique").on(t.vendorId, t.productId, t.packLabel)]);
    groupBuyStatus = pgEnum("group_buy_status", ["ouvert", "atteint", "cloture", "annule"]);
    groupBuys = pgTable("group_buys", {
      id: uuid("id").primaryKey().defaultRandom(),
      vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
      vendorOfferId: uuid("vendor_offer_id").notNull().references(() => vendorOffers.id, { onDelete: "cascade" }),
      title: text("title").notNull(),
      // « Riz brisé 25 kg — palier 40 sacs = −12 % »
      zone: text("zone").notNull(),
      // « Nantes », « 44 », « Île-de-France »
      targetPacks: integer("target_packs").notNull(),
      discountPct: numeric("discount_pct", { precision: 4, scale: 2 }).notNull(),
      closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
      deliveryDate: date("delivery_date"),
      status: groupBuyStatus("status").default("ouvert").notNull(),
      createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("group_buys_zone_idx").on(t.zone, t.status)]);
    groupBuyParticipations = pgTable("group_buy_participations", {
      id: uuid("id").primaryKey().defaultRandom(),
      groupBuyId: uuid("group_buy_id").notNull().references(() => groupBuys.id, { onDelete: "cascade" }),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      packs: integer("packs").notNull(),
      orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
      // créée à la clôture
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [uniqueIndex("gbp_unique").on(t.groupBuyId, t.restaurantId)]);
    commissions = pgTable("commissions", {
      id: uuid("id").primaryKey().defaultRandom(),
      vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
      orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }).unique(),
      orderTotalEur: numeric("order_total_eur", { precision: 10, scale: 2 }).notNull(),
      pct: numeric("pct", { precision: 4, scale: 2 }).notNull(),
      amountEur: numeric("amount_eur", { precision: 10, scale: 2 }).notNull(),
      period: text("period").notNull(),
      // AAAA-MM
      invoiced: boolean("invoiced").default(false).notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("commissions_vendor_period_idx").on(t.vendorId, t.period)]);
    billingEvents = pgTable("billing_events", {
      id: text("id").primaryKey(),
      // evt_… Stripe
      type: text("type").notNull(),
      restaurantId: uuid("restaurant_id"),
      payload: jsonb("payload"),
      processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull()
    });
    commissionInvoices = pgTable("commission_invoices", {
      id: uuid("id").primaryKey().defaultRandom(),
      vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
      period: text("period").notNull(),
      // AAAA-MM
      orders: integer("orders").notNull(),
      baseEur: numeric("base_eur", { precision: 10, scale: 2 }).notNull(),
      amountEur: numeric("amount_eur", { precision: 10, scale: 2 }).notNull(),
      stripeInvoiceId: text("stripe_invoice_id"),
      status: text("status").default("emise").notNull(),
      // emise | payee | envoyee_par_mail
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [uniqueIndex("commission_invoices_vendor_period").on(t.vendorId, t.period)]);
    feedback = pgTable("feedback", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
      kind: text("kind").notNull(),
      // nps | bug | idee | question
      score: integer("score"),
      // NPS 0–10
      message: text("message"),
      page: text("page"),
      status: text("status").default("nouveau").notNull(),
      // nouveau | traite
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("feedback_restaurant_idx").on(t.restaurantId, t.createdAt)]);
    usageEvents = pgTable("usage_events", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      userId: uuid("user_id"),
      event: text("event").notNull(),
      // page.<route> | action.<nom>
      meta: jsonb("meta").$type(),
      at: timestamp("at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("usage_restaurant_at_idx").on(t.restaurantId, t.at)]);
    prospects = pgTable("prospects", {
      id: uuid("id").primaryKey().defaultRandom(),
      kind: text("kind").notNull(),
      // restaurant | fournisseur
      name: text("name").notNull(),
      address: text("address"),
      city: text("city"),
      phone: text("phone"),
      email: text("email"),
      contactName: text("contact_name"),
      status: text("status").default("a_contacter").notNull(),
      // a_contacter | contacte | rdv | interesse | converti | perdu
      notes: text("notes"),
      nextActionAt: date("next_action_at"),
      // relance prévue
      leadId: uuid("lead_id"),
      // si invitation pilote envoyée
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("prospects_kind_idx").on(t.kind, t.status)]);
    shoppingLists = pgTable("shopping_lists", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      // « Liste du lundi »
      text: text("text").notNull(),
      // texte libre tel que saisi/dicté
      lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
      useCount: integer("use_count").default(0).notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("shopping_lists_restaurant_idx").on(t.restaurantId)]);
    notifications = pgTable("notifications", {
      id: uuid("id").primaryKey().defaultRandom(),
      channel: text("channel").notNull(),
      // whatsapp | sms | log
      to: text("to").notNull(),
      kind: text("kind").notNull(),
      // order.new | order.reminder | order.confirmed | order.refused | order.shipped
      orderId: uuid("order_id"),
      vendorId: uuid("vendor_id"),
      restaurantId: uuid("restaurant_id"),
      body: text("body").notNull(),
      ok: boolean("ok").notNull(),
      error: text("error"),
      providerId: text("provider_id"),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("notif_created_idx").on(t.createdAt), index("notif_order_idx").on(t.orderId)]);
    orderEvents = pgTable("order_events", {
      id: uuid("id").primaryKey().defaultRandom(),
      orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
      at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
      type: text("type").notNull(),
      // sent | confirmed | refused | preparing | shipped | delivered | received | cancelled | note
      actor: text("actor"),
      // restaurant | vendor | system
      label: text("label").notNull(),
      meta: jsonb("meta").$type()
    }, (t) => [index("order_events_order_idx").on(t.orderId)]);
    recurringOrders = pgTable("recurring_orders", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      // « Commande du lundi »
      weekdays: jsonb("weekdays").$type().notNull(),
      // 0=dim … 6=sam
      lines: jsonb("lines").$type().notNull(),
      mode: text("mode").default("auto").notNull(),
      // auto : envoyée directement | confirm : e-mail « valider en 1 clic »
      enabled: boolean("enabled").default(true).notNull(),
      notes: text("notes"),
      lastRunAt: timestamp("last_run_at", { withTimezone: true }),
      lastOrderId: uuid("last_order_id"),
      nextRunOn: date("next_run_on"),
      createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("recurring_restaurant_idx").on(t.restaurantId)]);
    claims = pgTable("claims", {
      id: uuid("id").primaryKey().defaultRandom(),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
      orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
      discrepancyId: uuid("discrepancy_id").references(() => deliveryDiscrepancies.id, { onDelete: "set null" }),
      reference: text("reference").notNull(),
      // LIT-2026-0001
      productName: text("product_name").notNull(),
      kind: text("kind").notNull(),
      // manquant | abime | erreur_produit | qualite | autre
      orderedQty: numeric("ordered_qty", { precision: 12, scale: 3 }),
      receivedQty: numeric("received_qty", { precision: 12, scale: 3 }),
      claimedEur: numeric("claimed_eur", { precision: 10, scale: 2 }).notNull(),
      // montant demandé par le restaurant
      message: text("message"),
      photo: text("photo"),
      // data URL
      status: text("status").default("ouvert").notNull(),
      // ouvert | propose | accepte | refuse | escalade | clos
      resolution: text("resolution"),
      // avoir | relivraison | refus
      creditEur: numeric("credit_eur", { precision: 10, scale: 2 }),
      // avoir accordé
      vendorMessage: text("vendor_message"),
      vendorRespondedAt: timestamp("vendor_responded_at", { withTimezone: true }),
      closedAt: timestamp("closed_at", { withTimezone: true }),
      createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("claims_vendor_idx").on(t.vendorId), index("claims_restaurant_idx").on(t.restaurantId)]);
    vendorPriceTiers = pgTable("vendor_price_tiers", {
      id: uuid("id").primaryKey().defaultRandom(),
      vendorOfferId: uuid("vendor_offer_id").notNull().references(() => vendorOffers.id, { onDelete: "cascade" }),
      minPacks: integer("min_packs").notNull(),
      // à partir de N colis
      packPriceEur: numeric("pack_price_eur", { precision: 10, scale: 2 }).notNull()
    }, (t) => [index("price_tiers_offer_idx").on(t.vendorOfferId), uniqueIndex("price_tiers_unique").on(t.vendorOfferId, t.minPacks)]);
    vendorCustomerPrices = pgTable("vendor_customer_prices", {
      id: uuid("id").primaryKey().defaultRandom(),
      vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      vendorOfferId: uuid("vendor_offer_id").references(() => vendorOffers.id, { onDelete: "cascade" }),
      // null = remise globale sur tout le catalogue
      packPriceEur: numeric("pack_price_eur", { precision: 10, scale: 2 }),
      // prix négocié ferme (si offre)
      discountPct: numeric("discount_pct", { precision: 5, scale: 2 }),
      // ou remise % (offre ou globale)
      validUntil: date("valid_until"),
      note: text("note"),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("customer_prices_vendor_idx").on(t.vendorId), index("customer_prices_restaurant_idx").on(t.restaurantId)]);
    vendorReviews = pgTable("vendor_reviews", {
      id: uuid("id").primaryKey().defaultRandom(),
      vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
      restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
      orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
      rating: integer("rating").notNull(),
      // 1–5
      onTime: boolean("on_time"),
      conform: boolean("conform"),
      // produits conformes (qualité, DLC)
      comment: text("comment"),
      vendorReply: text("vendor_reply"),
      vendorRepliedAt: timestamp("vendor_replied_at", { withTimezone: true }),
      createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("vendor_reviews_vendor_idx").on(t.vendorId), uniqueIndex("vendor_reviews_order_unique").on(t.orderId)]);
    vendorRoutes = pgTable("vendor_routes", {
      id: uuid("id").primaryKey().defaultRandom(),
      vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      // « Tournée Est 93/94 »
      weekday: integer("weekday").notNull(),
      // 0 = dimanche … 6 = samedi
      zones: text("zones").array().default(sql`'{}'::text[]`).notNull(),
      // codes postaux (2 ou 5 chiffres) / villes ; vide = toutes les zones du grossiste
      slots: text("slots").array().default(sql`'{}'::text[]`).notNull(),
      // « 6h–8h », « 8h–10h » ; vide = journée
      cutoffDaysBefore: integer("cutoff_days_before").default(1).notNull(),
      // commande au plus tard J-1…
      cutoffTime: text("cutoff_time").default("14:00").notNull(),
      // … avant 14:00 (heure de Paris)
      capacity: integer("capacity"),
      // nb max de commandes par tournée (null = illimité)
      active: boolean("active").default(true).notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    }, (t) => [index("vendor_routes_vendor_idx").on(t.vendorId, t.weekday)]);
  }
});

// packages/db/src/client.ts
function getDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  return url && url.length > 0 ? url : void 0;
}
function isNeon() {
  return !!getDatabaseUrl();
}
async function getDb() {
  if (_db) return _db;
  const url = getDatabaseUrl();
  if (url) {
    const { Pool, neonConfig } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const ws = (await import("ws")).default;
    neonConfig.webSocketConstructor = ws;
    const pool = new Pool({ connectionString: url });
    _db = drizzle(pool, { schema: schema_exports });
    console.log("[db] Neon connect\xE9");
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const dataDir = process.env.PGLITE_DIR ?? "./.pglite";
    const client = new PGlite(dataDir);
    _db = drizzle(client, { schema: schema_exports });
    console.log(`[db] PGlite local (${dataDir}) \u2014 d\xE9finissez DATABASE_URL pour utiliser Neon`);
  }
  return _db;
}
var _db;
var init_client = __esm({
  "packages/db/src/client.ts"() {
    "use strict";
    init_schema();
    _db = null;
  }
});

// packages/db/src/limits.ts
import { and, eq, sql as sql2 } from "drizzle-orm";
async function measuredMonthlyUse(restaurantId, productId) {
  const db = await getDb();
  const [item] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.productId, productId)));
  if (!item) return 0;
  const day = (n15) => new Date(Date.now() - n15 * 864e5).toISOString();
  const [agg] = await db.select({
    use28: sql2`coalesce(sum(abs(${stockMovements.quantity})) filter (where ${stockMovements.type} in ('consommation','perte') and ${stockMovements.createdAt} >= ${day(28)}), 0)`,
    use90: sql2`coalesce(sum(abs(${stockMovements.quantity})) filter (where ${stockMovements.type} in ('consommation','perte') and ${stockMovements.createdAt} >= ${day(90)}), 0)`
  }).from(stockMovements).where(eq(stockMovements.inventoryItemId, item.id));
  const use28 = Number(agg?.use28 ?? 0);
  const use90 = Number(agg?.use90 ?? 0);
  return Math.max(use28, use90 / 3);
}
async function quantityCeiling(restaurantId, opts) {
  const packQty = opts.packQty > 0 ? opts.packQty : 1;
  const monthlyUse = await measuredMonthlyUse(restaurantId, opts.productId);
  let basis = "historique";
  let monthly = monthlyUse;
  if (monthly <= 0) {
    const critical = Number(opts.criticalLevel ?? 0);
    if (critical > 0) {
      monthly = critical * 30;
      basis = "seuil";
    } else {
      monthly = CATEGORY_MONTHLY_FALLBACK[opts.category ?? ""] ?? 20;
      basis = "categorie";
    }
  }
  const maxQuantity = Math.round(monthly * ORDER_MAX_MONTHS_OF_STOCK * 1e3) / 1e3;
  const maxPacks = Math.max(1, Math.ceil(maxQuantity / packQty));
  return { maxQuantity, maxPacks, monthlyUse, basis };
}
function ceilingMessage(productName, maxPacks, maxQuantity, unit2, months, basis) {
  const reason = basis === "historique" ? `vu votre consommation des derniers mois` : basis === "seuil" ? `vu votre seuil critique (aucune consommation enregistr\xE9e)` : `aucune consommation connue : ordre de grandeur par d\xE9faut`;
  return `${productName} : ${maxPacks} colis maximum en une commande (${Math.round(maxQuantity)} ${unit2}, soit ${months} mois de stock ${reason}). Corrigez la quantit\xE9, ou confirmez explicitement si ce volume est volontaire.`;
}
var ORDER_MAX_MONTHS_OF_STOCK, CATEGORY_MONTHLY_FALLBACK;
var init_limits = __esm({
  "packages/db/src/limits.ts"() {
    "use strict";
    init_client();
    init_schema();
    ORDER_MAX_MONTHS_OF_STOCK = Number(process.env.ORDER_MAX_MONTHS_OF_STOCK ?? 12);
    CATEGORY_MONTHLY_FALLBACK = {
      feculents: 40,
      frais: 40,
      viandes_poissons: 30,
      epicerie: 20,
      boissons: 20,
      emballages: 50
    };
  }
});

// packages/db/src/migrate.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
async function runMigrations() {
  const db = await getDb();
  if (isNeon()) {
    const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
    await migrate(db, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db, { migrationsFolder });
  }
  console.log("[db] migrations appliqu\xE9es");
}
var here, migrationsFolder;
var init_migrate = __esm({
  "packages/db/src/migrate.ts"() {
    "use strict";
    init_client();
    here = path.dirname(fileURLToPath(import.meta.url));
    migrationsFolder = path.resolve(here, "../drizzle");
    if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
      runMigrations().then(() => process.exit(0)).catch((e) => {
        console.error(e);
        process.exit(1);
      });
    }
  }
});

// packages/db/src/data/products.ts
function findReferenceProduct(query) {
  const q2 = normalize(query);
  if (!q2) return void 0;
  let exact = REFERENCE_PRODUCTS.find((p) => normalize(p.name) === q2 || p.aliases.some((a) => normalize(a) === q2));
  if (exact) return exact;
  exact = REFERENCE_PRODUCTS.find((p) => normalize(p.name).includes(q2) || p.aliases.some((a) => normalize(a).includes(q2)));
  if (exact) return exact;
  return REFERENCE_PRODUCTS.find((p) => q2.includes(normalize(p.name)) || p.aliases.some((a) => a.length > 3 && q2.includes(normalize(a))));
}
var P, REFERENCE_PRODUCTS, normalize, CATEGORY_LABELS;
var init_products = __esm({
  "packages/db/src/data/products.ts"() {
    "use strict";
    P = (name, category, baseUnit, aliases, packs, origin, shelfLifeDays, tags = [], season) => ({ name, category, baseUnit, aliases, packs, origin, shelfLifeDays, tags, season });
    REFERENCE_PRODUCTS = [
      // =========================================================
      // 🌾 FÉCULENTS (35)
      // =========================================================
      P("Riz parfum\xE9", "feculents", "kg", ["riz jasmin", "riz tha\xEF", "riz long parfum\xE9"], ["Sac 5 kg", "Sac 20 kg", "Sac 25 kg"], "Tha\xEFlande", 365, ["riz gras", "poulet brais\xE9"]),
      P("Riz bris\xE9", "feculents", "kg", ["riz cass\xE9", "riz thi\xE9b", "brisure de riz", "riz s\xE9n\xE9galais"], ["Sac 5 kg", "Sac 25 kg"], "S\xE9n\xE9gal / Tha\xEFlande", 365, ["thi\xE9boudienne", "maf\xE9", "yassa"]),
      P("Riz \xE9tuv\xE9", "feculents", "kg", ["riz parboiled", "riz jaune"], ["Sac 5 kg", "Sac 25 kg"], "Inde", 365),
      P("Riz basmati", "feculents", "kg", [], ["Sac 5 kg", "Sac 20 kg"], "Inde / Pakistan", 365),
      P("Riz local Kovi\xE9", "feculents", "kg", ["riz de Kovi\xE9", "riz du Togo"], ["Sac 5 kg", "Sac 25 kg"], "Togo", 365),
      P("Riz de la vall\xE9e", "feculents", "kg", ["riz de Richard-Toll", "riz de Podor"], ["Sac 25 kg"], "S\xE9n\xE9gal", 365),
      P("Atti\xE9k\xE9", "feculents", "kg", ["attieke", "acheke", "semoule de manioc ferment\xE9e"], ["Sachet 500 g", "Sachet 1 kg", "Carton 10 kg"], "C\xF4te d'Ivoire", 10, ["atti\xE9k\xE9 poisson", "garba"]),
      P("Atti\xE9k\xE9 d\xE9shydrat\xE9", "feculents", "kg", ["atti\xE9k\xE9 sec", "atti\xE9k\xE9 longue conservation"], ["Sachet 500 g", "Carton 12 \xD7 500 g"], "C\xF4te d'Ivoire", 365, ["atti\xE9k\xE9 poisson"]),
      P("Garba (atti\xE9k\xE9 grain moyen)", "feculents", "kg", ["atti\xE9k\xE9 garba", "atti\xE9k\xE9 abidjan"], ["Sachet 1 kg", "Carton 10 kg"], "C\xF4te d'Ivoire", 10, ["garba"]),
      P("Placali", "feculents", "kg", ["p\xE2te de manioc ferment\xE9e"], ["Sachet 1 kg"], "C\xF4te d'Ivoire", 5, ["sauce graine"]),
      P("Manioc frais", "feculents", "kg", ["cassava", "yuca", "racine de manioc"], ["Carton 10 kg", "Carton 18 kg"], "Costa Rica / Cameroun", 7, ["foutou", "rago\xFBt"]),
      P("Manioc congel\xE9", "feculents", "kg", ["manioc pel\xE9 surgel\xE9", "yuca congel\xE9e"], ["Sachet 1 kg", "Carton 10 kg"], "Costa Rica", 365),
      P("B\xE2ton de manioc", "feculents", "piece", ["bobolo", "chikwangue", "miondo", "kwanga", "mangbele"], ["Pi\xE8ce", "Carton 20 pi\xE8ces"], "Cameroun / RDC", 7, ["ndol\xE9", "poisson brais\xE9"]),
      P("Gari", "feculents", "kg", ["garri", "farine de manioc grill\xE9e", "tapioca sec"], ["Sachet 1 kg", "Sac 5 kg", "Sac 25 kg"], "B\xE9nin / Nigeria", 365, ["eba", "gari foto"]),
      P("Farine de foufou (manioc)", "feculents", "kg", ["fufu", "foufou", "farine de manioc", "foufou de manioc"], ["Sachet 1 kg", "Sac 5 kg", "Sac 25 kg"], "Cameroun / Ghana", 365, ["foufou"]),
      P("Farine de foufou (igname)", "feculents", "kg", ["pounded yam flour", "poundo", "amala blanche"], ["Sachet 1 kg", "Sac 4 kg"], "Nigeria", 365, ["pounded yam"]),
      P("Farine d'igname (amala)", "feculents", "kg", ["elubo", "amala", "farine d'igname noire"], ["Sachet 1 kg", "Sac 4 kg"], "Nigeria", 365, ["amala"]),
      P("Semoule de ma\xEFs", "feculents", "kg", ["farine de ma\xEFs", "ma\xEFs moulu", "t\xF4", "ugali", "sadza"], ["Sac 1 kg", "Sac 5 kg", "Sac 25 kg"], "France / Afrique", 365, ["t\xF4", "ugali", "couscous de ma\xEFs"]),
      P("Farine de ma\xEFs ferment\xE9e (maw\xE8)", "feculents", "kg", ["mawe", "ogi", "akassa"], ["Sachet 1 kg"], "B\xE9nin", 90, ["akassa"]),
      P("Fonio", "feculents", "kg", ["fonio pr\xE9cuit", "acha"], ["Sachet 500 g", "Sachet 1 kg", "Sac 5 kg"], "Guin\xE9e / Mali", 365, ["fonio", "salade de fonio"]),
      P("Mil", "feculents", "kg", ["millet", "petit mil", "souna", "sanio"], ["Sac 5 kg", "Sac 25 kg"], "S\xE9n\xE9gal / Mali", 365, ["thiakry", "lakh", "couscous de mil"]),
      P("Couscous de mil (thi\xE9r\xE9)", "feculents", "kg", ["thi\xE9r\xE9", "thiere", "araw", "couscous s\xE9n\xE9galais"], ["Sachet 500 g", "Sachet 1 kg"], "S\xE9n\xE9gal", 180, ["thi\xE9r\xE9", "bassi salt\xE9"]),
      P("Thiakry (araw)", "feculents", "kg", ["thiakry", "thiacry", "d\xE9gu\xE9", "granul\xE9s de mil"], ["Sachet 500 g", "Sachet 1 kg"], "S\xE9n\xE9gal", 180, ["thiakry"]),
      P("Sorgho", "feculents", "kg", ["gros mil", "sorgho rouge"], ["Sac 5 kg", "Sac 25 kg"], "Mali / Burkina", 365),
      P("Farine de bl\xE9 T55", "feculents", "kg", ["farine", "farine de bl\xE9"], ["Sac 1 kg", "Sac 10 kg", "Sac 25 kg"], "France", 270, ["beignets", "pastels", "fataya"]),
      P("Pain (baguette)", "feculents", "piece", ["baguette", "pain", "tapalapa"], ["Pi\xE8ce"], "France", 1, ["sandwich", "ndamb\xE9"]),
      P("Plantain", "feculents", "kg", ["banane plantain", "plantain vert", "plantain m\xFBr", "alloco", "dodo", "kelewele"], ["Carton 18 kg", "Carton 20 kg", "Carton 22 kg"], "C\xF4te d'Ivoire / \xC9quateur / Cameroun", 7, ["alloco", "dodo", "kelewele", "foutou banane"]),
      P("Plantain m\xFBr surgel\xE9 (tranches)", "feculents", "kg", ["alloco surgel\xE9", "plantain frit surgel\xE9"], ["Sachet 1 kg", "Carton 10 kg"], "\xC9quateur", 365, ["alloco"]),
      P("Igname", "feculents", "kg", ["yam", "igname blanche", "igname puna", "igname kponan", "igname florido"], ["Pi\xE8ce 2-4 kg", "Carton 18 kg", "Carton 20 kg"], "Ghana / C\xF4te d'Ivoire", 21, ["foutou igname", "igname frite", "pounded yam"]),
      P("Patate douce", "feculents", "kg", ["sweet potato", "patate douce blanche", "patate douce orange"], ["Carton 6 kg", "Carton 10 kg"], "S\xE9n\xE9gal / Espagne", 21, ["maf\xE9", "frites de patate"]),
      P("Taro", "feculents", "kg", ["macabo", "mad\xE8re", "cocoyam", "dasheen", "coco-igname"], ["Carton 10 kg"], "Cameroun / Costa Rica", 14, ["taro sauce jaune", "macabo"]),
      P("Pomme de terre", "feculents", "kg", ["patate"], ["Sac 5 kg", "Sac 10 kg", "Sac 25 kg"], "France", 30, ["frites", "yassa"]),
      P("Haricots blancs (ni\xE9b\xE9)", "feculents", "kg", ["ni\xE9b\xE9", "niebe", "cowpea", "haricot \xE0 \u0153il noir", "black-eyed peas"], ["Sachet 1 kg", "Sac 5 kg", "Sac 25 kg"], "Niger / Nigeria", 365, ["ndamb\xE9", "akara", "moin moin", "red red"]),
      P("Haricots rouges", "feculents", "kg", ["haricot rouge", "kidney beans"], ["Sachet 1 kg", "Sac 5 kg", "Sac 25 kg"], "Cameroun / Canada", 365, ["haricots sauce", "red red"]),
      P("Lentilles", "feculents", "kg", ["lentilles vertes", "lentilles corail"], ["Sachet 1 kg", "Sac 5 kg"], "France / Canada", 365),
      // =========================================================
      // 🥬 PRODUITS FRAIS (70)
      // =========================================================
      // Légumes de base
      P("Tomate", "frais", "kg", ["tomate ronde", "tomate grappe"], ["Plateau 6 kg", "Caisse 10 kg"], "France / Maroc / Espagne", 7, ["sauce tomate", "thi\xE9b"], [6, 7, 8, 9]),
      P("Tomate allong\xE9e (roma)", "frais", "kg", ["tomate roma", "tomate olivette"], ["Plateau 6 kg"], "Maroc / Espagne", 7),
      P("Oignon jaune", "frais", "kg", ["oignon", "oignon paille"], ["Sac 5 kg", "Sac 10 kg", "Sac 25 kg"], "France / Espagne", 30, ["yassa", "sauce oignon"]),
      P("Oignon rouge", "frais", "kg", ["oignon violet"], ["Sac 5 kg", "Sac 10 kg"], "France / \xC9gypte", 30),
      P("Oignon vert (cive)", "frais", "botte", ["cive", "ciboule", "oignon nouveau", "spring onion", "poireau africain"], ["Botte", "Carton 24 bottes"], "France / Espagne", 5, ["sauce", "poisson brais\xE9"]),
      P("\xC9chalote", "frais", "kg", [], ["Sac 5 kg"], "France", 30),
      P("Ail frais", "frais", "kg", ["ail", "ail blanc", "ail violet"], ["Filet 1 kg", "Filet 5 kg", "Carton 10 kg"], "Espagne / Chine", 60, ["marinade"]),
      P("Gingembre frais", "frais", "kg", ["gingembre", "ginger", "gnamakou", "tangawis"], ["Carton 5 kg", "Carton 13 kg"], "Nigeria / Chine / P\xE9rou", 21, ["jus de gingembre", "marinade"]),
      P("Poivron vert", "frais", "kg", ["poivron"], ["Carton 5 kg"], "Espagne / Maroc", 10, ["sauce", "brochettes"]),
      P("Poivron rouge", "frais", "kg", [], ["Carton 5 kg"], "Espagne / Maroc", 10),
      P("Carotte", "frais", "kg", [], ["Sac 5 kg", "Sac 10 kg"], "France", 21, ["thi\xE9b", "maf\xE9"]),
      P("Chou blanc", "frais", "kg", ["chou", "chou pomm\xE9"], ["Pi\xE8ce 2 kg", "Caisse 10 kg"], "France", 14, ["thi\xE9b", "salade"]),
      P("Chou vert (kale / feuilles)", "frais", "kg", ["sukuma wiki", "chou fris\xE9", "kale"], ["Caisse 5 kg"], "France / Portugal", 5, ["sukuma wiki"]),
      P("Navet", "frais", "kg", [], ["Sac 5 kg"], "France", 14, ["thi\xE9b"]),
      P("Aubergine violette", "frais", "kg", ["aubergine"], ["Carton 5 kg"], "Espagne / France", 7, ["thi\xE9b", "sauce"]),
      P("Aubergine africaine (djakatou)", "frais", "kg", ["djakatou", "diakhatou", "garden egg", "aubergine am\xE8re", "ntorewa", "gboma (fruit)"], ["Carton 5 kg", "Carton 10 kg"], "C\xF4te d'Ivoire / Ghana / Cameroun", 7, ["thi\xE9b", "sauce aubergine", "kedjenou"]),
      P("Aubergine blanche / verte", "frais", "kg", ["aubergine ivoirienne", "n'drowa", "kotobo"], ["Carton 5 kg"], "C\xF4te d'Ivoire", 7, ["sauce n'drowa"]),
      P("Gombo frais", "frais", "kg", ["gombo", "okra", "lady finger", "kandia", "gumbo"], ["Carton 4 kg", "Carton 5 kg"], "S\xE9n\xE9gal / Kenya / Honduras", 5, ["soupou kandia", "sauce gombo", "okro soup"], [5, 6, 7, 8, 9, 10]),
      P("Gombo surgel\xE9", "frais", "kg", ["okra surgel\xE9", "gombo coup\xE9 surgel\xE9"], ["Sachet 1 kg", "Carton 10 kg"], "\xC9gypte", 365, ["sauce gombo"]),
      P("Courgette", "frais", "kg", [], ["Carton 5 kg"], "France / Espagne", 7),
      P("Concombre", "frais", "kg", [], ["Carton 5 kg"], "France / Espagne", 7, ["salade"]),
      P("Laitue / salade", "frais", "piece", ["salade verte", "laitue", "batavia"], ["Pi\xE8ce", "Caisse 12"], "France", 4, ["accompagnement"]),
      P("Haricot vert", "frais", "kg", ["haricots verts"], ["Carton 4 kg"], "Kenya / S\xE9n\xE9gal / Maroc", 5),
      P("Courge / potiron", "frais", "kg", ["citrouille", "potiron", "giraumon", "pumpkin"], ["Pi\xE8ce", "Caisse 10 kg"], "France", 30, ["soupe", "sauce"]),
      P("Chou-fleur", "frais", "piece", [], ["Pi\xE8ce"], "France", 7),
      P("Champignon de Paris", "frais", "kg", [], ["Carton 3 kg"], "France", 5),
      P("Ma\xEFs frais (\xE9pi)", "frais", "piece", ["\xE9pi de ma\xEFs", "ma\xEFs doux"], ["Carton 12", "Carton 24"], "France / Espagne", 5, ["ma\xEFs brais\xE9"], [7, 8, 9]),
      P("Chayotte (christophine)", "frais", "kg", ["christophine", "chouchou", "chayote"], ["Carton 5 kg"], "Costa Rica", 14),
      // Piments
      P("Piment frais fort (habanero / antillais)", "frais", "kg", ["piment antillais", "piment habanero", "piment lampion", "scotch bonnet", "piment cabri", "kani", "ata rodo"], ["Barquette 500 g", "Barquette 1 kg", "Carton 3 kg"], "Espagne / Ouganda / Cameroun", 10, ["piment", "sauce piment"]),
      P("Piment vert long", "frais", "kg", ["piment doux long", "piment vert", "piment corne"], ["Carton 3 kg", "Carton 5 kg"], "Espagne / Maroc / Turquie", 10),
      P("Piment oiseau", "frais", "kg", ["piment de Cayenne frais", "pili-pili", "piri piri", "petit piment"], ["Barquette 250 g", "Barquette 1 kg"], "Tha\xEFlande / Kenya", 10),
      P("Piment jaune (kpakpo shito)", "frais", "kg", ["kpakpo shito", "piment ghan\xE9en", "piment vert rond"], ["Barquette 1 kg"], "Ghana / Nigeria", 7, ["shito", "sauce"]),
      // Feuilles
      P("Feuilles de manioc", "frais", "kg", ["saka-saka", "saka saka", "pondu", "mpondu", "feuilles de manioc pil\xE9es", "ravitoto"], ["Sachet 500 g", "Sachet 1 kg", "Carton 10 kg"], "Cameroun / RDC / Congo", 3, ["saka-saka", "pondu", "ravitoto"]),
      P("Feuilles de manioc surgel\xE9es", "frais", "kg", ["saka-saka surgel\xE9", "pondu surgel\xE9", "feuilles de manioc pil\xE9es surgel\xE9es"], ["Sachet 500 g", "Sachet 1 kg"], "Cameroun / Vietnam", 365, ["saka-saka", "pondu"]),
      P("Ndol\xE9 (feuilles)", "frais", "kg", ["ndole", "feuilles de ndol\xE9", "vernonia", "bitterleaf", "feuilles am\xE8res"], ["Sachet 500 g", "Sachet 1 kg"], "Cameroun", 3, ["ndol\xE9"]),
      P("Ndol\xE9 surgel\xE9", "frais", "kg", ["ndol\xE9 lav\xE9 surgel\xE9", "bitterleaf frozen", "ndol\xE9 pr\xE9cuit"], ["Sachet 500 g", "Sachet 1 kg"], "Cameroun", 365, ["ndol\xE9"]),
      P("Feuilles de patate douce", "frais", "botte", ["fasa", "feuilles de patate", "matembele", "boroboro"], ["Botte", "Sachet 500 g"], "Cameroun / S\xE9n\xE9gal", 3, ["sauce feuilles", "matembele"]),
      P("Feuilles de baobab (lalo)", "frais", "kg", ["lalo", "poudre de feuilles de baobab", "kuka"], ["Sachet 200 g", "Sachet 500 g"], "S\xE9n\xE9gal / Mali", 365, ["lalo", "mbourake"]),
      P("Feuilles de gombo s\xE9ch\xE9es", "frais", "kg", ["feuilles de gombo", "kandia s\xE9ch\xE9"], ["Sachet 200 g"], "Mali / Burkina", 365),
      P("Oseille de Guin\xE9e (bissap feuilles)", "frais", "kg", ["bissap vert", "feuilles de bissap", "oseille africaine", "sorrel leaves"], ["Sachet 500 g"], "S\xE9n\xE9gal", 3, ["sauce bissap", "thi\xE9b"]),
      P("\xC9pinard", "frais", "kg", ["\xE9pinards frais", "pousses d'\xE9pinard"], ["Carton 4 kg"], "France / Espagne", 4, ["sauce feuilles", "efo"]),
      P("\xC9pinard surgel\xE9", "frais", "kg", ["\xE9pinards hach\xE9s surgel\xE9s"], ["Sachet 1 kg", "Sachet 2,5 kg"], "France", 365, ["sauce feuilles", "efo riro"]),
      P("Amarante (folon / t\xE9t\xE9)", "frais", "botte", ["folon", "t\xE9t\xE9", "efo tete", "callaloo", "bledo", "amarante"], ["Botte", "Carton 12 bottes"], "France / Cameroun", 3, ["efo riro", "sauce feuilles"]),
      P("Eru / okok (gnetum)", "frais", "kg", ["eru", "okok", "okazi", "afang", "koko", "gnetum", "fumbwa"], ["Sachet 200 g", "Sachet 500 g", "Sachet 1 kg"], "Cameroun / Nigeria", 3, ["eru", "okok", "afang soup", "fumbwa"]),
      P("Eru s\xE9ch\xE9", "frais", "kg", ["okazi s\xE9ch\xE9", "afang s\xE9ch\xE9", "gnetum s\xE9ch\xE9"], ["Sachet 100 g", "Sachet 250 g"], "Cameroun / Nigeria", 365, ["eru"]),
      P("Feuilles de taro (kontomire)", "frais", "kg", ["kontomire", "feuilles de macabo", "feuilles de taro"], ["Sachet 500 g"], "Ghana / Cameroun", 3, ["palava sauce", "kontomire stew"]),
      P("Feuilles d'ugu (courge cannel\xE9e)", "frais", "botte", ["ugu", "ugwu", "fluted pumpkin leaves"], ["Botte"], "Nigeria", 3, ["egusi soup", "edikang ikong"]),
      P("Waterleaf", "frais", "botte", ["gbure", "talinum", "bologi"], ["Botte"], "Nigeria / Cameroun", 2, ["edikang ikong"]),
      P("Feuilles de moringa", "frais", "kg", ["moringa", "n\xE9b\xE9day", "nebeday"], ["Sachet 200 g", "Sachet 500 g"], "S\xE9n\xE9gal / Mali", 3, ["mboum"]),
      P("Basilic africain (djindja / nchanwu)", "frais", "botte", ["nchanwu", "scent leaf", "efirin", "basilic tropical", "messep"], ["Botte"], "Nigeria / Cameroun", 3, ["pepper soup", "poisson brais\xE9"]),
      P("Persil plat", "frais", "botte", ["persil"], ["Botte", "Carton 24 bottes"], "France / Espagne / Maroc", 5, ["farce", "rof", "thi\xE9b"]),
      P("Coriandre fra\xEEche", "frais", "botte", ["coriandre"], ["Botte"], "France / Maroc", 5),
      P("Menthe fra\xEEche", "frais", "botte", ["menthe", "nana"], ["Botte", "Carton 24 bottes"], "Maroc / Espagne", 5, ["th\xE9", "jus de bissap"]),
      P("C\xE9leri branche", "frais", "botte", ["c\xE9leri"], ["Botte", "Pied"], "France / Espagne", 7, ["poisson brais\xE9", "marinade"]),
      P("Poireau", "frais", "kg", [], ["Botte", "Carton 5 kg"], "France", 10, ["marinade", "poisson"]),
      // Fruits
      P("Citron vert", "frais", "kg", ["lime", "citron vert", "limon"], ["Carton 4 kg", "Carton 4,5 kg"], "Br\xE9sil / Mexique", 14, ["yassa", "marinade", "jus"]),
      P("Citron jaune", "frais", "kg", ["citron"], ["Carton 5 kg"], "Espagne", 21),
      P("Mangue", "frais", "kg", ["mangue Kent", "mangue Keitt", "mangue Am\xE9lie"], ["Carton 4 kg", "Carton 6 kg"], "C\xF4te d'Ivoire / S\xE9n\xE9gal / Mali / Br\xE9sil", 7, ["dessert", "jus"], [4, 5, 6, 7]),
      P("Ananas", "frais", "piece", ["ananas pain de sucre", "ananas Victoria", "ananas Cayenne"], ["Pi\xE8ce", "Carton 6", "Carton 12"], "C\xF4te d'Ivoire / B\xE9nin / Costa Rica", 7, ["dessert", "jus"]),
      P("Papaye", "frais", "kg", ["papaye solo", "papaye formosa"], ["Carton 4 kg", "Carton 10 kg"], "C\xF4te d'Ivoire / Br\xE9sil", 7, ["dessert"]),
      P("Banane douce", "frais", "kg", ["banane", "banane dessert", "banane Cavendish"], ["Carton 18 kg"], "C\xF4te d'Ivoire / Cameroun / \xC9quateur", 7, ["dessert"]),
      P("Banane douce naine (figue)", "frais", "kg", ["banane figue", "banane naine", "frayssinette", "banane sucr\xE9e"], ["Carton 6 kg"], "Cameroun", 5),
      P("Noix de coco", "frais", "piece", ["coco", "noix de coco s\xE8che"], ["Pi\xE8ce", "Sac 20"], "C\xF4te d'Ivoire / R\xE9publique dominicaine", 30, ["riz au coco", "jus"]),
      P("Avocat", "frais", "piece", ["avocat Hass", "avocat Fuerte"], ["Carton 12", "Carton 16"], "Kenya / P\xE9rou / Espagne", 7, ["salade", "accompagnement"]),
      P("Past\xE8que", "frais", "kg", ["melon d'eau"], ["Pi\xE8ce"], "Espagne / S\xE9n\xE9gal", 14, ["jus", "dessert"], [6, 7, 8]),
      P("Orange \xE0 jus", "frais", "kg", ["orange"], ["Sac 10 kg"], "Espagne / Maroc", 21, ["jus"]),
      P("Goyave", "frais", "kg", [], ["Carton 4 kg"], "Br\xE9sil / Cameroun", 5, ["jus"]),
      P("Fruit de la passion (maracuja)", "frais", "kg", ["maracuja", "grenadille"], ["Carton 2 kg"], "Colombie / Kenya", 14, ["jus"]),
      P("Corossol", "frais", "kg", ["soursop", "graviola"], ["Carton 4 kg"], "C\xF4te d'Ivoire / Antilles", 4, ["jus"]),
      P("Tamarin frais (gousses)", "frais", "kg", ["dakhar", "tamarin en gousses"], ["Carton 5 kg"], "Tha\xEFlande / S\xE9n\xE9gal", 60, ["jus de tamarin"]),
      P("Datte", "frais", "kg", ["dattes Deglet Nour", "dattes"], ["Carton 5 kg"], "Tunisie / Alg\xE9rie", 180, ["ramadan"]),
      P("\u0152ufs", "frais", "piece", ["oeufs", "\u0153uf"], ["Plateau 30", "Carton 180", "Carton 360"], "France", 28, ["omelette", "sandwich", "garba"]),
      // =========================================================
      // 🥩 VIANDES & POISSONS (55)
      // =========================================================
      // Volailles
      P("Poulet entier PAC", "viandes_poissons", "kg", ["poulet", "poulet entier", "poulet pr\xEAt \xE0 cuire", "poulet PAC"], ["Carton 10 kg", "Carton 12 kg (10 \xD7 1,2 kg)"], "France / Br\xE9sil", 4, ["poulet brais\xE9", "yassa", "kedjenou"]),
      P("Poulet fermier / bicyclette", "viandes_poissons", "kg", ["poulet bicyclette", "poulet dur", "poulet fermier", "coq"], ["Pi\xE8ce 1,5-2 kg", "Carton 10 kg"], "France", 4, ["kedjenou", "poulet DG", "poulet brais\xE9"]),
      P("Cuisses de poulet", "viandes_poissons", "kg", ["cuisse de poulet", "hauts de cuisse", "chicken thighs"], ["Carton 5 kg", "Carton 10 kg"], "France / Pologne", 4, ["yassa", "poulet brais\xE9", "chawarma"]),
      P("Pilons de poulet", "viandes_poissons", "kg", ["pilon", "drumsticks"], ["Carton 5 kg", "Carton 10 kg"], "France / Pologne", 4),
      P("Ailes de poulet", "viandes_poissons", "kg", ["ailes", "ailerons", "chicken wings"], ["Carton 5 kg", "Carton 10 kg"], "France / Br\xE9sil", 4, ["ailes brais\xE9es", "ap\xE9ritif"]),
      P("Blanc de poulet", "viandes_poissons", "kg", ["filet de poulet", "escalope de poulet", "chicken breast"], ["Carton 5 kg"], "France", 4, ["brochettes", "sandwich"]),
      P("G\xE9siers de poulet", "viandes_poissons", "kg", ["g\xE9siers", "gizzard"], ["Sachet 1 kg", "Carton 5 kg"], "France / Br\xE9sil", 3, ["g\xE9siers saut\xE9s", "dibi"]),
      P("Pintade", "viandes_poissons", "kg", ["pintade fermi\xE8re"], ["Pi\xE8ce 1,2 kg", "Carton 10 kg"], "France", 4, ["pintade brais\xE9e", "kedjenou"]),
      P("Dinde (cuisse / aile)", "viandes_poissons", "kg", ["dinde", "ailes de dinde", "cuisse de dinde", "turkey"], ["Carton 5 kg", "Carton 10 kg"], "France / Pologne", 4, ["dinde brais\xE9e"]),
      P("Canard", "viandes_poissons", "kg", ["canard entier"], ["Pi\xE8ce 2 kg"], "France", 4),
      // Viandes
      P("B\u0153uf \xE0 braiser (paleron / macreuse)", "viandes_poissons", "kg", ["b\u0153uf", "boeuf", "viande de b\u0153uf", "b\u0153uf \xE0 rago\xFBt", "paleron", "macreuse", "g\xEEte"], ["Colis 5 kg", "Colis 10 kg"], "France / Irlande", 4, ["maf\xE9", "sauce arachide", "rago\xFBt"]),
      P("B\u0153uf \xE0 bouillir (jarret / plat de c\xF4te)", "viandes_poissons", "kg", ["jarret de b\u0153uf", "plat de c\xF4te", "b\u0153uf bouilli", "b\u0153uf avec os", "viande avec os"], ["Colis 5 kg"], "France", 4, ["soupou kandia", "pepper soup", "sauce gombo"]),
      P("B\u0153uf hach\xE9", "viandes_poissons", "kg", ["viande hach\xE9e", "steak hach\xE9"], ["Colis 5 kg", "Barquette 1 kg"], "France", 2, ["pastels", "fataya", "boulettes"]),
      P("Bavette / faux-filet", "viandes_poissons", "kg", ["bavette", "faux-filet", "steak", "entrec\xF4te"], ["Colis 5 kg"], "France / Irlande", 4, ["dibi", "brochettes", "suya"]),
      P("Queue de b\u0153uf", "viandes_poissons", "kg", ["oxtail", "queue de boeuf"], ["Colis 5 kg"], "France / Irlande", 4, ["oxtail stew", "pepper soup"]),
      P("Tripes de b\u0153uf", "viandes_poissons", "kg", ["tripes", "gras-double", "shaki", "towel"], ["Colis 5 kg"], "France", 3, ["sauce tripes", "assorted meat"]),
      P("Pieds de b\u0153uf", "viandes_poissons", "kg", ["pied de b\u0153uf", "cow foot", "cow leg"], ["Colis 5 kg"], "France", 3, ["sauce pieds de b\u0153uf", "pepper soup"]),
      P("Peau de b\u0153uf (kanda / ponmo)", "viandes_poissons", "kg", ["kanda", "ponmo", "kpomo", "couenne de b\u0153uf", "cow skin"], ["Sachet 1 kg", "Colis 5 kg"], "France / Nigeria", 3, ["egusi", "assorted meat"]),
      P("Foie de b\u0153uf", "viandes_poissons", "kg", ["foie"], ["Colis 5 kg"], "France", 2, ["foie saut\xE9"]),
      P("Mouton (\xE9paule / gigot)", "viandes_poissons", "kg", ["mouton", "agneau", "\xE9paule de mouton", "gigot", "viande de mouton"], ["Colis 5 kg", "Carcasse"], "France / Irlande / Nouvelle-Z\xE9lande", 4, ["dibi", "m\xE9choui", "maf\xE9 mouton", "thiou"]),
      P("C\xF4telettes de mouton", "viandes_poissons", "kg", ["c\xF4tes d'agneau", "c\xF4telettes d'agneau"], ["Colis 5 kg"], "France / Irlande", 4, ["dibi", "grillades"]),
      P("Ch\xE8vre", "viandes_poissons", "kg", ["viande de ch\xE8vre", "cabri", "goat meat", "chevreau"], ["Colis 5 kg"], "France / Espagne", 4, ["goat pepper soup", "asun", "colombo"]),
      P("Porc (\xE9chine / poitrine)", "viandes_poissons", "kg", ["porc", "\xE9chine de porc", "poitrine de porc", "travers"], ["Colis 5 kg"], "France", 4, ["porc brais\xE9", "porc au four"]),
      P("Pieds de porc", "viandes_poissons", "kg", ["pied de porc", "pig feet"], ["Colis 5 kg"], "France", 3),
      P("Saucisse / merguez", "viandes_poissons", "kg", ["merguez", "saucisse", "chipolata"], ["Colis 5 kg"], "France", 5, ["grillades"]),
      P("Escargots (achatines)", "viandes_poissons", "kg", ["escargot africain", "achatine", "congo meat", "nyama"], ["Sachet 1 kg surgel\xE9"], "Ghana / C\xF4te d'Ivoire", 365, ["escargots sauce"]),
      // Poissons frais
      P("Capitaine (thiof / m\xE9rou)", "viandes_poissons", "kg", ["thiof", "m\xE9rou", "capitaine", "grouper"], ["Carton 10 kg", "Pi\xE8ce 2-5 kg"], "S\xE9n\xE9gal / Mauritanie", 2, ["thi\xE9boudienne", "poisson brais\xE9"]),
      P("Tilapia entier", "viandes_poissons", "kg", ["tilapia", "carpe", "carpe tilapia", "carpe rouge"], ["Carton 10 kg (400-600 g)", "Carton 10 kg (600-800 g)"], "Chine / Vietnam / C\xF4te d'Ivoire", 2, ["atti\xE9k\xE9 poisson", "poisson brais\xE9"]),
      P("Tilapia surgel\xE9", "viandes_poissons", "kg", ["tilapia congel\xE9", "carpe congel\xE9e"], ["Carton 10 kg"], "Chine / Vietnam", 365, ["poisson brais\xE9"]),
      P("Daurade royale / grise", "viandes_poissons", "kg", ["daurade", "dorade", "sar"], ["Carton 5 kg", "Carton 10 kg"], "S\xE9n\xE9gal / Gr\xE8ce / Turquie", 2, ["poisson brais\xE9", "thi\xE9b"]),
      P("Bar / loup", "viandes_poissons", "kg", ["bar", "loup de mer"], ["Carton 5 kg"], "Gr\xE8ce / Turquie / France", 2, ["poisson brais\xE9"]),
      P("Maquereau", "viandes_poissons", "kg", ["maquereau frais", "maquereau congel\xE9", "titus"], ["Carton 10 kg", "Carton 20 kg"], "Atlantique Nord / Mauritanie", 2, ["poisson brais\xE9", "maquereau grill\xE9"]),
      P("Sardinelle / yaboye", "viandes_poissons", "kg", ["yaboye", "sardinelle", "sardine", "kobo"], ["Carton 10 kg"], "S\xE9n\xE9gal / Mauritanie", 2, ["poisson frit"]),
      P("Chinchard (dia\xEF)", "viandes_poissons", "kg", ["dia\xEF", "chinchard", "horse mackerel", "bar"], ["Carton 10 kg", "Carton 20 kg"], "Mauritanie / Namibie", 2, ["poisson brais\xE9"]),
      P("Machoiron (kong)", "viandes_poissons", "kg", ["kong", "machoiron", "m\xE2choiron", "silure de mer", "catfish de mer"], ["Carton 10 kg"], "S\xE9n\xE9gal / C\xF4te d'Ivoire", 2, ["sauce kong", "kedjenou de poisson"]),
      P("Silure (poisson-chat)", "viandes_poissons", "kg", ["silure", "poisson-chat", "catfish", "clarias", "poisson de fleuve"], ["Carton 10 kg", "Pi\xE8ce 1-2 kg"], "Vietnam / France / Nigeria", 2, ["catfish pepper soup", "sauce silure"]),
      P("Sole", "viandes_poissons", "kg", ["sole", "sole tropicale", "thiof sole"], ["Carton 5 kg"], "S\xE9n\xE9gal / Mauritanie", 2, ["poisson frit"]),
      P("Barracuda (s\xE9deu)", "viandes_poissons", "kg", ["s\xE9deu", "seudeu", "brochet de mer", "barracuda"], ["Carton 10 kg"], "S\xE9n\xE9gal", 2, ["poisson brais\xE9"]),
      P("Rouget", "viandes_poissons", "kg", ["rouget barbet"], ["Carton 5 kg"], "S\xE9n\xE9gal / Maroc", 2, ["poisson frit"]),
      P("Crevettes fra\xEEches / surgel\xE9es", "viandes_poissons", "kg", ["crevettes", "gambas", "crevettes d\xE9cortiqu\xE9es", "crevettes roses"], ["Carton 2 kg", "Carton 10 kg"], "Madagascar / \xC9quateur / Vietnam", 365, ["ndol\xE9 crevettes", "riz aux crevettes"]),
      P("Calamar", "viandes_poissons", "kg", ["calamars", "encornet", "seiche"], ["Carton 10 kg"], "S\xE9n\xE9gal / Inde", 365),
      P("Crabe", "viandes_poissons", "kg", ["crabe de mangrove", "crabe bleu", "tourteau"], ["Carton 5 kg"], "S\xE9n\xE9gal / Madagascar", 2, ["sauce crabe", "gombo au crabe"]),
      P("Langouste", "viandes_poissons", "kg", ["langouste rose", "langouste verte"], ["Pi\xE8ce", "Carton 5 kg"], "S\xE9n\xE9gal / Mauritanie / Cuba", 2, ["langouste grill\xE9e"]),
      // Poissons transformés (séchés / fumés / salés)
      P("Poisson fum\xE9 (guedj / kong fum\xE9)", "viandes_poissons", "kg", ["guedj", "gu\xE9dj", "kong fum\xE9", "poisson s\xE9ch\xE9 fum\xE9", "kethiakh", "poisson fum\xE9"], ["Sachet 500 g", "Carton 5 kg", "Carton 10 kg"], "S\xE9n\xE9gal / Ghana / C\xF4te d'Ivoire", 30, ["thi\xE9b", "sauce feuilles", "sauce gombo"]),
      P("Maquereau fum\xE9", "viandes_poissons", "kg", ["titus fum\xE9", "maquereau s\xE9ch\xE9", "smoked mackerel"], ["Carton 5 kg"], "Ghana / Nigeria / \xC9cosse", 30, ["sauce", "okro soup"]),
      P("Silure fum\xE9 (catfish)", "viandes_poissons", "kg", ["catfish fum\xE9", "poisson-chat fum\xE9", "eja", "smoked catfish"], ["Sachet 500 g", "Carton 5 kg"], "Nigeria / Cameroun / Vietnam", 60, ["egusi", "ogbono", "banga"]),
      P("Poisson s\xE9ch\xE9 sal\xE9 (kethiakh / stockfish)", "viandes_poissons", "kg", ["kethiakh", "poisson sal\xE9", "stockfish", "okporoko", "makayabu", "morue s\xE9ch\xE9e"], ["Sachet 500 g", "Carton 5 kg", "Carton 20 kg"], "S\xE9n\xE9gal / Norv\xE8ge", 180, ["thi\xE9b", "egusi", "saka-saka"]),
      P("Crevettes s\xE9ch\xE9es", "viandes_poissons", "kg", ["crevettes s\xE8ches", "crayfish", "crevettes fum\xE9es", "sikassou", "crayfish moulu"], ["Sachet 200 g", "Sachet 500 g", "Sachet 1 kg"], "Nigeria / Cameroun / Vietnam", 180, ["ndol\xE9", "sauce feuilles", "egusi"]),
      P("Yet (mollusque ferment\xE9)", "viandes_poissons", "kg", ["yett", "y\xE8te", "cymbium s\xE9ch\xE9", "mollusque s\xE9ch\xE9"], ["Sachet 250 g", "Sachet 500 g"], "S\xE9n\xE9gal", 180, ["thi\xE9b", "soupou kandia"]),
      P("Sardines \xE0 l'huile", "viandes_poissons", "piece", ["sardines bo\xEEte", "sardines en conserve"], ["Bo\xEEte 125 g", "Carton 50 bo\xEEtes"], "Maroc / Portugal", 1e3, ["sandwich", "sauce"]),
      P("Thon en bo\xEEte", "viandes_poissons", "kg", ["thon", "thon au naturel", "thon \xE0 l'huile"], ["Bo\xEEte 1,7 kg", "Bo\xEEte 800 g"], "C\xF4te d'Ivoire / Tha\xEFlande", 1e3, ["salade", "sandwich"]),
      P("Corned beef", "viandes_poissons", "piece", ["corned-beef", "b\u0153uf en conserve", "exeter"], ["Bo\xEEte 340 g", "Carton 24"], "Br\xE9sil / Argentine", 1e3, ["sandwich", "sauce corned beef"]),
      P("Luncheon meat", "viandes_poissons", "piece", ["viande en conserve", "spam", "mortadelle en bo\xEEte"], ["Bo\xEEte 340 g"], "Br\xE9sil", 1e3),
      P("Poulet fum\xE9", "viandes_poissons", "kg", ["poulet fum\xE9", "poulet boucan\xE9"], ["Pi\xE8ce", "Carton 5 kg"], "France / Cameroun", 30, ["ndol\xE9", "sauce"]),
      P("Dinde fum\xE9e", "viandes_poissons", "kg", ["dinde fum\xE9e", "ailes de dinde fum\xE9es", "smoked turkey"], ["Carton 5 kg", "Carton 10 kg"], "France / Pologne", 30, ["sauce feuilles", "egusi"]),
      // =========================================================
      // 🫙 ÉPICERIE (80)
      // =========================================================
      // Huiles & graisses
      P("Huile de palme rouge", "epicerie", "L", ["huile de palme", "huile rouge", "zomi", "zom", "dend\xEA", "red oil", "huile de palme non raffin\xE9e"], ["Bouteille 1 L", "Bidon 5 L", "Bidon 20 L"], "C\xF4te d'Ivoire / Ghana / Nigeria / Cameroun", 365, ["sauce graine", "saka-saka", "ndol\xE9", "egusi", "red red"]),
      P("Huile de palmiste", "epicerie", "L", ["huile de palmiste", "huile noire", "manyanga", "adin dudu"], ["Bouteille 1 L"], "Nigeria / Cameroun", 365),
      P("Huile de tournesol", "epicerie", "L", ["huile v\xE9g\xE9tale", "huile de friture", "huile"], ["Bouteille 1 L", "Bidon 5 L", "Bidon 10 L", "Bidon 25 L"], "France / Ukraine", 365, ["friture", "alloco"]),
      P("Huile d'arachide", "epicerie", "L", ["huile de cacahu\xE8te", "huile d'arachide raffin\xE9e"], ["Bidon 5 L", "Bidon 20 L"], "S\xE9n\xE9gal / France", 365, ["friture", "thi\xE9b"]),
      P("Huile de coco", "epicerie", "L", ["huile de noix de coco", "huile de coprah"], ["Pot 1 L", "Bidon 5 L"], "C\xF4te d'Ivoire / Philippines", 365),
      P("Beurre de karit\xE9 alimentaire", "epicerie", "kg", ["karit\xE9", "shea butter", "beurre de karit\xE9"], ["Pot 500 g", "Seau 5 kg"], "Burkina Faso / Mali", 365),
      P("Beurre", "epicerie", "kg", ["beurre doux", "beurre demi-sel"], ["Plaquette 250 g", "Pain 1 kg"], "France", 60),
      P("Margarine", "epicerie", "kg", ["margarine", "blue band"], ["Pot 500 g", "Pot 1 kg"], "France / Pays-Bas", 180),
      // Arachide & oléagineux
      P("P\xE2te d'arachide", "epicerie", "kg", ["beurre de cacahu\xE8te", "tigad\xE8gu\xE8", "tigadegue", "dakatine", "p\xE2te de cacahu\xE8te", "peanut butter", "maf\xE9"], ["Pot 500 g", "Pot 1 kg", "Seau 5 kg", "Seau 10 kg"], "S\xE9n\xE9gal / Burkina / Argentine", 180, ["maf\xE9", "ndol\xE9", "sauce arachide"]),
      P("Arachides crues d\xE9cortiqu\xE9es", "epicerie", "kg", ["cacahu\xE8tes crues", "arachides", "gert\xE9", "guert\xE9"], ["Sac 1 kg", "Sac 5 kg", "Sac 25 kg"], "S\xE9n\xE9gal / Argentine / Chine", 180, ["arachides grill\xE9es", "sauce arachide", "kuli kuli"]),
      P("Arachides grill\xE9es", "epicerie", "kg", ["cacahu\xE8tes grill\xE9es", "cacahu\xE8tes sal\xE9es"], ["Sachet 500 g", "Sac 5 kg"], "S\xE9n\xE9gal / Chine", 180, ["ap\xE9ritif", "garniture"]),
      P("Noix de cajou", "epicerie", "kg", ["cajou", "anacarde", "cashew"], ["Sachet 500 g", "Carton 10 kg"], "C\xF4te d'Ivoire / B\xE9nin / Vietnam", 365, ["ap\xE9ritif"]),
      P("Graines d'egusi", "epicerie", "kg", ["egusi", "\xE9gousi", "pistache africaine", "graines de courge", "agushi", "ngon"], ["Sachet 500 g", "Sachet 1 kg", "Sac 5 kg"], "Nigeria / Cameroun / Ghana", 365, ["egusi soup", "sauce pistache", "ngon"]),
      P("Graines de s\xE9same", "epicerie", "kg", ["s\xE9same", "b\xE9nn\xE9", "beniseed"], ["Sachet 500 g", "Sac 5 kg"], "Nigeria / Burkina", 365),
      P("Ogbono (graines de mangue sauvage)", "epicerie", "kg", ["ogbono", "apon", "ndok", "graines d'irvingia", "dika"], ["Sachet 250 g", "Sachet 500 g"], "Nigeria / Cameroun", 180, ["ogbono soup"]),
      P("Graines de n\xE9r\xE9 (soumbala)", "epicerie", "kg", ["soumbala", "soumbara", "n\xE9t\xE9tou", "netetou", "dawadawa", "iru", "afitin", "moutarde africaine"], ["Sachet 100 g", "Sachet 250 g", "Sachet 1 kg"], "Burkina Faso / S\xE9n\xE9gal / B\xE9nin / Nigeria", 180, ["thi\xE9b", "sauce", "t\xF4"]),
      P("Graines de palme (noix de palme)", "epicerie", "kg", ["noix de palme", "graine de palme", "palm nut"], ["Sachet 1 kg", "Sac 5 kg"], "C\xF4te d'Ivoire / Ghana", 14, ["sauce graine", "banga"]),
      P("Concentr\xE9 de noix de palme (sauce graine)", "epicerie", "kg", ["sauce graine en bo\xEEte", "cr\xE8me de palme", "palm nut cream", "banga concentr\xE9", "nut soup"], ["Bo\xEEte 400 g", "Bo\xEEte 800 g", "Carton 24 \xD7 400 g"], "Ghana / C\xF4te d'Ivoire", 1e3, ["sauce graine", "banga", "moambe"]),
      P("Lait de coco", "epicerie", "L", ["cr\xE8me de coco", "coconut milk"], ["Bo\xEEte 400 mL", "Carton 24 \xD7 400 mL", "Brique 1 L"], "Tha\xEFlande / Sri Lanka", 1e3, ["riz au coco", "sauce coco"]),
      P("Noix de kola", "epicerie", "kg", ["cola", "kola", "gouro"], ["Sachet 500 g"], "C\xF4te d'Ivoire / Nigeria", 30),
      // Tomate & condiments de base
      P("Double concentr\xE9 de tomate", "epicerie", "kg", ["concentr\xE9 de tomate", "tomate en bo\xEEte", "tomate concentr\xE9e", "pur\xE9e de tomate"], ["Bo\xEEte 70 g", "Bo\xEEte 400 g", "Bo\xEEte 800 g", "Bo\xEEte 2,2 kg", "Bo\xEEte 4,5 kg"], "Italie / Chine / Espagne", 730, ["thi\xE9b", "sauce tomate", "jollof", "yassa"]),
      P("Tomates pel\xE9es", "epicerie", "kg", ["tomates pel\xE9es en bo\xEEte", "pulpe de tomate", "tomate concass\xE9e"], ["Bo\xEEte 800 g", "Bo\xEEte 2,5 kg"], "Italie", 730, ["jollof", "sauce"]),
      P("Cube bouillon (volaille / b\u0153uf)", "epicerie", "piece", ["cube maggi", "maggi", "jumbo", "cube", "bouillon cube", "knorr", "adja", "ar\xF4me"], ["Bo\xEEte 60 cubes", "Bo\xEEte 100 cubes", "Carton 240 cubes", "Carton 24 \xD7 60"], "France / Nigeria / S\xE9n\xE9gal", 730, ["tous plats"]),
      P("Bouillon en poudre (tablette / sachet)", "epicerie", "kg", ["maggi poudre", "jumbo poudre", "bouillon poudre", "aromate en poudre"], ["Sachet 1 kg", "Seau 5 kg"], "France / Nigeria", 730),
      P("Ar\xF4me liquide Maggi", "epicerie", "L", ["maggi ar\xF4me", "sauce maggi", "ar\xF4me liquide"], ["Bouteille 200 mL", "Bouteille 1 L"], "France / Allemagne", 1e3, ["marinade", "poisson brais\xE9"]),
      P("Sel fin", "epicerie", "kg", ["sel", "sel de cuisine", "sel iod\xE9"], ["Paquet 1 kg", "Sac 25 kg"], "France / S\xE9n\xE9gal", 3650),
      P("Sucre en poudre", "epicerie", "kg", ["sucre", "sucre blanc", "sucre cristallis\xE9", "sucre semoule"], ["Paquet 1 kg", "Sac 25 kg"], "France / Br\xE9sil", 3650, ["jus", "dessert"]),
      P("Sucre en morceaux", "epicerie", "kg", ["sucre carr\xE9", "sucre en cubes"], ["Bo\xEEte 1 kg", "Carton 10 kg"], "France", 3650, ["th\xE9", "caf\xE9 touba"]),
      P("Sucre roux / vergeoise", "epicerie", "kg", ["cassonade", "sucre roux"], ["Paquet 1 kg"], "France / Maurice", 3650),
      P("Moutarde de Dijon", "epicerie", "kg", ["moutarde", "moutarde forte"], ["Pot 1 kg", "Seau 5 kg"], "France", 365, ["yassa", "poulet brais\xE9", "marinade"]),
      P("Vinaigre blanc", "epicerie", "L", ["vinaigre", "vinaigre d'alcool", "vinaigre cristal"], ["Bouteille 1 L", "Bidon 5 L"], "France", 1e3, ["yassa", "marinade", "nettoyage"]),
      P("Mayonnaise", "epicerie", "kg", ["mayo"], ["Pot 500 g", "Seau 5 kg"], "France", 180, ["sandwich", "salade"]),
      P("Ketchup", "epicerie", "kg", [], ["Bouteille 1 kg", "Seau 5 kg"], "France / Pays-Bas", 365, ["sandwich", "frites"]),
      P("Sauce piment (pili-pili en pot)", "epicerie", "kg", ["pili-pili", "sauce piment\xE9e", "pur\xE9e de piment", "sauce chili", "kani"], ["Pot 500 g", "Seau 2,5 kg"], "France / Cameroun / Tha\xEFlande", 365, ["condiment"]),
      P("Shito (sauce piment ghan\xE9enne)", "epicerie", "kg", ["shito", "sauce piment noire", "ghana black pepper sauce"], ["Pot 300 g", "Pot 1 kg"], "Ghana", 180, ["kenkey", "waakye"]),
      P("Sauce soja", "epicerie", "L", ["soja"], ["Bouteille 1 L", "Bidon 5 L"], "Chine / Pays-Bas", 1e3, ["marinade poulet"]),
      P("Sauce Worcestershire / Tabasco", "epicerie", "L", ["worcestershire", "tabasco", "sauce anglaise"], ["Bouteille 150 mL"], "Royaume-Uni / USA", 1e3, ["marinade"]),
      P("Tamarin (pulpe)", "epicerie", "kg", ["dakhar", "pulpe de tamarin", "tamarin bloc", "tamarin sans graines"], ["Bloc 400 g", "Bloc 1 kg", "Carton 10 kg"], "Tha\xEFlande / Mali / S\xE9n\xE9gal", 365, ["jus de tamarin", "sauce", "dakhar"]),
      P("P\xE2te de tomate-piment (sauce tomate pr\xE9par\xE9e)", "epicerie", "kg", ["sauce tomate pr\xE9par\xE9e", "tomato stew base"], ["Pot 1 kg"], "France", 180),
      // Épices & aromates
      P("Poivre noir grains / moulu", "epicerie", "kg", ["poivre", "poivre noir", "poivre moulu"], ["Sachet 500 g", "Sachet 1 kg"], "Vietnam / Cameroun (Penja)", 730),
      P("Poivre blanc de Penja", "epicerie", "kg", ["poivre de Penja", "poivre blanc"], ["Sachet 250 g", "Sachet 1 kg"], "Cameroun", 730, ["poisson brais\xE9"]),
      P("Poivre de Guin\xE9e (maniguette)", "epicerie", "kg", ["maniguette", "graines de paradis", "atare", "alligator pepper", "poivre de Guin\xE9e", "djar"], ["Sachet 100 g", "Sachet 500 g"], "Guin\xE9e / Ghana / Nigeria", 730, ["pepper soup", "thi\xE9b"]),
      P("Poivre long / piment noir (ashanti pepper)", "epicerie", "kg", ["uziza", "ashanti pepper", "poivre ashanti", "kale", "poivre sauvage"], ["Sachet 100 g"], "Nigeria / Cameroun", 730, ["pepper soup"]),
      P("Piment en poudre (cayenne)", "epicerie", "kg", ["piment moulu", "piment de Cayenne", "piment rouge en poudre", "piment sec moulu"], ["Sachet 500 g", "Sachet 1 kg", "Seau 5 kg"], "Inde / Nigeria / S\xE9n\xE9gal", 730, ["marinade", "suya", "condiment"]),
      P("Piment sec entier", "epicerie", "kg", ["piment s\xE9ch\xE9", "piment rouge sec", "kani s\xE9ch\xE9"], ["Sachet 500 g", "Sac 5 kg"], "Nigeria / Chine", 730),
      P("Paprika", "epicerie", "kg", ["paprika doux", "paprika fum\xE9"], ["Sachet 500 g", "Sachet 1 kg"], "Espagne / Hongrie", 730, ["marinade", "poulet brais\xE9"]),
      P("Curry en poudre", "epicerie", "kg", ["curry", "poudre de curry", "curry madras"], ["Sachet 500 g", "Sachet 1 kg"], "Inde / France", 730, ["jollof", "poulet"]),
      P("Thym s\xE9ch\xE9", "epicerie", "kg", ["thym"], ["Sachet 250 g", "Sachet 1 kg"], "France / Maroc / Espagne", 730, ["jollof", "poulet brais\xE9"]),
      P("Laurier", "epicerie", "kg", ["feuilles de laurier"], ["Sachet 100 g", "Sachet 500 g"], "Turquie / France", 730, ["sauce", "thi\xE9b"]),
      P("Clou de girofle", "epicerie", "kg", ["girofle", "clous de girofle"], ["Sachet 250 g", "Sachet 1 kg"], "Madagascar / Indon\xE9sie", 730, ["caf\xE9 touba", "marinade"]),
      P("Djar (poivre de S\xE9lim / kili)", "epicerie", "kg", ["poivre de S\xE9lim", "kili", "kimba", "hwentia", "uda", "poivre d'\xC9thiopie", "djar"], ["Sachet 100 g", "Sachet 500 g"], "S\xE9n\xE9gal / Ghana / Nigeria", 730, ["caf\xE9 touba", "pepper soup", "thi\xE9b"]),
      P("Gingembre en poudre", "epicerie", "kg", ["gingembre moulu"], ["Sachet 500 g", "Sachet 1 kg"], "Nigeria / Inde", 730, ["marinade", "suya"]),
      P("Ail en poudre / semoule", "epicerie", "kg", ["ail moulu", "ail d\xE9shydrat\xE9", "ail semoule"], ["Sachet 500 g", "Sachet 1 kg"], "Chine / Espagne", 730, ["marinade"]),
      P("Oignon en poudre / flocons", "epicerie", "kg", ["oignon d\xE9shydrat\xE9", "oignon semoule"], ["Sachet 500 g", "Sachet 1 kg"], "\xC9gypte / Inde", 730),
      P("Curcuma", "epicerie", "kg", ["curcuma en poudre", "safran des Indes"], ["Sachet 500 g"], "Inde", 730, ["riz jaune"]),
      P("Cumin", "epicerie", "kg", ["cumin moulu", "cumin grains"], ["Sachet 500 g"], "Inde / Turquie", 730),
      P("Muscade", "epicerie", "kg", ["noix de muscade", "muscade moulue", "ehuru", "calabash nutmeg"], ["Sachet 250 g"], "Indon\xE9sie / Cameroun", 730, ["pepper soup", "thi\xE9b"]),
      P("Cannelle", "epicerie", "kg", ["cannelle moulue", "b\xE2ton de cannelle"], ["Sachet 500 g"], "Indon\xE9sie / Sri Lanka", 730, ["thiakry", "jus"]),
      P("Anis \xE9toil\xE9 / anis vert", "epicerie", "kg", ["badiane", "anis"], ["Sachet 250 g"], "Vietnam / \xC9gypte", 730, ["jus de gingembre"]),
      P("Vanille (gousses / ar\xF4me)", "epicerie", "piece", ["ar\xF4me vanille", "sucre vanill\xE9", "gousse de vanille"], ["Flacon 1 L", "Sachet 50 gousses"], "Madagascar / France", 730, ["thiakry", "dessert", "jus"]),
      P("M\xE9lange \xE9pices poisson brais\xE9", "epicerie", "kg", ["\xE9pices poisson brais\xE9", "assaisonnement poisson", "\xE9pices grillades"], ["Sachet 500 g", "Seau 2 kg"], "France / Cameroun", 365, ["poisson brais\xE9"]),
      P("M\xE9lange \xE9pices poulet (tandoori / yaourt)", "epicerie", "kg", ["\xE9pices poulet", "assaisonnement poulet brais\xE9", "\xE9pices poulet DG", "\xE9pices grillades poulet"], ["Sachet 500 g", "Seau 2 kg"], "France", 365, ["poulet brais\xE9"]),
      P("Suya / yaji (\xE9pices kilichi)", "epicerie", "kg", ["yaji", "\xE9pices suya", "kilichi", "tankora", "poudre de kankankan", "kankankan"], ["Sachet 250 g", "Sachet 1 kg"], "Nigeria / Niger / Cameroun", 365, ["suya", "brochettes", "dibi"]),
      P("Pebe (\xE9pices pepper soup)", "epicerie", "kg", ["p\xE8b\xE8", "\xE9pices pepper soup", "m\xE9lange pepper soup", "country onion", "rondelles"], ["Sachet 100 g", "Sachet 500 g"], "Cameroun / Nigeria", 365, ["pepper soup", "mbongo tchobi"]),
      P("Mbongo (\xE9pices sauce noire)", "epicerie", "kg", ["mbongo tchobi \xE9pices", "\xE9pices sauce noire", "kanwa"], ["Sachet 100 g"], "Cameroun", 365, ["mbongo tchobi"]),
      P("Potasse alimentaire (kanwa / akanwu)", "epicerie", "kg", ["kanwa", "akanwu", "potasse", "natron", "trona", "kaun"], ["Sachet 200 g", "Sachet 1 kg"], "Nigeria / Tchad / Niger", 3650, ["ndol\xE9", "egusi", "ewedu"]),
      P("Bicarbonate de soude", "epicerie", "kg", ["bicarbonate alimentaire"], ["Sachet 500 g", "Sachet 1 kg"], "France", 3650, ["ndol\xE9", "haricots"]),
      P("Levure chimique / boulang\xE8re", "epicerie", "kg", ["levure", "levure de boulanger", "poudre \xE0 lever"], ["Sachet 500 g", "Sachet 1 kg"], "France", 365, ["beignets", "puff-puff", "pastels"]),
      // Farines / produits secs
      P("Poudre de gombo s\xE9ch\xE9", "epicerie", "kg", ["gombo en poudre", "poudre de gombo", "kandia poudre", "gan", "dried okra powder"], ["Sachet 250 g", "Sachet 500 g"], "Mali / Burkina / Nigeria", 730, ["sauce gombo", "t\xF4"]),
      P("Poudre de feuilles de baobab (lalo)", "epicerie", "kg", ["lalo", "lalo en poudre", "kuka"], ["Sachet 200 g", "Sachet 500 g"], "S\xE9n\xE9gal / Mali", 730, ["lalo", "mbourake", "couscous s\xE9n\xE9galais"]),
      P("Pain de singe (poudre de baobab)", "epicerie", "kg", ["bouye", "poudre de baobab", "fruit de baobab", "pain de singe"], ["Sachet 500 g", "Sachet 1 kg"], "S\xE9n\xE9gal / Mali", 730, ["jus de bouye", "ngalakh"]),
      P("Lait en poudre", "epicerie", "kg", ["lait en poudre entier", "nido", "lait poudre"], ["Bo\xEEte 900 g", "Bo\xEEte 2,5 kg", "Sac 25 kg"], "France / Pays-Bas", 365, ["thiakry", "d\xE9gu\xE9", "caf\xE9 au lait"]),
      P("Lait concentr\xE9 sucr\xE9", "epicerie", "kg", ["lait concentr\xE9", "gloria", "nestl\xE9 lait concentr\xE9"], ["Bo\xEEte 397 g", "Bo\xEEte 1 kg", "Tube 1 kg"], "France / Pays-Bas", 365, ["thiakry", "jus", "caf\xE9 touba"]),
      P("Lait concentr\xE9 non sucr\xE9", "epicerie", "L", ["lait \xE9vapor\xE9", "lait concentr\xE9 non sucr\xE9", "peak", "carnation"], ["Bo\xEEte 410 g", "Carton 48"], "Pays-Bas / France", 365, ["th\xE9", "d\xE9gu\xE9"]),
      P("Yaourt nature", "epicerie", "kg", ["yaourt", "yaourt brass\xE9", "lait caill\xE9", "sow"], ["Pot 125 g", "Seau 1 kg", "Seau 5 kg"], "France", 21, ["thiakry", "d\xE9gu\xE9", "lakh"]),
      P("Cr\xE8me fra\xEEche", "epicerie", "L", ["cr\xE8me liquide", "cr\xE8me \xE9paisse"], ["Bouteille 1 L", "Seau 5 L"], "France", 21),
      P("Fromage r\xE2p\xE9 / fondu", "epicerie", "kg", ["emmental r\xE2p\xE9", "vache qui rit", "fromage fondu"], ["Sachet 1 kg", "Bo\xEEte 24 portions"], "France", 30, ["sandwich"]),
      P("P\xE2tes (spaghetti / macaroni)", "epicerie", "kg", ["spaghetti", "macaroni", "vermicelles", "p\xE2tes alimentaires"], ["Paquet 500 g", "Carton 24 \xD7 500 g", "Sac 5 kg"], "Italie / Turquie / France", 730, ["spaghetti sauce", "macaroni jollof"]),
      P("Vermicelles de riz / nouilles", "epicerie", "kg", ["vermicelles", "nouilles", "indomie"], ["Carton 40 sachets"], "Chine / Nigeria / Indon\xE9sie", 730, ["indomie"]),
      P("Semoule de bl\xE9 (couscous)", "epicerie", "kg", ["couscous", "semoule", "semoule fine", "semoule moyenne"], ["Paquet 1 kg", "Sac 5 kg", "Sac 25 kg"], "France / Maroc", 365, ["couscous"]),
      P("Chapelure", "epicerie", "kg", ["panure", "pain r\xE2p\xE9"], ["Sachet 1 kg", "Sac 5 kg"], "France", 365, ["poisson pan\xE9", "croquettes"]),
      P("Farine de manioc fine (tapioca)", "epicerie", "kg", ["tapioca", "f\xE9cule de manioc", "amidon de manioc", "farine de tapioca"], ["Sachet 500 g", "Sac 5 kg"], "Tha\xEFlande / Br\xE9sil", 730, ["gari", "bouillie"]),
      P("F\xE9cule de ma\xEFs (Ma\xEFzena)", "epicerie", "kg", ["ma\xEFzena", "amidon de ma\xEFs", "f\xE9cule"], ["Bo\xEEte 400 g", "Sac 5 kg"], "France", 730, ["sauce", "bouillie"]),
      P("Flocons d'avoine / c\xE9r\xE9ales", "epicerie", "kg", ["avoine", "quaker", "c\xE9r\xE9ales petit-d\xE9jeuner"], ["Bo\xEEte 1 kg"], "France / Royaume-Uni", 365, ["bouillie"]),
      P("Cacao en poudre / chocolat", "epicerie", "kg", ["cacao", "chocolat en poudre", "milo", "ovaltine"], ["Bo\xEEte 500 g", "Bo\xEEte 1 kg"], "C\xF4te d'Ivoire / Ghana / France", 365, ["boisson chaude"]),
      P("Caf\xE9 soluble / Caf\xE9 Touba", "epicerie", "kg", ["caf\xE9 soluble", "nescaf\xE9", "caf\xE9 touba", "caf\xE9 moulu"], ["Bo\xEEte 200 g", "Sachet 1 kg"], "C\xF4te d'Ivoire / S\xE9n\xE9gal / France", 730, ["caf\xE9 touba", "caf\xE9"]),
      P("Th\xE9 vert de Chine (ataya)", "epicerie", "kg", ["ataya", "th\xE9 vert", "gunpowder", "th\xE9 chinois", "th\xE9 de Chine"], ["Bo\xEEte 100 g", "Bo\xEEte 250 g", "Carton 40 \xD7 250 g"], "Chine", 730, ["ataya", "th\xE9 \xE0 la menthe"]),
      P("Th\xE9 noir (Lipton) / kink\xE9liba", "epicerie", "kg", ["th\xE9 noir", "lipton", "kink\xE9liba", "kinkeliba", "quinqu\xE9liba", "sekhew"], ["Bo\xEEte 100 sachets", "Sachet 200 g"], "Kenya / S\xE9n\xE9gal", 730, ["petit d\xE9jeuner", "kink\xE9liba"]),
      P("Miel", "epicerie", "kg", ["miel liquide", "miel toutes fleurs"], ["Pot 1 kg", "Seau 5 kg"], "France / Espagne / S\xE9n\xE9gal", 1e3, ["jus", "marinade"]),
      P("Confiture", "epicerie", "kg", ["confiture", "marmelade"], ["Pot 1 kg"], "France", 730),
      P("Riz au lait / cr\xE8me dessert (pr\xE9par\xE9)", "epicerie", "kg", ["sombi", "riz au lait"], ["Seau 5 kg"], "France", 21, ["sombi"]),
      P("Biscuits / g\xE2teaux secs", "epicerie", "kg", ["biscuits", "g\xE2teaux", "petit beurre"], ["Carton 5 kg"], "France / Turquie", 365),
      P("Gousses de vanille", "epicerie", "piece", [], ["Sachet 10 gousses"], "Madagascar", 730),
      P("Glace / cr\xE8me glac\xE9e", "epicerie", "L", ["glace vanille", "glace", "sorbet"], ["Bac 2,5 L", "Bac 5 L"], "France", 365, ["dessert"]),
      // =========================================================
      // 🥤 BOISSONS (35)
      // =========================================================
      P("Fleurs de bissap s\xE9ch\xE9es", "boissons", "kg", ["bissap", "hibiscus", "oseille de Guin\xE9e", "karkad\xE9", "zobo", "da bilenni", "fol\xE9r\xE9", "sorrel", "roselle"], ["Sachet 200 g", "Sachet 500 g", "Sachet 1 kg", "Sac 5 kg", "Sac 25 kg"], "S\xE9n\xE9gal / Nigeria / \xC9gypte / Soudan", 730, ["jus de bissap", "zobo", "fol\xE9r\xE9"]),
      P("Bissap blanc", "boissons", "kg", ["bissap blanc s\xE9ch\xE9", "oseille blanche"], ["Sachet 500 g", "Sachet 1 kg"], "S\xE9n\xE9gal", 730, ["jus de bissap blanc"]),
      P("Gingembre s\xE9ch\xE9 (tranches / poudre)", "boissons", "kg", ["gingembre sec", "gingembre s\xE9ch\xE9 en poudre", "gnamakoudji poudre"], ["Sachet 500 g", "Sachet 1 kg"], "Nigeria / Chine", 730, ["gnamakoudji", "jus de gingembre"]),
      P("Poudre de baobab (bouye)", "boissons", "kg", ["bouye", "bouyi", "pain de singe", "baobab powder"], ["Sachet 500 g", "Sachet 1 kg"], "S\xE9n\xE9gal / Mali", 730, ["jus de bouye", "ngalakh"]),
      P("Pulpe de tamarin (boisson)", "boissons", "kg", ["dakhar", "tamarin bloc"], ["Bloc 1 kg"], "Tha\xEFlande / S\xE9n\xE9gal", 365, ["jus de tamarin"]),
      P("Ditakh (d\xE9tar)", "boissons", "kg", ["ditakh", "d\xE9tar", "detarium"], ["Sachet 500 g", "Sachet 1 kg"], "S\xE9n\xE9gal", 365, ["jus de ditakh"]),
      P("Madd (saba senegalensis)", "boissons", "kg", ["madd", "maad", "saba", "liane go\xEFne", "zaban"], ["Sachet 500 g"], "S\xE9n\xE9gal / Mali", 365, ["jus de madd"]),
      P("Mangue en pulpe / pur\xE9e", "boissons", "kg", ["pulpe de mangue", "pur\xE9e de mangue", "mango pulp"], ["Bo\xEEte 850 g", "Seau 3 kg"], "Inde / C\xF4te d'Ivoire", 1e3, ["jus de mangue"]),
      P("Poudre de cacahu\xE8te / mil pour bouillie", "boissons", "kg", ["bouillie", "ruy", "ogi", "pap", "akamu", "koko"], ["Sachet 1 kg"], "S\xE9n\xE9gal / Nigeria", 365, ["bouillie"]),
      P("Sirop de sucre de canne", "boissons", "L", ["sirop de canne", "sirop simple"], ["Bouteille 1 L", "Bidon 5 L"], "France / Guadeloupe", 1e3, ["cocktails", "jus"]),
      P("Sirop de menthe / grenadine", "boissons", "L", ["sirop de menthe", "grenadine", "sirop"], ["Bouteille 1 L"], "France", 1e3, ["diabolo"]),
      P("Jus de bissap pr\xEAt \xE0 boire", "boissons", "L", ["jus de bissap bouteille", "bissap industriel", "zobo drink"], ["Bouteille 33 cl", "Bouteille 1 L", "Carton 12 \xD7 1 L"], "France / S\xE9n\xE9gal", 180, ["bissap"]),
      P("Jus de gingembre pr\xEAt \xE0 boire", "boissons", "L", ["gnamakoudji bouteille", "jus de gingembre industriel", "ginger juice"], ["Bouteille 33 cl", "Bouteille 1 L"], "France / C\xF4te d'Ivoire", 180, ["gnamakoudji"]),
      P("Jus de baobab pr\xEAt \xE0 boire", "boissons", "L", ["bouye bouteille", "jus de bouye"], ["Bouteille 33 cl", "Bouteille 1 L"], "France / S\xE9n\xE9gal", 180),
      P("Jus de fruits tropicaux (mangue / ananas / goyave)", "boissons", "L", ["jus de mangue", "jus d'ananas", "jus de goyave", "nectar", "jus tropical"], ["Brique 1 L", "Carton 12 \xD7 1 L", "Bouteille 25 cl"], "France / C\xF4te d'Ivoire", 365, ["jus"]),
      P("Eau min\xE9rale 50 cl", "boissons", "piece", ["eau plate 50 cl", "eau", "petite eau"], ["Pack 24", "Palette 84 packs"], "France", 730),
      P("Eau min\xE9rale 1,5 L", "boissons", "piece", ["eau plate 1,5 L", "grande eau"], ["Pack 6", "Palette"], "France", 730),
      P("Eau gazeuse 50 cl / 1 L", "boissons", "piece", ["eau p\xE9tillante", "perrier", "eau gazeuse"], ["Pack 24", "Pack 6"], "France", 730),
      P("Coca-Cola 33 cl", "boissons", "piece", ["coca", "cola", "coca-cola", "coca canette", "coca bouteille verre"], ["Pack 24 canettes", "Carton 24 bouteilles verre"], "France", 365),
      P("Fanta / Sprite 33 cl", "boissons", "piece", ["fanta", "sprite", "fanta orange", "fanta cocktail", "soda"], ["Pack 24 canettes"], "France", 365),
      P("Malta Guinness 33 cl", "boissons", "piece", ["malta", "malt", "boisson malt\xE9e", "vitamalt", "maltina", "supermalt"], ["Carton 24 canettes", "Carton 24 bouteilles"], "Nigeria / Royaume-Uni / Danemark", 365),
      P("Vimto 33 cl", "boissons", "piece", ["vimto"], ["Carton 24"], "Royaume-Uni / S\xE9n\xE9gal", 365),
      P("Youki / Top (sodas ivoiriens)", "boissons", "piece", ["youki", "top", "top ananas", "youki pamplemousse", "soda ivoirien"], ["Carton 24"], "C\xF4te d'Ivoire", 365),
      P("Boissons \xE9nergisantes", "boissons", "piece", ["red bull", "monster", "\xE9nergisant", "xxl"], ["Pack 24"], "Autriche / France", 365),
      P("Bi\xE8re Flag 33 cl", "boissons", "piece", ["flag", "flag sp\xE9ciale"], ["Carton 24"], "S\xE9n\xE9gal / C\xF4te d'Ivoire", 365),
      P("Bi\xE8re Castel 33 cl", "boissons", "piece", ["castel", "castel beer"], ["Carton 24"], "C\xF4te d'Ivoire / Cameroun", 365),
      P("Bi\xE8re 33 Export 33 cl", "boissons", "piece", ["33 export", "trente-trois", "33"], ["Carton 24"], "Cameroun", 365),
      P("Bi\xE8re Guinness Foreign Extra 33 cl", "boissons", "piece", ["guinness", "guinness FES", "guinness nigeria"], ["Carton 24"], "Nigeria / Cameroun / Irlande", 365),
      P("Bi\xE8re Star / Gulder 33 cl", "boissons", "piece", ["star lager", "gulder", "bi\xE8re nig\xE9riane"], ["Carton 24"], "Nigeria", 365),
      P("Bi\xE8re Heineken / 1664 33 cl", "boissons", "piece", ["heineken", "1664", "kro", "bi\xE8re blonde"], ["Carton 24", "F\xFBt 30 L"], "France / Pays-Bas", 365),
      P("Bi\xE8re Desperados 33 cl", "boissons", "piece", ["desperados", "desp\xE9"], ["Carton 24"], "France", 365),
      P("Vin de palme / bandji", "boissons", "L", ["bandji", "vin de palme", "palm wine", "matango", "nsamba"], ["Bouteille 75 cl", "Bidon 5 L"], "C\xF4te d'Ivoire / Cameroun / Ghana", 30),
      P("Vin rouge / ros\xE9 / blanc", "boissons", "L", ["vin", "vin rouge", "vin ros\xE9", "vin blanc", "bordeaux", "c\xF4tes du Rh\xF4ne"], ["Bouteille 75 cl", "Carton 6", "Bag-in-box 5 L"], "France", 1e3),
      P("Champagne / mousseux", "boissons", "piece", ["champagne", "cr\xE9mant", "mousseux", "prosecco"], ["Bouteille 75 cl", "Carton 6"], "France / Italie", 1e3),
      P("Spiritueux (whisky / rhum / vodka / gin)", "boissons", "L", ["whisky", "rhum", "vodka", "gin", "pastis", "liqueur", "baileys", "jack daniels", "chivas", "hennessy"], ["Bouteille 70 cl", "Bouteille 1 L"], "\xC9cosse / France / Antilles", 3650, ["bar", "cocktails"]),
      P("Jus d'orange / multifruits", "boissons", "L", ["jus d'orange", "multifruits", "jus de pomme", "tropicana"], ["Brique 1 L", "Bouteille 25 cl"], "France / Espagne", 365),
      P("Caf\xE9 en grains / moulu (machine)", "boissons", "kg", ["caf\xE9 en grains", "caf\xE9 espresso", "caf\xE9 moulu machine"], ["Paquet 1 kg"], "Italie / France / C\xF4te d'Ivoire", 365, ["caf\xE9"]),
      P("Gla\xE7ons", "boissons", "kg", ["glace pil\xE9e", "gla\xE7ons en sac"], ["Sac 2 kg", "Sac 5 kg"], "France", 30, ["bar", "jus"]),
      // =========================================================
      // 📦 EMBALLAGES & CONSOMMABLES (30)
      // =========================================================
      P("Barquette aluminium 1000 mL + couvercle", "emballages", "piece", ["barquette alu", "barquette aluminium", "barquette 1000", "plat alu", "barquette \xE0 emporter"], ["Carton 100", "Carton 500"], "France / Turquie", 3650, ["vente \xE0 emporter"]),
      P("Barquette aluminium 1500 mL + couvercle", "emballages", "piece", ["barquette alu 1500", "grande barquette", "barquette famille"], ["Carton 100", "Carton 300"], "France / Turquie", 3650),
      P("Barquette aluminium 650 mL + couvercle", "emballages", "piece", ["barquette alu 650", "petite barquette", "barquette portion"], ["Carton 100", "Carton 500"], "France / Turquie", 3650),
      P("Bo\xEEte kraft \xE0 emporter (1000 mL)", "emballages", "piece", ["bo\xEEte kraft", "lunch box kraft", "bo\xEEte carton alimentaire", "bo\xEEte bio"], ["Carton 50", "Carton 300"], "France / Chine", 3650, ["vente \xE0 emporter"]),
      P("Bo\xEEte kraft 750 mL / 500 mL", "emballages", "piece", ["petite bo\xEEte kraft", "bo\xEEte kraft moyenne"], ["Carton 50", "Carton 300"], "France / Chine", 3650),
      P("Bol \xE0 salade PET + couvercle", "emballages", "piece", ["bol salade", "saladier jetable", "bol PET 750"], ["Carton 50", "Carton 300"], "France / Chine", 3650),
      P("Pot \xE0 sauce 30 mL + couvercle", "emballages", "piece", ["pot sauce", "godet sauce", "ramequin jetable", "pot piment"], ["Sachet 100", "Carton 1000", "Carton 2500"], "France / Chine", 3650, ["sauce piment"]),
      P("Pot \xE0 sauce 90 mL / 120 mL", "emballages", "piece", ["pot 90 mL", "pot 120 mL", "pot \xE0 soupe petit"], ["Carton 500", "Carton 1000"], "France / Chine", 3650),
      P("Bol \xE0 soupe 500 mL / 750 mL + couvercle", "emballages", "piece", ["bol soupe", "pot soupe", "bol PP", "bol micro-ondable", "bol pepper soup"], ["Carton 250", "Carton 500"], "France / Chine", 3650, ["pepper soup", "sauces"]),
      P("Gobelet carton 20 cl / 25 cl", "emballages", "piece", ["gobelet carton", "gobelet caf\xE9", "gobelet chaud"], ["Sachet 50", "Carton 1000"], "France", 3650, ["caf\xE9", "th\xE9"]),
      P("Gobelet PET 33 cl / 50 cl (froid)", "emballages", "piece", ["gobelet plastique", "gobelet jus", "gobelet PET", "gobelet 33 cl", "gobelet 50 cl"], ["Sachet 50", "Carton 1000"], "France / Chine", 3650, ["jus de bissap", "jus de gingembre"]),
      P("Couvercle d\xF4me / plat pour gobelet PET", "emballages", "piece", ["couvercle gobelet", "couvercle d\xF4me", "couvercle plat"], ["Sachet 50", "Carton 1000"], "France / Chine", 3650),
      P("Bouteille PET 33 cl / 50 cl + bouchon", "emballages", "piece", ["bouteille jus", "bouteille plastique", "bouteille PET vide", "bouteille 33 cl", "bouteille 50 cl"], ["Carton 100", "Carton 200"], "France / Portugal", 3650, ["jus de bissap", "jus de gingembre", "bouye"]),
      P("Bouteille PET 1 L / 1,5 L + bouchon", "emballages", "piece", ["bouteille 1 L", "bouteille 1,5 L", "grande bouteille jus"], ["Carton 100"], "France / Portugal", 3650, ["jus"]),
      P("Paille (papier / PLA)", "emballages", "piece", ["pailles", "paille papier", "paille biod\xE9gradable"], ["Sachet 250", "Carton 5000"], "France / Chine", 3650),
      P("Couverts jetables (bois / PLA)", "emballages", "piece", ["couverts", "fourchette jetable", "cuill\xE8re jetable", "kit couverts", "couverts bois"], ["Sachet 100", "Carton 1000"], "France / Chine", 3650),
      P("Serviettes en papier", "emballages", "piece", ["serviettes", "serviette papier", "napkins"], ["Paquet 100", "Carton 3000"], "France", 3650),
      P("Sac kraft \xE0 poign\xE9es", "emballages", "piece", ["sac kraft", "sac papier", "sac \xE0 emporter", "sac cabas kraft", "sac papier poign\xE9es torsad\xE9es"], ["Paquet 50", "Carton 250", "Carton 500"], "France / Turquie", 3650, ["vente \xE0 emporter", "livraison"]),
      P("Sac kraft sans poign\xE9es (SOS)", "emballages", "piece", ["sac SOS", "sac kraft brun", "sac boulangerie"], ["Paquet 250", "Carton 1000"], "France", 3650),
      P("Sac plastique r\xE9utilisable / cabas", "emballages", "piece", ["sac plastique", "sac r\xE9utilisable", "sac bretelles r\xE9utilisable", "cabas"], ["Paquet 100", "Carton 500"], "France / Turquie", 3650),
      P("Film alimentaire \xE9tirable", "emballages", "piece", ["film \xE9tirable", "film alimentaire", "cellophane", "film plastique"], ["Rouleau 300 m", "Carton 6 rouleaux"], "France", 3650),
      P("Papier aluminium", "emballages", "piece", ["alu", "rouleau aluminium", "papier alu"], ["Rouleau 200 m", "Carton 4 rouleaux"], "France", 3650, ["poisson brais\xE9", "poulet brais\xE9"]),
      P("Papier cuisson / sulfuris\xE9", "emballages", "piece", ["papier sulfuris\xE9", "papier cuisson", "feuilles cuisson"], ["Rouleau 50 m", "Carton 500 feuilles"], "France", 3650),
      P("Papier kraft alimentaire (feuilles / rouleau)", "emballages", "piece", ["papier kraft", "papier ingraissable", "feuilles kraft", "papier sandwich"], ["Rame 10 kg", "Rouleau 50 cm \xD7 200 m"], "France", 3650, ["sandwich", "alloco"]),
      P("\xC9tiquettes / stickers logo", "emballages", "piece", ["\xE9tiquettes", "stickers", "\xE9tiquettes DLC", "\xE9tiquettes tra\xE7abilit\xE9"], ["Rouleau 500", "Rouleau 1000"], "France", 3650, ["tra\xE7abilit\xE9", "HACCP"]),
      P("Gants nitrile / vinyle", "emballages", "piece", ["gants jetables", "gants nitrile", "gants vinyle", "gants latex"], ["Bo\xEEte 100", "Carton 1000"], "Malaisie / Tha\xEFlande", 3650, ["hygi\xE8ne"]),
      P("Charlottes / tabliers jetables", "emballages", "piece", ["charlotte", "tablier jetable", "calot"], ["Sachet 100", "Carton 1000"], "France / Chine", 3650, ["hygi\xE8ne"]),
      P("Sacs poubelle 50 L / 110 L", "emballages", "piece", ["sac poubelle", "sacs poubelle 110 L", "sac poubelle 50 L"], ["Rouleau 20", "Carton 200"], "France", 3650, ["hygi\xE8ne"]),
      P("Rouleau essuie-tout / bobine", "emballages", "piece", ["essuie-tout", "bobine industrielle", "papier essuie-main", "sopalin"], ["Paquet 6", "Bobine 1000 f", "Carton 2 bobines"], "France", 3650, ["hygi\xE8ne"]),
      P("Produit vaisselle / d\xE9graissant / javel", "emballages", "L", ["liquide vaisselle", "d\xE9graissant", "javel", "d\xE9sinfectant", "produit d'entretien", "produits nettoyage"], ["Bidon 5 L", "Bidon 20 L"], "France", 3650, ["hygi\xE8ne", "HACCP"])
    ];
    normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
    CATEGORY_LABELS = {
      feculents: "F\xE9culents",
      frais: "Produits frais",
      viandes_poissons: "Viandes & poissons",
      epicerie: "\xC9picerie",
      boissons: "Boissons",
      emballages: "Emballages & consommables"
    };
  }
});

// packages/db/src/seed.ts
import { eq as eq2 } from "drizzle-orm";
import bcrypt from "bcryptjs";
async function seedDemo(opts = {}) {
  const prod = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  if (prod && process.env.ALLOW_DEMO_SEED !== "true") {
    const msg = "Seed de d\xE9monstration refus\xE9 en production (compte awa@chezawa.fr / demo1234 accessible publiquement). Utilisez ALLOW_DEMO_SEED=true si c\u2019est volontaire.";
    console.error(`[seed] ${msg}`);
    return { skipped: true, reason: msg };
  }
  const db = await getDb();
  const existing = await db.select().from(restaurants).where(eq2(restaurants.slug, "chez-awa")).limit(1);
  if (existing.length && !opts.force) {
    console.log("[seed] Restaurant d\xE9mo d\xE9j\xE0 pr\xE9sent \u2014 rien \xE0 faire.");
    return { restaurantId: existing[0].id };
  }
  if (existing.length && opts.force) {
    await db.delete(restaurants).where(eq2(restaurants.slug, "chez-awa"));
  }
  const existingRef = await db.select({ id: products.id, name: products.name }).from(products);
  const byName = new Map(existingRef.map((p) => [p.name, p.id]));
  const missing = REFERENCE_PRODUCTS.filter((p) => !byName.has(p.name));
  if (missing.length) {
    const inserted = await db.insert(products).values(
      missing.map((p) => ({ name: p.name, category: p.category, baseUnit: p.baseUnit, origin: p.origin, aliases: [...p.aliases, ...p.tags ?? []], shelfLifeDays: p.shelfLifeDays, seasonality: p.season?.length ? JSON.stringify(p.season) : null }))
    ).returning({ id: products.id, name: products.name });
    inserted.forEach((p) => byName.set(p.name, p.id));
  }
  const pid = (name) => {
    const id = byName.get(name);
    if (!id) throw new Error(`Produit r\xE9f\xE9rentiel manquant : ${name}`);
    return id;
  };
  const passwordHash = await bcrypt.hash("demo1234", 10);
  const [user] = await db.insert(users).values({
    email: "awa@chezawa.fr",
    passwordHash,
    fullName: "Awa Diallo",
    phone: "+33 6 12 34 56 78"
  }).onConflictDoUpdate({ target: users.email, set: { fullName: "Awa Diallo" } }).returning();
  const [restaurant] = await db.insert(restaurants).values({
    name: "Chez Awa",
    slug: "chez-awa",
    city: "Nantes",
    postalCode: "44100",
    address: "12 rue de la Bastille",
    cuisine: "s\xE9n\xE9galaise & ivoirienne",
    coversPerDay: 60,
    plan: "pro",
    trialEndsAt: daysAgo(-30),
    settings: { priceIncreaseAlertPct: 8, forecastHorizonDays: 7 }
  }).returning();
  const rid = restaurant.id;
  await db.insert(restaurantMembers).values({ restaurantId: rid, userId: user.id, role: "owner" });
  const supplierRows = await db.insert(suppliers).values([
    { restaurantId: rid, name: "Afro Distribution Nantes", contactName: "Moussa K.", phone: "+33 2 40 00 11 22", whatsapp: "+33 6 00 11 22 33", city: "Nantes", categories: ["feculents", "epicerie", "boissons"], leadTimeHours: 24, minOrderEur: "80", deliveryFeeEur: "0", preferredChannel: "whatsapp", rating: "4.8" },
    { restaurantId: rid, name: "Tropic Import Paris", contactName: "Service commandes", email: "commandes@tropic-import.example", phone: "+33 1 40 00 22 33", city: "Paris", categories: ["feculents", "epicerie", "boissons", "viandes_poissons"], leadTimeHours: 72, minOrderEur: "150", deliveryFeeEur: "25", preferredChannel: "email", rating: "4.3" },
    { restaurantId: rid, name: "Primeurs du March\xE9 (MIN Nantes)", contactName: "Jean-Luc", phone: "+33 2 40 33 44 55", city: "Rez\xE9", categories: ["frais"], leadTimeHours: 24, deliveryDays: [1, 2, 3, 4, 5, 6], minOrderEur: "50", deliveryFeeEur: "10", preferredChannel: "telephone", rating: "4.5" },
    { restaurantId: rid, name: "Volailles Loire Atlantique", contactName: "Mme Gu\xE9rin", email: "contact@volailles-la.example", phone: "+33 2 40 66 77 88", city: "Ancenis", categories: ["viandes_poissons"], leadTimeHours: 48, deliveryDays: [2, 5], minOrderEur: "120", deliveryFeeEur: "0", preferredChannel: "email", rating: "4.9" },
    { restaurantId: rid, name: "Sahel \xC9pices (en ligne)", email: "pro@sahel-epices.example", city: "Lyon", categories: ["epicerie", "boissons"], leadTimeHours: 120, minOrderEur: "60", deliveryFeeEur: "15", preferredChannel: "plateforme", rating: "4.1" }
  ]).returning();
  const sup = Object.fromEntries(supplierRows.map((r) => [r.name, r.id]));
  const AFRO = sup["Afro Distribution Nantes"], TROPIC = sup["Tropic Import Paris"], PRIM = sup["Primeurs du March\xE9 (MIN Nantes)"], VOL = sup["Volailles Loire Atlantique"], SAHEL = sup["Sahel \xC9pices (en ligne)"];
  const offers = [
    [AFRO, "Riz parfum\xE9", "Sac 25 kg", 25, 42],
    [TROPIC, "Riz parfum\xE9", "Sac 25 kg", 25, 45],
    [SAHEL, "Riz parfum\xE9", "Sac 25 kg", 25, 39, false],
    [AFRO, "Riz bris\xE9", "Sac 25 kg", 25, 38.5],
    [TROPIC, "Riz bris\xE9", "Sac 25 kg", 25, 36.9],
    [AFRO, "Atti\xE9k\xE9", "Carton 10 kg", 10, 34],
    [TROPIC, "Atti\xE9k\xE9", "Carton 10 kg", 10, 31, false],
    [AFRO, "Plantain", "Carton 18 kg", 18, 27],
    [PRIM, "Plantain", "Carton 18 kg", 18, 29.5],
    [AFRO, "Igname", "Carton 20 kg", 20, 46],
    [PRIM, "Tomate", "Plateau 6 kg", 6, 9.6],
    [PRIM, "Oignon jaune", "Sac 10 kg", 10, 8.9],
    [PRIM, "Piment frais fort (habanero / antillais)", "Barquette 1 kg", 1, 7.8],
    [PRIM, "Gombo frais", "Carton 4 kg", 4, 18],
    [PRIM, "Feuilles de manioc", "Sachet 1 kg", 1, 6.5],
    [PRIM, "Ndol\xE9 (feuilles)", "Sachet 1 kg", 1, 7.9],
    [PRIM, "Manioc frais", "Carton 10 kg", 10, 16],
    [PRIM, "Patate douce", "Carton 10 kg", 10, 14],
    [TROPIC, "Crevettes s\xE9ch\xE9es", "Sachet 500 g", 0.5, 9.5],
    [PRIM, "Aubergine africaine (djakatou)", "Carton 5 kg", 5, 16.5],
    [PRIM, "Gingembre frais", "Carton 5 kg", 5, 17.5],
    [PRIM, "Citron vert", "Carton 4 kg", 4, 9.2],
    [PRIM, "Persil plat", "Botte", 1, 0.9],
    [PRIM, "Chou blanc", "Pi\xE8ce 2 kg", 2, 2.4],
    [PRIM, "Carotte", "Sac 10 kg", 10, 7.5],
    [VOL, "Poulet entier PAC", "Carton 10 kg", 10, 48],
    [TROPIC, "Poulet entier PAC", "Carton 10 kg", 10, 44],
    [VOL, "Cuisses de poulet", "Carton 10 kg", 10, 42],
    [VOL, "B\u0153uf \xE0 braiser (paleron / macreuse)", "Colis 5 kg", 5, 54.5],
    [VOL, "Mouton (\xE9paule / gigot)", "Colis 5 kg", 5, 62],
    [TROPIC, "Capitaine (thiof / m\xE9rou)", "Carton 10 kg", 10, 129],
    [TROPIC, "Tilapia entier", "Carton 10 kg", 10, 58],
    [TROPIC, "Poisson fum\xE9 (guedj / kong fum\xE9)", "Carton 5 kg", 5, 72],
    [AFRO, "Poisson fum\xE9 (guedj / kong fum\xE9)", "Carton 5 kg", 5, 75],
    [AFRO, "Huile de palme rouge", "Bidon 5 L", 5, 24.5],
    [TROPIC, "Huile de palme rouge", "Bidon 5 L", 5, 22],
    [SAHEL, "Huile de palme rouge", "Bidon 5 L", 5, 21.5],
    [AFRO, "Huile de tournesol", "Bidon 10 L", 10, 19.9],
    [AFRO, "P\xE2te d'arachide", "Seau 5 kg", 5, 27.5],
    [SAHEL, "P\xE2te d'arachide", "Seau 5 kg", 5, 25],
    [AFRO, "Double concentr\xE9 de tomate", "Bo\xEEte 4,5 kg", 4.5, 9.8],
    [AFRO, "Cube bouillon (volaille / b\u0153uf)", "Carton 240 cubes", 240, 19],
    [SAHEL, "Graines de n\xE9r\xE9 (soumbala)", "Sachet 1 kg", 1, 14],
    [AFRO, "Ail frais", "Filet 5 kg", 5, 17],
    [AFRO, "Moutarde de Dijon", "Seau 5 kg", 5, 12.5],
    [AFRO, "Vinaigre blanc", "Bidon 5 L", 5, 6.5],
    [AFRO, "Sel fin", "Sac 25 kg", 25, 9],
    [AFRO, "Sucre en poudre", "Sac 25 kg", 25, 26],
    [SAHEL, "Tamarin (pulpe)", "Bloc 1 kg", 1, 6.8],
    [AFRO, "Tamarin (pulpe)", "Bloc 1 kg", 1, 7.2],
    [AFRO, "Fleurs de bissap s\xE9ch\xE9es", "Sac 5 kg", 5, 39],
    [SAHEL, "Fleurs de bissap s\xE9ch\xE9es", "Sac 5 kg", 5, 34.5],
    [TROPIC, "Fleurs de bissap s\xE9ch\xE9es", "Sac 5 kg", 5, 37],
    [SAHEL, "Poudre de baobab (bouye)", "Sac 1 kg", 1, 11],
    [SAHEL, "Gingembre s\xE9ch\xE9 (tranches / poudre)", "Sac 1 kg", 1, 8.5],
    [PRIM, "Menthe fra\xEEche", "Botte", 1, 0.8],
    [AFRO, "Eau min\xE9rale 50 cl", "Pack 24", 24, 7.2],
    [AFRO, "Bi\xE8re Flag 33 cl", "Carton 24", 24, 31],
    [AFRO, "Barquette aluminium 1000 mL + couvercle", "Carton 500", 500, 62],
    [AFRO, "Sac kraft \xE0 poign\xE9es", "Carton 500", 500, 38],
    [AFRO, "Gobelet PET 33 cl / 50 cl (froid)", "Carton 1000", 1e3, 45]
  ];
  const offerRows = await db.insert(supplierOffers).values(
    offers.map(([supplierId, product, packLabel, packQty, packPrice, inStock = true]) => ({
      restaurantId: rid,
      supplierId,
      productId: pid(product),
      packLabel,
      packQty: num(packQty),
      packPriceEur: num(packPrice, 2),
      inStock
    }))
  ).returning();
  const ph = [];
  for (const o of offerRows) {
    const unitNow = Number(o.packPriceEur) / Number(o.packQty);
    const prodName = [...byName.entries()].find(([, id]) => id === o.productId)?.[0];
    const hike = o.supplierId === AFRO && prodName === "Huile de palme rouge" ? 0.12 : o.supplierId === VOL && prodName === "Poulet entier PAC" ? 0.09 : 0;
    for (const d of [90, 60, 30, 7, 0]) {
      const factor = hike && d >= 7 ? 1 / (1 + hike) : 1;
      ph.push({ restaurantId: rid, offerId: o.id, unitPriceEur: num(unitNow * factor, 4), source: d === 0 ? "catalogue" : "reception", recordedAt: daysAgo(d) });
    }
  }
  await db.insert(priceHistory).values(ph);
  const RECIPES = [
    { name: "Poulet brais\xE9", price: 18, ing: [["Poulet entier PAC", 0.45], ["Riz parfum\xE9", 0.12], ["Oignon jaune", 0.08], ["Huile de tournesol", 0.03], ["Piment frais fort (habanero / antillais)", 0.01], ["Moutarde de Dijon", 0.015], ["Cube bouillon (volaille / b\u0153uf)", 1], ["Plantain", 0.15]] },
    { name: "Maf\xE9 b\u0153uf", price: 16, ing: [["B\u0153uf \xE0 braiser (paleron / macreuse)", 0.2], ["P\xE2te d'arachide", 0.08], ["Riz parfum\xE9", 0.15], ["Tomate", 0.08], ["Double concentr\xE9 de tomate", 0.02], ["Oignon jaune", 0.06], ["Patate douce", 0.08], ["Carotte", 0.05], ["Huile de tournesol", 0.02], ["Cube bouillon (volaille / b\u0153uf)", 1]] },
    { name: "Yassa poulet", price: 16, ing: [["Cuisses de poulet", 0.35], ["Oignon jaune", 0.25], ["Citron vert", 0.06], ["Moutarde de Dijon", 0.02], ["Riz parfum\xE9", 0.15], ["Huile de tournesol", 0.03], ["Cube bouillon (volaille / b\u0153uf)", 1]] },
    { name: "Thi\xE9boudienne", price: 17, ing: [["Capitaine (thiof / m\xE9rou)", 0.25], ["Riz bris\xE9", 0.18], ["Tomate", 0.08], ["Double concentr\xE9 de tomate", 0.03], ["Chou blanc", 0.08], ["Carotte", 0.06], ["Manioc frais", 0.06], ["Aubergine africaine (djakatou)", 0.05], ["Huile de tournesol", 0.04], ["Poisson fum\xE9 (guedj / kong fum\xE9)", 0.02], ["Cube bouillon (volaille / b\u0153uf)", 1]] },
    { name: "Atti\xE9k\xE9 poisson", price: 15, ing: [["Atti\xE9k\xE9", 0.25], ["Tilapia entier", 0.35], ["Tomate", 0.08], ["Oignon jaune", 0.06], ["Piment frais fort (habanero / antillais)", 0.01], ["Huile de tournesol", 0.04], ["Citron vert", 0.03]] },
    { name: "Alloco", price: 6, ing: [["Plantain", 0.3], ["Huile de tournesol", 0.06], ["Piment frais fort (habanero / antillais)", 5e-3], ["Oignon jaune", 0.03]] },
    { name: "Ndol\xE9 crevettes", price: 17, ing: [["Ndol\xE9 (feuilles)", 0.15], ["P\xE2te d'arachide", 0.06], ["Crevettes s\xE9ch\xE9es", 0.03], ["B\u0153uf \xE0 braiser (paleron / macreuse)", 0.12], ["Oignon jaune", 0.05], ["Huile de palme rouge", 0.03], ["Plantain", 0.15], ["Ail frais", 5e-3]] },
    { name: "Saka-saka", price: 14, ing: [["Feuilles de manioc", 0.2], ["Huile de palme rouge", 0.04], ["Poisson fum\xE9 (guedj / kong fum\xE9)", 0.05], ["Oignon jaune", 0.04], ["Riz parfum\xE9", 0.15], ["Cube bouillon (volaille / b\u0153uf)", 1]] },
    { name: "Jus de bissap 33 cl", price: 3.5, ing: [["Fleurs de bissap s\xE9ch\xE9es", 0.02], ["Sucre en poudre", 0.04], ["Menthe fra\xEEche", 0.05], ["Gobelet PET 33 cl / 50 cl (froid)", 1]] },
    { name: "Jus de gingembre 33 cl", price: 3.5, ing: [["Gingembre frais", 0.06], ["Sucre en poudre", 0.04], ["Citron vert", 0.02], ["Gobelet PET 33 cl / 50 cl (froid)", 1]] }
  ];
  const recipeRows = await db.insert(recipes).values(RECIPES.map((r) => ({ restaurantId: rid, name: r.name, sellingPriceEur: num(r.price, 2) }))).returning();
  await db.insert(recipeIngredients).values(
    RECIPES.flatMap((r, i) => r.ing.map(([p, q2]) => ({ recipeId: recipeRows[i].id, productId: pid(p), quantity: num(q2, 4) })))
  );
  const BASE = { "Poulet brais\xE9": 18, "Maf\xE9 b\u0153uf": 10, "Yassa poulet": 12, "Thi\xE9boudienne": 9, "Atti\xE9k\xE9 poisson": 11, "Alloco": 14, "Ndol\xE9 crevettes": 5, "Saka-saka": 4, "Jus de bissap 33 cl": 22, "Jus de gingembre 33 cl": 15 };
  const salesRows = [];
  let seed = 42;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let d = 60; d >= 1; d--) {
    const date2 = daysAgo(d);
    const dow = date2.getDay();
    if (dow === 1) continue;
    const dayFactor = dow === 5 ? 1.45 : dow === 6 ? 1.6 : dow === 0 ? 1.2 : 1;
    for (const r of recipeRows) {
      const portions = Math.max(0, Math.round(BASE[r.name] * dayFactor * (0.8 + rnd() * 0.4)));
      if (portions) salesRows.push({ restaurantId: rid, recipeId: r.id, day: isoDay(date2), portions });
    }
  }
  await db.insert(sales).values(salesRows);
  const INV = [
    ["Riz parfum\xE9", 22, 15, 45, AFRO],
    ["Riz bris\xE9", 30, 10, 30, TROPIC],
    ["Atti\xE9k\xE9", 6, 8, 25, AFRO],
    ["Plantain", 14, 10, 30, AFRO],
    ["Igname", 12, 5, 20],
    ["Manioc frais", 4, 3, 8, PRIM],
    ["Patate douce", 9, 4, 12, PRIM],
    ["Tomate", 11, 8, 20, PRIM],
    ["Oignon jaune", 26, 12, 40, PRIM],
    ["Piment frais fort (habanero / antillais)", 1.5, 1, 3, PRIM],
    ["Gombo frais", 3, 2, 6, PRIM],
    ["Aubergine africaine (djakatou)", 2, 2, 6, PRIM],
    ["Feuilles de manioc", 1.2, 1.5, 4, PRIM],
    ["Ndol\xE9 (feuilles)", 2.5, 1.5, 4, PRIM],
    ["Gingembre frais", 6, 4, 10, PRIM],
    ["Citron vert", 5, 3, 8, PRIM],
    ["Chou blanc", 6, 4, 10, PRIM],
    ["Carotte", 7, 4, 12, PRIM],
    ["Menthe fra\xEEche", 6, 5, 15, PRIM],
    ["Poulet entier PAC", 34, 25, 70, VOL],
    ["Cuisses de poulet", 18, 15, 40, VOL],
    ["B\u0153uf \xE0 braiser (paleron / macreuse)", 9, 6, 15, VOL],
    ["Capitaine (thiof / m\xE9rou)", 7, 6, 15, TROPIC],
    ["Tilapia entier", 12, 8, 20, TROPIC],
    ["Poisson fum\xE9 (guedj / kong fum\xE9)", 3, 2, 6, AFRO],
    ["Crevettes s\xE9ch\xE9es", 1, 0.5, 2, TROPIC],
    ["Huile de palme rouge", 4, 5, 15, AFRO],
    ["Huile de tournesol", 22, 10, 30, AFRO],
    ["P\xE2te d'arachide", 6, 4, 10, AFRO],
    ["Double concentr\xE9 de tomate", 5, 3, 9, AFRO],
    ["Cube bouillon (volaille / b\u0153uf)", 180, 100, 480, AFRO],
    ["Ail frais", 2, 1, 5, AFRO],
    ["Moutarde de Dijon", 3, 2, 5, AFRO],
    ["Sucre en poudre", 18, 10, 30, AFRO],
    ["Sel fin", 12, 5, 25, AFRO],
    ["Fleurs de bissap s\xE9ch\xE9es", 2.5, 3, 10, AFRO],
    ["Gobelet PET 33 cl / 50 cl (froid)", 600, 400, 2e3, AFRO],
    ["Barquette aluminium 1000 mL + couvercle", 250, 200, 1e3, AFRO]
  ];
  const invRows = await db.insert(inventoryItems).values(
    INV.map(([p, qty3, critical, target, pref]) => ({ restaurantId: rid, productId: pid(p), quantity: num(qty3), criticalLevel: num(critical), targetLevel: num(target), preferredSupplierId: pref, lastCountedAt: daysAgo(0) }))
  ).returning();
  const pastOrders = [
    { sup: AFRO, d: 42, lines: [["Riz parfum\xE9", 2], ["Huile de palme rouge", 2], ["Cube bouillon (volaille / b\u0153uf)", 1]] },
    { sup: VOL, d: 40, lines: [["Poulet entier PAC", 4], ["B\u0153uf \xE0 braiser (paleron / macreuse)", 2]] },
    { sup: PRIM, d: 38, lines: [["Tomate", 3], ["Oignon jaune", 2], ["Plantain", 1]] },
    { sup: AFRO, d: 28, lines: [["Atti\xE9k\xE9", 2], ["Riz parfum\xE9", 2], ["Fleurs de bissap s\xE9ch\xE9es", 1]], late: true },
    { sup: VOL, d: 26, lines: [["Poulet entier PAC", 5], ["Cuisses de poulet", 2]] },
    { sup: TROPIC, d: 21, lines: [["Capitaine (thiof / m\xE9rou)", 1], ["Tilapia entier", 2], ["Riz bris\xE9", 2]], short: ["Riz bris\xE9", 45] },
    { sup: PRIM, d: 17, lines: [["Tomate", 3], ["Oignon jaune", 2], ["Gombo frais", 1], ["Piment frais fort (habanero / antillais)", 2]] },
    { sup: AFRO, d: 14, lines: [["Riz parfum\xE9", 2], ["Huile de palme rouge", 2], ["Sucre en poudre", 1]] },
    { sup: VOL, d: 12, lines: [["Poulet entier PAC", 5]] },
    { sup: PRIM, d: 9, lines: [["Tomate", 2], ["Oignon jaune", 2], ["Feuilles de manioc", 2], ["Menthe fra\xEEche", 20]] },
    { sup: AFRO, d: 5, lines: [["Atti\xE9k\xE9", 2], ["Plantain", 1]], late: true },
    { sup: VOL, d: 3, lines: [["Poulet entier PAC", 4], ["B\u0153uf \xE0 braiser (paleron / macreuse)", 1]] }
  ];
  let seq = 100;
  for (const po of pastOrders) {
    const lines = po.lines.map(([p, packs]) => {
      const offer = offerRows.find((o) => o.supplierId === po.sup && o.productId === pid(p));
      const qty3 = packs * Number(offer.packQty);
      const unit2 = Number(offer.packPriceEur) / Number(offer.packQty);
      return { offer, productId: pid(p), packs, quantity: qty3, unitPrice: unit2, total: packs * Number(offer.packPriceEur), productName: p };
    });
    const total = lines.reduce((a, l) => a + l.total, 0);
    const [order] = await db.insert(orders).values({
      restaurantId: rid,
      supplierId: po.sup,
      reference: `AFS-2026-${String(++seq).padStart(6, "0")}`,
      status: "livree",
      channel: "whatsapp",
      expectedAt: isoDay(daysAgo(po.d - 1)),
      totalEur: num(total, 2),
      createdBy: user.id,
      sentAt: daysAgo(po.d),
      deliveredAt: daysAgo(po.d - (po.late ? 3 : 1)),
      createdAt: daysAgo(po.d)
    }).returning();
    const lineRows = await db.insert(orderLines).values(lines.map((l) => ({
      orderId: order.id,
      productId: l.productId,
      offerId: l.offer.id,
      packLabel: l.offer.packLabel,
      packs: l.packs,
      quantity: num(l.quantity),
      unitPriceEur: num(l.unitPrice, 4),
      lineTotalEur: num(l.total, 2),
      receivedQty: num(po.short && po.short[0] === l.productName ? po.short[1] : l.quantity)
    }))).returning();
    const [delivery] = await db.insert(deliveries).values({ restaurantId: rid, orderId: order.id, receivedAt: order.deliveredAt, receivedBy: user.id, isLate: !!po.late, hasDiscrepancy: !!po.short }).returning();
    if (po.short) {
      const l = lineRows.find((x) => x.productId === pid(po.short[0]));
      await db.insert(deliveryDiscrepancies).values({ deliveryId: delivery.id, orderLineId: l.id, orderedQty: l.quantity, receivedQty: num(po.short[1]), reason: "manquant", claimMessage: `Bonjour, nous avons constat\xE9 un \xE9cart de ${Number(l.quantity) - po.short[1]} kg sur la livraison ${order.reference} (${po.short[0]} : command\xE9 ${l.quantity} kg, re\xE7u ${po.short[1]} kg). Merci de nous indiquer la suite \xE0 donner.`, resolved: true });
    }
    for (const l of lineRows) {
      const inv = invRows.find((i) => i.productId === l.productId);
      if (inv) await db.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: inv.id, type: "reception", quantity: l.receivedQty, unitCostEur: l.unitPriceEur, orderId: order.id, createdBy: user.id, createdAt: delivery.receivedAt });
    }
  }
  const invByProduct = new Map(invRows.map((i) => [i.productId, i.id]));
  await db.insert(reorderRules).values([
    { restaurantId: rid, inventoryItemId: invByProduct.get(pid("Riz parfum\xE9")), threshold: "15", reorderQty: "50", supplierStrategy: "best" },
    { restaurantId: rid, inventoryItemId: invByProduct.get(pid("Poulet entier PAC")), threshold: "25", reorderQty: "50", supplierStrategy: "preferred" },
    { restaurantId: rid, inventoryItemId: invByProduct.get(pid("Huile de palme rouge")), threshold: "5", reorderQty: "15", supplierStrategy: "best" }
  ]);
  console.log(`[seed] Restaurant d\xE9mo \xAB Chez Awa \xBB cr\xE9\xE9 (${rid}) \u2014 login awa@chezawa.fr / demo1234`);
  return { restaurantId: rid };
}
var daysAgo, isoDay, num;
var init_seed = __esm({
  "packages/db/src/seed.ts"() {
    "use strict";
    init_client();
    init_schema();
    init_products();
    daysAgo = (n15) => new Date(Date.now() - n15 * 864e5);
    isoDay = (d) => d.toISOString().slice(0, 10);
    num = (v, dec = 3) => v.toFixed(dec);
    if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
      seedDemo({ force: process.argv.includes("--force") }).then(() => process.exit(0)).catch((e) => {
        console.error(e);
        process.exit(1);
      });
    }
  }
});

// packages/db/src/data/recipes.ts
var RECIPE_TEMPLATES;
var init_recipes = __esm({
  "packages/db/src/data/recipes.ts"() {
    "use strict";
    RECIPE_TEMPLATES = [
      // ---------------- Sénégal ----------------
      { name: "Thi\xE9boudienne (riz au poisson)", region: "S\xE9n\xE9gal", suggestedPrice: 17, category: "plat", ingredients: [
        ["Capitaine (thiof / m\xE9rou)", 0.25],
        ["Riz bris\xE9", 0.18],
        ["Tomate", 0.08],
        ["Double concentr\xE9 de tomate", 0.03],
        ["Chou blanc", 0.08],
        ["Carotte", 0.06],
        ["Manioc frais", 0.06],
        ["Aubergine africaine (djakatou)", 0.05],
        ["Navet", 0.04],
        ["Huile d'arachide", 0.04],
        ["Poisson fum\xE9 (guedj / kong fum\xE9)", 0.02],
        ["Yet (mollusque ferment\xE9)", 5e-3],
        ["Oignon jaune", 0.05],
        ["Persil plat", 0.1],
        ["Ail frais", 5e-3],
        ["Cube bouillon (volaille / b\u0153uf)", 1],
        ["Piment frais fort (habanero / antillais)", 5e-3],
        ["Tamarin (pulpe)", 0.01]
      ] },
      { name: "Yassa poulet", region: "S\xE9n\xE9gal", suggestedPrice: 16, category: "plat", ingredients: [
        ["Cuisses de poulet", 0.35],
        ["Oignon jaune", 0.25],
        ["Citron vert", 0.06],
        ["Moutarde de Dijon", 0.02],
        ["Riz parfum\xE9", 0.15],
        ["Huile de tournesol", 0.03],
        ["Vinaigre blanc", 0.01],
        ["Ail frais", 5e-3],
        ["Laurier", 1e-3],
        ["Cube bouillon (volaille / b\u0153uf)", 1],
        ["Piment frais fort (habanero / antillais)", 5e-3]
      ] },
      { name: "Yassa poisson", region: "S\xE9n\xE9gal", suggestedPrice: 16, category: "plat", ingredients: [
        ["Daurade royale / grise", 0.35],
        ["Oignon jaune", 0.25],
        ["Citron vert", 0.06],
        ["Moutarde de Dijon", 0.02],
        ["Riz parfum\xE9", 0.15],
        ["Huile de tournesol", 0.04],
        ["Ail frais", 5e-3],
        ["Cube bouillon (volaille / b\u0153uf)", 1]
      ] },
      { name: "Maf\xE9 b\u0153uf (sauce arachide)", region: "S\xE9n\xE9gal / Mali", suggestedPrice: 16, category: "plat", ingredients: [
        ["B\u0153uf \xE0 braiser (paleron / macreuse)", 0.2],
        ["P\xE2te d'arachide", 0.08],
        ["Riz parfum\xE9", 0.15],
        ["Tomate", 0.08],
        ["Double concentr\xE9 de tomate", 0.02],
        ["Oignon jaune", 0.06],
        ["Patate douce", 0.08],
        ["Carotte", 0.05],
        ["Chou blanc", 0.04],
        ["Huile de tournesol", 0.02],
        ["Ail frais", 5e-3],
        ["Cube bouillon (volaille / b\u0153uf)", 1],
        ["Piment frais fort (habanero / antillais)", 5e-3]
      ] },
      { name: "Maf\xE9 poulet", region: "S\xE9n\xE9gal / Mali", suggestedPrice: 15, category: "plat", ingredients: [
        ["Cuisses de poulet", 0.3],
        ["P\xE2te d'arachide", 0.08],
        ["Riz parfum\xE9", 0.15],
        ["Tomate", 0.08],
        ["Double concentr\xE9 de tomate", 0.02],
        ["Oignon jaune", 0.06],
        ["Patate douce", 0.08],
        ["Carotte", 0.05],
        ["Huile de tournesol", 0.02],
        ["Cube bouillon (volaille / b\u0153uf)", 1]
      ] },
      { name: "Thiou / soupou kandia (sauce gombo)", region: "S\xE9n\xE9gal", suggestedPrice: 16, category: "plat", ingredients: [
        ["Gombo frais", 0.15],
        ["B\u0153uf \xE0 bouillir (jarret / plat de c\xF4te)", 0.15],
        ["Poisson fum\xE9 (guedj / kong fum\xE9)", 0.03],
        ["Crevettes s\xE9ch\xE9es", 0.01],
        ["Huile de palme rouge", 0.04],
        ["Riz bris\xE9", 0.18],
        ["Oignon jaune", 0.05],
        ["Cube bouillon (volaille / b\u0153uf)", 1],
        ["Piment frais fort (habanero / antillais)", 5e-3]
      ] },
      { name: "Dibi (mouton grill\xE9)", region: "S\xE9n\xE9gal", suggestedPrice: 19, category: "plat", ingredients: [
        ["Mouton (\xE9paule / gigot)", 0.35],
        ["Oignon jaune", 0.12],
        ["Moutarde de Dijon", 0.015],
        ["Huile de tournesol", 0.02],
        ["Poivre noir grains / moulu", 2e-3],
        ["Cube bouillon (volaille / b\u0153uf)", 1],
        ["Pain (baguette)", 0.5],
        ["Pomme de terre", 0.15]
      ] },
      { name: "Pastels (beignets farcis au poisson)", region: "S\xE9n\xE9gal", suggestedPrice: 7, category: "entree", ingredients: [
        ["Farine de bl\xE9 T55", 0.08],
        ["Thon en bo\xEEte", 0.05],
        ["Oignon jaune", 0.03],
        ["Persil plat", 0.05],
        ["Huile de tournesol", 0.06],
        ["Tomate", 0.04],
        ["Piment frais fort (habanero / antillais)", 3e-3],
        ["Levure chimique / boulang\xE8re", 2e-3],
        ["Cube bouillon (volaille / b\u0153uf)", 0.5]
      ] },
      { name: "Thiakry (dessert mil-yaourt)", region: "S\xE9n\xE9gal", suggestedPrice: 5, category: "dessert", ingredients: [
        ["Thiakry (araw)", 0.06],
        ["Yaourt nature", 0.12],
        ["Lait concentr\xE9 sucr\xE9", 0.03],
        ["Sucre en poudre", 0.01],
        ["Vanille (gousses / ar\xF4me)", 0.01],
        ["Muscade", 5e-4]
      ] },
      // ---------------- Côte d'Ivoire ----------------
      { name: "Atti\xE9k\xE9 poisson brais\xE9", region: "C\xF4te d'Ivoire", suggestedPrice: 15, category: "plat", ingredients: [
        ["Atti\xE9k\xE9", 0.25],
        ["Tilapia entier", 0.4],
        ["Tomate", 0.08],
        ["Oignon jaune", 0.06],
        ["Piment frais fort (habanero / antillais)", 0.01],
        ["Huile de tournesol", 0.04],
        ["Citron vert", 0.03],
        ["M\xE9lange \xE9pices poisson brais\xE9", 0.01],
        ["Moutarde de Dijon", 0.01],
        ["Ail frais", 5e-3],
        ["Gingembre frais", 5e-3],
        ["Cube bouillon (volaille / b\u0153uf)", 1]
      ] },
      { name: "Poulet brais\xE9 + atti\xE9k\xE9 / alloco", region: "C\xF4te d'Ivoire", suggestedPrice: 18, category: "plat", ingredients: [
        ["Poulet entier PAC", 0.45],
        ["Atti\xE9k\xE9", 0.15],
        ["Plantain", 0.15],
        ["Oignon jaune", 0.08],
        ["Tomate", 0.05],
        ["Huile de tournesol", 0.05],
        ["Moutarde de Dijon", 0.015],
        ["M\xE9lange \xE9pices poulet (tandoori / yaourt)", 0.01],
        ["Ail frais", 5e-3],
        ["Gingembre frais", 5e-3],
        ["Piment frais fort (habanero / antillais)", 0.01],
        ["Cube bouillon (volaille / b\u0153uf)", 1]
      ] },
      { name: "Alloco (plantain frit)", region: "C\xF4te d'Ivoire", suggestedPrice: 6, category: "accompagnement", ingredients: [
        ["Plantain", 0.3],
        ["Huile de tournesol", 0.06],
        ["Piment frais fort (habanero / antillais)", 5e-3],
        ["Oignon jaune", 0.03],
        ["\u0152ufs", 0.5]
      ] },
      { name: "Garba (atti\xE9k\xE9 + thon frit)", region: "C\xF4te d'Ivoire", suggestedPrice: 9, category: "plat", ingredients: [
        ["Garba (atti\xE9k\xE9 grain moyen)", 0.25],
        ["Thon en bo\xEEte", 0.12],
        ["Huile de tournesol", 0.05],
        ["Tomate", 0.05],
        ["Oignon jaune", 0.04],
        ["Piment frais fort (habanero / antillais)", 0.01],
        ["Cube bouillon (volaille / b\u0153uf)", 0.5]
      ] },
      { name: "Kedjenou de poulet", region: "C\xF4te d'Ivoire", suggestedPrice: 17, category: "plat", ingredients: [
        ["Poulet fermier / bicyclette", 0.4],
        ["Tomate", 0.1],
        ["Oignon jaune", 0.08],
        ["Aubergine africaine (djakatou)", 0.06],
        ["Gingembre frais", 0.01],
        ["Ail frais", 5e-3],
        ["Piment frais fort (habanero / antillais)", 0.01],
        ["Laurier", 1e-3],
        ["Thym s\xE9ch\xE9", 1e-3],
        ["Cube bouillon (volaille / b\u0153uf)", 1],
        ["Atti\xE9k\xE9", 0.2]
      ] },
      { name: "Sauce graine (noix de palme) + riz / foutou", region: "C\xF4te d'Ivoire", suggestedPrice: 16, category: "plat", ingredients: [
        ["Concentr\xE9 de noix de palme (sauce graine)", 0.15],
        ["B\u0153uf \xE0 braiser (paleron / macreuse)", 0.12],
        ["Poisson fum\xE9 (guedj / kong fum\xE9)", 0.03],
        ["Aubergine africaine (djakatou)", 0.05],
        ["Gombo frais", 0.03],
        ["Oignon jaune", 0.04],
        ["Tomate", 0.04],
        ["Piment frais fort (habanero / antillais)", 5e-3],
        ["Cube bouillon (volaille / b\u0153uf)", 1],
        ["Riz parfum\xE9", 0.15]
      ] },
      { name: "Foutou banane / igname", region: "C\xF4te d'Ivoire", suggestedPrice: 5, category: "accompagnement", ingredients: [
        ["Plantain", 0.2],
        ["Manioc frais", 0.1],
        ["Igname", 0.15]
      ] },
      // ---------------- Cameroun / Afrique centrale ----------------
      { name: "Ndol\xE9 crevettes + plantain / b\xE2ton de manioc", region: "Cameroun", suggestedPrice: 17, category: "plat", ingredients: [
        ["Ndol\xE9 (feuilles)", 0.12],
        ["P\xE2te d'arachide", 0.06],
        ["Crevettes s\xE9ch\xE9es", 0.02],
        ["Crevettes fra\xEEches / surgel\xE9es", 0.06],
        ["B\u0153uf \xE0 braiser (paleron / macreuse)", 0.12],
        ["Oignon jaune", 0.06],
        ["Ail frais", 5e-3],
        ["Huile de tournesol", 0.03],
        ["Cube bouillon (volaille / b\u0153uf)", 1],
        ["Bicarbonate de soude", 2e-3],
        ["Plantain", 0.15],
        ["B\xE2ton de manioc", 0.5]
      ] },
      { name: "Poulet DG (directeur g\xE9n\xE9ral)", region: "Cameroun", suggestedPrice: 19, category: "plat", ingredients: [
        ["Poulet fermier / bicyclette", 0.4],
        ["Plantain", 0.25],
        ["Carotte", 0.05],
        ["Haricot vert", 0.05],
        ["Poivron vert", 0.04],
        ["Poivron rouge", 0.04],
        ["Tomate", 0.06],
        ["Oignon jaune", 0.06],
        ["Ail frais", 5e-3],
        ["Gingembre frais", 5e-3],
        ["C\xE9leri branche", 0.05],
        ["Huile de tournesol", 0.06],
        ["Cube bouillon (volaille / b\u0153uf)", 1]
      ] },
      { name: "Poisson brais\xE9 camerounais + miondo", region: "Cameroun", suggestedPrice: 18, category: "plat", ingredients: [
        ["Daurade royale / grise", 0.45],
        ["B\xE2ton de manioc", 1],
        ["M\xE9lange \xE9pices poisson brais\xE9", 0.015],
        ["Poivre blanc de Penja", 2e-3],
        ["Ail frais", 5e-3],
        ["Gingembre frais", 0.01],
        ["C\xE9leri branche", 0.05],
        ["Persil plat", 0.05],
        ["Basilic africain (djindja / nchanwu)", 0.05],
        ["Huile de tournesol", 0.04],
        ["Tomate", 0.06],
        ["Oignon jaune", 0.05],
        ["Piment frais fort (habanero / antillais)", 0.01],
        ["Cube bouillon (volaille / b\u0153uf)", 1]
      ] },
      { name: "Saka-saka / pondu (feuilles de manioc)", region: "Congo / RDC", suggestedPrice: 14, category: "plat", ingredients: [
        ["Feuilles de manioc", 0.2],
        ["Huile de palme rouge", 0.04],
        ["Poisson fum\xE9 (guedj / kong fum\xE9)", 0.05],
        ["P\xE2te d'arachide", 0.03],
        ["Oignon jaune", 0.04],
        ["Aubergine violette", 0.04],
        ["Riz parfum\xE9", 0.15],
        ["Cube bouillon (volaille / b\u0153uf)", 1],
        ["Piment frais fort (habanero / antillais)", 5e-3]
      ] },
      { name: "Eru / okok", region: "Cameroun", suggestedPrice: 16, category: "plat", ingredients: [
        ["Eru / okok (gnetum)", 0.1],
        ["Waterleaf", 0.5],
        ["Huile de palme rouge", 0.05],
        ["Peau de b\u0153uf (kanda / ponmo)", 0.06],
        ["B\u0153uf \xE0 bouillir (jarret / plat de c\xF4te)", 0.1],
        ["Crevettes s\xE9ch\xE9es", 0.02],
        ["Poisson s\xE9ch\xE9 sal\xE9 (kethiakh / stockfish)", 0.03],
        ["Cube bouillon (volaille / b\u0153uf)", 1],
        ["Gari", 0.1]
      ] },
      // ---------------- Nigeria / Ghana ----------------
      { name: "Jollof rice + poulet", region: "Nigeria / Ghana", suggestedPrice: 15, category: "plat", ingredients: [
        ["Riz \xE9tuv\xE9", 0.18],
        ["Tomates pel\xE9es", 0.1],
        ["Double concentr\xE9 de tomate", 0.03],
        ["Poivron rouge", 0.05],
        ["Oignon jaune", 0.06],
        ["Piment frais fort (habanero / antillais)", 8e-3],
        ["Huile de tournesol", 0.04],
        ["Curry en poudre", 2e-3],
        ["Thym s\xE9ch\xE9", 1e-3],
        ["Laurier", 1e-3],
        ["Cube bouillon (volaille / b\u0153uf)", 1],
        ["Cuisses de poulet", 0.3]
      ] },
      { name: "Egusi soup + pounded yam / eba", region: "Nigeria", suggestedPrice: 16, category: "plat", ingredients: [
        ["Graines d'egusi", 0.08],
        ["Huile de palme rouge", 0.05],
        ["\xC9pinard surgel\xE9", 0.08],
        ["B\u0153uf \xE0 bouillir (jarret / plat de c\xF4te)", 0.12],
        ["Silure fum\xE9 (catfish)", 0.04],
        ["Crevettes s\xE9ch\xE9es", 0.015],
        ["Peau de b\u0153uf (kanda / ponmo)", 0.04],
        ["Oignon jaune", 0.04],
        ["Piment frais fort (habanero / antillais)", 8e-3],
        ["Cube bouillon (volaille / b\u0153uf)", 1],
        ["Farine de foufou (igname)", 0.15]
      ] },
      { name: "Suya (brochettes b\u0153uf \xE9pic\xE9es)", region: "Nigeria", suggestedPrice: 12, category: "entree", ingredients: [
        ["Bavette / faux-filet", 0.2],
        ["Suya / yaji (\xE9pices kilichi)", 0.015],
        ["Huile de tournesol", 0.01],
        ["Oignon rouge", 0.05],
        ["Tomate", 0.05]
      ] },
      { name: "Pepper soup (poisson / ch\xE8vre)", region: "Nigeria / Cameroun", suggestedPrice: 14, category: "plat", ingredients: [
        ["Silure (poisson-chat)", 0.3],
        ["Pebe (\xE9pices pepper soup)", 8e-3],
        ["Poivre de Guin\xE9e (maniguette)", 2e-3],
        ["Basilic africain (djindja / nchanwu)", 0.05],
        ["Oignon jaune", 0.04],
        ["Piment frais fort (habanero / antillais)", 8e-3],
        ["Cube bouillon (volaille / b\u0153uf)", 1],
        ["Igname", 0.1]
      ] },
      { name: "Red red (haricots \xE0 l'huile de palme + plantain)", region: "Ghana", suggestedPrice: 12, category: "plat", ingredients: [
        ["Haricots blancs (ni\xE9b\xE9)", 0.12],
        ["Huile de palme rouge", 0.04],
        ["Tomate", 0.06],
        ["Oignon jaune", 0.05],
        ["Gingembre frais", 5e-3],
        ["Plantain", 0.25],
        ["Huile de tournesol", 0.04],
        ["Cube bouillon (volaille / b\u0153uf)", 1]
      ] },
      // ---------------- Boissons ----------------
      { name: "Jus de bissap 33 cl", region: "Panafricain", suggestedPrice: 3.5, category: "boisson", ingredients: [
        ["Fleurs de bissap s\xE9ch\xE9es", 0.02],
        ["Sucre en poudre", 0.04],
        ["Menthe fra\xEEche", 0.05],
        ["Vanille (gousses / ar\xF4me)", 2e-3],
        ["Gobelet PET 33 cl / 50 cl (froid)", 1]
      ] },
      { name: "Jus de gingembre (gnamakoudji) 33 cl", region: "Panafricain", suggestedPrice: 3.5, category: "boisson", ingredients: [
        ["Gingembre frais", 0.06],
        ["Sucre en poudre", 0.04],
        ["Citron vert", 0.02],
        ["Ananas", 0.05],
        ["Gobelet PET 33 cl / 50 cl (froid)", 1]
      ] },
      { name: "Jus de bouye (baobab) 33 cl", region: "S\xE9n\xE9gal / Mali", suggestedPrice: 3.5, category: "boisson", ingredients: [
        ["Poudre de baobab (bouye)", 0.03],
        ["Sucre en poudre", 0.035],
        ["Lait concentr\xE9 sucr\xE9", 0.02],
        ["Vanille (gousses / ar\xF4me)", 2e-3],
        ["Gobelet PET 33 cl / 50 cl (froid)", 1]
      ] },
      { name: "Jus de tamarin (dakhar) 33 cl", region: "S\xE9n\xE9gal", suggestedPrice: 3.5, category: "boisson", ingredients: [
        ["Tamarin (pulpe)", 0.03],
        ["Sucre en poudre", 0.04],
        ["Gobelet PET 33 cl / 50 cl (froid)", 1]
      ] },
      { name: "Ataya (th\xE9 \xE0 la menthe)", region: "S\xE9n\xE9gal / Mali", suggestedPrice: 2.5, category: "boisson", ingredients: [
        ["Th\xE9 vert de Chine (ataya)", 0.01],
        ["Sucre en poudre", 0.03],
        ["Menthe fra\xEEche", 0.1]
      ] }
    ];
  }
});

// packages/db/src/data/index.ts
var init_data = __esm({
  "packages/db/src/data/index.ts"() {
    "use strict";
    init_products();
    init_recipes();
  }
});

// packages/db/src/index.ts
var src_exports = {};
__export(src_exports, {
  CATEGORY_LABELS: () => CATEGORY_LABELS,
  ORDER_MAX_MONTHS_OF_STOCK: () => ORDER_MAX_MONTHS_OF_STOCK,
  RECIPE_TEMPLATES: () => RECIPE_TEMPLATES,
  REFERENCE_PRODUCTS: () => REFERENCE_PRODUCTS,
  alertKind: () => alertKind,
  alertSeverity: () => alertSeverity,
  alerts: () => alerts,
  alertsRelations: () => alertsRelations,
  auditLog: () => auditLog,
  billingEvents: () => billingEvents,
  ceilingMessage: () => ceilingMessage,
  claims: () => claims,
  commissionInvoices: () => commissionInvoices,
  commissions: () => commissions,
  deliveries: () => deliveries,
  deliveriesRelations: () => deliveriesRelations,
  deliveryDiscrepancies: () => deliveryDiscrepancies,
  deliveryDiscrepanciesRelations: () => deliveryDiscrepanciesRelations,
  feedback: () => feedback,
  findReferenceProduct: () => findReferenceProduct,
  forecasts: () => forecasts,
  getDb: () => getDb,
  groupBuyParticipations: () => groupBuyParticipations,
  groupBuyStatus: () => groupBuyStatus,
  groupBuys: () => groupBuys,
  inventoryItems: () => inventoryItems,
  inventoryItemsRelations: () => inventoryItemsRelations,
  isNeon: () => isNeon,
  jobRuns: () => jobRuns,
  leadStatus: () => leadStatus,
  leads: () => leads,
  measuredMonthlyUse: () => measuredMonthlyUse,
  memberRole: () => memberRole,
  movementType: () => movementType,
  normalize: () => normalize,
  notifications: () => notifications,
  orderChannel: () => orderChannel,
  orderEvents: () => orderEvents,
  orderLines: () => orderLines,
  orderLinesRelations: () => orderLinesRelations,
  orderStatus: () => orderStatus,
  orders: () => orders,
  ordersRelations: () => ordersRelations,
  passwordResets: () => passwordResets,
  plan: () => plan,
  priceHistory: () => priceHistory,
  priceHistoryRelations: () => priceHistoryRelations,
  productCategory: () => productCategory,
  products: () => products,
  prospects: () => prospects,
  quantityCeiling: () => quantityCeiling,
  recipeIngredients: () => recipeIngredients,
  recipeIngredientsRelations: () => recipeIngredientsRelations,
  recipes: () => recipes,
  recipesRelations: () => recipesRelations,
  recurringOrders: () => recurringOrders,
  reorderRules: () => reorderRules,
  restaurantMembers: () => restaurantMembers,
  restaurants: () => restaurants,
  restaurantsRelations: () => restaurantsRelations,
  runMigrations: () => runMigrations,
  sales: () => sales,
  salesRelations: () => salesRelations,
  schema: () => schema_exports,
  seedDemo: () => seedDemo,
  shoppingLists: () => shoppingLists,
  stockMovements: () => stockMovements,
  stockMovementsRelations: () => stockMovementsRelations,
  supplierOffers: () => supplierOffers,
  supplierOffersRelations: () => supplierOffersRelations,
  suppliers: () => suppliers,
  suppliersRelations: () => suppliersRelations,
  unit: () => unit,
  usageEvents: () => usageEvents,
  users: () => users,
  vendorCustomerPrices: () => vendorCustomerPrices,
  vendorMembers: () => vendorMembers,
  vendorOffers: () => vendorOffers,
  vendorPriceTiers: () => vendorPriceTiers,
  vendorReviews: () => vendorReviews,
  vendorRoutes: () => vendorRoutes,
  vendorStatus: () => vendorStatus,
  vendors: () => vendors
});
var init_src = __esm({
  "packages/db/src/index.ts"() {
    "use strict";
    init_schema();
    init_schema();
    init_client();
    init_limits();
    init_migrate();
    init_seed();
    init_data();
  }
});

// apps/api/src/lib/billing.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { and as and2, eq as eq3, isNull } from "drizzle-orm";
async function stripe(method, path3, params = {}, opts = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY manquante");
  const body3 = new URLSearchParams();
  const enc = (prefix, v) => {
    if (v === void 0 || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => enc(`${prefix}[${i}]`, x));
    else if (typeof v === "object") Object.entries(v).forEach(([k, x]) => enc(`${prefix}[${k}]`, x));
    else body3.append(prefix, String(v));
  };
  Object.entries(params).forEach(([k, v]) => enc(k, v));
  const url = `https://api.stripe.com/v1${path3}${method === "GET" && body3.size ? `?${body3}` : ""}`;
  const headers = { Authorization: `Bearer ${key}`, "Stripe-Version": "2024-06-20" };
  if (method !== "GET") headers["content-type"] = "application/x-www-form-urlencoded";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const res = await fetch(url, { method, headers, body: method === "GET" ? void 0 : body3 });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${json.error?.message ?? "erreur"}`);
  return json;
}
function verifyStripeSignature(rawBody, header, secret2 = process.env.STRIPE_WEBHOOK_SECRET, toleranceSec = 300) {
  if (!header || !secret2) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1e3 - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret2).update(`${t}.${rawBody}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}
async function ensureCustomer(rid, email) {
  const db = await getDb();
  const [r] = await db.select().from(restaurants).where(eq3(restaurants.id, rid));
  if (r.stripeCustomerId) return r.stripeCustomerId;
  const cus = await stripe("POST", "/customers", { email, name: r.name, metadata: { restaurantId: rid } }, { idempotencyKey: `cus-${rid}` });
  await db.update(restaurants).set({ stripeCustomerId: cus.id }).where(eq3(restaurants.id, rid));
  return cus.id;
}
async function createCheckout(rid, email, plan2) {
  const price = priceIdFor(plan2);
  if (!price) throw new Error(`Prix Stripe non configur\xE9 pour ${plan2} (STRIPE_PRICE_${plan2.toUpperCase()})`);
  const db = await getDb();
  const [r] = await db.select().from(restaurants).where(eq3(restaurants.id, rid));
  const customer = await ensureCustomer(rid, email);
  const trialLeft = r.trialEndsAt ? Math.ceil((new Date(r.trialEndsAt).getTime() - Date.now()) / 864e5) : 0;
  const params = {
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    locale: "fr",
    allow_promotion_codes: true,
    success_url: `${APP()}/app/abonnement?checkout=ok&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP()}/app/abonnement?checkout=annule`,
    subscription_data: { metadata: { restaurantId: rid, plan: plan2 }, ...trialLeft > 1 ? { trial_period_days: Math.min(trialLeft, 30) } : {} },
    // l'essai en cours est conservé
    metadata: { restaurantId: rid, plan: plan2 },
    customer_update: { address: "auto", name: "auto" },
    tax_id_collection: { enabled: true },
    billing_address_collection: "required"
  };
  if (r.founder && process.env.STRIPE_COUPON_FOUNDER) params.discounts = [{ coupon: process.env.STRIPE_COUPON_FOUNDER }];
  if (params.discounts) delete params.allow_promotion_codes;
  return stripe("POST", "/checkout/sessions", params);
}
async function createPortal(rid, email) {
  const customer = await ensureCustomer(rid, email);
  return stripe("POST", "/billing_portal/sessions", { customer, locale: "fr", return_url: `${APP()}/app/abonnement` });
}
async function applySubscription(sub) {
  const db = await getDb();
  const rid = sub.metadata?.restaurantId;
  const priceId = sub.items?.data?.[0]?.price?.id;
  const plan2 = ["starter", "pro", "business"].find((p) => priceIdFor(p) === priceId) ?? sub.metadata?.plan;
  const where = rid ? eq3(restaurants.id, rid) : eq3(restaurants.stripeCustomerId, sub.customer);
  const status = STATUS_MAP[sub.status] ?? sub.status;
  const patch = { stripeSubscriptionId: sub.id, subscriptionStatus: status, currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1e3) : null };
  if (plan2 && status !== "canceled") patch.plan = plan2;
  if (status === "canceled") patch.plan = "trial";
  await db.update(restaurants).set(patch).where(where);
  return { rid, plan: plan2, status };
}
function accessState(r, now = /* @__PURE__ */ new Date()) {
  const trialDaysLeft = r.trialEndsAt ? Math.ceil((r.trialEndsAt.getTime() - now.getTime()) / 864e5) : null;
  if (r.subscriptionStatus === "active") return { state: "active", trialDaysLeft, blocked: false };
  if (r.subscriptionStatus === "past_due") {
    const grace = r.currentPeriodEnd ? (now.getTime() - r.currentPeriodEnd.getTime()) / 864e5 : 0;
    return { state: "past_due", trialDaysLeft, blocked: grace > 14 };
  }
  if (r.subscriptionStatus === "canceled" || r.subscriptionStatus === "expired") return { state: "expired", trialDaysLeft, blocked: true };
  if (trialDaysLeft !== null && trialDaysLeft <= 0) return { state: "expired", trialDaysLeft, blocked: true };
  return { state: "trialing", trialDaysLeft, blocked: false };
}
async function sweepTrials(now = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  const rows = await db.select().from(restaurants).where(and2(eq3(restaurants.subscriptionStatus, "trialing"), isNull(restaurants.stripeSubscriptionId)));
  const expired = [];
  const reminders = [];
  for (const r of rows) {
    const s = accessState(r, now);
    if (s.state === "expired") {
      await db.update(restaurants).set({ subscriptionStatus: "expired" }).where(eq3(restaurants.id, r.id));
      expired.push(r.id);
    } else if (s.trialDaysLeft !== null && [7, 3, 1].includes(s.trialDaysLeft)) reminders.push({ id: r.id, name: r.name, daysLeft: s.trialDaysLeft });
  }
  return { expired, reminders };
}
var PLAN_RANK, stripeConfigured, billingEnforced, priceIdFor, APP, STATUS_MAP;
var init_billing = __esm({
  "apps/api/src/lib/billing.ts"() {
    "use strict";
    init_src();
    PLAN_RANK = { trial: 2, starter: 1, pro: 2, business: 3 };
    stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;
    billingEnforced = () => process.env.BILLING_ENFORCE === "true" || stripeConfigured() && process.env.BILLING_ENFORCE !== "false";
    priceIdFor = (plan2) => process.env[`STRIPE_PRICE_${plan2.toUpperCase()}`] ?? null;
    APP = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    STATUS_MAP = { trialing: "trialing", active: "active", past_due: "past_due", unpaid: "past_due", canceled: "canceled", incomplete: "trialing", incomplete_expired: "canceled", paused: "canceled" };
  }
});

// apps/api/src/lib/security.ts
function checkSecureConfig(env = process.env) {
  const errors2 = [];
  const warnings2 = [];
  const prod = isProd(env);
  const secret2 = (env.JWT_SECRET ?? "").trim();
  if (!secret2) {
    errors2.push("JWT_SECRET est absent : sans secret, les sessions ne peuvent pas \xEAtre sign\xE9es de fa\xE7on s\xFBre.");
  } else if (DEV_SECRETS.has(secret2) || secret2.length < 32) {
    const msg = `JWT_SECRET est trop faible (${secret2.length} caract\xE8res${DEV_SECRETS.has(secret2) ? ", valeur de d\xE9veloppement" : ""}) : utilisez au moins 32 caract\xE8res al\xE9atoires (openssl rand -hex 32).`;
    if (prod) errors2.push(msg);
    else warnings2.push(msg);
  }
  if (prod && !env.DATABASE_URL?.trim()) {
    errors2.push("DATABASE_URL est absent en production : la base serait une base locale \xE9ph\xE9m\xE8re (donn\xE9es perdues \xE0 chaque d\xE9ploiement).");
  }
  if (env.SEED_DEMO === "true" && prod && env.ALLOW_DEMO_SEED !== "true") {
    errors2.push("SEED_DEMO=true en production cr\xE9erait le restaurant de d\xE9monstration avec des identifiants publics (awa@chezawa.fr / demo1234). Retirez SEED_DEMO, ou assumez-le explicitement avec ALLOW_DEMO_SEED=true.");
  }
  if (prod && !env.CRON_SECRET?.trim()) warnings2.push("CRON_SECRET absent : le job quotidien (mail du matin, rappels grossistes) r\xE9pondra 503.");
  if (prod && !env.ADMIN_EMAILS?.trim()) warnings2.push("ADMIN_EMAILS absent : aucune personne ne peut valider les fournisseurs plateforme ni voir les leads.");
  if (prod && env.VENDOR_AUTO_APPROVE === "true") warnings2.push("VENDOR_AUTO_APPROVE=true : tout fournisseur qui s\u2019inscrit est publi\xE9 sans v\xE9rification.");
  if (prod && !env.RESEND_API_KEY?.trim()) warnings2.push("RESEND_API_KEY absent : les e-mails (r\xE9initialisation de mot de passe incluse) ne partiront pas.");
  if (prod && !env.ALLOWED_ORIGINS?.trim() && !env.APP_URL?.trim()) warnings2.push("ALLOWED_ORIGINS/APP_URL non d\xE9finis : aucune origine tierce ne pourra appeler l\u2019API (le site sur le m\xEAme domaine fonctionne).");
  if (env.BILLING_ENFORCE === "false" && env.STRIPE_SECRET_KEY?.trim()) warnings2.push("BILLING_ENFORCE=false : la facturation Stripe est configur\xE9e mais non appliqu\xE9e.");
  return { errors: errors2, warnings: warnings2 };
}
function allowedOrigins(env = process.env) {
  const list = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  const app2 = env.APP_URL?.trim().replace(/\/$/, "");
  if (app2 && app2 !== "*") list.push(app2);
  if (!isProd(env)) list.push("http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173");
  return [...new Set(list)];
}
function resolveCorsOrigin(origin, env = process.env) {
  if (!origin) return void 0;
  const list = allowedOrigins(env);
  return list.includes(origin.replace(/\/$/, "")) ? origin : void 0;
}
function passwordProblem(pw) {
  if (pw.length < PASSWORD_MIN_LENGTH) return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caract\xE8res.`;
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return "Ce mot de passe est trop courant : choisissez-en un autre (par exemple trois mots qui n\u2019ont rien \xE0 voir entre eux).";
  if (/^(.)\1+$/.test(pw)) return "Ce mot de passe est une r\xE9p\xE9tition : choisissez-en un autre.";
  if (/^\d+$/.test(pw)) return "Un mot de passe uniquement compos\xE9 de chiffres est trop facile \xE0 deviner.";
  return null;
}
function setKnownRoutes(paths) {
  knownMatchers = paths.map((p) => {
    if (p.includes("*")) return /.*/;
    const re = "/" + p.split("/").filter(Boolean).map((seg) => seg.startsWith(":") ? "[^/]+" : seg.replace(/[:*]/g, "")).map(escapeRe).join("/") + "/?";
    return new RegExp(`^${re}$`);
  });
}
function isKnownPath(path3) {
  if (!knownMatchers) return true;
  return knownMatchers.some((r) => r.test(path3.replace(/\/$/, "") || "/"));
}
var DEV_SECRETS, isProd, COMMON_PASSWORDS, PASSWORD_MIN_LENGTH, knownMatchers, escapeRe, ROLE_RANK, roleAtLeast;
var init_security = __esm({
  "apps/api/src/lib/security.ts"() {
    "use strict";
    DEV_SECRETS = /* @__PURE__ */ new Set([
      "dev-secret-change-me-in-production",
      "dev-secret-local",
      "test-secret",
      "secret",
      "changeme",
      "changez-moi-64-caracteres-aleatoires",
      "change-me"
    ]);
    isProd = (env = process.env) => env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
    COMMON_PASSWORDS = /* @__PURE__ */ new Set([
      "12345678",
      "123456789",
      "1234567890",
      "password",
      "password1",
      "motdepasse",
      "motdepasse1",
      "azerty123",
      "qwerty123",
      "demo1234",
      "afrisupply",
      "iloveyou",
      "soleil123",
      "restaurant"
    ]);
    PASSWORD_MIN_LENGTH = Number(process.env.PASSWORD_MIN_LENGTH ?? 8);
    knownMatchers = null;
    escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    ROLE_RANK = { staff: 1, manager: 2, owner: 3 };
    roleAtLeast = (role, min) => (ROLE_RANK[role ?? ""] ?? 0) >= ROLE_RANK[min];
  }
});

// apps/api/src/lib/auth.ts
import { SignJWT, jwtVerify } from "jose";
import bcrypt2 from "bcryptjs";
import { getCookie } from "hono/cookie";
import { eq as eq4, and as and3 } from "drizzle-orm";
function tokenTtlSeconds(ttl = TOKEN_TTL) {
  const m = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!m) return 7 * 86400;
  const n15 = Number(m[1]);
  const unit2 = m[2] ?? "s";
  return n15 * ({ s: 1, m: 60, h: 3600, d: 86400 }[unit2] ?? 1);
}
async function hashPassword(pw) {
  return bcrypt2.hash(pw, 10);
}
async function verifyPassword(pw, hash) {
  return bcrypt2.compare(pw, hash);
}
async function signToken(user, tokenVersion = user.tokenVersion ?? 0) {
  return new SignJWT({ email: user.email, fullName: user.fullName, tv: tokenVersion }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt().setExpirationTime(TOKEN_TTL).sign(secret);
}
async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return { id: payload.sub, email: payload.email, fullName: payload.fullName, tokenVersion: Number(payload.tv ?? 0) };
  } catch {
    return null;
  }
}
async function requireAuth(c, next) {
  const header = c.req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : getCookie(c, "afs_token");
  if (!token) {
    if (!isKnownPath(c.req.path)) return c.json({ error: "Route inconnue" }, 404);
    return c.json({ error: "Non authentifi\xE9" }, 401);
  }
  const user = await verifyToken(token);
  if (!user) return c.json({ error: "Session expir\xE9e, reconnectez-vous.", code: "session_invalid" }, 401);
  const db = await getDb();
  const [row] = await db.select({ id: users.id, email: users.email, fullName: users.fullName, phone: users.phone, tokenVersion: users.tokenVersion }).from(users).where(eq4(users.id, user.id)).limit(1);
  if (!row) return c.json({ error: "Utilisateur inconnu" }, 401);
  if ((row.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
    return c.json({ error: "Session r\xE9voqu\xE9e : reconnectez-vous avec votre nouveau mot de passe.", code: "session_revoked" }, 401);
  }
  c.set("user", { id: row.id, email: row.email, fullName: row.fullName, phone: row.phone, tokenVersion: row.tokenVersion });
  await next();
}
async function requireRestaurant(c, next) {
  const db = await getDb();
  const user = c.get("user");
  const wanted = c.req.header("x-restaurant-id");
  const memberships = await db.select({ restaurantId: restaurantMembers.restaurantId, role: restaurantMembers.role }).from(restaurantMembers).where(eq4(restaurantMembers.userId, user.id));
  if (!memberships.length) return c.json({ error: "Aucun restaurant associ\xE9" }, 403);
  const rid = wanted ?? memberships[0].restaurantId;
  const membership = memberships.find((m) => m.restaurantId === rid);
  if (!membership) return c.json({ error: "Acc\xE8s refus\xE9 \xE0 ce restaurant" }, 403);
  c.set("restaurantId", rid);
  c.set("role", membership.role);
  const [r] = await db.select({ plan: restaurants.plan, trialEndsAt: restaurants.trialEndsAt, subscriptionStatus: restaurants.subscriptionStatus, currentPeriodEnd: restaurants.currentPeriodEnd }).from(restaurants).where(eq4(restaurants.id, rid));
  c.set("plan", r?.plan ?? "trial");
  if (r && billingEnforced()) {
    const s = accessState(r);
    const path3 = c.req.path;
    if (s.blocked && c.req.method !== "GET" && !path3.includes("/billing") && !path3.includes("/account")) {
      return c.json({ error: s.state === "past_due" ? "Paiement en attente : mettez \xE0 jour votre moyen de paiement pour continuer." : "Votre essai gratuit est termin\xE9. Choisissez une formule pour continuer (vos donn\xE9es sont conserv\xE9es).", code: "subscription_required", state: s.state }, 402);
    }
    const need = planRequired(path3);
    if (need && (PLAN_RANK[r.plan] ?? 0) < PLAN_RANK[need] && !(s.state === "trialing" && r.plan === "trial")) {
      return c.json({ error: `Cette fonction fait partie de l'offre ${need[0].toUpperCase()}${need.slice(1)}.`, code: "plan_required", plan: need }, 402);
    }
  }
  await next();
}
function planRequired(path3) {
  if (BUSINESS_PATHS.some((p) => path3.startsWith(p))) return "business";
  if (PRO_PATHS.some((p) => path3.startsWith(p))) return "pro";
  return null;
}
function requireMinRole(min) {
  return async (c, next) => {
    const role = c.get("role");
    if (!roleAtLeast(role, min)) {
      const label = min === "owner" ? "au propri\xE9taire du restaurant" : "au responsable";
      return c.json({
        error: `Action r\xE9serv\xE9e ${label} (votre r\xF4le : ${role ?? "inconnu"}). Demandez au propri\xE9taire du compte de vous donner les droits.`,
        code: "role_required",
        requiredRole: min,
        role: role ?? null
      }, 403);
    }
    await next();
  };
}
var secret, TOKEN_TTL, PRO_PATHS, BUSINESS_PATHS;
var init_auth = __esm({
  "apps/api/src/lib/auth.ts"() {
    "use strict";
    init_src();
    init_billing();
    init_security();
    secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me-in-production");
    TOKEN_TTL = process.env.AUTH_TOKEN_TTL ?? "7d";
    PRO_PATHS = ["/api/forecast", "/api/compare", "/api/smart-cart", "/api/assistant", "/api/recipes", "/api/reorder-rules", "/api/quick/invoice"];
    BUSINESS_PATHS = ["/api/marketplace/group-buys", "/api/account/export"];
  }
});

// apps/api/src/lib/mailer.ts
import { mkdir, writeFile } from "node:fs/promises";
import path2 from "node:path";
function mailerConfig() {
  return {
    // resend en prod ; fichier en dev ; « log » (console uniquement) sur serverless sans clé : rien n'est perdu, rien ne casse
    transport: process.env.RESEND_API_KEY ? "resend" : process.env.VERCEL || process.env.NODE_ENV === "production" ? "log" : "file",
    from: process.env.MAIL_FROM ?? "AFRISUPPLY <bonjour@afrisupply.fr>",
    outbox: process.env.MAIL_OUTBOX_DIR ?? path2.resolve(process.cwd(), ".outbox")
  };
}
async function sendMail(m) {
  const cfg = mailerConfig();
  if (cfg.transport === "resend") {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: cfg.from, to: [m.to], subject: m.subject, text: m.text, html: m.html, tags: m.tags ? Object.entries(m.tags).map(([name, value]) => ({ name, value })) : void 0 }),
        signal: AbortSignal.timeout(1e4)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.message ?? `HTTP ${res.status}`, transport: "resend" };
      return { ok: true, id: data.id ?? "unknown", transport: "resend" };
    } catch (e) {
      return { ok: false, error: e.message, transport: "resend" };
    }
  }
  if (cfg.transport === "log") {
    console.warn(`[mail] RESEND_API_KEY absent \u2014 mail non envoy\xE9 \xE0 ${m.to} : \xAB ${m.subject} \xBB`);
    return { ok: true, id: "logged", transport: "log" };
  }
  try {
    await mkdir(cfg.outbox, { recursive: true });
    const id = `${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}_${m.to.replace(/[^a-z0-9@.]/gi, "_")}`;
    await writeFile(path2.join(cfg.outbox, `${id}.html`), m.html, "utf8");
    await writeFile(path2.join(cfg.outbox, `${id}.txt`), `To: ${m.to}
Subject: ${m.subject}

${m.text}`, "utf8");
    return { ok: true, id, transport: "file" };
  } catch (e) {
    return { ok: false, error: e.message, transport: "file" };
  }
}
var init_mailer = __esm({
  "apps/api/src/lib/mailer.ts"() {
    "use strict";
  }
});

// apps/api/src/lib/ops.ts
import { getConnInfo } from "@hono/node-server/conninfo";
function parseDsn(dsn) {
  const u = new URL(dsn);
  const projectId = u.pathname.replace(/^\//, "");
  return { key: u.username, host: u.host, projectId, endpoint: `${u.protocol}//${u.host}/api/${projectId}/envelope/` };
}
async function captureException(err, ctx = {}) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const { key, endpoint } = parseDsn(dsn);
    const e = err instanceof Error ? err : new Error(String(err));
    const frames = (e.stack ?? "").split("\n").slice(1).map((l) => l.trim()).filter(Boolean).reverse().map((l) => ({ function: l.replace(/^at\s+/, "") }));
    const eventId = crypto.randomUUID().replace(/-/g, "");
    const event = {
      event_id: eventId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      platform: "node",
      level: "error",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
      server_name: process.env.VERCEL_REGION ?? "local",
      transaction: ctx.route ? `${ctx.method ?? ""} ${ctx.route}`.trim() : void 0,
      exception: { values: [{ type: e.name, value: e.message, stacktrace: frames.length ? { frames } : void 0 }] },
      user: ctx.userEmail ? { email: ctx.userEmail } : void 0,
      tags: { restaurantId: ctx.restaurantId ?? "none" },
      extra: ctx.extra
    };
    const envelope = `${JSON.stringify({ event_id: eventId, sent_at: (/* @__PURE__ */ new Date()).toISOString(), dsn })}
${JSON.stringify({ type: "event" })}
${JSON.stringify(event)}
`;
    await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${key}, sentry_client=afrisupply/1.0` }, body: envelope, signal: AbortSignal.timeout(3e3) });
  } catch {
  }
}
function clientIp(c) {
  const trustProxy = process.env.TRUST_PROXY === "true" || !!process.env.VERCEL;
  const xff = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (trustProxy && xff) return xff;
  try {
    const addr = getConnInfo(c)?.remote?.address;
    if (addr) return addr;
  } catch {
  }
  return xff ?? c.req.header("x-real-ip") ?? "local";
}
function rateLimit(opts) {
  return async (c, next) => {
    const ip = clientIp(c);
    const k = `${opts.key ? opts.key(c) : c.req.path}:${ip}`;
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || b.reset < now) {
      b = { n: 0, reset: now + opts.windowMs };
      buckets.set(k, b);
    }
    b.n += 1;
    if (buckets.size > 5e3) {
      for (const [kk, v] of buckets) if (v.reset < now) buckets.delete(kk);
    }
    if (buckets.size > 2e4) buckets.clear();
    c.header("X-RateLimit-Limit", String(opts.max));
    c.header("X-RateLimit-Remaining", String(Math.max(0, opts.max - b.n)));
    if (b.n > opts.max) {
      c.header("Retry-After", String(Math.ceil((b.reset - now) / 1e3)));
      return c.json({ error: "Trop de tentatives, r\xE9essayez dans une minute." }, 429);
    }
    await next();
  };
}
async function securityHeaders(c, next) {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
}
async function audit(action, opts = {}) {
  try {
    const db = await getDb();
    await db.insert(auditLog).values({ action, actorEmail: opts.actorEmail ?? null, target: opts.target, meta: opts.meta });
  } catch (e) {
    console.error("[audit]", e);
  }
}
var sentryEnabled, buckets, buildInfo;
var init_ops = __esm({
  "apps/api/src/lib/ops.ts"() {
    "use strict";
    init_src();
    sentryEnabled = () => !!process.env.SENTRY_DSN;
    buckets = /* @__PURE__ */ new Map();
    buildInfo = () => ({ version: process.env.npm_package_version ?? "0.1.0", commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local", env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development", region: process.env.VERCEL_REGION ?? "local" });
  }
});

// apps/api/src/lib/reference.ts
import { sql as sql3 } from "drizzle-orm";
async function nextOrderReference() {
  const db = await getDb();
  await db.execute(sql3`create sequence if not exists order_ref_seq`);
  const res = await db.execute(sql3`select nextval('order_ref_seq') as v`);
  const rows = res.rows ?? res;
  const v = Number((Array.isArray(rows) ? rows[0] : rows).v);
  return `AFS-${(/* @__PURE__ */ new Date()).getFullYear()}-${String(v).padStart(6, "0")}`;
}
var init_reference = __esm({
  "apps/api/src/lib/reference.ts"() {
    "use strict";
    init_src();
  }
});

// apps/api/src/lib/order-events.ts
import { asc, eq as eq7 } from "drizzle-orm";
async function logOrderEvent(orderId, type, label, actor = "system", meta) {
  try {
    const db = await getDb();
    await db.insert(orderEvents).values({ orderId, type, label, actor, meta });
  } catch (e) {
    console.warn("[order-events]", e.message);
  }
}
async function orderTimeline(orderId) {
  const db = await getDb();
  return db.select().from(orderEvents).where(eq7(orderEvents.orderId, orderId)).orderBy(asc(orderEvents.at));
}
var init_order_events = __esm({
  "apps/api/src/lib/order-events.ts"() {
    "use strict";
    init_src();
  }
});

// apps/api/src/lib/orders.ts
function isReceived(o) {
  return !!o.receivedAt;
}
function isClosed(o) {
  return isReceived(o) || TERMINAL_STATUSES.includes(asStatus(o.status));
}
function checkSend(o) {
  if (isReceived(o)) {
    return refuse(
      `Cette commande a d\xE9j\xE0 \xE9t\xE9 r\xE9ceptionn\xE9e le ${new Date(o.receivedAt).toLocaleDateString("fr-FR")} : elle ne peut plus \xEAtre renvoy\xE9e.`,
      "order_already_received"
    );
  }
  const s = asStatus(o.status);
  if (TERMINAL_STATUSES.includes(s)) {
    return refuse(`Commande ${s === "annulee" ? "annul\xE9e" : "cl\xF4tur\xE9e"} : elle ne peut plus \xEAtre envoy\xE9e.`, "order_closed");
  }
  if (!SENDABLE_STATUSES.includes(s)) {
    return refuse(`Une commande \xAB ${s} \xBB n'est pas envoy\xE9e manuellement (elle est d\xE9j\xE0 chez le fournisseur).`, "order_not_sendable", 400);
  }
  return null;
}
function checkReceive(o) {
  if (isReceived(o)) {
    return refuse(
      `Cette commande a d\xE9j\xE0 \xE9t\xE9 r\xE9ceptionn\xE9e le ${new Date(o.receivedAt).toLocaleDateString("fr-FR")}. Pour corriger une quantit\xE9 d\xE9j\xE0 compt\xE9e, utilisez un ajustement de stock ou un inventaire.`,
      "order_already_received"
    );
  }
  const s = asStatus(o.status);
  if (s === "annulee") return refuse("Commande annul\xE9e : il n'y a rien \xE0 r\xE9ceptionner.", "order_cancelled");
  if (s === "livree" || s === "livree_partiel") return refuse("Commande d\xE9j\xE0 cl\xF4tur\xE9e : r\xE9ception impossible.", "order_closed");
  if (!RECEIVABLE_STATUSES.includes(s)) {
    return refuse("Cette commande doit d'abord \xEAtre pr\xE9par\xE9e puis envoy\xE9e avant d'\xEAtre r\xE9ceptionn\xE9e.", "order_not_receivable", 400);
  }
  return null;
}
function checkStatusChange(from, to) {
  const o = { status: from };
  if (to === "annulee") {
    if (TERMINAL_STATUSES.includes(asStatus(from))) return refuse("Commande d\xE9j\xE0 cl\xF4tur\xE9e ou annul\xE9e : modification impossible.", "order_closed");
    return null;
  }
  if (isClosed(o)) {
    return refuse(
      `Commande cl\xF4tur\xE9e (${from === "annulee" ? "annul\xE9e" : "r\xE9ceptionn\xE9e"}) : modification impossible.`,
      "order_closed"
    );
  }
  const allowed = TRANSITIONS[asStatus(from)] ?? [];
  if (!allowed.includes(to)) {
    return refuse(`Transition \xAB ${from} \xBB \u2192 \xAB ${to} \xBB refus\xE9e : cette commande est d\xE9j\xE0 dans un \xE9tat plus avanc\xE9.`, "invalid_transition", 400);
  }
  return null;
}
function checkLineEdit(o) {
  if (isReceived(o)) return refuse("Commande d\xE9j\xE0 r\xE9ceptionn\xE9e : les lignes ne peuvent plus \xEAtre modifi\xE9es.", "order_already_received");
  const s = asStatus(o.status);
  if (s === "annulee" || s === "livree" || s === "livree_partiel") {
    return refuse("Commande cl\xF4tur\xE9e : les lignes ne peuvent plus \xEAtre modifi\xE9es.", "order_closed");
  }
  if (!LINE_EDITABLE_STATUSES.includes(s)) {
    return refuse("Modification impossible dans cet \xE9tat.", "order_not_editable", 400);
  }
  return null;
}
var TERMINAL_STATUSES, RECEIVABLE_STATUSES, SENDABLE_STATUSES, LINE_EDITABLE_STATUSES, TRANSITIONS, refuse, asStatus;
var init_orders = __esm({
  "apps/api/src/lib/orders.ts"() {
    "use strict";
    TERMINAL_STATUSES = ["livree", "livree_partiel", "annulee"];
    RECEIVABLE_STATUSES = ["preparee", "envoyee", "confirmee"];
    SENDABLE_STATUSES = ["brouillon", "preparee", "envoyee"];
    LINE_EDITABLE_STATUSES = ["brouillon", "preparee", "envoyee", "confirmee"];
    TRANSITIONS = {
      brouillon: ["preparee", "envoyee", "annulee"],
      preparee: ["preparee", "envoyee", "annulee"],
      envoyee: ["preparee", "envoyee", "confirmee", "annulee"],
      confirmee: ["confirmee", "annulee"],
      livree_partiel: [],
      livree: [],
      annulee: []
    };
    refuse = (error, code, status = 409) => ({ error, code, status });
    asStatus = (s) => s;
  }
});

// apps/api/src/lib/engines.ts
function stockStatus(s) {
  if (s.quantity <= s.criticalLevel) return "critique";
  const days2 = daysOfStock(s);
  if (days2 !== null && days2 <= 3) return "critique";
  if (days2 !== null && days2 <= 6) return "bas";
  if (s.quantity <= s.criticalLevel * 1.5) return "bas";
  return "ok";
}
function daysOfStock(s) {
  if (!s.avgDailyUse || s.avgDailyUse <= 0) return null;
  return Math.round(s.quantity / s.avgDailyUse * 10) / 10;
}
function computeDailyUse(sales2, ingredients, windowDays = 28) {
  const byRecipe = /* @__PURE__ */ new Map();
  for (const i of ingredients) {
    if (!byRecipe.has(i.recipeId)) byRecipe.set(i.recipeId, []);
    byRecipe.get(i.recipeId).push(i);
  }
  const totals = /* @__PURE__ */ new Map();
  const cutoff = Date.now() - windowDays * 864e5;
  for (const s of sales2) {
    if (new Date(s.day).getTime() < cutoff) continue;
    for (const ing of byRecipe.get(s.recipeId) ?? []) {
      totals.set(ing.productId, (totals.get(ing.productId) ?? 0) + s.portions * ing.quantity);
    }
  }
  const out = /* @__PURE__ */ new Map();
  for (const [pid, total] of totals) out.set(pid, Math.round(total / windowDays * 1e3) / 1e3);
  return out;
}
function alertsFromStock(stocks, today = /* @__PURE__ */ new Date()) {
  const out = [];
  const dayKey = today.toISOString().slice(0, 10);
  for (const s of stocks) {
    const status = stockStatus(s);
    const days2 = daysOfStock(s);
    if (status === "critique") {
      const reason = s.quantity <= s.criticalLevel ? `Stock actuel ${fmtQty(s.quantity, s.unit)}, sous votre seuil critique de ${fmtQty(s.criticalLevel, s.unit)}.` : `Stock actuel ${fmtQty(s.quantity, s.unit)} pour une consommation d'environ ${fmtQty(s.avgDailyUse, s.unit)}/jour : rupture dans ~${days2} jour${days2 && days2 > 1 ? "s" : ""}.`;
      out.push({
        dedupeKey: `rupture:${s.productId}:${dayKey}`,
        kind: "rupture",
        severity: "red",
        title: `\u{1F534} Rupture imminente \u2014 ${s.productName}`,
        message: reason,
        productId: s.productId,
        actionUrl: `/achats/comparer/${s.productId}`,
        payload: { quantity: s.quantity, daysLeft: days2 }
      });
    } else if (status === "bas") {
      out.push({
        dedupeKey: `stock_bas:${s.productId}:${dayKey}`,
        kind: "stock_bas",
        severity: "orange",
        title: `\u{1F7E0} Stock bas \u2014 ${s.productName}`,
        message: days2 !== null ? `Il vous reste environ ${days2} jours de ${s.productName.toLowerCase()} (${fmtQty(s.quantity, s.unit)}). Pensez \xE0 commander.` : `Stock de ${s.productName.toLowerCase()} \xE0 ${fmtQty(s.quantity, s.unit)}, proche du seuil critique.`,
        productId: s.productId,
        actionUrl: `/stock`,
        payload: { quantity: s.quantity, daysLeft: days2 }
      });
    }
  }
  return out;
}
function alertsFromPrices(points, thresholdPct = 8, alternatives = /* @__PURE__ */ new Map()) {
  const byOffer = /* @__PURE__ */ new Map();
  for (const p of points) {
    if (!byOffer.has(p.offerId)) byOffer.set(p.offerId, []);
    byOffer.get(p.offerId).push(p);
  }
  const out = [];
  for (const [offerId, hist] of byOffer) {
    hist.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    const current = hist[hist.length - 1];
    const previous = hist.slice(0, -1);
    if (!previous.length) continue;
    const ref = previous.reduce((a, p) => a + p.unitPrice, 0) / previous.length;
    const pct2 = (current.unitPrice - ref) / ref * 100;
    if (pct2 >= thresholdPct) {
      const alts = (alternatives.get(current.productId) ?? []).filter((a) => a.offerId !== offerId && a.unitPrice < current.unitPrice).sort((a, b) => a.unitPrice - b.unitPrice).slice(0, 2);
      const altText = alts.length ? ` Nous avons trouv\xE9 ${alts.length} alternative${alts.length > 1 ? "s" : ""} moins ch\xE8re${alts.length > 1 ? "s" : ""} : ${alts.map((a) => `${a.supplierName} \xE0 ${fmtEur(a.unitPrice)}/${a.unit}`).join(", ")}.` : "";
      out.push({
        dedupeKey: `hausse:${offerId}:${current.unitPrice.toFixed(4)}`,
        kind: "hausse_prix",
        severity: "orange",
        title: `\u{1F4C8} Hausse d\xE9tect\xE9e \u2014 ${current.productName}`,
        message: `Le prix de ${current.productName.toLowerCase()} chez ${current.supplierName} augmente de ${pct2.toFixed(0)} % (${fmtEur(ref)} \u2192 ${fmtEur(current.unitPrice)}/${current.unit}).${altText}`,
        productId: current.productId,
        supplierId: current.supplierId,
        actionUrl: `/achats/comparer/${current.productId}`,
        payload: { pct: Math.round(pct2 * 10) / 10, from: ref, to: current.unitPrice, alternatives: alts }
      });
    }
  }
  return out;
}
function alertsFromOpportunities(items, offers, minGainPct = 5) {
  const out = [];
  for (const it of items) {
    if (!it.preferredSupplierId) continue;
    const mine = offers.find((o) => o.productId === it.productId && o.supplierId === it.preferredSupplierId);
    if (!mine) continue;
    const best = offers.filter((o) => o.productId === it.productId && o.inStock && o.supplierId !== it.preferredSupplierId && o.leadTimeHours <= 72).sort((a, b) => a.unitPrice - b.unitPrice)[0];
    if (!best) continue;
    const pct2 = (mine.unitPrice - best.unitPrice) / mine.unitPrice * 100;
    if (pct2 >= minGainPct) {
      out.push({
        dedupeKey: `opportunite:${it.productId}:${best.supplierId}:${best.unitPrice.toFixed(4)}`,
        kind: "opportunite",
        severity: "green",
        title: `\u{1F7E2} Moins cher disponible \u2014 ${it.productName}`,
        message: `Votre fournisseur habituel (${mine.supplierName}) propose ${it.productName.toLowerCase()} ${pct2.toFixed(0)} % plus cher que ${best.supplierName} (${fmtEur(best.unitPrice)} vs ${fmtEur(mine.unitPrice)}/${it.unit}), livrable sous ${Math.round(best.leadTimeHours / 24)} j.`,
        productId: it.productId,
        supplierId: best.supplierId,
        actionUrl: `/achats/comparer/${it.productId}`,
        payload: { pct: Math.round(pct2 * 10) / 10 }
      });
    }
  }
  return out;
}
function compareOffers(offers, ctx) {
  if (!offers.length) return { ranked: [], headline: "Aucune offre disponible", justification: [] };
  const minPrice = Math.min(...offers.map((o) => o.unitPrice));
  const maxPrice = Math.max(...offers.map((o) => o.unitPrice));
  const urgencyHours = ctx.daysOfStockLeft !== null ? Math.max(0, ctx.daysOfStockLeft * 24) : Infinity;
  const ranked = offers.map((o) => {
    const priceScore = maxPrice === minPrice ? 100 : Math.round(100 - (o.unitPrice - minPrice) / (maxPrice - minPrice) * 100);
    const tooLate = o.leadTimeHours > urgencyHours;
    const delayScore = tooLate ? 0 : Math.max(0, Math.round(100 - o.leadTimeHours / 168 * 100));
    const reliabilityScore = Math.round(o.reliabilityPct);
    const stockPenalty = o.inStock ? 1 : 0.2;
    const score = Math.round((priceScore * 0.5 + delayScore * 0.3 + reliabilityScore * 0.2) * stockPenalty);
    const strengths = [];
    const weaknesses = [];
    if (o.unitPrice === minPrice) strengths.push("Prix le plus bas du panel");
    if (o.leadTimeHours <= 24) strengths.push("Livraison sous 24 h");
    if (o.reliabilityPct >= 90) strengths.push(`Fiabilit\xE9 ${o.reliabilityPct.toFixed(0)} %`);
    if (!o.inStock) weaknesses.push("Rupture chez le fournisseur");
    if (tooLate) weaknesses.push(`D\xE9lai de ${Math.round(o.leadTimeHours / 24)} j incompatible avec votre stock (${ctx.daysOfStockLeft} j restants)`);
    if (o.unitPrice === maxPrice && maxPrice !== minPrice) weaknesses.push("Prix le plus \xE9lev\xE9 du panel");
    if (o.reliabilityPct < 80) weaknesses.push("Fiabilit\xE9 en dessous de 80 %");
    return { ...o, score, priceScore, delayScore, reliabilityScore, strengths, weaknesses };
  }).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const cheapest = ranked.find((o) => o.unitPrice === minPrice);
  const justification = [];
  justification.push(`${best.supplierName} obtient le meilleur score global (${best.score}/100) en combinant prix (${fmtEur(best.unitPrice)}/${ctx.unit}), d\xE9lai (${Math.round(best.leadTimeHours / 24)} j) et fiabilit\xE9 (${best.reliabilityPct.toFixed(0)} %).`);
  if (cheapest.offerId !== best.offerId) {
    const why = cheapest.weaknesses[0] ?? "un score global inf\xE9rieur";
    justification.push(`${cheapest.supplierName} est moins cher (${fmtEur(cheapest.unitPrice)}/${ctx.unit}) mais pr\xE9sente ${why.charAt(0).toLowerCase() + why.slice(1)}.`);
  }
  const packs = Math.max(1, Math.ceil(ctx.neededQty / best.packQty));
  justification.push(`Pour couvrir ${fmtQty(ctx.neededQty, ctx.unit)} : ${packs} \xD7 ${best.packLabel} = ${fmtEur(packs * best.packPrice + best.deliveryFee)}${best.deliveryFee ? ` (dont ${fmtEur(best.deliveryFee)} de livraison)` : ""}.`);
  return { ranked, recommended: best, headline: `Meilleur choix : ${best.supplierName}`, justification };
}
function recipeCost(ingredients, lastUnitPrices) {
  const lines = ingredients.map((i) => {
    const unitPrice = lastUnitPrices.get(i.productId) ?? 0;
    return { ...i, unitPrice, cost: Math.round(i.quantity * unitPrice * 1e3) / 1e3, priced: lastUnitPrices.has(i.productId) };
  });
  const total = Math.round(lines.reduce((a, l) => a + l.cost, 0) * 100) / 100;
  return { lines, total, unpriced: lines.filter((l) => !l.priced).map((l) => l.productName) };
}
function marginAnalysis(cost, sellingPrice, targetMarginPct = 70) {
  if (!sellingPrice) return { grossMargin: null, marginPct: null, suggestedPrice: Math.round(cost / (1 - targetMarginPct / 100) * 10) / 10 };
  const grossMargin = Math.round((sellingPrice - cost) * 100) / 100;
  const marginPct = Math.round(grossMargin / sellingPrice * 1e3) / 10;
  const suggestedPrice = marginPct < targetMarginPct ? Math.round(cost / (1 - targetMarginPct / 100) * 10) / 10 : null;
  return { grossMargin, marginPct, suggestedPrice };
}
function supplierReliability(stats) {
  if (!stats.delivered) return 85;
  const pct2 = 100 - stats.late / stats.delivered * 60 - stats.discrepancies / stats.delivered * 40;
  return Math.max(0, Math.min(100, Math.round(pct2)));
}
var fmtQty, fmtEur;
var init_engines = __esm({
  "apps/api/src/lib/engines.ts"() {
    "use strict";
    fmtQty = (q2, unit2) => `${Number.isInteger(q2) ? q2 : q2.toFixed(1)} ${unit2}`;
    fmtEur = (v) => `${v.toFixed(2).replace(".", ",")} \u20AC`;
  }
});

// apps/api/src/routes/restaurant.ts
import { Hono as Hono2 } from "hono";
import { z as z2 } from "zod";
import { and as and6, eq as eq8, desc, gte, sql as sql4, inArray } from "drizzle-orm";
function isUniqueViolation(e, constraint) {
  if (!e || typeof e !== "object") return false;
  const err = e;
  const probe = [err, err.cause].filter(Boolean);
  return probe.some((p) => p.code === "23505" && `${p.constraint ?? ""}${p.message ?? ""}`.includes(constraint));
}
async function assertPlausibleQuantity(rid, asked, opts = {}) {
  const db = await getDb();
  const inv = await db.select().from(inventoryItems).where(and6(eq8(inventoryItems.restaurantId, rid), inArray(inventoryItems.productId, asked.map((a) => a.productId))));
  const out = [];
  for (const a of asked) {
    const criticalLevel = n(inv.find((i) => i.productId === a.productId)?.criticalLevel ?? 0);
    const ceiling = await quantityCeiling(rid, { productId: a.productId, packQty: a.packQty, criticalLevel, category: a.category });
    if (a.quantity > ceiling.maxQuantity && !opts.override) {
      out.push({
        productName: a.productName,
        asked: a.quantity,
        max: Math.round(ceiling.maxQuantity),
        unit: a.unit,
        message: `\xAB ${a.productName} \xBB : ${a.packs} colis (${fmtQty2(a.quantity, a.unit)}) d\xE9passe votre maximum habituel de ${ceiling.maxPacks} colis (${Math.round(ceiling.maxQuantity)} ${a.unit}).`
      });
    }
  }
  if (!out.length) return null;
  return {
    code: "quantity_out_of_range",
    lines: out,
    error: `Quantit\xE9 invraisemblable : ${out[0].message} V\xE9rifiez la saisie (${out[0].asked.toLocaleString("fr-FR")} ${out[0].unit} saisis), ou confirmez explicitement si ce volume est r\xE9ellement voulu.`
  };
}
async function loadStockSnapshots(rid) {
  const db = await getDb();
  const [items, salesRows, ingRows] = await Promise.all([
    db.select({ item: inventoryItems, product: products }).from(inventoryItems).innerJoin(products, eq8(products.id, inventoryItems.productId)).where(eq8(inventoryItems.restaurantId, rid)),
    db.select({ recipeId: sales.recipeId, day: sales.day, portions: sales.portions }).from(sales).where(eq8(sales.restaurantId, rid)),
    db.select({ recipeId: recipeIngredients.recipeId, productId: recipeIngredients.productId, quantity: recipeIngredients.quantity }).from(recipeIngredients).innerJoin(recipes, eq8(recipes.id, recipeIngredients.recipeId)).where(eq8(recipes.restaurantId, rid))
  ]);
  const use = computeDailyUse(salesRows, ingRows.map((i) => ({ ...i, quantity: n(i.quantity) })));
  return items.map(({ item, product }) => ({
    productId: product.id,
    productName: product.name,
    unit: product.baseUnit,
    quantity: n(item.quantity),
    criticalLevel: n(item.criticalLevel),
    targetLevel: item.targetLevel ? n(item.targetLevel) : null,
    avgDailyUse: use.get(product.id) ?? n(item.avgDailyUse)
  }));
}
async function loadOffers(rid, productId) {
  const db = await getDb();
  const where = productId ? and6(eq8(supplierOffers.restaurantId, rid), eq8(supplierOffers.productId, productId)) : eq8(supplierOffers.restaurantId, rid);
  const rows = await db.select({ offer: supplierOffers, supplier: suppliers }).from(supplierOffers).innerJoin(suppliers, eq8(suppliers.id, supplierOffers.supplierId)).where(where);
  return rows.map(({ offer, supplier }) => ({
    offerId: offer.id,
    supplierId: supplier.id,
    supplierName: supplier.name,
    productId: offer.productId,
    packLabel: offer.packLabel,
    packQty: n(offer.packQty),
    packPrice: n(offer.packPriceEur),
    unitPrice: n(offer.packPriceEur) / n(offer.packQty),
    inStock: offer.inStock,
    leadTimeHours: supplier.leadTimeHours,
    deliveryFee: n(supplier.deliveryFeeEur),
    minOrder: n(supplier.minOrderEur)
  }));
}
async function loadSupplierStats(rid) {
  const db = await getDb();
  const rows = await db.select({
    supplierId: orders.supplierId,
    delivered: sql4`count(*) filter (where ${orders.status} in ('livree','livree_partiel'))`,
    late: sql4`count(*) filter (where ${deliveries.isLate})`,
    discrepancies: sql4`count(*) filter (where ${deliveries.hasDiscrepancy})`,
    total: sql4`count(*)`,
    spent: sql4`coalesce(sum(${orders.totalEur}),0)`
  }).from(orders).leftJoin(deliveries, eq8(deliveries.orderId, orders.id)).where(eq8(orders.restaurantId, rid)).groupBy(orders.supplierId);
  const map = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const st = { delivered: n(r.delivered), late: n(r.late), discrepancies: n(r.discrepancies), total: n(r.total), spent: n(r.spent) };
    map.set(r.supplierId, { ...st, reliability: supplierReliability(st) });
  }
  return map;
}
async function refreshAlerts(rid) {
  const db = await getDb();
  const [restaurant] = await db.select().from(restaurants).where(eq8(restaurants.id, rid));
  const threshold = restaurant.settings?.priceIncreaseAlertPct ?? 8;
  const [stocks, offers, invRows, ph] = await Promise.all([
    loadStockSnapshots(rid),
    loadOffers(rid),
    db.select({ item: inventoryItems, product: products }).from(inventoryItems).innerJoin(products, eq8(products.id, inventoryItems.productId)).where(eq8(inventoryItems.restaurantId, rid)),
    db.select({ p: priceHistory, offer: supplierOffers, supplier: suppliers, product: products }).from(priceHistory).innerJoin(supplierOffers, eq8(supplierOffers.id, priceHistory.offerId)).innerJoin(suppliers, eq8(suppliers.id, supplierOffers.supplierId)).innerJoin(products, eq8(products.id, supplierOffers.productId)).where(and6(eq8(priceHistory.restaurantId, rid), gte(priceHistory.recordedAt, new Date(Date.now() - 90 * 864e5))))
  ]);
  const points = ph.map((r) => ({ offerId: r.offer.id, supplierId: r.supplier.id, supplierName: r.supplier.name, productId: r.product.id, productName: r.product.name, unit: r.product.baseUnit, unitPrice: n(r.p.unitPriceEur), recordedAt: r.p.recordedAt.toISOString() }));
  const alternatives = /* @__PURE__ */ new Map();
  for (const o of offers) {
    if (!o.inStock) continue;
    const pp = { offerId: o.offerId, supplierId: o.supplierId, supplierName: o.supplierName, productId: o.productId, productName: "", unit: "", unitPrice: o.unitPrice, recordedAt: "" };
    const prod = ph.find((r) => r.product.id === o.productId)?.product;
    if (prod) {
      pp.productName = prod.name;
      pp.unit = prod.baseUnit;
    }
    if (!alternatives.has(o.productId)) alternatives.set(o.productId, []);
    alternatives.get(o.productId).push(pp);
  }
  const computed = [
    ...alertsFromStock(stocks),
    ...alertsFromPrices(points, threshold, alternatives),
    ...alertsFromOpportunities(invRows.map((r) => ({ productId: r.product.id, productName: r.product.name, unit: r.product.baseUnit, preferredSupplierId: r.item.preferredSupplierId })), offers)
  ];
  let inserted = 0;
  for (const a of computed) {
    const res = await db.insert(alerts).values({ restaurantId: rid, ...a }).onConflictDoNothing().returning({ id: alerts.id });
    inserted += res.length;
  }
  return { computed: computed.length, inserted };
}
var restaurantRoutes, n, RECEIPT_ABS_MAX, INVOICE_UNIT_MAX, INVOICE_UNIT_FACTOR, MAX_PACKS_PER_LINE, ReceptionAlreadyDone, fmtQty2, eur;
var init_restaurant = __esm({
  "apps/api/src/routes/restaurant.ts"() {
    "use strict";
    init_src();
    init_reference();
    init_order_events();
    init_auth();
    init_orders();
    init_engines();
    restaurantRoutes = new Hono2();
    restaurantRoutes.use("*", requireAuth, requireRestaurant);
    restaurantRoutes.on(["POST"], "/suppliers", requireMinRole("manager"));
    restaurantRoutes.on(["POST"], "/orders", requireMinRole("manager"));
    restaurantRoutes.on(["POST"], "/orders/:id/send", requireMinRole("manager"));
    n = (v) => v === null || v === void 0 ? 0 : Number(v);
    RECEIPT_ABS_MAX = 1e6;
    INVOICE_UNIT_MAX = 1e4;
    INVOICE_UNIT_FACTOR = 3;
    MAX_PACKS_PER_LINE = 1e3;
    ReceptionAlreadyDone = class extends Error {
      constructor(at) {
        super("reception_already_done");
        this.at = at;
      }
    };
    fmtQty2 = (v, unit2) => `${Number(v.toFixed(3)).toLocaleString("fr-FR")} ${unit2}`;
    eur = (v) => `${v.toFixed(2).replace(".", ",")} \u20AC`;
    restaurantRoutes.get("/dashboard", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const [restaurant] = await db.select().from(restaurants).where(eq8(restaurants.id, rid));
      const stocks = await loadStockSnapshots(rid);
      const statuses = stocks.map((s) => ({ ...s, status: stockStatus(s), daysLeft: daysOfStock(s) }));
      const startMonth = /* @__PURE__ */ new Date();
      startMonth.setDate(1);
      startMonth.setHours(0, 0, 0, 0);
      const startPrev = new Date(startMonth);
      startPrev.setMonth(startPrev.getMonth() - 1);
      const spend = await db.select({
        thisMonth: sql4`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${startMonth.toISOString()}),0)`,
        prevMonth: sql4`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${startPrev.toISOString()} and ${orders.createdAt} < ${startMonth.toISOString()}),0)`,
        last30: sql4`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${new Date(Date.now() - 30 * 864e5).toISOString()}),0)`,
        prev30: sql4`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${new Date(Date.now() - 60 * 864e5).toISOString()} and ${orders.createdAt} < ${new Date(Date.now() - 30 * 864e5).toISOString()}),0)`
      }).from(orders).where(and6(eq8(orders.restaurantId, rid), sql4`${orders.status} <> 'annulee'`));
      const sp = spend[0];
      const evolutionPct = n(sp.prev30) > 0 ? (n(sp.last30) - n(sp.prev30)) / n(sp.prev30) * 100 : null;
      const recentAlerts = await db.select().from(alerts).where(and6(eq8(alerts.restaurantId, rid), eq8(alerts.isRead, false))).orderBy(desc(alerts.createdAt)).limit(6);
      const recentOrders = await db.select({ order: orders, supplierName: suppliers.name }).from(orders).innerJoin(suppliers, eq8(suppliers.id, orders.supplierId)).where(eq8(orders.restaurantId, rid)).orderBy(desc(orders.createdAt)).limit(5);
      return c.json({
        restaurant,
        stock: {
          ok: statuses.filter((s) => s.status === "ok").length,
          bas: statuses.filter((s) => s.status === "bas").length,
          critique: statuses.filter((s) => s.status === "critique").length,
          items: statuses.filter((s) => s.status !== "ok").sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99)).slice(0, 8)
        },
        spend: { thisMonth: n(sp.thisMonth), prevMonth: n(sp.prevMonth), last30: n(sp.last30), prev30: n(sp.prev30), evolutionPct: evolutionPct === null ? null : Math.round(evolutionPct * 10) / 10 },
        alerts: recentAlerts,
        recentOrders: recentOrders.map((r) => ({ ...r.order, supplierName: r.supplierName }))
      });
    });
    restaurantRoutes.get("/stock", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const stocks = await loadStockSnapshots(rid);
      const items = await db.select({ item: inventoryItems, product: products, supplierName: suppliers.name }).from(inventoryItems).innerJoin(products, eq8(products.id, inventoryItems.productId)).leftJoin(suppliers, eq8(suppliers.id, inventoryItems.preferredSupplierId)).where(eq8(inventoryItems.restaurantId, rid));
      const byProduct = new Map(stocks.map((s) => [s.productId, s]));
      const out = items.map(({ item, product, supplierName }) => {
        const s = byProduct.get(product.id);
        return {
          id: item.id,
          productId: product.id,
          name: product.name,
          category: product.category,
          unit: product.baseUnit,
          quantity: s.quantity,
          criticalLevel: s.criticalLevel,
          targetLevel: s.targetLevel,
          avgDailyUse: s.avgDailyUse,
          daysLeft: daysOfStock(s),
          status: stockStatus(s),
          preferredSupplier: supplierName,
          preferredSupplierId: item.preferredSupplierId,
          lastCountedAt: item.lastCountedAt
        };
      }).sort((a, b) => ({ critique: 0, bas: 1, ok: 2 })[a.status] - { critique: 0, bas: 1, ok: 2 }[b.status] || a.name.localeCompare(b.name));
      return c.json({ items: out });
    });
    restaurantRoutes.post("/stock/:itemId/movements", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const user = c.get("user");
      const body3 = z2.object({ type: z2.enum(["reception", "consommation", "ajustement", "perte"]), quantity: z2.number(), note: z2.string().optional() }).safeParse(await c.req.json());
      if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
      const [item] = await db.select().from(inventoryItems).where(and6(eq8(inventoryItems.id, c.req.param("itemId")), eq8(inventoryItems.restaurantId, rid)));
      if (!item) return c.json({ error: "Article introuvable" }, 404);
      const { type, quantity, note } = body3.data;
      const delta = type === "ajustement" ? quantity - n(item.quantity) : type === "reception" ? Math.abs(quantity) : -Math.abs(quantity);
      const newQty = Math.max(0, n(item.quantity) + delta);
      await db.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: item.id, type, quantity: delta.toFixed(3), note, createdBy: user.id });
      await db.update(inventoryItems).set({ quantity: newQty.toFixed(3), updatedAt: /* @__PURE__ */ new Date(), ...type === "ajustement" ? { lastCountedAt: /* @__PURE__ */ new Date() } : {} }).where(eq8(inventoryItems.id, item.id));
      return c.json({ ok: true, quantity: newQty });
    });
    restaurantRoutes.get("/suppliers", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const [rows, stats, offerCounts] = await Promise.all([
        db.select().from(suppliers).where(eq8(suppliers.restaurantId, rid)).orderBy(suppliers.name),
        loadSupplierStats(rid),
        db.select({ supplierId: supplierOffers.supplierId, count: sql4`count(*)` }).from(supplierOffers).where(eq8(supplierOffers.restaurantId, rid)).groupBy(supplierOffers.supplierId)
      ]);
      const counts = new Map(offerCounts.map((o) => [o.supplierId, n(o.count)]));
      return c.json({
        suppliers: rows.map((s) => ({ ...s, stats: stats.get(s.id) ?? { delivered: 0, late: 0, discrepancies: 0, total: 0, spent: 0, reliability: supplierReliability({ delivered: 0, late: 0, discrepancies: 0 }) }, offerCount: counts.get(s.id) ?? 0 }))
      });
    });
    restaurantRoutes.get("/suppliers/:id", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const id = c.req.param("id");
      const [s] = await db.select().from(suppliers).where(and6(eq8(suppliers.id, id), eq8(suppliers.restaurantId, rid)));
      if (!s) return c.json({ error: "Fournisseur introuvable" }, 404);
      const [offers, history, stats] = await Promise.all([
        db.select({ offer: supplierOffers, product: products }).from(supplierOffers).innerJoin(products, eq8(products.id, supplierOffers.productId)).where(eq8(supplierOffers.supplierId, id)),
        db.select().from(orders).where(eq8(orders.supplierId, id)).orderBy(desc(orders.createdAt)).limit(20),
        loadSupplierStats(rid)
      ]);
      return c.json({ supplier: s, stats: stats.get(id), offers: offers.map(({ offer, product }) => ({ ...offer, productName: product.name, unit: product.baseUnit, unitPrice: n(offer.packPriceEur) / n(offer.packQty) })), orders: history });
    });
    restaurantRoutes.post("/suppliers", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const body3 = z2.object({
        name: z2.string().min(2),
        contactName: z2.string().optional(),
        email: z2.string().email().optional().or(z2.literal("")),
        phone: z2.string().optional(),
        whatsapp: z2.string().optional(),
        city: z2.string().optional(),
        leadTimeHours: z2.number().int().positive().default(48),
        minOrderEur: z2.number().nonnegative().default(0),
        deliveryFeeEur: z2.number().nonnegative().default(0),
        preferredChannel: z2.enum(["email", "whatsapp", "telephone", "plateforme"]).default("whatsapp")
      }).safeParse(await c.req.json());
      if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
      const d = body3.data;
      const [row] = await db.insert(suppliers).values({ ...d, email: d.email || null, restaurantId: rid, minOrderEur: d.minOrderEur.toFixed(2), deliveryFeeEur: d.deliveryFeeEur.toFixed(2) }).returning();
      return c.json(row, 201);
    });
    restaurantRoutes.get("/products", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const rows = await db.select().from(products).where(sql4`${products.restaurantId} is null or ${products.restaurantId} = ${rid}`).orderBy(products.category, products.name);
      return c.json({ products: rows });
    });
    restaurantRoutes.get("/compare/:productId", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const productId = c.req.param("productId");
      const [product] = await db.select().from(products).where(eq8(products.id, productId));
      if (!product || product.restaurantId && product.restaurantId !== rid) return c.json({ error: "Produit introuvable" }, 404);
      const [offers, stats, stocks] = await Promise.all([loadOffers(rid, productId), loadSupplierStats(rid), loadStockSnapshots(rid)]);
      const snap = stocks.find((s) => s.productId === productId);
      const daysLeft = snap ? daysOfStock(snap) : null;
      const neededQty = Number(c.req.query("qty")) || (snap?.targetLevel ? Math.max(0, snap.targetLevel - snap.quantity) : 0) || 1;
      const result = compareOffers(
        offers.map((o) => ({ ...o, reliabilityPct: stats.get(o.supplierId)?.reliability ?? 85 })),
        { daysOfStockLeft: daysLeft, neededQty, unit: product.baseUnit }
      );
      return c.json({ product, stock: snap ? { ...snap, daysLeft, status: stockStatus(snap) } : null, neededQty, ...result });
    });
    restaurantRoutes.get("/orders", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const rows = await db.select({ order: orders, supplierName: suppliers.name }).from(orders).innerJoin(suppliers, eq8(suppliers.id, orders.supplierId)).where(eq8(orders.restaurantId, rid)).orderBy(desc(orders.createdAt)).limit(100);
      const ids = rows.map((r) => r.order.id);
      const lines = ids.length ? await db.select({ line: orderLines, productName: products.name }).from(orderLines).innerJoin(products, eq8(products.id, orderLines.productId)).where(inArray(orderLines.orderId, ids)) : [];
      return c.json({ orders: rows.map((r) => ({ ...r.order, proofPhoto: void 0, proofSignature: void 0, hasProof: !!(r.order.proofPhoto || r.order.proofSignature || r.order.proofReceiverName), supplierName: r.supplierName, lines: lines.filter((l) => l.line.orderId === r.order.id).map((l) => ({ ...l.line, productName: l.productName })) })) });
    });
    restaurantRoutes.post("/orders", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const user = c.get("user");
      const body3 = z2.object({
        supplierId: z2.string().uuid(),
        channel: z2.enum(["email", "whatsapp", "telephone", "plateforme"]).optional(),
        notes: z2.string().max(2e3).optional(),
        source: z2.string().optional(),
        lines: z2.array(z2.object({ offerId: z2.string().uuid(), packs: z2.number().int().positive().max(MAX_PACKS_PER_LINE) })).min(1),
        /** Confirmation explicite : autorise un volume au-delà du plafond de plausibilité. */
        override: z2.boolean().optional()
      }).safeParse(await c.req.json());
      if (!body3.success) return c.json({ error: "Donn\xE9es invalides : chaque ligne attend un nombre de colis entre 1 et " + MAX_PACKS_PER_LINE, details: body3.error.flatten() }, 400);
      const d = body3.data;
      const [sup] = await db.select().from(suppliers).where(and6(eq8(suppliers.id, d.supplierId), eq8(suppliers.restaurantId, rid)));
      if (!sup) return c.json({ error: "Fournisseur introuvable" }, 404);
      const offers = await db.select({ offer: supplierOffers, product: products }).from(supplierOffers).innerJoin(products, eq8(products.id, supplierOffers.productId)).where(and6(eq8(supplierOffers.supplierId, sup.id), inArray(supplierOffers.id, d.lines.map((l) => l.offerId))));
      if (offers.length !== d.lines.length) return c.json({ error: "Offre invalide pour ce fournisseur" }, 400);
      const outOfRange = await assertPlausibleQuantity(rid, d.lines.map((l) => {
        const o = offers.find((x) => x.offer.id === l.offerId);
        return {
          productId: o.product.id,
          productName: o.product.name,
          unit: o.product.baseUnit,
          category: o.product.category,
          packQty: n(o.offer.packQty) || 1,
          packs: l.packs,
          quantity: l.packs * n(o.offer.packQty)
        };
      }), { override: d.override });
      if (outOfRange) return c.json(outOfRange, 400);
      const reference = await nextOrderReference();
      const linesData = d.lines.map((l) => {
        const o = offers.find((x) => x.offer.id === l.offerId).offer;
        const qty3 = l.packs * n(o.packQty);
        const unit2 = n(o.packPriceEur) / n(o.packQty);
        return { productId: o.productId, offerId: o.id, packLabel: o.packLabel, packs: l.packs, quantity: qty3.toFixed(3), unitPriceEur: unit2.toFixed(4), lineTotalEur: (l.packs * n(o.packPriceEur)).toFixed(2) };
      });
      const total = linesData.reduce((a, l) => a + Number(l.lineTotalEur), 0);
      const expected = new Date(Date.now() + sup.leadTimeHours * 36e5).toISOString().slice(0, 10);
      const [order] = await db.insert(orders).values({
        restaurantId: rid,
        supplierId: sup.id,
        reference,
        status: "preparee",
        channel: d.channel ?? sup.preferredChannel,
        expectedAt: expected,
        totalEur: total.toFixed(2),
        deliveryFeeEur: sup.deliveryFeeEur,
        source: d.source ?? "manuel",
        notes: d.notes,
        createdBy: user.id
      }).returning();
      await db.insert(orderLines).values(linesData.map((l) => ({ ...l, orderId: order.id })));
      return c.json({ order, message: `Commande ${reference} pr\xE9par\xE9e chez ${sup.name} pour ${total.toFixed(2).replace(".", ",")} \u20AC.` }, 201);
    });
    restaurantRoutes.post("/orders/:id/send", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const [cur] = await db.select().from(orders).where(and6(eq8(orders.id, c.req.param("id")), eq8(orders.restaurantId, rid)));
      if (!cur) return c.json({ error: "Commande introuvable" }, 404);
      const refusal = checkSend(cur);
      if (refusal) return c.json({ error: refusal.error, code: refusal.code }, refusal.status);
      const [o] = await db.update(orders).set({ status: "envoyee", sentAt: cur.sentAt ?? /* @__PURE__ */ new Date() }).where(and6(eq8(orders.id, cur.id), inArray(orders.status, ["brouillon", "preparee", "envoyee"]))).returning();
      if (!o) return c.json({ error: "Cette commande vient de changer d'\xE9tat : rechargez la page avant de r\xE9essayer.", code: "order_state_changed" }, 409);
      void logOrderEvent(o.id, "sent", "Commande envoy\xE9e au fournisseur", "restaurant");
      return c.json({ order: o });
    });
    restaurantRoutes.post("/orders/:id/receive", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const user = c.get("user");
      const body3 = z2.object({
        lines: z2.array(z2.object({
          lineId: z2.string().uuid(),
          receivedQty: z2.number().nonnegative().max(RECEIPT_ABS_MAX),
          /** Prix réellement facturé par le fournisseur (€ par unité de base : kg, L, pièce…). Optionnel. */
          invoicedUnitPrice: z2.number().positive().max(INVOICE_UNIT_MAX).optional()
        })).min(1),
        notes: z2.string().max(500).optional(),
        /** Confirmation explicite : autorise une quantité ou un prix au-delà du plafond de plausibilité. */
        override: z2.boolean().optional()
      }).safeParse(await c.req.json().catch(() => ({})));
      if (!body3.success) {
        return c.json({
          error: `Quantit\xE9s re\xE7ues invalides (nombre attendu entre 0 et ${RECEIPT_ABS_MAX.toLocaleString("fr-FR")}).`,
          details: body3.error.flatten()
        }, 400);
      }
      const [order] = await db.select().from(orders).where(and6(eq8(orders.id, c.req.param("id")), eq8(orders.restaurantId, rid)));
      if (!order) return c.json({ error: "Commande introuvable" }, 404);
      const refusal = checkReceive(order);
      if (refusal) return c.json({ error: refusal.error, code: refusal.code }, refusal.status);
      const lines = await db.select({ line: orderLines, productName: products.name, unit: products.baseUnit, category: products.category }).from(orderLines).innerJoin(products, eq8(products.id, orderLines.productId)).where(eq8(orderLines.orderId, order.id));
      if (!lines.length) return c.json({ error: "Cette commande ne contient aucune ligne : rien \xE0 r\xE9ceptionner." }, 400);
      const inventory = await db.select().from(inventoryItems).where(and6(eq8(inventoryItems.restaurantId, rid), inArray(inventoryItems.productId, lines.map((l) => l.line.productId))));
      const overCeiling = [];
      const resolved = /* @__PURE__ */ new Map();
      for (const { line, productName, unit: unit2, category } of lines) {
        const asked = body3.data.lines.find((l) => l.lineId === line.id)?.receivedQty;
        const received = asked === void 0 ? n(line.quantity) : asked;
        resolved.set(line.id, received);
        const packQty = n(line.quantity) / Math.max(1, n(line.packs)) || 1;
        const criticalLevel = n(inventory.find((i) => i.productId === line.productId)?.criticalLevel ?? 0);
        const ceiling = await quantityCeiling(rid, { productId: line.productId, packQty, criticalLevel, category });
        if (received > ceiling.maxQuantity * 2 && !body3.data.override) {
          overCeiling.push({
            productName,
            asked: received,
            max: Math.round(ceiling.maxQuantity * 2),
            unit: unit2,
            message: `Vous avez command\xE9 ${fmtQty2(n(line.quantity), unit2)} et saisissez ${fmtQty2(received, unit2)} re\xE7us : c'est plus de deux fois votre plafond habituel (${Math.round(ceiling.maxQuantity * 2)} ${unit2}).`
          });
        }
      }
      if (overCeiling.length) {
        return c.json({
          error: `Quantit\xE9 re\xE7ue invraisemblable pour ${overCeiling.length} ligne${overCeiling.length > 1 ? "s" : ""}. ${overCeiling[0].message} V\xE9rifiez la saisie, ou confirmez explicitement si cette quantit\xE9 est r\xE9elle.`,
          code: "quantity_out_of_range",
          lines: overCeiling
        }, 400);
      }
      const invoicedByLine = /* @__PURE__ */ new Map();
      const invoiceOutOfRange = [];
      for (const { line, productName, unit: unit2 } of lines) {
        const invoiced = body3.data.lines.find((l) => l.lineId === line.id)?.invoicedUnitPrice;
        if (invoiced === void 0) continue;
        invoicedByLine.set(line.id, invoiced);
        const orderedUnit = n(line.unitPriceEur);
        if (orderedUnit > 0 && invoiced > orderedUnit * INVOICE_UNIT_FACTOR + 0.5 && !body3.data.override) {
          invoiceOutOfRange.push({
            productName,
            ordered: orderedUnit,
            invoiced,
            unit: unit2,
            message: `${productName} : prix factur\xE9 ${eur(invoiced)}/${unit2} contre ${eur(orderedUnit)}/${unit2} command\xE9s (\xD7${(invoiced / orderedUnit).toFixed(1)}).`
          });
        }
      }
      if (invoiceOutOfRange.length) {
        return c.json({
          error: `Prix factur\xE9 invraisemblable pour ${invoiceOutOfRange.length} ligne${invoiceOutOfRange.length > 1 ? "s" : ""}. ${invoiceOutOfRange[0].message} V\xE9rifiez l'unit\xE9 de la facture (prix au kilo ou au sac ?), ou confirmez si le fournisseur a r\xE9ellement factur\xE9 ce prix.`,
          code: "invoice_out_of_range",
          lines: invoiceOutOfRange
        }, 400);
      }
      const isLate = !!order.expectedAt && new Date(order.expectedAt).getTime() < Date.now() - 864e5;
      const discrepancies = [];
      const priceVariance = [];
      const receivedByLine = /* @__PURE__ */ new Map();
      let deliveryId = "";
      let claimMessage = null;
      try {
        await db.transaction(async (tx) => {
          const [locked] = await tx.select().from(orders).where(eq8(orders.id, order.id)).for("update");
          if (locked?.receivedAt) throw new ReceptionAlreadyDone(locked.receivedAt);
          const [delivery] = await tx.insert(deliveries).values({ restaurantId: rid, orderId: order.id, receivedBy: user.id, isLate, notes: body3.data.notes }).returning();
          deliveryId = delivery.id;
          for (const { line, productName, unit: unit2 } of lines) {
            const received = resolved.get(line.id) ?? n(line.quantity);
            receivedByLine.set(line.id, received);
            const invoiced = invoicedByLine.get(line.id) ?? null;
            const orderedUnit = n(line.unitPriceEur);
            const unitCost = invoiced ?? orderedUnit;
            await tx.update(orderLines).set({
              receivedQty: received.toFixed(3),
              ...invoiced !== null ? { invoicedUnitPriceEur: invoiced.toFixed(4) } : {}
            }).where(eq8(orderLines.id, line.id));
            if (received > 0) {
              await tx.insert(inventoryItems).values({ restaurantId: rid, productId: line.productId, quantity: "0", criticalLevel: "0" }).onConflictDoNothing({ target: [inventoryItems.restaurantId, inventoryItems.productId] });
              const [inv] = await tx.select().from(inventoryItems).where(and6(eq8(inventoryItems.restaurantId, rid), eq8(inventoryItems.productId, line.productId)));
              await tx.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: inv.id, type: "reception", quantity: received.toFixed(3), unitCostEur: unitCost.toFixed(4), orderId: order.id, createdBy: user.id, note: invoiced !== null ? "Prix factur\xE9 saisi \xE0 la r\xE9ception" : null });
              await tx.update(inventoryItems).set({ quantity: (n(inv.quantity) + received).toFixed(3), updatedAt: /* @__PURE__ */ new Date() }).where(eq8(inventoryItems.id, inv.id));
              if (line.offerId) {
                await tx.insert(priceHistory).values({ restaurantId: rid, offerId: line.offerId, unitPriceEur: unitCost.toFixed(4), source: invoiced !== null ? "facture" : "reception" });
                if (invoiced !== null) {
                  const [off] = await tx.select().from(supplierOffers).where(eq8(supplierOffers.id, line.offerId));
                  if (off) await tx.update(supplierOffers).set({ packPriceEur: (invoiced * n(off.packQty)).toFixed(2), lastSeenAt: /* @__PURE__ */ new Date() }).where(eq8(supplierOffers.id, off.id));
                }
              }
            }
            if (Math.abs(received - n(line.quantity)) > 1e-3) discrepancies.push({ lineId: line.id, productName, ordered: n(line.quantity), received, unit: unit2 });
            if (invoiced !== null && Math.abs(invoiced - orderedUnit) > 1e-4) {
              const deltaUnit = invoiced - orderedUnit;
              priceVariance.push({
                lineId: line.id,
                productName,
                unit: unit2,
                orderedUnit: Math.round(orderedUnit * 1e4) / 1e4,
                invoicedUnit: Math.round(invoiced * 1e4) / 1e4,
                deltaUnit: Math.round(deltaUnit * 1e4) / 1e4,
                deltaPct: orderedUnit > 0 ? Math.round(deltaUnit / orderedUnit * 1e3) / 10 : null,
                receivedQty: received,
                deltaEur: Math.round(deltaUnit * received * 100) / 100
              });
            }
          }
          const surcharge = priceVariance.reduce((a, v) => a + Math.max(0, v.deltaEur), 0);
          const orderedValue = lines.reduce((a, l) => a + n(l.line.unitPriceEur) * (resolved.get(l.line.id) ?? n(l.line.quantity)), 0);
          if (surcharge > Math.max(1, orderedValue * 0.01)) {
            const worst = priceVariance.filter((v) => v.deltaEur > 0).sort((a, b) => b.deltaEur - a.deltaEur)[0];
            await tx.insert(alerts).values({
              restaurantId: rid,
              dedupeKey: `facture:${deliveryId}`,
              kind: "hausse_prix",
              severity: "orange",
              productId: lines.find((l) => l.line.id === worst.lineId)?.line.productId ?? null,
              supplierId: order.supplierId,
              title: `\u{1F4B8} Facture plus \xE9lev\xE9e que la commande \u2014 ${order.reference}`,
              message: `Les prix factur\xE9s d\xE9passent les prix command\xE9s de ${eur(surcharge)} au total. Le plus gros \xE9cart : ${worst.productName}, ${eur(worst.orderedUnit)} \u2192 ${eur(worst.invoicedUnit)}/${worst.unit} (${worst.deltaPct !== null ? `+${worst.deltaPct} %` : `+${eur(worst.deltaUnit)}`}), soit ${eur(worst.deltaEur)} sur la quantit\xE9 re\xE7ue.`,
              actionUrl: "/app/analyse",
              payload: { reference: order.reference, surchargeEur: Math.round(surcharge * 100) / 100, lines: priceVariance }
            }).onConflictDoNothing();
          }
          if (discrepancies.length) {
            const [sup] = await tx.select().from(suppliers).where(eq8(suppliers.id, order.supplierId));
            claimMessage = `Bonjour ${sup?.contactName ?? ""},

Nous avons constat\xE9 un \xE9cart sur la livraison ${order.reference} :
` + discrepancies.map((d) => `\u2022 ${d.productName} : command\xE9 ${d.ordered} ${d.unit}, re\xE7u ${d.received} ${d.unit} (${d.ordered - d.received > 0 ? "manquant" : "exc\xE9dent"} ${Math.abs(d.ordered - d.received)} ${d.unit})`).join("\n") + `

Merci de nous indiquer la suite \xE0 donner (livraison compl\xE9mentaire ou avoir).

Cordialement,
${user.fullName}`;
            await tx.insert(deliveryDiscrepancies).values(discrepancies.map((d) => ({ deliveryId: delivery.id, orderLineId: d.lineId, orderedQty: d.ordered.toFixed(3), receivedQty: d.received.toFixed(3), reason: d.ordered > d.received ? "manquant" : "exc\xE9dent", claimMessage })));
            await tx.update(deliveries).set({ hasDiscrepancy: true }).where(eq8(deliveries.id, delivery.id));
            const missingValue = discrepancies.reduce((a, d) => {
              const l = lines.find((x) => x.line.id === d.lineId);
              return a + Math.max(0, d.ordered - d.received) * n(l?.line.unitPriceEur);
            }, 0);
            await tx.insert(alerts).values({
              restaurantId: rid,
              dedupeKey: `ecart:${delivery.id}`,
              kind: "ecart_livraison",
              severity: "orange",
              supplierId: order.supplierId,
              title: `\xC9cart sur la livraison ${order.reference}`,
              message: `${discrepancies.length} ligne${discrepancies.length > 1 ? "s" : ""} en \xE9cart chez ${sup?.name ?? "le fournisseur"}${missingValue > 0 ? ` (~${missingValue.toFixed(2).replace(".", ",")} \u20AC manquants)` : ""}. R\xE9clamation pr\xE9-r\xE9dig\xE9e disponible.`,
              actionUrl: "/app/achats/ecarts",
              payload: { discrepancies, missingValue }
            }).onConflictDoNothing();
          }
          const allReceived2 = discrepancies.every((d) => d.received >= d.ordered);
          const now = /* @__PURE__ */ new Date();
          await tx.update(orders).set({
            status: allReceived2 ? "livree" : "livree_partiel",
            deliveredAt: now,
            receivedAt: now
          }).where(eq8(orders.id, order.id));
        });
      } catch (e) {
        if (e instanceof ReceptionAlreadyDone) {
          return c.json({ error: `Cette commande a d\xE9j\xE0 \xE9t\xE9 r\xE9ceptionn\xE9e le ${e.at.toLocaleDateString("fr-FR")} : le stock n'a pas \xE9t\xE9 modifi\xE9.`, code: "order_already_received" }, 409);
        }
        if (isUniqueViolation(e, "deliveries_order_unique")) {
          return c.json({ error: "Cette commande est d\xE9j\xE0 en cours de r\xE9ception (double validation). Rechargez la page : le stock n'a \xE9t\xE9 modifi\xE9 qu'une fois.", code: "order_already_received" }, 409);
        }
        throw e;
      }
      const allReceived = discrepancies.every((d) => d.received >= d.ordered);
      void logOrderEvent(
        order.id,
        "received",
        allReceived ? "R\xE9ception confirm\xE9e par le restaurant" : "R\xE9ception avec \xE9carts signal\xE9s",
        "restaurant",
        body3.data.override ? { override: true } : void 0
      );
      const surchargeEur = Math.round(priceVariance.reduce((a, v) => a + v.deltaEur, 0) * 100) / 100;
      const invoicedTotal = priceVariance.length || invoicedByLine.size ? Math.round(lines.reduce((a, l) => {
        const received = receivedByLine.get(l.line.id) ?? n(l.line.quantity);
        return a + (invoicedByLine.get(l.line.id) ?? n(l.line.unitPriceEur)) * received;
      }, 0) * 100) / 100 : null;
      const orderedTotal = Math.round(lines.reduce((a, l) => a + n(l.line.unitPriceEur) * (receivedByLine.get(l.line.id) ?? n(l.line.quantity)), 0) * 100) / 100;
      return c.json({
        ok: true,
        isLate,
        discrepancies,
        claimMessage,
        deliveryId,
        receivedAt: (/* @__PURE__ */ new Date()).toISOString(),
        priceVariance,
        surchargeEur,
        orderedTotal,
        invoicedTotal
      });
    });
    restaurantRoutes.get("/recipes", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const [recs, ings, offers] = await Promise.all([
        db.select().from(recipes).where(eq8(recipes.restaurantId, rid)).orderBy(recipes.name),
        db.select({ ing: recipeIngredients, product: products }).from(recipeIngredients).innerJoin(products, eq8(products.id, recipeIngredients.productId)).innerJoin(recipes, eq8(recipes.id, recipeIngredients.recipeId)).where(eq8(recipes.restaurantId, rid)),
        loadOffers(rid)
      ]);
      const prices = /* @__PURE__ */ new Map();
      for (const o of offers) if (o.inStock && (!prices.has(o.productId) || o.unitPrice < prices.get(o.productId))) prices.set(o.productId, o.unitPrice);
      const hist = await db.select({ productId: supplierOffers.productId, unitPrice: priceHistory.unitPriceEur, recordedAt: priceHistory.recordedAt }).from(priceHistory).innerJoin(supplierOffers, eq8(supplierOffers.id, priceHistory.offerId)).where(and6(eq8(priceHistory.restaurantId, rid), gte(priceHistory.recordedAt, new Date(Date.now() - 45 * 864e5))));
      const drift = /* @__PURE__ */ new Map();
      for (const pid of new Map(hist.map((h) => [h.productId, 1])).keys()) {
        const pts = hist.filter((h) => h.productId === pid).sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
        if (pts.length >= 2) {
          const first = n(pts[0].unitPrice), last = n(pts[pts.length - 1].unitPrice);
          if (first > 0) drift.set(pid, Math.round((last - first) / first * 1e3) / 10);
        }
      }
      return c.json({
        recipes: recs.map((r) => {
          const list = ings.filter((i) => i.ing.recipeId === r.id).map((i) => ({ productId: i.product.id, productName: i.product.name, quantity: n(i.ing.quantity), unit: i.product.baseUnit }));
          const cost = recipeCost(list, prices);
          const margin = marginAnalysis(cost.total, r.sellingPriceEur ? n(r.sellingPriceEur) : null, n(r.targetMarginPct) || 70);
          const drifting = cost.lines.filter((l) => (drift.get(l.productId) ?? 0) >= 5).map((l) => ({ productName: l.productName, pct: drift.get(l.productId) }));
          return { ...r, sellingPriceEur: r.sellingPriceEur ? n(r.sellingPriceEur) : null, ingredients: cost.lines, cost: cost.total, unpriced: cost.unpriced, ...margin, drifting };
        })
      });
    });
    restaurantRoutes.post("/alerts/refresh", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const { computed, inserted } = await refreshAlerts(rid);
      const all = await db.select().from(alerts).where(and6(eq8(alerts.restaurantId, rid), eq8(alerts.isRead, false))).orderBy(desc(alerts.createdAt));
      return c.json({ computed, inserted, alerts: all });
    });
    restaurantRoutes.get("/alerts", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const rows = await db.select().from(alerts).where(eq8(alerts.restaurantId, rid)).orderBy(desc(alerts.createdAt)).limit(100);
      return c.json({ alerts: rows });
    });
    restaurantRoutes.post("/alerts/:id/read", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      await db.update(alerts).set({ isRead: true }).where(and6(eq8(alerts.id, c.req.param("id")), eq8(alerts.restaurantId, rid)));
      return c.json({ ok: true });
    });
  }
});

// apps/api/src/lib/forecast.ts
function forecastRecipes(sales2, recipeIds, opts = {}) {
  const horizon = opts.horizonDays ?? 7;
  const today = opts.today ?? /* @__PURE__ */ new Date();
  const out = /* @__PURE__ */ new Map();
  const byRecipe = /* @__PURE__ */ new Map();
  for (const s of sales2) {
    if (!byRecipe.has(s.recipeId)) byRecipe.set(s.recipeId, /* @__PURE__ */ new Map());
    byRecipe.get(s.recipeId).set(s.day, s.portions);
  }
  const WEIGHTS = [0.4, 0.3, 0.2, 0.1];
  for (const rid of recipeIds) {
    const hist = byRecipe.get(rid) ?? /* @__PURE__ */ new Map();
    const daysWithData = hist.size;
    let recent = 0, previous = 0;
    for (const [day, p] of hist) {
      const age = (today.getTime() - new Date(day).getTime()) / DAY_MS;
      if (age > 0 && age <= 28) recent += p;
      else if (age > 28 && age <= 56) previous += p;
    }
    const trend = previous > 0 && recent > 0 ? Math.min(1.3, Math.max(0.7, recent / previous)) : 1;
    const perDay = [];
    for (let d = 1; d <= horizon; d++) {
      const target = new Date(today.getTime() + d * DAY_MS);
      let num3 = 0, den = 0;
      for (let k = 1; k <= 4; k++) {
        const past = isoDay2(new Date(target.getTime() - k * 7 * DAY_MS));
        const v = hist.get(past);
        if (v !== void 0) {
          num3 += v * WEIGHTS[k - 1];
          den += WEIGHTS[k - 1];
        }
      }
      let base;
      const closedDow = den === 0 && [1, 2, 3].every((k) => {
        const before = hist.has(isoDay2(new Date(target.getTime() - (k * 7 + 1) * DAY_MS)));
        const after = hist.has(isoDay2(new Date(target.getTime() - (k * 7 - 1) * DAY_MS)));
        return before || after;
      });
      if (den > 0) base = num3 / den;
      else if (closedDow) base = 0;
      else if (daysWithData) base = [...hist.values()].reduce((a, b) => a + b, 0) / Math.max(daysWithData, 1) * 0.8;
      else base = 0;
      const ev = opts.eventMultipliers?.[isoDay2(target)] ?? 1;
      perDay.push(Math.round(base * trend * ev * 100) / 100);
    }
    const total = perDay.reduce((a, b) => a + b, 0);
    const confidence = daysWithData >= 28 ? 0.85 : daysWithData >= 14 ? 0.7 : daysWithData >= 7 ? 0.55 : daysWithData > 0 ? 0.4 : 0.2;
    out.set(rid, { recipeId: rid, perDay, total: Math.round(total * 10) / 10, confidence });
  }
  return out;
}
function forecastProducts(recipeForecasts, ingredients, stocks, opts = {}) {
  const horizon = opts.horizonDays ?? 7;
  const safetyDays = opts.safetyDays ?? 2;
  const today = opts.today ?? /* @__PURE__ */ new Date();
  const perProduct = /* @__PURE__ */ new Map();
  for (const ing of ingredients) {
    const rf = recipeForecasts.get(ing.recipeId);
    if (!rf) continue;
    const acc = perProduct.get(ing.productId) ?? { perDay: new Array(horizon).fill(0), conf: [], recipes: 0 };
    rf.perDay.forEach((p, i) => {
      acc.perDay[i] += p * ing.quantity;
    });
    acc.conf.push(rf.confidence);
    acc.recipes++;
    perProduct.set(ing.productId, acc);
  }
  const out = [];
  for (const s of stocks) {
    const acc = perProduct.get(s.productId);
    const perDay = acc ? acc.perDay.map((v) => Math.round(v * 1e3) / 1e3) : new Array(horizon).fill(0);
    const need = perDay.reduce((a, b) => a + b, 0);
    const avg = need / horizon;
    const confidence = acc && acc.conf.length ? Math.round(acc.conf.reduce((a, b) => a + b, 0) / acc.conf.length * 100) / 100 : 0.2;
    let cum = 0;
    let stockoutIdx = null;
    for (let i = 0; i < perDay.length; i++) {
      cum += perDay[i];
      if (cum > s.quantity) {
        stockoutIdx = i;
        break;
      }
    }
    const daysLeft = avg > 0 ? Math.round(s.quantity / avg * 10) / 10 : null;
    const safety = Math.max(s.criticalLevel, avg * safetyDays);
    let recommended = Math.max(0, need + safety - s.quantity);
    if (s.targetLevel && s.quantity + recommended > s.targetLevel * 1.5) recommended = Math.max(0, s.targetLevel * 1.5 - s.quantity);
    if (s.shelfLifeDays && s.shelfLifeDays < horizon && avg > 0) recommended = Math.min(recommended, Math.max(0, avg * s.shelfLifeDays + safety - s.quantity));
    recommended = Math.round(recommended * 10) / 10;
    const fmt = (v) => `${Number.isInteger(v) ? v : v.toFixed(1)} ${s.unit}`;
    let explanation;
    if (!acc) explanation = `${s.productName} n'entre dans aucune recette : pr\xE9vision bas\xE9e uniquement sur votre seuil critique (${fmt(s.criticalLevel)}).`;
    else {
      const peak = perDay.indexOf(Math.max(...perDay));
      const peakDay = DOW_FR[new Date(today.getTime() + (peak + 1) * DAY_MS).getDay()];
      explanation = `Besoin estim\xE9 de ${fmt(Math.round(need * 10) / 10)} sur ${horizon} jours, calcul\xE9 \xE0 partir de ${acc.recipes} recette${acc.recipes > 1 ? "s" : ""} et de vos ventes des 4 derni\xE8res semaines (pic ${peakDay}). Stock actuel ${fmt(s.quantity)}` + (stockoutIdx !== null ? ` \u2192 rupture pr\xE9vue ${DOW_FR[new Date(today.getTime() + (stockoutIdx + 1) * DAY_MS).getDay()]}.` : ", suffisant sur la p\xE9riode.") + (recommended > 0 ? ` Commande recommand\xE9e : ${fmt(recommended)} (inclut ${safetyDays} j de s\xE9curit\xE9).` : "");
    }
    out.push({
      productId: s.productId,
      productName: s.productName,
      unit: s.unit,
      horizonDays: horizon,
      predictedNeed: Math.round(need * 10) / 10,
      currentStock: s.quantity,
      safetyStock: Math.round(safety * 10) / 10,
      recommendedOrder: recommended,
      daysOfStockLeft: daysLeft,
      stockoutDay: stockoutIdx === null ? null : isoDay2(new Date(today.getTime() + (stockoutIdx + 1) * DAY_MS)),
      confidence,
      explanation,
      avgDailyNeed: Math.round(avg * 1e3) / 1e3,
      perDay
    });
  }
  return out.sort((a, b) => (a.stockoutDay ?? "9").localeCompare(b.stockoutDay ?? "9") || b.recommendedOrder - a.recommendedOrder);
}
function buildSmartCart(needs, offers) {
  const notes = [];
  const unavailable = [];
  const choices = [];
  let baseline = 0;
  for (const n15 of needs) {
    if (n15.neededQty <= 0) continue;
    const cands = offers.filter((o) => o.productId === n15.productId && o.inStock);
    if (!cands.length) {
      unavailable.push({ productId: n15.productId, productName: n15.productName, unit: n15.unit, neededQty: n15.neededQty });
      continue;
    }
    const urgencyH = n15.daysOfStockLeft !== null ? Math.max(24, n15.daysOfStockLeft * 24) : Infinity;
    const score = (o) => {
      const packs2 = Math.max(1, Math.ceil(n15.neededQty / o.packQty));
      const cost = packs2 * o.packPrice;
      const latePenalty = o.leadTimeHours > urgencyH ? 1e6 : 0;
      const reliabilityPenalty = (100 - o.reliabilityPct) / 100 * cost * 0.15;
      return cost + latePenalty + reliabilityPenalty;
    };
    const ranked = [...cands].sort((a, b) => score(a) - score(b));
    const best = ranked[0];
    const packs = Math.max(1, Math.ceil(n15.neededQty / best.packQty));
    const usual = n15.preferredSupplierId ? cands.find((o) => o.supplierId === n15.preferredSupplierId) : void 0;
    const usualCost = usual ? Math.max(1, Math.ceil(n15.neededQty / usual.packQty)) * usual.packPrice : packs * best.packPrice;
    baseline += usualCost;
    const lineTotal = packs * best.packPrice;
    const reason = best.leadTimeHours > 48 && urgencyH !== Infinity ? `D\xE9lai ${Math.round(best.leadTimeHours / 24)} j accept\xE9 (stock ${n15.daysOfStockLeft} j)` : usual && usual.offerId !== best.offerId ? `${best.supplierName} moins cher que ${usual.supplierName} (${(usualCost - lineTotal).toFixed(2)} \u20AC \xE9conomis\xE9s)` : best.unitPrice === Math.min(...cands.map((c) => c.unitPrice)) ? "Meilleur prix disponible" : "Meilleur compromis prix / d\xE9lai / fiabilit\xE9";
    choices.push({ line: { productId: n15.productId, productName: n15.productName, unit: n15.unit, neededQty: n15.neededQty, offer: best, packs, quantity: packs * best.packQty, lineTotal, alternativeSaving: Math.max(0, usualCost - lineTotal), reason }, alternatives: ranked.slice(1) });
  }
  const group = () => {
    const m = /* @__PURE__ */ new Map();
    for (const { line } of choices) {
      const o = line.offer;
      const g = m.get(o.supplierId) ?? { supplierId: o.supplierId, supplierName: o.supplierName, lines: [], subtotal: 0, deliveryFee: o.deliveryFee, minOrder: o.minOrder, belowMinimum: false, total: 0, leadTimeHours: o.leadTimeHours };
      g.lines.push(line);
      g.subtotal += line.lineTotal;
      m.set(o.supplierId, g);
    }
    for (const g of m.values()) {
      g.belowMinimum = g.subtotal < g.minOrder;
      g.total = g.subtotal + g.deliveryFee;
      g.subtotal = Math.round(g.subtotal * 100) / 100;
      g.total = Math.round(g.total * 100) / 100;
    }
    return m;
  };
  let groups = group();
  for (let pass = 0; pass < 3; pass++) {
    const weak = [...groups.values()].filter((g) => g.belowMinimum);
    if (!weak.length) break;
    for (const g of weak) {
      for (const ch of choices.filter((c) => c.line.offer.supplierId === g.supplierId)) {
        const alt = ch.alternatives.find((a) => groups.has(a.supplierId) && a.supplierId !== g.supplierId);
        if (!alt) continue;
        const packs = Math.max(1, Math.ceil(ch.line.neededQty / alt.packQty));
        const extra = packs * alt.packPrice - ch.line.lineTotal;
        if (extra <= g.deliveryFee + 5) {
          notes.push(`${ch.line.productName} d\xE9plac\xE9 vers ${alt.supplierName} (+${extra.toFixed(2)} \u20AC) pour \xE9viter une commande sous minimum chez ${g.supplierName}.`);
          ch.line = { ...ch.line, offer: alt, packs, quantity: packs * alt.packQty, lineTotal: packs * alt.packPrice, reason: `Regroup\xE9 chez ${alt.supplierName}` };
        }
      }
    }
    groups = group();
  }
  for (const g of groups.values()) if (g.belowMinimum) notes.push(`${g.supplierName} : panier ${g.subtotal.toFixed(2)} \u20AC sous le minimum de ${g.minOrder} \u20AC \u2014 compl\xE9tez ou diff\xE9rez.`);
  const suppliers3 = [...groups.values()].sort((a, b) => b.total - a.total);
  const total = Math.round(suppliers3.reduce((a, g) => a + g.total, 0) * 100) / 100;
  return { suppliers: suppliers3, total, baselineTotal: Math.round(baseline * 100) / 100, saving: Math.round(Math.max(0, baseline - suppliers3.reduce((a, g) => a + g.subtotal, 0)) * 100) / 100, unavailable, notes };
}
var DAY_MS, DOW_FR, isoDay2;
var init_forecast = __esm({
  "apps/api/src/lib/forecast.ts"() {
    "use strict";
    DAY_MS = 864e5;
    DOW_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
    isoDay2 = (d) => d.toISOString().slice(0, 10);
  }
});

// apps/api/src/lib/assistant.ts
function classifyIntent(question, knownEntities) {
  const q2 = norm(question);
  let intent = "help";
  let confidence = 0.3;
  for (const r of RULES) if (r.patterns.some((p) => p.test(q2))) {
    intent = r.intent;
    confidence = 0.75;
    break;
  }
  const all = [...knownEntities.recipes.map((e) => ({ e, k: "recipe" })), ...knownEntities.products.map((e) => ({ e, k: "product" })), ...knownEntities.suppliers.map((e) => ({ e, k: "supplier" }))];
  let entity;
  let bestLen = 0;
  for (const { e } of all) {
    const ne2 = norm(e);
    const first = ne2.split(/[\s(]/)[0];
    const score = ne2.length > 3 && q2.includes(ne2) ? 1e3 + ne2.length : first.length >= 4 && q2.includes(first) ? first.length : 0;
    if (score > bestLen) {
      entity = e;
      bestLen = score;
    }
  }
  if (intent === "help" && entity) {
    intent = knownEntities.recipes.includes(entity) ? "dish_cost" : knownEntities.suppliers.includes(entity) ? "most_reliable_supplier" : "stock_level";
    confidence = 0.55;
  }
  if (intent === "find_cheaper" && !entity && /riz|poulet|huile|attieke|bissap/.test(q2)) entity = q2.match(/riz|poulet|huile|attieke|bissap/)[0];
  if (entity) confidence = Math.min(0.95, confidence + 0.15);
  return { intent, entity, confidence };
}
function llmEnabled() {
  return !!process.env.LLM_API_KEY;
}
async function llmRephrase(question, facts, draft) {
  if (!llmEnabled()) return null;
  const base = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LLM_API_KEY}` },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: 400, messages: [
        { role: "system", content: "Tu es l'assistant achats d'un restaurant africain. R\xE9ponds en fran\xE7ais, de fa\xE7on concise et concr\xE8te, en tutoyant. Tu ne peux utiliser QUE les faits fournis : n'invente aucun chiffre, prix, fournisseur ou produit. Si les faits ne suffisent pas, dis-le." },
        { role: "user", content: `Question : ${question}

Faits (source de v\xE9rit\xE9) :
${facts}

Brouillon de r\xE9ponse \xE0 am\xE9liorer (garde tous les chiffres) :
${draft}` }
      ] })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}
var norm, RULES, EXAMPLE_QUESTIONS, eur2, qty;
var init_assistant = __esm({
  "apps/api/src/lib/assistant.ts"() {
    "use strict";
    norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, " ");
    RULES = [
      { intent: "what_to_order", patterns: [/que? (dois|devrais|faut)[- ]?(je|il)? ?commander/, /commander cette semaine/, /quoi commander/, /panier/, /liste de courses/, /besoins? (de la|cette) semaine/] },
      { intent: "why_costs_up", patterns: [/pourquoi .*(cout|couts|depense|depenses|prix).*(augment|hausse|mont)/, /(cout|couts|depenses?) .*augment/, /hausse/, /plus cher qu avant/] },
      { intent: "find_cheaper", patterns: [/moins cher/, /meilleur prix/, /compar/, /trouve[- ]moi/, /ou acheter/, /alternative/] },
      { intent: "dish_cost", patterns: [/combien (me )?coute/, /cout (matiere|de revient)/, /marge/, /rentab/, /prix de revient/] },
      { intent: "should_raise_price", patterns: [/augmenter le prix/, /monter le prix/, /prix de vente/, /dois[- ]je (augmenter|changer)/, /(bon|juste) prix/] },
      { intent: "most_reliable_supplier", patterns: [/fiable/, /meilleur fournisseur/, /fournisseur .*(confiance|serieux|retard)/, /retards?/] },
      { intent: "monthly_spend", patterns: [/combien (j ai|ai[- ]je) depense/, /depenses? (du|ce) mois/, /budget/, /total (des )?achats/, /depense/] },
      { intent: "upcoming_stockouts", patterns: [/rupture/, /va(is)? manquer/, /bientot (plus|fini)/, /en manque/, /alerte/] },
      { intent: "stock_level", patterns: [/combien (il )?(me )?reste/, /stock de/, /reste[- ]t[- ]il/, /j ai combien/, /quantite/] }
    ];
    EXAMPLE_QUESTIONS = [
      "Qu\u2019est-ce que je dois commander cette semaine ?",
      "Pourquoi mes co\xFBts augmentent ?",
      "Trouve-moi moins cher pour le riz.",
      "Combien me co\xFBte r\xE9ellement mon maf\xE9 ?",
      "Quel fournisseur est le plus fiable ?",
      "Est-ce que je dois augmenter le prix du poulet brais\xE9 ?",
      "Combien ai-je d\xE9pens\xE9 ce mois-ci ?",
      "Quelles ruptures arrivent ?",
      "Combien il me reste de plantain ?"
    ];
    eur2 = (v) => `${v.toFixed(2).replace(".", ",")} \u20AC`;
    qty = (v, u) => `${Number.isInteger(v) ? v : v.toFixed(1).replace(".", ",")} ${u}`;
  }
});

// apps/api/src/routes/intelligence.ts
import { Hono as Hono4 } from "hono";
import { z as z4 } from "zod";
import { and as and8, eq as eq10, desc as desc2, gte as gte2, sql as sql6, inArray as inArray3 } from "drizzle-orm";
async function loadContext(rid) {
  const db = await getDb();
  const [restaurant] = await db.select().from(restaurants).where(eq10(restaurants.id, rid));
  const [inv, salesRows, ingRows, recs, offerRows, statRows] = await Promise.all([
    db.select({ item: inventoryItems, product: products }).from(inventoryItems).innerJoin(products, eq10(products.id, inventoryItems.productId)).where(eq10(inventoryItems.restaurantId, rid)),
    db.select({ recipeId: sales.recipeId, day: sales.day, portions: sales.portions }).from(sales).where(and8(eq10(sales.restaurantId, rid), gte2(sales.day, new Date(Date.now() - 70 * 864e5).toISOString().slice(0, 10)))),
    db.select({ recipeId: recipeIngredients.recipeId, productId: recipeIngredients.productId, quantity: recipeIngredients.quantity }).from(recipeIngredients).innerJoin(recipes, eq10(recipes.id, recipeIngredients.recipeId)).where(and8(eq10(recipes.restaurantId, rid), eq10(recipes.isActive, true))),
    db.select().from(recipes).where(eq10(recipes.restaurantId, rid)),
    db.select({ offer: supplierOffers, supplier: suppliers }).from(supplierOffers).innerJoin(suppliers, eq10(suppliers.id, supplierOffers.supplierId)).where(and8(eq10(supplierOffers.restaurantId, rid), eq10(suppliers.isActive, true))),
    db.select({ supplierId: orders.supplierId, delivered: sql6`count(*) filter (where ${orders.status} in ('livree','livree_partiel'))`, late: sql6`count(*) filter (where ${deliveries.isLate})`, disc: sql6`count(*) filter (where ${deliveries.hasDiscrepancy})`, spent: sql6`coalesce(sum(${orders.totalEur}),0)` }).from(orders).leftJoin(deliveries, eq10(deliveries.orderId, orders.id)).where(eq10(orders.restaurantId, rid)).groupBy(orders.supplierId)
  ]);
  const stats = new Map(statRows.map((r) => [r.supplierId, { delivered: n3(r.delivered), late: n3(r.late), discrepancies: n3(r.disc), spent: n3(r.spent), reliability: supplierReliability({ delivered: n3(r.delivered), late: n3(r.late), discrepancies: n3(r.disc) }) }]));
  const offers = offerRows.map(({ offer, supplier }) => ({ offerId: offer.id, supplierId: supplier.id, supplierName: supplier.name, productId: offer.productId, packLabel: offer.packLabel, packQty: n3(offer.packQty), packPrice: n3(offer.packPriceEur), unitPrice: n3(offer.packPriceEur) / n3(offer.packQty), inStock: offer.inStock, leadTimeHours: supplier.leadTimeHours, deliveryFee: n3(supplier.deliveryFeeEur), minOrder: n3(supplier.minOrderEur), reliabilityPct: stats.get(supplier.id)?.reliability ?? 85 }));
  const stocks = inv.map(({ item, product }) => ({ productId: product.id, productName: product.name, unit: product.baseUnit, quantity: n3(item.quantity), criticalLevel: n3(item.criticalLevel), targetLevel: item.targetLevel ? n3(item.targetLevel) : null, shelfLifeDays: product.shelfLifeDays, preferredSupplierId: item.preferredSupplierId, inventoryItemId: item.id }));
  const ingredients = ingRows.map((i) => ({ ...i, quantity: n3(i.quantity) }));
  const horizon = restaurant.settings?.forecastHorizonDays ?? 7;
  const rf = forecastRecipes(salesRows, recs.map((r) => r.id), { horizonDays: horizon });
  const pf = forecastProducts(rf, ingredients, stocks, { horizonDays: horizon });
  return { restaurant, stocks, offers, stats, recipes: recs, ingredients, sales: salesRows, recipeForecasts: rf, productForecasts: pf, horizon };
}
async function runAutoReorder(rid, userId = null) {
  const db = await getDb();
  const ctx = await loadContext(rid);
  const rules = await db.select().from(reorderRules).where(and8(eq10(reorderRules.restaurantId, rid), eq10(reorderRules.enabled, true)));
  const pending = await db.select({ productId: orderLines.productId }).from(orderLines).innerJoin(orders, eq10(orders.id, orderLines.orderId)).where(and8(eq10(orders.restaurantId, rid), inArray3(orders.status, ["preparee", "envoyee", "confirmee"])));
  const pendingSet = new Set(pending.map((p) => p.productId));
  const prepared = [];
  const skipped = [];
  for (const rule of rules) {
    const s = ctx.stocks.find((x) => x.inventoryItemId === rule.inventoryItemId);
    if (!s) continue;
    if (s.quantity > n3(rule.threshold)) continue;
    if (pendingSet.has(s.productId)) {
      skipped.push(`${s.productName} : une commande est d\xE9j\xE0 en cours`);
      continue;
    }
    const cands = ctx.offers.filter((o) => o.productId === s.productId && o.inStock && (rule.supplierStrategy !== "preferred" || !s.preferredSupplierId || o.supplierId === s.preferredSupplierId));
    if (!cands.length) {
      skipped.push(`${s.productName} : aucune offre disponible`);
      continue;
    }
    const f = ctx.productForecasts.find((x) => x.productId === s.productId);
    const cmp = compareOffers(cands, { daysOfStockLeft: f?.daysOfStockLeft ?? null, neededQty: n3(rule.reorderQty), unit: s.unit });
    const best = cmp.recommended;
    const packs = Math.max(1, Math.ceil(n3(rule.reorderQty) / best.packQty));
    const reference = await nextOrderReference();
    const total = packs * best.packPrice;
    const sup = await db.select().from(suppliers).where(eq10(suppliers.id, best.supplierId)).then((r) => r[0]);
    const [order] = await db.insert(orders).values({ restaurantId: rid, supplierId: best.supplierId, reference, status: "preparee", channel: sup.preferredChannel, expectedAt: new Date(Date.now() + best.leadTimeHours * 36e5).toISOString().slice(0, 10), totalEur: total.toFixed(2), deliveryFeeEur: best.deliveryFee.toFixed(2), source: "auto_reorder", createdBy: userId, notes: cmp.justification.join(" ") }).returning();
    await db.insert(orderLines).values({ orderId: order.id, productId: s.productId, offerId: best.offerId, packLabel: best.packLabel, packs, quantity: (packs * best.packQty).toFixed(3), unitPriceEur: best.unitPrice.toFixed(4), lineTotalEur: total.toFixed(2) });
    await db.insert(alerts).values({ restaurantId: rid, dedupeKey: `auto_reorder:${order.id}`, kind: "stock_bas", severity: "blue", title: `\u{1F916} Auto-Reorder \u2014 ${s.productName}`, message: `Stock \xE0 ${qty(s.quantity, s.unit)} (seuil ${qty(n3(rule.threshold), s.unit)}). Commande de ${qty(packs * best.packQty, s.unit)} pr\xE9par\xE9e chez ${best.supplierName} pour ${eur2(total)}. ${cmp.justification[1] ?? ""}`.trim(), productId: s.productId, supplierId: best.supplierId, actionUrl: "/app/achats" }).onConflictDoNothing();
    prepared.push({ productName: s.productName, supplierName: best.supplierName, packs, packLabel: best.packLabel, total, reference });
  }
  return { prepared, skipped };
}
var intelligenceRoutes, n3;
var init_intelligence = __esm({
  "apps/api/src/routes/intelligence.ts"() {
    "use strict";
    init_src();
    init_reference();
    init_auth();
    init_forecast();
    init_engines();
    init_assistant();
    intelligenceRoutes = new Hono4();
    intelligenceRoutes.use("*", requireAuth, requireRestaurant);
    n3 = (v) => v === null || v === void 0 ? 0 : Number(v);
    intelligenceRoutes.get("/forecast", async (c) => {
      const rid = c.get("restaurantId");
      const ctx = await loadContext(rid);
      const recipeView = ctx.recipes.map((r) => ({ id: r.id, name: r.name, ...ctx.recipeForecasts.get(r.id) ?? { perDay: [], total: 0, confidence: 0 } }));
      return c.json({ horizonDays: ctx.horizon, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), products: ctx.productForecasts, recipes: recipeView, salesDays: new Set(ctx.sales.map((s) => s.day)).size });
    });
    intelligenceRoutes.post("/forecast/snapshot", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const ctx = await loadContext(rid);
      if (ctx.productForecasts.length) await db.insert(forecasts).values(ctx.productForecasts.map((f) => ({ restaurantId: rid, productId: f.productId, horizonDays: f.horizonDays, predictedNeed: f.predictedNeed.toFixed(3), currentStock: f.currentStock.toFixed(3), recommendedOrder: f.recommendedOrder.toFixed(3), daysOfStockLeft: f.daysOfStockLeft?.toFixed(1), confidence: f.confidence.toFixed(2), explanation: f.explanation })));
      return c.json({ saved: ctx.productForecasts.length });
    });
    intelligenceRoutes.get("/smart-cart", async (c) => {
      const rid = c.get("restaurantId");
      const ctx = await loadContext(rid);
      const needs = ctx.productForecasts.filter((f) => f.recommendedOrder > 0).map((f) => {
        const s = ctx.stocks.find((x) => x.productId === f.productId);
        return { productId: f.productId, productName: f.productName, unit: f.unit, neededQty: f.recommendedOrder, daysOfStockLeft: f.daysOfStockLeft, preferredSupplierId: s.preferredSupplierId };
      });
      const cart = buildSmartCart(needs, ctx.offers);
      return c.json({ ...cart, needsCount: needs.length, horizonDays: ctx.horizon });
    });
    intelligenceRoutes.post("/smart-cart/checkout", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const user = c.get("user");
      const body3 = z4.object({ suppliers: z4.array(z4.object({ supplierId: z4.string().uuid(), lines: z4.array(z4.object({ offerId: z4.string().uuid(), packs: z4.number().int().positive() })).min(1) })).min(1), source: z4.string().default("panier_ia") }).safeParse(await c.req.json());
      if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
      const created = [];
      for (const s of body3.data.suppliers) {
        const [sup] = await db.select().from(suppliers).where(and8(eq10(suppliers.id, s.supplierId), eq10(suppliers.restaurantId, rid)));
        if (!sup) continue;
        const offs = await db.select().from(supplierOffers).where(and8(eq10(supplierOffers.supplierId, sup.id), inArray3(supplierOffers.id, s.lines.map((l) => l.offerId))));
        const reference = await nextOrderReference();
        const lines = s.lines.flatMap((l) => {
          const o = offs.find((x) => x.id === l.offerId);
          if (!o) return [];
          const unit2 = n3(o.packPriceEur) / n3(o.packQty);
          return [{ productId: o.productId, offerId: o.id, packLabel: o.packLabel, packs: l.packs, quantity: (l.packs * n3(o.packQty)).toFixed(3), unitPriceEur: unit2.toFixed(4), lineTotalEur: (l.packs * n3(o.packPriceEur)).toFixed(2) }];
        });
        const total = lines.reduce((a, l) => a + Number(l.lineTotalEur), 0);
        const [order] = await db.insert(orders).values({ restaurantId: rid, supplierId: sup.id, reference, status: "preparee", channel: sup.preferredChannel, expectedAt: new Date(Date.now() + sup.leadTimeHours * 36e5).toISOString().slice(0, 10), totalEur: total.toFixed(2), deliveryFeeEur: sup.deliveryFeeEur, source: body3.data.source, createdBy: user.id }).returning();
        await db.insert(orderLines).values(lines.map((l) => ({ ...l, orderId: order.id })));
        created.push({ reference, supplierName: sup.name, total });
      }
      return c.json({ created, message: `${created.length} commande${created.length > 1 ? "s" : ""} pr\xE9par\xE9e${created.length > 1 ? "s" : ""} pour ${eur2(created.reduce((a, x) => a + x.total, 0))}. Validez-les dans Achats.` }, 201);
    });
    intelligenceRoutes.get("/reorder-rules", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const rows = await db.select({ rule: reorderRules, product: products, item: inventoryItems }).from(reorderRules).innerJoin(inventoryItems, eq10(inventoryItems.id, reorderRules.inventoryItemId)).innerJoin(products, eq10(products.id, inventoryItems.productId)).where(eq10(reorderRules.restaurantId, rid));
      return c.json({ rules: rows.map((r) => ({ ...r.rule, productName: r.product.name, unit: r.product.baseUnit, quantity: n3(r.item.quantity) })) });
    });
    intelligenceRoutes.put("/reorder-rules/:inventoryItemId", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const body3 = z4.object({ enabled: z4.boolean().default(true), threshold: z4.number().nonnegative(), reorderQty: z4.number().positive(), supplierStrategy: z4.enum(["best", "preferred"]).default("best") }).safeParse(await c.req.json());
      if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
      const [item] = await db.select().from(inventoryItems).where(and8(eq10(inventoryItems.id, c.req.param("inventoryItemId")), eq10(inventoryItems.restaurantId, rid)));
      if (!item) return c.json({ error: "Article introuvable" }, 404);
      const [rule] = await db.insert(reorderRules).values({ restaurantId: rid, inventoryItemId: item.id, enabled: body3.data.enabled, threshold: body3.data.threshold.toFixed(3), reorderQty: body3.data.reorderQty.toFixed(3), supplierStrategy: body3.data.supplierStrategy }).onConflictDoUpdate({ target: reorderRules.inventoryItemId, set: { enabled: body3.data.enabled, threshold: body3.data.threshold.toFixed(3), reorderQty: body3.data.reorderQty.toFixed(3), supplierStrategy: body3.data.supplierStrategy } }).returning();
      return c.json(rule);
    });
    intelligenceRoutes.delete("/reorder-rules/:inventoryItemId", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      await db.delete(reorderRules).where(and8(eq10(reorderRules.inventoryItemId, c.req.param("inventoryItemId")), eq10(reorderRules.restaurantId, rid)));
      return c.json({ ok: true });
    });
    intelligenceRoutes.post("/reorder-rules/run", async (c) => {
      const r = await runAutoReorder(c.get("restaurantId"), c.get("user").id);
      return c.json(r);
    });
    intelligenceRoutes.get("/sales", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const day = c.req.query("day") ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const [recs, rows] = await Promise.all([db.select().from(recipes).where(and8(eq10(recipes.restaurantId, rid), eq10(recipes.isActive, true))).orderBy(recipes.name), db.select().from(sales).where(and8(eq10(sales.restaurantId, rid), eq10(sales.day, day)))]);
      const last14 = await db.select({ day: sales.day, portions: sql6`sum(${sales.portions})` }).from(sales).where(and8(eq10(sales.restaurantId, rid), gte2(sales.day, new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)))).groupBy(sales.day).orderBy(sales.day);
      return c.json({ day, recipes: recs.map((r) => ({ id: r.id, name: r.name, portions: rows.find((s) => s.recipeId === r.id)?.portions ?? 0 })), history: last14.map((h) => ({ day: h.day, portions: n3(h.portions) })) });
    });
    intelligenceRoutes.post("/sales", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const user = c.get("user");
      const body3 = z4.object({ day: z4.string().regex(/^\d{4}-\d{2}-\d{2}$/), lines: z4.array(z4.object({ recipeId: z4.string().uuid(), portions: z4.number().int().nonnegative() })), decrementStock: z4.boolean().default(true) }).safeParse(await c.req.json());
      if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
      const { day, lines, decrementStock } = body3.data;
      const prev = await db.select().from(sales).where(and8(eq10(sales.restaurantId, rid), eq10(sales.day, day)));
      const prevMap = new Map(prev.map((p) => [p.recipeId, p.portions]));
      let consumed = 0;
      for (const l of lines) {
        await db.insert(sales).values({ restaurantId: rid, recipeId: l.recipeId, day, portions: l.portions }).onConflictDoUpdate({ target: [sales.restaurantId, sales.recipeId, sales.day], set: { portions: l.portions } });
        const delta = l.portions - (prevMap.get(l.recipeId) ?? 0);
        if (!decrementStock || delta === 0) continue;
        const ings = await db.select().from(recipeIngredients).where(eq10(recipeIngredients.recipeId, l.recipeId));
        for (const ing of ings) {
          const [inv] = await db.select().from(inventoryItems).where(and8(eq10(inventoryItems.restaurantId, rid), eq10(inventoryItems.productId, ing.productId)));
          if (!inv) continue;
          const q2 = delta * n3(ing.quantity);
          const { stockMovements: stockMovements2 } = await Promise.resolve().then(() => (init_src(), src_exports));
          await db.insert(stockMovements2).values({ restaurantId: rid, inventoryItemId: inv.id, type: "consommation", quantity: (-q2).toFixed(3), note: `Ventes ${day}`, createdBy: user.id });
          await db.update(inventoryItems).set({ quantity: Math.max(0, n3(inv.quantity) - q2).toFixed(3), updatedAt: /* @__PURE__ */ new Date() }).where(eq10(inventoryItems.id, inv.id));
          consumed++;
        }
      }
      return c.json({ ok: true, day, movements: consumed });
    });
    intelligenceRoutes.get("/assistant/examples", (c) => c.json({ examples: EXAMPLE_QUESTIONS, llm: llmEnabled() }));
    intelligenceRoutes.post("/assistant/ask", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const body3 = z4.object({ question: z4.string().min(2).max(500) }).safeParse(await c.req.json());
      if (!body3.success) return c.json({ error: "Question invalide" }, 400);
      const question = body3.data.question;
      const ctx = await loadContext(rid);
      const supplierNames = [...new Set(ctx.offers.map((o) => o.supplierName))];
      const cls = classifyIntent(question, { products: ctx.stocks.map((s) => s.productName), recipes: ctx.recipes.map((r) => r.name), suppliers: supplierNames });
      const facts = [];
      let draft = "";
      const actions = [];
      const findStock = (e) => e ? ctx.stocks.find((s) => s.productName === e) ?? ctx.stocks.find((s) => s.productName.toLowerCase().includes(e.toLowerCase())) : void 0;
      switch (cls.intent) {
        case "what_to_order": {
          const needs = ctx.productForecasts.filter((f) => f.recommendedOrder > 0);
          const cart = buildSmartCart(needs.map((f) => ({ productId: f.productId, productName: f.productName, unit: f.unit, neededQty: f.recommendedOrder, daysOfStockLeft: f.daysOfStockLeft, preferredSupplierId: ctx.stocks.find((s) => s.productId === f.productId)?.preferredSupplierId })), ctx.offers);
          const urgent = needs.filter((f) => f.stockoutDay).slice(0, 5);
          facts.push(`Produits \xE0 commander sur ${ctx.horizon} j : ${needs.length}`, ...needs.slice(0, 12).map((f) => `- ${f.productName} : besoin ${qty(f.predictedNeed, f.unit)}, stock ${qty(f.currentStock, f.unit)}, commander ${qty(f.recommendedOrder, f.unit)}${f.stockoutDay ? ` (rupture pr\xE9vue le ${f.stockoutDay})` : ""}`), `Panier optimis\xE9 : ${eur2(cart.total)} chez ${cart.suppliers.length} fournisseur(s) ; \xE9conomie vs habitudes : ${eur2(cart.saving)}`);
          draft = needs.length ? `Pour les ${ctx.horizon} prochains jours, tu dois commander **${needs.length} produits**. Les plus urgents : ${urgent.map((f) => `${f.productName} (${qty(f.recommendedOrder, f.unit)}, rupture pr\xE9vue le ${f.stockoutDay?.slice(8, 10)}/${f.stockoutDay?.slice(5, 7)})`).join(", ") || "aucune rupture imminente"}. J'ai pr\xE9par\xE9 un panier optimis\xE9 de **${eur2(cart.total)}** r\xE9parti entre ${cart.suppliers.map((s) => s.supplierName).join(", ")}${cart.saving > 0 ? `, soit **${eur2(cart.saving)} d'\xE9conomie** par rapport \xE0 tes fournisseurs habituels` : ""}.` : `Bonne nouvelle : d'apr\xE8s tes ventes et ton stock, rien d'urgent \xE0 commander sur ${ctx.horizon} jours.`;
          actions.push({ label: "Voir le panier intelligent", url: "/app/achats/panier" });
          break;
        }
        case "upcoming_stockouts": {
          const soon = ctx.productForecasts.filter((f) => f.stockoutDay).slice(0, 8);
          facts.push(...soon.map((f) => `- ${f.productName} : stock ${qty(f.currentStock, f.unit)}, besoin/jour ${qty(f.avgDailyNeed, f.unit)}, rupture le ${f.stockoutDay}`));
          draft = soon.length ? `${soon.length} rupture${soon.length > 1 ? "s" : ""} \xE0 venir : ${soon.map((f) => `**${f.productName}** le ${f.stockoutDay.slice(8, 10)}/${f.stockoutDay.slice(5, 7)} (reste ${qty(f.currentStock, f.unit)}, ~${qty(f.avgDailyNeed, f.unit)}/jour)`).join(" ; ")}.` : "Aucune rupture pr\xE9vue sur la p\xE9riode avec ton rythme de ventes actuel.";
          actions.push({ label: "Voir la pr\xE9vision", url: "/app/stock/prevision" });
          break;
        }
        case "stock_level": {
          const s = findStock(cls.entity);
          if (!s) {
            draft = `Je ne trouve pas \xAB ${cls.entity ?? question} \xBB dans ton stock suivi.`;
            break;
          }
          const f = ctx.productForecasts.find((x) => x.productId === s.productId);
          facts.push(`${s.productName} : ${qty(s.quantity, s.unit)}, seuil ${qty(s.criticalLevel, s.unit)}, besoin/jour ${qty(f?.avgDailyNeed ?? 0, s.unit)}, jours restants ${f?.daysOfStockLeft ?? "n/a"}`);
          draft = `Il te reste **${qty(s.quantity, s.unit)}** de ${s.productName.toLowerCase()}${f?.daysOfStockLeft !== null && f ? `, soit environ **${f.daysOfStockLeft} jours** au rythme actuel (${qty(f.avgDailyNeed, s.unit)}/jour)` : ""}. ${f?.recommendedOrder ? `Je recommande d'en commander ${qty(f.recommendedOrder, s.unit)}.` : "Pas besoin de commander pour l'instant."}`;
          actions.push({ label: `Comparer les fournisseurs`, url: `/app/achats/comparer/${s.productId}` });
          break;
        }
        case "find_cheaper": {
          const s = findStock(cls.entity) ?? ctx.stocks.find((x) => cls.entity && x.productName.toLowerCase().startsWith(cls.entity.toLowerCase()));
          if (!s) {
            draft = "Pr\xE9cise le produit (ex. \xAB moins cher pour le riz \xBB).";
            break;
          }
          const cands = ctx.offers.filter((o) => o.productId === s.productId);
          const f = ctx.productForecasts.find((x) => x.productId === s.productId);
          const cmp = compareOffers(cands, { daysOfStockLeft: f?.daysOfStockLeft ?? null, neededQty: f?.recommendedOrder || 1, unit: s.unit });
          facts.push(...cmp.ranked.map((o) => `- ${o.supplierName} : ${eur2(o.unitPrice)}/${s.unit} (${o.packLabel} ${eur2(o.packPrice)}), d\xE9lai ${Math.round(o.leadTimeHours / 24)} j, ${o.inStock ? "en stock" : "rupture"}, fiabilit\xE9 ${o.reliabilityPct} %, score ${o.score}`));
          draft = cmp.recommended ? `Pour **${s.productName.toLowerCase()}**, ${cmp.ranked.length} fournisseur${cmp.ranked.length > 1 ? "s" : ""} : ${cmp.ranked.map((o) => `${o.supplierName} \xE0 ${eur2(o.unitPrice)}/${s.unit}`).join(", ")}. ${cmp.headline}. ${cmp.justification.slice(0, 2).join(" ")}` : `Aucun fournisseur ne propose ${s.productName.toLowerCase()} pour l'instant \u2014 ajoute une offre via l'import.`;
          actions.push({ label: "Ouvrir le comparateur", url: `/app/achats/comparer/${s.productId}` });
          break;
        }
        case "dish_cost":
        case "should_raise_price": {
          const r = cls.entity ? ctx.recipes.find((x) => x.name === cls.entity) ?? ctx.recipes.find((x) => x.name.toLowerCase().includes(cls.entity.toLowerCase())) : void 0;
          if (!r) {
            draft = `Quel plat ? Tes recettes : ${ctx.recipes.map((x) => x.name).slice(0, 8).join(", ")}.`;
            break;
          }
          const prices = /* @__PURE__ */ new Map();
          for (const o of ctx.offers) if (o.inStock && (!prices.has(o.productId) || o.unitPrice < prices.get(o.productId))) prices.set(o.productId, o.unitPrice);
          const list = ctx.ingredients.filter((i) => i.recipeId === r.id).map((i) => {
            const s = ctx.stocks.find((x) => x.productId === i.productId);
            return { productId: i.productId, productName: s?.productName ?? "?", quantity: i.quantity, unit: s?.unit ?? "" };
          });
          const cost = recipeCost(list, prices);
          const sell = r.sellingPriceEur ? n3(r.sellingPriceEur) : null;
          const m = marginAnalysis(cost.total, sell, n3(r.targetMarginPct) || 70);
          const top = [...cost.lines].sort((a, b) => b.cost - a.cost).slice(0, 3);
          facts.push(`${r.name} : co\xFBt mati\xE8re ${eur2(cost.total)}, prix de vente ${sell ? eur2(sell) : "non renseign\xE9"}, marge brute ${m.grossMargin !== null ? eur2(m.grossMargin) : "n/a"} (${m.marginPct ?? "n/a"} %), objectif ${n3(r.targetMarginPct) || 70} %`, `Top ingr\xE9dients : ${top.map((l) => `${l.productName} ${eur2(l.cost)}`).join(", ")}`, ...cost.unpriced.length ? [`Sans prix connu : ${cost.unpriced.join(", ")}`] : []);
          if (cls.intent === "dish_cost") draft = `Ton **${r.name}** te co\xFBte **${eur2(cost.total)}** de mati\xE8res par portion${sell ? `, pour un prix de vente de ${eur2(sell)} : marge brute **${eur2(m.grossMargin)}** (${m.marginPct} %)` : ""}. Les postes principaux : ${top.map((l) => `${l.productName.toLowerCase()} (${eur2(l.cost)})`).join(", ")}.${cost.unpriced.length ? ` Attention, ${cost.unpriced.length} ingr\xE9dient${cost.unpriced.length > 1 ? "s" : ""} sans prix connu (${cost.unpriced.slice(0, 3).join(", ")}) : le co\xFBt r\xE9el est un peu plus \xE9lev\xE9.` : ""}`;
          else draft = !sell ? `Renseigne d'abord le prix de vente du ${r.name}. Avec un co\xFBt mati\xE8re de ${eur2(cost.total)} et un objectif de ${n3(r.targetMarginPct) || 70} % de marge, le prix conseill\xE9 serait **${eur2(m.suggestedPrice)}**.` : m.suggestedPrice ? `Oui, je te le conseille : le ${r.name} est vendu ${eur2(sell)} pour ${eur2(cost.total)} de mati\xE8res, soit ${m.marginPct} % de marge, sous ton objectif de ${n3(r.targetMarginPct) || 70} %. **Prix conseill\xE9 : ${eur2(m.suggestedPrice)}**. Alternative : r\xE9duire le poste ${top[0].productName.toLowerCase()} (${eur2(top[0].cost)}).` : `Pas n\xE9cessaire : \xE0 ${eur2(sell)}, ton ${r.name} d\xE9gage ${m.marginPct} % de marge brute (${eur2(m.grossMargin)}), au-dessus de ton objectif. Surveille surtout ${top[0].productName.toLowerCase()}, premier poste de co\xFBt.`;
          actions.push({ label: "Voir les recettes", url: "/app/recettes" });
          break;
        }
        case "most_reliable_supplier": {
          const rows = supplierNames.map((name) => {
            const id = ctx.offers.find((o) => o.supplierName === name).supplierId;
            return { name, ...ctx.stats.get(id) ?? { delivered: 0, late: 0, discrepancies: 0, spent: 0, reliability: 85 } };
          }).sort((a, b) => b.reliability - a.reliability || b.delivered - a.delivered);
          facts.push(...rows.map((r) => `- ${r.name} : fiabilit\xE9 ${r.reliability} %, ${r.delivered} livraisons, ${r.late} retards, ${r.discrepancies} \xE9carts, ${eur2(r.spent)} d\xE9pens\xE9s`));
          const best = rows.find((r) => r.delivered > 0) ?? rows[0];
          const worst = [...rows].reverse().find((r) => r.delivered > 0);
          draft = `Ton fournisseur le plus fiable est **${best.name}** (${best.reliability} % sur ${best.delivered} livraisons, ${best.late} retard${best.late > 1 ? "s" : ""}, ${best.discrepancies} \xE9cart${best.discrepancies > 1 ? "s" : ""}).${worst && worst.name !== best.name ? ` \xC0 surveiller : ${worst.name} (${worst.reliability} %, ${worst.late} retard${worst.late > 1 ? "s" : ""} et ${worst.discrepancies} \xE9cart${worst.discrepancies > 1 ? "s" : ""} sur ${worst.delivered}).` : ""}`;
          actions.push({ label: "Voir les fournisseurs", url: "/app/fournisseurs" });
          break;
        }
        case "monthly_spend":
        case "why_costs_up": {
          const start = /* @__PURE__ */ new Date();
          start.setDate(1);
          start.setHours(0, 0, 0, 0);
          const [sp] = await db.select({ month: sql6`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${start.toISOString()}),0)`, last30: sql6`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${new Date(Date.now() - 30 * 864e5).toISOString()}),0)`, prev30: sql6`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${new Date(Date.now() - 60 * 864e5).toISOString()} and ${orders.createdAt} < ${new Date(Date.now() - 30 * 864e5).toISOString()}),0)` }).from(orders).where(and8(eq10(orders.restaurantId, rid), sql6`${orders.status} <> 'annulee'`));
          const bySup = await db.select({ name: suppliers.name, total: sql6`sum(${orders.totalEur})` }).from(orders).innerJoin(suppliers, eq10(suppliers.id, orders.supplierId)).where(and8(eq10(orders.restaurantId, rid), gte2(orders.createdAt, new Date(Date.now() - 30 * 864e5)))).groupBy(suppliers.name).orderBy(desc2(sql6`sum(${orders.totalEur})`));
          const ph = await db.select({ productName: products.name, unit: products.baseUnit, supplierName: suppliers.name, price: priceHistory.unitPriceEur, at: priceHistory.recordedAt, offerId: priceHistory.offerId }).from(priceHistory).innerJoin(supplierOffers, eq10(supplierOffers.id, priceHistory.offerId)).innerJoin(products, eq10(products.id, supplierOffers.productId)).innerJoin(suppliers, eq10(suppliers.id, supplierOffers.supplierId)).where(and8(eq10(priceHistory.restaurantId, rid), gte2(priceHistory.recordedAt, new Date(Date.now() - 60 * 864e5)))).orderBy(priceHistory.recordedAt);
          const hikes = [];
          for (const offerId of new Set(ph.map((p) => p.offerId))) {
            const pts = ph.filter((p) => p.offerId === offerId);
            if (pts.length < 2) continue;
            const a = n3(pts[0].price), b = n3(pts[pts.length - 1].price);
            if (a > 0 && (b - a) / a >= 0.05) hikes.push({ productName: pts[0].productName, supplierName: pts[0].supplierName, pct: Math.round((b - a) / a * 100), from: a, to: b, unit: pts[0].unit });
          }
          hikes.sort((x, y) => y.pct - x.pct);
          const evo = n3(sp.prev30) > 0 ? Math.round((n3(sp.last30) - n3(sp.prev30)) / n3(sp.prev30) * 100) : null;
          facts.push(`D\xE9penses mois en cours ${eur2(n3(sp.month))}, 30 derniers jours ${eur2(n3(sp.last30))}, 30 j pr\xE9c\xE9dents ${eur2(n3(sp.prev30))}, \xE9volution ${evo ?? "n/a"} %`, `Par fournisseur (30 j) : ${bySup.map((b) => `${b.name} ${eur2(n3(b.total))}`).join(", ")}`, `Hausses de prix (60 j) : ${hikes.map((h) => `${h.productName} chez ${h.supplierName} +${h.pct} % (${eur2(h.from)}\u2192${eur2(h.to)}/${h.unit})`).join(" ; ") || "aucune"}`);
          if (cls.intent === "monthly_spend") draft = `Ce mois-ci, tu as d\xE9pens\xE9 **${eur2(n3(sp.month))}** chez tes fournisseurs (${eur2(n3(sp.last30))} sur 30 jours glissants${evo !== null ? `, ${evo > 0 ? "+" : ""}${evo} % vs la p\xE9riode pr\xE9c\xE9dente` : ""}). R\xE9partition : ${bySup.slice(0, 4).map((b) => `${b.name} ${eur2(n3(b.total))}`).join(", ")}.`;
          else draft = `${evo !== null ? `Tes achats ont \xE9volu\xE9 de **${evo > 0 ? "+" : ""}${evo} %** sur 30 jours (${eur2(n3(sp.last30))} vs ${eur2(n3(sp.prev30))}). ` : ""}${hikes.length ? `Les causes identifi\xE9es c\xF4t\xE9 prix : ${hikes.slice(0, 3).map((h) => `**${h.productName}** +${h.pct} % chez ${h.supplierName} (${eur2(h.from)} \u2192 ${eur2(h.to)}/${h.unit})`).join(", ")}. ` : "Aucune hausse de tarif fournisseur significative : la variation vient des volumes command\xE9s. "}${bySup[0] ? `Ton premier poste est ${bySup[0].name} (${eur2(n3(bySup[0].total))} sur 30 j).` : ""}${hikes.length ? " Je peux te proposer des alternatives moins ch\xE8res pour ces produits." : ""}`;
          actions.push({ label: "Voir l\u2019analyse", url: "/app/analyse" });
          break;
        }
        default:
          draft = `Je peux t'aider sur : quoi commander, les ruptures \xE0 venir, le niveau d'un stock, trouver moins cher, le co\xFBt et la marge d'un plat, le fournisseur le plus fiable, tes d\xE9penses et l'\xE9volution des co\xFBts. Essaie par exemple : \xAB ${EXAMPLE_QUESTIONS[0]} \xBB`;
      }
      const factsText = facts.join("\n");
      const polished = await llmRephrase(question, factsText, draft);
      return c.json({ question, intent: cls.intent, entity: cls.entity, confidence: cls.confidence, answer: polished ?? draft, facts, actions, engine: polished ? "llm" : "local" });
    });
  }
});

// apps/api/src/lib/sms.ts
function normalizePhone(raw) {
  if (!raw) return null;
  let s = raw.replace(/^whatsapp:/i, "").replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (s.startsWith("0") && s.length === 10) s = `+33${s.slice(1)}`;
  if (!s.startsWith("+") && /^\d{9,15}$/.test(s)) s = `+${s}`;
  return /^\+\d{9,15}$/.test(s) ? s : null;
}
function smsConfig() {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  const wa = process.env.TWILIO_WHATSAPP_FROM, sms = process.env.TWILIO_SMS_FROM;
  return { enabled: !!(sid && token && (wa || sms)), whatsapp: !!(sid && token && wa), sms: !!(sid && token && sms), sid, token, wa: wa ? wa.startsWith("whatsapp:") ? wa : `whatsapp:${wa}` : void 0, smsFrom: sms };
}
async function log(row) {
  try {
    const db = await getDb();
    await db.insert(notifications).values(row);
  } catch (e) {
    console.warn("[sms] log KO", e.message);
  }
}
async function sendMessage(o) {
  const to = normalizePhone(o.to);
  const cfg = smsConfig();
  const base = { kind: o.kind, orderId: o.orderId ?? null, vendorId: o.vendorId ?? null, restaurantId: o.restaurantId ?? null, body: o.body };
  if (!to) {
    await log({ ...base, channel: "log", to: o.to, ok: false, error: "num\xE9ro invalide" });
    return { ok: false, channel: "log", error: "num\xE9ro invalide" };
  }
  const channel = !cfg.enabled ? "log" : (o.prefer ?? "whatsapp") === "whatsapp" && cfg.whatsapp ? "whatsapp" : cfg.sms ? "sms" : cfg.whatsapp ? "whatsapp" : "log";
  if (channel === "log") {
    console.warn(`[sms] Twilio non configur\xE9 \u2014 message non envoy\xE9 \xE0 ${to} : ${o.body.slice(0, 80)}\u2026`);
    await log({ ...base, channel, to, ok: true, providerId: "logged" });
    return { ok: true, channel, id: "logged" };
  }
  try {
    const params = new URLSearchParams({ To: channel === "whatsapp" ? `whatsapp:${to}` : to, From: channel === "whatsapp" ? cfg.wa : cfg.smsFrom, Body: o.body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.sid}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${cfg.sid}:${cfg.token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params, signal: AbortSignal.timeout(1e4) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      await log({ ...base, channel, to, ok: false, error: data.message ?? `HTTP ${res.status}` });
      return { ok: false, channel, error: data.message ?? `HTTP ${res.status}` };
    }
    await log({ ...base, channel, to, ok: true, providerId: data.sid });
    return { ok: true, channel, id: data.sid };
  } catch (e) {
    const error = e.message;
    await log({ ...base, channel, to, ok: false, error });
    return { ok: false, channel, error };
  }
}
var waLink;
var init_sms = __esm({
  "apps/api/src/lib/sms.ts"() {
    "use strict";
    init_src();
    waLink = (phone, text2) => {
      const p = normalizePhone(phone);
      return p ? `https://wa.me/${p.slice(1)}?text=${encodeURIComponent(text2)}` : null;
    };
  }
});

// apps/api/src/jobs/reminders.ts
import { and as and9, eq as eq11, isNull as isNull5, lt } from "drizzle-orm";
async function remindPendingVendorOrders(opts = {}) {
  const hours = opts.hours ?? Number(process.env.REMINDER_HOURS ?? 4);
  const now = opts.now ?? /* @__PURE__ */ new Date();
  const db = await getDb();
  const limit = new Date(now.getTime() - hours * 36e5);
  const rows = await db.select({ o: orders, v: vendors, r: restaurants }).from(orders).innerJoin(vendors, eq11(vendors.id, orders.vendorId)).innerJoin(restaurants, eq11(restaurants.id, orders.restaurantId)).where(and9(eq11(orders.status, "envoyee"), isNull5(orders.vendorRemindedAt), lt(orders.sentAt, limit)));
  const out = [];
  for (const { o, v, r } of rows) {
    const text2 = `AFRISUPPLY \u2014 Rappel : la commande ${o.reference} de ${r.name} (${eur4(Number(o.totalEur))}) attend votre r\xE9ponse depuis ${Math.round((now.getTime() - (o.sentAt ?? o.createdAt).getTime()) / 36e5)} h.
Confirmer / refuser : ${APP_URL()}/fournisseur/commandes`;
    const phone = v.whatsapp || v.contactPhone;
    let channel = "none";
    let ok = false;
    if (phone) {
      const res = await sendMessage({ to: phone, prefer: v.whatsapp ? "whatsapp" : "sms", kind: "order.reminder", orderId: o.id, vendorId: v.id, restaurantId: r.id, body: text2 });
      channel = res.channel;
      ok = res.ok;
    }
    if (v.contactEmail) {
      const m = await sendMail({ to: v.contactEmail, subject: `\u23F0 Rappel : commande ${o.reference} de ${r.name} en attente`, text: text2, html: `<p>${text2.replace(/\n/g, "<br>")}</p>`, tags: { type: "order_reminder" } });
      ok = ok || m.ok;
      channel = channel === "none" ? "email" : `${channel}+email`;
    }
    await db.update(orders).set({ vendorRemindedAt: now }).where(eq11(orders.id, o.id));
    out.push({ reference: o.reference, vendor: v.name, channel, ok });
  }
  return { ranAt: now.toISOString(), hours, reminded: out.length, details: out };
}
function maybeRemind() {
  const t = Date.now();
  if (t - lastRun < 15 * 6e4) return;
  lastRun = t;
  void remindPendingVendorOrders().catch((e) => console.warn("[reminders]", e.message));
}
var APP_URL, eur4, lastRun;
var init_reminders = __esm({
  "apps/api/src/jobs/reminders.ts"() {
    "use strict";
    init_src();
    init_mailer();
    init_sms();
    APP_URL = () => process.env.APP_URL ?? "http://localhost:5173";
    eur4 = (v) => `${v.toFixed(2).replace(".", ",")} \u20AC`;
    lastRun = 0;
  }
});

// apps/api/src/lib/digest.ts
function digestHeadline(d) {
  if (d.stock.urgent.length) {
    const f = d.stock.urgent[0];
    return `${d.stock.urgent.length} produit${d.stock.urgent.length > 1 ? "s" : ""} \xE0 commander aujourd\u2019hui \u2014 ${f.productName} en premier`;
  }
  if (d.priceAlerts.length) return `${d.priceAlerts.length} hausse${d.priceAlerts.length > 1 ? "s" : ""} de prix \xE0 regarder`;
  if (d.discrepancies.count) return `${eur5(d.discrepancies.openValue)} \xE0 r\xE9cup\xE9rer sur des livraisons incompl\xE8tes`;
  return "Tout est sous contr\xF4le \u2014 bonne journ\xE9e en cuisine";
}
function buildDigest(d) {
  const dateStr = d.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const headline = digestHeadline(d);
  const subject = `\u2600\uFE0F Votre matin AFRISUPPLY \u2014 ${headline}`;
  const sections = [];
  if (d.stock.urgent.length) sections.push({
    emoji: "\u{1F534}",
    title: "\xC0 commander aujourd\u2019hui",
    lines: d.stock.urgent.slice(0, 6).map((u) => `${u.productName} : ${q(u.quantity, u.unit)} en stock${u.daysLeft !== null ? ` (${days(u.daysLeft)})` : ""}${u.stockoutDay ? `, rupture ${dayFr(u.stockoutDay)}` : ""} \u2192 commander ${q(u.recommendedOrder, u.unit)}`),
    cta: { label: "Ouvrir le panier intelligent", path: "/app/achats/panier" }
  });
  if (d.cart && d.cart.lineCount) sections.push({
    emoji: "\u{1F9FA}",
    title: "Panier de la semaine pr\xEAt",
    lines: [`${d.cart.lineCount} produit${d.cart.lineCount > 1 ? "s" : ""} chez ${d.cart.supplierCount} fournisseur${d.cart.supplierCount > 1 ? "s" : ""} pour ${eur5(d.cart.total)}${d.cart.saving > 0 ? ` \u2014 ${eur5(d.cart.saving)} d\u2019\xE9conomie vs vos habitudes` : ""}.`],
    cta: { label: "Valider le panier", path: "/app/achats/panier" }
  });
  if (d.autoReorder.length) sections.push({
    emoji: "\u{1F916}",
    title: "Commandes pr\xE9par\xE9es automatiquement (\xE0 valider)",
    lines: d.autoReorder.map((a) => `${a.productName} chez ${a.supplierName} \u2014 ${eur5(a.total)} (${a.reference})`),
    cta: { label: "Voir mes achats", path: "/app/achats" }
  });
  if (d.priceAlerts.length) sections.push({ emoji: "\u{1F4C8}", title: "Prix en hausse", lines: d.priceAlerts.slice(0, 5).map((a) => a.message), cta: { label: "Comparer les fournisseurs", path: "/app/stock" } });
  if (d.opportunities.length) sections.push({ emoji: "\u{1F7E2}", title: "Moins cher ailleurs", lines: d.opportunities.slice(0, 4).map((a) => a.message) });
  if (d.discrepancies.count) sections.push({ emoji: "\u26A0\uFE0F", title: "\xC9carts de livraison \xE0 r\xE9clamer", lines: [`${d.discrepancies.count} \xE9cart${d.discrepancies.count > 1 ? "s" : ""} ouvert${d.discrepancies.count > 1 ? "s" : ""} \u2014 ${eur5(d.discrepancies.openValue)} \xE0 r\xE9cup\xE9rer.`], cta: { label: "Voir les \xE9carts", path: "/app/achats/ecarts" } });
  if (d.pendingOrders.length) sections.push({ emoji: "\u{1F69A}", title: "Livraisons attendues", lines: d.pendingOrders.slice(0, 5).map((o) => `${o.supplierName} (${o.reference})${o.expectedAt ? ` \u2014 ${dayFr(o.expectedAt)}` : ""}`) });
  const footerFacts = [
    `Stock : ${d.stock.ok} \u{1F7E2} \xB7 ${d.stock.bas} \u{1F7E0} \xB7 ${d.stock.critique} \u{1F534}`,
    d.salesYesterday === null ? "Ventes d\u2019hier non saisies \u2014 30 secondes pour am\xE9liorer la pr\xE9vision" : `${d.salesYesterday} portions saisies hier`,
    `Achats du mois : ${eur5(d.spend.thisMonth)}${d.spend.evolutionPct !== null ? ` (${d.spend.evolutionPct > 0 ? "+" : ""}${d.spend.evolutionPct} % vs 30 j pr\xE9c\xE9dents)` : ""}`
  ];
  const isEmpty = sections.length === 0;
  const text2 = [
    `Bonjour ${d.firstName},`,
    "",
    `${d.restaurantName} \u2014 ${dateStr}`,
    headline.toUpperCase(),
    "",
    ...sections.flatMap((s) => [`${s.emoji} ${s.title}`, ...s.lines.map((l) => `  \u2022 ${l}`), s.cta ? `  \u2192 ${d.appUrl}${s.cta.path}` : "", ""]),
    ...isEmpty ? ["Rien d\u2019urgent aujourd\u2019hui. Vos stocks couvrent la pr\xE9vision.", ""] : [],
    "\u2014",
    ...footerFacts,
    "",
    `Ouvrir AFRISUPPLY : ${d.appUrl}/app`,
    `Se d\xE9sabonner : ${d.appUrl}/app/parametres`
  ].join("\n");
  const sec = (s) => `
    <tr><td style="padding:18px 24px 0 24px">
      <p style="margin:0 0 8px 0;font:700 15px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c1917">${s.emoji} ${esc(s.title)}</p>
      <ul style="margin:0;padding-left:18px;font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#44403c">${s.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
      ${s.cta ? `<a href="${d.appUrl}${s.cta.path}" style="display:inline-block;margin-top:10px;padding:8px 14px;border-radius:10px;background:#c2410c;color:#fff;text-decoration:none;font:600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif">${esc(s.cta.label)} \u2192</a>` : ""}
    </td></tr>`;
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#fafaf9;padding:24px 0">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;border:1px solid #e7e5e4;overflow:hidden">
    <tr><td style="background:#1c1917;padding:20px 24px">
      <p style="margin:0;font:800 18px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#fff">AFRI<span style="color:#fb923c">SUPPLY</span></p>
      <p style="margin:6px 0 0 0;font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#a8a29e">${esc(d.restaurantName)} \xB7 ${esc(dateStr)}</p>
    </td></tr>
    <tr><td style="padding:22px 24px 0 24px">
      <p style="margin:0;font:14px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#44403c">Bonjour ${esc(d.firstName)},</p>
      <h1 style="margin:8px 0 0 0;font:800 22px/1.25 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c1917">${esc(headline)}</h1>
    </td></tr>
    ${sections.map(sec).join("")}
    ${isEmpty ? `<tr><td style="padding:18px 24px 0 24px;font:14px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#44403c">Rien d\u2019urgent aujourd\u2019hui. Vos stocks couvrent la pr\xE9vision. \u{1F389}</td></tr>` : ""}
    <tr><td style="padding:22px 24px 0 24px"><hr style="border:0;border-top:1px solid #e7e5e4;margin:0"></td></tr>
    <tr><td style="padding:14px 24px 22px 24px;font:12px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#78716c">
      ${footerFacts.map(esc).join("<br>")}<br><br>
      <a href="${d.appUrl}/app" style="color:#c2410c;font-weight:600;text-decoration:none">Ouvrir AFRISUPPLY \u2192</a> \xB7 <a href="${d.appUrl}/app/parametres" style="color:#a8a29e">G\xE9rer mes notifications</a>
    </td></tr>
  </table></td></tr></table></body></html>`;
  return { subject, text: text2, html, isEmpty };
}
var eur5, UNIT_FR, q, days, dayFr, esc;
var init_digest = __esm({
  "apps/api/src/lib/digest.ts"() {
    "use strict";
    eur5 = (v) => `${v.toFixed(2).replace(".", ",")} \u20AC`;
    UNIT_FR = { piece: "pi\xE8ces", botte: "bottes", sac: "sacs", carton: "cartons" };
    q = (v, u) => {
      const isCount = u in UNIT_FR;
      const nb = isCount ? Math.ceil(v) : Math.round(v * 10) / 10;
      return `${Number.isInteger(nb) ? nb : nb.toFixed(1).replace(".", ",")} ${UNIT_FR[u] ?? u}`;
    };
    days = (d) => `${(Math.round(d * 10) / 10).toString().replace(".", ",")} j`;
    dayFr = (iso) => iso ? new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" }) : null;
    esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
});

// apps/api/src/routes/public.ts
import { Hono as Hono5 } from "hono";
import { z as z5 } from "zod";
import { and as and10, desc as desc3, eq as eq12, ilike, isNull as isNull6, sql as sql7 } from "drizzle-orm";
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 36e5);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 5;
}
var publicRoutes, PLANS, FOUNDER_OFFER, leadBody, hits;
var init_public = __esm({
  "apps/api/src/routes/public.ts"() {
    "use strict";
    init_src();
    init_auth();
    publicRoutes = new Hono5();
    PLANS = [
      {
        id: "starter",
        name: "Starter",
        priceMonthly: 39,
        tagline: "Fini le cahier et les ruptures.",
        highlight: false,
        features: ["Stock avec statuts \u{1F7E2}\u{1F7E0}\u{1F534} et jours restants", "Fiches fournisseurs & prix", "Commandes WhatsApp / e-mail", "R\xE9ception & \xE9carts de livraison", "Alertes rupture et hausse de prix", "1 \xE9tablissement \xB7 3 utilisateurs"]
      },
      {
        id: "pro",
        name: "Pro",
        priceMonthly: 89,
        tagline: "L\u2019intelligence qui fait gagner de la marge.",
        highlight: true,
        features: ["Tout Starter", "Pr\xE9vision des besoins 7 jours", "Comparateur multi-fournisseurs", "Panier intelligent & auto-reorder", "Recettes, co\xFBt mati\xE8re et marges", "Assistant \xAB Demander \xE0 l\u2019IA \xBB", "Import CSV illimit\xE9"]
      },
      {
        id: "business",
        name: "Business",
        priceMonthly: 199,
        tagline: "Pour les groupes et les ambitieux.",
        highlight: false,
        features: ["Tout Pro", "Multi-\xE9tablissements & consolidation", "Achats group\xE9s entre restaurants", "Acc\xE8s API & exports comptables", "Accompagnement d\xE9di\xE9", "Utilisateurs illimit\xE9s"]
      }
    ];
    FOUNDER_OFFER = { label: "Offre pilote fondateur", discountPct: 50, seats: 20, trialDays: 30, description: "\u221250 % \xE0 vie pour les 20 premiers restaurants qui nous aident \xE0 construire le produit. Essai gratuit 30 jours, sans carte bancaire." };
    publicRoutes.get("/public/plans", (c) => c.json({ plans: PLANS, founderOffer: FOUNDER_OFFER, marketplaceCommissionPct: "2\u20135" }));
    leadBody = z5.object({
      restaurantName: z5.string().min(2).max(120),
      contactName: z5.string().min(2).max(120),
      email: z5.string().email(),
      phone: z5.string().max(40).optional(),
      city: z5.string().max(80).optional(),
      cuisine: z5.string().max(80).optional(),
      coversPerDay: z5.number().int().positive().max(5e3).optional(),
      message: z5.string().max(2e3).optional(),
      planInterest: z5.enum(["starter", "pro", "business", "pilote"]).optional(),
      source: z5.string().max(40).optional(),
      utm: z5.record(z5.string()).optional(),
      website: z5.string().optional()
      // honeypot anti-spam : doit rester vide (sinon on répond ok sans enregistrer)
    });
    hits = /* @__PURE__ */ new Map();
    publicRoutes.post("/public/leads", async (c) => {
      const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "local";
      if (rateLimited(ip)) return c.json({ error: "Trop de demandes, r\xE9essayez dans une heure." }, 429);
      const body3 = leadBody.safeParse(await c.req.json().catch(() => null));
      if (!body3.success) return c.json({ error: "Formulaire incomplet", details: body3.error.flatten() }, 400);
      if (body3.data.website) return c.json({ ok: true });
      const db = await getDb();
      const d = body3.data;
      const [lead] = await db.insert(leads).values({ ...d, source: d.source ?? "site" }).returning({ id: leads.id });
      return c.json({ ok: true, id: lead.id, message: `Merci ${d.contactName.split(" ")[0]} ! On vous rappelle sous 24 h pour ouvrir votre acc\xE8s.` }, 201);
    });
    publicRoutes.get("/admin/leads", requireAuth, async (c) => {
      const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (!admins.includes(c.get("user").email.toLowerCase())) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
      const db = await getDb();
      const rows = await db.select().from(leads).orderBy(desc3(leads.createdAt)).limit(500);
      const [{ total }] = await db.select({ total: sql7`count(*)` }).from(leads);
      return c.json({ leads: rows, total: Number(total) });
    });
    publicRoutes.put("/admin/leads/:id", requireAuth, async (c) => {
      const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (!admins.includes(c.get("user").email.toLowerCase())) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
      const body3 = z5.object({ status: z5.enum(["nouveau", "contacte", "demo", "pilote", "client", "perdu"]).optional(), notes: z5.string().nullable().optional() }).safeParse(await c.req.json());
      if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
      const db = await getDb();
      const [row] = await db.update(leads).set(body3.data).where(eq12(leads.id, c.req.param("id") ?? "")).returning();
      if (!row) return c.json({ error: "Lead introuvable" }, 404);
      return c.json(row);
    });
    publicRoutes.get("/public/reference", async (c) => {
      const q2 = (c.req.query("q") ?? "").trim();
      if (q2.length < 2) return c.json({ products: [] });
      const db = await getDb();
      const rows = await db.select({ id: products.id, name: products.name, category: products.category, baseUnit: products.baseUnit }).from(products).where(and10(isNull6(products.restaurantId), ilike(products.name, `%${q2}%`))).orderBy(products.name).limit(20);
      return c.json({ products: rows });
    });
  }
});

// apps/api/src/routes/billing.ts
import { Hono as Hono6 } from "hono";
import { z as z6 } from "zod";
import { and as and11, eq as eq13, sql as sql8, desc as desc4 } from "drizzle-orm";
async function invoiceCommissions(period, opts = {}) {
  const db = await getDb();
  const rows = await db.select({ vendorId: commissions.vendorId, orders: sql8`count(*)`, base: sql8`sum(${commissions.orderTotalEur})`, amount: sql8`sum(${commissions.amountEur})` }).from(commissions).where(and11(eq13(commissions.period, period), eq13(commissions.invoiced, false))).groupBy(commissions.vendorId);
  const out = [];
  for (const r of rows) {
    const amount = Number(r.amount);
    const [v] = await db.select().from(vendors).where(eq13(vendors.id, r.vendorId));
    if (!v || amount < 1) {
      out.push({ vendorId: r.vendorId, vendorName: v?.name ?? "?", orders: Number(r.orders), base: Number(r.base), amount, via: "skip" });
      continue;
    }
    if (opts.dryRun) {
      out.push({ vendorId: v.id, vendorName: v.name, orders: Number(r.orders), base: Number(r.base), amount, via: v.stripeCustomerId && stripeConfigured() ? "stripe" : "mail" });
      continue;
    }
    const [existing] = await db.select().from(commissionInvoices).where(and11(eq13(commissionInvoices.vendorId, v.id), eq13(commissionInvoices.period, period)));
    if (existing) continue;
    let stripeInvoiceId;
    let via = "mail";
    if (v.stripeCustomerId && stripeConfigured()) {
      try {
        await stripe("POST", "/invoiceitems", { customer: v.stripeCustomerId, amount: Math.round(amount * 100), currency: "eur", description: `Commission AFRISUPPLY ${period} \u2014 ${r.orders} commande(s), base ${eur6(Number(r.base))}` }, { idempotencyKey: `ci-${v.id}-${period}` });
        const inv = await stripe("POST", "/invoices", { customer: v.stripeCustomerId, collection_method: "send_invoice", days_until_due: 15, auto_advance: true, metadata: { vendorId: v.id, period } }, { idempotencyKey: `inv-${v.id}-${period}` });
        await stripe("POST", `/invoices/${inv.id}/finalize`);
        await stripe("POST", `/invoices/${inv.id}/send`);
        stripeInvoiceId = inv.id;
        via = "stripe";
      } catch (e) {
        console.error("[commissions] stripe", e);
      }
    }
    if (via === "mail") {
      const [m] = await db.select({ email: users.email }).from(vendorMembers).innerJoin(users, eq13(users.id, vendorMembers.userId)).where(eq13(vendorMembers.vendorId, v.id)).limit(1);
      const to = v.contactEmail ?? m?.email;
      if (to) await sendMail({ to, subject: `AFRISUPPLY \u2014 relev\xE9 de commission ${period} : ${eur6(amount)}`, text: `Bonjour,

Relev\xE9 de commission ${period} pour ${v.name} :
- ${r.orders} commande(s) confirm\xE9e(s), base ${eur6(Number(r.base))}
- Commission ${Number(v.commissionPct)} % : ${eur6(amount)}

R\xE8glement sous 15 jours par virement (RIB dans votre espace) \u2014 ou activez le pr\xE9l\xE8vement automatique dans votre espace fournisseur.

Merci de votre confiance,
L'\xE9quipe AFRISUPPLY`, html: `<p>Bonjour,</p><p>Relev\xE9 de commission <b>${period}</b> pour <b>${v.name}</b> :</p><ul><li>${r.orders} commande(s) confirm\xE9e(s), base ${eur6(Number(r.base))}</li><li>Commission ${Number(v.commissionPct)} % : <b>${eur6(amount)}</b></li></ul><p>R\xE8glement sous 15 jours par virement \u2014 ou activez le pr\xE9l\xE8vement automatique dans votre espace fournisseur.</p><p>L'\xE9quipe AFRISUPPLY</p>`, tags: { type: "commission" } });
    }
    await db.insert(commissionInvoices).values({ vendorId: v.id, period, orders: Number(r.orders), baseEur: Number(r.base).toFixed(2), amountEur: amount.toFixed(2), stripeInvoiceId, status: via === "stripe" ? "emise" : "envoyee_par_mail" });
    await db.update(commissions).set({ invoiced: true }).where(and11(eq13(commissions.vendorId, v.id), eq13(commissions.period, period)));
    out.push({ vendorId: v.id, vendorName: v.name, orders: Number(r.orders), base: Number(r.base), amount, via, stripeInvoiceId });
  }
  return { period, invoices: out, dryRun: !!opts.dryRun };
}
var isAdmin, eur6, billingPublicRoutes, billingRoutes, billingAdminRoutes;
var init_billing2 = __esm({
  "apps/api/src/routes/billing.ts"() {
    "use strict";
    init_src();
    init_auth();
    init_public();
    init_billing();
    init_mailer();
    init_ops();
    isAdmin = (email) => (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
    eur6 = (v) => `${v.toFixed(2).replace(".", ",")} \u20AC`;
    billingPublicRoutes = new Hono6();
    billingPublicRoutes.post("/billing/webhook", async (c) => {
      const raw = await c.req.text();
      if (!verifyStripeSignature(raw, c.req.header("stripe-signature"))) return c.json({ error: "Signature invalide" }, 400);
      const evt = JSON.parse(raw);
      const db = await getDb();
      const [seen] = await db.select({ id: billingEvents.id }).from(billingEvents).where(eq13(billingEvents.id, evt.id));
      if (seen) return c.json({ received: true, duplicate: true });
      let rid;
      try {
        const o = evt.data.object;
        if (evt.type === "checkout.session.completed" && o.mode === "subscription" && typeof o.subscription === "string") {
          const sub = await stripe("GET", `/subscriptions/${o.subscription}`);
          rid = (await applySubscription(sub)).rid;
        } else if (evt.type.startsWith("customer.subscription.")) {
          rid = (await applySubscription(o)).rid;
        } else if (evt.type === "invoice.payment_failed" && typeof o.customer === "string") {
          await db.update(restaurants).set({ subscriptionStatus: "past_due" }).where(eq13(restaurants.stripeCustomerId, o.customer));
        } else if (evt.type === "invoice.paid" && typeof o.customer === "string" && o.subscription) {
          await db.update(restaurants).set({ subscriptionStatus: "active" }).where(eq13(restaurants.stripeCustomerId, o.customer));
          const [ci] = await db.select().from(commissionInvoices).where(eq13(commissionInvoices.stripeInvoiceId, String(o.id)));
          if (ci) await db.update(commissionInvoices).set({ status: "payee" }).where(eq13(commissionInvoices.id, ci.id));
        } else if (evt.type === "invoice.paid" && typeof o.id === "string") {
          await db.update(commissionInvoices).set({ status: "payee" }).where(eq13(commissionInvoices.stripeInvoiceId, o.id));
        }
        await db.insert(billingEvents).values({ id: evt.id, type: evt.type, restaurantId: rid ?? null, payload: { object: o.id } });
        return c.json({ received: true });
      } catch (e) {
        console.error("[stripe webhook]", e);
        return c.json({ error: "Traitement \xE9chou\xE9" }, 500);
      }
    });
    billingRoutes = new Hono6();
    billingRoutes.on(["POST"], "/billing/checkout", requireMinRole("owner"));
    billingRoutes.on(["POST"], "/billing/portal", requireMinRole("owner"));
    billingRoutes.on(["POST"], "/billing/sync", requireMinRole("owner"));
    billingRoutes.use("*", requireAuth, requireRestaurant);
    billingRoutes.get("/billing", async (c) => {
      const db = await getDb();
      const [r] = await db.select().from(restaurants).where(eq13(restaurants.id, c.get("restaurantId")));
      const s = accessState(r);
      return c.json({
        plan: r.plan,
        founder: r.founder,
        subscriptionStatus: r.subscriptionStatus,
        trialEndsAt: r.trialEndsAt,
        currentPeriodEnd: r.currentPeriodEnd,
        ...s,
        enforced: billingEnforced(),
        stripe: stripeConfigured(),
        hasSubscription: !!r.stripeSubscriptionId,
        plans: PLANS.map((p) => ({ ...p, priceMonthly: p.priceMonthly, founderPrice: Math.round(p.priceMonthly * (1 - FOUNDER_OFFER.discountPct / 100)), available: !!priceIdFor(p.id) })),
        founderOffer: FOUNDER_OFFER
      });
    });
    billingRoutes.post("/billing/checkout", async (c) => {
      const { plan: plan2 } = z6.object({ plan: z6.enum(["starter", "pro", "business"]) }).parse(await c.req.json());
      if (!stripeConfigured()) return c.json({ error: "Paiement en ligne bient\xF4t disponible \u2014 \xE9crivez-nous \xE0 bonjour@afrisupply.fr pour activer votre formule." }, 503);
      try {
        const s = await createCheckout(c.get("restaurantId"), c.get("user").email, plan2);
        await audit("billing.checkout", { actorEmail: c.get("user").email, target: c.get("restaurantId"), meta: { plan: plan2 } });
        return c.json({ url: s.url });
      } catch (e) {
        return c.json({ error: e.message }, 502);
      }
    });
    billingRoutes.post("/billing/portal", async (c) => {
      if (!stripeConfigured()) return c.json({ error: "Portail de facturation indisponible" }, 503);
      try {
        return c.json({ url: (await createPortal(c.get("restaurantId"), c.get("user").email)).url });
      } catch (e) {
        return c.json({ error: e.message }, 502);
      }
    });
    billingRoutes.post("/billing/sync", async (c) => {
      const { sessionId } = z6.object({ sessionId: z6.string().optional() }).parse(await c.req.json().catch(() => ({})));
      const db = await getDb();
      const [r] = await db.select().from(restaurants).where(eq13(restaurants.id, c.get("restaurantId")));
      if (!stripeConfigured()) return c.json({ synced: false });
      let subId = r.stripeSubscriptionId;
      if (sessionId) {
        const s = await stripe("GET", `/checkout/sessions/${sessionId}`);
        if (s.metadata?.restaurantId === r.id && s.subscription) subId = s.subscription;
      }
      if (!subId) return c.json({ synced: false });
      const res = await applySubscription(await stripe("GET", `/subscriptions/${subId}`));
      return c.json({ synced: true, ...res });
    });
    billingAdminRoutes = new Hono6();
    billingAdminRoutes.use("/admin/billing/*", requireAuth);
    billingAdminRoutes.use("/admin/billing", requireAuth);
    billingAdminRoutes.get("/admin/billing", async (c) => {
      if (!isAdmin(c.get("user").email)) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
      const db = await getDb();
      const rows = await db.select({ id: restaurants.id, name: restaurants.name, city: restaurants.city, plan: restaurants.plan, founder: restaurants.founder, subscriptionStatus: restaurants.subscriptionStatus, trialEndsAt: restaurants.trialEndsAt, currentPeriodEnd: restaurants.currentPeriodEnd, createdAt: restaurants.createdAt }).from(restaurants).orderBy(desc4(restaurants.createdAt));
      const founders = rows.filter((r) => r.founder).length;
      const mrr = rows.filter((r) => r.subscriptionStatus === "active").reduce((a, r) => a + ({ starter: 39, pro: 89, business: 199 }[r.plan] ?? 0) * (r.founder ? 0.5 : 1), 0);
      const invoices = await db.select().from(commissionInvoices).orderBy(desc4(commissionInvoices.createdAt)).limit(50);
      return c.json({ restaurants: rows.map((r) => ({ ...r, ...accessState(r) })), founders, founderSeatsLeft: Math.max(0, FOUNDER_OFFER.seats - founders), mrr, invoices, stripe: stripeConfigured(), enforced: billingEnforced() });
    });
    billingAdminRoutes.put("/admin/billing/restaurants/:id", async (c) => {
      if (!isAdmin(c.get("user").email)) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
      const b = z6.object({ founder: z6.boolean().optional(), extendTrialDays: z6.number().int().min(1).max(180).optional(), plan: z6.enum(["trial", "starter", "pro", "business"]).optional(), subscriptionStatus: z6.enum(["trialing", "active", "past_due", "canceled", "expired"]).optional() }).parse(await c.req.json());
      const db = await getDb();
      const [r] = await db.select().from(restaurants).where(eq13(restaurants.id, c.req.param("id")));
      if (!r) return c.json({ error: "Restaurant introuvable" }, 404);
      const patch = {};
      if (b.founder !== void 0) patch.founder = b.founder;
      if (b.plan) patch.plan = b.plan;
      if (b.subscriptionStatus) patch.subscriptionStatus = b.subscriptionStatus;
      if (b.extendTrialDays) {
        const base = r.trialEndsAt && r.trialEndsAt > /* @__PURE__ */ new Date() ? r.trialEndsAt : /* @__PURE__ */ new Date();
        patch.trialEndsAt = new Date(base.getTime() + b.extendTrialDays * 864e5);
        if (r.subscriptionStatus === "expired") patch.subscriptionStatus = "trialing";
      }
      const [upd] = await db.update(restaurants).set(patch).where(eq13(restaurants.id, r.id)).returning();
      await audit("billing.admin.update", { actorEmail: c.get("user").email, target: r.id, meta: b });
      return c.json({ restaurant: upd });
    });
    billingAdminRoutes.post("/admin/billing/commissions/invoice", async (c) => {
      if (!isAdmin(c.get("user").email)) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
      const b = z6.object({ period: z6.string().regex(/^\d{4}-\d{2}$/).optional(), dryRun: z6.boolean().optional() }).parse(await c.req.json().catch(() => ({})));
      const prev = /* @__PURE__ */ new Date();
      prev.setUTCDate(0);
      const res = await invoiceCommissions(b.period ?? prev.toISOString().slice(0, 7), { dryRun: b.dryRun });
      await audit("billing.commissions.invoice", { actorEmail: c.get("user").email, meta: { period: res.period, count: res.invoices.length, dryRun: !!b.dryRun } });
      return c.json(res);
    });
  }
});

// apps/api/src/routes/pilots.ts
import { Hono as Hono7 } from "hono";
import { z as z7 } from "zod";
import { and as and12, desc as desc5, eq as eq14, gte as gte3, sql as sql9 } from "drizzle-orm";
function makeInviteCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return `PILOTE-${s}`;
}
async function activityCounts(rid) {
  const db = await getDb();
  const one = async (q2) => n4((await q2)[0]?.c);
  const [recipesC, invC, supC, offC, salesC, ordersC, delivC, movC, alertsUnread] = await Promise.all([
    one(db.select({ c: sql9`count(*)` }).from(recipes).where(eq14(recipes.restaurantId, rid))),
    one(db.select({ c: sql9`count(*)` }).from(inventoryItems).where(and12(eq14(inventoryItems.restaurantId, rid), sql9`${inventoryItems.quantity} > 0`))),
    one(db.select({ c: sql9`count(*)` }).from(suppliers).where(eq14(suppliers.restaurantId, rid))),
    one(db.select({ c: sql9`count(*)` }).from(supplierOffers).innerJoin(suppliers, eq14(suppliers.id, supplierOffers.supplierId)).where(eq14(suppliers.restaurantId, rid))),
    one(db.select({ c: sql9`count(*)` }).from(sales).where(eq14(sales.restaurantId, rid))),
    one(db.select({ c: sql9`count(*)` }).from(orders).where(and12(eq14(orders.restaurantId, rid), sql9`${orders.status} <> 'brouillon'`))),
    one(db.select({ c: sql9`count(*)` }).from(deliveries).where(eq14(deliveries.restaurantId, rid))),
    one(db.select({ c: sql9`count(*)` }).from(stockMovements).where(eq14(stockMovements.restaurantId, rid))),
    one(db.select({ c: sql9`count(*)` }).from(alerts).where(and12(eq14(alerts.restaurantId, rid), eq14(alerts.isRead, false))))
  ]);
  return { recipes: recipesC, inventory: invC, supplier: supC, offers: offC, sales: salesC, order: ordersC, delivery: delivC, movements: movC, alertsUnread };
}
function stepsFor(counts, manual) {
  return ONBOARDING_STEPS.map((s) => {
    const auto = s.auto === "recipes" ? counts.recipes > 0 : s.auto === "inventory" ? counts.inventory > 0 : s.auto === "supplier" ? counts.supplier > 0 && counts.offers > 0 : s.auto === "sales" ? counts.sales > 0 : s.auto === "order" ? counts.order > 0 : s.auto === "delivery" ? counts.delivery > 0 : false;
    return { id: s.id, label: s.label, hint: s.hint, to: s.to, done: auto || manual.includes(s.id) };
  });
}
async function pilotHealth(rid, now = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  const [r] = await db.select().from(restaurants).where(eq14(restaurants.id, rid));
  const counts = await activityCounts(rid);
  const steps = stepsFor(counts, r.onboardingDone ?? []);
  const since7 = new Date(now.getTime() - 7 * 864e5);
  const [{ c: events7 }] = await db.select({ c: sql9`count(*)` }).from(usageEvents).where(and12(eq14(usageEvents.restaurantId, rid), gte3(usageEvents.at, since7)));
  const [{ c: sales7 }] = await db.select({ c: sql9`count(*)` }).from(sales).where(and12(eq14(sales.restaurantId, rid), gte3(sales.day, since7.toISOString().slice(0, 10))));
  const [{ c: mov7 }] = await db.select({ c: sql9`count(*)` }).from(stockMovements).where(and12(eq14(stockMovements.restaurantId, rid), gte3(stockMovements.createdAt, since7)));
  const [{ c: orders7 }] = await db.select({ c: sql9`count(*)` }).from(orders).where(and12(eq14(orders.restaurantId, rid), gte3(orders.createdAt, since7), sql9`${orders.status} <> 'brouillon'`));
  const members = await db.select({ email: users.email, fullName: users.fullName, lastLoginAt: users.lastLoginAt, role: restaurantMembers.role }).from(restaurantMembers).innerJoin(users, eq14(users.id, restaurantMembers.userId)).where(eq14(restaurantMembers.restaurantId, rid));
  const lastLogin = members.map((m) => m.lastLoginAt?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0);
  const daysSinceLogin = lastLogin ? Math.floor((now.getTime() - lastLogin) / 864e5) : null;
  const [nps] = await db.select({ score: feedback.score, at: feedback.createdAt }).from(feedback).where(and12(eq14(feedback.restaurantId, rid), eq14(feedback.kind, "nps"))).orderBy(desc5(feedback.createdAt)).limit(1);
  const [{ c: openFeedback }] = await db.select({ c: sql9`count(*)` }).from(feedback).where(and12(eq14(feedback.restaurantId, rid), eq14(feedback.status, "nouveau"), sql9`${feedback.kind} <> 'nps'`));
  const dayNumber = Math.floor((now.getTime() - r.createdAt.getTime()) / 864e5) + 1;
  const doneSteps = steps.filter((s) => s.done).length;
  const active7 = n4(sales7) + n4(mov7) + n4(orders7) > 0 || n4(events7) >= 5;
  let status = "vert";
  const reasons = [];
  if (daysSinceLogin === null ? dayNumber > 3 : daysSinceLogin >= 7) {
    status = "rouge";
    reasons.push(daysSinceLogin === null ? "jamais connect\xE9" : `pas connect\xE9 depuis ${daysSinceLogin} j`);
  } else if (daysSinceLogin !== null && daysSinceLogin >= 3) {
    status = "orange";
    reasons.push(`pas connect\xE9 depuis ${daysSinceLogin} j`);
  } else if (!active7 && dayNumber > 3) {
    status = "orange";
    reasons.push("connect\xE9 mais sans saisie cette semaine");
  }
  if (dayNumber >= 7 && doneSteps < 3) {
    status = status === "rouge" ? "rouge" : "orange";
    reasons.push(`checklist ${doneSteps}/${steps.length} apr\xE8s ${dayNumber} j`);
  }
  if (nps && (nps.score ?? 10) <= 6) {
    status = "rouge";
    reasons.push(`NPS ${nps.score}/10`);
  }
  if (n4(openFeedback) > 0) reasons.push(`${n4(openFeedback)} retour(s) sans r\xE9ponse`);
  return { id: r.id, name: r.name, city: r.city, founder: r.founder, plan: r.plan, subscriptionStatus: r.subscriptionStatus, trialEndsAt: r.trialEndsAt, createdAt: r.createdAt, dayNumber, status, reasons, checklist: { done: doneSteps, total: steps.length }, counts, week: { events: n4(events7), sales: n4(sales7), movements: n4(mov7), orders: n4(orders7) }, daysSinceLogin, nps: nps ? { score: nps.score, at: nps.at } : null, openFeedback: n4(openFeedback), members: members.map((m) => ({ email: m.email, fullName: m.fullName, role: m.role, lastLoginAt: m.lastLoginAt })) };
}
async function buildWeeklyPilotReport(now = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  const all = await db.select({ id: restaurants.id }).from(restaurants);
  const pilots = [];
  for (const r of all) pilots.push(await pilotHealth(r.id, now));
  const since7 = new Date(now.getTime() - 7 * 864e5);
  const newFb = await db.select({ f: feedback, restaurantName: restaurants.name }).from(feedback).innerJoin(restaurants, eq14(restaurants.id, feedback.restaurantId)).where(gte3(feedback.createdAt, since7)).orderBy(desc5(feedback.createdAt));
  const line = (p) => `${p.status === "vert" ? "\u{1F7E2}" : p.status === "orange" ? "\u{1F7E0}" : "\u{1F534}"} ${p.name} (J${p.dayNumber}, checklist ${p.checklist.done}/${p.checklist.total}, ${p.week.sales} ventes \xB7 ${p.week.movements} mvts \xB7 ${p.week.orders} cmd)${p.reasons.length ? " \u2014 " + p.reasons.join(", ") : ""}`;
  const text2 = [`Rapport pilotes \u2014 semaine du ${now.toLocaleDateString("fr-FR")}`, "", `${pilots.length} restaurants \xB7 ${pilots.filter((p) => p.status === "vert").length} \u{1F7E2} \xB7 ${pilots.filter((p) => p.status === "orange").length} \u{1F7E0} \xB7 ${pilots.filter((p) => p.status === "rouge").length} \u{1F534}`, `Actifs cette semaine : ${pilots.filter((p) => p.week.sales + p.week.movements + p.week.orders > 0).length}`, "", ...pilots.sort((a, b) => ["rouge", "orange", "vert"].indexOf(a.status) - ["rouge", "orange", "vert"].indexOf(b.status)).map(line), "", `Retours de la semaine (${newFb.length}) :`, ...newFb.map(({ f, restaurantName }) => `- [${f.kind}${f.score !== null ? ` ${f.score}/10` : ""}] ${restaurantName} : ${f.message ?? ""}`), "", `${APP2()}/app/admin/pilotes`].join("\n");
  return { text: text2, html: `<pre style="font-family:ui-sans-serif,system-ui;white-space:pre-wrap">${text2.replace(/</g, "&lt;")}</pre>`, pilots: pilots.length };
}
var isAdmin2, APP2, n4, ONBOARDING_STEPS, pilotPublicRoutes, pilotRoutes, pilotAdminRoutes;
var init_pilots = __esm({
  "apps/api/src/routes/pilots.ts"() {
    "use strict";
    init_src();
    init_auth();
    init_mailer();
    init_ops();
    init_public();
    isAdmin2 = (email) => (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
    APP2 = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    n4 = (v) => Number(v ?? 0);
    ONBOARDING_STEPS = [
      { id: "carte", label: "Configurer ma carte (recettes)", hint: "Choisissez vos plats : le stock \xE0 suivre se d\xE9duit tout seul.", to: "/app/demarrer", auto: "recipes" },
      { id: "inventaire", label: "Faire mon premier inventaire", hint: "10 minutes en saisie express, ou produit par produit.", to: "/app/express", auto: "inventory" },
      { id: "fournisseur", label: "Ajouter mon fournisseur principal et ses prix", hint: "M\xEAme 5 produits suffisent pour voir le comparateur travailler.", to: "/app/fournisseurs", auto: "supplier" },
      { id: "ventes", label: "Saisir les ventes d\u2019une journ\xE9e", hint: "\xAB vendu 40 maf\xE9 25 yassa \xBB \u2014 la pr\xE9vision d\xE9marre.", to: "/app/express", auto: "sales" },
      { id: "commande", label: "Envoyer une commande depuis l\u2019app", hint: "Panier intelligent \u2192 WhatsApp ou e-mail au fournisseur.", to: "/app/achats/panier", auto: "order" },
      { id: "reception", label: "R\xE9ceptionner une livraison", hint: "Cochez les \xE9carts : le stock et les prix se mettent \xE0 jour.", to: "/app/achats", auto: "delivery" },
      { id: "app", label: "Installer l\u2019app sur mon t\xE9l\xE9phone", hint: "Depuis le navigateur : \xAB Ajouter \xE0 l\u2019\xE9cran d\u2019accueil \xBB.", to: "/app/express", auto: null }
    ];
    pilotPublicRoutes = new Hono7();
    pilotPublicRoutes.get("/public/invite/:code", async (c) => {
      const code = c.req.param("code").toUpperCase().trim();
      const db = await getDb();
      const [lead] = await db.select().from(leads).where(eq14(leads.inviteCode, code));
      if (!lead) return c.json({ valid: false }, 404);
      if (lead.restaurantId) return c.json({ valid: false, used: true }, 410);
      return c.json({ valid: true, restaurantName: lead.restaurantName, contactName: lead.contactName, email: lead.email, city: lead.city, coversPerDay: lead.coversPerDay, offer: FOUNDER_OFFER });
    });
    pilotRoutes = new Hono7();
    pilotRoutes.use("*", requireAuth, requireRestaurant);
    pilotRoutes.get("/onboarding/checklist", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const [r] = await db.select({ onboardingDone: restaurants.onboardingDone, founder: restaurants.founder, createdAt: restaurants.createdAt }).from(restaurants).where(eq14(restaurants.id, rid));
      const steps = stepsFor(await activityCounts(rid), r.onboardingDone ?? []);
      const done = steps.filter((s) => s.done).length;
      const dayNumber = Math.floor((Date.now() - r.createdAt.getTime()) / 864e5) + 1;
      return c.json({ steps, done, total: steps.length, pct: Math.round(done / steps.length * 100), dayNumber, founder: r.founder, dismissed: (r.onboardingDone ?? []).includes("_dismissed") });
    });
    pilotRoutes.post("/onboarding/checklist/:step", async (c) => {
      const rid = c.get("restaurantId");
      const step = c.req.param("step");
      const db = await getDb();
      if (![...ONBOARDING_STEPS.map((s) => s.id), "_dismissed"].includes(step)) return c.json({ error: "\xC9tape inconnue" }, 400);
      const [r] = await db.select({ onboardingDone: restaurants.onboardingDone }).from(restaurants).where(eq14(restaurants.id, rid));
      const set = new Set(r.onboardingDone ?? []);
      set.add(step);
      await db.update(restaurants).set({ onboardingDone: [...set] }).where(eq14(restaurants.id, rid));
      return c.json({ ok: true });
    });
    pilotRoutes.post("/feedback", async (c) => {
      const b = z7.object({ kind: z7.enum(["nps", "bug", "idee", "question"]), score: z7.number().int().min(0).max(10).optional(), message: z7.string().max(2e3).optional(), page: z7.string().max(200).optional() }).parse(await c.req.json());
      if (b.kind !== "nps" && !b.message?.trim()) return c.json({ error: "Dites-nous en un mot ce qui se passe \u{1F642}" }, 400);
      const db = await getDb();
      const rid = c.get("restaurantId");
      const u = c.get("user");
      const [row] = await db.insert(feedback).values({ restaurantId: rid, userId: u.id, kind: b.kind, score: b.score, message: b.message?.trim() || null, page: b.page }).returning();
      const [r] = await db.select({ name: restaurants.name }).from(restaurants).where(eq14(restaurants.id, rid));
      const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (admins.length && (b.kind === "bug" || b.kind === "nps" && (b.score ?? 10) <= 6 || b.kind === "question")) {
        const subject = b.kind === "bug" ? `\u{1F41B} Bug signal\xE9 par ${r.name}` : b.kind === "question" ? `\u2753 Question de ${r.name}` : `\u26A0\uFE0F NPS ${b.score}/10 \u2014 ${r.name}`;
        for (const to of admins) void sendMail({ to, subject, text: `${r.name} (${u.email}) \u2014 page ${b.page ?? "?"}

${b.message ?? "(sans message)"}

${APP2()}/app/admin/pilotes`, html: `<p><b>${r.name}</b> (${u.email}) \u2014 page ${b.page ?? "?"}</p><p>${(b.message ?? "(sans message)").replace(/\n/g, "<br>")}</p><p><a href="${APP2()}/app/admin/pilotes">Cockpit pilotes</a></p>`, tags: { type: "feedback" } });
      }
      return c.json({ feedback: row, message: b.kind === "nps" ? "Merci ! Votre avis compte vraiment." : "Bien re\xE7u \u2014 on vous r\xE9pond sous 24 h ouvr\xE9es." }, 201);
    });
    pilotRoutes.get("/feedback/nps-due", async (c) => {
      const db = await getDb();
      const rid = c.get("restaurantId");
      const [r] = await db.select({ createdAt: restaurants.createdAt }).from(restaurants).where(eq14(restaurants.id, rid));
      const day = Math.floor((Date.now() - r.createdAt.getTime()) / 864e5);
      const window = day >= 45 ? 45 : day >= 14 ? 14 : 0;
      if (!window) return c.json({ due: false });
      const since = new Date(r.createdAt.getTime() + (window - 1) * 864e5);
      const [last] = await db.select({ id: feedback.id }).from(feedback).where(and12(eq14(feedback.restaurantId, rid), eq14(feedback.kind, "nps"), gte3(feedback.createdAt, since))).limit(1);
      return c.json({ due: !last, window });
    });
    pilotRoutes.post("/usage", async (c) => {
      const b = z7.object({ events: z7.array(z7.object({ event: z7.string().max(80), meta: z7.record(z7.unknown()).optional(), at: z7.string().optional() })).max(50) }).parse(await c.req.json());
      if (!b.events.length) return c.json({ ok: true });
      const db = await getDb();
      const rid = c.get("restaurantId");
      const uid = c.get("user").id;
      await db.insert(usageEvents).values(b.events.map((e) => ({ restaurantId: rid, userId: uid, event: e.event, meta: e.meta, at: e.at ? new Date(e.at) : /* @__PURE__ */ new Date() })));
      return c.json({ ok: true });
    });
    pilotAdminRoutes = new Hono7();
    pilotAdminRoutes.use("/admin/pilots/*", requireAuth);
    pilotAdminRoutes.use("/admin/pilots", requireAuth);
    pilotAdminRoutes.get("/admin/pilots", async (c) => {
      if (!isAdmin2(c.get("user").email)) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
      const db = await getDb();
      const all = await db.select({ id: restaurants.id }).from(restaurants).orderBy(desc5(restaurants.createdAt)).limit(200);
      const pilots = [];
      for (const r of all) pilots.push(await pilotHealth(r.id));
      const fb = await db.select({ f: feedback, restaurantName: restaurants.name }).from(feedback).innerJoin(restaurants, eq14(restaurants.id, feedback.restaurantId)).orderBy(desc5(feedback.createdAt)).limit(100);
      const npsScores = pilots.map((p) => p.nps?.score).filter((s) => typeof s === "number");
      const npsValue = npsScores.length ? Math.round((npsScores.filter((s) => s >= 9).length - npsScores.filter((s) => s <= 6).length) / npsScores.length * 100) : null;
      const invited = await db.select({ id: leads.id, restaurantName: leads.restaurantName, contactName: leads.contactName, email: leads.email, inviteCode: leads.inviteCode, invitedAt: leads.invitedAt, restaurantId: leads.restaurantId, status: leads.status }).from(leads).where(sql9`${leads.inviteCode} is not null`).orderBy(desc5(leads.invitedAt));
      return c.json({ pilots, feedback: fb.map(({ f, restaurantName }) => ({ ...f, restaurantName })), summary: { total: pilots.length, vert: pilots.filter((p) => p.status === "vert").length, orange: pilots.filter((p) => p.status === "orange").length, rouge: pilots.filter((p) => p.status === "rouge").length, activeThisWeek: pilots.filter((p) => p.week.sales + p.week.movements + p.week.orders > 0).length, nps: npsValue, npsResponses: npsScores.length, founders: pilots.filter((p) => p.founder).length, founderSeatsLeft: Math.max(0, FOUNDER_OFFER.seats - pilots.filter((p) => p.founder).length) }, invited, steps: ONBOARDING_STEPS });
    });
    pilotAdminRoutes.post("/admin/pilots/invite", async (c) => {
      if (!isAdmin2(c.get("user").email)) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
      const b = z7.object({ leadId: z7.string().uuid().optional(), email: z7.string().email().optional(), restaurantName: z7.string().min(2).optional(), contactName: z7.string().min(2).optional(), city: z7.string().optional(), resend: z7.boolean().optional() }).parse(await c.req.json());
      const db = await getDb();
      let lead = b.leadId ? (await db.select().from(leads).where(eq14(leads.id, b.leadId)))[0] : void 0;
      if (!lead) {
        if (!b.email || !b.restaurantName || !b.contactName) return c.json({ error: "E-mail, restaurant et contact requis" }, 400);
        [lead] = await db.insert(leads).values({ email: b.email.toLowerCase(), restaurantName: b.restaurantName, contactName: b.contactName, city: b.city, source: "invitation", planInterest: "pilote", status: "pilote" }).returning();
      }
      if (lead.restaurantId) return c.json({ error: "Ce lead a d\xE9j\xE0 un compte" }, 409);
      const code = lead.inviteCode && b.resend ? lead.inviteCode : makeInviteCode();
      await db.update(leads).set({ inviteCode: code, invitedAt: /* @__PURE__ */ new Date(), status: "pilote" }).where(eq14(leads.id, lead.id));
      const link = `${APP2()}/inscription?code=${code}`;
      const first = lead.contactName.split(" ")[0];
      const mail = await sendMail({
        to: lead.email,
        subject: `${first}, votre acc\xE8s pilote AFRISUPPLY est pr\xEAt \u{1F381}`,
        tags: { type: "invite" },
        text: `Bonjour ${first},

Bienvenue parmi les ${FOUNDER_OFFER.seats} restaurants pilotes fondateurs d'AFRISUPPLY !

Votre code : ${code}
Cr\xE9ez votre compte ici (2 minutes) : ${link}

Ce que \xE7a vous donne :
- ${FOUNDER_OFFER.trialDays} jours gratuits, sans carte bancaire
- puis \u2212${FOUNDER_OFFER.discountPct} % \xE0 vie sur la formule de votre choix
- une ligne directe avec l'\xE9quipe (on r\xE9pond sous 24 h)

En \xE9change : vous utilisez l'app au quotidien et vous nous dites franchement ce qui coince.

\xC0 tr\xE8s vite,
L'\xE9quipe AFRISUPPLY`,
        html: `<p>Bonjour ${first},</p><p>Bienvenue parmi les <b>${FOUNDER_OFFER.seats} restaurants pilotes fondateurs</b> d'AFRISUPPLY !</p><p>Votre code : <b style="font-size:18px">${code}</b><br><a href="${link}" style="display:inline-block;margin-top:8px;padding:10px 16px;background:#c2410c;color:#fff;border-radius:10px;text-decoration:none">Cr\xE9er mon compte (2 minutes)</a></p><ul><li>${FOUNDER_OFFER.trialDays} jours gratuits, sans carte bancaire</li><li>puis <b>\u2212${FOUNDER_OFFER.discountPct} % \xE0 vie</b> sur la formule de votre choix</li><li>une ligne directe avec l'\xE9quipe (r\xE9ponse sous 24 h)</li></ul><p>En \xE9change : vous utilisez l'app au quotidien et vous nous dites franchement ce qui coince.</p><p>\xC0 tr\xE8s vite,<br>L'\xE9quipe AFRISUPPLY</p>`
      });
      await audit("pilot.invite", { actorEmail: c.get("user").email, target: lead.id, meta: { code, mail: mail.ok } });
      return c.json({ code, link, mail: mail.ok ? "envoy\xE9" : `non envoy\xE9 (${mail.error ?? mail.transport})`, lead: { ...lead, inviteCode: code } });
    });
    pilotAdminRoutes.put("/admin/pilots/feedback/:id", async (c) => {
      if (!isAdmin2(c.get("user").email)) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
      const { status } = z7.object({ status: z7.enum(["nouveau", "traite"]) }).parse(await c.req.json());
      const db = await getDb();
      const [row] = await db.update(feedback).set({ status }).where(eq14(feedback.id, c.req.param("id"))).returning();
      return c.json({ feedback: row });
    });
  }
});

// apps/api/src/lib/pricing.ts
import { and as and13, eq as eq15, inArray as inArray4, isNull as isNull7, or, gte as gte4 } from "drizzle-orm";
async function loadPricing(offers, restaurantId) {
  const db = await getDb();
  const ids = offers.map((o) => o.id);
  const vendorIds = [...new Set(offers.map((o) => o.vendorId))];
  const tiers = ids.length ? await db.select().from(vendorPriceTiers).where(inArray4(vendorPriceTiers.vendorOfferId, ids)).orderBy(vendorPriceTiers.minPacks) : [];
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const custom = restaurantId && vendorIds.length ? await db.select().from(vendorCustomerPrices).where(and13(eq15(vendorCustomerPrices.restaurantId, restaurantId), inArray4(vendorCustomerPrices.vendorId, vendorIds), or(isNull7(vendorCustomerPrices.validUntil), gte4(vendorCustomerPrices.validUntil, today)))) : [];
  return { tiers, custom };
}
function priceFor(offer, packs, ctx) {
  const list = n5(offer.packPriceEur);
  const tiers = ctx.tiers.filter((t) => t.vendorOfferId === offer.id).map((t) => ({ minPacks: t.minPacks, packPriceEur: n5(t.packPriceEur) })).sort((a, b) => a.minPacks - b.minPacks);
  const applicable = tiers.filter((t) => packs >= t.minPacks).pop();
  const nextTier = tiers.find((t) => t.minPacks > packs) ?? null;
  const base = { packPriceEur: applicable ? applicable.packPriceEur : list, listPriceEur: list, source: applicable ? "palier" : "catalogue", tiers, negotiated: false, nextTier };
  const own = ctx.custom.find((c) => c.vendorOfferId === offer.id);
  const global = ctx.custom.find((c) => c.vendorId === offer.vendorId && !c.vendorOfferId);
  if (own?.packPriceEur) return { ...base, packPriceEur: Math.min(n5(own.packPriceEur), base.packPriceEur), source: "negocie", negotiated: true };
  if (own?.discountPct) return { ...base, packPriceEur: r2(Math.min(list * (1 - n5(own.discountPct) / 100), base.packPriceEur)), source: "negocie", negotiated: true };
  if (global?.discountPct) return { ...base, packPriceEur: r2(Math.min(list * (1 - n5(global.discountPct) / 100), base.packPriceEur)), source: "remise_client", negotiated: true };
  return base;
}
var n5, r2;
var init_pricing = __esm({
  "apps/api/src/lib/pricing.ts"() {
    "use strict";
    init_src();
    n5 = (v) => Number(v ?? 0);
    r2 = (v) => Math.round(v * 100) / 100;
  }
});

// apps/api/src/lib/routes.ts
import { and as and14, eq as eq16, inArray as inArray5, sql as sql10 } from "drizzle-orm";
function routeServes(r, rest) {
  if (!r.zones.length) return true;
  const city = (rest.city ?? "").trim().toLowerCase();
  const cp = (rest.postalCode ?? "").trim();
  return r.zones.some((z21) => {
    const t = z21.trim().toLowerCase();
    if (!t) return false;
    if (/^\d{5}$/.test(t)) return cp === t;
    if (/^\d{2}$/.test(t)) return cp.startsWith(t);
    return t === city;
  });
}
function cutoffFor(r, date2) {
  const [h, m] = r.cutoffTime.split(":").map(Number);
  return { cutoffDate: addDays(date2, -r.cutoffDaysBefore), cutoffMinutes: (h || 0) * 60 + (m || 0) };
}
function isBeforeCutoff(r, date2, now = /* @__PURE__ */ new Date()) {
  const { cutoffDate, cutoffMinutes } = cutoffFor(r, date2);
  const today = parisDate(now);
  return today < cutoffDate || today === cutoffDate && parisMinutes(now) < cutoffMinutes;
}
async function nextSlots(vendorId, rest, days2 = 14, now = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  const rs = (await db.select().from(vendorRoutes).where(and14(eq16(vendorRoutes.vendorId, vendorId), eq16(vendorRoutes.active, true)))).filter((r) => routeServes(r, rest));
  if (!rs.length) return [];
  const today = parisDate(now);
  const horizon = addDays(today, days2);
  const load = await db.select({ routeId: orders.routeId, date: orders.expectedAt, count: sql10`count(*)` }).from(orders).where(and14(inArray5(orders.routeId, rs.map((r) => r.id)), sql10`${orders.expectedAt} between ${today} and ${horizon}`, sql10`${orders.status} not in ('annulee')`)).groupBy(orders.routeId, orders.expectedAt);
  const out = [];
  for (let i = 0; i <= days2; i++) {
    const date2 = addDays(today, i);
    const wd = weekdayOf(date2);
    for (const r of rs.filter((x) => x.weekday === wd)) {
      if (!isBeforeCutoff(r, date2, now)) continue;
      const used = Number(load.find((l) => l.routeId === r.id && l.date === date2)?.count ?? 0);
      const remaining = r.capacity === null ? null : Math.max(0, r.capacity - used);
      const { cutoffDate } = cutoffFor(r, date2);
      out.push({ routeId: r.id, routeName: r.name, date: date2, weekday: wd, slots: r.slots, cutoffAt: `${cutoffDate} ${r.cutoffTime}`, remaining, full: remaining === 0 });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
var TZ, WEEKDAYS_FR, parisDate, parisMinutes, addDays, weekdayOf;
var init_routes = __esm({
  "apps/api/src/lib/routes.ts"() {
    "use strict";
    init_src();
    TZ = "Europe/Paris";
    WEEKDAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
    parisDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    parisMinutes = (d) => {
      const p = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
      return Number(p.find((x) => x.type === "hour").value) * 60 + Number(p.find((x) => x.type === "minute").value);
    };
    addDays = (ymd, n15) => {
      const d = /* @__PURE__ */ new Date(`${ymd}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n15);
      return d.toISOString().slice(0, 10);
    };
    weekdayOf = (ymd) => (/* @__PURE__ */ new Date(`${ymd}T12:00:00Z`)).getUTCDay();
  }
});

// apps/api/src/lib/reliability.ts
import { and as and15, gte as gte5, inArray as inArray6, sql as sql11 } from "drizzle-orm";
async function reliabilityFor(vendorIds) {
  const db = await getDb();
  const out = /* @__PURE__ */ new Map();
  if (!vendorIds.length) return out;
  const since = sql11`now() - interval '90 days'`;
  const rev = await db.select({ vendorId: vendorReviews.vendorId, rating: sql11`avg(${vendorReviews.rating})`, count: sql11`count(*)`, onTime: sql11`count(*) filter (where ${vendorReviews.onTime})`, onTimeN: sql11`count(*) filter (where ${vendorReviews.onTime} is not null)`, conform: sql11`count(*) filter (where ${vendorReviews.conform})`, conformN: sql11`count(*) filter (where ${vendorReviews.conform} is not null)` }).from(vendorReviews).where(inArray6(vendorReviews.vendorId, vendorIds)).groupBy(vendorReviews.vendorId);
  const ops = await db.select({ vendorId: orders.vendorId, total: sql11`count(*)`, decided: sql11`count(*) filter (where ${orders.vendorDecisionAt} is not null)`, refused: sql11`count(*) filter (where ${orders.status} = 'annulee' and ${orders.vendorDecisionAt} is not null)`, avgH: sql11`avg(extract(epoch from (${orders.vendorDecisionAt} - ${orders.sentAt}))/3600) filter (where ${orders.vendorDecisionAt} is not null and ${orders.sentAt} is not null)`, delivered: sql11`count(*) filter (where ${orders.status} in ('livree','livree_partiel') or ${orders.vendorDeliveredAt} is not null)`, partial: sql11`count(*) filter (where ${orders.status} = 'livree_partiel')` }).from(orders).where(and15(inArray6(orders.vendorId, vendorIds), gte5(orders.createdAt, since))).groupBy(orders.vendorId);
  for (const vid of vendorIds) {
    const r = rev.find((x) => x.vendorId === vid);
    const o = ops.find((x) => x.vendorId === vid);
    const reviews = r ? Number(r.count) : 0;
    const rating = r ? Math.round(Number(r.rating) * 10) / 10 : null;
    const decided = o ? Number(o.decided) : 0;
    const acceptPct = decided ? Math.round((decided - Number(o.refused)) / decided * 100) : null;
    const delivered = o ? Number(o.delivered) : 0;
    const disputePct = delivered ? Math.round(Number(o.partial) / delivered * 100) : null;
    const onTimePct = r ? pct(Number(r.onTime), Number(r.onTimeN)) : null;
    const conformPct = r ? pct(Number(r.conform), Number(r.conformN)) : null;
    const avgResponseH = o && o.avgH !== null ? Math.round(Number(o.avgH) * 10) / 10 : null;
    let badge = "nouveau";
    if (reviews >= 3 || decided >= 5) {
      const bad = rating !== null && rating < 3.5 || acceptPct !== null && acceptPct < 80 || onTimePct !== null && onTimePct < 70;
      const great = rating !== null && rating >= 4.5 && (onTimePct ?? 100) >= 90 && (acceptPct ?? 100) >= 95;
      badge = bad ? "a_surveiller" : great ? "excellent" : "fiable";
    }
    out.set(vid, { rating, reviews, onTimePct, conformPct, acceptPct, avgResponseH, disputePct, orders90d: o ? Number(o.total) : 0, badge });
  }
  return out;
}
var pct, emptyReliability;
var init_reliability = __esm({
  "apps/api/src/lib/reliability.ts"() {
    "use strict";
    init_src();
    pct = (a, b) => a === null || !b ? null : Math.round(a / b * 100);
    emptyReliability = { rating: null, reviews: 0, onTimePct: null, conformPct: null, acceptPct: null, avgResponseH: null, disputePct: null, orders90d: 0, badge: "nouveau" };
  }
});

// apps/api/src/routes/marketplace.ts
var marketplace_exports = {};
__export(marketplace_exports, {
  linkVendor: () => linkVendor,
  marketplaceRoutes: () => marketplaceRoutes,
  nextRunOn: () => nextRunOn,
  placeVendorOrder: () => placeVendorOrder,
  restaurantZones: () => restaurantZones,
  runRecurringOrders: () => runRecurringOrders
});
import { Hono as Hono8 } from "hono";
import { z as z8 } from "zod";
import { and as and16, desc as desc6, eq as eq18, gte as gte6, inArray as inArray7, sql as sql12 } from "drizzle-orm";
function restaurantZones(r) {
  const z21 = /* @__PURE__ */ new Set(["France"]);
  if (r.city) z21.add(r.city.trim().toLowerCase());
  if (r.postalCode) z21.add(r.postalCode.slice(0, 2));
  return z21;
}
async function linkVendor(rid, vid) {
  const db = await getDb();
  const [v] = await db.select().from(vendors).where(and16(eq18(vendors.id, vid), eq18(vendors.status, "actif")));
  if (!v) return null;
  let [sup] = await db.select().from(suppliers).where(and16(eq18(suppliers.restaurantId, rid), eq18(suppliers.vendorId, vid)));
  if (!sup) {
    [sup] = await db.insert(suppliers).values({ restaurantId: rid, vendorId: vid, name: v.name, contactName: null, email: v.contactEmail, phone: v.contactPhone, whatsapp: v.whatsapp, city: v.city, categories: v.categories, leadTimeHours: v.leadTimeHours, deliveryDays: v.deliveryDays, minOrderEur: v.minOrderEur, deliveryFeeEur: v.deliveryFeeEur, preferredChannel: "plateforme", notes: `Fournisseur AFRISUPPLY Marketplace \u2014 ${v.description ?? ""}`.trim() }).returning();
  }
  const vo = await db.select().from(vendorOffers).where(and16(eq18(vendorOffers.vendorId, vid), eq18(vendorOffers.inStock, true)));
  let synced = 0;
  for (const o of vo) {
    const [offer] = await db.insert(supplierOffers).values({ restaurantId: rid, supplierId: sup.id, productId: o.productId, packLabel: o.packLabel, packQty: o.packQty, packPriceEur: o.packPriceEur, inStock: true }).onConflictDoUpdate({ target: [supplierOffers.supplierId, supplierOffers.productId, supplierOffers.packLabel], set: { packQty: o.packQty, packPriceEur: o.packPriceEur, inStock: true, lastSeenAt: /* @__PURE__ */ new Date() } }).returning();
    await db.insert(priceHistory).values({ restaurantId: rid, offerId: offer.id, unitPriceEur: (n6(o.packPriceEur) / n6(o.packQty)).toFixed(4), source: "catalogue" });
    synced++;
  }
  return { supplier: sup, synced };
}
async function placeVendorOrder(rid, vid, userId, input) {
  const db = await getDb();
  const link = await linkVendor(rid, vid);
  if (!link) return { ok: false, error: "Fournisseur introuvable", status: 404 };
  const [v] = await db.select().from(vendors).where(eq18(vendors.id, vid));
  if (v.status !== "actif") return { ok: false, error: `${v.name} n'est plus actif sur la plateforme`, status: 400 };
  const vo = await db.select().from(vendorOffers).where(and16(eq18(vendorOffers.vendorId, vid), inArray7(vendorOffers.id, input.lines.map((l) => l.vendorOfferId))));
  if (vo.length !== input.lines.length) return { ok: false, error: "Offre invalide", status: 400 };
  const out = vo.filter((o) => !o.inStock);
  if (out.length) return { ok: false, error: `Plus disponible chez ${v.name} : ${out.map((o) => o.packLabel).join(", ")}`, status: 400 };
  if (input.lines.length > MAX_ORDER_LINES) return { ok: false, error: `Trop de lignes dans la commande (${input.lines.length}), maximum ${MAX_ORDER_LINES}.`, status: 400 };
  const tooMany = input.lines.find((l) => l.packs > MAX_PACKS_PER_LINE2);
  if (tooMany) return { ok: false, error: `Nombre de colis invraisemblable sur une ligne (${tooMany.packs}), maximum ${MAX_PACKS_PER_LINE2}.`, status: 400 };
  const prodRows = await db.select({ id: products.id, name: products.name, unit: products.baseUnit, category: products.category }).from(products).where(inArray7(products.id, vo.map((o) => o.productId)));
  const outOfRange = await assertPlausibleQuantity(rid, input.lines.map((l) => {
    const o = vo.find((x) => x.id === l.vendorOfferId);
    const pr = prodRows.find((x) => x.id === o.productId);
    const packQty = n6(o.packQty) || 1;
    return { productId: o.productId, productName: pr?.name ?? "Produit", unit: pr?.unit ?? "kg", category: pr?.category ?? null, packQty, packs: l.packs, quantity: l.packs * packQty };
  }), { override: input.override });
  if (outOfRange) return { ok: false, error: outOfRange.error, status: 400 };
  const pricing = await loadPricing(vo, rid);
  const linesData = input.lines.map((l) => {
    const o = vo.find((x) => x.id === l.vendorOfferId);
    const pp = priceFor(o, l.packs, pricing).packPriceEur;
    return { productId: o.productId, packLabel: o.packLabel, packs: l.packs, quantity: (l.packs * n6(o.packQty)).toFixed(3), unitPriceEur: (pp / n6(o.packQty)).toFixed(4), lineTotalEur: (l.packs * pp).toFixed(2) };
  });
  const total = linesData.reduce((a, l) => a + Number(l.lineTotalEur), 0);
  if (!input.skipMin && total < n6(v.minOrderEur)) return { ok: false, error: `Minimum de commande ${eur7(n6(v.minOrderEur))} chez ${v.name} (panier : ${eur7(total)})`, status: 400 };
  const [rz] = await db.select({ city: restaurants.city, postalCode: restaurants.postalCode }).from(restaurants).where(eq18(restaurants.id, rid));
  const slots = await nextSlots(vid, rz);
  let expectedAt = new Date(Date.now() + v.leadTimeHours * 36e5).toISOString().slice(0, 10);
  let routeId = null;
  let deliverySlot = null;
  if (input.routeId || input.expectedAt) {
    const opt = slots.find((s) => (!input.routeId || s.routeId === input.routeId) && (!input.expectedAt || s.date === input.expectedAt));
    if (!opt) return { ok: false, error: "Ce cr\xE9neau de livraison n'est plus disponible (heure limite d\xE9pass\xE9e ou tourn\xE9e modifi\xE9e). Choisissez une autre date.", status: 400 };
    if (opt.full) return { ok: false, error: `Tourn\xE9e compl\xE8te le ${opt.date} : choisissez une autre date.`, status: 409 };
    if (input.deliverySlot && opt.slots.length && !opt.slots.includes(input.deliverySlot)) return { ok: false, error: "Cr\xE9neau horaire invalide pour cette tourn\xE9e", status: 400 };
    expectedAt = opt.date;
    routeId = opt.routeId;
    deliverySlot = input.deliverySlot ?? opt.slots[0] ?? null;
  } else if (slots.length && input.source !== "recurrente") {
    const first = slots.find((s) => !s.full);
    if (!first) return { ok: false, error: `${v.name} n'a plus de tourn\xE9e disponible dans les 14 prochains jours pour votre zone.`, status: 409 };
    expectedAt = first.date;
    routeId = first.routeId;
    deliverySlot = first.slots[0] ?? null;
  }
  const reference = await nextOrderReference();
  const [order] = await db.insert(orders).values({ restaurantId: rid, supplierId: link.supplier.id, vendorId: vid, reference, status: "envoyee", channel: "plateforme", sentAt: /* @__PURE__ */ new Date(), routeId, deliverySlot, expectedAt, totalEur: total.toFixed(2), deliveryFeeEur: v.deliveryFeeEur, source: input.source ?? "marketplace", notes: input.notes, createdBy: userId }).returning();
  const priv = await db.select().from(supplierOffers).where(eq18(supplierOffers.supplierId, link.supplier.id));
  await db.insert(orderLines).values(linesData.map((l) => ({ ...l, orderId: order.id, offerId: priv.find((p) => p.productId === l.productId && p.packLabel === l.packLabel)?.id ?? null })));
  const [r] = await db.select({ name: restaurants.name, city: restaurants.city }).from(restaurants).where(eq18(restaurants.id, rid));
  if (v.contactEmail) void sendMail({ to: v.contactEmail, subject: `Nouvelle commande ${reference} \u2014 ${r.name}${r.city ? ` (${r.city})` : ""} \u2014 ${eur7(total)}`, text: `Bonjour,

${r.name} vous passe commande via AFRISUPPLY :
${linesData.map((l) => `\u2022 ${l.packs} \xD7 ${l.packLabel} \u2014 ${eur7(Number(l.lineTotalEur))}`).join("\n")}
Total : ${eur7(total)}

Confirmez ou refusez en un clic : ${APP_URL2()}/fournisseur/commandes
`, html: `<p>Bonjour,</p><p><b>${r.name}</b> vous passe commande via AFRISUPPLY :</p><ul>${linesData.map((l) => `<li>${l.packs} \xD7 ${l.packLabel} \u2014 ${eur7(Number(l.lineTotalEur))}</li>`).join("")}</ul><p><b>Total : ${eur7(total)}</b></p><p><a href="${APP_URL2()}/fournisseur/commandes">Confirmer ou refuser</a></p>`, tags: { type: "vendor_order" } });
  void logOrderEvent(order.id, "sent", `Commande envoy\xE9e \xE0 ${v.name}${input.source === "recurrente" ? " (commande r\xE9currente)" : input.source === "recommande" ? " (recommande)" : ""}`, "restaurant", { total });
  const phone = v.whatsapp || v.contactPhone;
  if (phone) void sendMessage({ to: phone, prefer: v.whatsapp ? "whatsapp" : "sms", kind: "order.new", orderId: order.id, vendorId: vid, restaurantId: rid, body: `AFRISUPPLY \u2014 Nouvelle commande ${reference}
${r.name}${r.city ? ` (${r.city})` : ""} \u2014 ${eur7(total)}
${linesData.slice(0, 6).map((l) => `\u2022 ${l.packs} \xD7 ${l.packLabel}`).join("\n")}${linesData.length > 6 ? `
\u2026 +${linesData.length - 6} lignes` : ""}
Confirmer / refuser : ${APP_URL2()}/fournisseur/commandes` });
  return { ok: true, order, total, vendorName: v.name };
}
function nextRunOn(weekdays, from = /* @__PURE__ */ new Date()) {
  if (!weekdays.length) return null;
  for (let i = 1; i <= 7; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    if (weekdays.includes(d.getDay())) return d.toISOString().slice(0, 10);
  }
  return null;
}
async function runRecurringOrders(now = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  const today = now.toISOString().slice(0, 10);
  const due = await db.select().from(recurringOrders).where(and16(eq18(recurringOrders.enabled, true), eq18(recurringOrders.nextRunOn, today)));
  const out = [];
  for (const r of due) {
    if (r.lastRunAt && r.lastRunAt.toISOString().slice(0, 10) === today) continue;
    const res = await placeVendorOrder(r.restaurantId, r.vendorId, r.createdBy, { lines: r.lines, notes: r.notes ?? void 0, source: "recurrente" });
    const next = nextRunOn(r.weekdays, now);
    if (res.ok) {
      await db.update(recurringOrders).set({ lastRunAt: now, lastOrderId: res.order.id, nextRunOn: next }).where(eq18(recurringOrders.id, r.id));
      out.push({ id: r.id, name: r.name, ok: true, reference: res.order.reference });
    } else {
      await db.update(recurringOrders).set({ nextRunOn: next }).where(eq18(recurringOrders.id, r.id));
      out.push({ id: r.id, name: r.name, ok: false, error: res.error });
      const rcpts = await db.select({ email: users.email }).from(restaurantMembers).innerJoin(users, eq18(users.id, restaurantMembers.userId)).where(and16(eq18(restaurantMembers.restaurantId, r.restaurantId), inArray7(restaurantMembers.role, ["owner", "manager"])));
      for (const x of rcpts) void sendMail({ to: x.email, subject: `\u26A0\uFE0F Commande r\xE9currente \xAB ${r.name} \xBB non envoy\xE9e`, text: `La commande r\xE9currente \xAB ${r.name} \xBB n'a pas pu \xEAtre envoy\xE9e aujourd'hui : ${res.error}. V\xE9rifiez-la dans Achats \u2192 R\xE9currentes.`, html: `<p>La commande r\xE9currente \xAB <b>${r.name}</b> \xBB n'a pas pu \xEAtre envoy\xE9e aujourd'hui : ${res.error}.</p><p><a href="${APP_URL2()}/app/achats">V\xE9rifier</a></p>`, tags: { type: "recurring" } });
    }
  }
  return { date: today, due: due.length, results: out };
}
var marketplaceRoutes, MAX_PACKS_PER_LINE2, MAX_ORDER_LINES, n6, eur7, servesZone, DAYS;
var init_marketplace = __esm({
  "apps/api/src/routes/marketplace.ts"() {
    "use strict";
    init_src();
    init_reference();
    init_auth();
    init_mailer();
    init_sms();
    init_order_events();
    init_restaurant();
    init_daily();
    init_pricing();
    init_routes();
    init_reliability();
    marketplaceRoutes = new Hono8();
    marketplaceRoutes.on(["POST"], "/marketplace/vendors/:id/orders", requireMinRole("manager"));
    marketplaceRoutes.on(["POST"], "/marketplace/vendors/:id/link", requireMinRole("manager"));
    marketplaceRoutes.on(["POST"], "/marketplace/group-buys/:id/join", requireMinRole("manager"));
    MAX_PACKS_PER_LINE2 = 1e3;
    MAX_ORDER_LINES = 80;
    marketplaceRoutes.use("*", requireAuth, requireRestaurant);
    n6 = (v) => v === null || v === void 0 ? 0 : Number(v);
    eur7 = (v) => `${v.toFixed(2).replace(".", ",")} \u20AC`;
    servesZone = (v, zones) => v.deliveryZones.length === 0 || v.deliveryZones.some((d) => zones.has(d.trim().toLowerCase()) || zones.has(d));
    marketplaceRoutes.get("/marketplace/vendors", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const [r] = await db.select().from(restaurants).where(eq18(restaurants.id, rid));
      const zones = restaurantZones(r);
      const all = await db.select().from(vendors).where(eq18(vendors.status, "actif"));
      const mine = new Set((await db.select({ productId: inventoryItems.productId }).from(inventoryItems).where(eq18(inventoryItems.restaurantId, rid))).map((x) => x.productId));
      const linked = new Map((await db.select({ vendorId: suppliers.vendorId, supplierId: suppliers.id }).from(suppliers).where(and16(eq18(suppliers.restaurantId, rid), sql12`${suppliers.vendorId} is not null`))).map((x) => [x.vendorId, x.supplierId]));
      const offers = await db.select({ vendorId: vendorOffers.vendorId, productId: vendorOffers.productId }).from(vendorOffers).where(eq18(vendorOffers.inStock, true));
      const rel = await reliabilityFor(all.map((v) => v.id));
      const out = all.filter((v) => servesZone(v, zones)).map((v) => {
        const vo = offers.filter((o) => o.vendorId === v.id);
        const covered = new Set(vo.filter((o) => mine.has(o.productId)).map((o) => o.productId)).size;
        return { ...v, offerCount: vo.length, coversMyProducts: covered, myProductCount: mine.size, linkedSupplierId: linked.get(v.id) ?? null, reliability: rel.get(v.id) ?? emptyReliability };
      }).sort((a, b) => b.coversMyProducts - a.coversMyProducts);
      return c.json({ vendors: out, zones: [...zones] });
    });
    marketplaceRoutes.get("/marketplace/vendors/:id", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const vid = c.req.param("id");
      const [v] = await db.select().from(vendors).where(and16(eq18(vendors.id, vid), eq18(vendors.status, "actif")));
      if (!v) return c.json({ error: "Fournisseur introuvable" }, 404);
      const rows = await db.select({ offer: vendorOffers, product: products }).from(vendorOffers).innerJoin(products, eq18(products.id, vendorOffers.productId)).where(eq18(vendorOffers.vendorId, vid)).orderBy(products.category, products.name);
      const myBest = /* @__PURE__ */ new Map();
      for (const o of await db.select({ productId: supplierOffers.productId, unit: sql12`min(${supplierOffers.packPriceEur} / ${supplierOffers.packQty})` }).from(supplierOffers).where(eq18(supplierOffers.restaurantId, rid)).groupBy(supplierOffers.productId)) myBest.set(o.productId, n6(o.unit));
      const mine = new Set((await db.select({ productId: inventoryItems.productId }).from(inventoryItems).where(eq18(inventoryItems.restaurantId, rid))).map((x) => x.productId));
      const [link] = await db.select({ id: suppliers.id }).from(suppliers).where(and16(eq18(suppliers.restaurantId, rid), eq18(suppliers.vendorId, vid)));
      const pricing = await loadPricing(rows.map((r) => r.offer), rid);
      const offers = rows.map(({ offer, product }) => {
        const pi = priceFor(offer, 1, pricing);
        const unit2 = pi.packPriceEur / n6(offer.packQty);
        const best = myBest.get(product.id);
        return { ...offer, listPriceEur: pi.listPriceEur, packPriceEur: pi.packPriceEur.toFixed(2), negotiated: pi.negotiated, priceSource: pi.source, tiers: pi.tiers, productName: product.name, category: product.category, unit: product.baseUnit, unitPrice: Math.round(unit2 * 1e4) / 1e4, myBestUnitPrice: best ?? null, savingPct: best ? Math.round((best - unit2) / best * 1e3) / 10 : null, tracked: mine.has(product.id) };
      });
      const gbs = await db.select().from(groupBuys).where(and16(eq18(groupBuys.vendorId, vid), eq18(groupBuys.status, "ouvert"), gte6(groupBuys.closesAt, /* @__PURE__ */ new Date())));
      return c.json({ vendor: v, reliability: (await reliabilityFor([vid])).get(vid) ?? emptyReliability, offers, linkedSupplierId: link?.id ?? null, groupBuys: gbs });
    });
    marketplaceRoutes.post("/marketplace/vendors/:id/link", async (c) => {
      const res = await linkVendor(c.get("restaurantId"), c.req.param("id"));
      if (!res) return c.json({ error: "Fournisseur introuvable" }, 404);
      return c.json({ ok: true, supplierId: res.supplier.id, offersSynced: res.synced, message: `${res.supplier.name} ajout\xE9 \xE0 vos fournisseurs : ${res.synced} prix import\xE9s. Le comparateur et le panier en tiennent compte d\xE8s maintenant.` });
    });
    marketplaceRoutes.post("/marketplace/vendors/:id/orders", async (c) => {
      const rid = c.get("restaurantId");
      const user = c.get("user");
      const vid = c.req.param("id");
      const body3 = z8.object({
        lines: z8.array(z8.object({ vendorOfferId: z8.string().uuid(), packs: z8.number().int().positive().max(MAX_PACKS_PER_LINE2) })).min(1).max(MAX_ORDER_LINES),
        notes: z8.string().max(300).optional(),
        source: z8.string().optional(),
        routeId: z8.string().uuid().optional(),
        expectedAt: z8.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        deliverySlot: z8.string().max(20).optional(),
        /** Confirmation explicite : autorise un volume au-delà de votre plafond habituel. */
        override: z8.boolean().optional()
      }).safeParse(await c.req.json());
      if (!body3.success) return c.json({ error: `Donn\xE9es invalides : chaque ligne attend un nombre de colis entre 1 et ${MAX_PACKS_PER_LINE2} (panier de ${MAX_ORDER_LINES} lignes maximum).` }, 400);
      const res = await placeVendorOrder(rid, vid, user.id, body3.data);
      if (!res.ok) return c.json({ error: res.error }, res.status);
      return c.json({ order: res.order, message: `Commande ${res.order.reference} envoy\xE9e \xE0 ${res.vendorName} (${eur7(res.total)})${res.order.routeId ? ` \u2014 livraison pr\xE9vue le ${(/* @__PURE__ */ new Date(`${res.order.expectedAt}T12:00:00Z`)).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}${res.order.deliverySlot ? ` (${res.order.deliverySlot})` : ""}` : ""}. Vous serez pr\xE9venu d\xE8s confirmation.` }, 201);
    });
    marketplaceRoutes.get("/marketplace/vendors/:id/slots", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const [r] = await db.select({ city: restaurants.city, postalCode: restaurants.postalCode }).from(restaurants).where(eq18(restaurants.id, rid));
      const slots = await nextSlots(c.req.param("id"), r);
      return c.json({ slots: slots.map((s) => ({ ...s, weekdayLabel: WEEKDAYS_FR[s.weekday] })), hasRoutes: slots.length > 0 });
    });
    marketplaceRoutes.post("/marketplace/vendors/:id/quote", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const vid = c.req.param("id");
      const body3 = z8.object({ lines: z8.array(z8.object({ vendorOfferId: z8.string().uuid(), packs: z8.number().int().positive() })).min(1) }).safeParse(await c.req.json());
      if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
      const vo = await db.select().from(vendorOffers).where(and16(eq18(vendorOffers.vendorId, vid), inArray7(vendorOffers.id, body3.data.lines.map((l) => l.vendorOfferId))));
      const pricing = await loadPricing(vo, rid);
      const lines = body3.data.lines.map((l) => {
        const o = vo.find((x) => x.id === l.vendorOfferId);
        if (!o) return null;
        const pi = priceFor(o, l.packs, pricing);
        return { vendorOfferId: o.id, packLabel: o.packLabel, packs: l.packs, listPriceEur: pi.listPriceEur, packPriceEur: pi.packPriceEur, source: pi.source, lineTotalEur: Math.round(l.packs * pi.packPriceEur * 100) / 100, savedEur: Math.round(l.packs * (pi.listPriceEur - pi.packPriceEur) * 100) / 100, nextTier: pi.nextTier ? { ...pi.nextTier, missingPacks: pi.nextTier.minPacks - l.packs, extraSavingEur: Math.round(pi.nextTier.minPacks * (pi.packPriceEur - pi.nextTier.packPriceEur) * 100) / 100 } : null };
      }).filter((x) => !!x);
      return c.json({ lines, total: Math.round(lines.reduce((a, l) => a + l.lineTotalEur, 0) * 100) / 100, saved: Math.round(lines.reduce((a, l) => a + l.savedEur, 0) * 100) / 100 });
    });
    marketplaceRoutes.get("/orders/:id/reorder-preview", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const [o] = await db.select().from(orders).where(and16(eq18(orders.id, c.req.param("id")), eq18(orders.restaurantId, rid)));
      if (!o?.vendorId) return c.json({ error: "Commande plateforme introuvable" }, 404);
      const lines = await db.select({ l: orderLines, productName: products.name }).from(orderLines).innerJoin(products, eq18(products.id, orderLines.productId)).where(eq18(orderLines.orderId, o.id));
      const offers = await db.select().from(vendorOffers).where(eq18(vendorOffers.vendorId, o.vendorId));
      const [v] = await db.select({ name: vendors.name, status: vendors.status, minOrderEur: vendors.minOrderEur }).from(vendors).where(eq18(vendors.id, o.vendorId));
      const items = lines.map(({ l, productName }) => {
        const off = offers.find((x) => x.productId === l.productId && x.packLabel === l.packLabel) ?? offers.find((x) => x.productId === l.productId);
        return { productName, packLabel: off?.packLabel ?? l.packLabel, packs: n6(l.packs), vendorOfferId: off?.id ?? null, available: !!off?.inStock, oldPackPrice: Math.round(n6(l.lineTotalEur) / Math.max(1, n6(l.packs)) * 100) / 100, newPackPrice: off ? n6(off.packPriceEur) : null };
      });
      const total = items.reduce((a, i) => a + (i.available && i.newPackPrice !== null ? i.packs * i.newPackPrice : 0), 0);
      return c.json({ vendor: { id: o.vendorId, ...v }, items, total: Math.round(total * 100) / 100, oldTotal: n6(o.totalEur) });
    });
    marketplaceRoutes.post("/orders/:id/reorder", async (c) => {
      const rid = c.get("restaurantId");
      const user = c.get("user");
      const db = await getDb();
      const body3 = z8.object({ lines: z8.array(z8.object({ vendorOfferId: z8.string().uuid(), packs: z8.number().int().positive() })).min(1).optional(), notes: z8.string().max(300).optional() }).safeParse(await c.req.json().catch(() => ({})));
      if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
      const [o] = await db.select().from(orders).where(and16(eq18(orders.id, c.req.param("id")), eq18(orders.restaurantId, rid)));
      if (!o?.vendorId) return c.json({ error: "Commande plateforme introuvable" }, 404);
      let lines = body3.data.lines;
      if (!lines) {
        const prev = await db.select().from(orderLines).where(eq18(orderLines.orderId, o.id));
        const offers = await db.select().from(vendorOffers).where(and16(eq18(vendorOffers.vendorId, o.vendorId), eq18(vendorOffers.inStock, true)));
        lines = prev.map((l) => {
          const off = offers.find((x) => x.productId === l.productId && x.packLabel === l.packLabel) ?? offers.find((x) => x.productId === l.productId);
          return off ? { vendorOfferId: off.id, packs: n6(l.packs) } : null;
        }).filter((x) => !!x);
      }
      if (!lines.length) return c.json({ error: "Aucun produit de cette commande n\u2019est disponible actuellement" }, 400);
      const res = await placeVendorOrder(rid, o.vendorId, user.id, { lines, notes: body3.data.notes ?? o.notes ?? void 0, source: "recommande" });
      if (!res.ok) return c.json({ error: res.error }, res.status);
      return c.json({ order: res.order, message: `Commande ${res.order.reference} renvoy\xE9e \xE0 ${res.vendorName} (${eur7(res.total)}).` }, 201);
    });
    DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
    marketplaceRoutes.get("/recurring", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const rows = await db.select({ r: recurringOrders, vendorName: vendors.name }).from(recurringOrders).innerJoin(vendors, eq18(vendors.id, recurringOrders.vendorId)).where(eq18(recurringOrders.restaurantId, rid)).orderBy(recurringOrders.createdAt);
      const offerIds = [...new Set(rows.flatMap((x) => x.r.lines.map((l) => l.vendorOfferId)))];
      const offers = offerIds.length ? await db.select({ o: vendorOffers, productName: products.name }).from(vendorOffers).innerJoin(products, eq18(products.id, vendorOffers.productId)).where(inArray7(vendorOffers.id, offerIds)) : [];
      return c.json({ recurring: rows.map(({ r, vendorName }) => ({ ...r, vendorName, daysLabel: r.weekdays.map((d) => DAYS[d]).join(", "), lines: r.lines.map((l) => {
        const o = offers.find((x) => x.o.id === l.vendorOfferId);
        return { ...l, productName: o?.productName ?? "?", packLabel: o?.o.packLabel ?? null, packPriceEur: o ? n6(o.o.packPriceEur) : null, available: !!o?.o.inStock };
      }), estimatedTotal: Math.round(r.lines.reduce((a, l) => {
        const o = offers.find((x) => x.o.id === l.vendorOfferId);
        return a + (o ? l.packs * n6(o.o.packPriceEur) : 0);
      }, 0) * 100) / 100 })) });
    });
    marketplaceRoutes.post("/recurring", async (c) => {
      const rid = c.get("restaurantId");
      const user = c.get("user");
      const db = await getDb();
      const body3 = z8.object({ vendorId: z8.string().uuid().optional(), fromOrderId: z8.string().uuid().optional(), name: z8.string().min(2).max(60), weekdays: z8.array(z8.number().int().min(0).max(6)).min(1), mode: z8.enum(["auto", "confirm"]).default("auto"), notes: z8.string().max(300).optional(), lines: z8.array(z8.object({ vendorOfferId: z8.string().uuid(), packs: z8.number().int().positive() })).optional() }).safeParse(await c.req.json());
      if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
      let { vendorId, lines } = body3.data;
      if (body3.data.fromOrderId) {
        const [o] = await db.select().from(orders).where(and16(eq18(orders.id, body3.data.fromOrderId), eq18(orders.restaurantId, rid)));
        if (!o?.vendorId) return c.json({ error: "Commande introuvable" }, 404);
        vendorId = o.vendorId;
        if (!lines) {
          const prev = await db.select().from(orderLines).where(eq18(orderLines.orderId, o.id));
          const offers = await db.select().from(vendorOffers).where(eq18(vendorOffers.vendorId, o.vendorId));
          lines = prev.map((l) => {
            const off = offers.find((x) => x.productId === l.productId && x.packLabel === l.packLabel) ?? offers.find((x) => x.productId === l.productId);
            return off ? { vendorOfferId: off.id, packs: n6(l.packs) } : null;
          }).filter((x) => !!x);
        }
      }
      if (!vendorId || !lines?.length) return c.json({ error: "Fournisseur et lignes requis" }, 400);
      const [row] = await db.insert(recurringOrders).values({ restaurantId: rid, vendorId, name: body3.data.name, weekdays: [...new Set(body3.data.weekdays)].sort(), lines, mode: body3.data.mode, notes: body3.data.notes, nextRunOn: nextRunOn(body3.data.weekdays), createdBy: user.id }).returning();
      return c.json({ recurring: row, message: `\xAB ${row.name} \xBB programm\xE9e : ${row.weekdays.map((d) => DAYS[d]).join(", ")} (prochaine le ${row.nextRunOn}).` }, 201);
    });
    marketplaceRoutes.put("/recurring/:id", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const body3 = z8.object({ name: z8.string().min(2).max(60).optional(), weekdays: z8.array(z8.number().int().min(0).max(6)).min(1).optional(), mode: z8.enum(["auto", "confirm"]).optional(), enabled: z8.boolean().optional(), notes: z8.string().max(300).nullable().optional(), lines: z8.array(z8.object({ vendorOfferId: z8.string().uuid(), packs: z8.number().int().positive() })).min(1).optional() }).safeParse(await c.req.json());
      if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
      const patch = { ...body3.data, notes: body3.data.notes ?? void 0 };
      if (body3.data.weekdays) {
        patch.weekdays = [...new Set(body3.data.weekdays)].sort();
        patch.nextRunOn = nextRunOn(patch.weekdays);
      }
      const [row] = await db.update(recurringOrders).set(patch).where(and16(eq18(recurringOrders.id, c.req.param("id")), eq18(recurringOrders.restaurantId, rid))).returning();
      if (!row) return c.json({ error: "Introuvable" }, 404);
      return c.json({ recurring: row });
    });
    marketplaceRoutes.delete("/recurring/:id", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const [row] = await db.delete(recurringOrders).where(and16(eq18(recurringOrders.id, c.req.param("id")), eq18(recurringOrders.restaurantId, rid))).returning();
      if (!row) return c.json({ error: "Introuvable" }, 404);
      return c.json({ ok: true });
    });
    marketplaceRoutes.post("/recurring/:id/run", async (c) => {
      const rid = c.get("restaurantId");
      const user = c.get("user");
      const db = await getDb();
      const [r] = await db.select().from(recurringOrders).where(and16(eq18(recurringOrders.id, c.req.param("id")), eq18(recurringOrders.restaurantId, rid)));
      if (!r) return c.json({ error: "Introuvable" }, 404);
      const res = await placeVendorOrder(rid, r.vendorId, user.id, { lines: r.lines, notes: r.notes ?? void 0, source: "recurrente" });
      if (!res.ok) return c.json({ error: res.error }, res.status);
      await db.update(recurringOrders).set({ lastRunAt: /* @__PURE__ */ new Date(), lastOrderId: res.order.id, nextRunOn: nextRunOn(r.weekdays) }).where(eq18(recurringOrders.id, r.id));
      return c.json({ order: res.order, message: `Commande ${res.order.reference} envoy\xE9e \xE0 ${res.vendorName} (${eur7(res.total)}).` }, 201);
    });
    marketplaceRoutes.get("/marketplace/group-buys", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const [r] = await db.select().from(restaurants).where(eq18(restaurants.id, rid));
      const zones = restaurantZones(r);
      const rows = await db.select({ gb: groupBuys, vendorName: vendors.name, offer: vendorOffers, productName: products.name, unit: products.baseUnit }).from(groupBuys).innerJoin(vendors, eq18(vendors.id, groupBuys.vendorId)).innerJoin(vendorOffers, eq18(vendorOffers.id, groupBuys.vendorOfferId)).innerJoin(products, eq18(products.id, vendorOffers.productId)).where(inArray7(groupBuys.status, ["ouvert", "atteint"])).orderBy(groupBuys.closesAt);
      const ids = rows.map((x) => x.gb.id);
      const parts = ids.length ? await db.select().from(groupBuyParticipations).where(inArray7(groupBuyParticipations.groupBuyId, ids)) : [];
      const out = rows.filter((x) => zones.has(x.gb.zone.toLowerCase()) || x.gb.zone === "France").map((x) => {
        const p = parts.filter((y) => y.groupBuyId === x.gb.id);
        const committed = p.reduce((a, y) => a + y.packs, 0);
        const mine = p.find((y) => y.restaurantId === rid);
        const price = n6(x.offer.packPriceEur);
        const disc = price * (1 - n6(x.gb.discountPct) / 100);
        return { ...x.gb, vendorName: x.vendorName, productName: x.productName, unit: x.unit, packLabel: x.offer.packLabel, packQty: n6(x.offer.packQty), packPrice: price, discountedPackPrice: Math.round(disc * 100) / 100, committedPacks: committed, participants: p.length, progressPct: Math.min(100, Math.round(committed / x.gb.targetPacks * 100)), myPacks: mine?.packs ?? 0, hoursLeft: Math.max(0, Math.round((new Date(x.gb.closesAt).getTime() - Date.now()) / 36e5)) };
      });
      return c.json({ groupBuys: out });
    });
    marketplaceRoutes.post("/marketplace/group-buys/:id/join", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const id = c.req.param("id");
      const body3 = z8.object({ packs: z8.number().int().min(0).max(500) }).safeParse(await c.req.json());
      if (!body3.success) return c.json({ error: "Nombre de colis invalide" }, 400);
      const [gb] = await db.select().from(groupBuys).where(eq18(groupBuys.id, id));
      if (!gb || gb.status !== "ouvert" || new Date(gb.closesAt) < /* @__PURE__ */ new Date()) return c.json({ error: "Achat group\xE9 ferm\xE9" }, 400);
      if (body3.data.packs === 0) {
        await db.delete(groupBuyParticipations).where(and16(eq18(groupBuyParticipations.groupBuyId, id), eq18(groupBuyParticipations.restaurantId, rid)));
      } else await db.insert(groupBuyParticipations).values({ groupBuyId: id, restaurantId: rid, packs: body3.data.packs }).onConflictDoUpdate({ target: [groupBuyParticipations.groupBuyId, groupBuyParticipations.restaurantId], set: { packs: body3.data.packs } });
      const [{ total }] = await db.select({ total: sql12`coalesce(sum(${groupBuyParticipations.packs}),0)` }).from(groupBuyParticipations).where(eq18(groupBuyParticipations.groupBuyId, id));
      if (n6(total) >= gb.targetPacks && gb.status === "ouvert") await db.update(groupBuys).set({ status: "atteint" }).where(eq18(groupBuys.id, id));
      return c.json({ ok: true, myPacks: body3.data.packs, committedPacks: n6(total), reached: n6(total) >= gb.targetPacks });
    });
    marketplaceRoutes.get("/marketplace/my-orders", async (c) => {
      const rid = c.get("restaurantId");
      const db = await getDb();
      const rows = await db.select({ order: orders, vendorName: vendors.name }).from(orders).innerJoin(vendors, eq18(vendors.id, orders.vendorId)).where(eq18(orders.restaurantId, rid)).orderBy(desc6(orders.createdAt)).limit(30);
      return c.json({ orders: rows.map((r) => ({ ...r.order, vendorName: r.vendorName })) });
    });
  }
});

// apps/api/src/jobs/daily.ts
import { and as and17, desc as desc7, eq as eq19, gte as gte7, inArray as inArray8, sql as sql13 } from "drizzle-orm";
async function buildDigestForRestaurant(rid, opts = {}) {
  const db = await getDb();
  const now = opts.now ?? /* @__PURE__ */ new Date();
  const ctx = await loadContext(rid);
  const statusOf = new Map(ctx.stocks.map((s) => {
    const f = ctx.productForecasts.find((x) => x.productId === s.productId);
    return [s.productId, stockStatus({ ...s, avgDailyUse: f?.avgDailyNeed ?? 0 })];
  }));
  const urgent = ctx.productForecasts.filter((f) => f.recommendedOrder > 0 && (f.stockoutDay !== null || f.daysOfStockLeft !== null && f.daysOfStockLeft <= 3 || statusOf.get(f.productId) === "critique")).sort((a, b) => (a.daysOfStockLeft ?? 99) - (b.daysOfStockLeft ?? 99)).map((f) => ({ productName: f.productName, unit: f.unit, quantity: f.currentStock, daysLeft: f.daysOfStockLeft, stockoutDay: f.stockoutDay, recommendedOrder: f.recommendedOrder }));
  const needs = ctx.productForecasts.filter((f) => f.recommendedOrder > 0).map((f) => {
    const s = ctx.stocks.find((x) => x.productId === f.productId);
    return { productId: f.productId, productName: f.productName, unit: f.unit, neededQty: f.recommendedOrder, daysOfStockLeft: f.daysOfStockLeft, preferredSupplierId: s.preferredSupplierId };
  });
  const cart = needs.length ? buildSmartCart(needs, ctx.offers) : null;
  const since = new Date(now.getTime() - 36 * 36e5);
  const recentAlerts = await db.select().from(alerts).where(and17(eq19(alerts.restaurantId, rid), eq19(alerts.isRead, false), gte7(alerts.createdAt, since))).orderBy(desc7(alerts.createdAt)).limit(50);
  const [disc] = await db.select({ count: sql13`count(*)`, value: sql13`coalesce(sum(greatest(${deliveryDiscrepancies.orderedQty} - ${deliveryDiscrepancies.receivedQty}, 0) * ${orderLines.unitPriceEur}), 0)` }).from(deliveryDiscrepancies).innerJoin(deliveries, eq19(deliveries.id, deliveryDiscrepancies.deliveryId)).innerJoin(orderLines, eq19(orderLines.id, deliveryDiscrepancies.orderLineId)).where(and17(eq19(deliveries.restaurantId, rid), eq19(deliveryDiscrepancies.resolved, false)));
  const pending = await db.select({ reference: orders.reference, supplierName: suppliers.name, status: orders.status, expectedAt: orders.expectedAt }).from(orders).innerJoin(suppliers, eq19(suppliers.id, orders.supplierId)).where(and17(eq19(orders.restaurantId, rid), inArray8(orders.status, ["envoyee", "confirmee"]))).orderBy(orders.expectedAt).limit(10);
  const yesterday = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
  const [ys] = await db.select({ p: sql13`coalesce(sum(${sales.portions}), 0)`, c: sql13`count(*)` }).from(sales).where(and17(eq19(sales.restaurantId, rid), eq19(sales.day, yesterday)));
  const startMonth = new Date(now);
  startMonth.setDate(1);
  startMonth.setHours(0, 0, 0, 0);
  const d30 = new Date(now.getTime() - 30 * 864e5).toISOString(), d60 = new Date(now.getTime() - 60 * 864e5).toISOString();
  const [sp] = await db.select({
    thisMonth: sql13`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${startMonth.toISOString()}),0)`,
    last30: sql13`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${d30}),0)`,
    prev30: sql13`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${d60} and ${orders.createdAt} < ${d30}),0)`
  }).from(orders).where(and17(eq19(orders.restaurantId, rid), sql13`${orders.status} <> 'annulee'`));
  const evolutionPct = n7(sp.prev30) > 0 ? Math.round((n7(sp.last30) - n7(sp.prev30)) / n7(sp.prev30) * 1e3) / 10 : null;
  const statuses = [...statusOf.values()];
  const input = {
    restaurantName: ctx.restaurant.name,
    firstName: "chef",
    date: now,
    appUrl: APP_URL2(),
    stock: { critique: statuses.filter((s) => s === "critique").length, bas: statuses.filter((s) => s === "bas").length, ok: statuses.filter((s) => s === "ok").length, urgent },
    cart: cart ? { total: cart.total, saving: cart.saving, supplierCount: cart.suppliers.length, lineCount: cart.suppliers.reduce((a, s) => a + s.lines.length, 0) } : null,
    autoReorder: opts.autoReorderPrepared ?? [],
    priceAlerts: recentAlerts.filter((a) => a.kind === "hausse_prix").map((a) => ({ title: a.title, message: a.message })),
    opportunities: recentAlerts.filter((a) => a.kind === "opportunite").map((a) => ({ title: a.title, message: a.message })),
    discrepancies: { count: n7(disc.count), openValue: Math.round(n7(disc.value) * 100) / 100 },
    pendingOrders: pending,
    salesYesterday: n7(ys.c) > 0 ? n7(ys.p) : null,
    spend: { thisMonth: n7(sp.thisMonth), evolutionPct }
  };
  return { input, ctx };
}
async function recipientsFor(rid, settingsRecipients) {
  if (settingsRecipients?.length) return settingsRecipients.map((e) => ({ email: e, firstName: "chef" }));
  const db = await getDb();
  const rows = await db.select({ email: users.email, fullName: users.fullName, role: restaurantMembers.role }).from(restaurantMembers).innerJoin(users, eq19(users.id, restaurantMembers.userId)).where(eq19(restaurantMembers.restaurantId, rid));
  return rows.filter((r) => r.role !== "staff").map((r) => ({ email: r.email, firstName: r.fullName.split(" ")[0] || "chef" }));
}
async function runDailyForRestaurant(rid, opts = {}) {
  const db = await getDb();
  const now = opts.now ?? /* @__PURE__ */ new Date();
  const [r] = await db.select().from(restaurants).where(eq19(restaurants.id, rid));
  const base = { restaurantId: rid, name: r.name, alerts: 0, autoReorder: 0, digest: "skipped_disabled", recipients: [] };
  try {
    const { inserted } = await refreshAlerts(rid);
    base.alerts = inserted;
    let prepared = [];
    if ((r.settings?.autoReorderEnabled ?? true) && !opts.dryRun) {
      const res = await runAutoReorder(rid, null);
      prepared = res.prepared.map((p) => ({ productName: p.productName, supplierName: p.supplierName, total: p.total, reference: p.reference }));
      base.autoReorder = prepared.length;
    }
    if (!opts.force && r.settings?.dailyDigestEnabled === false) return base;
    if (!opts.force && r.settings?.closedWeekdays?.includes(now.getDay())) return { ...base, digest: "skipped_closed" };
    const recipients = await recipientsFor(rid, r.settings?.digestRecipients);
    if (!recipients.length) return { ...base, digest: "skipped_no_recipient" };
    const { input } = await buildDigestForRestaurant(rid, { autoReorderPrepared: prepared, now });
    let preview;
    let transport = "";
    for (const rcpt of recipients) {
      const digest = buildDigest({ ...input, firstName: rcpt.firstName });
      preview ??= digest;
      if (opts.dryRun) continue;
      const res = await sendMail({ to: rcpt.email, subject: digest.subject, text: digest.text, html: digest.html, tags: { type: "daily_digest", restaurant: rid } });
      transport = res.transport;
      if (!res.ok) throw new Error(res.error);
    }
    return { ...base, digest: "sent", recipients: recipients.map((x) => x.email), transport: opts.dryRun ? "dry-run" : transport, preview };
  } catch (e) {
    return { ...base, digest: "error", error: e.message };
  }
}
async function runDailyForAll(opts = {}) {
  const db = await getDb();
  const all = await db.select({ id: restaurants.id }).from(restaurants);
  const results = [];
  const startedAt = /* @__PURE__ */ new Date();
  for (const r of all) {
    const { preview: _p, ...res } = await runDailyForRestaurant(r.id, opts);
    results.push(res);
  }
  const errors2 = results.filter((r) => r.digest === "error");
  const summary = { ranAt: (opts.now ?? /* @__PURE__ */ new Date()).toISOString(), dryRun: !!opts.dryRun, count: results.length, sent: results.filter((r) => r.digest === "sent").length, errors: errors2.length, results };
  let billing = {};
  try {
    const now = opts.now ?? /* @__PURE__ */ new Date();
    const sw = await sweepTrials(now);
    if (!opts.dryRun) for (const r of sw.reminders) {
      const recips = await recipientsFor(r.id);
      for (const { email: to } of recips) await sendMail({ to, subject: r.daysLeft === 1 ? `Dernier jour d'essai AFRISUPPLY pour ${r.name}` : `Plus que ${r.daysLeft} jours d'essai AFRISUPPLY`, text: `Bonjour,

Votre essai gratuit AFRISUPPLY pour ${r.name} se termine dans ${r.daysLeft} jour(s). Pour garder votre stock, vos fournisseurs et vos alertes, choisissez une formule ici : ${APP_URL2()}/app/abonnement

Besoin d'aide ? R\xE9pondez simplement \xE0 cet e-mail.

L'\xE9quipe AFRISUPPLY`, html: `<p>Bonjour,</p><p>Votre essai gratuit AFRISUPPLY pour <b>${r.name}</b> se termine dans <b>${r.daysLeft} jour(s)</b>.</p><p>Pour garder votre stock, vos fournisseurs et vos alertes : <a href="${APP_URL2()}/app/abonnement">choisir ma formule</a>.</p><p>Besoin d'aide ? R\xE9pondez simplement \xE0 cet e-mail.</p><p>L'\xE9quipe AFRISUPPLY</p>`, tags: { type: "trial-reminder" } });
    }
    billing = { trialsExpired: sw.expired.length, reminders: sw.reminders.length, enforced: billingEnforced() };
    if (now.getUTCDate() === 1) {
      const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
      const inv = await invoiceCommissions(prev.toISOString().slice(0, 7), { dryRun: opts.dryRun });
      billing.commissionInvoices = inv.invoices.length;
    }
  } catch (e) {
    billing = { error: String(e) };
    void captureException(e, { route: "/api/jobs/daily#billing" });
  }
  summary.billing = billing;
  try {
    const now = opts.now ?? /* @__PURE__ */ new Date();
    const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (now.getUTCDay() === 1 && admins.length && !opts.dryRun) {
      const rep = await buildWeeklyPilotReport(now);
      for (const to of admins) await sendMail({ to, subject: `\u{1F4CA} Pilotes AFRISUPPLY \u2014 ${rep.pilots} restaurants, semaine du ${now.toLocaleDateString("fr-FR")}`, text: rep.text, html: rep.html, tags: { type: "pilot-report" } });
      summary.pilotReport = rep.pilots;
    }
  } catch (e) {
    void captureException(e, { route: "/api/jobs/daily#pilots" });
  }
  const finishedAt = /* @__PURE__ */ new Date();
  if (!opts.dryRun) {
    try {
      await db.insert(jobRuns).values({ job: "daily", status: errors2.length === 0 ? "ok" : errors2.length === results.length ? "error" : "partial", startedAt, finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime(), summary: { ...summary, results: results.map((r) => ({ name: r.name, digest: r.digest, alerts: r.alerts, autoReorder: r.autoReorder, error: r.error })) }, error: errors2.map((e) => `${e.name}: ${e.error}`).join(" | ") || null });
    } catch (e) {
      console.error("[jobs] job_runs", e);
    }
  }
  for (const e of errors2) void captureException(new Error(`daily digest failed: ${e.error}`), { route: "/api/jobs/daily", restaurantId: e.restaurantId });
  try {
    if (!opts.dryRun) summary.recurring = (await runRecurringOrders(opts.now)).results.length;
  } catch (e) {
    await captureException(e, { route: "jobs/recurring" });
  }
  try {
    summary.reminders = opts.dryRun ? "skipped" : (await remindPendingVendorOrders({ now: opts.now })).reminded;
  } catch (e) {
    await captureException(e, { route: "jobs/reminders" });
  }
  return summary;
}
var n7, APP_URL2;
var init_daily = __esm({
  "apps/api/src/jobs/daily.ts"() {
    "use strict";
    init_src();
    init_ops();
    init_restaurant();
    init_intelligence();
    init_forecast();
    init_engines();
    init_digest();
    init_mailer();
    init_billing();
    init_billing2();
    init_pilots();
    init_reminders();
    init_marketplace();
    n7 = (v) => v === null || v === void 0 ? 0 : Number(v);
    APP_URL2 = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  }
});

// api/_src/index.ts
import { getRequestListener } from "@hono/node-server";

// apps/api/src/app.ts
import { Hono as Hono23 } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

// apps/api/src/routes/auth.ts
init_src();
init_auth();
init_security();
import { Hono } from "hono";
import { z } from "zod";
import { and as and5, eq as eq6, isNull as isNull3, gt } from "drizzle-orm";
import { createHash as createHash2 } from "node:crypto";
import { setCookie, deleteCookie } from "hono/cookie";

// apps/api/src/lib/reset-link.ts
init_src();
import { and as and4, eq as eq5, isNull as isNull2 } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
var hashResetToken = (t) => createHash("sha256").update(t).digest("hex");
async function issuePasswordLink(userId, opts = {}) {
  const db = await getDb();
  const ttlMinutes = opts.ttlMinutes ?? Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 60);
  await db.update(passwordResets).set({ usedAt: /* @__PURE__ */ new Date() }).where(and4(eq5(passwordResets.userId, userId), isNull2(passwordResets.usedAt)));
  const token = randomBytes(32).toString("base64url");
  await db.insert(passwordResets).values({
    userId,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + ttlMinutes * 6e4),
    requestedIp: opts.requestedIp ?? null
  });
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return { token, link: `${appUrl}/${opts.path ?? "reinitialiser"}?token=${token}`, expiryMinutes: ttlMinutes };
}

// apps/api/src/routes/auth.ts
init_mailer();
init_ops();
var slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
var cookieOpts = { httpOnly: true, sameSite: "Lax", path: "/", maxAge: tokenTtlSeconds(), secure: process.env.NODE_ENV === "production" };
var RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 60);
var hashResetToken2 = (t) => createHash2("sha256").update(t).digest("hex");
var authRoutes = new Hono();
authRoutes.post("/register", async (c) => {
  const body3 = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    fullName: z.string().min(2),
    restaurantName: z.string().min(2),
    city: z.string().optional(),
    coversPerDay: z.number().int().positive().optional(),
    inviteCode: z.string().max(20).optional()
  }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
  const d = body3.data;
  const db = await getDb();
  const weak = passwordProblem(d.password);
  if (weak) return c.json({ error: weak, code: "weak_password" }, 400);
  const dup = await db.select({ id: users.id }).from(users).where(eq6(users.email, d.email.toLowerCase())).limit(1);
  if (dup.length) return c.json({ error: "Un compte existe d\xE9j\xE0 avec cet e-mail" }, 409);
  const [user] = await db.insert(users).values({ email: d.email.toLowerCase(), passwordHash: await hashPassword(d.password), fullName: d.fullName, lastLoginAt: /* @__PURE__ */ new Date() }).returning();
  const slug = `${slugify(d.restaurantName)}-${user.id.slice(0, 6)}`;
  const trialEndsAt = new Date(Date.now() + 30 * 864e5);
  const code = d.inviteCode?.toUpperCase().trim();
  const [lead] = code ? await db.select().from(leads).where(eq6(leads.inviteCode, code)) : [];
  const founder = !!lead && !lead.restaurantId;
  const [restaurant] = await db.insert(restaurants).values({ name: d.restaurantName, slug, city: d.city, coversPerDay: d.coversPerDay, plan: "trial", trialEndsAt, founder, inviteCode: founder ? code : null }).returning();
  if (founder) await db.update(leads).set({ restaurantId: restaurant.id, status: "client" }).where(eq6(leads.id, lead.id));
  await db.insert(restaurantMembers).values({ restaurantId: restaurant.id, userId: user.id, role: "owner" });
  const token = await signToken({ id: user.id, email: user.email, fullName: user.fullName, tokenVersion: user.tokenVersion ?? 0 });
  setCookie(c, "afs_token", token, cookieOpts);
  return c.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName }, restaurant }, 201);
});
authRoutes.post("/login", async (c) => {
  const body3 = z.object({ email: z.string().email(), password: z.string() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq6(users.email, body3.data.email.toLowerCase())).limit(1);
  if (!user || !await verifyPassword(body3.data.password, user.passwordHash)) {
    void audit("login.failed", { actorEmail: body3.data.email.toLowerCase(), meta: { ip: c.req.header("x-forwarded-for") } });
    return c.json({ error: "E-mail ou mot de passe incorrect" }, 401);
  }
  await db.update(users).set({ lastLoginAt: /* @__PURE__ */ new Date() }).where(eq6(users.id, user.id));
  const token = await signToken({ id: user.id, email: user.email, fullName: user.fullName, tokenVersion: user.tokenVersion ?? 0 });
  setCookie(c, "afs_token", token, cookieOpts);
  return c.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName } });
});
authRoutes.post("/logout", (c) => {
  deleteCookie(c, "afs_token", { path: "/" });
  return c.json({ ok: true });
});
authRoutes.get("/password-policy", (c) => c.json({
  minLength: PASSWORD_MIN_LENGTH,
  hint: `Au moins ${PASSWORD_MIN_LENGTH} caract\xE8res, et pas un mot de passe courant (par exemple trois mots qui n\u2019ont rien \xE0 voir entre eux).`
}));
authRoutes.post("/forgot-password", async (c) => {
  const body3 = z.object({ email: z.string().email() }).safeParse(await c.req.json().catch(() => ({})));
  const generic = { ok: true, message: "Si un compte existe avec cette adresse, un lien de r\xE9initialisation vient d\u2019\xEAtre envoy\xE9 (valable 1 heure)." };
  if (!body3.success) return c.json(generic);
  const db = await getDb();
  const email = body3.data.email.toLowerCase();
  const [user] = await db.select().from(users).where(eq6(users.email, email)).limit(1);
  if (!user) {
    void audit("password.forgot.unknown", { actorEmail: email, meta: { ip: c.req.header("x-forwarded-for") } });
    return c.json(generic);
  }
  const { link, expiryMinutes: RESET_TTL } = await issuePasswordLink(user.id, { requestedIp: c.req.header("x-forwarded-for") ?? null });
  const firstName = user.fullName.split(" ")[0] || "chef";
  const res = await sendMail({
    to: user.email,
    subject: "AFRISUPPLY \u2014 r\xE9initialiser votre mot de passe",
    text: `Bonjour ${firstName},

Vous avez demand\xE9 \xE0 r\xE9initialiser votre mot de passe AFRISUPPLY.

Lien (valable ${RESET_TTL} minutes) : ${link}

Si vous n'\xEAtes pas \xE0 l'origine de cette demande, ignorez ce message : votre mot de passe reste inchang\xE9.`,
    html: `<p>Bonjour ${firstName},</p><p>Vous avez demand\xE9 \xE0 r\xE9initialiser votre mot de passe AFRISUPPLY.</p><p><a href="${link}">Choisir un nouveau mot de passe</a> (lien valable ${RESET_TTL} minutes).</p><p>Si vous n'\xEAtes pas \xE0 l'origine de cette demande, ignorez ce message : votre mot de passe reste inchang\xE9.</p>`,
    tags: { type: "password_reset" }
  });
  void audit("password.forgot", { actorEmail: email, target: user.id, meta: { transport: res.transport } });
  const devLink = !process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production";
  return c.json({ ...generic, ...devLink ? { devLink: link } : {} });
});
authRoutes.post("/reset-password", async (c) => {
  const body3 = z.object({ token: z.string().min(10), password: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body3.success) return c.json({ error: "Lien incomplet : demandez un nouveau lien de r\xE9initialisation.", code: "reset_invalid" }, 400);
  const weak = passwordProblem(body3.data.password);
  if (weak) return c.json({ error: weak, code: "weak_password" }, 400);
  const db = await getDb();
  const [row] = await db.select().from(passwordResets).where(and5(eq6(passwordResets.tokenHash, hashResetToken2(body3.data.token)), isNull3(passwordResets.usedAt), gt(passwordResets.expiresAt, /* @__PURE__ */ new Date()))).limit(1);
  if (!row) return c.json({ error: "Ce lien n\u2019est plus valable (expir\xE9 ou d\xE9j\xE0 utilis\xE9). Demandez-en un nouveau.", code: "reset_invalid" }, 400);
  const [user] = await db.select().from(users).where(eq6(users.id, row.userId)).limit(1);
  if (!user) return c.json({ error: "Compte introuvable", code: "reset_invalid" }, 400);
  await db.update(users).set({ passwordHash: await hashPassword(body3.data.password), tokenVersion: (user.tokenVersion ?? 0) + 1 }).where(eq6(users.id, user.id));
  await db.update(passwordResets).set({ usedAt: /* @__PURE__ */ new Date() }).where(eq6(passwordResets.userId, user.id));
  void audit("password.reset", { actorEmail: user.email, target: user.id, meta: { ip: c.req.header("x-forwarded-for") } });
  deleteCookie(c, "afs_token", { path: "/" });
  return c.json({ ok: true, message: "Mot de passe modifi\xE9. Toutes les sessions ouvertes ont \xE9t\xE9 d\xE9connect\xE9es : connectez-vous avec votre nouveau mot de passe." });
});
authRoutes.post("/password", requireAuth, async (c) => {
  const body3 = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body3.success) return c.json({ error: "Mot de passe actuel et nouveau mot de passe requis." }, 400);
  const db = await getDb();
  const me = c.get("user");
  const [user] = await db.select().from(users).where(eq6(users.id, me.id)).limit(1);
  if (!user || !await verifyPassword(body3.data.currentPassword, user.passwordHash)) return c.json({ error: "Mot de passe actuel incorrect." }, 401);
  const weak = passwordProblem(body3.data.newPassword);
  if (weak) return c.json({ error: weak, code: "weak_password" }, 400);
  if (body3.data.currentPassword === body3.data.newPassword) return c.json({ error: "Le nouveau mot de passe doit \xEAtre diff\xE9rent de l\u2019ancien.", code: "weak_password" }, 400);
  const tokenVersion = (user.tokenVersion ?? 0) + 1;
  await db.update(users).set({ passwordHash: await hashPassword(body3.data.newPassword), tokenVersion }).where(eq6(users.id, user.id));
  const token = await signToken({ id: user.id, email: user.email, fullName: user.fullName }, tokenVersion);
  setCookie(c, "afs_token", token, cookieOpts);
  void audit("password.change", { actorEmail: user.email, target: user.id });
  return c.json({ ok: true, token, message: "Mot de passe modifi\xE9. Vos autres appareils ont \xE9t\xE9 d\xE9connect\xE9s." });
});
authRoutes.post("/logout-all", requireAuth, async (c) => {
  const db = await getDb();
  const me = c.get("user");
  const [user] = await db.select().from(users).where(eq6(users.id, me.id)).limit(1);
  if (!user) return c.json({ error: "Utilisateur inconnu" }, 401);
  await db.update(users).set({ tokenVersion: (user.tokenVersion ?? 0) + 1 }).where(eq6(users.id, user.id));
  deleteCookie(c, "afs_token", { path: "/" });
  void audit("session.logout_all", { actorEmail: user.email, target: user.id });
  return c.json({ ok: true, message: "Toutes vos sessions ont \xE9t\xE9 ferm\xE9es. Reconnectez-vous." });
});
authRoutes.get("/me", requireAuth, async (c) => {
  const db = await getDb();
  const user = c.get("user");
  const rows = await db.select({ restaurant: restaurants, role: restaurantMembers.role }).from(restaurantMembers).innerJoin(restaurants, eq6(restaurants.id, restaurantMembers.restaurantId)).where(eq6(restaurantMembers.userId, user.id));
  const isAdmin8 = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(user.email.toLowerCase());
  return c.json({ user: { ...user, isAdmin: isAdmin8 }, restaurants: rows.map((r) => ({ ...r.restaurant, role: r.role })) });
});

// apps/api/src/app.ts
init_restaurant();

// apps/api/src/routes/catalog.ts
init_src();
init_data();
init_auth();
import { Hono as Hono3 } from "hono";
import { z as z3 } from "zod";
import { and as and7, eq as eq9, isNull as isNull4, sql as sql5, inArray as inArray2 } from "drizzle-orm";

// apps/api/src/lib/csv.ts
function parseCsv(text2) {
  const src = text2.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/)[0] ?? "";
  const sep = [";", ",", "	"].map((s) => [s, (firstLine.match(new RegExp(`\\${s}`, "g")) ?? []).length]).sort((a, b) => b[1] - a[1])[0][0];
  const records = [];
  let cur = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) {
      cur.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      cur.push(field);
      field = "";
      if (cur.some((c) => c.trim() !== "")) records.push(cur);
      cur = [];
    } else field += ch;
  }
  cur.push(field);
  if (cur.some((c) => c.trim() !== "")) records.push(cur);
  if (!records.length) return { headers: [], rows: [] };
  const norm2 = (h) => h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const headers = records[0].map(norm2);
  const rows = records.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
  return { headers, rows };
}
var COLUMN_ALIASES = {
  supplier: ["fournisseur", "supplier", "nom_fournisseur", "grossiste"],
  product: ["produit", "product", "article", "designation", "libelle", "nom_produit"],
  pack: ["conditionnement", "pack", "colis", "format", "unite_vente", "packaging"],
  packQty: ["quantite", "qte", "quantite_par_colis", "contenance", "poids", "pack_qty", "qty"],
  price: ["prix", "prix_colis", "prix_ht", "price", "tarif", "prix_unitaire_colis"],
  unitPrice: ["prix_kg", "prix_au_kg", "prix_litre", "prix_unite", "unit_price", "prix_par_unite"],
  phone: ["telephone", "tel", "phone", "portable", "mobile"],
  whatsapp: ["whatsapp", "wa"],
  email: ["email", "mail", "e_mail", "courriel"],
  city: ["ville", "city", "localite"],
  leadTime: ["delai", "delai_h", "delai_livraison", "lead_time", "delai_jours"],
  minOrder: ["minimum", "minimum_commande", "min_order", "franco"],
  deliveryFee: ["frais_livraison", "livraison", "delivery_fee", "port"],
  category: ["categorie", "category", "rayon", "famille"],
  unit: ["unite", "unit", "unite_base"]
};
function pick(row, key) {
  for (const a of COLUMN_ALIASES[key]) if (row[a] !== void 0 && row[a] !== "") return row[a];
  return "";
}
var toNumber = (s) => {
  const clean = s.replace(/[€\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n15 = Number(clean);
  return Number.isFinite(n15) && clean !== "" ? n15 : null;
};
function parsePack(label) {
  const s = label.toLowerCase().replace(",", ".");
  const mult = s.match(/(\d+)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(kg|g|l|cl|ml)/);
  if (mult) {
    const n15 = Number(mult[1]);
    const q2 = Number(mult[2]);
    return convert(n15 * q2, mult[3]);
  }
  const single = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|cl|ml)\b/);
  if (single) return convert(Number(single[1]), single[2]);
  const pieces = s.match(/(\d+)\s*(pi[eè]ces?|pcs|unit[eé]s?|bouteilles?|canettes?|cubes?|sachets?|bo[iî]tes?|feuilles?|pots?|gobelets?|sacs?|barquettes?)/);
  if (pieces) return { qty: Number(pieces[1]), unit: "piece" };
  const bare = s.match(/^(?:carton|pack|lot|colis|bo[iî]te)\s*(?:de\s*)?(\d+)$/);
  if (bare) return { qty: Number(bare[1]), unit: "piece" };
  return null;
}
function convert(q2, u) {
  switch (u) {
    case "g":
      return { qty: q2 / 1e3, unit: "kg" };
    case "kg":
      return { qty: q2, unit: "kg" };
    case "ml":
      return { qty: q2 / 1e3, unit: "L" };
    case "cl":
      return { qty: q2 / 100, unit: "L" };
    default:
      return { qty: q2, unit: "L" };
  }
}

// apps/api/src/routes/catalog.ts
var catalogRoutes = new Hono3();
catalogRoutes.use("*", requireAuth, requireRestaurant);
var n2 = (v) => v === null || v === void 0 ? 0 : Number(v);
async function ensureReference() {
  const db = await getDb();
  const existing = await db.select({ id: products.id, name: products.name }).from(products).where(isNull4(products.restaurantId));
  const byName = new Map(existing.map((p) => [p.name, p.id]));
  const missing = REFERENCE_PRODUCTS.filter((p) => !byName.has(p.name));
  if (missing.length) {
    const ins = await db.insert(products).values(missing.map((p) => ({
      name: p.name,
      category: p.category,
      baseUnit: p.baseUnit,
      origin: p.origin,
      aliases: [...p.aliases, ...p.tags ?? []],
      shelfLifeDays: p.shelfLifeDays,
      seasonality: p.season?.length ? JSON.stringify(p.season) : null
    }))).returning({ id: products.id, name: products.name });
    ins.forEach((p) => byName.set(p.name, p.id));
  }
  return byName;
}
catalogRoutes.get("/catalog", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  await ensureReference();
  const q2 = normalize(c.req.query("q") ?? "");
  const cat = c.req.query("category");
  const rows = await db.select().from(products).where(sql5`${products.restaurantId} is null or ${products.restaurantId} = ${rid}`).orderBy(products.category, products.name);
  const [inv, offerCounts] = await Promise.all([
    db.select({ productId: inventoryItems.productId }).from(inventoryItems).where(eq9(inventoryItems.restaurantId, rid)),
    db.select({ productId: supplierOffers.productId, count: sql5`count(*)`, minPrice: sql5`min(${supplierOffers.packPriceEur} / ${supplierOffers.packQty})` }).from(supplierOffers).where(eq9(supplierOffers.restaurantId, rid)).groupBy(supplierOffers.productId)
  ]);
  const tracked = new Set(inv.map((i) => i.productId));
  const oc = new Map(offerCounts.map((o) => [o.productId, o]));
  const refByName = new Map(REFERENCE_PRODUCTS.map((p) => [p.name, p]));
  const out = rows.filter((p) => (!cat || p.category === cat) && (!q2 || normalize(p.name).includes(q2) || p.aliases.some((a) => normalize(a).includes(q2)))).map((p) => ({ ...p, packs: refByName.get(p.name)?.packs ?? [], tags: refByName.get(p.name)?.tags ?? [], tracked: tracked.has(p.id), offerCount: n2(oc.get(p.id)?.count), minUnitPrice: oc.get(p.id)?.minPrice ? n2(oc.get(p.id).minPrice) : null, isCustom: !!p.restaurantId }));
  return c.json({ products: out, total: rows.length });
});
catalogRoutes.post("/catalog/products", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body3 = z3.object({ name: z3.string().min(2), category: z3.enum(["feculents", "frais", "viandes_poissons", "epicerie", "boissons", "emballages"]), baseUnit: z3.enum(["kg", "g", "L", "mL", "piece", "botte", "sac", "carton"]), aliases: z3.array(z3.string()).default([]) }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
  const [row] = await db.insert(products).values({ ...body3.data, restaurantId: rid }).returning();
  return c.json(row, 201);
});
catalogRoutes.post("/catalog/track", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body3 = z3.object({ productIds: z3.array(z3.string().uuid()).min(1), criticalLevel: z3.number().nonnegative().optional() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const res = await db.insert(inventoryItems).values(body3.data.productIds.map((productId) => ({ restaurantId: rid, productId, quantity: "0", criticalLevel: (body3.data.criticalLevel ?? 0).toFixed(3) }))).onConflictDoNothing().returning({ id: inventoryItems.id });
  return c.json({ added: res.length });
});
catalogRoutes.get("/onboarding/templates", (c) => {
  const refByName = new Map(REFERENCE_PRODUCTS.map((p) => [p.name, p]));
  return c.json({
    templates: RECIPE_TEMPLATES.map((t) => ({ ...t, ingredientCount: t.ingredients.length, ingredients: t.ingredients.map(([product, qty3]) => ({ product, qty: qty3, unit: refByName.get(product)?.baseUnit ?? "kg", category: refByName.get(product)?.category })) })),
    regions: [...new Set(RECIPE_TEMPLATES.map((t) => t.region))]
  });
});
catalogRoutes.post("/onboarding/apply", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body3 = z3.object({ templates: z3.array(z3.string()).min(1), prices: z3.record(z3.number()).optional() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const byName = await ensureReference();
  const chosen = RECIPE_TEMPLATES.filter((t) => body3.data.templates.includes(t.name));
  if (!chosen.length) return c.json({ error: "Aucune recette reconnue" }, 400);
  const existing = await db.select({ name: recipes.name }).from(recipes).where(eq9(recipes.restaurantId, rid));
  const have = new Set(existing.map((r) => r.name));
  let createdRecipes = 0;
  const productIds = /* @__PURE__ */ new Set();
  for (const t of chosen) {
    for (const [p] of t.ingredients) {
      const id = byName.get(p);
      if (id) productIds.add(id);
    }
    if (have.has(t.name)) continue;
    const price = body3.data.prices?.[t.name] ?? t.suggestedPrice;
    const [r] = await db.insert(recipes).values({ restaurantId: rid, name: t.name, sellingPriceEur: price.toFixed(2) }).returning();
    await db.insert(recipeIngredients).values(t.ingredients.map(([p, q2]) => ({ recipeId: r.id, productId: byName.get(p), quantity: q2.toFixed(4) })));
    createdRecipes++;
  }
  const inv = await db.insert(inventoryItems).values([...productIds].map((productId) => ({ restaurantId: rid, productId, quantity: "0", criticalLevel: "0" }))).onConflictDoNothing().returning({ id: inventoryItems.id });
  return c.json({ createdRecipes, trackedProducts: inv.length, totalProducts: productIds.size });
});
var importSchema = z3.object({
  csv: z3.string().min(1),
  dryRun: z3.boolean().default(true),
  defaultSupplier: z3.string().optional()
  // si la colonne fournisseur est absente
});
catalogRoutes.post("/import/suppliers", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body3 = importSchema.safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const { headers, rows } = parseCsv(body3.data.csv);
  if (!rows.length) return c.json({ error: "Fichier vide ou illisible", headers }, 400);
  const byName = await ensureReference();
  const privateProducts = await db.select({ id: products.id, name: products.name, aliases: products.aliases }).from(products).where(eq9(products.restaurantId, rid));
  const findPrivate = (q2) => privateProducts.find((p) => normalize(p.name) === normalize(q2) || p.aliases.some((a) => normalize(a) === normalize(q2)));
  const previews = rows.map((row, i) => {
    const supplier = pick(row, "supplier") || body3.data.defaultSupplier || "";
    const product = pick(row, "product");
    const pack = pick(row, "pack") || "";
    let packQty = toNumber(pick(row, "packQty"));
    const price = toNumber(pick(row, "price"));
    const unitPrice = toNumber(pick(row, "unitPrice"));
    if (!packQty && pack) packQty = parsePack(pack)?.qty ?? null;
    if (!packQty && !unitPrice) packQty = 1;
    const packPrice = price ?? (unitPrice && packQty ? unitPrice * packQty : null);
    const ref = findReferenceProduct(product);
    const priv = findPrivate(product);
    const matched = priv?.name ?? ref?.name ?? null;
    const matchedId = priv?.id ?? (ref ? byName.get(ref.name) ?? null : null);
    const base = { line: i + 2, supplier, product, matched, matchedId, pack: pack || (packQty ? `${packQty}` : ""), packQty, packPrice, unitPrice: packPrice && packQty ? packPrice / packQty : unitPrice, status: "ok" };
    if (!supplier) return { ...base, status: "erreur", message: "Fournisseur manquant" };
    if (!product) return { ...base, status: "erreur", message: "Produit manquant" };
    if (!packPrice) return { ...base, status: "erreur", message: "Prix manquant ou illisible" };
    if (!matched) return { ...base, status: "nouveau_produit", message: "Produit inconnu : sera cr\xE9\xE9 comme produit priv\xE9" };
    return base;
  });
  const summary = { total: previews.length, ok: previews.filter((p) => p.status === "ok").length, newProducts: previews.filter((p) => p.status === "nouveau_produit").length, errors: previews.filter((p) => p.status === "erreur").length, suppliers: [...new Set(previews.filter((p) => p.supplier).map((p) => p.supplier))] };
  if (body3.data.dryRun) return c.json({ headers, summary, previews });
  const supRows = await db.select().from(suppliers).where(eq9(suppliers.restaurantId, rid));
  const supByName = new Map(supRows.map((s) => [normalize(s.name), s]));
  let createdSuppliers = 0, createdProducts = 0, upsertedOffers = 0;
  for (const p of previews) {
    if (p.status === "erreur") continue;
    const row = rows[p.line - 2];
    let sup = supByName.get(normalize(p.supplier));
    if (!sup) {
      const lead = toNumber(pick(row, "leadTime"));
      [sup] = await db.insert(suppliers).values({
        restaurantId: rid,
        name: p.supplier,
        phone: pick(row, "phone") || null,
        whatsapp: pick(row, "whatsapp") || null,
        email: pick(row, "email") || null,
        city: pick(row, "city") || null,
        leadTimeHours: lead ? lead <= 15 ? lead * 24 : lead : 48,
        minOrderEur: (toNumber(pick(row, "minOrder")) ?? 0).toFixed(2),
        deliveryFeeEur: (toNumber(pick(row, "deliveryFee")) ?? 0).toFixed(2),
        preferredChannel: pick(row, "whatsapp") ? "whatsapp" : pick(row, "email") ? "email" : "telephone"
      }).returning();
      supByName.set(normalize(sup.name), sup);
      createdSuppliers++;
    }
    let productId = p.matchedId;
    if (!productId) {
      const catRaw = normalize(pick(row, "category"));
      const cat = ["feculents", "frais", "viandes_poissons", "epicerie", "boissons", "emballages"].find((x) => catRaw.includes(x.split("_")[0])) ?? "epicerie";
      const unitRaw = normalize(pick(row, "unit"));
      const unit2 = unitRaw.startsWith("l") ? "L" : unitRaw.startsWith("p") || unitRaw.startsWith("u") ? "piece" : "kg";
      const [np] = await db.insert(products).values({ restaurantId: rid, name: p.product, category: cat, baseUnit: unit2 }).returning();
      productId = np.id;
      privateProducts.push({ id: np.id, name: np.name, aliases: [] });
      createdProducts++;
    }
    const packLabel = p.pack || "Unit\xE9";
    const [offer] = await db.insert(supplierOffers).values({ restaurantId: rid, supplierId: sup.id, productId, packLabel, packQty: (p.packQty ?? 1).toFixed(3), packPriceEur: p.packPrice.toFixed(2) }).onConflictDoUpdate({ target: [supplierOffers.supplierId, supplierOffers.productId, supplierOffers.packLabel], set: { packQty: (p.packQty ?? 1).toFixed(3), packPriceEur: p.packPrice.toFixed(2), lastSeenAt: /* @__PURE__ */ new Date(), inStock: true } }).returning();
    await db.insert(priceHistory).values({ restaurantId: rid, offerId: offer.id, unitPriceEur: (p.packPrice / (p.packQty ?? 1)).toFixed(4), source: "import" });
    upsertedOffers++;
  }
  const pids = [...new Set(previews.filter((p) => p.status !== "erreur").map((p) => p.matchedId).filter(Boolean))];
  const allIds = pids.length ? pids : [];
  const extra = privateProducts.filter((pp) => previews.some((p) => p.status === "nouveau_produit" && normalize(p.product) === normalize(pp.name))).map((pp) => pp.id);
  const toTrack = [.../* @__PURE__ */ new Set([...allIds, ...extra])];
  if (toTrack.length) await db.insert(inventoryItems).values(toTrack.map((productId) => ({ restaurantId: rid, productId, quantity: "0", criticalLevel: "0" }))).onConflictDoNothing();
  return c.json({ headers, summary, createdSuppliers, createdProducts, upsertedOffers });
});
catalogRoutes.get("/export/offers.csv", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const rows = await db.select({ supplier: suppliers.name, product: products.name, pack: supplierOffers.packLabel, qty: supplierOffers.packQty, price: supplierOffers.packPriceEur, unit: products.baseUnit, phone: suppliers.phone, whatsapp: suppliers.whatsapp, email: suppliers.email, city: suppliers.city, lead: suppliers.leadTimeHours, min: suppliers.minOrderEur, fee: suppliers.deliveryFeeEur }).from(supplierOffers).innerJoin(suppliers, eq9(suppliers.id, supplierOffers.supplierId)).innerJoin(products, eq9(products.id, supplierOffers.productId)).where(eq9(supplierOffers.restaurantId, rid)).orderBy(suppliers.name, products.name);
  const esc2 = (v) => {
    const s = v === null || v === void 0 ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = "fournisseur;produit;conditionnement;quantite;unite;prix;telephone;whatsapp;email;ville;delai_h;minimum;frais_livraison";
  const body3 = rows.map((r) => [r.supplier, r.product, r.pack, Number(r.qty), r.unit, Number(r.price).toFixed(2).replace(".", ","), r.phone, r.whatsapp, r.email, r.city, r.lead, Number(r.min), Number(r.fee)].map(esc2).join(";"));
  return new Response("\uFEFF" + [header, ...body3].join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="afrisupply-offres.csv"' } });
});
catalogRoutes.get("/import/template.csv", (c) => {
  const lines = [
    "fournisseur;produit;conditionnement;prix;telephone;whatsapp;ville;delai_h;minimum;frais_livraison",
    "Afro Distribution;Riz parfum\xE9;Sac 25 kg;42,00;02 40 00 11 22;06 00 11 22 33;Nantes;24;80;0",
    "Afro Distribution;Atti\xE9k\xE9;Carton 10 kg;34,00;;;;;;",
    "Primeurs du March\xE9;Tomate;Plateau 6 kg;9,60;02 40 33 44 55;;Rez\xE9;24;50;10",
    "Volailles LA;Poulet entier;Carton 10 kg;48,00;;;Ancenis;48;120;0"
  ];
  return new Response("\uFEFF" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="modele-import-afrisupply.csv"' } });
});

// apps/api/src/app.ts
init_intelligence();

// apps/api/src/routes/manage.ts
init_src();
init_mailer();
init_auth();
import { Hono as Hono11 } from "hono";
import { z as z11 } from "zod";
import { and as and20, eq as eq22, desc as desc10, gte as gte8, inArray as inArray10, sql as sql16 } from "drizzle-orm";

// apps/api/src/lib/messages.ts
var eur3 = (v) => `${v.toFixed(2).replace(".", ",")} \u20AC`;
var qty2 = (q2, u) => `${Number.isInteger(q2) ? q2 : q2.toFixed(1).replace(".", ",")} ${u}`;
var fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : null;
function waNumber(raw) {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0") && d.length === 10) d = "33" + d.slice(1);
  return d.length >= 8 ? d : null;
}
function buildOrderMessage(i) {
  const greeting = i.supplier.contactName ? `Bonjour ${i.supplier.contactName},` : "Bonjour,";
  const lines = i.lines.map((l) => `\u2022 ${l.productName} \u2014 ${l.packs} \xD7 ${l.packLabel ?? "unit\xE9"} (${qty2(l.quantity, l.unit)})`).join("\n");
  const when = fmtDate(i.expectedAt);
  const body3 = [
    greeting,
    "",
    `Merci de pr\xE9parer la commande ${i.reference} pour ${i.restaurantName} :`,
    "",
    lines,
    "",
    `Total estim\xE9 : ${eur3(i.total)}${i.deliveryFee ? ` (+ ${eur3(i.deliveryFee)} de livraison)` : ""}.`,
    when ? `Livraison souhait\xE9e : ${when}.` : null,
    i.notes ? `Remarque : ${i.notes}` : null,
    "",
    "Merci de confirmer la disponibilit\xE9 et le prix.",
    "",
    `${i.senderName}${i.senderPhone ? ` \u2014 ${i.senderPhone}` : ""}`,
    i.restaurantName
  ].filter((x) => x !== null).join("\n");
  const subject = `Commande ${i.reference} \u2014 ${i.restaurantName}`;
  const wa = waNumber(i.supplier.whatsapp);
  return {
    subject,
    body: body3,
    whatsappUrl: `https://wa.me/${wa ?? ""}?text=${encodeURIComponent(body3)}`,
    mailtoUrl: `mailto:${i.supplier.email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body3)}`,
    hasWhatsapp: !!wa,
    hasEmail: !!i.supplier.email
  };
}

// apps/api/src/routes/vendor.ts
init_src();
import { Hono as Hono10 } from "hono";
import { z as z10 } from "zod";
import { and as and19, desc as desc9, eq as eq21, inArray as inArray9, sql as sql15 } from "drizzle-orm";

// apps/api/src/lib/quick.ts
var normalize2 = (s) => s.replace(/(\d),(\d)/g, "$1.$2").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9. ]+/g, " ").replace(/\.(?!\d)/g, " ").replace(/\s+/g, " ").trim();
var KIND_WORDS = [
  [/\b(vendu|vente|ventes|servi|sorti|fait)\b/, "vente"],
  [/\b(reste|restant|il reste|stock|compte|comptage|inventaire|j ai|on a)\b/, "comptage"],
  [/\b(recu|reception|livre|livraison|arrive|rentre)\b/, "reception"],
  [/\b(perdu|perte|jete|casse|perime|poubelle|gaspille)\b/, "perte"]
];
var UNITS = { kg: "kg", kilo: "kg", kilos: "kg", g: "g", gr: "g", grammes: "g", l: "L", litre: "L", litres: "L", ml: "mL", cl: "cL", piece: "piece", pieces: "piece", pc: "piece", pcs: "piece", unite: "piece", unites: "piece", botte: "botte", bottes: "botte", sac: "sac", sacs: "sac", carton: "carton", cartons: "carton", bidon: "bidon", bidons: "bidon", portion: "portion", portions: "portion", assiette: "portion", assiettes: "portion", plat: "portion", plats: "portion" };
var NUM_WORDS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100 };
var STOP = /* @__PURE__ */ new Set(["de", "du", "des", "le", "la", "les", "et", "a", "au", "aux", "en", "pour", "ce", "ces", "soir", "midi", "aujourd", "hui", "hier", "matin", "avec", "sur"]);
function detectKind(text2, fallback = "vente") {
  const n15 = normalize2(text2);
  for (const [re, k] of KIND_WORDS) if (re.test(n15)) return k;
  return fallback;
}
function similarity(a, b) {
  const na = normalize2(a), nb = normalize2(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (nb.includes(na) || na.includes(nb)) return 0.92;
  const wa = na.split(" "), wb = nb.split(" ");
  if (wa.some((w) => w.length >= 4 && wb.some((x) => x.startsWith(w) || w.startsWith(x)))) return 0.85;
  const ph = (s) => s.slice(0, 4).replace(/p/g, "b").replace(/k|q/g, "c").replace(/[aeiouy]/g, "a");
  if (wa.some((w) => w.length >= 4 && wb.some((x) => x.length >= 4 && ph(w) === ph(x)))) return 0.7;
  const grams = (s) => {
    const g = /* @__PURE__ */ new Map();
    const t = ` ${s} `;
    for (let i = 0; i < t.length - 1; i++) {
      const k = t.slice(i, i + 2);
      g.set(k, (g.get(k) ?? 0) + 1);
    }
    return g;
  };
  const ga = grams(na), gb = grams(nb);
  let inter = 0, tot = 0;
  for (const [k, v] of ga) {
    tot += v;
    inter += Math.min(v, gb.get(k) ?? 0);
  }
  for (const v of gb.values()) tot += v;
  return tot ? 2 * inter / tot : 0;
}
function bestMatches(name, entities2, limit = 3) {
  return entities2.map((e) => ({ id: e.id, name: e.name, score: Math.max(similarity(name, e.name), ...(e.aliases ?? []).map((a) => similarity(name, a))) })).filter((m) => m.score >= 0.45).sort((a, b) => b.score - a.score).slice(0, limit);
}
function tokenize(text2) {
  let n15 = normalize2(text2);
  for (const [w, v] of Object.entries(NUM_WORDS)) n15 = n15.replace(new RegExp(`\\b${w}\\b`, "g"), String(v));
  n15 = n15.replace(/(\d)(kg|g|l|ml|cl)\b/g, "$1 $2");
  const out = [];
  const re = /(\d+(?:\.\d+)?)\s+([^\d]+?)(?=\s+\d|$)/g;
  let m;
  while (m = re.exec(n15)) {
    const qty3 = Number(m[1]);
    const words = m[2].trim().split(" ").filter((w) => w && !STOP.has(w));
    if (!words.length) continue;
    let unit2;
    if (UNITS[words[0]]) {
      unit2 = UNITS[words[0]];
      words.shift();
    }
    const label = words.filter((w) => !KIND_WORDS.some(([r]) => r.test(w))).join(" ").trim();
    if (label) out.push({ qty: qty3, unit: unit2, label, raw: m[0].trim() });
  }
  return out;
}
function parseQuick(text2, ctx, forceKind) {
  const kind = forceKind ?? detectKind(text2);
  const pool = kind === "vente" ? ctx.recipes : ctx.products;
  const lines = tokenize(text2).map((t) => {
    const cands = bestMatches(t.label, pool);
    const top = cands[0];
    const second = cands[1];
    const confident = !!top && (!second || top.score - second.score >= 0.15) && top.score >= 0.6;
    return { kind, raw: t.raw, qty: t.qty, unit: t.unit, match: confident ? top : null, candidates: cands };
  });
  return { kind, lines, unmatched: lines.filter((l) => !l.match).map((l) => l.raw) };
}
var INVOICE_PROMPT = `Tu lis une facture ou un bon de livraison de fournisseur alimentaire (grossiste africain, march\xE9, cash & carry) photographi\xE9 par un restaurateur.
R\xE9ponds UNIQUEMENT avec un JSON valide, sans texte autour, de la forme :
{"supplierName": string|null, "date": "AAAA-MM-JJ"|null, "total": number|null, "lines": [{"label": string, "qty": number, "unit": "kg"|"g"|"L"|"mL"|"piece"|"sac"|"carton"|"botte"|null, "unitPrice": number|null, "total": number|null}]}
R\xE8gles : une ligne par produit ; qty = quantit\xE9 livr\xE9e (si \xAB 2 x 25 kg \xBB, qty = 50 et unit = "kg") ; prix en euros TTC si visible ; ignore les lignes de transport, consigne, remise globale. Si un champ est illisible, mets null.`;
async function extractInvoiceFromImage(imageDataUrl) {
  if (!process.env.LLM_API_KEY) return { ok: false, error: "Lecture de facture indisponible : LLM_API_KEY non configur\xE9" };
  const base = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.LLM_VISION_MODEL ?? process.env.LLM_MODEL ?? "gpt-4o-mini";
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LLM_API_KEY}` },
      signal: AbortSignal.timeout(45e3),
      body: JSON.stringify({ model, temperature: 0, max_tokens: 1500, response_format: { type: "json_object" }, messages: [
        { role: "system", content: INVOICE_PROMPT },
        { role: "user", content: [{ type: "text", text: "Voici la facture." }, { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } }] }
      ] })
    });
    if (!res.ok) return { ok: false, error: `LLM HTTP ${res.status}` };
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, ""));
    parsed.lines = (parsed.lines ?? []).filter((l) => l && l.label && Number.isFinite(Number(l.qty))).map((l) => ({ ...l, qty: Number(l.qty) }));
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// apps/api/src/routes/vendor.ts
init_reference();
init_auth();
init_mailer();
init_sms();
init_reminders();

// apps/api/src/lib/cgv.ts
var VENDOR_CGV_VERSION = "1.0";

// apps/api/src/routes/vendor.ts
init_order_events();
init_src();
init_ops();

// apps/api/src/routes/prospects.ts
init_src();
init_auth();
init_ops();
init_mailer();
init_daily();
import { Hono as Hono9 } from "hono";
import { z as z9 } from "zod";
import { and as and18, desc as desc8, eq as eq20, ilike as ilike2, or as or2, sql as sql14 } from "drizzle-orm";
import { SignJWT as SignJWT2, jwtVerify as jwtVerify2 } from "jose";
var inviteSecret = () => new TextEncoder().encode(`invite:${process.env.JWT_SECRET ?? "dev-secret-change-me-in-production"}`);
async function signVendorInvite(v) {
  return new SignJWT2(v).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(inviteSecret());
}
async function readVendorInvite(token) {
  try {
    const { payload } = await jwtVerify2(token, inviteSecret());
    return payload;
  } catch {
    return null;
  }
}
var prospectPublicRoutes = new Hono9();
prospectPublicRoutes.get("/public/vendor-invite/:token", async (c) => {
  const inv = await readVendorInvite(c.req.param("token"));
  if (!inv) return c.json({ error: "Invitation invalide ou expir\xE9e" }, 404);
  const db = await getDb();
  const [p] = await db.select({ status: prospects.status }).from(prospects).where(eq20(prospects.id, inv.pid));
  return c.json({ invite: { ...inv, converted: p?.status === "converti" } });
});
var isAdmin3 = (email) => (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
var PROSPECT_STATUS = ["a_contacter", "contacte", "rdv", "interesse", "converti", "perdu"];
var body = z9.object({
  kind: z9.enum(["restaurant", "fournisseur"]),
  name: z9.string().min(2).max(120),
  address: z9.string().max(200).nullable().optional(),
  city: z9.string().max(80).nullable().optional(),
  phone: z9.string().max(30).nullable().optional(),
  email: z9.string().email().nullable().optional().or(z9.literal("")),
  contactName: z9.string().max(80).nullable().optional(),
  status: z9.enum(PROSPECT_STATUS).optional(),
  notes: z9.string().max(4e3).nullable().optional(),
  nextActionAt: z9.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
});
var prospectRoutes = new Hono9();
prospectRoutes.use("/admin/prospects", requireAuth);
prospectRoutes.use("/admin/prospects/*", requireAuth);
prospectRoutes.use("/admin/prospects", async (c, next) => {
  if (!isAdmin3(c.get("user").email)) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
  await next();
});
prospectRoutes.use("/admin/prospects/*", async (c, next) => {
  if (!isAdmin3(c.get("user").email)) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
  await next();
});
prospectRoutes.get("/admin/prospects", async (c) => {
  const db = await getDb();
  const kind = c.req.query("kind");
  const q2 = c.req.query("q")?.trim();
  const status = c.req.query("status");
  const where = and18(kind ? eq20(prospects.kind, kind) : void 0, status ? eq20(prospects.status, status) : void 0, q2 ? or2(ilike2(prospects.name, `%${q2}%`), ilike2(prospects.city, `%${q2}%`), ilike2(prospects.email, `%${q2}%`), ilike2(prospects.phone, `%${q2}%`), ilike2(prospects.contactName, `%${q2}%`)) : void 0);
  const rows = await db.select().from(prospects).where(where).orderBy(desc8(prospects.updatedAt)).limit(1e3);
  const counts = await db.select({ kind: prospects.kind, status: prospects.status, c: sql14`count(*)` }).from(prospects).groupBy(prospects.kind, prospects.status);
  return c.json({ prospects: rows, counts: counts.map((x) => ({ ...x, c: Number(x.c) })), statuses: PROSPECT_STATUS });
});
prospectRoutes.post("/admin/prospects", async (c) => {
  const d = body.parse(await c.req.json());
  const db = await getDb();
  const [row] = await db.insert(prospects).values({ ...d, email: d.email || null }).returning();
  await audit("prospect.create", { actorEmail: c.get("user").email, target: row.id, meta: { kind: d.kind, name: d.name } });
  return c.json({ prospect: row }, 201);
});
prospectRoutes.post("/admin/prospects/import", async (c) => {
  const { rows } = z9.object({ rows: z9.array(z9.record(z9.unknown())).max(500) }).parse(await c.req.json());
  const kindDefault = c.req.query("kind") ?? "restaurant";
  const db = await getDb();
  const rowSchema = body.partial({ kind: true });
  const valid = rows.map((r) => rowSchema.safeParse({ ...r, email: r.email || void 0 })).filter((p) => p.success).map((p) => ({ ...p.data, kind: p.data.kind ?? kindDefault, email: p.data.email || null }));
  if (!valid.length) return c.json({ imported: 0 });
  const ins = await db.insert(prospects).values(valid).returning({ id: prospects.id });
  return c.json({ imported: ins.length, ignored: rows.length - valid.length });
});
prospectRoutes.put("/admin/prospects/:id", async (c) => {
  const d = body.partial().parse(await c.req.json());
  const db = await getDb();
  const [row] = await db.update(prospects).set({ ...d, email: d.email === "" ? null : d.email, updatedAt: /* @__PURE__ */ new Date() }).where(eq20(prospects.id, c.req.param("id"))).returning();
  if (!row) return c.json({ error: "Introuvable" }, 404);
  return c.json({ prospect: row });
});
prospectRoutes.delete("/admin/prospects/:id", async (c) => {
  const db = await getDb();
  await db.delete(prospects).where(eq20(prospects.id, c.req.param("id")));
  return c.json({ ok: true });
});
prospectRoutes.post("/admin/prospects/:id/invite-vendor", async (c) => {
  const db = await getDb();
  const [p] = await db.select().from(prospects).where(eq20(prospects.id, c.req.param("id")));
  if (!p) return c.json({ error: "Introuvable" }, 404);
  if (p.kind !== "fournisseur") return c.json({ error: "R\xE9serv\xE9 aux prospects fournisseurs" }, 400);
  const body3 = z9.object({ email: z9.string().email().optional(), send: z9.boolean().default(true) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const email = body3.data.email ?? p.email ?? null;
  if (body3.data.email && body3.data.email !== p.email) await db.update(prospects).set({ email: body3.data.email, updatedAt: /* @__PURE__ */ new Date() }).where(eq20(prospects.id, p.id));
  const token = await signVendorInvite({ pid: p.id, name: p.name, city: p.city, phone: p.phone, email, contactName: p.contactName });
  const url = `${APP_URL2()}/fournisseur?invite=${token}`;
  const first = p.contactName ? `Bonjour ${p.contactName}` : "Bonjour";
  const text2 = `${first},

AFRISUPPLY est la marketplace des restaurants africains de France : ils y comparent les grossistes et commandent en un clic.

Votre fiche \xAB ${p.name} \xBB est d\xE9j\xE0 pr\xE9par\xE9e. Il vous suffit de cliquer, de cr\xE9er un mot de passe et de coller votre tarif (Excel, texte ou photo) : vous \xEAtes en ligne en 10 minutes, sans engagement, commission uniquement sur les ventes.

\u{1F449} ${url}

Le lien est valable 30 jours. R\xE9pondez \xE0 ce message pour toute question.

L'\xE9quipe AFRISUPPLY`;
  const whatsapp = `${first}, c'est AFRISUPPLY, la marketplace des restaurants africains. Votre fiche \xAB ${p.name} \xBB est pr\xEAte : cliquez, cr\xE9ez un mot de passe, collez votre tarif et vous \xEAtes en ligne en 10 min \u{1F449} ${url}`;
  let mail = { ok: false, error: "Pas d'e-mail" };
  if (email && body3.data.send) mail = await sendMail({ to: email, subject: `${p.name} : votre catalogue devant 200 restaurants africains \u2014 fiche d\xE9j\xE0 pr\xEAte`, text: text2, html: `<p>${text2.replace(/\n/g, "<br/>").replace(url, `<a href="${url}">${url}</a>`)}</p>`, tags: { type: "vendor-invite" } });
  await db.update(prospects).set({ status: p.status === "a_contacter" ? "contacte" : p.status, notes: `${p.notes ? p.notes + "\n" : ""}[${(/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR")}] Invitation fournisseur ${mail.ok ? "envoy\xE9e par e-mail" : "g\xE9n\xE9r\xE9e"}${email ? ` (${email})` : ""}`, updatedAt: /* @__PURE__ */ new Date() }).where(eq20(prospects.id, p.id));
  await audit("prospect.invite_vendor", { actorEmail: c.get("user").email, target: p.id, meta: { email, sent: mail.ok } });
  return c.json({ url, whatsapp, email, sent: mail.ok, mailError: mail.ok ? null : mail.error ?? null, message: mail.ok ? `Invitation envoy\xE9e \xE0 ${email}.` : "Lien g\xE9n\xE9r\xE9 : copiez-le ou envoyez le message WhatsApp." });
});

// apps/api/src/lib/pdf.ts
var Pdf = class {
  ops = [];
  pages = [];
  y = 800;
  w = 595;
  h = 842;
  margin = 40;
  esc(s) {
    return s.normalize("NFC").replace(/[\\()]/g, (m) => "\\" + m).replace(/[^\x20-\x7e\xa0-\xff€]/g, "?").replace(/€/g, "\x80");
  }
  text(s, x, size = 10, opts = {}) {
    const font = opts.bold ? "F2" : "F1";
    let xx = x;
    if (opts.align === "right") xx = x + (opts.width ?? 0) - this.width(s, size);
    this.ops.push(`BT /${font} ${size} Tf ${opts.color ?? "0 0 0"} rg ${xx.toFixed(1)} ${this.y.toFixed(1)} Td (${this.esc(s)}) Tj ET`);
  }
  width(s, size) {
    return s.length * size * 0.52;
  }
  line(x1, y1, x2, y2, gray = 0.8) {
    this.ops.push(`${gray} G 0.5 w ${x1} ${y1} m ${x2} ${y2} l S`);
  }
  rect(x, y, w, h, gray = 0.95) {
    this.ops.push(`${gray} g ${x} ${y} ${w} ${h} re f 0 g`);
  }
  down(n15) {
    this.y -= n15;
    if (this.y < 60) this.newPage();
  }
  get cursor() {
    return this.y;
  }
  set cursor(v) {
    this.y = v;
  }
  newPage() {
    this.pages.push(this.ops);
    this.ops = [];
    this.y = 800;
  }
  row(cols, size = 9) {
    for (const c of cols) this.text(c.text, c.x, size, { align: c.align, width: c.w, bold: c.bold });
  }
  build() {
    this.pages.push(this.ops);
    const objs = [];
    const add = (s) => {
      objs.push(s);
      return objs.length;
    };
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const pagesId = objs.length + 1 + this.pages.length * 2;
    const pageIds = [];
    for (const ops of this.pages) {
      const content = ops.join("\n");
      const cid = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>
stream
${content}
endstream`);
      pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this.w} ${this.h}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cid} 0 R >>`));
    }
    add(`<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
    const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    let out = "%PDF-1.4\n";
    const offs = [];
    objs.forEach((o, i) => {
      offs.push(Buffer.byteLength(out, "latin1"));
      out += `${i + 1} 0 obj
${o}
endobj
`;
    });
    const xref = Buffer.byteLength(out, "latin1");
    out += `xref
0 ${objs.length + 1}
0000000000 65535 f 
${offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer
<< /Size ${objs.length + 1} /Root ${cat} 0 R >>
startxref
${xref}
%%EOF`;
    return Buffer.from(out, "latin1");
  }
};
var eur8 = (v) => `${v.toFixed(2).replace(".", ",")} \u20AC`;
var fd = (d) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
function orderPdf(d) {
  const p = new Pdf();
  const m = p.margin;
  const W = p.w - 2 * m;
  p.rect(0, 812, p.w, 30, 0.93);
  p.cursor = 822;
  p.text("AFRISUPPLY", m, 14, { bold: true, color: "0.76 0.25 0.05" });
  p.text("Marketplace B2B des restaurants africains", m + 110, 9, { color: "0.4 0.4 0.4" });
  p.cursor = 780;
  p.text(d.kind === "bon_commande" ? "BON DE COMMANDE" : "BON DE LIVRAISON", m, 18, { bold: true });
  p.text(d.reference, m, 18, { bold: true, align: "right", width: W });
  p.down(16);
  p.text(`\xC9mis le ${fd(d.date)} \xB7 Statut : ${d.status}${d.expectedAt ? ` \xB7 Livraison pr\xE9vue : ${fd(d.expectedAt)}` : ""}`, m, 9, { color: "0.35 0.35 0.35" });
  p.down(26);
  const top = p.cursor;
  p.text("FOURNISSEUR", m, 8, { bold: true, color: "0.5 0.5 0.5" });
  p.text("CLIENT (RESTAURANT)", m + W / 2, 8, { bold: true, color: "0.5 0.5 0.5" });
  p.down(13);
  p.text(d.vendor.name, m, 11, { bold: true });
  p.text(d.restaurant.name, m + W / 2, 11, { bold: true });
  const vl = [d.vendor.city, d.vendor.phone, d.vendor.email].filter(Boolean);
  const rl = [d.restaurant.address, d.restaurant.city, d.restaurant.email].filter(Boolean);
  for (let i = 0; i < Math.max(vl.length, rl.length); i++) {
    p.down(12);
    if (vl[i]) p.text(vl[i], m, 9);
    if (rl[i]) p.text(rl[i], m + W / 2, 9);
  }
  p.cursor = Math.min(p.cursor, top - 60) - 22;
  const cols = [{ k: "prod", x: m, w: 200 }, { k: "pack", x: m + 205, w: 90 }, { k: "packs", x: m + 300, w: 40 }, { k: "qty", x: m + 345, w: 60 }, { k: "pu", x: m + 410, w: 50 }, { k: "tot", x: m + 465, w: 50 }];
  p.rect(m, p.cursor - 5, W, 16, 0.92);
  p.row([{ text: "Produit", x: cols[0].x, w: cols[0].w, bold: true }, { text: "Conditionnement", x: cols[1].x, w: cols[1].w, bold: true }, { text: "Colis", x: cols[2].x, w: cols[2].w, align: "right", bold: true }, { text: "Quantit\xE9", x: cols[3].x, w: cols[3].w, align: "right", bold: true }, { text: "P.U. HT", x: cols[4].x, w: cols[4].w, align: "right", bold: true }, { text: "Total HT", x: cols[5].x, w: cols[5].w, align: "right", bold: true }]);
  for (const l of d.lines) {
    p.down(16);
    p.row([{ text: l.productName.slice(0, 42), x: cols[0].x, w: cols[0].w }, { text: (l.packLabel ?? "").slice(0, 20), x: cols[1].x, w: cols[1].w }, { text: String(l.packs), x: cols[2].x, w: cols[2].w, align: "right" }, { text: `${Number.isInteger(l.quantity) ? l.quantity : l.quantity.toFixed(2)} ${l.unit}`, x: cols[3].x, w: cols[3].w, align: "right" }, { text: eur8(l.unitPriceEur), x: cols[4].x, w: cols[4].w, align: "right" }, { text: eur8(l.lineTotalEur), x: cols[5].x, w: cols[5].w, align: "right" }]);
    p.line(m, p.cursor - 5, m + W, p.cursor - 5, 0.9);
  }
  p.down(18);
  if (d.deliveryFeeEur) {
    p.text("Frais de livraison HT", m + 300, 9, { align: "right", width: 160 });
    p.text(eur8(d.deliveryFeeEur), cols[5].x, 9, { align: "right", width: cols[5].w });
    p.down(14);
  }
  p.text("TOTAL HT", m + 300, 11, { bold: true, align: "right", width: 160 });
  p.text(eur8(d.totalEur + d.deliveryFeeEur), cols[5].x, 11, { bold: true, align: "right", width: cols[5].w });
  p.down(14);
  p.text("TVA et facture \xE9tablies par le fournisseur. R\xE8glement directement au fournisseur selon ses conditions.", m, 8, { color: "0.4 0.4 0.4" });
  if (d.notes) {
    p.down(20);
    p.text("Notes : " + d.notes.slice(0, 180), m, 9);
  }
  if (d.kind === "bon_livraison") {
    p.down(40);
    p.text("R\xE9ception \u2014 Date : ____ / ____ / ________     Nom : ____________________     Signature et cachet :", m, 9);
    p.down(50);
    p.line(m, p.cursor, m + W, p.cursor, 0.7);
  }
  p.cursor = 30;
  p.text(`Document g\xE9n\xE9r\xE9 par AFRISUPPLY le ${fd(/* @__PURE__ */ new Date())} \u2014 ${d.reference}. AFRISUPPLY est un interm\xE9diaire technique : la vente est conclue entre le fournisseur et le restaurant.`, m, 7, { color: "0.5 0.5 0.5" });
  return p.build();
}

// apps/api/src/routes/vendor.ts
init_marketplace();
init_src();
init_src();
init_daily();

// apps/api/src/lib/catalog-import.ts
var UNIT = { kg: "kg", kilo: "kg", kilos: "kg", kgs: "kg", g: "g", gr: "g", l: "L", lt: "L", litre: "L", litres: "L", ml: "mL", cl: "cL", pc: "piece", pcs: "piece", piece: "piece", pieces: "piece", u: "piece", unite: "piece", unites: "piece", botte: "botte", bottes: "botte" };
var PACK_WORDS = /\b(sac|carton|bidon|pot|bocal|boite|bouteille|seau|caisse|colis|filet|barquette|paquet|sachet|plateau|palette|lot|pack|bte|btl|ctn)\b/;
function parseCatalogLine(rawIn) {
  const raw = rawIn.trim();
  if (!raw || /^(produit|designation|libelle|article|nom)\b/i.test(raw)) return null;
  const cols = raw.split(/\t|;|\|/).map((c) => c.trim()).filter(Boolean);
  if (cols.length >= 4 && isNum(cols[2]) && isNum(cols[3])) {
    const unit2 = guessUnit(cols[1]) ?? "kg";
    return { raw, label: cols[0], packLabel: cols[1], packQty: num2(cols[2]), packUnit: unit2, price: num2(cols[3]), inStock: !/non|0|faux|false|rupture/i.test(cols[4] ?? "oui") };
  }
  if (cols.length === 3 && isNum(cols[2])) {
    const p = parsePack2(cols[1]);
    if (p) return { raw, label: cols[0], packLabel: cols[1], packQty: p.qty, packUnit: p.unit, price: num2(cols[2]), inStock: true };
  }
  let n15 = normalize2(raw.replace(/€|eur|euros|ttc|ht/gi, " "));
  const priceM = n15.match(/(\d+(?:\.\d+)?)\s*$/);
  if (!priceM) return null;
  const price = Number(priceM[1]);
  n15 = n15.slice(0, priceM.index).trim();
  if (!(price > 0)) return null;
  let packQty = 0;
  let packUnit = "";
  let packLabel = "";
  const multi = n15.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|cl)?\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ml|cl)?/);
  if (multi) {
    const a = Number(multi[1]), b = Number(multi[3]);
    const u = UNIT[multi[2] ?? multi[4] ?? ""] ?? "piece";
    const per = multi[2] ? a : b;
    const count = multi[2] ? b : a;
    packQty = per * count;
    packUnit = u;
    packLabel = `${count} \xD7 ${per} ${u === "piece" ? "pi\xE8ce" : u}`.replace(/\.0+ /, " ");
    n15 = n15.replace(multi[0], " ");
  } else {
    const q2 = n15.match(/(\d+(?:\.\d+)?)\s*(kg|kilos?|kgs|g|gr|l|lt|litres?|ml|cl|pcs?|pieces?|unites?|u|bottes?)\b/);
    if (q2) {
      packQty = Number(q2[1]);
      packUnit = UNIT[q2[2]] ?? "kg";
      const pw = n15.match(PACK_WORDS);
      packLabel = `${pw ? cap(pw[1]) + " " : ""}${q2[1]} ${packUnit}`;
      n15 = n15.replace(q2[0], " ").replace(PACK_WORDS, " ");
    } else {
      const pw = n15.match(PACK_WORDS);
      const cnt = n15.match(/\bx?\s*(\d+)\s*$/);
      packQty = cnt ? Number(cnt[1]) : 1;
      packUnit = "piece";
      packLabel = pw ? cap(pw[1]) : packQty > 1 ? `Lot de ${packQty}` : "Pi\xE8ce";
      n15 = n15.replace(PACK_WORDS, " ").replace(/\bx?\s*\d+\s*$/, " ");
    }
  }
  if (packUnit === "g") {
    packQty = packQty / 1e3;
    packUnit = "kg";
  }
  if (packUnit === "mL") {
    packQty = packQty / 1e3;
    packUnit = "L";
  }
  if (packUnit === "cL") {
    packQty = packQty / 100;
    packUnit = "L";
  }
  const label = n15.replace(/\s+/g, " ").replace(/[-–:]+$/, "").trim();
  if (!label || packQty <= 0) return null;
  return { raw, label, packLabel: packLabel.trim(), packQty: Math.round(packQty * 1e3) / 1e3, packUnit, price, inStock: true };
}
var isNum = (s) => /^\d+([.,]\d+)?$/.test(s.replace(/\s|€/g, ""));
var num2 = (s) => Number(s.replace(/\s|€/g, "").replace(",", "."));
var cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function guessUnit(s) {
  const m = normalize2(s).match(/\b(kg|kilos?|g|gr|l|litres?|ml|cl|pcs?|pieces?|unites?)\b/);
  return m ? UNIT[m[1]] : void 0;
}
function parsePack2(s) {
  const m = normalize2(s).match(/(\d+(?:\.\d+)?)\s*(kg|kilos?|g|gr|l|litres?|ml|cl|pcs?|pieces?|unites?)\b/);
  if (!m) return null;
  let qty3 = Number(m[1]);
  let unit2 = UNIT[m[2]] ?? "kg";
  if (unit2 === "g") {
    qty3 /= 1e3;
    unit2 = "kg";
  }
  if (unit2 === "mL") {
    qty3 /= 1e3;
    unit2 = "L";
  }
  if (unit2 === "cL") {
    qty3 /= 100;
    unit2 = "L";
  }
  return { qty: qty3, unit: unit2 };
}
function parseCatalogText(text2) {
  return text2.split(/\r?\n/).map(parseCatalogLine).filter((l) => !!l);
}
function matchCatalogLines(lines, ref) {
  return lines.map((l) => {
    const words = normalize2(l.label).split(" ").filter((w) => w.length >= 2);
    const scored = ref.map((p) => {
      const nw = normalize2(p.name).split(" ");
      const aw = p.aliases.map((a) => normalize2(a));
      const inName = words.length && words.every((w) => nw.includes(w));
      const exactAlias = aw.includes(normalize2(l.label));
      let score = inName ? 0.95 : exactAlias ? 0.9 : Math.min(0.84, Math.max(similarity(l.label, p.name), ...p.aliases.map((a) => similarity(l.label, a))));
      const compatible = p.baseUnit === l.packUnit || p.baseUnit === "piece" && l.packUnit === "piece" || ["sac", "carton", "botte"].includes(p.baseUnit) && l.packUnit === "piece";
      if (!compatible) score -= 0.25;
      return { id: p.id, name: p.name, baseUnit: p.baseUnit, score: Math.round(score * 1e3) / 1e3 };
    }).filter((m) => m.score >= 0.45).sort((a, b) => b.score - a.score).slice(0, 4);
    const top = scored[0];
    const second = scored[1];
    const confident = !!top && top.score >= 0.6 && (!second || top.score - second.score >= 0.08 || top.score >= 0.9);
    const warning = top && top.baseUnit !== l.packUnit && !(top.baseUnit === "piece" || l.packUnit === "piece") ? `Unit\xE9 ${l.packUnit} \u2260 ${top.baseUnit} du r\xE9f\xE9rentiel` : void 0;
    return { ...l, match: confident ? top : null, candidates: scored, warning };
  });
}
var CATALOG_PROMPT = `Tu lis la photo (ou le PDF) d'un tarif / catalogue de grossiste alimentaire africain ou exotique.
R\xE9ponds UNIQUEMENT avec un JSON valide : {"lines":[{"label":string,"packLabel":string|null,"packQty":number|null,"packUnit":"kg"|"g"|"L"|"mL"|"piece"|null,"price":number|null}]}
R\xE8gles : une ligne par produit/conditionnement ; label = nom du produit sans le conditionnement ; packQty = quantit\xE9 par colis dans packUnit (\xAB 10 x 1 kg \xBB \u2192 10, "kg") ; price = prix du colis en euros (HT si indiqu\xE9, sinon tel quel). Ignore titres, totaux, conditions g\xE9n\xE9rales.`;
async function extractCatalogFromImage(imageDataUrl) {
  if (!process.env.LLM_API_KEY) return { ok: false, error: "Lecture de photo indisponible : LLM_API_KEY non configur\xE9. Collez le texte du tarif ou importez un fichier CSV/Excel." };
  const base = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.LLM_VISION_MODEL ?? process.env.LLM_MODEL ?? "gpt-4o-mini";
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LLM_API_KEY}` },
      signal: AbortSignal.timeout(6e4),
      body: JSON.stringify({ model, temperature: 0, max_tokens: 4e3, response_format: { type: "json_object" }, messages: [{ role: "system", content: CATALOG_PROMPT }, { role: "user", content: [{ type: "text", text: "Voici le tarif." }, { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } }] }] })
    });
    if (!res.ok) return { ok: false, error: `LLM HTTP ${res.status}` };
    const data = await res.json();
    const parsed = JSON.parse((data.choices?.[0]?.message?.content ?? "{}").replace(/^```json\s*|```$/g, ""));
    const lines = (parsed.lines ?? []).filter((l) => l && l.label && Number(l.price) > 0).map((l) => {
      let qty3 = Number(l.packQty) || 1;
      let unit2 = l.packUnit ?? "piece";
      if (unit2 === "g") {
        qty3 /= 1e3;
        unit2 = "kg";
      }
      if (unit2 === "mL") {
        qty3 /= 1e3;
        unit2 = "L";
      }
      return { raw: `${l.label} ${l.packLabel ?? ""} ${l.price}`.trim(), label: l.label, packLabel: l.packLabel ?? (unit2 === "piece" ? "Pi\xE8ce" : `${qty3} ${unit2}`), packQty: qty3, packUnit: unit2, price: Number(l.price), inStock: true };
    });
    return { ok: true, lines };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// apps/api/src/routes/vendor.ts
var vendorRoutes2 = new Hono10();
var n8 = (v) => v === null || v === void 0 ? 0 : Number(v);
var eur9 = (v) => `${v.toFixed(2).replace(".", ",")} \u20AC`;
var slugify2 = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
var isAdmin4 = (email) => (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
async function requireVendor(c, next) {
  const db = await getDb();
  const user = c.get("user");
  const wanted = c.req.header("x-vendor-id");
  const rows = await db.select({ vendorId: vendorMembers.vendorId }).from(vendorMembers).where(eq21(vendorMembers.userId, user.id));
  const vid = wanted && rows.some((r) => r.vendorId === wanted) ? wanted : rows[0]?.vendorId;
  if (!vid) return c.json({ error: "Aucun espace fournisseur pour ce compte" }, 403);
  if (c.req.method !== "GET") {
    const [v] = await db.select({ cgv: vendors.cgvVersion }).from(vendors).where(eq21(vendors.id, vid));
    if (v && v.cgv !== VENDOR_CGV_VERSION) return c.json({ error: `Merci d'accepter la nouvelle version (${VENDOR_CGV_VERSION}) des conditions fournisseur pour continuer.`, code: "cgv_outdated" }, 428);
  }
  c.set("vendorId", vid);
  await next();
}
vendorRoutes2.post("/vendor/register", requireAuth, async (c) => {
  const body3 = z10.object({
    name: z10.string().min(2),
    description: z10.string().max(500).optional(),
    city: z10.string().optional(),
    deliveryZones: z10.array(z10.string().min(1)).max(30).default([]),
    categories: z10.array(z10.enum(["feculents", "frais", "viandes_poissons", "epicerie", "boissons", "emballages"])).default([]),
    leadTimeHours: z10.number().int().positive().default(48),
    minOrderEur: z10.number().nonnegative().default(0),
    deliveryFeeEur: z10.number().nonnegative().default(0),
    contactEmail: z10.string().email().optional(),
    contactPhone: z10.string().optional(),
    whatsapp: z10.string().optional(),
    invite: z10.string().optional(),
    acceptCgv: z10.boolean().optional()
  }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
  if (!body3.data.acceptCgv) return c.json({ error: "Vous devez accepter les conditions g\xE9n\xE9rales fournisseur.", code: "cgv_required" }, 400);
  const db = await getDb();
  const user = c.get("user");
  const { invite, acceptCgv: _a, ...d } = body3.data;
  const inv = invite ? await readVendorInvite(invite) : null;
  const [v] = await db.insert(vendors).values({ ...d, cgvVersion: VENDOR_CGV_VERSION, cgvAcceptedAt: /* @__PURE__ */ new Date(), cgvAcceptedBy: user.email, slug: `${slugify2(d.name)}-${user.id.slice(0, 6)}`, contactEmail: d.contactEmail ?? user.email, deliveryZones: d.deliveryZones.map((z21) => z21.trim().toLowerCase()), minOrderEur: d.minOrderEur.toFixed(2), deliveryFeeEur: d.deliveryFeeEur.toFixed(2), status: inv || process.env.VENDOR_AUTO_APPROVE === "true" ? "actif" : "en_attente" }).returning();
  if (inv) await db.update(prospects).set({ status: "converti", email: user.email, updatedAt: /* @__PURE__ */ new Date() }).where(eq21(prospects.id, inv.pid));
  await db.insert(vendorMembers).values({ vendorId: v.id, userId: user.id, role: "owner" });
  await audit("vendor.register", { actorEmail: user.email, target: v.id, meta: { name: v.name, invited: !!inv } });
  return c.json({ vendor: v, message: v.status === "actif" ? "Espace fournisseur activ\xE9." : "Demande enregistr\xE9e : votre espace sera activ\xE9 apr\xE8s v\xE9rification (sous 24 h ouvr\xE9es)." }, 201);
});
vendorRoutes2.get("/vendor/me", requireAuth, async (c) => {
  const db = await getDb();
  const user = c.get("user");
  const rows = await db.select({ vendor: vendors, role: vendorMembers.role }).from(vendorMembers).innerJoin(vendors, eq21(vendors.id, vendorMembers.vendorId)).where(eq21(vendorMembers.userId, user.id));
  return c.json({ vendors: rows.map((r) => ({ ...r.vendor, role: r.role, cgvUpToDate: r.vendor.cgvVersion === VENDOR_CGV_VERSION })), isAdmin: isAdmin4(user.email), cgvVersion: VENDOR_CGV_VERSION });
});
vendorRoutes2.post("/vendor/accept-cgv", requireAuth, async (c) => {
  const db = await getDb();
  const user = c.get("user");
  const rows = await db.select({ id: vendors.id }).from(vendorMembers).innerJoin(vendors, eq21(vendors.id, vendorMembers.vendorId)).where(eq21(vendorMembers.userId, user.id));
  for (const r of rows) await db.update(vendors).set({ cgvVersion: VENDOR_CGV_VERSION, cgvAcceptedAt: /* @__PURE__ */ new Date(), cgvAcceptedBy: user.email }).where(eq21(vendors.id, r.id));
  await audit("vendor.accept_cgv", { actorEmail: user.email, meta: { version: VENDOR_CGV_VERSION, vendors: rows.length } });
  return c.json({ ok: true, version: VENDOR_CGV_VERSION });
});
vendorRoutes2.use("/vendor/*", requireAuth, requireVendor);
vendorRoutes2.get("/vendor/dashboard", async (c) => {
  const db = await getDb();
  const vid = c.get("vendorId");
  const [v] = await db.select().from(vendors).where(eq21(vendors.id, vid));
  const [stats] = await db.select({
    pending: sql15`count(*) filter (where ${orders.status} = 'envoyee')`,
    confirmed: sql15`count(*) filter (where ${orders.status} = 'confirmee')`,
    month: sql15`coalesce(sum(${orders.totalEur}) filter (where ${orders.status} in ('confirmee','livree','livree_partiel') and ${orders.createdAt} >= date_trunc('month', now())),0)`,
    restaurants: sql15`count(distinct ${orders.restaurantId}) filter (where ${orders.status} <> 'annulee')`
  }).from(orders).where(eq21(orders.vendorId, vid));
  const [{ offers }] = await db.select({ offers: sql15`count(*)` }).from(vendorOffers).where(eq21(vendorOffers.vendorId, vid));
  const [{ linked }] = await db.select({ linked: sql15`count(*)` }).from(suppliers).where(eq21(suppliers.vendorId, vid));
  const period = (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
  const [{ commission }] = await db.select({ commission: sql15`coalesce(sum(${commissions.amountEur}),0)` }).from(commissions).where(and19(eq21(commissions.vendorId, vid), eq21(commissions.period, period)));
  return c.json({ vendor: v, stats: { pendingOrders: n8(stats.pending), confirmedOrders: n8(stats.confirmed), monthRevenue: n8(stats.month), restaurantsServed: n8(stats.restaurants), offers: n8(offers), restaurantsFollowing: n8(linked), commissionThisMonth: n8(commission), commissionPct: n8(v.commissionPct) } });
});
vendorRoutes2.put("/vendor/profile", async (c) => {
  const body3 = z10.object({ name: z10.string().min(2).optional(), description: z10.string().max(500).nullable().optional(), city: z10.string().nullable().optional(), deliveryZones: z10.array(z10.string()).max(30).optional(), leadTimeHours: z10.number().int().positive().optional(), deliveryDays: z10.array(z10.number().int().min(1).max(7)).optional(), minOrderEur: z10.number().nonnegative().optional(), deliveryFeeEur: z10.number().nonnegative().optional(), contactEmail: z10.string().email().nullable().optional(), contactPhone: z10.string().nullable().optional(), whatsapp: z10.string().nullable().optional() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const d = body3.data;
  const [v] = await db.update(vendors).set({ ...d, deliveryZones: d.deliveryZones?.map((z21) => z21.trim().toLowerCase()), minOrderEur: d.minOrderEur?.toFixed(2), deliveryFeeEur: d.deliveryFeeEur?.toFixed(2) }).where(eq21(vendors.id, c.get("vendorId"))).returning();
  return c.json({ vendor: v });
});
vendorRoutes2.get("/vendor/offers", async (c) => {
  const db = await getDb();
  const vid = c.get("vendorId");
  const rows = await db.select({ offer: vendorOffers, product: products }).from(vendorOffers).innerJoin(products, eq21(products.id, vendorOffers.productId)).where(eq21(vendorOffers.vendorId, vid)).orderBy(products.category, products.name);
  return c.json({ offers: rows.map(({ offer, product }) => ({ ...offer, productName: product.name, category: product.category, unit: product.baseUnit, unitPrice: Math.round(n8(offer.packPriceEur) / n8(offer.packQty) * 1e4) / 1e4 })) });
});
vendorRoutes2.post("/vendor/offers", async (c) => {
  const body3 = z10.object({ productId: z10.string().uuid(), packLabel: z10.string().min(1), packQty: z10.number().positive(), packPrice: z10.number().positive(), inStock: z10.boolean().default(true) }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const vid = c.get("vendorId");
  const d = body3.data;
  const [p] = await db.select({ id: products.id }).from(products).where(and19(eq21(products.id, d.productId), sql15`${products.restaurantId} is null`));
  if (!p) return c.json({ error: "Produit hors r\xE9f\xE9rentiel commun" }, 400);
  const [offer] = await db.insert(vendorOffers).values({ vendorId: vid, productId: d.productId, packLabel: d.packLabel, packQty: d.packQty.toFixed(3), packPriceEur: d.packPrice.toFixed(2), inStock: d.inStock }).onConflictDoUpdate({ target: [vendorOffers.vendorId, vendorOffers.productId, vendorOffers.packLabel], set: { packQty: d.packQty.toFixed(3), packPriceEur: d.packPrice.toFixed(2), inStock: d.inStock, updatedAt: /* @__PURE__ */ new Date() } }).returning();
  const linked = await db.select({ id: suppliers.id, restaurantId: suppliers.restaurantId }).from(suppliers).where(eq21(suppliers.vendorId, vid));
  for (const s of linked) {
    await db.insert(supplierOffers).values({ restaurantId: s.restaurantId, supplierId: s.id, productId: d.productId, packLabel: d.packLabel, packQty: d.packQty.toFixed(3), packPriceEur: d.packPrice.toFixed(2), inStock: d.inStock }).onConflictDoUpdate({ target: [supplierOffers.supplierId, supplierOffers.productId, supplierOffers.packLabel], set: { packQty: d.packQty.toFixed(3), packPriceEur: d.packPrice.toFixed(2), inStock: d.inStock, lastSeenAt: /* @__PURE__ */ new Date() } });
  }
  return c.json({ offer, propagatedTo: linked.length }, 201);
});
vendorRoutes2.post("/vendor/offers/import", async (c) => {
  const body3 = z10.object({ rows: z10.array(z10.object({ product: z10.string(), packLabel: z10.string(), packQty: z10.number().positive(), packPrice: z10.number().positive(), inStock: z10.boolean().optional() })).min(1).max(2e3) }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const vid = c.get("vendorId");
  const ref = await db.select({ id: products.id, name: products.name, aliases: products.aliases }).from(products).where(sql15`${products.restaurantId} is null`);
  const norm2 = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const byName = /* @__PURE__ */ new Map();
  for (const p of ref) {
    byName.set(norm2(p.name), p.id);
    for (const a of p.aliases) byName.set(norm2(a), p.id);
  }
  let ok = 0;
  const unknown = [];
  for (const r of body3.data.rows) {
    const pid = byName.get(norm2(r.product));
    if (!pid) {
      unknown.push(r.product);
      continue;
    }
    await db.insert(vendorOffers).values({ vendorId: vid, productId: pid, packLabel: r.packLabel, packQty: r.packQty.toFixed(3), packPriceEur: r.packPrice.toFixed(2), inStock: r.inStock ?? true }).onConflictDoUpdate({ target: [vendorOffers.vendorId, vendorOffers.productId, vendorOffers.packLabel], set: { packQty: r.packQty.toFixed(3), packPriceEur: r.packPrice.toFixed(2), inStock: r.inStock ?? true, updatedAt: /* @__PURE__ */ new Date() } });
    ok++;
  }
  return c.json({ imported: ok, unknown });
});
vendorRoutes2.delete("/vendor/offers/:id", async (c) => {
  const db = await getDb();
  await db.delete(vendorOffers).where(and19(eq21(vendorOffers.id, c.req.param("id")), eq21(vendorOffers.vendorId, c.get("vendorId"))));
  return c.json({ ok: true });
});
vendorRoutes2.get("/vendor/orders", async (c) => {
  maybeRemind();
  const db = await getDb();
  const vid = c.get("vendorId");
  const status = c.req.query("status");
  const rows = await db.select({ order: orders, restaurantName: restaurants.name, city: restaurants.city, address: restaurants.address, settings: restaurants.settings }).from(orders).innerJoin(restaurants, eq21(restaurants.id, orders.restaurantId)).where(status ? and19(eq21(orders.vendorId, vid), eq21(orders.status, status)) : eq21(orders.vendorId, vid)).orderBy(desc9(orders.createdAt)).limit(100);
  const ids = rows.map((r) => r.order.id);
  const lines = ids.length ? await db.select({ line: orderLines, productName: products.name, unit: products.baseUnit }).from(orderLines).innerJoin(products, eq21(products.id, orderLines.productId)).where(inArray9(orderLines.orderId, ids)) : [];
  return c.json({ orders: rows.map((r) => ({ ...r.order, proofPhoto: void 0, proofSignature: void 0, restaurantName: r.restaurantName, city: r.city, address: r.address, restaurantPhone: r.settings?.notifyPhone ?? null, whatsappLink: waLink(r.settings?.notifyPhone, `Bonjour ${r.restaurantName}, au sujet de votre commande ${r.order.reference} via AFRISUPPLY : `), lines: lines.filter((l) => l.line.orderId === r.order.id).map((l) => ({ ...l.line, productName: l.productName, unit: l.unit })) })) });
});
async function notifyRestaurant(orderId, subject, text2, kind = "order.confirmed") {
  const db = await getDb();
  const [o] = await db.select({ restaurantId: orders.restaurantId, vendorId: orders.vendorId }).from(orders).where(eq21(orders.id, orderId));
  const [rest] = await db.select({ settings: restaurants.settings }).from(restaurants).where(eq21(restaurants.id, o.restaurantId));
  if (rest?.settings?.notifyPhone) void sendMessage({ to: rest.settings.notifyPhone, body: `AFRISUPPLY \u2014 ${subject}
${text2}
Suivi : ${APP_URL2()}/app/achats`, kind, orderId, vendorId: o.vendorId, restaurantId: o.restaurantId });
  const rcpts = await db.select({ email: users.email }).from(restaurantMembers).innerJoin(users, eq21(users.id, restaurantMembers.userId)).where(and19(eq21(restaurantMembers.restaurantId, o.restaurantId), inArray9(restaurantMembers.role, ["owner", "manager"])));
  for (const r of rcpts) void sendMail({ to: r.email, subject, text: text2, html: `<p>${text2.replace(/\n/g, "<br>")}</p><p><a href="${APP_URL2()}/app/achats">Voir mes commandes</a></p>`, tags: { type: "order_status" } });
}
vendorRoutes2.post("/vendor/orders/:id/confirm", async (c) => {
  const body3 = z10.object({ expectedAt: z10.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z10.string().max(300).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const vid = c.get("vendorId");
  const [o] = await db.select().from(orders).where(and19(eq21(orders.id, c.req.param("id")), eq21(orders.vendorId, vid)));
  if (!o) return c.json({ error: "Commande introuvable" }, 404);
  if (o.status !== "envoyee") return c.json({ error: `Commande d\xE9j\xE0 ${o.status}` }, 400);
  const [v] = await db.select().from(vendors).where(eq21(vendors.id, vid));
  const [upd] = await db.update(orders).set({ status: "confirmee", expectedAt: body3.data.expectedAt ?? o.expectedAt, vendorDecisionAt: /* @__PURE__ */ new Date(), vendorNote: body3.data.note, proposal: null }).where(eq21(orders.id, o.id)).returning();
  const amount = n8(o.totalEur) * n8(v.commissionPct) / 100;
  await db.insert(commissions).values({ vendorId: vid, orderId: o.id, orderTotalEur: o.totalEur, pct: v.commissionPct, amountEur: amount.toFixed(2), period: (/* @__PURE__ */ new Date()).toISOString().slice(0, 7) }).onConflictDoNothing();
  void logOrderEvent(o.id, "confirmed", `Confirm\xE9e par ${v.name}${upd.expectedAt ? ` \u2014 livraison pr\xE9vue le ${upd.expectedAt}` : ""}`, "vendor");
  void notifyRestaurant(o.id, `\u2705 ${v.name} a confirm\xE9 votre commande ${o.reference}`, `${v.name} a confirm\xE9 la commande ${o.reference} (${eur9(n8(o.totalEur))}).
Livraison pr\xE9vue le ${upd.expectedAt ?? "\xE0 confirmer"}.${body3.data.note ? `
Message du fournisseur : ${body3.data.note}` : ""}`);
  return c.json({ order: upd, commission: Math.round(amount * 100) / 100 });
});
vendorRoutes2.post("/vendor/orders/:id/propose", async (c) => {
  const body3 = z10.object({
    note: z10.string().max(300).optional(),
    expectedAt: z10.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    lines: z10.array(z10.object({ lineId: z10.string().uuid(), newPacks: z10.number().int().nonnegative(), replacementOfferId: z10.string().uuid().nullable().optional(), replacementPacks: z10.number().int().positive().optional() })).min(1)
  }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
  const db = await getDb();
  const vid = c.get("vendorId");
  const [o] = await db.select().from(orders).where(and19(eq21(orders.id, c.req.param("id")), eq21(orders.vendorId, vid)));
  if (!o) return c.json({ error: "Commande introuvable" }, 404);
  if (o.status !== "envoyee") return c.json({ error: `Commande d\xE9j\xE0 ${o.status}` }, 400);
  const lines = await db.select({ l: orderLines, productName: products.name }).from(orderLines).innerJoin(products, eq21(products.id, orderLines.productId)).where(eq21(orderLines.orderId, o.id));
  const offerIds = body3.data.lines.map((x) => x.replacementOfferId).filter((x) => !!x);
  const offers = offerIds.length ? await db.select({ o: vendorOffers, productName: products.name }).from(vendorOffers).innerJoin(products, eq21(products.id, vendorOffers.productId)).where(and19(eq21(vendorOffers.vendorId, vid), inArray9(vendorOffers.id, offerIds))) : [];
  const out = [];
  for (const l of lines) {
    const ch = body3.data.lines.find((x) => x.lineId === l.l.id);
    const packs = n8(l.l.packs);
    const unitPack = n8(l.l.lineTotalEur) / Math.max(1, packs);
    if (!ch) {
      out.push({ lineId: l.l.id, productName: l.productName, packLabel: l.l.packLabel, packs, newPacks: packs, lineTotalEur: n8(l.l.lineTotalEur), newLineTotalEur: n8(l.l.lineTotalEur), replacement: null });
      continue;
    }
    if (ch.newPacks > packs) return c.json({ error: `Quantit\xE9 propos\xE9e sup\xE9rieure \xE0 la commande pour ${l.productName}` }, 400);
    let replacement = null;
    if (ch.replacementOfferId) {
      const r = offers.find((x) => x.o.id === ch.replacementOfferId);
      if (!r) return c.json({ error: "Offre de remplacement introuvable dans votre catalogue" }, 400);
      const rp = ch.replacementPacks ?? packs - ch.newPacks;
      replacement = { vendorOfferId: r.o.id, productId: r.o.productId, productName: r.productName, packLabel: r.o.packLabel, packQty: n8(r.o.packQty), packPriceEur: n8(r.o.packPriceEur), packs: rp, lineTotalEur: Math.round(rp * n8(r.o.packPriceEur) * 100) / 100 };
    }
    out.push({ lineId: l.l.id, productName: l.productName, packLabel: l.l.packLabel, packs, newPacks: ch.newPacks, lineTotalEur: n8(l.l.lineTotalEur), newLineTotalEur: Math.round(ch.newPacks * unitPack * 100) / 100, replacement });
  }
  const changed = out.filter((x) => x.newPacks !== x.packs || x.replacement);
  if (!changed.length) return c.json({ error: "Aucune modification : confirmez simplement la commande" }, 400);
  const newTotalEur = Math.round(out.reduce((a, x) => a + x.newLineTotalEur + (x.replacement?.lineTotalEur ?? 0), 0) * 100) / 100;
  if (newTotalEur <= 0) return c.json({ error: "Tout est en rupture : utilisez \xAB Refuser \xBB" }, 400);
  const proposal = { note: body3.data.note, expectedAt: body3.data.expectedAt, lines: out, newTotalEur };
  const [upd] = await db.update(orders).set({ proposal, proposalAt: /* @__PURE__ */ new Date() }).where(eq21(orders.id, o.id)).returning();
  const [v] = await db.select({ name: vendors.name }).from(vendors).where(eq21(vendors.id, vid));
  const summary = changed.map((x) => x.replacement ? `${x.productName} : ${x.newPacks}/${x.packs} + ${x.replacement.packs} \xD7 ${x.replacement.productName} (${x.replacement.packLabel ?? ""})` : `${x.productName} : ${x.newPacks}/${x.packs}${x.newPacks === 0 ? " (rupture)" : ""}`).join(" ; ");
  void logOrderEvent(o.id, "note", `${v.name} propose une modification \u2014 ${summary}`, "vendor", { newTotalEur });
  void notifyRestaurant(o.id, `\u270F\uFE0F ${v.name} propose une modification de la commande ${o.reference}`, `${v.name} ne peut pas livrer la commande ${o.reference} telle quelle.
Proposition : ${summary}.
Nouveau total : ${eur9(newTotalEur)} (au lieu de ${eur9(n8(o.totalEur))}).${body3.data.note ? `
Message : ${body3.data.note}` : ""}

Acceptez ou refusez en un clic dans Achats.`);
  return c.json({ order: { ...upd, proofPhoto: void 0, proofSignature: void 0 }, proposal });
});
vendorRoutes2.post("/vendor/orders/:id/refuse", async (c) => {
  const body3 = z10.object({ reason: z10.string().min(2).max(300) }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Motif requis" }, 400);
  const db = await getDb();
  const vid = c.get("vendorId");
  const [o] = await db.select().from(orders).where(and19(eq21(orders.id, c.req.param("id")), eq21(orders.vendorId, vid)));
  if (!o) return c.json({ error: "Commande introuvable" }, 404);
  if (o.status !== "envoyee") return c.json({ error: `Commande d\xE9j\xE0 ${o.status}` }, 400);
  const [v] = await db.select({ name: vendors.name }).from(vendors).where(eq21(vendors.id, vid));
  const [upd] = await db.update(orders).set({ status: "annulee", vendorDecisionAt: /* @__PURE__ */ new Date(), vendorNote: body3.data.reason }).where(eq21(orders.id, o.id)).returning();
  void logOrderEvent(o.id, "refused", `Refus\xE9e par ${v.name} : ${body3.data.reason}`, "vendor");
  void notifyRestaurant(o.id, `\u274C ${v.name} ne peut pas honorer la commande ${o.reference}`, `${v.name} a refus\xE9 la commande ${o.reference}.
Motif : ${body3.data.reason}

Le comparateur AFRISUPPLY vous propose des alternatives dans le panier.`, "order.refused");
  return c.json({ order: upd });
});
var FULFILL_LABEL = { en_preparation: "En pr\xE9paration", en_livraison: "En livraison", livree: "Livr\xE9e" };
vendorRoutes2.get("/vendor/picking", async (c) => {
  const db = await getDb();
  const vid = c.get("vendorId");
  const day = c.req.query("date");
  const conds = [eq21(orders.vendorId, vid), eq21(orders.status, "confirmee")];
  if (day) conds.push(eq21(orders.expectedAt, day));
  const rows = await db.select({ orderId: orders.id, reference: orders.reference, restaurant: restaurants.name, city: restaurants.city, address: restaurants.address, expectedAt: orders.expectedAt, fulfillment: orders.fulfillment, deliverySlot: orders.deliverySlot, productId: orderLines.productId, productName: products.name, packLabel: orderLines.packLabel, packs: orderLines.packs }).from(orders).innerJoin(restaurants, eq21(restaurants.id, orders.restaurantId)).innerJoin(orderLines, eq21(orderLines.orderId, orders.id)).innerJoin(products, eq21(products.id, orderLines.productId)).where(and19(...conds)).orderBy(orders.expectedAt, orders.createdAt);
  const byProduct = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const k = `${r.productId}|${r.packLabel ?? ""}`;
    const e = byProduct.get(k) ?? { productId: r.productId, productName: r.productName, packLabel: r.packLabel, packs: 0, orders: [] };
    e.packs += n8(r.packs);
    e.orders.push({ reference: r.reference, restaurant: r.restaurant, packs: n8(r.packs) });
    byProduct.set(k, e);
  }
  const ordersMap = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const e = ordersMap.get(r.orderId) ?? { id: r.orderId, reference: r.reference, restaurant: r.restaurant, city: r.city, address: r.address, expectedAt: r.expectedAt, fulfillment: r.fulfillment, deliverySlot: r.deliverySlot, lines: 0, packs: 0 };
    e.lines++;
    e.packs += n8(r.packs);
    ordersMap.set(r.orderId, e);
  }
  const dates = [...new Set(rows.map((r) => r.expectedAt).filter(Boolean))].sort();
  return c.json({ date: day ?? null, dates, products: [...byProduct.values()].sort((a, b) => a.productName.localeCompare(b.productName)), orders: [...ordersMap.values()] });
});
vendorRoutes2.post("/vendor/orders/:id/fulfillment", async (c) => {
  const body3 = z10.object({ step: z10.enum(["en_preparation", "en_livraison", "livree"]), deliverySlot: z10.string().max(40).optional(), driverName: z10.string().max(80).optional(), receiverName: z10.string().max(80).optional(), photo: z10.string().max(6e5).optional(), signature: z10.string().max(2e5).optional(), note: z10.string().max(300).optional() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
  const db = await getDb();
  const vid = c.get("vendorId");
  const d = body3.data;
  const [o] = await db.select().from(orders).where(and19(eq21(orders.id, c.req.param("id")), eq21(orders.vendorId, vid)));
  if (!o) return c.json({ error: "Commande introuvable" }, 404);
  if (o.status !== "confirmee") return c.json({ error: `Commande ${o.status} : seules les commandes confirm\xE9es se pr\xE9parent/livrent` }, 400);
  const order = ["en_preparation", "en_livraison", "livree"];
  const cur = o.fulfillment ? order.indexOf(o.fulfillment) : -1;
  const nxt = order.indexOf(d.step);
  if (nxt <= cur) return c.json({ error: `D\xE9j\xE0 ${FULFILL_LABEL[o.fulfillment]}` }, 400);
  if (d.photo && !/^data:image\/(jpeg|png|webp);base64,/.test(d.photo)) return c.json({ error: "Photo invalide" }, 400);
  if (d.signature && !/^data:image\/png;base64,/.test(d.signature)) return c.json({ error: "Signature invalide" }, 400);
  if (d.step === "livree" && !d.photo && !d.signature && !d.receiverName) return c.json({ error: "Preuve de livraison requise : nom du r\xE9ceptionnaire, signature ou photo" }, 400);
  const now = /* @__PURE__ */ new Date();
  const patch = { fulfillment: d.step, deliverySlot: d.deliverySlot ?? o.deliverySlot, driverName: d.driverName ?? o.driverName };
  if (d.step === "en_preparation") patch.preparedAt = now;
  if (d.step === "en_livraison") {
    patch.shippedAt = now;
    patch.preparedAt = o.preparedAt ?? now;
  }
  if (d.step === "livree") {
    patch.vendorDeliveredAt = now;
    patch.shippedAt = o.shippedAt ?? now;
    patch.preparedAt = o.preparedAt ?? now;
    patch.proofReceiverName = d.receiverName;
    patch.proofPhoto = d.photo;
    patch.proofSignature = d.signature;
    patch.proofNote = d.note;
  }
  const [upd] = await db.update(orders).set(patch).where(eq21(orders.id, o.id)).returning();
  const [v] = await db.select({ name: vendors.name }).from(vendors).where(eq21(vendors.id, vid));
  if (d.step === "en_preparation") {
    void logOrderEvent(o.id, "preparing", `${v.name} pr\xE9pare votre commande${d.deliverySlot ? ` \u2014 livraison ${d.deliverySlot}` : ""}`, "vendor");
  }
  if (d.step === "en_livraison") {
    void logOrderEvent(o.id, "shipped", `En livraison${d.driverName ? ` (${d.driverName})` : ""}${upd.deliverySlot ? ` \u2014 ${upd.deliverySlot}` : ""}`, "vendor");
    void notifyRestaurant(o.id, `\u{1F69A} ${v.name} : commande ${o.reference} en route`, `Votre commande ${o.reference} est en livraison${upd.deliverySlot ? ` (${upd.deliverySlot})` : ""}${d.driverName ? `, livreur : ${d.driverName}` : ""}. Pensez \xE0 la r\xE9ceptionner dans AFRISUPPLY pour mettre le stock \xE0 jour et signaler tout \xE9cart.`, "order.shipped");
  }
  if (d.step === "livree") {
    void logOrderEvent(o.id, "delivered", `Livr\xE9e${d.receiverName ? ` \u2014 re\xE7ue par ${d.receiverName}` : ""}${d.signature ? " (signature)" : ""}${d.photo ? " (photo)" : ""}`, "vendor");
    void notifyRestaurant(o.id, `\u{1F4E6} ${v.name} : commande ${o.reference} livr\xE9e`, `${v.name} indique avoir livr\xE9 la commande ${o.reference}${d.receiverName ? ` (re\xE7ue par ${d.receiverName})` : ""}. Confirmez la r\xE9ception dans AFRISUPPLY : le stock sera mis \xE0 jour et vous pourrez signaler un \xE9cart.`, "order.shipped");
  }
  return c.json({ order: { ...upd, proofPhoto: void 0, proofSignature: void 0 }, message: FULFILL_LABEL[d.step] });
});
vendorRoutes2.post("/vendor/orders/:id/shipped", async (c) => c.redirect(`/api/vendor/orders/${c.req.param("id")}/fulfillment`, 307));
vendorRoutes2.get("/vendor/orders/:id/timeline", async (c) => {
  const db = await getDb();
  const vid = c.get("vendorId");
  const [o] = await db.select({ id: orders.id, fulfillment: orders.fulfillment, proofPhoto: orders.proofPhoto, proofSignature: orders.proofSignature, proofReceiverName: orders.proofReceiverName, proofNote: orders.proofNote, vendorDeliveredAt: orders.vendorDeliveredAt }).from(orders).where(and19(eq21(orders.id, c.req.param("id")), eq21(orders.vendorId, vid)));
  if (!o) return c.json({ error: "Commande introuvable" }, 404);
  return c.json({ order: o, events: await orderTimeline(o.id) });
});
vendorRoutes2.get("/vendor/pricing", async (c) => {
  const db = await getDb();
  const vid = c.get("vendorId");
  const tiers = await db.select({ t: vendorPriceTiers }).from(vendorPriceTiers).innerJoin(vendorOffers, eq21(vendorOffers.id, vendorPriceTiers.vendorOfferId)).where(eq21(vendorOffers.vendorId, vid)).orderBy(vendorPriceTiers.minPacks);
  const customers = await db.select({ p: vendorCustomerPrices, restaurantName: restaurants.name, city: restaurants.city }).from(vendorCustomerPrices).innerJoin(restaurants, eq21(restaurants.id, vendorCustomerPrices.restaurantId)).where(eq21(vendorCustomerPrices.vendorId, vid)).orderBy(desc9(vendorCustomerPrices.updatedAt));
  const clients = await db.select({ id: restaurants.id, name: restaurants.name, city: restaurants.city, orders: sql15`count(${orders.id})`, gmv: sql15`coalesce(sum(${orders.totalEur}) filter (where ${orders.status} <> 'annulee'), 0)` }).from(orders).innerJoin(restaurants, eq21(restaurants.id, orders.restaurantId)).where(eq21(orders.vendorId, vid)).groupBy(restaurants.id, restaurants.name, restaurants.city).orderBy(sql15`count(${orders.id}) desc`);
  return c.json({ tiers: tiers.map((x) => x.t), customers: customers.map((x) => ({ ...x.p, restaurantName: x.restaurantName, city: x.city })), clients: clients.map((x) => ({ ...x, orders: n8(x.orders), gmv: n8(x.gmv) })) });
});
vendorRoutes2.put("/vendor/offers/:id/tiers", async (c) => {
  const body3 = z10.object({ tiers: z10.array(z10.object({ minPacks: z10.number().int().min(2), packPriceEur: z10.number().positive() })).max(6) }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const vid = c.get("vendorId");
  const [o] = await db.select().from(vendorOffers).where(and19(eq21(vendorOffers.id, c.req.param("id")), eq21(vendorOffers.vendorId, vid)));
  if (!o) return c.json({ error: "Offre introuvable" }, 404);
  const sorted = [...body3.data.tiers].sort((a, b) => a.minPacks - b.minPacks);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].packPriceEur >= n8(o.packPriceEur)) return c.json({ error: `Le palier ${sorted[i].minPacks}+ doit \xEAtre moins cher que le prix catalogue (${eur9(n8(o.packPriceEur))})` }, 400);
    if (i > 0 && sorted[i].packPriceEur >= sorted[i - 1].packPriceEur) return c.json({ error: "Les prix doivent baisser \xE0 chaque palier" }, 400);
    if (i > 0 && sorted[i].minPacks === sorted[i - 1].minPacks) return c.json({ error: "Deux paliers identiques" }, 400);
  }
  await db.delete(vendorPriceTiers).where(eq21(vendorPriceTiers.vendorOfferId, o.id));
  if (sorted.length) await db.insert(vendorPriceTiers).values(sorted.map((t) => ({ vendorOfferId: o.id, minPacks: t.minPacks, packPriceEur: t.packPriceEur.toFixed(2) })));
  return c.json({ tiers: sorted });
});
vendorRoutes2.post("/vendor/customer-prices", async (c) => {
  const body3 = z10.object({ restaurantId: z10.string().uuid(), vendorOfferId: z10.string().uuid().nullable().optional(), packPriceEur: z10.number().positive().optional(), discountPct: z10.number().min(0.5).max(60).optional(), validUntil: z10.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), note: z10.string().max(200).optional() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
  const db = await getDb();
  const vid = c.get("vendorId");
  const d = body3.data;
  if (!d.packPriceEur && !d.discountPct) return c.json({ error: "Indiquez un prix ferme ou une remise %" }, 400);
  if (!d.vendorOfferId && d.packPriceEur) return c.json({ error: "Un prix ferme s\u2019applique \xE0 une offre pr\xE9cise ; pour tout le catalogue, utilisez une remise %" }, 400);
  if (d.vendorOfferId) {
    const [o] = await db.select().from(vendorOffers).where(and19(eq21(vendorOffers.id, d.vendorOfferId), eq21(vendorOffers.vendorId, vid)));
    if (!o) return c.json({ error: "Offre introuvable" }, 404);
    if (d.packPriceEur && d.packPriceEur >= n8(o.packPriceEur)) return c.json({ error: `Le prix n\xE9goci\xE9 doit \xEAtre inf\xE9rieur au catalogue (${eur9(n8(o.packPriceEur))})` }, 400);
  }
  const [known] = await db.select({ id: orders.id }).from(orders).where(and19(eq21(orders.vendorId, vid), eq21(orders.restaurantId, d.restaurantId))).limit(1);
  const [linked] = await db.select({ id: suppliers.id }).from(suppliers).where(and19(eq21(suppliers.vendorId, vid), eq21(suppliers.restaurantId, d.restaurantId))).limit(1);
  if (!known && !linked) return c.json({ error: "Ce restaurant n\u2019est pas encore votre client sur AFRISUPPLY" }, 400);
  const existing = await db.select().from(vendorCustomerPrices).where(and19(eq21(vendorCustomerPrices.vendorId, vid), eq21(vendorCustomerPrices.restaurantId, d.restaurantId), d.vendorOfferId ? eq21(vendorCustomerPrices.vendorOfferId, d.vendorOfferId) : sql15`${vendorCustomerPrices.vendorOfferId} is null`));
  const vals = { packPriceEur: d.packPriceEur?.toFixed(2) ?? null, discountPct: d.packPriceEur ? null : d.discountPct?.toFixed(2) ?? null, validUntil: d.validUntil ?? null, note: d.note, updatedAt: /* @__PURE__ */ new Date() };
  const [row] = existing[0] ? await db.update(vendorCustomerPrices).set(vals).where(eq21(vendorCustomerPrices.id, existing[0].id)).returning() : await db.insert(vendorCustomerPrices).values({ vendorId: vid, restaurantId: d.restaurantId, vendorOfferId: d.vendorOfferId ?? null, ...vals }).returning();
  await audit("vendor.customer_price", { actorEmail: c.get("user").email, target: row.id, meta: { restaurantId: d.restaurantId, offer: d.vendorOfferId, price: d.packPriceEur, pct: d.discountPct } });
  return c.json({ price: row }, existing[0] ? 200 : 201);
});
vendorRoutes2.delete("/vendor/customer-prices/:id", async (c) => {
  const db = await getDb();
  const vid = c.get("vendorId");
  const [row] = await db.delete(vendorCustomerPrices).where(and19(eq21(vendorCustomerPrices.id, c.req.param("id")), eq21(vendorCustomerPrices.vendorId, vid))).returning();
  if (!row) return c.json({ error: "Introuvable" }, 404);
  return c.json({ ok: true });
});
vendorRoutes2.get("/vendor/group-buys", async (c) => {
  const db = await getDb();
  const vid = c.get("vendorId");
  const rows = await db.select({ gb: groupBuys, productName: products.name, packLabel: vendorOffers.packLabel }).from(groupBuys).innerJoin(vendorOffers, eq21(vendorOffers.id, groupBuys.vendorOfferId)).innerJoin(products, eq21(products.id, vendorOffers.productId)).where(eq21(groupBuys.vendorId, vid)).orderBy(desc9(groupBuys.createdAt));
  const ids = rows.map((r) => r.gb.id);
  const parts = ids.length ? await db.select({ p: groupBuyParticipations, restaurantName: restaurants.name, city: restaurants.city }).from(groupBuyParticipations).innerJoin(restaurants, eq21(restaurants.id, groupBuyParticipations.restaurantId)).where(inArray9(groupBuyParticipations.groupBuyId, ids)) : [];
  return c.json({ groupBuys: rows.map((r) => {
    const p = parts.filter((x) => x.p.groupBuyId === r.gb.id);
    return { ...r.gb, productName: r.productName, packLabel: r.packLabel, committedPacks: p.reduce((a, x) => a + x.p.packs, 0), participants: p.map((x) => ({ restaurantName: x.restaurantName, city: x.city, packs: x.p.packs })) };
  }) });
});
vendorRoutes2.post("/vendor/group-buys", async (c) => {
  const body3 = z10.object({ vendorOfferId: z10.string().uuid(), zone: z10.string().min(2), targetPacks: z10.number().int().min(2), discountPct: z10.number().min(1).max(50), closesInDays: z10.number().int().min(1).max(30).default(7), deliveryDate: z10.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), title: z10.string().max(120).optional() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
  const db = await getDb();
  const vid = c.get("vendorId");
  const d = body3.data;
  const user = c.get("user");
  const [o] = await db.select({ offer: vendorOffers, productName: products.name }).from(vendorOffers).innerJoin(products, eq21(products.id, vendorOffers.productId)).where(and19(eq21(vendorOffers.id, d.vendorOfferId), eq21(vendorOffers.vendorId, vid)));
  if (!o) return c.json({ error: "Offre introuvable" }, 404);
  const title = d.title ?? `${o.productName} ${o.offer.packLabel} \u2014 ${d.targetPacks} colis = \u2212${d.discountPct} %`;
  const [gb] = await db.insert(groupBuys).values({ vendorId: vid, vendorOfferId: d.vendorOfferId, title, zone: d.zone.trim().toLowerCase() === "france" ? "France" : d.zone.trim().toLowerCase(), targetPacks: d.targetPacks, discountPct: d.discountPct.toFixed(2), closesAt: new Date(Date.now() + d.closesInDays * 864e5), deliveryDate: d.deliveryDate, createdBy: user.id }).returning();
  return c.json({ groupBuy: gb }, 201);
});
vendorRoutes2.post("/vendor/group-buys/:id/close", async (c) => {
  const db = await getDb();
  const vid = c.get("vendorId");
  const id = c.req.param("id");
  const [gb] = await db.select().from(groupBuys).where(and19(eq21(groupBuys.id, id), eq21(groupBuys.vendorId, vid)));
  if (!gb) return c.json({ error: "Introuvable" }, 404);
  if (!["ouvert", "atteint"].includes(gb.status)) return c.json({ error: `D\xE9j\xE0 ${gb.status}` }, 400);
  const parts = await db.select().from(groupBuyParticipations).where(eq21(groupBuyParticipations.groupBuyId, id));
  const committed = parts.reduce((a, p) => a + p.packs, 0);
  if (committed < gb.targetPacks) {
    await db.update(groupBuys).set({ status: "annule" }).where(eq21(groupBuys.id, id));
    return c.json({ ok: true, status: "annule", committed, target: gb.targetPacks });
  }
  const [v] = await db.select().from(vendors).where(eq21(vendors.id, vid));
  const [offer] = await db.select().from(vendorOffers).where(eq21(vendorOffers.id, gb.vendorOfferId));
  const packPrice = n8(offer.packPriceEur) * (1 - n8(gb.discountPct) / 100);
  const { linkVendor: linkVendor2 } = await Promise.resolve().then(() => (init_marketplace(), marketplace_exports));
  let created = 0;
  for (const p of parts) {
    if (p.packs <= 0 || p.orderId) continue;
    const link = await linkVendor2(p.restaurantId, vid);
    if (!link) continue;
    const total = p.packs * packPrice;
    const [order] = await db.insert(orders).values({ restaurantId: p.restaurantId, supplierId: link.supplier.id, vendorId: vid, reference: await nextOrderReference(), status: "confirmee", channel: "plateforme", sentAt: /* @__PURE__ */ new Date(), vendorDecisionAt: /* @__PURE__ */ new Date(), expectedAt: gb.deliveryDate ?? new Date(Date.now() + v.leadTimeHours * 36e5).toISOString().slice(0, 10), totalEur: total.toFixed(2), deliveryFeeEur: "0", source: "achat_groupe", notes: `Achat group\xE9 \xAB ${gb.title} \xBB : \u2212${n8(gb.discountPct)} %` }).returning();
    await db.insert(orderLines).values({ orderId: order.id, productId: offer.productId, packLabel: offer.packLabel, packs: p.packs, quantity: (p.packs * n8(offer.packQty)).toFixed(3), unitPriceEur: (packPrice / n8(offer.packQty)).toFixed(4), lineTotalEur: total.toFixed(2) });
    await db.insert(commissions).values({ vendorId: vid, orderId: order.id, orderTotalEur: total.toFixed(2), pct: v.commissionPct, amountEur: (total * n8(v.commissionPct) / 100).toFixed(2), period: (/* @__PURE__ */ new Date()).toISOString().slice(0, 7) }).onConflictDoNothing();
    await db.update(groupBuyParticipations).set({ orderId: order.id }).where(eq21(groupBuyParticipations.id, p.id));
    void notifyRestaurant(order.id, `\u{1F91D} Achat group\xE9 r\xE9ussi : ${gb.title}`, `Le palier est atteint (${committed} colis). Votre commande ${order.reference} de ${p.packs} colis \xE0 ${eur9(packPrice)} le colis (\u2212${n8(gb.discountPct)} %) est confirm\xE9e chez ${v.name}.`);
    created++;
  }
  await db.update(groupBuys).set({ status: "cloture" }).where(eq21(groupBuys.id, id));
  return c.json({ ok: true, status: "cloture", committed, ordersCreated: created });
});
vendorRoutes2.get("/vendor/commissions", async (c) => {
  const db = await getDb();
  const vid = c.get("vendorId");
  const rows = await db.select({ period: commissions.period, orders: sql15`count(*)`, base: sql15`sum(${commissions.orderTotalEur})`, amount: sql15`sum(${commissions.amountEur})`, invoiced: sql15`bool_and(${commissions.invoiced})` }).from(commissions).where(eq21(commissions.vendorId, vid)).groupBy(commissions.period).orderBy(desc9(commissions.period));
  return c.json({ periods: rows.map((r) => ({ ...r, orders: n8(r.orders), base: n8(r.base), amount: n8(r.amount) })) });
});
var vendorAdminRoutes = new Hono10();
vendorAdminRoutes.use("/admin/vendors/*", requireAuth);
vendorAdminRoutes.use("/admin/vendors", requireAuth);
vendorAdminRoutes.get("/admin/vendors", async (c) => {
  if (!isAdmin4(c.get("user").email)) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
  const db = await getDb();
  const rows = await db.select({ v: vendors, offerCount: sql15`(select count(*) from vendor_offers o where o.vendor_id = ${vendors.id})`, orderCount: sql15`(select count(*) from orders o where o.vendor_id = ${vendors.id})` }).from(vendors).orderBy(desc9(vendors.createdAt));
  return c.json({ vendors: rows.map((r) => ({ ...r.v, offerCount: Number(r.offerCount), orderCount: Number(r.orderCount) })) });
});
vendorAdminRoutes.put("/admin/vendors/:id", async (c) => {
  if (!isAdmin4(c.get("user").email)) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
  const body3 = z10.object({ status: z10.enum(["en_attente", "actif", "suspendu"]).optional(), commissionPct: z10.number().min(0).max(20).optional() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const [v] = await db.update(vendors).set({ status: body3.data.status, commissionPct: body3.data.commissionPct?.toFixed(2) }).where(eq21(vendors.id, c.req.param("id"))).returning();
  if (v && body3.data.status === "actif" && v.contactEmail) void sendMail({ to: v.contactEmail, subject: "Votre espace fournisseur AFRISUPPLY est activ\xE9", text: `Bonjour,

Votre espace ${v.name} est actif : ${APP_URL2()}/fournisseur
Ajoutez votre catalogue, les restaurants de votre zone vous verront d\xE8s aujourd'hui.
Commission plateforme : ${n8(v.commissionPct)} % sur les commandes confirm\xE9es, factur\xE9e mensuellement.`, html: `<p>Votre espace <b>${v.name}</b> est actif : <a href="${APP_URL2()}/fournisseur">${APP_URL2()}/fournisseur</a></p><p>Commission plateforme : ${n8(v.commissionPct)} % sur les commandes confirm\xE9es.</p>`, tags: { type: "vendor_activated" } });
  await audit("vendor.update", { actorEmail: c.get("user").email, target: v?.id, meta: body3.data });
  return c.json({ vendor: v });
});
async function refProducts() {
  const db = await getDb();
  return (await db.select({ id: products.id, name: products.name, aliases: products.aliases, baseUnit: products.baseUnit }).from(products).where(sql15`${products.restaurantId} is null`)).map((p) => ({ ...p, baseUnit: p.baseUnit }));
}
vendorRoutes2.post("/vendor/catalog/parse", async (c) => {
  const body3 = z10.object({ text: z10.string().max(2e5).optional(), image: z10.string().startsWith("data:image/").max(8e6).optional() }).refine((b) => b.text || b.image, "text ou image requis").safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Collez un texte ou envoyez une photo" }, 400);
  let lines = [];
  let source = "texte";
  if (body3.data.image) {
    const r = await extractCatalogFromImage(body3.data.image);
    if (!r.ok) return c.json({ error: r.error }, 503);
    lines = matchCatalogLines(r.lines, await refProducts());
    source = "photo";
  } else lines = matchCatalogLines(parseCatalogText(body3.data.text), await refProducts());
  const db = await getDb();
  const vid = c.get("vendorId");
  const existing = await db.select({ productId: vendorOffers.productId, packLabel: vendorOffers.packLabel, packPriceEur: vendorOffers.packPriceEur }).from(vendorOffers).where(eq21(vendorOffers.vendorId, vid));
  const out = lines.map((l) => {
    const ex = l.match ? existing.find((e) => e.productId === l.match.id && e.packLabel.toLowerCase() === l.packLabel.toLowerCase()) : null;
    return { ...l, currentPrice: ex ? n8(ex.packPriceEur) : null, changePct: ex && n8(ex.packPriceEur) > 0 ? Math.round((l.price - n8(ex.packPriceEur)) / n8(ex.packPriceEur) * 1e3) / 10 : null };
  });
  return c.json({ source, lines: out, matched: out.filter((l) => l.match).length, total: out.length, hint: out.length ? void 0 : "Aucune ligne reconnue. Format libre : \xAB Riz bris\xE9 sac 25 kg 29,90 \xBB (une ligne par produit)." });
});
vendorRoutes2.post("/vendor/catalog/apply", async (c) => {
  const body3 = z10.object({ lines: z10.array(z10.object({ productId: z10.string().uuid(), packLabel: z10.string().min(1).max(60), packQty: z10.number().positive(), packPrice: z10.number().positive(), inStock: z10.boolean().default(true) })).min(1).max(2e3), replaceMissing: z10.boolean().default(false) }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const vid = c.get("vendorId");
  const ref = new Set((await refProducts()).map((p) => p.id));
  const bad = body3.data.lines.filter((l) => !ref.has(l.productId));
  if (bad.length) return c.json({ error: "Produit hors r\xE9f\xE9rentiel" }, 400);
  const linked = await db.select({ id: suppliers.id, restaurantId: suppliers.restaurantId }).from(suppliers).where(eq21(suppliers.vendorId, vid));
  let created = 0, updated = 0, priceChanges = 0;
  const before = new Map((await db.select().from(vendorOffers).where(eq21(vendorOffers.vendorId, vid))).map((o) => [`${o.productId}|${o.packLabel.toLowerCase()}`, o]));
  const seen = /* @__PURE__ */ new Set();
  for (const l of body3.data.lines) {
    const key = `${l.productId}|${l.packLabel.toLowerCase()}`;
    seen.add(key);
    const prev = before.get(key);
    const packLabel = prev?.packLabel ?? l.packLabel;
    await db.insert(vendorOffers).values({ vendorId: vid, productId: l.productId, packLabel, packQty: l.packQty.toFixed(3), packPriceEur: l.packPrice.toFixed(2), inStock: l.inStock }).onConflictDoUpdate({ target: [vendorOffers.vendorId, vendorOffers.productId, vendorOffers.packLabel], set: { packQty: l.packQty.toFixed(3), packPriceEur: l.packPrice.toFixed(2), inStock: l.inStock, updatedAt: /* @__PURE__ */ new Date() } });
    if (prev) {
      updated++;
      if (n8(prev.packPriceEur) !== l.packPrice) priceChanges++;
    } else created++;
    for (const s of linked) {
      const [so] = await db.insert(supplierOffers).values({ restaurantId: s.restaurantId, supplierId: s.id, productId: l.productId, packLabel, packQty: l.packQty.toFixed(3), packPriceEur: l.packPrice.toFixed(2), inStock: l.inStock }).onConflictDoUpdate({ target: [supplierOffers.supplierId, supplierOffers.productId, supplierOffers.packLabel], set: { packQty: l.packQty.toFixed(3), packPriceEur: l.packPrice.toFixed(2), inStock: l.inStock, lastSeenAt: /* @__PURE__ */ new Date() } }).returning();
      if (!prev || n8(prev.packPriceEur) !== l.packPrice) await db.insert(priceHistory).values({ restaurantId: s.restaurantId, offerId: so.id, unitPriceEur: (l.packPrice / l.packQty).toFixed(4), source: "catalogue" });
    }
  }
  let outOfStock = 0;
  if (body3.data.replaceMissing) {
    for (const [key, o] of before) if (!seen.has(key) && o.inStock) {
      await db.update(vendorOffers).set({ inStock: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq21(vendorOffers.id, o.id));
      outOfStock++;
    }
  }
  await audit("vendor.catalog_import", { actorEmail: c.get("user").email, target: vid, meta: { created, updated, priceChanges, outOfStock } });
  return c.json({ created, updated, priceChanges, outOfStock, propagatedTo: linked.length, message: `Catalogue publi\xE9 : ${created} nouveau(x), ${updated} mis \xE0 jour (${priceChanges} changement(s) de prix)${outOfStock ? `, ${outOfStock} pass\xE9(s) en rupture` : ""}${linked.length ? ` \xB7 r\xE9percut\xE9 chez ${linked.length} restaurant(s)` : ""}.` });
});
vendorRoutes2.post("/vendor/offers/quick", async (c) => {
  const body3 = z10.object({ text: z10.string().min(2).max(300) }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Texte requis" }, 400);
  const db = await getDb();
  const vid = c.get("vendorId");
  const mine = await db.select({ offer: vendorOffers, product: products }).from(vendorOffers).innerJoin(products, eq21(products.id, vendorOffers.productId)).where(eq21(vendorOffers.vendorId, vid));
  if (!mine.length) return c.json({ error: "Aucune offre dans votre catalogue" }, 400);
  const txt = body3.data.text.trim();
  const rupture = /\b(rupture|plus de|epuise|épuisé|indisponible)\b/i.test(txt);
  const dispo = /\b(dispo|disponible|de retour|retour en stock)\b/i.test(txt);
  const parsed = rupture || dispo ? null : parseCatalogText(txt)[0];
  const label = parsed ? parsed.label : txt.replace(/\b(rupture|plus de|epuise|épuisé|indisponible|dispo|disponible|de retour|retour en stock)\b/gi, " ").trim();
  const ents = mine.map(({ offer, product }) => ({ id: offer.id, name: `${product.name} ${offer.packLabel}`, aliases: [product.name, ...product.aliases] }));
  const cands = bestMatchesLocal(label, ents, parsed?.packQty);
  const top = cands[0];
  if (!top) return c.json({ error: `Produit \xAB ${label} \xBB introuvable dans votre catalogue` }, 404);
  const row = mine.find((m) => m.offer.id === top.id);
  const set = { updatedAt: /* @__PURE__ */ new Date() };
  if (parsed) set.packPriceEur = parsed.price.toFixed(2);
  if (rupture) set.inStock = false;
  if (dispo) set.inStock = true;
  await db.update(vendorOffers).set(set).where(eq21(vendorOffers.id, row.offer.id));
  const linked = await db.select({ id: suppliers.id, restaurantId: suppliers.restaurantId }).from(suppliers).where(eq21(suppliers.vendorId, vid));
  for (const s of linked) {
    const [so] = await db.update(supplierOffers).set({ ...parsed ? { packPriceEur: parsed.price.toFixed(2) } : {}, ...rupture ? { inStock: false } : {}, ...dispo ? { inStock: true } : {}, lastSeenAt: /* @__PURE__ */ new Date() }).where(and19(eq21(supplierOffers.supplierId, s.id), eq21(supplierOffers.productId, row.product.id), eq21(supplierOffers.packLabel, row.offer.packLabel))).returning();
    if (so && parsed) await db.insert(priceHistory).values({ restaurantId: s.restaurantId, offerId: so.id, unitPriceEur: (parsed.price / n8(row.offer.packQty)).toFixed(4), source: "catalogue" });
  }
  const what = parsed ? `${eur9(n8(row.offer.packPriceEur))} \u2192 ${eur9(parsed.price)}` : rupture ? "pass\xE9 en rupture" : "de nouveau disponible";
  return c.json({ offerId: row.offer.id, productName: row.product.name, packLabel: row.offer.packLabel, message: `${row.product.name} (${row.offer.packLabel}) : ${what}${linked.length ? ` \xB7 ${linked.length} restaurant(s) pr\xE9venus` : ""}.` });
});
function bestMatchesLocal(label, ents, qty3) {
  return ents.map((e) => {
    let s = Math.max(similarity(label, e.name), ...e.aliases.map((a) => similarity(label, a)));
    if (qty3 && new RegExp(`\\b${qty3}\\b`).test(e.name)) s += 0.1;
    return { id: e.id, score: s };
  }).filter((m) => m.score >= 0.5).sort((a, b) => b.score - a.score);
}
vendorRoutes2.get("/vendor/analytics", async (c) => {
  const db = await getDb();
  const vid = c.get("vendorId");
  const [v] = await db.select().from(vendors).where(eq21(vendors.id, vid));
  const okStatus = sql15`${orders.status} in ('confirmee','livree','livree_partiel')`;
  const since = sql15`${orders.createdAt} >= now() - interval '90 days'`;
  const byProduct = await db.select({ productId: products.id, name: products.name, category: products.category, unit: products.baseUnit, packs: sql15`sum(${orderLines.packs})`, qty: sql15`sum(${orderLines.quantity})`, revenue: sql15`sum(${orderLines.lineTotalEur})`, orders: sql15`count(distinct ${orders.id})`, restaurants: sql15`count(distinct ${orders.restaurantId})` }).from(orderLines).innerJoin(orders, eq21(orders.id, orderLines.orderId)).innerJoin(products, eq21(products.id, orderLines.productId)).where(and19(eq21(orders.vendorId, vid), okStatus, since)).groupBy(products.id, products.name, products.category, products.baseUnit).orderBy(sql15`sum(${orderLines.lineTotalEur}) desc`).limit(25);
  const topCustomers = await db.select({ restaurantId: restaurants.id, name: restaurants.name, city: restaurants.city, orders: sql15`count(*)`, revenue: sql15`sum(${orders.totalEur})`, last: sql15`max(${orders.createdAt})` }).from(orders).innerJoin(restaurants, eq21(restaurants.id, orders.restaurantId)).where(and19(eq21(orders.vendorId, vid), okStatus)).groupBy(restaurants.id, restaurants.name, restaurants.city).orderBy(sql15`sum(${orders.totalEur}) desc`).limit(10);
  const monthly = await db.select({ month: sql15`to_char(date_trunc('month', ${orders.createdAt}), 'YYYY-MM')`, revenue: sql15`sum(${orders.totalEur})`, orders: sql15`count(*)`, restaurants: sql15`count(distinct ${orders.restaurantId})` }).from(orders).where(and19(eq21(orders.vendorId, vid), okStatus, sql15`${orders.createdAt} >= date_trunc('month', now()) - interval '5 months'`)).groupBy(sql15`1`).orderBy(sql15`1`);
  const [funnel] = await db.select({ total: sql15`count(*)`, refused: sql15`count(*) filter (where ${orders.status} = 'annulee')`, avgDecisionH: sql15`coalesce(avg(extract(epoch from (${orders.vendorDecisionAt} - ${orders.sentAt}))/3600) filter (where ${orders.vendorDecisionAt} is not null), 0)` }).from(orders).where(and19(eq21(orders.vendorId, vid), since));
  const allR = await db.select({ id: restaurants.id, city: restaurants.city, postalCode: restaurants.postalCode }).from(restaurants);
  const myZones = v.deliveryZones.map((z21) => z21.trim().toLowerCase());
  const inZone = allR.filter((r) => myZones.length === 0 || [...restaurantZones(r)].some((z21) => myZones.includes(z21.toLowerCase()))).map((r) => r.id);
  let uncovered = [];
  if (inZone.length) {
    const mine = new Set((await db.select({ productId: vendorOffers.productId }).from(vendorOffers).where(eq21(vendorOffers.vendorId, vid))).map((x) => x.productId));
    const demand = await db.select({ productId: products.id, name: products.name, category: products.category, unit: products.baseUnit, restaurants: sql15`count(distinct ${inventoryItems.restaurantId})` }).from(inventoryItems).innerJoin(products, eq21(products.id, inventoryItems.productId)).where(and19(inArray9(inventoryItems.restaurantId, inZone), sql15`${products.restaurantId} is null`)).groupBy(products.id, products.name, products.category, products.baseUnit).orderBy(sql15`count(distinct ${inventoryItems.restaurantId}) desc`).limit(60);
    uncovered = demand.filter((d) => !mine.has(d.productId) && (v.categories.length === 0 || v.categories.includes(d.category))).slice(0, 20).map((d) => ({ ...d, restaurants: n8(d.restaurants) }));
  }
  const alerts2 = await db.select({ message: leads.message, c: sql15`count(*)` }).from(leads).where(and19(eq21(leads.source, "vitrine"), sql15`${leads.createdAt} >= now() - interval '90 days'`)).groupBy(leads.message).orderBy(sql15`count(*) desc`).limit(10);
  const num3 = (o) => Object.fromEntries(Object.entries(o).map(([k, val]) => [k, typeof val === "string" && /^-?\d+(\.\d+)?$/.test(val) ? Number(val) : val]));
  return c.json({
    period: "90 jours",
    byProduct: byProduct.map(num3),
    topCustomers: topCustomers.map(num3),
    monthly: monthly.map(num3),
    funnel: num3(funnel),
    uncovered,
    restaurantsInZone: inZone.length,
    alerts: alerts2.map((a) => ({ product: (a.message ?? "").replace(/^Alerte produit : /, ""), count: n8(a.c) }))
  });
});
async function buildOrderDoc(orderId, kind) {
  const db = await getDb();
  const [o] = await db.select({ order: orders, r: restaurants, v: vendors }).from(orders).innerJoin(restaurants, eq21(restaurants.id, orders.restaurantId)).leftJoin(vendors, eq21(vendors.id, orders.vendorId)).where(eq21(orders.id, orderId));
  if (!o) return null;
  const lines = await db.select({ l: orderLines, name: products.name, unit: products.baseUnit }).from(orderLines).innerJoin(products, eq21(products.id, orderLines.productId)).where(eq21(orderLines.orderId, orderId));
  const [owner] = await db.select({ email: users.email }).from(restaurantMembers).innerJoin(users, eq21(users.id, restaurantMembers.userId)).where(and19(eq21(restaurantMembers.restaurantId, o.r.id), eq21(restaurantMembers.role, "owner")));
  const STATUS = { envoyee: "En attente de confirmation", confirmee: "Confirm\xE9e", livree: "Livr\xE9e", livree_partiel: "Livr\xE9e avec \xE9carts", annulee: "Annul\xE9e" };
  let vendor = { name: o.v?.name ?? "Fournisseur", city: o.v?.city, email: o.v?.contactEmail, phone: o.v?.contactPhone ?? o.v?.whatsapp };
  if (!o.v) {
    const [s] = await db.select().from(suppliers).where(eq21(suppliers.id, o.order.supplierId));
    if (s) vendor = { name: s.name, city: s.city, email: s.email, phone: s.phone ?? s.whatsapp };
  }
  return { doc: orderPdf({
    kind,
    reference: o.order.reference,
    date: o.order.createdAt,
    status: STATUS[o.order.status] ?? o.order.status,
    expectedAt: o.order.expectedAt ? new Date(o.order.expectedAt) : null,
    notes: o.order.notes,
    vendor,
    restaurant: { name: o.r.name, address: o.r.address, city: o.r.city, email: owner?.email },
    lines: lines.map((x) => ({ productName: x.name, packLabel: x.l.packLabel, packs: x.l.packs, quantity: n8(x.l.quantity), unit: x.unit, unitPriceEur: n8(x.l.unitPriceEur), lineTotalEur: n8(x.l.lineTotalEur) })),
    totalEur: n8(o.order.totalEur),
    deliveryFeeEur: n8(o.order.deliveryFeeEur)
  }), order: o.order };
}
vendorRoutes2.get("/vendor/orders/:id/pdf", async (c) => {
  const kind = c.req.query("type") === "livraison" ? "bon_livraison" : "bon_commande";
  const r = await buildOrderDoc(c.req.param("id"), kind);
  if (!r || r.order.vendorId !== c.get("vendorId")) return c.json({ error: "Commande introuvable" }, 404);
  return new Response(new Uint8Array(r.doc), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${r.order.reference}-${kind}.pdf"` } });
});
var routeSchema = z10.object({ name: z10.string().min(2).max(60), weekday: z10.number().int().min(0).max(6), zones: z10.array(z10.string().min(1).max(40)).max(50).default([]), slots: z10.array(z10.string().min(2).max(20)).max(8).default([]), cutoffDaysBefore: z10.number().int().min(0).max(7).default(1), cutoffTime: z10.string().regex(/^\d{2}:\d{2}$/).default("14:00"), capacity: z10.number().int().positive().max(500).nullable().optional(), active: z10.boolean().default(true) });
vendorRoutes2.get("/vendor/routes", async (c) => {
  const db = await getDb();
  const vid = c.get("vendorId");
  const rows = await db.select().from(vendorRoutes).where(eq21(vendorRoutes.vendorId, vid)).orderBy(vendorRoutes.weekday, vendorRoutes.name);
  const since = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const load = await db.select({ routeId: orders.routeId, date: orders.expectedAt, count: sql15`count(*)` }).from(orders).where(and19(eq21(orders.vendorId, vid), sql15`${orders.routeId} is not null`, sql15`${orders.expectedAt} >= ${since}`, sql15`${orders.status} not in ('annulee')`)).groupBy(orders.routeId, orders.expectedAt);
  return c.json({ routes: rows, upcoming: load.map((l) => ({ ...l, count: n8(l.count) })) });
});
vendorRoutes2.post("/vendor/routes", async (c) => {
  const body3 = routeSchema.safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Tourn\xE9e invalide (nom, jour 0\u20136, heure limite HH:MM)" }, 400);
  const db = await getDb();
  const [r] = await db.insert(vendorRoutes).values({ ...body3.data, capacity: body3.data.capacity ?? null, vendorId: c.get("vendorId") }).returning();
  return c.json({ route: r }, 201);
});
vendorRoutes2.put("/vendor/routes/:id", async (c) => {
  const body3 = routeSchema.partial().safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Tourn\xE9e invalide" }, 400);
  const db = await getDb();
  const [r] = await db.update(vendorRoutes).set(body3.data).where(and19(eq21(vendorRoutes.id, c.req.param("id")), eq21(vendorRoutes.vendorId, c.get("vendorId")))).returning();
  if (!r) return c.json({ error: "Tourn\xE9e introuvable" }, 404);
  return c.json({ route: r });
});
vendorRoutes2.delete("/vendor/routes/:id", async (c) => {
  const db = await getDb();
  const [r] = await db.delete(vendorRoutes).where(and19(eq21(vendorRoutes.id, c.req.param("id")), eq21(vendorRoutes.vendorId, c.get("vendorId")))).returning();
  if (!r) return c.json({ error: "Tourn\xE9e introuvable" }, 404);
  return c.json({ ok: true });
});

// apps/api/src/routes/manage.ts
init_order_events();
init_orders();
init_restaurant();
var manageRoutes = new Hono11();
manageRoutes.use("*", requireAuth, requireRestaurant);
manageRoutes.on(["POST"], "/suppliers", requireMinRole("manager"));
manageRoutes.on(["PUT"], "/suppliers/:id", requireMinRole("manager"));
manageRoutes.on(["DELETE"], "/suppliers/:id", requireMinRole("owner"));
manageRoutes.on(["POST"], "/suppliers/:id/offers", requireMinRole("manager"));
manageRoutes.on(["PUT"], "/offers/:id", requireMinRole("manager"));
manageRoutes.on(["DELETE"], "/offers/:id", requireMinRole("manager"));
manageRoutes.on(["POST"], "/recipes", requireMinRole("manager"));
manageRoutes.on(["PUT"], "/recipes/:id", requireMinRole("manager"));
manageRoutes.on(["DELETE"], "/recipes/:id", requireMinRole("manager"));
manageRoutes.on(["PUT"], "/orders/:id", requireMinRole("manager"));
manageRoutes.on(["PUT"], "/orders/:id/lines", requireMinRole("manager"));
manageRoutes.on(["POST"], "/orders/:id/proposal", requireMinRole("manager"));
manageRoutes.on(["POST"], "/discrepancies/:id/resolve", requireMinRole("manager"));
var n9 = (v) => v === null || v === void 0 ? 0 : Number(v);
var CHANNELS = ["email", "whatsapp", "telephone", "plateforme"];
var MAX_PACKS_PER_LINE3 = 1e3;
var CATEGORIES = ["feculents", "frais", "viandes_poissons", "epicerie", "boissons", "emballages"];
var supplierBody = z11.object({
  name: z11.string().min(2),
  contactName: z11.string().nullable().optional(),
  email: z11.string().email().nullable().optional().or(z11.literal("")),
  phone: z11.string().nullable().optional(),
  whatsapp: z11.string().nullable().optional(),
  city: z11.string().nullable().optional(),
  categories: z11.array(z11.enum(CATEGORIES)).optional(),
  leadTimeHours: z11.number().int().positive().optional(),
  deliveryDays: z11.array(z11.number().int().min(1).max(7)).optional(),
  minOrderEur: z11.number().nonnegative().optional(),
  deliveryFeeEur: z11.number().nonnegative().optional(),
  preferredChannel: z11.enum(CHANNELS).optional(),
  rating: z11.number().min(0).max(5).nullable().optional(),
  notes: z11.string().nullable().optional(),
  isActive: z11.boolean().optional()
});
manageRoutes.put("/suppliers/:id", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body3 = supplierBody.partial().safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
  const d = body3.data;
  const [row] = await db.update(suppliers).set({
    ...d,
    email: d.email === "" ? null : d.email,
    minOrderEur: d.minOrderEur !== void 0 ? d.minOrderEur.toFixed(2) : void 0,
    deliveryFeeEur: d.deliveryFeeEur !== void 0 ? d.deliveryFeeEur.toFixed(2) : void 0,
    rating: d.rating === null ? null : d.rating !== void 0 ? d.rating.toFixed(1) : void 0
  }).where(and20(eq22(suppliers.id, c.req.param("id")), eq22(suppliers.restaurantId, rid))).returning();
  if (!row) return c.json({ error: "Fournisseur introuvable" }, 404);
  return c.json(row);
});
manageRoutes.delete("/suppliers/:id", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const [row] = await db.update(suppliers).set({ isActive: false }).where(and20(eq22(suppliers.id, c.req.param("id")), eq22(suppliers.restaurantId, rid))).returning({ id: suppliers.id });
  if (!row) return c.json({ error: "Fournisseur introuvable" }, 404);
  await db.update(supplierOffers).set({ inStock: false }).where(eq22(supplierOffers.supplierId, row.id));
  return c.json({ ok: true });
});
var offerBody = z11.object({ productId: z11.string().uuid(), packLabel: z11.string().min(1), packQty: z11.number().positive(), packPrice: z11.number().positive(), inStock: z11.boolean().default(true) });
manageRoutes.post("/suppliers/:id/offers", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const supplierId = c.req.param("id");
  const body3 = offerBody.safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
  const [sup] = await db.select({ id: suppliers.id }).from(suppliers).where(and20(eq22(suppliers.id, supplierId), eq22(suppliers.restaurantId, rid)));
  if (!sup) return c.json({ error: "Fournisseur introuvable" }, 404);
  const d = body3.data;
  const [offer] = await db.insert(supplierOffers).values({ restaurantId: rid, supplierId, productId: d.productId, packLabel: d.packLabel, packQty: d.packQty.toFixed(3), packPriceEur: d.packPrice.toFixed(2), inStock: d.inStock }).onConflictDoUpdate({ target: [supplierOffers.supplierId, supplierOffers.productId, supplierOffers.packLabel], set: { packQty: d.packQty.toFixed(3), packPriceEur: d.packPrice.toFixed(2), inStock: d.inStock, lastSeenAt: /* @__PURE__ */ new Date() } }).returning();
  await db.insert(priceHistory).values({ restaurantId: rid, offerId: offer.id, unitPriceEur: (d.packPrice / d.packQty).toFixed(4), source: "manuel" });
  await db.insert(inventoryItems).values({ restaurantId: rid, productId: d.productId, quantity: "0", criticalLevel: "0" }).onConflictDoNothing();
  return c.json(offer, 201);
});
manageRoutes.put("/offers/:id", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body3 = offerBody.omit({ productId: true }).partial().safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const d = body3.data;
  const [before] = await db.select().from(supplierOffers).where(and20(eq22(supplierOffers.id, c.req.param("id")), eq22(supplierOffers.restaurantId, rid)));
  if (!before) return c.json({ error: "Offre introuvable" }, 404);
  const [offer] = await db.update(supplierOffers).set({
    packLabel: d.packLabel,
    inStock: d.inStock,
    lastSeenAt: /* @__PURE__ */ new Date(),
    packQty: d.packQty !== void 0 ? d.packQty.toFixed(3) : void 0,
    packPriceEur: d.packPrice !== void 0 ? d.packPrice.toFixed(2) : void 0
  }).where(eq22(supplierOffers.id, before.id)).returning();
  const unitBefore = n9(before.packPriceEur) / n9(before.packQty), unitAfter = n9(offer.packPriceEur) / n9(offer.packQty);
  if (Math.abs(unitAfter - unitBefore) > 1e-4) await db.insert(priceHistory).values({ restaurantId: rid, offerId: offer.id, unitPriceEur: unitAfter.toFixed(4), source: "manuel" });
  return c.json({ ...offer, priceChangedPct: unitBefore > 0 ? Math.round((unitAfter - unitBefore) / unitBefore * 1e3) / 10 : null });
});
manageRoutes.delete("/offers/:id", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const [row] = await db.delete(supplierOffers).where(and20(eq22(supplierOffers.id, c.req.param("id")), eq22(supplierOffers.restaurantId, rid))).returning({ id: supplierOffers.id });
  if (!row) return c.json({ error: "Offre introuvable" }, 404);
  return c.json({ ok: true });
});
manageRoutes.get("/prices/:productId/history", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const days2 = Math.min(365, Number(c.req.query("days")) || 90);
  const rows = await db.select({ offerId: priceHistory.offerId, supplierId: supplierOffers.supplierId, supplierName: suppliers.name, packLabel: supplierOffers.packLabel, unitPrice: priceHistory.unitPriceEur, recordedAt: priceHistory.recordedAt, source: priceHistory.source }).from(priceHistory).innerJoin(supplierOffers, eq22(supplierOffers.id, priceHistory.offerId)).innerJoin(suppliers, eq22(suppliers.id, supplierOffers.supplierId)).where(and20(eq22(priceHistory.restaurantId, rid), eq22(supplierOffers.productId, c.req.param("productId")), gte8(priceHistory.recordedAt, new Date(Date.now() - days2 * 864e5)))).orderBy(priceHistory.recordedAt);
  const series = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (!series.has(r.offerId)) series.set(r.offerId, { offerId: r.offerId, supplierId: r.supplierId, supplierName: r.supplierName, packLabel: r.packLabel, points: [] });
    series.get(r.offerId).points.push({ at: r.recordedAt.toISOString(), price: n9(r.unitPrice), source: r.source });
  }
  const out = [...series.values()].map((s) => {
    const first = s.points[0].price, last = s.points[s.points.length - 1].price;
    return { ...s, first, last, changePct: first > 0 ? Math.round((last - first) / first * 1e3) / 10 : null };
  });
  return c.json({ days: days2, series: out });
});
var recipeBody = z11.object({
  name: z11.string().min(2),
  sellingPriceEur: z11.number().nonnegative().nullable().optional(),
  targetMarginPct: z11.number().min(0).max(100).optional(),
  isActive: z11.boolean().optional(),
  ingredients: z11.array(z11.object({ productId: z11.string().uuid(), quantity: z11.number().positive() })).min(1)
});
manageRoutes.post("/recipes", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body3 = recipeBody.safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
  const d = body3.data;
  const [r] = await db.insert(recipes).values({ restaurantId: rid, name: d.name, sellingPriceEur: d.sellingPriceEur != null ? d.sellingPriceEur.toFixed(2) : null, targetMarginPct: (d.targetMarginPct ?? 70).toFixed(2) }).returning();
  await db.insert(recipeIngredients).values(d.ingredients.map((i) => ({ recipeId: r.id, productId: i.productId, quantity: i.quantity.toFixed(4) })));
  await db.insert(inventoryItems).values(d.ingredients.map((i) => ({ restaurantId: rid, productId: i.productId, quantity: "0", criticalLevel: "0" }))).onConflictDoNothing();
  return c.json(r, 201);
});
manageRoutes.put("/recipes/:id", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body3 = recipeBody.partial().safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
  const d = body3.data;
  const [r] = await db.update(recipes).set({
    name: d.name,
    isActive: d.isActive,
    sellingPriceEur: d.sellingPriceEur === null ? null : d.sellingPriceEur !== void 0 ? d.sellingPriceEur.toFixed(2) : void 0,
    targetMarginPct: d.targetMarginPct !== void 0 ? d.targetMarginPct.toFixed(2) : void 0
  }).where(and20(eq22(recipes.id, c.req.param("id")), eq22(recipes.restaurantId, rid))).returning();
  if (!r) return c.json({ error: "Recette introuvable" }, 404);
  if (d.ingredients) {
    await db.delete(recipeIngredients).where(eq22(recipeIngredients.recipeId, r.id));
    await db.insert(recipeIngredients).values(d.ingredients.map((i) => ({ recipeId: r.id, productId: i.productId, quantity: i.quantity.toFixed(4) })));
    await db.insert(inventoryItems).values(d.ingredients.map((i) => ({ restaurantId: rid, productId: i.productId, quantity: "0", criticalLevel: "0" }))).onConflictDoNothing();
  }
  return c.json(r);
});
manageRoutes.delete("/recipes/:id", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const [r] = await db.delete(recipes).where(and20(eq22(recipes.id, c.req.param("id")), eq22(recipes.restaurantId, rid))).returning({ id: recipes.id });
  if (!r) return c.json({ error: "Recette introuvable" }, 404);
  return c.json({ ok: true });
});
manageRoutes.put("/stock/:itemId", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body3 = z11.object({ criticalLevel: z11.number().nonnegative().optional(), targetLevel: z11.number().nonnegative().nullable().optional(), preferredSupplierId: z11.string().uuid().nullable().optional() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const d = body3.data;
  const [row] = await db.update(inventoryItems).set({
    criticalLevel: d.criticalLevel !== void 0 ? d.criticalLevel.toFixed(3) : void 0,
    targetLevel: d.targetLevel === null ? null : d.targetLevel !== void 0 ? d.targetLevel.toFixed(3) : void 0,
    preferredSupplierId: d.preferredSupplierId,
    updatedAt: /* @__PURE__ */ new Date()
  }).where(and20(eq22(inventoryItems.id, c.req.param("itemId")), eq22(inventoryItems.restaurantId, rid))).returning();
  if (!row) return c.json({ error: "Article introuvable" }, 404);
  return c.json(row);
});
manageRoutes.delete("/stock/:itemId", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const [row] = await db.delete(inventoryItems).where(and20(eq22(inventoryItems.id, c.req.param("itemId")), eq22(inventoryItems.restaurantId, rid))).returning({ id: inventoryItems.id });
  if (!row) return c.json({ error: "Article introuvable" }, 404);
  return c.json({ ok: true });
});
manageRoutes.post("/stock/inventory", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const user = c.get("user");
  const body3 = z11.object({ counts: z11.array(z11.object({ itemId: z11.string().uuid(), quantity: z11.number().nonnegative() })).min(1), note: z11.string().optional() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const ids = body3.data.counts.map((x) => x.itemId);
  const items = await db.select().from(inventoryItems).where(and20(eq22(inventoryItems.restaurantId, rid), inArray10(inventoryItems.id, ids)));
  const now = /* @__PURE__ */ new Date();
  let adjusted = 0;
  let totalDelta = 0;
  for (const cnt of body3.data.counts) {
    const it = items.find((i) => i.id === cnt.itemId);
    if (!it) continue;
    const delta = cnt.quantity - n9(it.quantity);
    if (Math.abs(delta) > 5e-4) {
      await db.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: it.id, type: "ajustement", quantity: delta.toFixed(3), note: body3.data.note ?? "Inventaire", createdBy: user.id });
      adjusted++;
      totalDelta += delta;
    }
    await db.update(inventoryItems).set({ quantity: cnt.quantity.toFixed(3), lastCountedAt: now, updatedAt: now }).where(eq22(inventoryItems.id, it.id));
  }
  return c.json({ counted: body3.data.counts.length, adjusted, totalDelta: Math.round(totalDelta * 1e3) / 1e3 });
});
manageRoutes.get("/orders/:id/pdf", async (c) => {
  const r = await buildOrderDoc(c.req.param("id"), "bon_commande");
  if (!r || r.order.restaurantId !== c.get("restaurantId")) return c.json({ error: "Commande introuvable" }, 404);
  return new Response(new Uint8Array(r.doc), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${r.order.reference}.pdf"` } });
});
manageRoutes.get("/orders/:id/message", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const user = c.get("user");
  const [row] = await db.select({ order: orders, supplier: suppliers }).from(orders).innerJoin(suppliers, eq22(suppliers.id, orders.supplierId)).where(and20(eq22(orders.id, c.req.param("id")), eq22(orders.restaurantId, rid)));
  if (!row) return c.json({ error: "Commande introuvable" }, 404);
  const [restaurant] = await db.select().from(restaurants).where(eq22(restaurants.id, rid));
  const lines = await db.select({ line: orderLines, productName: products.name, unit: products.baseUnit }).from(orderLines).innerJoin(products, eq22(products.id, orderLines.productId)).where(eq22(orderLines.orderId, row.order.id));
  const msg = buildOrderMessage({
    reference: row.order.reference,
    restaurantName: restaurant.name,
    senderName: user.fullName,
    senderPhone: user.phone ?? null,
    supplier: { name: row.supplier.name, contactName: row.supplier.contactName, email: row.supplier.email, whatsapp: row.supplier.whatsapp ?? row.supplier.phone },
    expectedAt: row.order.expectedAt,
    notes: row.order.notes,
    total: n9(row.order.totalEur),
    deliveryFee: n9(row.order.deliveryFeeEur),
    lines: lines.map(({ line, productName, unit: unit2 }) => ({ productName, packLabel: line.packLabel, packs: line.packs, quantity: n9(line.quantity), unit: unit2, lineTotal: n9(line.lineTotalEur) }))
  });
  return c.json(msg);
});
manageRoutes.put("/orders/:id", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body3 = z11.object({ status: z11.enum(["preparee", "envoyee", "confirmee", "annulee"]).optional(), expectedAt: z11.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), notes: z11.string().max(2e3).nullable().optional(), channel: z11.enum(CHANNELS).optional() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const [cur] = await db.select().from(orders).where(and20(eq22(orders.id, c.req.param("id")), eq22(orders.restaurantId, rid)));
  if (!cur) return c.json({ error: "Commande introuvable" }, 404);
  if (body3.data.status) {
    const refusal = checkStatusChange(cur.status, body3.data.status);
    if (refusal) return c.json({ error: refusal.error, code: refusal.code }, refusal.status);
  } else if (isReceived(cur)) {
    return c.json({ error: "Commande d\xE9j\xE0 r\xE9ceptionn\xE9e : elle n'est plus modifiable.", code: "order_already_received" }, 409);
  }
  const d = body3.data;
  const [o] = await db.update(orders).set({ status: d.status, expectedAt: d.expectedAt, notes: d.notes, channel: d.channel, sentAt: d.status === "envoyee" && !cur.sentAt ? /* @__PURE__ */ new Date() : void 0 }).where(eq22(orders.id, cur.id)).returning();
  if (d.status && d.status !== cur.status) void logOrderEvent(cur.id, d.status === "annulee" ? "cancelled" : d.status === "confirmee" ? "confirmed" : "note", `Statut modifi\xE9 par le restaurant : ${cur.status} \u2192 ${d.status}`, "restaurant");
  return c.json({ order: o });
});
manageRoutes.put("/orders/:id/lines", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body3 = z11.object({ lines: z11.array(z11.object({ lineId: z11.string().uuid(), packs: z11.number().int().nonnegative().max(MAX_PACKS_PER_LINE3) })).min(1) }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const [cur] = await db.select().from(orders).where(and20(eq22(orders.id, c.req.param("id")), eq22(orders.restaurantId, rid)));
  if (!cur) return c.json({ error: "Commande introuvable" }, 404);
  const refusal = checkLineEdit(cur);
  if (refusal) return c.json({ error: refusal.error, code: refusal.code }, refusal.status);
  if (cur.status !== "preparee") return c.json({ error: "Seule une commande \xAB pr\xE9par\xE9e \xBB peut \xEAtre modifi\xE9e" }, 409);
  const lines = await db.select().from(orderLines).where(eq22(orderLines.orderId, cur.id));
  const asked = await db.select({ line: orderLines, product: products }).from(orderLines).innerJoin(products, eq22(products.id, orderLines.productId)).where(eq22(orderLines.orderId, cur.id));
  const outOfRange = await assertPlausibleQuantity(rid, asked.filter(({ line }) => body3.data.lines.some((x) => x.lineId === line.id)).map(({ line, product }) => {
    const packs = body3.data.lines.find((x) => x.lineId === line.id).packs;
    const packQty = n9(line.quantity) / Math.max(1, line.packs) || 1;
    return { productId: product.id, productName: product.name, unit: product.baseUnit, category: product.category, packQty, packs, quantity: packs * packQty };
  }));
  if (outOfRange) return c.json(outOfRange, 400);
  for (const l of lines) {
    const upd = body3.data.lines.find((x) => x.lineId === l.id);
    if (!upd) continue;
    if (upd.packs === 0) {
      await db.delete(orderLines).where(eq22(orderLines.id, l.id));
      continue;
    }
    const packQty = n9(l.quantity) / l.packs;
    const packPrice = n9(l.lineTotalEur) / l.packs;
    await db.update(orderLines).set({ packs: upd.packs, quantity: (upd.packs * packQty).toFixed(3), lineTotalEur: (upd.packs * packPrice).toFixed(2) }).where(eq22(orderLines.id, l.id));
  }
  const [{ total, count }] = await db.select({ total: sql16`coalesce(sum(${orderLines.lineTotalEur}),0)`, count: sql16`count(*)` }).from(orderLines).where(eq22(orderLines.orderId, cur.id));
  if (n9(count) === 0) {
    await db.update(orders).set({ status: "annulee", totalEur: "0" }).where(eq22(orders.id, cur.id));
    return c.json({ ok: true, cancelled: true });
  }
  const [o] = await db.update(orders).set({ totalEur: n9(total).toFixed(2) }).where(eq22(orders.id, cur.id)).returning();
  return c.json({ order: o });
});
manageRoutes.get("/discrepancies", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const onlyOpen = c.req.query("all") !== "1";
  const rows = await db.select({ d: deliveryDiscrepancies, delivery: deliveries, order: orders, supplierName: suppliers.name, productName: products.name, unit: products.baseUnit, unitPrice: orderLines.unitPriceEur }).from(deliveryDiscrepancies).innerJoin(deliveries, eq22(deliveries.id, deliveryDiscrepancies.deliveryId)).innerJoin(orders, eq22(orders.id, deliveries.orderId)).innerJoin(suppliers, eq22(suppliers.id, orders.supplierId)).innerJoin(orderLines, eq22(orderLines.id, deliveryDiscrepancies.orderLineId)).innerJoin(products, eq22(products.id, orderLines.productId)).where(onlyOpen ? and20(eq22(deliveries.restaurantId, rid), eq22(deliveryDiscrepancies.resolved, false)) : eq22(deliveries.restaurantId, rid)).orderBy(desc10(deliveries.receivedAt)).limit(200);
  const items = rows.map((r) => {
    const missing = n9(r.d.orderedQty) - n9(r.d.receivedQty);
    return { id: r.d.id, deliveryId: r.delivery.id, orderId: r.order.id, vendorId: r.order.vendorId, reference: r.order.reference, supplierName: r.supplierName, productName: r.productName, unit: r.unit, ordered: n9(r.d.orderedQty), received: n9(r.d.receivedQty), missing, valueEur: Math.round(missing * n9(r.unitPrice) * 100) / 100, reason: r.d.reason, resolved: r.d.resolved, receivedAt: r.delivery.receivedAt, isLate: r.delivery.isLate, claimMessage: r.d.claimMessage };
  });
  const openValue = items.filter((i) => !i.resolved && i.missing > 0).reduce((a, i) => a + i.valueEur, 0);
  return c.json({ items, openValue: Math.round(openValue * 100) / 100 });
});
manageRoutes.post("/discrepancies/:id/resolve", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body3 = z11.object({ resolution: z11.enum(["avoir", "relivraison", "abandon"]).default("avoir"), note: z11.string().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const [row] = await db.select({ d: deliveryDiscrepancies, rid: deliveries.restaurantId }).from(deliveryDiscrepancies).innerJoin(deliveries, eq22(deliveries.id, deliveryDiscrepancies.deliveryId)).where(eq22(deliveryDiscrepancies.id, c.req.param("id")));
  if (!row || row.rid !== rid) return c.json({ error: "\xC9cart introuvable" }, 404);
  await db.update(deliveryDiscrepancies).set({ resolved: true, reason: `${row.d.reason ?? "ecart"} \u2192 ${body3.data.resolution}${body3.data.note ? ` (${body3.data.note})` : ""}` }).where(eq22(deliveryDiscrepancies.id, row.d.id));
  await db.update(alerts).set({ isRead: true }).where(and20(eq22(alerts.restaurantId, rid), eq22(alerts.dedupeKey, `ecart:${row.d.deliveryId}`)));
  return c.json({ ok: true });
});
manageRoutes.get("/orders/:id/timeline", async (c) => {
  const db = await getDb();
  const rid = c.get("restaurantId");
  const [o] = await db.select({ id: orders.id, fulfillment: orders.fulfillment, deliverySlot: orders.deliverySlot, driverName: orders.driverName, proofPhoto: orders.proofPhoto, proofSignature: orders.proofSignature, proofReceiverName: orders.proofReceiverName, proofNote: orders.proofNote, vendorDeliveredAt: orders.vendorDeliveredAt, shippedAt: orders.shippedAt, preparedAt: orders.preparedAt, expectedAt: orders.expectedAt, status: orders.status }).from(orders).where(and20(eq22(orders.id, c.req.param("id")), eq22(orders.restaurantId, rid)));
  if (!o) return c.json({ error: "Commande introuvable" }, 404);
  return c.json({ order: o, events: await orderTimeline(o.id) });
});
manageRoutes.post("/orders/:id/proposal", async (c) => {
  const body3 = z11.object({ action: z11.enum(["accept", "decline"]) }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const rid = c.get("restaurantId");
  const user = c.get("user");
  const [o] = await db.select().from(orders).where(and20(eq22(orders.id, c.req.param("id")), eq22(orders.restaurantId, rid)));
  if (!o) return c.json({ error: "Commande introuvable" }, 404);
  if (!o.proposal || o.status !== "envoyee") return c.json({ error: "Aucune proposition en attente" }, 400);
  const [v] = o.vendorId ? await db.select().from(vendors).where(eq22(vendors.id, o.vendorId)) : [];
  if (body3.data.action === "decline") {
    const [upd2] = await db.update(orders).set({ status: "annulee", vendorDecisionAt: /* @__PURE__ */ new Date(), vendorNote: "Proposition de modification refus\xE9e par le restaurant", proposal: null }).where(eq22(orders.id, o.id)).returning();
    void logOrderEvent(o.id, "cancelled", "Proposition refus\xE9e par le restaurant \u2014 commande annul\xE9e", "restaurant");
    if (v?.contactEmail) void sendMail({ to: v.contactEmail, subject: `\u274C ${o.reference} : proposition refus\xE9e, commande annul\xE9e`, text: `Le restaurant a refus\xE9 votre proposition de modification pour la commande ${o.reference}. La commande est annul\xE9e.`, html: `<p>Le restaurant a refus\xE9 votre proposition de modification pour la commande <b>${o.reference}</b>. La commande est annul\xE9e.</p>`, tags: { type: "order_proposal" } });
    return c.json({ order: upd2 });
  }
  const p = o.proposal;
  for (const l of p.lines) {
    if (l.newPacks !== l.packs) {
      if (l.newPacks === 0) await db.delete(orderLines).where(eq22(orderLines.id, l.lineId));
      else {
        const [cur] = await db.select().from(orderLines).where(eq22(orderLines.id, l.lineId));
        if (cur) await db.update(orderLines).set({ packs: l.newPacks, quantity: (Number(cur.quantity) / Number(cur.packs) * l.newPacks).toFixed(3), lineTotalEur: l.newLineTotalEur.toFixed(2) }).where(eq22(orderLines.id, l.lineId));
      }
    }
    if (l.replacement) {
      const r = l.replacement;
      await db.insert(orderLines).values({ orderId: o.id, productId: r.productId, packLabel: r.packLabel, packs: r.packs, quantity: (r.packs * r.packQty).toFixed(3), unitPriceEur: (r.packPriceEur / Math.max(1e-3, r.packQty)).toFixed(4), lineTotalEur: r.lineTotalEur.toFixed(2) });
    }
  }
  const [upd] = await db.update(orders).set({ status: "confirmee", totalEur: p.newTotalEur.toFixed(2), expectedAt: p.expectedAt ?? o.expectedAt, vendorDecisionAt: /* @__PURE__ */ new Date(), vendorNote: p.note ?? "Modification accept\xE9e par le restaurant", proposal: null }).where(eq22(orders.id, o.id)).returning();
  if (v) {
    const amount = p.newTotalEur * Number(v.commissionPct) / 100;
    await db.insert(commissions).values({ vendorId: v.id, orderId: o.id, orderTotalEur: p.newTotalEur.toFixed(2), pct: v.commissionPct, amountEur: amount.toFixed(2), period: (/* @__PURE__ */ new Date()).toISOString().slice(0, 7) }).onConflictDoNothing();
  }
  void logOrderEvent(o.id, "confirmed", `Modification accept\xE9e par le restaurant \u2014 commande confirm\xE9e (${p.newTotalEur.toFixed(2).replace(".", ",")} \u20AC)`, "restaurant", { by: user.email });
  if (v?.contactEmail) void sendMail({ to: v.contactEmail, subject: `\u2705 ${o.reference} : modification accept\xE9e \u2014 \xE0 pr\xE9parer`, text: `Le restaurant a accept\xE9 votre proposition pour la commande ${o.reference}. Nouveau total ${p.newTotalEur.toFixed(2)} \u20AC. La commande est confirm\xE9e : pr\xE9parez-la depuis votre espace.`, html: `<p>Le restaurant a accept\xE9 votre proposition pour la commande <b>${o.reference}</b>. Nouveau total <b>${p.newTotalEur.toFixed(2)} \u20AC</b>. La commande est confirm\xE9e.</p>`, tags: { type: "order_proposal" } });
  return c.json({ order: { ...upd, proofPhoto: void 0, proofSignature: void 0 } });
});

// apps/api/src/app.ts
init_public();

// apps/api/src/routes/storefront.ts
init_reliability();
init_src();
import { Hono as Hono12 } from "hono";
import { z as z12 } from "zod";
import { and as and21, eq as eq23, isNull as isNull8, sql as sql17 } from "drizzle-orm";
var storefrontRoutes = new Hono12();
var n10 = (v) => Number(v ?? 0);
var slugify3 = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
storefrontRoutes.get("/public/catalog", async (c) => {
  const db = await getDb();
  const q2 = (c.req.query("q") ?? "").trim().toLowerCase();
  const cat = c.req.query("category") ?? "";
  const origin = c.req.query("origin") ?? "";
  const rows = await db.select({ id: products.id, name: products.name, aliases: products.aliases, category: products.category, baseUnit: products.baseUnit, origin: products.origin, imageUrl: products.imageUrl }).from(products).where(isNull8(products.restaurantId)).orderBy(products.category, products.name);
  const best = await db.select({ productId: vendorOffers.productId, unit: sql17`min(${vendorOffers.packPriceEur} / nullif(${vendorOffers.packQty}, 0))`, offers: sql17`count(*)`, vendors: sql17`count(distinct ${vendorOffers.vendorId})` }).from(vendorOffers).innerJoin(vendors, eq23(vendors.id, vendorOffers.vendorId)).where(and21(eq23(vendorOffers.inStock, true), eq23(vendors.status, "actif"))).groupBy(vendorOffers.productId);
  const bm = new Map(best.map((b) => [b.productId, b]));
  let items = rows.map((p) => {
    const b = bm.get(p.id);
    return { ...p, slug: slugify3(p.name), fromUnitPrice: b ? Number(Number(b.unit).toFixed(2)) : null, offerCount: b ? n10(b.offers) : 0, vendorCount: b ? n10(b.vendors) : 0 };
  });
  if (cat) items = items.filter((p) => p.category === cat);
  if (origin) items = items.filter((p) => (p.origin ?? "").toLowerCase().includes(origin.toLowerCase()));
  if (q2) items = items.filter((p) => p.name.toLowerCase().includes(q2) || p.aliases.some((a) => a.toLowerCase().includes(q2)) || (p.origin ?? "").toLowerCase().includes(q2));
  items.sort((a, b) => Number(b.fromUnitPrice !== null) - Number(a.fromUnitPrice !== null));
  const origins = [...new Set(rows.map((r) => r.origin).filter(Boolean))].sort();
  const counts = rows.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});
  return c.json({ items: items.map(({ aliases: _a, ...p }) => p), total: items.length, origins, categories: counts, withPrice: items.filter((i) => i.fromUnitPrice !== null).length });
});
storefrontRoutes.get("/public/products/:id", async (c) => {
  const db = await getDb();
  const id = c.req.param("id");
  const [p] = await db.select().from(products).where(and21(eq23(products.id, id), isNull8(products.restaurantId)));
  if (!p) return c.json({ error: "Produit introuvable" }, 404);
  const rows = await db.select({ o: vendorOffers, v: vendors }).from(vendorOffers).innerJoin(vendors, eq23(vendors.id, vendorOffers.vendorId)).where(and21(eq23(vendorOffers.productId, id), eq23(vendors.status, "actif")));
  const offers = rows.map(({ o, v }) => ({
    id: o.id,
    packLabel: o.packLabel,
    packQty: n10(o.packQty),
    packPriceEur: n10(o.packPriceEur),
    unitPrice: Number((n10(o.packPriceEur) / n10(o.packQty)).toFixed(2)),
    inStock: o.inStock,
    updatedAt: o.updatedAt,
    vendor: { id: v.id, name: v.name, slug: v.slug, city: v.city, deliveryZones: v.deliveryZones, leadTimeHours: v.leadTimeHours, minOrderEur: n10(v.minOrderEur), deliveryFeeEur: n10(v.deliveryFeeEur) }
  })).sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.unitPrice - b.unitPrice);
  const similar = await db.select({ id: products.id, name: products.name, category: products.category, baseUnit: products.baseUnit, origin: products.origin }).from(products).where(and21(isNull8(products.restaurantId), eq23(products.category, p.category), sql17`${products.id} <> ${id}`)).limit(8);
  return c.json({ product: { ...p, slug: slugify3(p.name) }, offers, similar: similar.map((s) => ({ ...s, slug: slugify3(s.name) })) });
});
storefrontRoutes.get("/public/vendors", async (c) => {
  const db = await getDb();
  const vs = await db.select().from(vendors).where(eq23(vendors.status, "actif"));
  const counts = await db.select({ vendorId: vendorOffers.vendorId, offers: sql17`count(*)` }).from(vendorOffers).where(eq23(vendorOffers.inStock, true)).groupBy(vendorOffers.vendorId);
  const cm = new Map(counts.map((x) => [x.vendorId, n10(x.offers)]));
  const rel = await reliabilityFor(vs.map((v) => v.id));
  return c.json({ vendors: vs.map((v) => ({ reliability: rel.get(v.id) ?? emptyReliability, id: v.id, name: v.name, slug: v.slug, description: v.description, city: v.city, deliveryZones: v.deliveryZones, categories: v.categories, leadTimeHours: v.leadTimeHours, minOrderEur: n10(v.minOrderEur), deliveryFeeEur: n10(v.deliveryFeeEur), offerCount: cm.get(v.id) ?? 0 })) });
});
storefrontRoutes.post("/public/product-alert", async (c) => {
  const body3 = z12.object({ productId: z12.string().uuid(), email: z12.string().email(), restaurantName: z12.string().min(2).max(120).optional(), city: z12.string().max(80).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const [p] = await db.select({ name: products.name }).from(products).where(eq23(products.id, body3.data.productId));
  if (!p) return c.json({ error: "Produit introuvable" }, 404);
  await db.insert(leads).values({ restaurantName: body3.data.restaurantName ?? "Vitrine", contactName: body3.data.email.split("@")[0], email: body3.data.email, city: body3.data.city ?? null, message: `Alerte produit : ${p.name}`, planInterest: "vitrine", source: "vitrine" });
  return c.json({ ok: true, message: `C'est not\xE9 : vous serez pr\xE9venu d\xE8s qu'un grossiste propose \xAB ${p.name} \xBB.` }, 201);
});

// apps/api/src/routes/reference-admin.ts
init_src();
init_auth();
init_ops();
import { Hono as Hono13 } from "hono";
import { z as z13 } from "zod";
import { and as and22, desc as desc11, eq as eq24, ilike as ilike3, isNull as isNull9, or as or3, sql as sql18 } from "drizzle-orm";
var isAdmin5 = (email) => (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
var CATS = ["feculents", "frais", "viandes_poissons", "epicerie", "boissons", "emballages"];
var UNITS2 = ["kg", "g", "L", "mL", "piece", "botte", "sac", "carton"];
var body2 = z13.object({ name: z13.string().min(2).max(120), aliases: z13.array(z13.string().min(1).max(60)).max(30).default([]), category: z13.enum(CATS), baseUnit: z13.enum(UNITS2), origin: z13.string().max(120).nullable().optional(), shelfLifeDays: z13.number().int().positive().nullable().optional(), imageUrl: z13.string().url().nullable().optional().or(z13.literal("")) });
var referenceAdminRoutes = new Hono13();
referenceAdminRoutes.use("/admin/reference", requireAuth);
referenceAdminRoutes.use("/admin/reference/*", requireAuth);
referenceAdminRoutes.use("/admin/reference", async (c, next) => {
  if (!isAdmin5(c.get("user").email)) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
  await next();
});
referenceAdminRoutes.use("/admin/reference/*", async (c, next) => {
  if (!isAdmin5(c.get("user").email)) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
  await next();
});
referenceAdminRoutes.get("/admin/reference", async (c) => {
  const db = await getDb();
  const q2 = (c.req.query("q") ?? "").trim();
  const cat = c.req.query("category");
  const where = and22(isNull9(products.restaurantId), cat ? eq24(products.category, cat) : void 0, q2 ? or3(ilike3(products.name, `%${q2}%`), sql18`exists (select 1 from unnest(${products.aliases}) a where a ilike ${"%" + q2 + "%"})`) : void 0);
  const rows = await db.select({ p: products, offers: sql18`(select count(*) from vendor_offers o where o.product_id = ${products.id})`, tracked: sql18`(select count(*) from inventory_items i where i.product_id = ${products.id})` }).from(products).where(where).orderBy(products.category, products.name).limit(400);
  const requests = await db.select().from(leads).where(and22(eq24(leads.source, "referentiel"), eq24(leads.status, "nouveau"))).orderBy(desc11(leads.createdAt)).limit(50);
  return c.json({ products: rows.map((r) => ({ ...r.p, offers: Number(r.offers), tracked: Number(r.tracked) })), requests: requests.map((r) => ({ id: r.id, product: (r.message ?? "").replace(/^Produit manquant : /, ""), from: r.restaurantName, email: r.email, notes: r.notes, createdAt: r.createdAt })), categories: CATS, units: UNITS2 });
});
referenceAdminRoutes.post("/admin/reference", async (c) => {
  const b = body2.safeParse(await c.req.json());
  if (!b.success) return c.json({ error: "Donn\xE9es invalides", details: b.error.flatten() }, 400);
  const db = await getDb();
  const d = b.data;
  const [dup] = await db.select({ id: products.id, name: products.name }).from(products).where(and22(isNull9(products.restaurantId), ilike3(products.name, d.name)));
  if (dup) return c.json({ error: `\xAB ${dup.name} \xBB existe d\xE9j\xE0` }, 409);
  const [p] = await db.insert(products).values({ name: d.name, aliases: d.aliases, category: d.category, baseUnit: d.baseUnit, origin: d.origin ?? null, shelfLifeDays: d.shelfLifeDays ?? null, imageUrl: d.imageUrl || null, restaurantId: null }).returning();
  const reqId = c.req.query("request");
  if (reqId) await db.update(leads).set({ status: "client", notes: `Cr\xE9\xE9 : ${p.name}` }).where(eq24(leads.id, reqId));
  await audit("reference.create", { actorEmail: c.get("user").email, target: p.id, meta: { name: p.name } });
  return c.json({ product: p, message: `\xAB ${p.name} \xBB ajout\xE9 au r\xE9f\xE9rentiel : les grossistes peuvent le proposer et les restaurants le suivre.` }, 201);
});
referenceAdminRoutes.put("/admin/reference/:id", async (c) => {
  const b = body2.partial().safeParse(await c.req.json());
  if (!b.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const d = b.data;
  const [p] = await db.update(products).set({ ...d, imageUrl: d.imageUrl === "" ? null : d.imageUrl }).where(and22(eq24(products.id, c.req.param("id")), isNull9(products.restaurantId))).returning();
  if (!p) return c.json({ error: "Produit introuvable" }, 404);
  await audit("reference.update", { actorEmail: c.get("user").email, target: p.id, meta: d });
  return c.json({ product: p });
});
referenceAdminRoutes.post("/admin/reference/:id/merge", async (c) => {
  const b = z13.object({ into: z13.string().uuid() }).safeParse(await c.req.json());
  if (!b.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const from = c.req.param("id");
  const into = b.data.into;
  if (from === into) return c.json({ error: "M\xEAme produit" }, 400);
  const [a] = await db.select().from(products).where(eq24(products.id, from));
  const [t] = await db.select().from(products).where(eq24(products.id, into));
  if (!a || !t) return c.json({ error: "Produit introuvable" }, 404);
  await db.execute(sql18`update vendor_offers set product_id = ${into} where product_id = ${from} and not exists (select 1 from vendor_offers x where x.vendor_id = vendor_offers.vendor_id and x.product_id = ${into} and x.pack_label = vendor_offers.pack_label)`);
  await db.execute(sql18`delete from vendor_offers where product_id = ${from}`);
  await db.execute(sql18`update inventory_items set product_id = ${into} where product_id = ${from} and not exists (select 1 from inventory_items x where x.restaurant_id = inventory_items.restaurant_id and x.product_id = ${into})`);
  await db.execute(sql18`delete from inventory_items where product_id = ${from}`);
  for (const tbl of ["supplier_offers", "order_lines", "stock_movements", "recipe_ingredients", "price_alerts", "sales_lines"]) {
    try {
      await db.execute(sql18.raw(`update ${tbl} set product_id = '${into}' where product_id = '${from}'`));
    } catch {
    }
  }
  await db.update(products).set({ aliases: [.../* @__PURE__ */ new Set([...t.aliases, a.name, ...a.aliases])] }).where(eq24(products.id, into));
  await db.delete(products).where(eq24(products.id, from));
  await audit("reference.merge", { actorEmail: c.get("user").email, target: into, meta: { from: a.name, into: t.name } });
  return c.json({ ok: true, message: `\xAB ${a.name} \xBB fusionn\xE9 dans \xAB ${t.name} \xBB.` });
});
referenceAdminRoutes.post("/admin/reference/requests/:id/dismiss", async (c) => {
  const db = await getDb();
  await db.update(leads).set({ status: "perdu" }).where(eq24(leads.id, c.req.param("id")));
  return c.json({ ok: true });
});
var referenceRequestRoutes = new Hono13();
referenceRequestRoutes.post("/reference/request", requireAuth, async (c) => {
  const b = z13.object({ product: z13.string().min(2).max(120), details: z13.string().max(500).optional(), from: z13.string().max(120).optional() }).safeParse(await c.req.json());
  if (!b.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const u = c.get("user");
  const [existing] = await db.select({ id: products.id, name: products.name }).from(products).where(and22(isNull9(products.restaurantId), or3(ilike3(products.name, b.data.product), sql18`exists (select 1 from unnest(${products.aliases}) a where lower(a) = lower(${b.data.product}))`)));
  if (existing) return c.json({ ok: false, existing, message: `Ce produit existe d\xE9j\xE0 sous le nom \xAB ${existing.name} \xBB.` });
  await db.insert(leads).values({ restaurantName: b.data.from ?? u.fullName ?? "Fournisseur", contactName: u.fullName ?? u.email, email: u.email, message: `Produit manquant : ${b.data.product}`, notes: b.data.details ?? null, source: "referentiel", planInterest: "referentiel" });
  return c.json({ ok: true, message: `Demande envoy\xE9e : \xAB ${b.data.product} \xBB sera ajout\xE9 au r\xE9f\xE9rentiel sous 24 h ouvr\xE9es, vous serez pr\xE9venu.` }, 201);
});

// apps/api/src/routes/admin-dashboard.ts
init_src();
init_auth();
import { Hono as Hono14 } from "hono";
import { desc as desc12, eq as eq25, gte as gte9, isNull as isNull10, sql as sql19 } from "drizzle-orm";
var isAdmin6 = (email) => (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
var n11 = (v) => Number(v ?? 0);
var adminDashboardRoutes = new Hono14();
adminDashboardRoutes.use("/admin/dashboard", requireAuth, async (c, next) => {
  if (!isAdmin6(c.get("user").email)) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
  await next();
});
adminDashboardRoutes.get("/admin/dashboard", async (c) => {
  const db = await getDb();
  const d30 = sql19`now() - interval '30 days'`;
  const d7 = sql19`now() - interval '7 days'`;
  const [u] = await db.select({ total: sql19`count(*)`, w: sql19`count(*) filter (where ${users.createdAt} >= ${d7})`, m: sql19`count(*) filter (where ${users.createdAt} >= ${d30})` }).from(users);
  const [r] = await db.select({ total: sql19`count(*)`, m: sql19`count(*) filter (where ${restaurants.createdAt} >= ${d30})`, trial: sql19`count(*) filter (where ${restaurants.plan} = 'trial')`, paying: sql19`count(*) filter (where ${restaurants.plan} in ('starter','pro','business'))` }).from(restaurants);
  const activeR = await db.select({ c: sql19`count(distinct ${orders.restaurantId})` }).from(orders).where(gte9(orders.createdAt, sql19`now() - interval '30 days'`));
  const [v] = await db.select({ total: sql19`count(*)`, actif: sql19`count(*) filter (where ${vendors.status} = 'actif')`, attente: sql19`count(*) filter (where ${vendors.status} = 'en_attente')` }).from(vendors);
  const [vo] = await db.select({ offers: sql19`count(*)`, inStock: sql19`count(*) filter (where ${vendorOffers.inStock})`, productsCovered: sql19`count(distinct ${vendorOffers.productId})` }).from(vendorOffers);
  const [pr] = await db.select({ ref: sql19`count(*) filter (where ${products.restaurantId} is null)`, priv: sql19`count(*) filter (where ${products.restaurantId} is not null)` }).from(products);
  const [tracked] = await db.select({ c: sql19`count(distinct ${inventoryItems.productId})` }).from(inventoryItems);
  const [o] = await db.select({
    total: sql19`count(*)`,
    m: sql19`count(*) filter (where ${orders.createdAt} >= ${d30})`,
    mkt: sql19`count(*) filter (where ${orders.vendorId} is not null)`,
    mktM: sql19`count(*) filter (where ${orders.vendorId} is not null and ${orders.createdAt} >= ${d30})`,
    gmvM: sql19`coalesce(sum(${orders.totalEur}) filter (where ${orders.vendorId} is not null and ${orders.status} in ('confirmee','livree','livree_partiel') and ${orders.createdAt} >= ${d30}),0)`,
    gmvAll: sql19`coalesce(sum(${orders.totalEur}) filter (where ${orders.vendorId} is not null and ${orders.status} in ('confirmee','livree','livree_partiel')),0)`,
    pending: sql19`count(*) filter (where ${orders.vendorId} is not null and ${orders.status} = 'envoyee')`,
    refused: sql19`count(*) filter (where ${orders.vendorId} is not null and ${orders.status} = 'annulee')`,
    avgDecisionH: sql19`coalesce(avg(extract(epoch from (${orders.vendorDecisionAt} - ${orders.sentAt}))/3600) filter (where ${orders.vendorDecisionAt} is not null), 0)`
  }).from(orders);
  const weekly = await db.select({ week: sql19`to_char(date_trunc('week', ${orders.createdAt}), 'YYYY-MM-DD')`, all: sql19`count(*)`, mkt: sql19`count(*) filter (where ${orders.vendorId} is not null)`, gmv: sql19`coalesce(sum(${orders.totalEur}) filter (where ${orders.vendorId} is not null and ${orders.status} <> 'annulee'),0)` }).from(orders).where(gte9(orders.createdAt, sql19`date_trunc('week', now()) - interval '11 weeks'`)).groupBy(sql19`1`).orderBy(sql19`1`);
  const signups = await db.select({ week: sql19`to_char(date_trunc('week', ${restaurants.createdAt}), 'YYYY-MM-DD')`, c: sql19`count(*)` }).from(restaurants).where(gte9(restaurants.createdAt, sql19`date_trunc('week', now()) - interval '11 weeks'`)).groupBy(sql19`1`).orderBy(sql19`1`);
  const [com] = await db.select({ month: sql19`coalesce(sum(${commissions.amountEur}) filter (where ${commissions.period} = to_char(now(),'YYYY-MM')),0)`, all: sql19`coalesce(sum(${commissions.amountEur}),0)`, uninvoiced: sql19`coalesce(sum(${commissions.amountEur}) filter (where not ${commissions.invoiced}),0)` }).from(commissions);
  const prospectsAgg = await db.select({ kind: prospects.kind, status: prospects.status, c: sql19`count(*)` }).from(prospects).groupBy(prospects.kind, prospects.status);
  const [ld] = await db.select({ total: sql19`count(*)`, m: sql19`count(*) filter (where ${leads.createdAt} >= ${d30})`, vitrine: sql19`count(*) filter (where ${leads.source} = 'vitrine')`, referentiel: sql19`count(*) filter (where ${leads.source} = 'referentiel' and ${leads.status} = 'nouveau')` }).from(leads);
  const demandTop = await db.select({ name: products.name, restaurants: sql19`count(distinct ${inventoryItems.restaurantId})`, covered: sql19`exists (select 1 from vendor_offers o where o.product_id = ${products.id} and o.in_stock)` }).from(inventoryItems).innerJoin(products, eq25(products.id, inventoryItems.productId)).where(isNull10(products.restaurantId)).groupBy(products.id, products.name).orderBy(sql19`count(distinct ${inventoryItems.restaurantId}) desc`).limit(15);
  const topVendors = await db.select({ name: vendors.name, city: vendors.city, status: vendors.status, offers: sql19`(select count(*) from vendor_offers o where o.vendor_id = ${vendors.id})`, orders: sql19`(select count(*) from orders x where x.vendor_id = ${vendors.id})`, gmv: sql19`(select coalesce(sum(total_eur),0) from orders x where x.vendor_id = ${vendors.id} and x.status <> 'annulee')`, linked: sql19`(select count(*) from suppliers s where s.vendor_id = ${vendors.id})` }).from(vendors).orderBy(desc12(vendors.createdAt)).limit(10);
  const topRestaurants = await db.select({ name: restaurants.name, city: restaurants.city, plan: restaurants.plan, createdAt: restaurants.createdAt, orders: sql19`(select count(*) from orders x where x.restaurant_id = ${restaurants.id})`, items: sql19`(select count(*) from inventory_items i where i.restaurant_id = ${restaurants.id})`, suppliers: sql19`(select count(*) from suppliers s where s.restaurant_id = ${restaurants.id})`, lastOrder: sql19`(select max(created_at) from orders x where x.restaurant_id = ${restaurants.id})` }).from(restaurants).orderBy(desc12(restaurants.createdAt)).limit(15);
  const recent = await db.select().from(auditLog).orderBy(desc12(auditLog.at)).limit(30);
  const recentOrders = await db.select({ id: orders.id, reference: orders.reference, status: orders.status, total: orders.totalEur, createdAt: orders.createdAt, restaurant: restaurants.name, vendor: vendors.name }).from(orders).innerJoin(restaurants, eq25(restaurants.id, orders.restaurantId)).leftJoin(vendors, eq25(vendors.id, orders.vendorId)).orderBy(desc12(orders.createdAt)).limit(12);
  const env = { adminEmails: !!process.env.ADMIN_EMAILS, llm: !!process.env.LLM_API_KEY, stripe: !!process.env.STRIPE_SECRET_KEY, resend: !!process.env.RESEND_API_KEY, appUrl: process.env.APP_URL ?? null, vendorAutoApprove: process.env.VENDOR_AUTO_APPROVE === "true" };
  const num3 = (o2) => Object.fromEntries(Object.entries(o2).map(([k, val]) => [k, typeof val === "string" && /^-?\d+(\.\d+)?$/.test(val) ? Number(val) : val]));
  return c.json({
    users: num3(u),
    restaurants: { ...num3(r), active30: n11(activeR[0]?.c) },
    vendors: num3(v),
    offers: num3(vo),
    products: { ...num3(pr), tracked: n11(tracked.c) },
    orders: num3(o),
    commissions: num3(com),
    leads: num3(ld),
    weekly: weekly.map(num3),
    signups: signups.map(num3),
    prospects: prospectsAgg.map(num3),
    demandTop: demandTop.map(num3),
    topVendors: topVendors.map(num3),
    topRestaurants: topRestaurants.map(num3),
    recent,
    recentOrders: recentOrders.map(num3),
    env,
    todo: [
      ...n11(v.attente) ? [{ level: "action", text: `${n11(v.attente)} grossiste(s) en attente de validation`, to: "/app/admin/fournisseurs" }] : [],
      ...n11(ld.referentiel) ? [{ level: "action", text: `${n11(ld.referentiel)} demande(s) de produit manquant`, to: "/app/admin/referentiel" }] : [],
      ...n11(o.pending) ? [{ level: "watch", text: `${n11(o.pending)} commande(s) marketplace en attente de confirmation grossiste`, to: "/app/admin/fournisseurs" }] : [],
      ...!n11(v.actif) ? [{ level: "critical", text: "Aucun grossiste actif : la vitrine affiche \xAB Prix sur demande \xBB partout. Invitez vos 3 premiers grossistes.", to: "/app/admin/prospection" }] : [],
      ...!env.llm ? [{ level: "info", text: "LLM_API_KEY absente : import de tarif par photo et assistant IA d\xE9sactiv\xE9s.", to: null }] : [],
      ...!env.stripe ? [{ level: "info", text: "Stripe non configur\xE9 : abonnements et facturation des commissions inactifs.", to: null }] : []
    ]
  });
});

// apps/api/src/routes/claims.ts
init_src();
init_auth();
init_mailer();
init_sms();
init_order_events();
init_ops();
import { Hono as Hono15 } from "hono";
import { z as z14 } from "zod";
import { and as and24, desc as desc13, eq as eq26, sql as sql20 } from "drizzle-orm";
var APP_URL3 = () => process.env.APP_URL ?? "http://localhost:5173";
var n12 = (v) => v === null || v === void 0 ? 0 : Number(v);
var eur10 = (v) => `${v.toFixed(2).replace(".", ",")} \u20AC`;
var KIND = { manquant: "Manquant", abime: "Ab\xEEm\xE9 / casse", erreur_produit: "Erreur de produit", qualite: "Qualit\xE9 / DLC", autre: "Autre" };
var isAdmin7 = (email) => (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
async function nextClaimRef() {
  const db = await getDb();
  await db.execute(sql20`create sequence if not exists claim_ref_seq`);
  const res = await db.execute(sql20`select nextval('claim_ref_seq') as v`);
  const rows = res.rows ?? res;
  return `LIT-${(/* @__PURE__ */ new Date()).getFullYear()}-${String(Number((Array.isArray(rows) ? rows[0] : rows).v)).padStart(4, "0")}`;
}
async function notifyVendor(vendorId, subject, text2, kind = "order.confirmed") {
  const db = await getDb();
  const [v] = await db.select().from(vendors).where(eq26(vendors.id, vendorId));
  if (!v) return;
  if (v.contactEmail) void sendMail({ to: v.contactEmail, subject, text: text2, html: `<p>${text2.replace(/\n/g, "<br>")}</p><p><a href="${APP_URL3()}/fournisseur">Ouvrir mon espace</a></p>`, tags: { type: "claim" } });
  const phone = v.whatsapp || v.contactPhone;
  if (phone) void sendMessage({ to: phone, prefer: v.whatsapp ? "whatsapp" : "sms", kind, vendorId, body: `AFRISUPPLY \u2014 ${subject}
${text2}
${APP_URL3()}/fournisseur` });
}
async function notifyRestaurant2(restaurantId, subject, text2) {
  const db = await getDb();
  const [r] = await db.select({ settings: restaurants.settings }).from(restaurants).where(eq26(restaurants.id, restaurantId));
  const rcpts = await db.select({ email: users.email }).from(restaurantMembers).innerJoin(users, eq26(users.id, restaurantMembers.userId)).where(eq26(restaurantMembers.restaurantId, restaurantId));
  for (const x of rcpts) void sendMail({ to: x.email, subject, text: text2, html: `<p>${text2.replace(/\n/g, "<br>")}</p><p><a href="${APP_URL3()}/app/achats/ecarts">Voir mes litiges</a></p>`, tags: { type: "claim" } });
  if (r?.settings?.notifyPhone) void sendMessage({ to: r.settings.notifyPhone, kind: "order.confirmed", restaurantId, body: `AFRISUPPLY \u2014 ${subject}
${text2}` });
}
var publicClaim = (c) => ({ ...c, photo: void 0, hasPhoto: !!c.photo, kindLabel: KIND[c.kind] ?? c.kind });
var claimRoutes = new Hono15();
claimRoutes.use("/claims", requireAuth, requireRestaurant);
claimRoutes.use("/claims/*", requireAuth, requireRestaurant);
claimRoutes.get("/claims", async (c) => {
  const db = await getDb();
  const rid = c.get("restaurantId");
  const rows = await db.select({ cl: claims, vendorName: vendors.name, reference: orders.reference }).from(claims).innerJoin(vendors, eq26(vendors.id, claims.vendorId)).innerJoin(orders, eq26(orders.id, claims.orderId)).where(eq26(claims.restaurantId, rid)).orderBy(desc13(claims.createdAt)).limit(200);
  const items = rows.map((r) => ({ ...publicClaim(r.cl), vendorName: r.vendorName, orderReference: r.reference }));
  const credits = items.filter((i) => i.status === "accepte" || i.status === "clos").reduce((a, i) => a + n12(i.creditEur), 0);
  return c.json({ items, openCount: items.filter((i) => ["ouvert", "propose", "escalade"].includes(i.status)).length, creditsEur: Math.round(credits * 100) / 100 });
});
claimRoutes.get("/claims/:id/photo", async (c) => {
  const db = await getDb();
  const rid = c.get("restaurantId");
  const [cl] = await db.select({ photo: claims.photo }).from(claims).where(and24(eq26(claims.id, c.req.param("id")), eq26(claims.restaurantId, rid)));
  if (!cl?.photo) return c.json({ error: "Pas de photo" }, 404);
  return c.json({ photo: cl.photo });
});
claimRoutes.post("/claims", async (c) => {
  const body3 = z14.object({ orderId: z14.string().uuid().optional(), discrepancyId: z14.string().uuid().optional(), productName: z14.string().min(1).max(120).optional(), kind: z14.enum(["manquant", "abime", "erreur_produit", "qualite", "autre"]).default("manquant"), claimedEur: z14.number().nonnegative().optional(), message: z14.string().max(600).optional(), photo: z14.string().max(6e5).optional() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
  const db = await getDb();
  const rid = c.get("restaurantId");
  const user = c.get("user");
  const d = body3.data;
  if (d.photo && !/^data:image\/(jpeg|png|webp);base64,/.test(d.photo)) return c.json({ error: "Photo invalide" }, 400);
  let orderId = d.orderId, productName = d.productName, claimedEur = d.claimedEur, orderedQty = null, receivedQty = null;
  if (d.discrepancyId) {
    const [row] = await db.select({ dd: deliveryDiscrepancies, orderId: deliveries.orderId, rid: deliveries.restaurantId, unitPrice: orderLines.unitPriceEur, productName: products.name }).from(deliveryDiscrepancies).innerJoin(deliveries, eq26(deliveries.id, deliveryDiscrepancies.deliveryId)).innerJoin(orderLines, eq26(orderLines.id, deliveryDiscrepancies.orderLineId)).innerJoin(products, eq26(products.id, orderLines.productId)).where(eq26(deliveryDiscrepancies.id, d.discrepancyId));
    if (!row || row.rid !== rid) return c.json({ error: "\xC9cart introuvable" }, 404);
    const [dup] = await db.select({ id: claims.id }).from(claims).where(eq26(claims.discrepancyId, d.discrepancyId));
    if (dup) return c.json({ error: "Un litige existe d\xE9j\xE0 pour cet \xE9cart" }, 409);
    orderId = row.orderId;
    productName = productName ?? row.productName;
    orderedQty = n12(row.dd.orderedQty);
    receivedQty = n12(row.dd.receivedQty);
    if (claimedEur === void 0) claimedEur = Math.round(Math.max(0, orderedQty - receivedQty) * n12(row.unitPrice) * 100) / 100;
  }
  if (!orderId || !productName) return c.json({ error: "Commande et produit requis" }, 400);
  const [o] = await db.select().from(orders).where(and24(eq26(orders.id, orderId), eq26(orders.restaurantId, rid)));
  if (!o) return c.json({ error: "Commande introuvable" }, 404);
  if (!o.vendorId) return c.json({ error: "Les litiges plateforme ne concernent que les commandes pass\xE9es via un grossiste AFRISUPPLY. Pour un fournisseur priv\xE9, utilisez la r\xE9clamation pr\xE9-r\xE9dig\xE9e." }, 400);
  if (claimedEur === void 0) return c.json({ error: "Montant r\xE9clam\xE9 requis" }, 400);
  const reference = await nextClaimRef();
  const [cl] = await db.insert(claims).values({ restaurantId: rid, vendorId: o.vendorId, orderId: o.id, discrepancyId: d.discrepancyId, reference, productName, kind: d.kind, orderedQty: orderedQty?.toFixed(3), receivedQty: receivedQty?.toFixed(3), claimedEur: claimedEur.toFixed(2), message: d.message, photo: d.photo, createdBy: user.id }).returning();
  const [r] = await db.select({ name: restaurants.name }).from(restaurants).where(eq26(restaurants.id, rid));
  void logOrderEvent(o.id, "note", `Litige ${reference} ouvert \u2014 ${productName} (${KIND[d.kind]}), ${eur10(claimedEur)} r\xE9clam\xE9s`, "restaurant");
  void notifyVendor(o.vendorId, `\u26A0\uFE0F Litige ${reference} \u2014 ${r.name} \u2014 commande ${o.reference}`, `${r.name} signale un probl\xE8me sur la commande ${o.reference} :
\u2022 ${productName} \u2014 ${KIND[d.kind]}${orderedQty !== null ? ` (command\xE9 ${orderedQty}, re\xE7u ${receivedQty})` : ""}
\u2022 Montant r\xE9clam\xE9 : ${eur10(claimedEur)}${d.message ? `
Message : ${d.message}` : ""}

R\xE9pondez sous 48 h : avoir, relivraison ou refus motiv\xE9.`);
  return c.json({ claim: publicClaim(cl), message: `Litige ${reference} envoy\xE9 \xE0 votre fournisseur. R\xE9ponse attendue sous 48 h.` }, 201);
});
claimRoutes.post("/claims/:id/close", async (c) => {
  const body3 = z14.object({ action: z14.enum(["accept", "escalate"]), message: z14.string().max(600).optional() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const rid = c.get("restaurantId");
  const [cl] = await db.select().from(claims).where(and24(eq26(claims.id, c.req.param("id")), eq26(claims.restaurantId, rid)));
  if (!cl) return c.json({ error: "Litige introuvable" }, 404);
  if (!["propose", "refuse", "accepte"].includes(cl.status)) return c.json({ error: "En attente de la r\xE9ponse du fournisseur" }, 400);
  if (body3.data.action === "accept") {
    const [upd2] = await db.update(claims).set({ status: "clos", closedAt: /* @__PURE__ */ new Date() }).where(eq26(claims.id, cl.id)).returning();
    if (cl.discrepancyId) {
      await db.update(deliveryDiscrepancies).set({ resolved: true, reason: `litige \u2192 ${cl.resolution ?? "clos"}` }).where(eq26(deliveryDiscrepancies.id, cl.discrepancyId));
    }
    void logOrderEvent(cl.orderId, "note", `Litige ${cl.reference} clos \u2014 ${cl.resolution === "avoir" ? `avoir ${eur10(n12(cl.creditEur))}` : cl.resolution ?? ""}`, "restaurant");
    return c.json({ claim: publicClaim(upd2) });
  }
  const [upd] = await db.update(claims).set({ status: "escalade", message: body3.data.message ? `${cl.message ?? ""}
[Escalade] ${body3.data.message}`.trim() : cl.message }).where(eq26(claims.id, cl.id)).returning();
  void logOrderEvent(cl.orderId, "note", `Litige ${cl.reference} escalad\xE9 \xE0 AFRISUPPLY`, "restaurant");
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const to of admins) void sendMail({ to, subject: `\u{1F6A8} Litige escalad\xE9 ${cl.reference} (${eur10(n12(cl.claimedEur))})`, text: `Le restaurant conteste la r\xE9ponse du grossiste.
Litige : ${cl.reference} \u2014 ${cl.productName} \u2014 r\xE9clam\xE9 ${eur10(n12(cl.claimedEur))}, propos\xE9 ${cl.resolution ?? "\u2014"} ${cl.creditEur ? eur10(n12(cl.creditEur)) : ""}.
Message : ${body3.data.message ?? "\u2014"}
${APP_URL3()}/app/admin/litiges`, html: `<p>Litige <b>${cl.reference}</b> escalad\xE9 \u2014 ${cl.productName}, r\xE9clam\xE9 ${eur10(n12(cl.claimedEur))}.</p><p><a href="${APP_URL3()}/app/admin/litiges">Arbitrer</a></p>`, tags: { type: "claim" } });
  return c.json({ claim: publicClaim(upd), message: "AFRISUPPLY a \xE9t\xE9 pr\xE9venu et arbitrera sous 3 jours ouvr\xE9s." });
});
var vendorClaimRoutes = new Hono15();
var vendorGuard = async (c, next) => {
  const db = await getDb();
  const rows = await db.select({ vendorId: vendorMembers.vendorId }).from(vendorMembers).where(eq26(vendorMembers.userId, c.get("user").id));
  const w = c.req.header("x-vendor-id");
  const vid = w && rows.some((r) => r.vendorId === w) ? w : rows[0]?.vendorId;
  if (!vid) return c.json({ error: "Aucun espace fournisseur" }, 403);
  c.set("vendorId", vid);
  await next();
};
vendorClaimRoutes.use("/vendor/claims", requireAuth, vendorGuard);
vendorClaimRoutes.use("/vendor/claims/*", requireAuth, vendorGuard);
vendorClaimRoutes.get("/vendor/claims", async (c) => {
  const db = await getDb();
  const vid = c.get("vendorId");
  const rows = await db.select({ cl: claims, restaurantName: restaurants.name, reference: orders.reference }).from(claims).innerJoin(restaurants, eq26(restaurants.id, claims.restaurantId)).innerJoin(orders, eq26(orders.id, claims.orderId)).where(eq26(claims.vendorId, vid)).orderBy(desc13(claims.createdAt)).limit(200);
  const items = rows.map((r) => ({ ...publicClaim(r.cl), photo: r.cl.photo, restaurantName: r.restaurantName, orderReference: r.reference }));
  return c.json({ items, openCount: items.filter((i) => i.status === "ouvert" || i.status === "escalade").length, creditsEur: Math.round(items.reduce((a, i) => a + n12(i.creditEur), 0) * 100) / 100 });
});
vendorClaimRoutes.post("/vendor/claims/:id/respond", async (c) => {
  const body3 = z14.object({ resolution: z14.enum(["avoir", "relivraison", "refus"]), creditEur: z14.number().nonnegative().optional(), message: z14.string().max(600).optional() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const vid = c.get("vendorId");
  const d = body3.data;
  const [cl] = await db.select().from(claims).where(and24(eq26(claims.id, c.req.param("id")), eq26(claims.vendorId, vid)));
  if (!cl) return c.json({ error: "Litige introuvable" }, 404);
  if (!["ouvert", "propose"].includes(cl.status)) return c.json({ error: `Litige ${cl.status}` }, 400);
  if (d.resolution === "refus" && !d.message) return c.json({ error: "Un refus doit \xEAtre motiv\xE9" }, 400);
  const credit = d.resolution === "avoir" ? d.creditEur ?? n12(cl.claimedEur) : 0;
  if (d.resolution === "avoir" && credit <= 0) return c.json({ error: "Montant de l\u2019avoir requis" }, 400);
  const full = d.resolution === "avoir" && credit >= n12(cl.claimedEur) - 5e-3;
  const status = d.resolution === "refus" ? "refuse" : full ? "accepte" : "propose";
  const [upd] = await db.update(claims).set({ status, resolution: d.resolution, creditEur: d.resolution === "avoir" ? credit.toFixed(2) : null, vendorMessage: d.message, vendorRespondedAt: /* @__PURE__ */ new Date() }).where(eq26(claims.id, cl.id)).returning();
  const [v] = await db.select({ name: vendors.name }).from(vendors).where(eq26(vendors.id, vid));
  const label = d.resolution === "avoir" ? `avoir de ${eur10(credit)}${full ? "" : ` (sur ${eur10(n12(cl.claimedEur))} r\xE9clam\xE9s)`}` : d.resolution === "relivraison" ? "relivraison du manquant" : `refus : ${d.message}`;
  void logOrderEvent(cl.orderId, "note", `Litige ${cl.reference} \u2014 r\xE9ponse de ${v.name} : ${label}`, "vendor");
  void notifyRestaurant2(cl.restaurantId, `${d.resolution === "refus" ? "\u274C" : "\u2705"} Litige ${cl.reference} \u2014 r\xE9ponse de ${v.name}`, `${v.name} r\xE9pond au litige ${cl.reference} (${cl.productName}) : ${label}.${d.message && d.resolution !== "refus" ? `
Message : ${d.message}` : ""}
${full ? "L\u2019avoir est \xE0 d\xE9duire de votre prochaine facture chez ce fournisseur." : "Acceptez la r\xE9ponse ou contestez aupr\xE8s d\u2019AFRISUPPLY dans Achats \u2192 \xC9carts & litiges."}`);
  await audit("claim.respond", { actorEmail: c.get("user").email, target: cl.id, meta: { resolution: d.resolution, credit } });
  return c.json({ claim: publicClaim(upd) });
});
var adminClaimRoutes = new Hono15();
adminClaimRoutes.use("/admin/claims/*", requireAuth, async (c, next) => {
  if (!isAdmin7(c.get("user").email)) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
  await next();
});
adminClaimRoutes.use("/admin/claims", requireAuth, async (c, next) => {
  if (!isAdmin7(c.get("user").email)) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
  await next();
});
adminClaimRoutes.get("/admin/claims", async (c) => {
  const db = await getDb();
  const rows = await db.select({ cl: claims, restaurantName: restaurants.name, vendorName: vendors.name, reference: orders.reference }).from(claims).innerJoin(restaurants, eq26(restaurants.id, claims.restaurantId)).innerJoin(vendors, eq26(vendors.id, claims.vendorId)).innerJoin(orders, eq26(orders.id, claims.orderId)).orderBy(desc13(claims.createdAt)).limit(300);
  return c.json({ items: rows.map((r) => ({ ...publicClaim(r.cl), photo: r.cl.photo, restaurantName: r.restaurantName, vendorName: r.vendorName, orderReference: r.reference })) });
});
adminClaimRoutes.post("/admin/claims/:id/arbitrate", async (c) => {
  const body3 = z14.object({ resolution: z14.enum(["avoir", "relivraison", "refus"]), creditEur: z14.number().nonnegative().optional(), message: z14.string().min(2).max(600) }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const d = body3.data;
  const [cl] = await db.select().from(claims).where(eq26(claims.id, c.req.param("id")));
  if (!cl) return c.json({ error: "Introuvable" }, 404);
  const credit = d.resolution === "avoir" ? d.creditEur ?? n12(cl.claimedEur) : 0;
  const [upd] = await db.update(claims).set({ status: "clos", resolution: d.resolution, creditEur: d.resolution === "avoir" ? credit.toFixed(2) : null, vendorMessage: `[Arbitrage AFRISUPPLY] ${d.message}`, closedAt: /* @__PURE__ */ new Date() }).where(eq26(claims.id, cl.id)).returning();
  if (cl.discrepancyId) await db.update(deliveryDiscrepancies).set({ resolved: true, reason: `arbitrage \u2192 ${d.resolution}` }).where(eq26(deliveryDiscrepancies.id, cl.discrepancyId));
  const txt = `D\xE9cision AFRISUPPLY sur le litige ${cl.reference} (${cl.productName}) : ${d.resolution === "avoir" ? `avoir de ${eur10(credit)}` : d.resolution}. ${d.message}`;
  void logOrderEvent(cl.orderId, "note", `Litige ${cl.reference} arbitr\xE9 par AFRISUPPLY : ${d.resolution}${credit ? ` ${eur10(credit)}` : ""}`, "system");
  void notifyRestaurant2(cl.restaurantId, `\u2696\uFE0F Litige ${cl.reference} \u2014 d\xE9cision AFRISUPPLY`, txt);
  void notifyVendor(cl.vendorId, `\u2696\uFE0F Litige ${cl.reference} \u2014 d\xE9cision AFRISUPPLY`, txt);
  await audit("claim.arbitrate", { actorEmail: c.get("user").email, target: cl.id, meta: { resolution: d.resolution, credit } });
  return c.json({ claim: publicClaim(upd) });
});

// apps/api/src/routes/reviews.ts
init_src();
init_auth();
init_order_events();
init_reliability();
import { Hono as Hono16 } from "hono";
import { z as z15 } from "zod";
import { and as and25, desc as desc14, eq as eq27, sql as sql21 } from "drizzle-orm";
var pub = (r, restaurantName) => ({ id: r.id, rating: r.rating, onTime: r.onTime, conform: r.conform, comment: r.comment, vendorReply: r.vendorReply, createdAt: r.createdAt, restaurantName: restaurantName.length > 2 ? `${restaurantName.slice(0, 1)}${"*".repeat(Math.min(6, restaurantName.length - 2))}${restaurantName.slice(-1)}` : restaurantName, city: null });
var publicReviewRoutes = new Hono16();
publicReviewRoutes.get("/public/vendors/:id/reviews", async (c) => {
  const db = await getDb();
  const vid = c.req.param("id");
  const rows = await db.select({ r: vendorReviews, name: restaurants.name, city: restaurants.city }).from(vendorReviews).innerJoin(restaurants, eq27(restaurants.id, vendorReviews.restaurantId)).where(eq27(vendorReviews.vendorId, vid)).orderBy(desc14(vendorReviews.createdAt)).limit(50);
  return c.json({ reliability: (await reliabilityFor([vid])).get(vid) ?? emptyReliability, reviews: rows.map((x) => ({ ...pub(x.r, x.name), city: x.city })) });
});
var reviewRoutes = new Hono16();
reviewRoutes.use("/reviews", requireAuth, requireRestaurant);
reviewRoutes.use("/reviews/*", requireAuth, requireRestaurant);
reviewRoutes.use("/orders/:id/review", requireAuth, requireRestaurant);
reviewRoutes.get("/reviews/pending", async (c) => {
  const db = await getDb();
  const rid = c.get("restaurantId");
  const rows = await db.select({ id: orders.id, reference: orders.reference, deliveredAt: sql21`coalesce(${orders.deliveredAt}, ${orders.vendorDeliveredAt})`, status: orders.status, vendorName: vendors.name, vendorId: vendors.id, reviewed: vendorReviews.id }).from(orders).innerJoin(vendors, eq27(vendors.id, orders.vendorId)).leftJoin(vendorReviews, eq27(vendorReviews.orderId, orders.id)).where(and25(eq27(orders.restaurantId, rid))).orderBy(desc14(sql21`coalesce(${orders.deliveredAt}, ${orders.vendorDeliveredAt}, ${orders.createdAt})`)).limit(100);
  return c.json({ pending: rows.filter((r) => !r.reviewed && (["livree", "livree_partiel"].includes(r.status) || r.deliveredAt)).slice(0, 10), reviewedOrderIds: rows.filter((r) => r.reviewed).map((r) => r.id) });
});
reviewRoutes.post("/orders/:id/review", async (c) => {
  const body3 = z15.object({ rating: z15.number().int().min(1).max(5), onTime: z15.boolean().optional(), conform: z15.boolean().optional(), comment: z15.string().max(500).optional() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const rid = c.get("restaurantId");
  const user = c.get("user");
  const [o] = await db.select().from(orders).where(and25(eq27(orders.id, c.req.param("id")), eq27(orders.restaurantId, rid)));
  if (!o?.vendorId) return c.json({ error: "Commande plateforme introuvable" }, 404);
  if (!["livree", "livree_partiel"].includes(o.status) && !o.vendorDeliveredAt) return c.json({ error: "Vous pourrez noter apr\xE8s la r\xE9ception de la commande" }, 400);
  const [dup] = await db.select({ id: vendorReviews.id }).from(vendorReviews).where(eq27(vendorReviews.orderId, o.id));
  if (dup) return c.json({ error: "Commande d\xE9j\xE0 not\xE9e" }, 409);
  const [r] = await db.insert(vendorReviews).values({ vendorId: o.vendorId, restaurantId: rid, orderId: o.id, rating: body3.data.rating, onTime: body3.data.onTime, conform: body3.data.conform, comment: body3.data.comment, createdBy: user.id }).returning();
  void logOrderEvent(o.id, "note", `Avis du restaurant : ${"\u2605".repeat(body3.data.rating)}${"\u2606".repeat(5 - body3.data.rating)}${body3.data.comment ? ` \u2014 ${body3.data.comment.slice(0, 80)}` : ""}`, "restaurant");
  return c.json({ review: r, message: "Merci ! Votre avis aide les autres restaurants et le fournisseur \xE0 progresser." }, 201);
});
var vendorReviewRoutes = new Hono16();
var guard = async (c, next) => {
  const db = await getDb();
  const rows = await db.select({ vendorId: vendorMembers.vendorId }).from(vendorMembers).where(eq27(vendorMembers.userId, c.get("user").id));
  const w = c.req.header("x-vendor-id");
  const vid = w && rows.some((r) => r.vendorId === w) ? w : rows[0]?.vendorId;
  if (!vid) return c.json({ error: "Aucun espace fournisseur" }, 403);
  c.set("vendorId", vid);
  await next();
};
vendorReviewRoutes.use("/vendor/reviews", requireAuth, guard);
vendorReviewRoutes.use("/vendor/reviews/*", requireAuth, guard);
vendorReviewRoutes.get("/vendor/reviews", async (c) => {
  const db = await getDb();
  const vid = c.get("vendorId");
  const rows = await db.select({ r: vendorReviews, name: restaurants.name, reference: orders.reference }).from(vendorReviews).innerJoin(restaurants, eq27(restaurants.id, vendorReviews.restaurantId)).innerJoin(orders, eq27(orders.id, vendorReviews.orderId)).where(eq27(vendorReviews.vendorId, vid)).orderBy(desc14(vendorReviews.createdAt)).limit(100);
  return c.json({ reliability: (await reliabilityFor([vid])).get(vid) ?? emptyReliability, reviews: rows.map((x) => ({ ...x.r, restaurantName: x.name, orderReference: x.reference })) });
});
vendorReviewRoutes.post("/vendor/reviews/:id/reply", async (c) => {
  const body3 = z15.object({ reply: z15.string().min(2).max(500) }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "R\xE9ponse requise" }, 400);
  const db = await getDb();
  const vid = c.get("vendorId");
  const [r] = await db.update(vendorReviews).set({ vendorReply: body3.data.reply, vendorRepliedAt: /* @__PURE__ */ new Date() }).where(and25(eq27(vendorReviews.id, c.req.param("id")), eq27(vendorReviews.vendorId, vid))).returning();
  if (!r) return c.json({ error: "Avis introuvable" }, 404);
  return c.json({ review: r });
});

// apps/api/src/routes/jobs.ts
init_src();
init_auth();
init_daily();
init_digest();
init_mailer();
init_reminders();
init_sms();
import { Hono as Hono17 } from "hono";
import { z as z16 } from "zod";
import { eq as eq28 } from "drizzle-orm";
var jobsRoutes = new Hono17();
var runDaily = async (c) => {
  const secret2 = process.env.CRON_SECRET;
  const auth = c.req.header("authorization");
  const given = c.req.header("x-cron-secret") ?? (auth?.startsWith("Bearer ") ? auth.slice(7) : void 0) ?? c.req.query("secret");
  if (!secret2) return c.json({ error: "CRON_SECRET non configur\xE9" }, 503);
  if (given !== secret2) return c.json({ error: "Secret cron invalide" }, 401);
  const dryRun = c.req.query("dryRun") === "1";
  return c.json(await runDailyForAll({ dryRun }));
};
jobsRoutes.post("/jobs/daily", runDaily);
var runReminders = async (c) => {
  const secret2 = process.env.CRON_SECRET;
  const auth = c.req.header("authorization");
  const given = c.req.header("x-cron-secret") ?? (auth?.startsWith("Bearer ") ? auth.slice(7) : void 0) ?? c.req.query("secret");
  if (!secret2 || given !== secret2) return c.json({ error: "Secret cron invalide" }, 401);
  return c.json(await remindPendingVendorOrders());
};
jobsRoutes.get("/jobs/reminders", runReminders);
jobsRoutes.post("/jobs/reminders", runReminders);
jobsRoutes.get("/jobs/daily", runDaily);
var settingsRoutes = new Hono17();
settingsRoutes.use("*", requireAuth, requireRestaurant);
settingsRoutes.on(["PUT"], "/settings", requireMinRole("manager"));
settingsRoutes.on(["POST"], "/digest/send-test", requireMinRole("manager"));
settingsRoutes.on(["POST"], "/settings/test-sms", requireMinRole("manager"));
settingsRoutes.get("/settings", async (c) => {
  const db = await getDb();
  const [r] = await db.select().from(restaurants).where(eq28(restaurants.id, c.get("restaurantId")));
  const s = r.settings ?? {};
  return c.json({ restaurant: { id: r.id, name: r.name, city: r.city, coversPerDay: r.coversPerDay, plan: r.plan, trialEndsAt: r.trialEndsAt }, settings: { priceIncreaseAlertPct: s.priceIncreaseAlertPct ?? 8, forecastHorizonDays: s.forecastHorizonDays ?? 7, autoReorderEnabled: s.autoReorderEnabled ?? true, dailyDigestEnabled: s.dailyDigestEnabled ?? true, notifyPhone: s.notifyPhone ?? "", digestRecipients: s.digestRecipients ?? [], closedWeekdays: s.closedWeekdays ?? [] }, mail: { transport: mailerConfig().transport, from: mailerConfig().from }, sms: { configured: smsConfig().enabled, whatsapp: smsConfig().whatsapp } });
});
settingsRoutes.put("/settings", async (c) => {
  const body3 = z16.object({
    name: z16.string().min(2).optional(),
    city: z16.string().nullable().optional(),
    coversPerDay: z16.number().int().positive().nullable().optional(),
    priceIncreaseAlertPct: z16.number().min(1).max(50).optional(),
    forecastHorizonDays: z16.number().int().min(3).max(14).optional(),
    autoReorderEnabled: z16.boolean().optional(),
    dailyDigestEnabled: z16.boolean().optional(),
    digestRecipients: z16.array(z16.string().email()).max(10).optional(),
    closedWeekdays: z16.array(z16.number().int().min(0).max(6)).optional(),
    notifyPhone: z16.string().max(30).optional()
  }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
  const db = await getDb();
  const rid = c.get("restaurantId");
  const [r] = await db.select().from(restaurants).where(eq28(restaurants.id, rid));
  const { name, city, coversPerDay, ...settingsPatch } = body3.data;
  if (settingsPatch.notifyPhone !== void 0) {
    const p = normalizePhone(settingsPatch.notifyPhone);
    if (settingsPatch.notifyPhone && !p) return c.json({ error: "Num\xE9ro de t\xE9l\xE9phone invalide (ex. 06 12 34 56 78 ou +33612345678)" }, 400);
    settingsPatch.notifyPhone = p ?? "";
  }
  const [row] = await db.update(restaurants).set({ name, city, coversPerDay, settings: { ...r.settings ?? {}, ...settingsPatch } }).where(eq28(restaurants.id, rid)).returning();
  return c.json({ ok: true, settings: row.settings });
});
settingsRoutes.get("/digest/preview", async (c) => {
  const { input } = await buildDigestForRestaurant(c.get("restaurantId"));
  const d = buildDigest({ ...input, firstName: c.get("user").fullName.split(" ")[0] || "chef" });
  if (c.req.query("format") === "html") return c.html(d.html);
  return c.json({ subject: d.subject, text: d.text, html: d.html, isEmpty: d.isEmpty });
});
settingsRoutes.post("/digest/send-test", async (c) => {
  const res = await runDailyForRestaurant(c.get("restaurantId"), { force: true });
  const { preview: _p, ...rest } = res;
  return c.json(rest);
});
settingsRoutes.post("/settings/test-sms", async (c) => {
  const db = await getDb();
  const [r] = await db.select().from(restaurants).where(eq28(restaurants.id, c.get("restaurantId")));
  const to = r.settings?.notifyPhone;
  if (!to) return c.json({ error: "Renseignez d\u2019abord un num\xE9ro" }, 400);
  const res = await sendMessage({ to, kind: "test", restaurantId: r.id, body: `AFRISUPPLY \u2014 test : vous recevrez ici le suivi de vos commandes (${r.name}).` });
  return c.json({ ...res, configured: smsConfig().enabled });
});

// apps/api/src/app.ts
init_src();

// apps/api/src/routes/account.ts
init_src();
init_auth();
init_ops();
import { Hono as Hono18 } from "hono";
import { z as z17 } from "zod";
import { and as and26, eq as eq29, inArray as inArray11 } from "drizzle-orm";
import { deleteCookie as deleteCookie2 } from "hono/cookie";
var accountRoutes = new Hono18();
accountRoutes.use("/account/*", requireAuth);
accountRoutes.on(["GET"], "/account/export", requireMinRole("manager"));
accountRoutes.on(["DELETE"], "/account", requireMinRole("owner"));
accountRoutes.get("/account/export", async (c) => {
  const db = await getDb();
  const u = c.get("user");
  const [me] = await db.select({ id: users.id, email: users.email, fullName: users.fullName, phone: users.phone, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt }).from(users).where(eq29(users.id, u.id));
  const memberships = await db.select({ restaurant: restaurants, role: restaurantMembers.role }).from(restaurantMembers).innerJoin(restaurants, eq29(restaurants.id, restaurantMembers.restaurantId)).where(eq29(restaurantMembers.userId, u.id));
  const out = [];
  for (const m of memberships) {
    const rid = m.restaurant.id;
    const [sup, prod, inv, ord, sal, rec, al, rules, del, mov] = await Promise.all([
      db.select().from(suppliers).where(eq29(suppliers.restaurantId, rid)),
      db.select().from(products).where(eq29(products.restaurantId, rid)),
      db.select().from(inventoryItems).where(eq29(inventoryItems.restaurantId, rid)),
      db.select().from(orders).where(eq29(orders.restaurantId, rid)),
      db.select().from(sales).where(eq29(sales.restaurantId, rid)),
      db.select().from(recipes).where(eq29(recipes.restaurantId, rid)),
      db.select().from(alerts).where(eq29(alerts.restaurantId, rid)),
      db.select().from(reorderRules).where(eq29(reorderRules.restaurantId, rid)),
      db.select().from(deliveries).where(eq29(deliveries.restaurantId, rid)),
      db.select().from(stockMovements).where(eq29(stockMovements.restaurantId, rid))
    ]);
    const orderIds = ord.map((o) => o.id);
    const supIds = sup.map((s) => s.id);
    const [lines, offers, prices] = await Promise.all([
      orderIds.length ? db.select().from(orderLines).where(inArray11(orderLines.orderId, orderIds)) : [],
      supIds.length ? db.select().from(supplierOffers).where(inArray11(supplierOffers.supplierId, supIds)) : [],
      db.select().from(priceHistory).where(eq29(priceHistory.restaurantId, rid))
    ]);
    out.push({ restaurant: m.restaurant, role: m.role, suppliers: sup, supplierOffers: offers, priceHistory: prices, products: prod, inventory: inv, stockMovements: mov, orders: ord, orderLines: lines, deliveries: del, sales: sal, recipes: rec, alerts: al, reorderRules: rules });
  }
  void audit("account.export", { actorEmail: u.email, target: u.id });
  c.header("Content-Disposition", `attachment; filename="afrisupply-export-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json"`);
  return c.json({ exportedAt: (/* @__PURE__ */ new Date()).toISOString(), user: me, restaurants: out });
});
accountRoutes.delete("/account", async (c) => {
  const body3 = z17.object({ password: z17.string(), confirm: z17.literal("SUPPRIMER") }).safeParse(await c.req.json().catch(() => ({})));
  if (!body3.success) return c.json({ error: "Mot de passe et confirmation \xAB SUPPRIMER \xBB requis" }, 400);
  const db = await getDb();
  const u = c.get("user");
  const [me] = await db.select().from(users).where(eq29(users.id, u.id));
  if (!me || !await verifyPassword(body3.data.password, me.passwordHash)) return c.json({ error: "Mot de passe incorrect" }, 401);
  const mine = await db.select({ rid: restaurantMembers.restaurantId, role: restaurantMembers.role }).from(restaurantMembers).where(eq29(restaurantMembers.userId, u.id));
  const deleted = [];
  const left = [];
  for (const m of mine) {
    const others = await db.select({ id: restaurantMembers.userId }).from(restaurantMembers).where(and26(eq29(restaurantMembers.restaurantId, m.rid), eq29(restaurantMembers.role, "owner")));
    const soleOwner = m.role === "owner" && others.every((o) => o.id === u.id);
    if (soleOwner) {
      await db.delete(restaurants).where(eq29(restaurants.id, m.rid));
      deleted.push(m.rid);
    } else left.push(m.rid);
  }
  await db.delete(users).where(eq29(users.id, u.id));
  await audit("account.delete", { actorEmail: u.email, target: u.id, meta: { restaurantsDeleted: deleted.length, restaurantsLeft: left.length } });
  deleteCookie2(c, "afs_token", { path: "/" });
  return c.json({ ok: true, restaurantsDeleted: deleted.length, restaurantsLeft: left.length });
});

// apps/api/src/routes/members.ts
init_src();
init_auth();
import { Hono as Hono19 } from "hono";
import { z as z18 } from "zod";
import { and as and27, eq as eq30, ne, sql as sql22 } from "drizzle-orm";
import { randomBytes as randomBytes3 } from "node:crypto";
init_mailer();
init_ops();
var memberRoutes = new Hono19();
memberRoutes.use("*", requireAuth, requireRestaurant);
var ROLES = ["owner", "manager", "staff"];
var membersOf = async (rid) => await getDb().then((db) => db.select({
  userId: restaurantMembers.userId,
  role: restaurantMembers.role,
  createdAt: restaurantMembers.createdAt,
  email: users.email,
  fullName: users.fullName,
  lastLoginAt: users.lastLoginAt
}).from(restaurantMembers).innerJoin(users, eq30(users.id, restaurantMembers.userId)).where(eq30(restaurantMembers.restaurantId, rid)));
var countOwners = async (rid) => {
  const db = await getDb();
  const [row] = await db.select({ n: sql22`count(*)` }).from(restaurantMembers).where(and27(eq30(restaurantMembers.restaurantId, rid), eq30(restaurantMembers.role, "owner")));
  return Number(row?.n ?? 0);
};
memberRoutes.get("/members", async (c) => {
  const rid = c.get("restaurantId");
  const list = await membersOf(rid);
  return c.json({
    members: list.map((m) => ({ ...m, isYou: m.userId === c.get("user").id })),
    me: { userId: c.get("user").id, role: c.get("role") },
    roles: ROLES.map((r) => ({
      role: r,
      label: r === "owner" ? "Propri\xE9taire" : r === "manager" ? "Responsable" : "\xC9quipe",
      can: r === "owner" ? ["tout"] : r === "manager" ? ["fournisseurs", "recettes", "commandes", "\xE9carts", "r\xE9glages", "export des donn\xE9es"] : ["stock", "inventaire", "r\xE9ception", "ventes", "saisie express", "listes de courses"]
    }))
  });
});
memberRoutes.post("/members", requireMinRole("owner"), async (c) => {
  const body3 = z18.object({
    email: z18.string().email(),
    fullName: z18.string().min(2).optional(),
    role: z18.enum(ROLES).default("staff")
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
  const db = await getDb();
  const rid = c.get("restaurantId");
  const me = c.get("user");
  const email = body3.data.email.toLowerCase();
  const [r] = await db.select({ name: restaurants.name }).from(restaurants).where(eq30(restaurants.id, rid));
  let [user] = await db.select().from(users).where(eq30(users.email, email));
  let invited = false;
  if (!user) {
    const [created] = await db.insert(users).values({
      email,
      passwordHash: await hashPassword(randomBytes3(24).toString("base64url")),
      fullName: body3.data.fullName ?? email.split("@")[0]
    }).returning();
    user = created;
    invited = true;
  }
  const existing = await db.select({ role: restaurantMembers.role }).from(restaurantMembers).where(and27(eq30(restaurantMembers.restaurantId, rid), eq30(restaurantMembers.userId, user.id)));
  if (existing.length) return c.json({ error: `${user.fullName} fait d\xE9j\xE0 partie de l'\xE9quipe (${existing[0].role === "owner" ? "propri\xE9taire" : existing[0].role === "manager" ? "responsable" : "\xE9quipe"}).` }, 409);
  await db.insert(restaurantMembers).values({ restaurantId: rid, userId: user.id, role: body3.data.role });
  let devLink;
  if (invited) {
    const { link, expiryMinutes } = await issuePasswordLink(user.id, { path: "bienvenue", requestedIp: c.req.header("x-forwarded-for") ?? null, ttlMinutes: 7 * 24 * 60 });
    const res = await sendMail({
      to: email,
      subject: `${me.fullName} vous invite sur AFRISUPPLY \u2014 ${r?.name ?? "restaurant"}`,
      text: `Bonjour,

${me.fullName} vous ouvre l'acc\xE8s \xE0 AFRISUPPLY pour \xAB ${r?.name ?? "le restaurant"} \xBB avec le r\xF4le ${body3.data.role}.

Choisissez votre mot de passe (lien personnel, valable ${Math.round(expiryMinutes / 1440)} jours) : ${link}

\xC0 bient\xF4t,
AFRISUPPLY`,
      html: `<p>Bonjour,</p><p><b>${me.fullName}</b> vous ouvre l\u2019acc\xE8s \xE0 AFRISUPPLY pour \xAB ${r?.name ?? "le restaurant"} \xBB avec le r\xF4le <b>${body3.data.role}</b>.</p><p><a href="${link}">Choisir mon mot de passe</a> (lien personnel, valable ${Math.round(expiryMinutes / 1440)} jours).</p><p>\xC0 bient\xF4t,<br/>AFRISUPPLY</p>`,
      tags: { type: "member_invite" }
    });
    if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production") devLink = link;
    void audit("member.invite", { actorEmail: me.email, target: email, meta: { role: body3.data.role, transport: res.transport } });
  } else {
    void audit("member.add", { actorEmail: me.email, target: email, meta: { role: body3.data.role } });
  }
  return c.json({
    ok: true,
    invited,
    message: invited ? `${email} a re\xE7u un lien pour choisir son mot de passe et rejoindre l'\xE9quipe (${body3.data.role}).` : `${user.fullName} a \xE9t\xE9 ajout\xE9 \xE0 l'\xE9quipe avec le r\xF4le ${body3.data.role}.`,
    ...devLink ? { devLink } : {}
  }, 201);
});
memberRoutes.patch("/members/:userId", requireMinRole("owner"), async (c) => {
  const body3 = z18.object({ role: z18.enum(ROLES) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body3.success) return c.json({ error: "R\xF4le invalide" }, 400);
  const db = await getDb();
  const rid = c.get("restaurantId");
  const target = c.req.param("userId");
  const [row] = await db.select().from(restaurantMembers).where(and27(eq30(restaurantMembers.restaurantId, rid), eq30(restaurantMembers.userId, target)));
  if (!row) return c.json({ error: "Membre introuvable" }, 404);
  if (row.role === "owner" && body3.data.role !== "owner" && await countOwners(rid) <= 1) {
    return c.json({ error: "Impossible : il doit rester au moins un propri\xE9taire. Nommez d\u2019abord quelqu\u2019un d\u2019autre propri\xE9taire." }, 409);
  }
  await db.update(restaurantMembers).set({ role: body3.data.role }).where(and27(eq30(restaurantMembers.restaurantId, rid), eq30(restaurantMembers.userId, target)));
  void audit("member.role", { actorEmail: c.get("user").email, target, meta: { from: row.role, to: body3.data.role } });
  return c.json({ ok: true, role: body3.data.role });
});
memberRoutes.delete("/members/:userId", requireMinRole("owner"), async (c) => {
  const db = await getDb();
  const rid = c.get("restaurantId");
  const target = c.req.param("userId");
  if (target === c.get("user").id) return c.json({ error: "Vous ne pouvez pas vous retirer vous-m\xEAme : transf\xE9rez d\u2019abord la propri\xE9t\xE9 du compte." }, 409);
  const [row] = await db.select().from(restaurantMembers).where(and27(eq30(restaurantMembers.restaurantId, rid), eq30(restaurantMembers.userId, target)));
  if (!row) return c.json({ error: "Membre introuvable" }, 404);
  if (row.role === "owner" && await countOwners(rid) <= 1) return c.json({ error: "Impossible : il doit rester au moins un propri\xE9taire." }, 409);
  await db.delete(restaurantMembers).where(and27(eq30(restaurantMembers.restaurantId, rid), eq30(restaurantMembers.userId, target)));
  const [other] = await db.select({ n: sql22`count(*)` }).from(restaurantMembers).where(and27(eq30(restaurantMembers.userId, target), ne(restaurantMembers.restaurantId, rid)));
  if (Number(other?.n ?? 0) === 0) await db.delete(users).where(eq30(users.id, target));
  void audit("member.remove", { actorEmail: c.get("user").email, target, meta: { role: row.role, accountDeleted: Number(other?.n ?? 0) === 0 } });
  return c.json({ ok: true });
});

// apps/api/src/routes/quick.ts
init_src();
init_auth();
import { Hono as Hono20 } from "hono";
import { z as z19 } from "zod";
import { and as and28, eq as eq31, inArray as inArray12, sql as sql23 } from "drizzle-orm";
var quickRoutes = new Hono20();
quickRoutes.use("*", requireAuth, requireRestaurant);
var n13 = (v) => v === null || v === void 0 ? 0 : Number(v);
async function entities(rid) {
  const db = await getDb();
  const [recs, items] = await Promise.all([
    db.select({ id: recipes.id, name: recipes.name }).from(recipes).where(and28(eq31(recipes.restaurantId, rid), eq31(recipes.isActive, true))),
    db.select({ id: inventoryItems.id, name: products.name, aliases: products.aliases, unit: products.baseUnit }).from(inventoryItems).innerJoin(products, eq31(products.id, inventoryItems.productId)).where(eq31(inventoryItems.restaurantId, rid))
  ]);
  return { recipes: recs, products: items.map((i) => ({ id: i.id, name: i.name, aliases: i.aliases, unit: i.unit })) };
}
quickRoutes.post("/quick/parse", async (c) => {
  const body3 = z19.object({ text: z19.string().min(2).max(500), kind: z19.enum(["vente", "comptage", "reception", "perte"]).optional() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Texte requis" }, 400);
  const ctx = await entities(c.get("restaurantId"));
  return c.json(parseQuick(body3.data.text, ctx, body3.data.kind));
});
quickRoutes.post("/quick/apply", async (c) => {
  const body3 = z19.object({
    kind: z19.enum(["vente", "comptage", "reception", "perte"]),
    day: z19.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    note: z19.string().max(200).optional(),
    lines: z19.array(z19.object({ id: z19.string().uuid(), qty: z19.number().nonnegative() })).min(1).max(60)
  }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
  const rid = c.get("restaurantId");
  const db = await getDb();
  const user = c.get("user");
  const d = body3.data;
  const day = d.day ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  if (d.kind === "vente") {
    const ids2 = d.lines.map((l) => l.id);
    const valid = new Set((await db.select({ id: recipes.id }).from(recipes).where(and28(eq31(recipes.restaurantId, rid), inArray12(recipes.id, ids2)))).map((r) => r.id));
    const prev = new Map((await db.select().from(sales).where(and28(eq31(sales.restaurantId, rid), eq31(sales.day, day)))).map((p) => [p.recipeId, p.portions]));
    let applied2 = 0;
    let consumed = 0;
    for (const l of d.lines) {
      if (!valid.has(l.id)) continue;
      const portions = Math.round(l.qty);
      const delta = portions - (prev.get(l.id) ?? 0);
      await db.insert(sales).values({ restaurantId: rid, recipeId: l.id, day, portions }).onConflictDoUpdate({ target: [sales.restaurantId, sales.recipeId, sales.day], set: { portions } });
      applied2++;
      if (delta === 0) continue;
      const ings = await db.select().from(recipeIngredients).where(eq31(recipeIngredients.recipeId, l.id));
      for (const ing of ings) {
        const [item] = await db.select().from(inventoryItems).where(and28(eq31(inventoryItems.restaurantId, rid), eq31(inventoryItems.productId, ing.productId)));
        if (!item) continue;
        const q2 = n13(ing.quantity) * delta;
        if (!q2) continue;
        await db.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: item.id, type: "consommation", quantity: (-q2).toFixed(3), note: `Saisie express ventes ${day}`, createdBy: user.id });
        await db.update(inventoryItems).set({ quantity: Math.max(0, n13(item.quantity) - q2).toFixed(3), updatedAt: /* @__PURE__ */ new Date() }).where(eq31(inventoryItems.id, item.id));
        consumed++;
      }
    }
    return c.json({ ok: true, kind: d.kind, day, applied: applied2, stockLinesUpdated: consumed });
  }
  const ids = d.lines.map((l) => l.id);
  const items = await db.select().from(inventoryItems).where(and28(eq31(inventoryItems.restaurantId, rid), inArray12(inventoryItems.id, ids)));
  const byId = new Map(items.map((i) => [i.id, i]));
  let applied = 0;
  for (const l of d.lines) {
    const item = byId.get(l.id);
    if (!item) continue;
    const type = d.kind === "comptage" ? "ajustement" : d.kind === "reception" ? "reception" : "perte";
    const delta = type === "ajustement" ? l.qty - n13(item.quantity) : type === "reception" ? l.qty : -l.qty;
    if (type !== "ajustement" && delta === 0) continue;
    await db.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: item.id, type, quantity: delta.toFixed(3), note: d.note ?? "Saisie express", createdBy: user.id });
    await db.update(inventoryItems).set({ quantity: Math.max(0, n13(item.quantity) + delta).toFixed(3), updatedAt: /* @__PURE__ */ new Date(), ...type === "ajustement" ? { lastCountedAt: /* @__PURE__ */ new Date() } : {} }).where(eq31(inventoryItems.id, item.id));
    applied++;
  }
  return c.json({ ok: true, kind: d.kind, applied });
});
quickRoutes.get("/quick/inventory", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const rows = await db.select({ id: inventoryItems.id, name: products.name, unit: products.baseUnit, category: products.category, quantity: inventoryItems.quantity, criticalLevel: inventoryItems.criticalLevel, lastCountedAt: inventoryItems.lastCountedAt }).from(inventoryItems).innerJoin(products, eq31(products.id, inventoryItems.productId)).where(eq31(inventoryItems.restaurantId, rid));
  const items = rows.map((r) => ({ ...r, quantity: n13(r.quantity), criticalLevel: n13(r.criticalLevel), daysSinceCount: r.lastCountedAt ? Math.floor((Date.now() - new Date(r.lastCountedAt).getTime()) / 864e5) : null })).sort((a, b) => (a.daysSinceCount ?? 999) === (b.daysSinceCount ?? 999) ? a.name.localeCompare(b.name) : (b.daysSinceCount ?? 999) - (a.daysSinceCount ?? 999));
  const [{ counted7 }] = await db.select({ counted7: sql23`count(*) filter (where ${inventoryItems.lastCountedAt} > now() - interval '7 days')` }).from(inventoryItems).where(eq31(inventoryItems.restaurantId, rid));
  return c.json({ items, total: items.length, countedLast7Days: n13(counted7) });
});
quickRoutes.post("/quick/invoice", async (c) => {
  const body3 = z19.object({ image: z19.string().startsWith("data:image/").max(8e6) }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Image requise (data URL, \u2264 6 Mo)" }, 400);
  const rid = c.get("restaurantId");
  const db = await getDb();
  const res = await extractInvoiceFromImage(body3.data.image);
  if (!res.ok) return c.json({ error: res.error }, 503);
  const ctx = await entities(rid);
  const sups = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(eq31(suppliers.restaurantId, rid));
  const supplier = res.data.supplierName ? bestMatches(res.data.supplierName, sups, 1)[0] ?? null : null;
  const lines = res.data.lines.map((l) => {
    const cands = bestMatches(l.label, ctx.products);
    return { ...l, match: cands[0] && cands[0].score >= 0.6 ? cands[0] : null, candidates: cands };
  });
  return c.json({ supplierName: res.data.supplierName ?? null, supplier, date: res.data.date ?? null, total: res.data.total ?? null, lines, matched: lines.filter((l) => l.match).length });
});
quickRoutes.post("/quick/invoice/apply", async (c) => {
  const body3 = z19.object({
    supplierId: z19.string().uuid().optional(),
    date: z19.string().optional(),
    note: z19.string().max(200).optional(),
    lines: z19.array(z19.object({ inventoryItemId: z19.string().uuid(), qty: z19.number().positive(), unitPrice: z19.number().positive().optional() })).min(1).max(80)
  }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides", details: body3.error.flatten() }, 400);
  const rid = c.get("restaurantId");
  const db = await getDb();
  const user = c.get("user");
  const d = body3.data;
  const items = await db.select().from(inventoryItems).where(and28(eq31(inventoryItems.restaurantId, rid), inArray12(inventoryItems.id, d.lines.map((l) => l.inventoryItemId))));
  const byId = new Map(items.map((i) => [i.id, i]));
  let received = 0;
  let pricesUpdated = 0;
  if (d.supplierId) {
    const [s] = await db.select({ id: suppliers.id }).from(suppliers).where(and28(eq31(suppliers.id, d.supplierId), eq31(suppliers.restaurantId, rid)));
    if (!s) return c.json({ error: "Fournisseur introuvable" }, 404);
  }
  for (const l of d.lines) {
    const item = byId.get(l.inventoryItemId);
    if (!item) continue;
    await db.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: item.id, type: "reception", quantity: l.qty.toFixed(3), note: d.note ?? `Facture ${d.date ?? ""}`.trim(), createdBy: user.id });
    await db.update(inventoryItems).set({ quantity: (n13(item.quantity) + l.qty).toFixed(3), updatedAt: /* @__PURE__ */ new Date() }).where(eq31(inventoryItems.id, item.id));
    received++;
    if (d.supplierId && l.unitPrice) {
      const [offer] = await db.insert(supplierOffers).values({ restaurantId: rid, supplierId: d.supplierId, productId: item.productId, packLabel: "facture", packQty: "1.000", packPriceEur: l.unitPrice.toFixed(2), inStock: true }).onConflictDoUpdate({ target: [supplierOffers.supplierId, supplierOffers.productId, supplierOffers.packLabel], set: { packPriceEur: l.unitPrice.toFixed(2), lastSeenAt: /* @__PURE__ */ new Date() } }).returning();
      await db.insert(priceHistory).values({ restaurantId: rid, offerId: offer.id, unitPriceEur: l.unitPrice.toFixed(4), source: "facture" });
      pricesUpdated++;
    }
  }
  return c.json({ ok: true, received, pricesUpdated });
});

// apps/api/src/app.ts
init_billing2();
init_pilots();
init_marketplace();

// apps/api/src/routes/shopping.ts
init_src();
init_auth();
import { Hono as Hono21 } from "hono";
import { z as z20 } from "zod";
import { and as and29, desc as desc15, eq as eq32, inArray as inArray13, isNull as isNull11, or as or4, sql as sql24 } from "drizzle-orm";
init_marketplace();
var shoppingRoutes = new Hono21();
shoppingRoutes.use("*", requireAuth, requireRestaurant);
var n14 = (v) => v === null || v === void 0 ? 0 : Number(v);
var servesZone2 = (v, zones) => v.deliveryZones.length === 0 || v.deliveryZones.some((d) => zones.has(d.trim().toLowerCase()) || zones.has(d));
function toBase(qty3, unit2, baseUnit) {
  if (!unit2 || unit2 === baseUnit) return { qty: qty3 };
  if (unit2 === "g" && baseUnit === "kg") return { qty: qty3 / 1e3 };
  if (unit2 === "mL" && baseUnit === "L") return { qty: qty3 / 1e3 };
  if (unit2 === "cL" && baseUnit === "L") return { qty: qty3 / 100 };
  if (["sac", "carton", "bidon"].includes(unit2)) return { qty: qty3, note: `${qty3} ${unit2}${qty3 > 1 ? "s" : ""} \u2192 colis` };
  return { qty: qty3, note: `unit\xE9 \xAB ${unit2} \xBB \u2260 ${baseUnit}` };
}
function rankProducts(label, prods, mine, withOffers) {
  const words = normalize2(label).split(" ").filter((w) => w.length >= 2);
  const scored = prods.map((p) => {
    const nameWords = normalize2(p.name).split(" ");
    const aliasWords = p.aliases.map((x) => normalize2(x).split(" "));
    const inName = words.length && words.every((w) => nameWords.includes(w));
    const inAlias = words.length && words.every((w) => aliasWords.some((ws) => ws.includes(w)));
    const exact = inName ? 0.95 + (nameWords[0] === words[0] ? 0.02 : 0) : inAlias ? aliasWords.some((ws) => ws.join(" ") === words.join(" ")) ? 0.9 : 0.85 : 0;
    const fuzzy = Math.min(0.84, bestMatches(label, [{ id: p.id, name: p.name, aliases: p.aliases }], 1)[0]?.score ?? 0);
    const score = Math.max(exact, fuzzy) + (mine.has(p.id) ? 0.02 : 0) + (withOffers.has(p.id) ? 0.01 : 0);
    return { id: p.id, name: p.name, score: Math.min(1, Math.round(score * 1e3) / 1e3) };
  }).filter((m) => m.score >= 0.45).sort((a, b) => b.score - a.score);
  return scored.slice(0, 4);
}
shoppingRoutes.post("/shopping/parse", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body3 = z20.object({ text: z20.string().min(1).max(2e3) }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Texte requis" }, 400);
  const [r] = await db.select().from(restaurants).where(eq32(restaurants.id, rid));
  const zones = restaurantZones(r);
  const prods = await db.select().from(products).where(or4(isNull11(products.restaurantId), eq32(products.restaurantId, rid)));
  const mine = new Set((await db.select({ productId: inventoryItems.productId }).from(inventoryItems).where(eq32(inventoryItems.restaurantId, rid))).map((x) => x.productId));
  const tokens = tokenize(body3.data.text);
  if (!tokens.length) return c.json({ lines: [], unmatched: [], hint: "\xC9crivez une quantit\xE9 puis un produit : \xAB 10 kg piment, 5 kg riz, 2 cartons poisson fum\xE9 \xBB." });
  const activeVendors = (await db.select().from(vendors).where(eq32(vendors.status, "actif"))).filter((v) => servesZone2(v, zones));
  const vById = new Map(activeVendors.map((v) => [v.id, v]));
  const vo = activeVendors.length ? await db.select().from(vendorOffers).where(and29(inArray13(vendorOffers.vendorId, activeVendors.map((v) => v.id)), eq32(vendorOffers.inStock, true))) : [];
  const mySups = await db.select().from(suppliers).where(and29(eq32(suppliers.restaurantId, rid), eq32(suppliers.isActive, true)));
  const sById = new Map(mySups.map((s) => [s.id, s]));
  const linkedVendorIds = new Set(mySups.map((s) => s.vendorId).filter(Boolean));
  const so = mySups.length ? await db.select().from(supplierOffers).where(and29(eq32(supplierOffers.restaurantId, rid), eq32(supplierOffers.inStock, true), inArray13(supplierOffers.supplierId, mySups.map((s) => s.id)))) : [];
  const lines = tokens.map((t) => {
    const cands = rankProducts(t.label, prods, mine, /* @__PURE__ */ new Set([...vo.map((o) => o.productId), ...so.map((o) => o.productId)]));
    const top = cands[0];
    if (!top || top.score < 0.55) return { raw: t.raw, qty: t.qty, unit: t.unit, product: null, candidates: cands, offers: [], selected: null, note: "Produit inconnu" };
    const p = prods.find((x) => x.id === top.id);
    const conv = toBase(t.qty, t.unit, p.baseUnit);
    const needed = conv.qty;
    const asPacks = !!t.unit && ["sac", "carton", "bidon"].includes(t.unit);
    const offers = [];
    for (const o of vo.filter((x) => x.productId === p.id)) {
      const v = vById.get(o.vendorId);
      if (linkedVendorIds.has(v.id)) continue;
      const packs = asPacks ? Math.max(1, Math.round(needed)) : Math.max(1, Math.ceil(needed / n14(o.packQty)));
      offers.push({ key: `v:${o.id}`, kind: "vendor", offerId: o.id, sellerId: v.id, sellerName: v.name, packLabel: o.packLabel, packQty: n14(o.packQty), packPrice: n14(o.packPriceEur), unitPrice: n14(o.packPriceEur) / n14(o.packQty), leadTimeHours: v.leadTimeHours, minOrderEur: n14(v.minOrderEur), deliveryFeeEur: n14(v.deliveryFeeEur), packs, lineTotal: packs * n14(o.packPriceEur), linked: false });
    }
    for (const o of so.filter((x) => x.productId === p.id)) {
      const s = sById.get(o.supplierId);
      const packs = asPacks ? Math.max(1, Math.round(needed)) : Math.max(1, Math.ceil(needed / n14(o.packQty)));
      offers.push({ key: `s:${o.id}`, kind: "supplier", offerId: o.id, sellerId: s.id, sellerName: s.name, packLabel: o.packLabel, packQty: n14(o.packQty), packPrice: n14(o.packPriceEur), unitPrice: n14(o.packPriceEur) / n14(o.packQty), leadTimeHours: s.leadTimeHours, minOrderEur: n14(s.minOrderEur), deliveryFeeEur: n14(s.deliveryFeeEur), packs, lineTotal: packs * n14(o.packPriceEur), linked: true });
    }
    offers.sort((a, b) => a.unitPrice - b.unitPrice);
    const best = offers[0];
    const worst = offers[offers.length - 1];
    return {
      raw: t.raw,
      qty: t.qty,
      unit: t.unit ?? p.baseUnit,
      neededQty: needed,
      product: { id: p.id, name: p.name, unit: p.baseUnit, category: p.category, tracked: mine.has(p.id) },
      candidates: cands,
      offers,
      selected: best?.key ?? null,
      savingPct: best && worst && worst.unitPrice > 0 ? Math.round((worst.unitPrice - best.unitPrice) / worst.unitPrice * 100) : 0,
      note: offers.length ? conv.note : "Aucune offre disponible pour ce produit"
    };
  });
  return c.json({ lines, unmatched: lines.filter((l) => !l.product).map((l) => l.raw), sellers: { vendors: activeVendors.length, suppliers: mySups.length } });
});
var fmtQ = (q2) => Number.isInteger(q2) ? String(q2) : q2.toFixed(1).replace(".", ",");
shoppingRoutes.get("/shopping/lists", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const lists = await db.select().from(shoppingLists).where(eq32(shoppingLists.restaurantId, rid)).orderBy(desc15(shoppingLists.lastUsedAt), desc15(shoppingLists.createdAt));
  return c.json({ lists });
});
shoppingRoutes.post("/shopping/lists", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body3 = z20.object({ name: z20.string().min(1).max(60), text: z20.string().min(1).max(2e3) }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Nom et contenu requis" }, 400);
  const [list] = await db.insert(shoppingLists).values({ restaurantId: rid, ...body3.data }).returning();
  return c.json({ list, message: `Liste \xAB ${list.name} \xBB enregistr\xE9e.` }, 201);
});
shoppingRoutes.put("/shopping/lists/:id", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body3 = z20.object({ name: z20.string().min(1).max(60).optional(), text: z20.string().min(1).max(2e3).optional(), used: z20.boolean().optional() }).safeParse(await c.req.json());
  if (!body3.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const set = { updatedAt: /* @__PURE__ */ new Date() };
  if (body3.data.name) set.name = body3.data.name;
  if (body3.data.text) set.text = body3.data.text;
  if (body3.data.used) {
    set.lastUsedAt = /* @__PURE__ */ new Date();
    set.useCount = sql24`${shoppingLists.useCount} + 1`;
  }
  const [list] = await db.update(shoppingLists).set(set).where(and29(eq32(shoppingLists.id, c.req.param("id")), eq32(shoppingLists.restaurantId, rid))).returning();
  if (!list) return c.json({ error: "Liste introuvable" }, 404);
  return c.json({ list });
});
shoppingRoutes.delete("/shopping/lists/:id", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const del = await db.delete(shoppingLists).where(and29(eq32(shoppingLists.id, c.req.param("id")), eq32(shoppingLists.restaurantId, rid))).returning({ id: shoppingLists.id });
  return del.length ? c.json({ ok: true }) : c.json({ error: "Liste introuvable" }, 404);
});
shoppingRoutes.get("/shopping/suggestions", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const inv = await db.select({ item: inventoryItems, product: products }).from(inventoryItems).innerJoin(products, eq32(products.id, inventoryItems.productId)).where(eq32(inventoryItems.restaurantId, rid));
  const low = inv.filter(({ item }) => n14(item.quantity) <= n14(item.criticalLevel) || item.targetLevel !== null && n14(item.quantity) < n14(item.targetLevel) * 0.5).map(({ item, product }) => {
    const target = item.targetLevel !== null ? n14(item.targetLevel) : Math.max(n14(item.criticalLevel) * 2, n14(item.avgDailyUse) * 7);
    const need = Math.max(0, target - n14(item.quantity));
    return { name: product.name, unit: product.baseUnit, need: Math.ceil(need * 10) / 10 };
  }).filter((x) => x.need > 0);
  const lastOrders = await db.select().from(orders).where(and29(eq32(orders.restaurantId, rid), inArray13(orders.status, ["envoyee", "confirmee", "livree", "livree_partiel"]))).orderBy(desc15(orders.createdAt)).limit(5);
  let last = null;
  if (lastOrders.length) {
    const o = lastOrders[0];
    const ls = await db.select({ line: orderLines, product: products }).from(orderLines).innerJoin(products, eq32(products.id, orderLines.productId)).where(eq32(orderLines.orderId, o.id));
    last = { reference: o.reference, date: o.createdAt.toISOString().slice(0, 10), text: ls.map(({ line, product }) => `${fmtQ(n14(line.quantity))} ${product.baseUnit} ${product.name}`).join(", ") };
  }
  return c.json({ restock: { count: low.length, text: low.map((x) => `${fmtQ(x.need)} ${x.unit} ${x.name}`).join(", ") }, last });
});

// apps/api/src/routes/status.ts
init_src();
init_ops();
init_mailer();
import { Hono as Hono22 } from "hono";
import { desc as desc16, eq as eq33, sql as sql25 } from "drizzle-orm";
var statusRoutes = new Hono22();
statusRoutes.get("/status", async (c) => {
  const t0 = Date.now();
  let dbOk = false;
  let dbMs = 0;
  let lastJob = null;
  try {
    const db = await getDb();
    await db.execute(sql25`select 1`);
    dbMs = Date.now() - t0;
    dbOk = true;
    const [j] = await db.select().from(jobRuns).where(eq33(jobRuns.job, "daily")).orderBy(desc16(jobRuns.startedAt)).limit(1);
    if (j) lastJob = { status: j.status, finishedAt: j.finishedAt, durationMs: j.durationMs, sent: j.summary?.sent, count: j.summary?.count };
  } catch {
    dbOk = false;
  }
  const hoursSinceJob = lastJob ? (Date.now() - new Date(lastJob.finishedAt).getTime()) / 36e5 : null;
  const jobState = !lastJob ? "never" : lastJob.status !== "ok" ? "degraded" : hoursSinceJob > 30 ? "stale" : "ok";
  const ok = dbOk && jobState !== "degraded";
  return c.json({
    ok,
    ...buildInfo(),
    checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
    checks: {
      database: { ok: dbOk, latencyMs: dbMs },
      dailyJob: { state: jobState, lastRun: lastJob ? { ...lastJob, hoursAgo: Math.round(hoursSinceJob * 10) / 10 } : null },
      mail: { transport: mailerConfig().transport, configured: mailerConfig().transport === "resend" },
      errorTracking: { configured: sentryEnabled() },
      cron: { configured: !!process.env.CRON_SECRET }
    }
  }, ok ? 200 : 503);
});
statusRoutes.get("/status/jobs", async (c) => {
  const auth = c.req.header("authorization");
  const given = c.req.header("x-cron-secret") ?? (auth?.startsWith("Bearer ") ? auth.slice(7) : void 0);
  if (!process.env.CRON_SECRET || given !== process.env.CRON_SECRET) return c.json({ error: "Non autoris\xE9" }, 401);
  const db = await getDb();
  return c.json({ runs: await db.select().from(jobRuns).orderBy(desc16(jobRuns.startedAt)).limit(Math.min(100, Number(c.req.query("limit") ?? 30))) });
});

// apps/api/src/app.ts
init_ops();
init_security();
var app = new Hono23();
if (process.env.NODE_ENV !== "test") app.use("*", logger());
app.use("*", securityHeaders);
app.use("/api/auth/login", rateLimit({ windowMs: 6e4, max: 10 }));
app.use("/api/auth/register", rateLimit({ windowMs: 6e4, max: 5 }));
app.use("/api/auth/forgot-password", rateLimit({ windowMs: 15 * 6e4, max: 5 }));
app.use("/api/auth/reset-password", rateLimit({ windowMs: 15 * 6e4, max: 10 }));
app.use("/api/auth/password", rateLimit({ windowMs: 15 * 6e4, max: 10 }));
app.use("/api/auth/logout-all", rateLimit({ windowMs: 15 * 6e4, max: 20 }));
app.use("/api/public/leads", rateLimit({ windowMs: 6e4, max: 5 }));
app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});
app.use("/api/*", cors({ origin: (o) => resolveCorsOrigin(o), credentials: true }));
app.get("/api/health", (c) => c.json({ ok: true, service: "afrisupply-api", db: isNeon() ? "neon" : "pglite-local", time: (/* @__PURE__ */ new Date()).toISOString(), ...buildInfo() }));
app.route("/api", statusRoutes);
app.route("/api", jobsRoutes);
app.route("/api", publicRoutes);
app.route("/api", storefrontRoutes);
app.route("/api", publicReviewRoutes);
app.route("/api", prospectPublicRoutes);
app.route("/api", billingPublicRoutes);
app.route("/api", pilotPublicRoutes);
app.route("/api/auth", authRoutes);
app.route("/api", referenceRequestRoutes);
app.route("/api", referenceAdminRoutes);
app.route("/api", adminDashboardRoutes);
app.route("/api", adminClaimRoutes);
app.route("/api", vendorClaimRoutes);
app.route("/api", vendorReviewRoutes);
app.route("/api", vendorRoutes2);
app.route("/api", vendorAdminRoutes);
app.route("/api", billingAdminRoutes);
app.route("/api", pilotAdminRoutes);
app.route("/api", prospectRoutes);
app.route("/api", restaurantRoutes);
app.route("/api", catalogRoutes);
app.route("/api", intelligenceRoutes);
app.route("/api", manageRoutes);
app.route("/api", claimRoutes);
app.route("/api", reviewRoutes);
app.route("/api", settingsRoutes);
app.route("/api", accountRoutes);
app.route("/api", memberRoutes);
app.route("/api", quickRoutes);
app.route("/api", marketplaceRoutes);
app.route("/api", shoppingRoutes);
app.route("/api", billingRoutes);
app.route("/api", pilotRoutes);
setKnownRoutes(app.routes.filter((r) => r.method !== "ALL").map((r) => r.path));
app.notFound((c) => c.json({ error: "Route inconnue" }, 404));
app.onError((err, c) => {
  console.error(err);
  void captureException(err, { route: c.req.path, method: c.req.method, userEmail: c.get("user")?.email });
  return c.json({ error: "Erreur serveur", detail: process.env.NODE_ENV === "production" ? void 0 : String(err) }, 500);
});

// api/_src/index.ts
init_security();
var { errors, warnings } = checkSecureConfig();
if (warnings.length) console.warn("[config]", warnings.join(" | "));
if (errors.length) console.error("[config] \u{1F6D1} Configuration non s\xFBre :", errors.join(" | "));
var index_default = getRequestListener(app.fetch);
export {
  index_default as default
};

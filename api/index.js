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
  deliveries: () => deliveries,
  deliveriesRelations: () => deliveriesRelations,
  deliveryDiscrepancies: () => deliveryDiscrepancies,
  deliveryDiscrepanciesRelations: () => deliveryDiscrepanciesRelations,
  forecasts: () => forecasts,
  inventoryItems: () => inventoryItems,
  inventoryItemsRelations: () => inventoryItemsRelations,
  leadStatus: () => leadStatus,
  leads: () => leads,
  memberRole: () => memberRole,
  movementType: () => movementType,
  orderChannel: () => orderChannel,
  orderLines: () => orderLines,
  orderLinesRelations: () => orderLinesRelations,
  orderStatus: () => orderStatus,
  orders: () => orders,
  ordersRelations: () => ordersRelations,
  plan: () => plan,
  priceHistory: () => priceHistory,
  priceHistoryRelations: () => priceHistoryRelations,
  productCategory: () => productCategory,
  products: () => products,
  recipeIngredients: () => recipeIngredients,
  recipeIngredientsRelations: () => recipeIngredientsRelations,
  recipes: () => recipes,
  recipesRelations: () => recipesRelations,
  reorderRules: () => reorderRules,
  restaurantMembers: () => restaurantMembers,
  restaurants: () => restaurants,
  restaurantsRelations: () => restaurantsRelations,
  sales: () => sales,
  salesRelations: () => salesRelations,
  stockMovements: () => stockMovements,
  stockMovementsRelations: () => stockMovementsRelations,
  supplierOffers: () => supplierOffers,
  supplierOffersRelations: () => supplierOffersRelations,
  suppliers: () => suppliers,
  suppliersRelations: () => suppliersRelations,
  unit: () => unit,
  users: () => users
});
import {
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
var memberRole, productCategory, unit, movementType, orderStatus, orderChannel, alertKind, alertSeverity, plan, users, restaurants, restaurantMembers, products, suppliers, supplierOffers, priceHistory, inventoryItems, stockMovements, orders, orderLines, deliveries, deliveryDiscrepancies, recipes, recipeIngredients, sales, alerts, reorderRules, forecasts, leadStatus, leads, restaurantsRelations, suppliersRelations, supplierOffersRelations, priceHistoryRelations, inventoryItemsRelations, stockMovementsRelations, ordersRelations, orderLinesRelations, deliveriesRelations, deliveryDiscrepanciesRelations, recipesRelations, recipeIngredientsRelations, salesRelations, alertsRelations;
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
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
      lastLoginAt: timestamp("last_login_at", { withTimezone: true })
    });
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
      receivedQty: numeric("received_qty", { precision: 12, scale: 3 })
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
    });
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
      P("Shito (sauce piment ghan\xE9enne)", "epicerie", "kg", ["shito", "sauce piment noire", "ghana black pepper sauce"], ["Pot 300 g", "Pot 1 kg"], "Ghana", 180, ["kenkey", "waakye", "riz"]),
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
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
async function seedDemo(opts = {}) {
  const db = await getDb();
  const existing = await db.select().from(restaurants).where(eq(restaurants.slug, "chez-awa")).limit(1);
  if (existing.length && !opts.force) {
    console.log("[seed] Restaurant d\xE9mo d\xE9j\xE0 pr\xE9sent \u2014 rien \xE0 faire.");
    return { restaurantId: existing[0].id };
  }
  if (existing.length && opts.force) {
    await db.delete(restaurants).where(eq(restaurants.slug, "chez-awa"));
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
    daysAgo = (n6) => new Date(Date.now() - n6 * 864e5);
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
  RECIPE_TEMPLATES: () => RECIPE_TEMPLATES,
  REFERENCE_PRODUCTS: () => REFERENCE_PRODUCTS,
  alertKind: () => alertKind,
  alertSeverity: () => alertSeverity,
  alerts: () => alerts,
  alertsRelations: () => alertsRelations,
  deliveries: () => deliveries,
  deliveriesRelations: () => deliveriesRelations,
  deliveryDiscrepancies: () => deliveryDiscrepancies,
  deliveryDiscrepanciesRelations: () => deliveryDiscrepanciesRelations,
  findReferenceProduct: () => findReferenceProduct,
  forecasts: () => forecasts,
  getDb: () => getDb,
  inventoryItems: () => inventoryItems,
  inventoryItemsRelations: () => inventoryItemsRelations,
  isNeon: () => isNeon,
  leadStatus: () => leadStatus,
  leads: () => leads,
  memberRole: () => memberRole,
  movementType: () => movementType,
  normalize: () => normalize,
  orderChannel: () => orderChannel,
  orderLines: () => orderLines,
  orderLinesRelations: () => orderLinesRelations,
  orderStatus: () => orderStatus,
  orders: () => orders,
  ordersRelations: () => ordersRelations,
  plan: () => plan,
  priceHistory: () => priceHistory,
  priceHistoryRelations: () => priceHistoryRelations,
  productCategory: () => productCategory,
  products: () => products,
  recipeIngredients: () => recipeIngredients,
  recipeIngredientsRelations: () => recipeIngredientsRelations,
  recipes: () => recipes,
  recipesRelations: () => recipesRelations,
  reorderRules: () => reorderRules,
  restaurantMembers: () => restaurantMembers,
  restaurants: () => restaurants,
  restaurantsRelations: () => restaurantsRelations,
  runMigrations: () => runMigrations,
  sales: () => sales,
  salesRelations: () => salesRelations,
  schema: () => schema_exports,
  seedDemo: () => seedDemo,
  stockMovements: () => stockMovements,
  stockMovementsRelations: () => stockMovementsRelations,
  supplierOffers: () => supplierOffers,
  supplierOffersRelations: () => supplierOffersRelations,
  suppliers: () => suppliers,
  suppliersRelations: () => suppliersRelations,
  unit: () => unit,
  users: () => users
});
var init_src = __esm({
  "packages/db/src/index.ts"() {
    "use strict";
    init_schema();
    init_schema();
    init_client();
    init_migrate();
    init_seed();
    init_data();
  }
});

// api/_src/index.ts
import { getRequestListener } from "@hono/node-server";

// apps/api/src/app.ts
import { Hono as Hono8 } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

// apps/api/src/routes/auth.ts
init_src();
import { Hono } from "hono";
import { z } from "zod";
import { eq as eq3 } from "drizzle-orm";
import { setCookie, deleteCookie } from "hono/cookie";

// apps/api/src/lib/auth.ts
init_src();
import { SignJWT, jwtVerify } from "jose";
import bcrypt2 from "bcryptjs";
import { getCookie } from "hono/cookie";
import { eq as eq2, and } from "drizzle-orm";
var secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me-in-production");
var TOKEN_TTL = "30d";
async function hashPassword(pw) {
  return bcrypt2.hash(pw, 10);
}
async function verifyPassword(pw, hash) {
  return bcrypt2.compare(pw, hash);
}
async function signToken(user) {
  return new SignJWT({ email: user.email, fullName: user.fullName }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt().setExpirationTime(TOKEN_TTL).sign(secret);
}
async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return { id: payload.sub, email: payload.email, fullName: payload.fullName };
  } catch {
    return null;
  }
}
async function requireAuth(c, next) {
  const header = c.req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : getCookie(c, "afs_token");
  const user = token ? await verifyToken(token) : null;
  if (!user) return c.json({ error: "Non authentifi\xE9" }, 401);
  const db = await getDb();
  const [row] = await db.select({ id: users.id }).from(users).where(eq2(users.id, user.id)).limit(1);
  if (!row) return c.json({ error: "Utilisateur inconnu" }, 401);
  c.set("user", user);
  await next();
}
async function requireRestaurant(c, next) {
  const db = await getDb();
  const user = c.get("user");
  const wanted = c.req.header("x-restaurant-id");
  const memberships = await db.select({ restaurantId: restaurantMembers.restaurantId }).from(restaurantMembers).where(eq2(restaurantMembers.userId, user.id));
  if (!memberships.length) return c.json({ error: "Aucun restaurant associ\xE9" }, 403);
  const rid = wanted ?? memberships[0].restaurantId;
  if (!memberships.some((m) => m.restaurantId === rid)) return c.json({ error: "Acc\xE8s refus\xE9 \xE0 ce restaurant" }, 403);
  c.set("restaurantId", rid);
  await next();
}

// apps/api/src/routes/auth.ts
var slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
var cookieOpts = { httpOnly: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 30, secure: process.env.NODE_ENV === "production" };
var authRoutes = new Hono();
authRoutes.post("/register", async (c) => {
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    fullName: z.string().min(2),
    restaurantName: z.string().min(2),
    city: z.string().optional(),
    coversPerDay: z.number().int().positive().optional()
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides", details: body.error.flatten() }, 400);
  const d = body.data;
  const db = await getDb();
  const dup = await db.select({ id: users.id }).from(users).where(eq3(users.email, d.email.toLowerCase())).limit(1);
  if (dup.length) return c.json({ error: "Un compte existe d\xE9j\xE0 avec cet e-mail" }, 409);
  const [user] = await db.insert(users).values({ email: d.email.toLowerCase(), passwordHash: await hashPassword(d.password), fullName: d.fullName }).returning();
  const slug = `${slugify(d.restaurantName)}-${user.id.slice(0, 6)}`;
  const trialEndsAt = new Date(Date.now() + 30 * 864e5);
  const [restaurant] = await db.insert(restaurants).values({ name: d.restaurantName, slug, city: d.city, coversPerDay: d.coversPerDay, plan: "trial", trialEndsAt }).returning();
  await db.insert(restaurantMembers).values({ restaurantId: restaurant.id, userId: user.id, role: "owner" });
  const token = await signToken({ id: user.id, email: user.email, fullName: user.fullName });
  setCookie(c, "afs_token", token, cookieOpts);
  return c.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName }, restaurant }, 201);
});
authRoutes.post("/login", async (c) => {
  const body = z.object({ email: z.string().email(), password: z.string() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq3(users.email, body.data.email.toLowerCase())).limit(1);
  if (!user || !await verifyPassword(body.data.password, user.passwordHash)) return c.json({ error: "E-mail ou mot de passe incorrect" }, 401);
  await db.update(users).set({ lastLoginAt: /* @__PURE__ */ new Date() }).where(eq3(users.id, user.id));
  const token = await signToken({ id: user.id, email: user.email, fullName: user.fullName });
  setCookie(c, "afs_token", token, cookieOpts);
  return c.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName } });
});
authRoutes.post("/logout", (c) => {
  deleteCookie(c, "afs_token", { path: "/" });
  return c.json({ ok: true });
});
authRoutes.get("/me", requireAuth, async (c) => {
  const db = await getDb();
  const user = c.get("user");
  const rows = await db.select({ restaurant: restaurants, role: restaurantMembers.role }).from(restaurantMembers).innerJoin(restaurants, eq3(restaurants.id, restaurantMembers.restaurantId)).where(eq3(restaurantMembers.userId, user.id));
  return c.json({ user, restaurants: rows.map((r) => ({ ...r.restaurant, role: r.role })) });
});

// apps/api/src/routes/restaurant.ts
init_src();
import { Hono as Hono2 } from "hono";
import { z as z2 } from "zod";
import { and as and2, eq as eq4, desc, gte, sql as sql2, inArray } from "drizzle-orm";

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
var fmtQty = (q2, unit2) => `${Number.isInteger(q2) ? q2 : q2.toFixed(1)} ${unit2}`;
var fmtEur = (v) => `${v.toFixed(2).replace(".", ",")} \u20AC`;
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
    const pct = (current.unitPrice - ref) / ref * 100;
    if (pct >= thresholdPct) {
      const alts = (alternatives.get(current.productId) ?? []).filter((a) => a.offerId !== offerId && a.unitPrice < current.unitPrice).sort((a, b) => a.unitPrice - b.unitPrice).slice(0, 2);
      const altText = alts.length ? ` Nous avons trouv\xE9 ${alts.length} alternative${alts.length > 1 ? "s" : ""} moins ch\xE8re${alts.length > 1 ? "s" : ""} : ${alts.map((a) => `${a.supplierName} \xE0 ${fmtEur(a.unitPrice)}/${a.unit}`).join(", ")}.` : "";
      out.push({
        dedupeKey: `hausse:${offerId}:${current.unitPrice.toFixed(4)}`,
        kind: "hausse_prix",
        severity: "orange",
        title: `\u{1F4C8} Hausse d\xE9tect\xE9e \u2014 ${current.productName}`,
        message: `Le prix de ${current.productName.toLowerCase()} chez ${current.supplierName} augmente de ${pct.toFixed(0)} % (${fmtEur(ref)} \u2192 ${fmtEur(current.unitPrice)}/${current.unit}).${altText}`,
        productId: current.productId,
        supplierId: current.supplierId,
        actionUrl: `/achats/comparer/${current.productId}`,
        payload: { pct: Math.round(pct * 10) / 10, from: ref, to: current.unitPrice, alternatives: alts }
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
    const pct = (mine.unitPrice - best.unitPrice) / mine.unitPrice * 100;
    if (pct >= minGainPct) {
      out.push({
        dedupeKey: `opportunite:${it.productId}:${best.supplierId}:${best.unitPrice.toFixed(4)}`,
        kind: "opportunite",
        severity: "green",
        title: `\u{1F7E2} Moins cher disponible \u2014 ${it.productName}`,
        message: `Votre fournisseur habituel (${mine.supplierName}) propose ${it.productName.toLowerCase()} ${pct.toFixed(0)} % plus cher que ${best.supplierName} (${fmtEur(best.unitPrice)} vs ${fmtEur(mine.unitPrice)}/${it.unit}), livrable sous ${Math.round(best.leadTimeHours / 24)} j.`,
        productId: it.productId,
        supplierId: best.supplierId,
        actionUrl: `/achats/comparer/${it.productId}`,
        payload: { pct: Math.round(pct * 10) / 10 }
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
  const pct = 100 - stats.late / stats.delivered * 60 - stats.discrepancies / stats.delivered * 40;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

// apps/api/src/routes/restaurant.ts
var restaurantRoutes = new Hono2();
restaurantRoutes.use("*", requireAuth, requireRestaurant);
var n = (v) => v === null || v === void 0 ? 0 : Number(v);
async function loadStockSnapshots(rid) {
  const db = await getDb();
  const [items, salesRows, ingRows] = await Promise.all([
    db.select({ item: inventoryItems, product: products }).from(inventoryItems).innerJoin(products, eq4(products.id, inventoryItems.productId)).where(eq4(inventoryItems.restaurantId, rid)),
    db.select({ recipeId: sales.recipeId, day: sales.day, portions: sales.portions }).from(sales).where(eq4(sales.restaurantId, rid)),
    db.select({ recipeId: recipeIngredients.recipeId, productId: recipeIngredients.productId, quantity: recipeIngredients.quantity }).from(recipeIngredients).innerJoin(recipes, eq4(recipes.id, recipeIngredients.recipeId)).where(eq4(recipes.restaurantId, rid))
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
  const where = productId ? and2(eq4(supplierOffers.restaurantId, rid), eq4(supplierOffers.productId, productId)) : eq4(supplierOffers.restaurantId, rid);
  const rows = await db.select({ offer: supplierOffers, supplier: suppliers }).from(supplierOffers).innerJoin(suppliers, eq4(suppliers.id, supplierOffers.supplierId)).where(where);
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
    delivered: sql2`count(*) filter (where ${orders.status} in ('livree','livree_partiel'))`,
    late: sql2`count(*) filter (where ${deliveries.isLate})`,
    discrepancies: sql2`count(*) filter (where ${deliveries.hasDiscrepancy})`,
    total: sql2`count(*)`,
    spent: sql2`coalesce(sum(${orders.totalEur}),0)`
  }).from(orders).leftJoin(deliveries, eq4(deliveries.orderId, orders.id)).where(eq4(orders.restaurantId, rid)).groupBy(orders.supplierId);
  const map = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const st = { delivered: n(r.delivered), late: n(r.late), discrepancies: n(r.discrepancies), total: n(r.total), spent: n(r.spent) };
    map.set(r.supplierId, { ...st, reliability: supplierReliability(st) });
  }
  return map;
}
async function refreshAlerts(rid) {
  const db = await getDb();
  const [restaurant] = await db.select().from(restaurants).where(eq4(restaurants.id, rid));
  const threshold = restaurant.settings?.priceIncreaseAlertPct ?? 8;
  const [stocks, offers, invRows, ph] = await Promise.all([
    loadStockSnapshots(rid),
    loadOffers(rid),
    db.select({ item: inventoryItems, product: products }).from(inventoryItems).innerJoin(products, eq4(products.id, inventoryItems.productId)).where(eq4(inventoryItems.restaurantId, rid)),
    db.select({ p: priceHistory, offer: supplierOffers, supplier: suppliers, product: products }).from(priceHistory).innerJoin(supplierOffers, eq4(supplierOffers.id, priceHistory.offerId)).innerJoin(suppliers, eq4(suppliers.id, supplierOffers.supplierId)).innerJoin(products, eq4(products.id, supplierOffers.productId)).where(and2(eq4(priceHistory.restaurantId, rid), gte(priceHistory.recordedAt, new Date(Date.now() - 90 * 864e5))))
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
restaurantRoutes.get("/dashboard", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const [restaurant] = await db.select().from(restaurants).where(eq4(restaurants.id, rid));
  const stocks = await loadStockSnapshots(rid);
  const statuses = stocks.map((s) => ({ ...s, status: stockStatus(s), daysLeft: daysOfStock(s) }));
  const startMonth = /* @__PURE__ */ new Date();
  startMonth.setDate(1);
  startMonth.setHours(0, 0, 0, 0);
  const startPrev = new Date(startMonth);
  startPrev.setMonth(startPrev.getMonth() - 1);
  const spend = await db.select({
    thisMonth: sql2`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${startMonth.toISOString()}),0)`,
    prevMonth: sql2`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${startPrev.toISOString()} and ${orders.createdAt} < ${startMonth.toISOString()}),0)`,
    last30: sql2`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${new Date(Date.now() - 30 * 864e5).toISOString()}),0)`,
    prev30: sql2`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${new Date(Date.now() - 60 * 864e5).toISOString()} and ${orders.createdAt} < ${new Date(Date.now() - 30 * 864e5).toISOString()}),0)`
  }).from(orders).where(and2(eq4(orders.restaurantId, rid), sql2`${orders.status} <> 'annulee'`));
  const sp = spend[0];
  const evolutionPct = n(sp.prev30) > 0 ? (n(sp.last30) - n(sp.prev30)) / n(sp.prev30) * 100 : null;
  const recentAlerts = await db.select().from(alerts).where(and2(eq4(alerts.restaurantId, rid), eq4(alerts.isRead, false))).orderBy(desc(alerts.createdAt)).limit(6);
  const recentOrders = await db.select({ order: orders, supplierName: suppliers.name }).from(orders).innerJoin(suppliers, eq4(suppliers.id, orders.supplierId)).where(eq4(orders.restaurantId, rid)).orderBy(desc(orders.createdAt)).limit(5);
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
  const items = await db.select({ item: inventoryItems, product: products, supplierName: suppliers.name }).from(inventoryItems).innerJoin(products, eq4(products.id, inventoryItems.productId)).leftJoin(suppliers, eq4(suppliers.id, inventoryItems.preferredSupplierId)).where(eq4(inventoryItems.restaurantId, rid));
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
  const body = z2.object({ type: z2.enum(["reception", "consommation", "ajustement", "perte"]), quantity: z2.number(), note: z2.string().optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const [item] = await db.select().from(inventoryItems).where(and2(eq4(inventoryItems.id, c.req.param("itemId")), eq4(inventoryItems.restaurantId, rid)));
  if (!item) return c.json({ error: "Article introuvable" }, 404);
  const { type, quantity, note } = body.data;
  const delta = type === "ajustement" ? quantity - n(item.quantity) : type === "reception" ? Math.abs(quantity) : -Math.abs(quantity);
  const newQty = Math.max(0, n(item.quantity) + delta);
  await db.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: item.id, type, quantity: delta.toFixed(3), note, createdBy: user.id });
  await db.update(inventoryItems).set({ quantity: newQty.toFixed(3), updatedAt: /* @__PURE__ */ new Date(), ...type === "ajustement" ? { lastCountedAt: /* @__PURE__ */ new Date() } : {} }).where(eq4(inventoryItems.id, item.id));
  return c.json({ ok: true, quantity: newQty });
});
restaurantRoutes.get("/suppliers", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const [rows, stats, offerCounts] = await Promise.all([
    db.select().from(suppliers).where(eq4(suppliers.restaurantId, rid)).orderBy(suppliers.name),
    loadSupplierStats(rid),
    db.select({ supplierId: supplierOffers.supplierId, count: sql2`count(*)` }).from(supplierOffers).where(eq4(supplierOffers.restaurantId, rid)).groupBy(supplierOffers.supplierId)
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
  const [s] = await db.select().from(suppliers).where(and2(eq4(suppliers.id, id), eq4(suppliers.restaurantId, rid)));
  if (!s) return c.json({ error: "Fournisseur introuvable" }, 404);
  const [offers, history, stats] = await Promise.all([
    db.select({ offer: supplierOffers, product: products }).from(supplierOffers).innerJoin(products, eq4(products.id, supplierOffers.productId)).where(eq4(supplierOffers.supplierId, id)),
    db.select().from(orders).where(eq4(orders.supplierId, id)).orderBy(desc(orders.createdAt)).limit(20),
    loadSupplierStats(rid)
  ]);
  return c.json({ supplier: s, stats: stats.get(id), offers: offers.map(({ offer, product }) => ({ ...offer, productName: product.name, unit: product.baseUnit, unitPrice: n(offer.packPriceEur) / n(offer.packQty) })), orders: history });
});
restaurantRoutes.post("/suppliers", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body = z2.object({
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
  if (!body.success) return c.json({ error: "Donn\xE9es invalides", details: body.error.flatten() }, 400);
  const d = body.data;
  const [row] = await db.insert(suppliers).values({ ...d, email: d.email || null, restaurantId: rid, minOrderEur: d.minOrderEur.toFixed(2), deliveryFeeEur: d.deliveryFeeEur.toFixed(2) }).returning();
  return c.json(row, 201);
});
restaurantRoutes.get("/products", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const rows = await db.select().from(products).where(sql2`${products.restaurantId} is null or ${products.restaurantId} = ${rid}`).orderBy(products.category, products.name);
  return c.json({ products: rows });
});
restaurantRoutes.get("/compare/:productId", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const productId = c.req.param("productId");
  const [product] = await db.select().from(products).where(eq4(products.id, productId));
  if (!product) return c.json({ error: "Produit introuvable" }, 404);
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
  const rows = await db.select({ order: orders, supplierName: suppliers.name }).from(orders).innerJoin(suppliers, eq4(suppliers.id, orders.supplierId)).where(eq4(orders.restaurantId, rid)).orderBy(desc(orders.createdAt)).limit(100);
  const ids = rows.map((r) => r.order.id);
  const lines = ids.length ? await db.select({ line: orderLines, productName: products.name }).from(orderLines).innerJoin(products, eq4(products.id, orderLines.productId)).where(inArray(orderLines.orderId, ids)) : [];
  return c.json({ orders: rows.map((r) => ({ ...r.order, supplierName: r.supplierName, lines: lines.filter((l) => l.line.orderId === r.order.id).map((l) => ({ ...l.line, productName: l.productName })) })) });
});
restaurantRoutes.post("/orders", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const user = c.get("user");
  const body = z2.object({
    supplierId: z2.string().uuid(),
    channel: z2.enum(["email", "whatsapp", "telephone", "plateforme"]).optional(),
    notes: z2.string().optional(),
    source: z2.string().optional(),
    lines: z2.array(z2.object({ offerId: z2.string().uuid(), packs: z2.number().int().positive() })).min(1)
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides", details: body.error.flatten() }, 400);
  const d = body.data;
  const [sup] = await db.select().from(suppliers).where(and2(eq4(suppliers.id, d.supplierId), eq4(suppliers.restaurantId, rid)));
  if (!sup) return c.json({ error: "Fournisseur introuvable" }, 404);
  const offers = await db.select().from(supplierOffers).where(and2(eq4(supplierOffers.supplierId, sup.id), inArray(supplierOffers.id, d.lines.map((l) => l.offerId))));
  if (offers.length !== d.lines.length) return c.json({ error: "Offre invalide pour ce fournisseur" }, 400);
  const [{ count }] = await db.select({ count: sql2`count(*)` }).from(orders).where(eq4(orders.restaurantId, rid));
  const reference = `AFS-${(/* @__PURE__ */ new Date()).getFullYear()}-${String(n(count) + 1).padStart(6, "0")}`;
  const linesData = d.lines.map((l) => {
    const o = offers.find((x) => x.id === l.offerId);
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
  const [o] = await db.update(orders).set({ status: "envoyee", sentAt: /* @__PURE__ */ new Date() }).where(and2(eq4(orders.id, c.req.param("id")), eq4(orders.restaurantId, rid))).returning();
  if (!o) return c.json({ error: "Commande introuvable" }, 404);
  return c.json({ order: o });
});
restaurantRoutes.post("/orders/:id/receive", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const user = c.get("user");
  const body = z2.object({ lines: z2.array(z2.object({ lineId: z2.string().uuid(), receivedQty: z2.number().nonnegative() })), notes: z2.string().optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const [order] = await db.select().from(orders).where(and2(eq4(orders.id, c.req.param("id")), eq4(orders.restaurantId, rid)));
  if (!order) return c.json({ error: "Commande introuvable" }, 404);
  const lines = await db.select({ line: orderLines, productName: products.name, unit: products.baseUnit }).from(orderLines).innerJoin(products, eq4(products.id, orderLines.productId)).where(eq4(orderLines.orderId, order.id));
  const isLate = !!order.expectedAt && new Date(order.expectedAt).getTime() < Date.now() - 864e5;
  const discrepancies = [];
  const [delivery] = await db.insert(deliveries).values({ restaurantId: rid, orderId: order.id, receivedBy: user.id, isLate, notes: body.data.notes }).returning();
  for (const { line, productName, unit: unit2 } of lines) {
    const received = body.data.lines.find((l) => l.lineId === line.id)?.receivedQty ?? n(line.quantity);
    await db.update(orderLines).set({ receivedQty: received.toFixed(3) }).where(eq4(orderLines.id, line.id));
    if (received > 0) {
      let [inv] = await db.select().from(inventoryItems).where(and2(eq4(inventoryItems.restaurantId, rid), eq4(inventoryItems.productId, line.productId)));
      if (!inv) [inv] = await db.insert(inventoryItems).values({ restaurantId: rid, productId: line.productId, quantity: "0", criticalLevel: "0" }).returning();
      await db.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: inv.id, type: "reception", quantity: received.toFixed(3), unitCostEur: line.unitPriceEur, orderId: order.id, createdBy: user.id });
      await db.update(inventoryItems).set({ quantity: (n(inv.quantity) + received).toFixed(3), updatedAt: /* @__PURE__ */ new Date() }).where(eq4(inventoryItems.id, inv.id));
      if (line.offerId) await db.insert(priceHistory).values({ restaurantId: rid, offerId: line.offerId, unitPriceEur: line.unitPriceEur, source: "reception" });
    }
    if (Math.abs(received - n(line.quantity)) > 1e-3) discrepancies.push({ lineId: line.id, productName, ordered: n(line.quantity), received, unit: unit2 });
  }
  let claimMessage = null;
  if (discrepancies.length) {
    const [sup] = await db.select().from(suppliers).where(eq4(suppliers.id, order.supplierId));
    claimMessage = `Bonjour ${sup?.contactName ?? ""},

Nous avons constat\xE9 un \xE9cart sur la livraison ${order.reference} :
` + discrepancies.map((d) => `\u2022 ${d.productName} : command\xE9 ${d.ordered} ${d.unit}, re\xE7u ${d.received} ${d.unit} (${d.ordered - d.received > 0 ? "manquant" : "exc\xE9dent"} ${Math.abs(d.ordered - d.received)} ${d.unit})`).join("\n") + `

Merci de nous indiquer la suite \xE0 donner (livraison compl\xE9mentaire ou avoir).

Cordialement,
${user.fullName}`;
    const { deliveryDiscrepancies: deliveryDiscrepancies2 } = await Promise.resolve().then(() => (init_src(), src_exports));
    await db.insert(deliveryDiscrepancies2).values(discrepancies.map((d) => ({ deliveryId: delivery.id, orderLineId: d.lineId, orderedQty: d.ordered.toFixed(3), receivedQty: d.received.toFixed(3), reason: d.ordered > d.received ? "manquant" : "exc\xE9dent", claimMessage })));
    await db.update(deliveries).set({ hasDiscrepancy: true }).where(eq4(deliveries.id, delivery.id));
    const missingValue = discrepancies.reduce((a, d) => {
      const l = lines.find((x) => x.line.id === d.lineId);
      return a + Math.max(0, d.ordered - d.received) * n(l?.line.unitPriceEur);
    }, 0);
    await db.insert(alerts).values({
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
  const allReceived = discrepancies.every((d) => d.received >= d.ordered);
  await db.update(orders).set({ status: allReceived ? "livree" : "livree_partiel", deliveredAt: /* @__PURE__ */ new Date() }).where(eq4(orders.id, order.id));
  return c.json({ ok: true, isLate, discrepancies, claimMessage });
});
restaurantRoutes.get("/recipes", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const [recs, ings, offers] = await Promise.all([
    db.select().from(recipes).where(eq4(recipes.restaurantId, rid)).orderBy(recipes.name),
    db.select({ ing: recipeIngredients, product: products }).from(recipeIngredients).innerJoin(products, eq4(products.id, recipeIngredients.productId)).innerJoin(recipes, eq4(recipes.id, recipeIngredients.recipeId)).where(eq4(recipes.restaurantId, rid)),
    loadOffers(rid)
  ]);
  const prices = /* @__PURE__ */ new Map();
  for (const o of offers) if (o.inStock && (!prices.has(o.productId) || o.unitPrice < prices.get(o.productId))) prices.set(o.productId, o.unitPrice);
  const hist = await db.select({ productId: supplierOffers.productId, unitPrice: priceHistory.unitPriceEur, recordedAt: priceHistory.recordedAt }).from(priceHistory).innerJoin(supplierOffers, eq4(supplierOffers.id, priceHistory.offerId)).where(and2(eq4(priceHistory.restaurantId, rid), gte(priceHistory.recordedAt, new Date(Date.now() - 45 * 864e5))));
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
  const all = await db.select().from(alerts).where(and2(eq4(alerts.restaurantId, rid), eq4(alerts.isRead, false))).orderBy(desc(alerts.createdAt));
  return c.json({ computed, inserted, alerts: all });
});
restaurantRoutes.get("/alerts", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const rows = await db.select().from(alerts).where(eq4(alerts.restaurantId, rid)).orderBy(desc(alerts.createdAt)).limit(100);
  return c.json({ alerts: rows });
});
restaurantRoutes.post("/alerts/:id/read", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  await db.update(alerts).set({ isRead: true }).where(and2(eq4(alerts.id, c.req.param("id")), eq4(alerts.restaurantId, rid)));
  return c.json({ ok: true });
});

// apps/api/src/routes/catalog.ts
init_src();
init_data();
import { Hono as Hono3 } from "hono";
import { z as z3 } from "zod";
import { and as and3, eq as eq5, isNull, sql as sql3, inArray as inArray2 } from "drizzle-orm";

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
  const n6 = Number(clean);
  return Number.isFinite(n6) && clean !== "" ? n6 : null;
};
function parsePack(label) {
  const s = label.toLowerCase().replace(",", ".");
  const mult = s.match(/(\d+)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(kg|g|l|cl|ml)/);
  if (mult) {
    const n6 = Number(mult[1]);
    const q2 = Number(mult[2]);
    return convert(n6 * q2, mult[3]);
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
  const existing = await db.select({ id: products.id, name: products.name }).from(products).where(isNull(products.restaurantId));
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
  const rows = await db.select().from(products).where(sql3`${products.restaurantId} is null or ${products.restaurantId} = ${rid}`).orderBy(products.category, products.name);
  const [inv, offerCounts] = await Promise.all([
    db.select({ productId: inventoryItems.productId }).from(inventoryItems).where(eq5(inventoryItems.restaurantId, rid)),
    db.select({ productId: supplierOffers.productId, count: sql3`count(*)`, minPrice: sql3`min(${supplierOffers.packPriceEur} / ${supplierOffers.packQty})` }).from(supplierOffers).where(eq5(supplierOffers.restaurantId, rid)).groupBy(supplierOffers.productId)
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
  const body = z3.object({ name: z3.string().min(2), category: z3.enum(["feculents", "frais", "viandes_poissons", "epicerie", "boissons", "emballages"]), baseUnit: z3.enum(["kg", "g", "L", "mL", "piece", "botte", "sac", "carton"]), aliases: z3.array(z3.string()).default([]) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides", details: body.error.flatten() }, 400);
  const [row] = await db.insert(products).values({ ...body.data, restaurantId: rid }).returning();
  return c.json(row, 201);
});
catalogRoutes.post("/catalog/track", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body = z3.object({ productIds: z3.array(z3.string().uuid()).min(1), criticalLevel: z3.number().nonnegative().optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const res = await db.insert(inventoryItems).values(body.data.productIds.map((productId) => ({ restaurantId: rid, productId, quantity: "0", criticalLevel: (body.data.criticalLevel ?? 0).toFixed(3) }))).onConflictDoNothing().returning({ id: inventoryItems.id });
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
  const body = z3.object({ templates: z3.array(z3.string()).min(1), prices: z3.record(z3.number()).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const byName = await ensureReference();
  const chosen = RECIPE_TEMPLATES.filter((t) => body.data.templates.includes(t.name));
  if (!chosen.length) return c.json({ error: "Aucune recette reconnue" }, 400);
  const existing = await db.select({ name: recipes.name }).from(recipes).where(eq5(recipes.restaurantId, rid));
  const have = new Set(existing.map((r) => r.name));
  let createdRecipes = 0;
  const productIds = /* @__PURE__ */ new Set();
  for (const t of chosen) {
    for (const [p] of t.ingredients) {
      const id = byName.get(p);
      if (id) productIds.add(id);
    }
    if (have.has(t.name)) continue;
    const price = body.data.prices?.[t.name] ?? t.suggestedPrice;
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
  const body = importSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const { headers, rows } = parseCsv(body.data.csv);
  if (!rows.length) return c.json({ error: "Fichier vide ou illisible", headers }, 400);
  const byName = await ensureReference();
  const privateProducts = await db.select({ id: products.id, name: products.name, aliases: products.aliases }).from(products).where(eq5(products.restaurantId, rid));
  const findPrivate = (q2) => privateProducts.find((p) => normalize(p.name) === normalize(q2) || p.aliases.some((a) => normalize(a) === normalize(q2)));
  const previews = rows.map((row, i) => {
    const supplier = pick(row, "supplier") || body.data.defaultSupplier || "";
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
  if (body.data.dryRun) return c.json({ headers, summary, previews });
  const supRows = await db.select().from(suppliers).where(eq5(suppliers.restaurantId, rid));
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
  const rows = await db.select({ supplier: suppliers.name, product: products.name, pack: supplierOffers.packLabel, qty: supplierOffers.packQty, price: supplierOffers.packPriceEur, unit: products.baseUnit, phone: suppliers.phone, whatsapp: suppliers.whatsapp, email: suppliers.email, city: suppliers.city, lead: suppliers.leadTimeHours, min: suppliers.minOrderEur, fee: suppliers.deliveryFeeEur }).from(supplierOffers).innerJoin(suppliers, eq5(suppliers.id, supplierOffers.supplierId)).innerJoin(products, eq5(products.id, supplierOffers.productId)).where(eq5(supplierOffers.restaurantId, rid)).orderBy(suppliers.name, products.name);
  const esc2 = (v) => {
    const s = v === null || v === void 0 ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = "fournisseur;produit;conditionnement;quantite;unite;prix;telephone;whatsapp;email;ville;delai_h;minimum;frais_livraison";
  const body = rows.map((r) => [r.supplier, r.product, r.pack, Number(r.qty), r.unit, Number(r.price).toFixed(2).replace(".", ","), r.phone, r.whatsapp, r.email, r.city, r.lead, Number(r.min), Number(r.fee)].map(esc2).join(";"));
  return new Response("\uFEFF" + [header, ...body].join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="afrisupply-offres.csv"' } });
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

// apps/api/src/routes/intelligence.ts
init_src();
import { Hono as Hono4 } from "hono";
import { z as z4 } from "zod";
import { and as and4, eq as eq6, desc as desc2, gte as gte2, sql as sql4, inArray as inArray3 } from "drizzle-orm";

// apps/api/src/lib/forecast.ts
var DAY_MS = 864e5;
var DOW_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
var isoDay2 = (d) => d.toISOString().slice(0, 10);
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
      let num2 = 0, den = 0;
      for (let k = 1; k <= 4; k++) {
        const past = isoDay2(new Date(target.getTime() - k * 7 * DAY_MS));
        const v = hist.get(past);
        if (v !== void 0) {
          num2 += v * WEIGHTS[k - 1];
          den += WEIGHTS[k - 1];
        }
      }
      let base;
      const closedDow = den === 0 && [1, 2, 3].every((k) => {
        const before = hist.has(isoDay2(new Date(target.getTime() - (k * 7 + 1) * DAY_MS)));
        const after = hist.has(isoDay2(new Date(target.getTime() - (k * 7 - 1) * DAY_MS)));
        return before || after;
      });
      if (den > 0) base = num2 / den;
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
  for (const n6 of needs) {
    if (n6.neededQty <= 0) continue;
    const cands = offers.filter((o) => o.productId === n6.productId && o.inStock);
    if (!cands.length) {
      unavailable.push({ productId: n6.productId, productName: n6.productName, unit: n6.unit, neededQty: n6.neededQty });
      continue;
    }
    const urgencyH = n6.daysOfStockLeft !== null ? Math.max(24, n6.daysOfStockLeft * 24) : Infinity;
    const score = (o) => {
      const packs2 = Math.max(1, Math.ceil(n6.neededQty / o.packQty));
      const cost = packs2 * o.packPrice;
      const latePenalty = o.leadTimeHours > urgencyH ? 1e6 : 0;
      const reliabilityPenalty = (100 - o.reliabilityPct) / 100 * cost * 0.15;
      return cost + latePenalty + reliabilityPenalty;
    };
    const ranked = [...cands].sort((a, b) => score(a) - score(b));
    const best = ranked[0];
    const packs = Math.max(1, Math.ceil(n6.neededQty / best.packQty));
    const usual = n6.preferredSupplierId ? cands.find((o) => o.supplierId === n6.preferredSupplierId) : void 0;
    const usualCost = usual ? Math.max(1, Math.ceil(n6.neededQty / usual.packQty)) * usual.packPrice : packs * best.packPrice;
    baseline += usualCost;
    const lineTotal = packs * best.packPrice;
    const reason = best.leadTimeHours > 48 && urgencyH !== Infinity ? `D\xE9lai ${Math.round(best.leadTimeHours / 24)} j accept\xE9 (stock ${n6.daysOfStockLeft} j)` : usual && usual.offerId !== best.offerId ? `${best.supplierName} moins cher que ${usual.supplierName} (${(usualCost - lineTotal).toFixed(2)} \u20AC \xE9conomis\xE9s)` : best.unitPrice === Math.min(...cands.map((c) => c.unitPrice)) ? "Meilleur prix disponible" : "Meilleur compromis prix / d\xE9lai / fiabilit\xE9";
    choices.push({ line: { productId: n6.productId, productName: n6.productName, unit: n6.unit, neededQty: n6.neededQty, offer: best, packs, quantity: packs * best.packQty, lineTotal, alternativeSaving: Math.max(0, usualCost - lineTotal), reason }, alternatives: ranked.slice(1) });
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
  const suppliers2 = [...groups.values()].sort((a, b) => b.total - a.total);
  const total = Math.round(suppliers2.reduce((a, g) => a + g.total, 0) * 100) / 100;
  return { suppliers: suppliers2, total, baselineTotal: Math.round(baseline * 100) / 100, saving: Math.round(Math.max(0, baseline - suppliers2.reduce((a, g) => a + g.subtotal, 0)) * 100) / 100, unavailable, notes };
}

// apps/api/src/lib/assistant.ts
var norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, " ");
var RULES = [
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
    const ne = norm(e);
    const first = ne.split(/[\s(]/)[0];
    const score = ne.length > 3 && q2.includes(ne) ? 1e3 + ne.length : first.length >= 4 && q2.includes(first) ? first.length : 0;
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
var EXAMPLE_QUESTIONS = [
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
var eur = (v) => `${v.toFixed(2).replace(".", ",")} \u20AC`;
var qty = (v, u) => `${Number.isInteger(v) ? v : v.toFixed(1).replace(".", ",")} ${u}`;

// apps/api/src/routes/intelligence.ts
var intelligenceRoutes = new Hono4();
intelligenceRoutes.use("*", requireAuth, requireRestaurant);
var n3 = (v) => v === null || v === void 0 ? 0 : Number(v);
async function loadContext(rid) {
  const db = await getDb();
  const [restaurant] = await db.select().from(restaurants).where(eq6(restaurants.id, rid));
  const [inv, salesRows, ingRows, recs, offerRows, statRows] = await Promise.all([
    db.select({ item: inventoryItems, product: products }).from(inventoryItems).innerJoin(products, eq6(products.id, inventoryItems.productId)).where(eq6(inventoryItems.restaurantId, rid)),
    db.select({ recipeId: sales.recipeId, day: sales.day, portions: sales.portions }).from(sales).where(and4(eq6(sales.restaurantId, rid), gte2(sales.day, new Date(Date.now() - 70 * 864e5).toISOString().slice(0, 10)))),
    db.select({ recipeId: recipeIngredients.recipeId, productId: recipeIngredients.productId, quantity: recipeIngredients.quantity }).from(recipeIngredients).innerJoin(recipes, eq6(recipes.id, recipeIngredients.recipeId)).where(and4(eq6(recipes.restaurantId, rid), eq6(recipes.isActive, true))),
    db.select().from(recipes).where(eq6(recipes.restaurantId, rid)),
    db.select({ offer: supplierOffers, supplier: suppliers }).from(supplierOffers).innerJoin(suppliers, eq6(suppliers.id, supplierOffers.supplierId)).where(and4(eq6(supplierOffers.restaurantId, rid), eq6(suppliers.isActive, true))),
    db.select({ supplierId: orders.supplierId, delivered: sql4`count(*) filter (where ${orders.status} in ('livree','livree_partiel'))`, late: sql4`count(*) filter (where ${deliveries.isLate})`, disc: sql4`count(*) filter (where ${deliveries.hasDiscrepancy})`, spent: sql4`coalesce(sum(${orders.totalEur}),0)` }).from(orders).leftJoin(deliveries, eq6(deliveries.orderId, orders.id)).where(eq6(orders.restaurantId, rid)).groupBy(orders.supplierId)
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
  const body = z4.object({ suppliers: z4.array(z4.object({ supplierId: z4.string().uuid(), lines: z4.array(z4.object({ offerId: z4.string().uuid(), packs: z4.number().int().positive() })).min(1) })).min(1), source: z4.string().default("panier_ia") }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const created = [];
  for (const s of body.data.suppliers) {
    const [sup] = await db.select().from(suppliers).where(and4(eq6(suppliers.id, s.supplierId), eq6(suppliers.restaurantId, rid)));
    if (!sup) continue;
    const offs = await db.select().from(supplierOffers).where(and4(eq6(supplierOffers.supplierId, sup.id), inArray3(supplierOffers.id, s.lines.map((l) => l.offerId))));
    const [{ count }] = await db.select({ count: sql4`count(*)` }).from(orders).where(eq6(orders.restaurantId, rid));
    const reference = `AFS-${(/* @__PURE__ */ new Date()).getFullYear()}-${String(n3(count) + 1).padStart(6, "0")}`;
    const lines = s.lines.flatMap((l) => {
      const o = offs.find((x) => x.id === l.offerId);
      if (!o) return [];
      const unit2 = n3(o.packPriceEur) / n3(o.packQty);
      return [{ productId: o.productId, offerId: o.id, packLabel: o.packLabel, packs: l.packs, quantity: (l.packs * n3(o.packQty)).toFixed(3), unitPriceEur: unit2.toFixed(4), lineTotalEur: (l.packs * n3(o.packPriceEur)).toFixed(2) }];
    });
    const total = lines.reduce((a, l) => a + Number(l.lineTotalEur), 0);
    const [order] = await db.insert(orders).values({ restaurantId: rid, supplierId: sup.id, reference, status: "preparee", channel: sup.preferredChannel, expectedAt: new Date(Date.now() + sup.leadTimeHours * 36e5).toISOString().slice(0, 10), totalEur: total.toFixed(2), deliveryFeeEur: sup.deliveryFeeEur, source: body.data.source, createdBy: user.id }).returning();
    await db.insert(orderLines).values(lines.map((l) => ({ ...l, orderId: order.id })));
    created.push({ reference, supplierName: sup.name, total });
  }
  return c.json({ created, message: `${created.length} commande${created.length > 1 ? "s" : ""} pr\xE9par\xE9e${created.length > 1 ? "s" : ""} pour ${eur(created.reduce((a, x) => a + x.total, 0))}. Validez-les dans Achats.` }, 201);
});
intelligenceRoutes.get("/reorder-rules", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const rows = await db.select({ rule: reorderRules, product: products, item: inventoryItems }).from(reorderRules).innerJoin(inventoryItems, eq6(inventoryItems.id, reorderRules.inventoryItemId)).innerJoin(products, eq6(products.id, inventoryItems.productId)).where(eq6(reorderRules.restaurantId, rid));
  return c.json({ rules: rows.map((r) => ({ ...r.rule, productName: r.product.name, unit: r.product.baseUnit, quantity: n3(r.item.quantity) })) });
});
intelligenceRoutes.put("/reorder-rules/:inventoryItemId", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body = z4.object({ enabled: z4.boolean().default(true), threshold: z4.number().nonnegative(), reorderQty: z4.number().positive(), supplierStrategy: z4.enum(["best", "preferred"]).default("best") }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const [item] = await db.select().from(inventoryItems).where(and4(eq6(inventoryItems.id, c.req.param("inventoryItemId")), eq6(inventoryItems.restaurantId, rid)));
  if (!item) return c.json({ error: "Article introuvable" }, 404);
  const [rule] = await db.insert(reorderRules).values({ restaurantId: rid, inventoryItemId: item.id, enabled: body.data.enabled, threshold: body.data.threshold.toFixed(3), reorderQty: body.data.reorderQty.toFixed(3), supplierStrategy: body.data.supplierStrategy }).onConflictDoUpdate({ target: reorderRules.inventoryItemId, set: { enabled: body.data.enabled, threshold: body.data.threshold.toFixed(3), reorderQty: body.data.reorderQty.toFixed(3), supplierStrategy: body.data.supplierStrategy } }).returning();
  return c.json(rule);
});
intelligenceRoutes.delete("/reorder-rules/:inventoryItemId", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  await db.delete(reorderRules).where(and4(eq6(reorderRules.inventoryItemId, c.req.param("inventoryItemId")), eq6(reorderRules.restaurantId, rid)));
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
  const [recs, rows] = await Promise.all([db.select().from(recipes).where(and4(eq6(recipes.restaurantId, rid), eq6(recipes.isActive, true))).orderBy(recipes.name), db.select().from(sales).where(and4(eq6(sales.restaurantId, rid), eq6(sales.day, day)))]);
  const last14 = await db.select({ day: sales.day, portions: sql4`sum(${sales.portions})` }).from(sales).where(and4(eq6(sales.restaurantId, rid), gte2(sales.day, new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)))).groupBy(sales.day).orderBy(sales.day);
  return c.json({ day, recipes: recs.map((r) => ({ id: r.id, name: r.name, portions: rows.find((s) => s.recipeId === r.id)?.portions ?? 0 })), history: last14.map((h) => ({ day: h.day, portions: n3(h.portions) })) });
});
intelligenceRoutes.post("/sales", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const user = c.get("user");
  const body = z4.object({ day: z4.string().regex(/^\d{4}-\d{2}-\d{2}$/), lines: z4.array(z4.object({ recipeId: z4.string().uuid(), portions: z4.number().int().nonnegative() })), decrementStock: z4.boolean().default(true) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const { day, lines, decrementStock } = body.data;
  const prev = await db.select().from(sales).where(and4(eq6(sales.restaurantId, rid), eq6(sales.day, day)));
  const prevMap = new Map(prev.map((p) => [p.recipeId, p.portions]));
  let consumed = 0;
  for (const l of lines) {
    await db.insert(sales).values({ restaurantId: rid, recipeId: l.recipeId, day, portions: l.portions }).onConflictDoUpdate({ target: [sales.restaurantId, sales.recipeId, sales.day], set: { portions: l.portions } });
    const delta = l.portions - (prevMap.get(l.recipeId) ?? 0);
    if (!decrementStock || delta === 0) continue;
    const ings = await db.select().from(recipeIngredients).where(eq6(recipeIngredients.recipeId, l.recipeId));
    for (const ing of ings) {
      const [inv] = await db.select().from(inventoryItems).where(and4(eq6(inventoryItems.restaurantId, rid), eq6(inventoryItems.productId, ing.productId)));
      if (!inv) continue;
      const q2 = delta * n3(ing.quantity);
      const { stockMovements: stockMovements2 } = await Promise.resolve().then(() => (init_src(), src_exports));
      await db.insert(stockMovements2).values({ restaurantId: rid, inventoryItemId: inv.id, type: "consommation", quantity: (-q2).toFixed(3), note: `Ventes ${day}`, createdBy: user.id });
      await db.update(inventoryItems).set({ quantity: Math.max(0, n3(inv.quantity) - q2).toFixed(3), updatedAt: /* @__PURE__ */ new Date() }).where(eq6(inventoryItems.id, inv.id));
      consumed++;
    }
  }
  return c.json({ ok: true, day, movements: consumed });
});
intelligenceRoutes.get("/assistant/examples", (c) => c.json({ examples: EXAMPLE_QUESTIONS, llm: llmEnabled() }));
intelligenceRoutes.post("/assistant/ask", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body = z4.object({ question: z4.string().min(2).max(500) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Question invalide" }, 400);
  const question = body.data.question;
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
      facts.push(`Produits \xE0 commander sur ${ctx.horizon} j : ${needs.length}`, ...needs.slice(0, 12).map((f) => `- ${f.productName} : besoin ${qty(f.predictedNeed, f.unit)}, stock ${qty(f.currentStock, f.unit)}, commander ${qty(f.recommendedOrder, f.unit)}${f.stockoutDay ? ` (rupture pr\xE9vue le ${f.stockoutDay})` : ""}`), `Panier optimis\xE9 : ${eur(cart.total)} chez ${cart.suppliers.length} fournisseur(s) ; \xE9conomie vs habitudes : ${eur(cart.saving)}`);
      draft = needs.length ? `Pour les ${ctx.horizon} prochains jours, tu dois commander **${needs.length} produits**. Les plus urgents : ${urgent.map((f) => `${f.productName} (${qty(f.recommendedOrder, f.unit)}, rupture pr\xE9vue le ${f.stockoutDay?.slice(8, 10)}/${f.stockoutDay?.slice(5, 7)})`).join(", ") || "aucune rupture imminente"}. J'ai pr\xE9par\xE9 un panier optimis\xE9 de **${eur(cart.total)}** r\xE9parti entre ${cart.suppliers.map((s) => s.supplierName).join(", ")}${cart.saving > 0 ? `, soit **${eur(cart.saving)} d'\xE9conomie** par rapport \xE0 tes fournisseurs habituels` : ""}.` : `Bonne nouvelle : d'apr\xE8s tes ventes et ton stock, rien d'urgent \xE0 commander sur ${ctx.horizon} jours.`;
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
      facts.push(...cmp.ranked.map((o) => `- ${o.supplierName} : ${eur(o.unitPrice)}/${s.unit} (${o.packLabel} ${eur(o.packPrice)}), d\xE9lai ${Math.round(o.leadTimeHours / 24)} j, ${o.inStock ? "en stock" : "rupture"}, fiabilit\xE9 ${o.reliabilityPct} %, score ${o.score}`));
      draft = cmp.recommended ? `Pour **${s.productName.toLowerCase()}**, ${cmp.ranked.length} fournisseur${cmp.ranked.length > 1 ? "s" : ""} : ${cmp.ranked.map((o) => `${o.supplierName} \xE0 ${eur(o.unitPrice)}/${s.unit}`).join(", ")}. ${cmp.headline}. ${cmp.justification.slice(0, 2).join(" ")}` : `Aucun fournisseur ne propose ${s.productName.toLowerCase()} pour l'instant \u2014 ajoute une offre via l'import.`;
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
      facts.push(`${r.name} : co\xFBt mati\xE8re ${eur(cost.total)}, prix de vente ${sell ? eur(sell) : "non renseign\xE9"}, marge brute ${m.grossMargin !== null ? eur(m.grossMargin) : "n/a"} (${m.marginPct ?? "n/a"} %), objectif ${n3(r.targetMarginPct) || 70} %`, `Top ingr\xE9dients : ${top.map((l) => `${l.productName} ${eur(l.cost)}`).join(", ")}`, ...cost.unpriced.length ? [`Sans prix connu : ${cost.unpriced.join(", ")}`] : []);
      if (cls.intent === "dish_cost") draft = `Ton **${r.name}** te co\xFBte **${eur(cost.total)}** de mati\xE8res par portion${sell ? `, pour un prix de vente de ${eur(sell)} : marge brute **${eur(m.grossMargin)}** (${m.marginPct} %)` : ""}. Les postes principaux : ${top.map((l) => `${l.productName.toLowerCase()} (${eur(l.cost)})`).join(", ")}.${cost.unpriced.length ? ` Attention, ${cost.unpriced.length} ingr\xE9dient${cost.unpriced.length > 1 ? "s" : ""} sans prix connu (${cost.unpriced.slice(0, 3).join(", ")}) : le co\xFBt r\xE9el est un peu plus \xE9lev\xE9.` : ""}`;
      else draft = !sell ? `Renseigne d'abord le prix de vente du ${r.name}. Avec un co\xFBt mati\xE8re de ${eur(cost.total)} et un objectif de ${n3(r.targetMarginPct) || 70} % de marge, le prix conseill\xE9 serait **${eur(m.suggestedPrice)}**.` : m.suggestedPrice ? `Oui, je te le conseille : le ${r.name} est vendu ${eur(sell)} pour ${eur(cost.total)} de mati\xE8res, soit ${m.marginPct} % de marge, sous ton objectif de ${n3(r.targetMarginPct) || 70} %. **Prix conseill\xE9 : ${eur(m.suggestedPrice)}**. Alternative : r\xE9duire le poste ${top[0].productName.toLowerCase()} (${eur(top[0].cost)}).` : `Pas n\xE9cessaire : \xE0 ${eur(sell)}, ton ${r.name} d\xE9gage ${m.marginPct} % de marge brute (${eur(m.grossMargin)}), au-dessus de ton objectif. Surveille surtout ${top[0].productName.toLowerCase()}, premier poste de co\xFBt.`;
      actions.push({ label: "Voir les recettes", url: "/app/recettes" });
      break;
    }
    case "most_reliable_supplier": {
      const rows = supplierNames.map((name) => {
        const id = ctx.offers.find((o) => o.supplierName === name).supplierId;
        return { name, ...ctx.stats.get(id) ?? { delivered: 0, late: 0, discrepancies: 0, spent: 0, reliability: 85 } };
      }).sort((a, b) => b.reliability - a.reliability || b.delivered - a.delivered);
      facts.push(...rows.map((r) => `- ${r.name} : fiabilit\xE9 ${r.reliability} %, ${r.delivered} livraisons, ${r.late} retards, ${r.discrepancies} \xE9carts, ${eur(r.spent)} d\xE9pens\xE9s`));
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
      const [sp] = await db.select({ month: sql4`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${start.toISOString()}),0)`, last30: sql4`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${new Date(Date.now() - 30 * 864e5).toISOString()}),0)`, prev30: sql4`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${new Date(Date.now() - 60 * 864e5).toISOString()} and ${orders.createdAt} < ${new Date(Date.now() - 30 * 864e5).toISOString()}),0)` }).from(orders).where(and4(eq6(orders.restaurantId, rid), sql4`${orders.status} <> 'annulee'`));
      const bySup = await db.select({ name: suppliers.name, total: sql4`sum(${orders.totalEur})` }).from(orders).innerJoin(suppliers, eq6(suppliers.id, orders.supplierId)).where(and4(eq6(orders.restaurantId, rid), gte2(orders.createdAt, new Date(Date.now() - 30 * 864e5)))).groupBy(suppliers.name).orderBy(desc2(sql4`sum(${orders.totalEur})`));
      const ph = await db.select({ productName: products.name, unit: products.baseUnit, supplierName: suppliers.name, price: priceHistory.unitPriceEur, at: priceHistory.recordedAt, offerId: priceHistory.offerId }).from(priceHistory).innerJoin(supplierOffers, eq6(supplierOffers.id, priceHistory.offerId)).innerJoin(products, eq6(products.id, supplierOffers.productId)).innerJoin(suppliers, eq6(suppliers.id, supplierOffers.supplierId)).where(and4(eq6(priceHistory.restaurantId, rid), gte2(priceHistory.recordedAt, new Date(Date.now() - 60 * 864e5)))).orderBy(priceHistory.recordedAt);
      const hikes = [];
      for (const offerId of new Set(ph.map((p) => p.offerId))) {
        const pts = ph.filter((p) => p.offerId === offerId);
        if (pts.length < 2) continue;
        const a = n3(pts[0].price), b = n3(pts[pts.length - 1].price);
        if (a > 0 && (b - a) / a >= 0.05) hikes.push({ productName: pts[0].productName, supplierName: pts[0].supplierName, pct: Math.round((b - a) / a * 100), from: a, to: b, unit: pts[0].unit });
      }
      hikes.sort((x, y) => y.pct - x.pct);
      const evo = n3(sp.prev30) > 0 ? Math.round((n3(sp.last30) - n3(sp.prev30)) / n3(sp.prev30) * 100) : null;
      facts.push(`D\xE9penses mois en cours ${eur(n3(sp.month))}, 30 derniers jours ${eur(n3(sp.last30))}, 30 j pr\xE9c\xE9dents ${eur(n3(sp.prev30))}, \xE9volution ${evo ?? "n/a"} %`, `Par fournisseur (30 j) : ${bySup.map((b) => `${b.name} ${eur(n3(b.total))}`).join(", ")}`, `Hausses de prix (60 j) : ${hikes.map((h) => `${h.productName} chez ${h.supplierName} +${h.pct} % (${eur(h.from)}\u2192${eur(h.to)}/${h.unit})`).join(" ; ") || "aucune"}`);
      if (cls.intent === "monthly_spend") draft = `Ce mois-ci, tu as d\xE9pens\xE9 **${eur(n3(sp.month))}** chez tes fournisseurs (${eur(n3(sp.last30))} sur 30 jours glissants${evo !== null ? `, ${evo > 0 ? "+" : ""}${evo} % vs la p\xE9riode pr\xE9c\xE9dente` : ""}). R\xE9partition : ${bySup.slice(0, 4).map((b) => `${b.name} ${eur(n3(b.total))}`).join(", ")}.`;
      else draft = `${evo !== null ? `Tes achats ont \xE9volu\xE9 de **${evo > 0 ? "+" : ""}${evo} %** sur 30 jours (${eur(n3(sp.last30))} vs ${eur(n3(sp.prev30))}). ` : ""}${hikes.length ? `Les causes identifi\xE9es c\xF4t\xE9 prix : ${hikes.slice(0, 3).map((h) => `**${h.productName}** +${h.pct} % chez ${h.supplierName} (${eur(h.from)} \u2192 ${eur(h.to)}/${h.unit})`).join(", ")}. ` : "Aucune hausse de tarif fournisseur significative : la variation vient des volumes command\xE9s. "}${bySup[0] ? `Ton premier poste est ${bySup[0].name} (${eur(n3(bySup[0].total))} sur 30 j).` : ""}${hikes.length ? " Je peux te proposer des alternatives moins ch\xE8res pour ces produits." : ""}`;
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
async function runAutoReorder(rid, userId = null) {
  const db = await getDb();
  const ctx = await loadContext(rid);
  const rules = await db.select().from(reorderRules).where(and4(eq6(reorderRules.restaurantId, rid), eq6(reorderRules.enabled, true)));
  const pending = await db.select({ productId: orderLines.productId }).from(orderLines).innerJoin(orders, eq6(orders.id, orderLines.orderId)).where(and4(eq6(orders.restaurantId, rid), inArray3(orders.status, ["preparee", "envoyee", "confirmee"])));
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
    const [{ count }] = await db.select({ count: sql4`count(*)` }).from(orders).where(eq6(orders.restaurantId, rid));
    const reference = `AFS-${(/* @__PURE__ */ new Date()).getFullYear()}-${String(n3(count) + 1).padStart(6, "0")}`;
    const total = packs * best.packPrice;
    const sup = await db.select().from(suppliers).where(eq6(suppliers.id, best.supplierId)).then((r) => r[0]);
    const [order] = await db.insert(orders).values({ restaurantId: rid, supplierId: best.supplierId, reference, status: "preparee", channel: sup.preferredChannel, expectedAt: new Date(Date.now() + best.leadTimeHours * 36e5).toISOString().slice(0, 10), totalEur: total.toFixed(2), deliveryFeeEur: best.deliveryFee.toFixed(2), source: "auto_reorder", createdBy: userId, notes: cmp.justification.join(" ") }).returning();
    await db.insert(orderLines).values({ orderId: order.id, productId: s.productId, offerId: best.offerId, packLabel: best.packLabel, packs, quantity: (packs * best.packQty).toFixed(3), unitPriceEur: best.unitPrice.toFixed(4), lineTotalEur: total.toFixed(2) });
    await db.insert(alerts).values({ restaurantId: rid, dedupeKey: `auto_reorder:${order.id}`, kind: "stock_bas", severity: "blue", title: `\u{1F916} Auto-Reorder \u2014 ${s.productName}`, message: `Stock \xE0 ${qty(s.quantity, s.unit)} (seuil ${qty(n3(rule.threshold), s.unit)}). Commande de ${qty(packs * best.packQty, s.unit)} pr\xE9par\xE9e chez ${best.supplierName} pour ${eur(total)}. ${cmp.justification[1] ?? ""}`.trim(), productId: s.productId, supplierId: best.supplierId, actionUrl: "/app/achats" }).onConflictDoNothing();
    prepared.push({ productName: s.productName, supplierName: best.supplierName, packs, packLabel: best.packLabel, total, reference });
  }
  return { prepared, skipped };
}

// apps/api/src/routes/manage.ts
init_src();
import { Hono as Hono5 } from "hono";
import { z as z5 } from "zod";
import { and as and5, eq as eq7, desc as desc3, gte as gte3, inArray as inArray4, sql as sql5 } from "drizzle-orm";

// apps/api/src/lib/messages.ts
var eur2 = (v) => `${v.toFixed(2).replace(".", ",")} \u20AC`;
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
  const body = [
    greeting,
    "",
    `Merci de pr\xE9parer la commande ${i.reference} pour ${i.restaurantName} :`,
    "",
    lines,
    "",
    `Total estim\xE9 : ${eur2(i.total)}${i.deliveryFee ? ` (+ ${eur2(i.deliveryFee)} de livraison)` : ""}.`,
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
    body,
    whatsappUrl: `https://wa.me/${wa ?? ""}?text=${encodeURIComponent(body)}`,
    mailtoUrl: `mailto:${i.supplier.email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    hasWhatsapp: !!wa,
    hasEmail: !!i.supplier.email
  };
}

// apps/api/src/routes/manage.ts
var manageRoutes = new Hono5();
manageRoutes.use("*", requireAuth, requireRestaurant);
var n4 = (v) => v === null || v === void 0 ? 0 : Number(v);
var CHANNELS = ["email", "whatsapp", "telephone", "plateforme"];
var CATEGORIES = ["feculents", "frais", "viandes_poissons", "epicerie", "boissons", "emballages"];
var supplierBody = z5.object({
  name: z5.string().min(2),
  contactName: z5.string().nullable().optional(),
  email: z5.string().email().nullable().optional().or(z5.literal("")),
  phone: z5.string().nullable().optional(),
  whatsapp: z5.string().nullable().optional(),
  city: z5.string().nullable().optional(),
  categories: z5.array(z5.enum(CATEGORIES)).optional(),
  leadTimeHours: z5.number().int().positive().optional(),
  deliveryDays: z5.array(z5.number().int().min(1).max(7)).optional(),
  minOrderEur: z5.number().nonnegative().optional(),
  deliveryFeeEur: z5.number().nonnegative().optional(),
  preferredChannel: z5.enum(CHANNELS).optional(),
  rating: z5.number().min(0).max(5).nullable().optional(),
  notes: z5.string().nullable().optional(),
  isActive: z5.boolean().optional()
});
manageRoutes.put("/suppliers/:id", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body = supplierBody.partial().safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides", details: body.error.flatten() }, 400);
  const d = body.data;
  const [row] = await db.update(suppliers).set({
    ...d,
    email: d.email === "" ? null : d.email,
    minOrderEur: d.minOrderEur !== void 0 ? d.minOrderEur.toFixed(2) : void 0,
    deliveryFeeEur: d.deliveryFeeEur !== void 0 ? d.deliveryFeeEur.toFixed(2) : void 0,
    rating: d.rating === null ? null : d.rating !== void 0 ? d.rating.toFixed(1) : void 0
  }).where(and5(eq7(suppliers.id, c.req.param("id")), eq7(suppliers.restaurantId, rid))).returning();
  if (!row) return c.json({ error: "Fournisseur introuvable" }, 404);
  return c.json(row);
});
manageRoutes.delete("/suppliers/:id", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const [row] = await db.update(suppliers).set({ isActive: false }).where(and5(eq7(suppliers.id, c.req.param("id")), eq7(suppliers.restaurantId, rid))).returning({ id: suppliers.id });
  if (!row) return c.json({ error: "Fournisseur introuvable" }, 404);
  await db.update(supplierOffers).set({ inStock: false }).where(eq7(supplierOffers.supplierId, row.id));
  return c.json({ ok: true });
});
var offerBody = z5.object({ productId: z5.string().uuid(), packLabel: z5.string().min(1), packQty: z5.number().positive(), packPrice: z5.number().positive(), inStock: z5.boolean().default(true) });
manageRoutes.post("/suppliers/:id/offers", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const supplierId = c.req.param("id");
  const body = offerBody.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides", details: body.error.flatten() }, 400);
  const [sup] = await db.select({ id: suppliers.id }).from(suppliers).where(and5(eq7(suppliers.id, supplierId), eq7(suppliers.restaurantId, rid)));
  if (!sup) return c.json({ error: "Fournisseur introuvable" }, 404);
  const d = body.data;
  const [offer] = await db.insert(supplierOffers).values({ restaurantId: rid, supplierId, productId: d.productId, packLabel: d.packLabel, packQty: d.packQty.toFixed(3), packPriceEur: d.packPrice.toFixed(2), inStock: d.inStock }).onConflictDoUpdate({ target: [supplierOffers.supplierId, supplierOffers.productId, supplierOffers.packLabel], set: { packQty: d.packQty.toFixed(3), packPriceEur: d.packPrice.toFixed(2), inStock: d.inStock, lastSeenAt: /* @__PURE__ */ new Date() } }).returning();
  await db.insert(priceHistory).values({ restaurantId: rid, offerId: offer.id, unitPriceEur: (d.packPrice / d.packQty).toFixed(4), source: "manuel" });
  await db.insert(inventoryItems).values({ restaurantId: rid, productId: d.productId, quantity: "0", criticalLevel: "0" }).onConflictDoNothing();
  return c.json(offer, 201);
});
manageRoutes.put("/offers/:id", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body = offerBody.omit({ productId: true }).partial().safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const d = body.data;
  const [before] = await db.select().from(supplierOffers).where(and5(eq7(supplierOffers.id, c.req.param("id")), eq7(supplierOffers.restaurantId, rid)));
  if (!before) return c.json({ error: "Offre introuvable" }, 404);
  const [offer] = await db.update(supplierOffers).set({
    packLabel: d.packLabel,
    inStock: d.inStock,
    lastSeenAt: /* @__PURE__ */ new Date(),
    packQty: d.packQty !== void 0 ? d.packQty.toFixed(3) : void 0,
    packPriceEur: d.packPrice !== void 0 ? d.packPrice.toFixed(2) : void 0
  }).where(eq7(supplierOffers.id, before.id)).returning();
  const unitBefore = n4(before.packPriceEur) / n4(before.packQty), unitAfter = n4(offer.packPriceEur) / n4(offer.packQty);
  if (Math.abs(unitAfter - unitBefore) > 1e-4) await db.insert(priceHistory).values({ restaurantId: rid, offerId: offer.id, unitPriceEur: unitAfter.toFixed(4), source: "manuel" });
  return c.json({ ...offer, priceChangedPct: unitBefore > 0 ? Math.round((unitAfter - unitBefore) / unitBefore * 1e3) / 10 : null });
});
manageRoutes.delete("/offers/:id", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const [row] = await db.delete(supplierOffers).where(and5(eq7(supplierOffers.id, c.req.param("id")), eq7(supplierOffers.restaurantId, rid))).returning({ id: supplierOffers.id });
  if (!row) return c.json({ error: "Offre introuvable" }, 404);
  return c.json({ ok: true });
});
manageRoutes.get("/prices/:productId/history", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const days2 = Math.min(365, Number(c.req.query("days")) || 90);
  const rows = await db.select({ offerId: priceHistory.offerId, supplierId: supplierOffers.supplierId, supplierName: suppliers.name, packLabel: supplierOffers.packLabel, unitPrice: priceHistory.unitPriceEur, recordedAt: priceHistory.recordedAt, source: priceHistory.source }).from(priceHistory).innerJoin(supplierOffers, eq7(supplierOffers.id, priceHistory.offerId)).innerJoin(suppliers, eq7(suppliers.id, supplierOffers.supplierId)).where(and5(eq7(priceHistory.restaurantId, rid), eq7(supplierOffers.productId, c.req.param("productId")), gte3(priceHistory.recordedAt, new Date(Date.now() - days2 * 864e5)))).orderBy(priceHistory.recordedAt);
  const series = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (!series.has(r.offerId)) series.set(r.offerId, { offerId: r.offerId, supplierId: r.supplierId, supplierName: r.supplierName, packLabel: r.packLabel, points: [] });
    series.get(r.offerId).points.push({ at: r.recordedAt.toISOString(), price: n4(r.unitPrice), source: r.source });
  }
  const out = [...series.values()].map((s) => {
    const first = s.points[0].price, last = s.points[s.points.length - 1].price;
    return { ...s, first, last, changePct: first > 0 ? Math.round((last - first) / first * 1e3) / 10 : null };
  });
  return c.json({ days: days2, series: out });
});
var recipeBody = z5.object({
  name: z5.string().min(2),
  sellingPriceEur: z5.number().nonnegative().nullable().optional(),
  targetMarginPct: z5.number().min(0).max(100).optional(),
  isActive: z5.boolean().optional(),
  ingredients: z5.array(z5.object({ productId: z5.string().uuid(), quantity: z5.number().positive() })).min(1)
});
manageRoutes.post("/recipes", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body = recipeBody.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides", details: body.error.flatten() }, 400);
  const d = body.data;
  const [r] = await db.insert(recipes).values({ restaurantId: rid, name: d.name, sellingPriceEur: d.sellingPriceEur != null ? d.sellingPriceEur.toFixed(2) : null, targetMarginPct: (d.targetMarginPct ?? 70).toFixed(2) }).returning();
  await db.insert(recipeIngredients).values(d.ingredients.map((i) => ({ recipeId: r.id, productId: i.productId, quantity: i.quantity.toFixed(4) })));
  await db.insert(inventoryItems).values(d.ingredients.map((i) => ({ restaurantId: rid, productId: i.productId, quantity: "0", criticalLevel: "0" }))).onConflictDoNothing();
  return c.json(r, 201);
});
manageRoutes.put("/recipes/:id", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body = recipeBody.partial().safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides", details: body.error.flatten() }, 400);
  const d = body.data;
  const [r] = await db.update(recipes).set({
    name: d.name,
    isActive: d.isActive,
    sellingPriceEur: d.sellingPriceEur === null ? null : d.sellingPriceEur !== void 0 ? d.sellingPriceEur.toFixed(2) : void 0,
    targetMarginPct: d.targetMarginPct !== void 0 ? d.targetMarginPct.toFixed(2) : void 0
  }).where(and5(eq7(recipes.id, c.req.param("id")), eq7(recipes.restaurantId, rid))).returning();
  if (!r) return c.json({ error: "Recette introuvable" }, 404);
  if (d.ingredients) {
    await db.delete(recipeIngredients).where(eq7(recipeIngredients.recipeId, r.id));
    await db.insert(recipeIngredients).values(d.ingredients.map((i) => ({ recipeId: r.id, productId: i.productId, quantity: i.quantity.toFixed(4) })));
    await db.insert(inventoryItems).values(d.ingredients.map((i) => ({ restaurantId: rid, productId: i.productId, quantity: "0", criticalLevel: "0" }))).onConflictDoNothing();
  }
  return c.json(r);
});
manageRoutes.delete("/recipes/:id", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const [r] = await db.delete(recipes).where(and5(eq7(recipes.id, c.req.param("id")), eq7(recipes.restaurantId, rid))).returning({ id: recipes.id });
  if (!r) return c.json({ error: "Recette introuvable" }, 404);
  return c.json({ ok: true });
});
manageRoutes.put("/stock/:itemId", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body = z5.object({ criticalLevel: z5.number().nonnegative().optional(), targetLevel: z5.number().nonnegative().nullable().optional(), preferredSupplierId: z5.string().uuid().nullable().optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const d = body.data;
  const [row] = await db.update(inventoryItems).set({
    criticalLevel: d.criticalLevel !== void 0 ? d.criticalLevel.toFixed(3) : void 0,
    targetLevel: d.targetLevel === null ? null : d.targetLevel !== void 0 ? d.targetLevel.toFixed(3) : void 0,
    preferredSupplierId: d.preferredSupplierId,
    updatedAt: /* @__PURE__ */ new Date()
  }).where(and5(eq7(inventoryItems.id, c.req.param("itemId")), eq7(inventoryItems.restaurantId, rid))).returning();
  if (!row) return c.json({ error: "Article introuvable" }, 404);
  return c.json(row);
});
manageRoutes.delete("/stock/:itemId", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const [row] = await db.delete(inventoryItems).where(and5(eq7(inventoryItems.id, c.req.param("itemId")), eq7(inventoryItems.restaurantId, rid))).returning({ id: inventoryItems.id });
  if (!row) return c.json({ error: "Article introuvable" }, 404);
  return c.json({ ok: true });
});
manageRoutes.post("/stock/inventory", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const user = c.get("user");
  const body = z5.object({ counts: z5.array(z5.object({ itemId: z5.string().uuid(), quantity: z5.number().nonnegative() })).min(1), note: z5.string().optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const ids = body.data.counts.map((x) => x.itemId);
  const items = await db.select().from(inventoryItems).where(and5(eq7(inventoryItems.restaurantId, rid), inArray4(inventoryItems.id, ids)));
  const now = /* @__PURE__ */ new Date();
  let adjusted = 0;
  let totalDelta = 0;
  for (const cnt of body.data.counts) {
    const it = items.find((i) => i.id === cnt.itemId);
    if (!it) continue;
    const delta = cnt.quantity - n4(it.quantity);
    if (Math.abs(delta) > 5e-4) {
      await db.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: it.id, type: "ajustement", quantity: delta.toFixed(3), note: body.data.note ?? "Inventaire", createdBy: user.id });
      adjusted++;
      totalDelta += delta;
    }
    await db.update(inventoryItems).set({ quantity: cnt.quantity.toFixed(3), lastCountedAt: now, updatedAt: now }).where(eq7(inventoryItems.id, it.id));
  }
  return c.json({ counted: body.data.counts.length, adjusted, totalDelta: Math.round(totalDelta * 1e3) / 1e3 });
});
manageRoutes.get("/orders/:id/message", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const user = c.get("user");
  const [row] = await db.select({ order: orders, supplier: suppliers }).from(orders).innerJoin(suppliers, eq7(suppliers.id, orders.supplierId)).where(and5(eq7(orders.id, c.req.param("id")), eq7(orders.restaurantId, rid)));
  if (!row) return c.json({ error: "Commande introuvable" }, 404);
  const [restaurant] = await db.select().from(restaurants).where(eq7(restaurants.id, rid));
  const lines = await db.select({ line: orderLines, productName: products.name, unit: products.baseUnit }).from(orderLines).innerJoin(products, eq7(products.id, orderLines.productId)).where(eq7(orderLines.orderId, row.order.id));
  const msg = buildOrderMessage({
    reference: row.order.reference,
    restaurantName: restaurant.name,
    senderName: user.fullName,
    senderPhone: user.phone ?? null,
    supplier: { name: row.supplier.name, contactName: row.supplier.contactName, email: row.supplier.email, whatsapp: row.supplier.whatsapp ?? row.supplier.phone },
    expectedAt: row.order.expectedAt,
    notes: row.order.notes,
    total: n4(row.order.totalEur),
    deliveryFee: n4(row.order.deliveryFeeEur),
    lines: lines.map(({ line, productName, unit: unit2 }) => ({ productName, packLabel: line.packLabel, packs: line.packs, quantity: n4(line.quantity), unit: unit2, lineTotal: n4(line.lineTotalEur) }))
  });
  return c.json(msg);
});
manageRoutes.put("/orders/:id", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body = z5.object({ status: z5.enum(["preparee", "envoyee", "confirmee", "annulee"]).optional(), expectedAt: z5.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), notes: z5.string().nullable().optional(), channel: z5.enum(CHANNELS).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const [cur] = await db.select().from(orders).where(and5(eq7(orders.id, c.req.param("id")), eq7(orders.restaurantId, rid)));
  if (!cur) return c.json({ error: "Commande introuvable" }, 404);
  if (["livree", "livree_partiel", "annulee"].includes(cur.status)) return c.json({ error: "Commande cl\xF4tur\xE9e : modification impossible" }, 409);
  const d = body.data;
  const [o] = await db.update(orders).set({ status: d.status, expectedAt: d.expectedAt, notes: d.notes, channel: d.channel, sentAt: d.status === "envoyee" && !cur.sentAt ? /* @__PURE__ */ new Date() : void 0 }).where(eq7(orders.id, cur.id)).returning();
  return c.json({ order: o });
});
manageRoutes.put("/orders/:id/lines", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body = z5.object({ lines: z5.array(z5.object({ lineId: z5.string().uuid(), packs: z5.number().int().nonnegative() })).min(1) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const [cur] = await db.select().from(orders).where(and5(eq7(orders.id, c.req.param("id")), eq7(orders.restaurantId, rid)));
  if (!cur) return c.json({ error: "Commande introuvable" }, 404);
  if (cur.status !== "preparee") return c.json({ error: "Seule une commande \xAB pr\xE9par\xE9e \xBB peut \xEAtre modifi\xE9e" }, 409);
  const lines = await db.select().from(orderLines).where(eq7(orderLines.orderId, cur.id));
  for (const l of lines) {
    const upd = body.data.lines.find((x) => x.lineId === l.id);
    if (!upd) continue;
    if (upd.packs === 0) {
      await db.delete(orderLines).where(eq7(orderLines.id, l.id));
      continue;
    }
    const packQty = n4(l.quantity) / l.packs;
    const packPrice = n4(l.lineTotalEur) / l.packs;
    await db.update(orderLines).set({ packs: upd.packs, quantity: (upd.packs * packQty).toFixed(3), lineTotalEur: (upd.packs * packPrice).toFixed(2) }).where(eq7(orderLines.id, l.id));
  }
  const [{ total, count }] = await db.select({ total: sql5`coalesce(sum(${orderLines.lineTotalEur}),0)`, count: sql5`count(*)` }).from(orderLines).where(eq7(orderLines.orderId, cur.id));
  if (n4(count) === 0) {
    await db.update(orders).set({ status: "annulee", totalEur: "0" }).where(eq7(orders.id, cur.id));
    return c.json({ ok: true, cancelled: true });
  }
  const [o] = await db.update(orders).set({ totalEur: n4(total).toFixed(2) }).where(eq7(orders.id, cur.id)).returning();
  return c.json({ order: o });
});
manageRoutes.get("/discrepancies", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const onlyOpen = c.req.query("all") !== "1";
  const rows = await db.select({ d: deliveryDiscrepancies, delivery: deliveries, order: orders, supplierName: suppliers.name, productName: products.name, unit: products.baseUnit, unitPrice: orderLines.unitPriceEur }).from(deliveryDiscrepancies).innerJoin(deliveries, eq7(deliveries.id, deliveryDiscrepancies.deliveryId)).innerJoin(orders, eq7(orders.id, deliveries.orderId)).innerJoin(suppliers, eq7(suppliers.id, orders.supplierId)).innerJoin(orderLines, eq7(orderLines.id, deliveryDiscrepancies.orderLineId)).innerJoin(products, eq7(products.id, orderLines.productId)).where(onlyOpen ? and5(eq7(deliveries.restaurantId, rid), eq7(deliveryDiscrepancies.resolved, false)) : eq7(deliveries.restaurantId, rid)).orderBy(desc3(deliveries.receivedAt)).limit(200);
  const items = rows.map((r) => {
    const missing = n4(r.d.orderedQty) - n4(r.d.receivedQty);
    return { id: r.d.id, deliveryId: r.delivery.id, orderId: r.order.id, reference: r.order.reference, supplierName: r.supplierName, productName: r.productName, unit: r.unit, ordered: n4(r.d.orderedQty), received: n4(r.d.receivedQty), missing, valueEur: Math.round(missing * n4(r.unitPrice) * 100) / 100, reason: r.d.reason, resolved: r.d.resolved, receivedAt: r.delivery.receivedAt, isLate: r.delivery.isLate, claimMessage: r.d.claimMessage };
  });
  const openValue = items.filter((i) => !i.resolved && i.missing > 0).reduce((a, i) => a + i.valueEur, 0);
  return c.json({ items, openValue: Math.round(openValue * 100) / 100 });
});
manageRoutes.post("/discrepancies/:id/resolve", async (c) => {
  const rid = c.get("restaurantId");
  const db = await getDb();
  const body = z5.object({ resolution: z5.enum(["avoir", "relivraison", "abandon"]).default("avoir"), note: z5.string().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const [row] = await db.select({ d: deliveryDiscrepancies, rid: deliveries.restaurantId }).from(deliveryDiscrepancies).innerJoin(deliveries, eq7(deliveries.id, deliveryDiscrepancies.deliveryId)).where(eq7(deliveryDiscrepancies.id, c.req.param("id")));
  if (!row || row.rid !== rid) return c.json({ error: "\xC9cart introuvable" }, 404);
  await db.update(deliveryDiscrepancies).set({ resolved: true, reason: `${row.d.reason ?? "ecart"} \u2192 ${body.data.resolution}${body.data.note ? ` (${body.data.note})` : ""}` }).where(eq7(deliveryDiscrepancies.id, row.d.id));
  await db.update(alerts).set({ isRead: true }).where(and5(eq7(alerts.restaurantId, rid), eq7(alerts.dedupeKey, `ecart:${row.d.deliveryId}`)));
  return c.json({ ok: true });
});

// apps/api/src/routes/public.ts
init_src();
import { Hono as Hono6 } from "hono";
import { z as z6 } from "zod";
import { desc as desc4, eq as eq8, sql as sql6 } from "drizzle-orm";
var publicRoutes = new Hono6();
var PLANS = [
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
var FOUNDER_OFFER = { label: "Offre pilote fondateur", discountPct: 50, seats: 20, trialDays: 30, description: "\u221250 % \xE0 vie pour les 20 premiers restaurants qui nous aident \xE0 construire le produit. Essai gratuit 30 jours, sans carte bancaire." };
publicRoutes.get("/public/plans", (c) => c.json({ plans: PLANS, founderOffer: FOUNDER_OFFER, marketplaceCommissionPct: "2\u20135" }));
var leadBody = z6.object({
  restaurantName: z6.string().min(2).max(120),
  contactName: z6.string().min(2).max(120),
  email: z6.string().email(),
  phone: z6.string().max(40).optional(),
  city: z6.string().max(80).optional(),
  cuisine: z6.string().max(80).optional(),
  coversPerDay: z6.number().int().positive().max(5e3).optional(),
  message: z6.string().max(2e3).optional(),
  planInterest: z6.enum(["starter", "pro", "business", "pilote"]).optional(),
  source: z6.string().max(40).optional(),
  utm: z6.record(z6.string()).optional(),
  website: z6.string().optional()
  // honeypot anti-spam : doit rester vide (sinon on répond ok sans enregistrer)
});
var hits = /* @__PURE__ */ new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 36e5);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 5;
}
publicRoutes.post("/public/leads", async (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "local";
  if (rateLimited(ip)) return c.json({ error: "Trop de demandes, r\xE9essayez dans une heure." }, 429);
  const body = leadBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Formulaire incomplet", details: body.error.flatten() }, 400);
  if (body.data.website) return c.json({ ok: true });
  const db = await getDb();
  const d = body.data;
  const [lead] = await db.insert(leads).values({ ...d, source: d.source ?? "site" }).returning({ id: leads.id });
  return c.json({ ok: true, id: lead.id, message: `Merci ${d.contactName.split(" ")[0]} ! On vous rappelle sous 24 h pour ouvrir votre acc\xE8s.` }, 201);
});
publicRoutes.get("/admin/leads", requireAuth, async (c) => {
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!admins.includes(c.get("user").email.toLowerCase())) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
  const db = await getDb();
  const rows = await db.select().from(leads).orderBy(desc4(leads.createdAt)).limit(500);
  const [{ total }] = await db.select({ total: sql6`count(*)` }).from(leads);
  return c.json({ leads: rows, total: Number(total) });
});
publicRoutes.put("/admin/leads/:id", requireAuth, async (c) => {
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!admins.includes(c.get("user").email.toLowerCase())) return c.json({ error: "Acc\xE8s r\xE9serv\xE9" }, 403);
  const body = z6.object({ status: z6.enum(["nouveau", "contacte", "demo", "pilote", "client", "perdu"]).optional(), notes: z6.string().nullable().optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides" }, 400);
  const db = await getDb();
  const [row] = await db.update(leads).set(body.data).where(eq8(leads.id, c.req.param("id") ?? "")).returning();
  if (!row) return c.json({ error: "Lead introuvable" }, 404);
  return c.json(row);
});

// apps/api/src/routes/jobs.ts
init_src();
import { Hono as Hono7 } from "hono";
import { z as z7 } from "zod";
import { eq as eq10 } from "drizzle-orm";

// apps/api/src/jobs/daily.ts
init_src();
import { and as and6, desc as desc5, eq as eq9, gte as gte4, inArray as inArray5, sql as sql7 } from "drizzle-orm";

// apps/api/src/lib/digest.ts
var eur3 = (v) => `${v.toFixed(2).replace(".", ",")} \u20AC`;
var UNIT_FR = { piece: "pi\xE8ces", botte: "bottes", sac: "sacs", carton: "cartons" };
var q = (v, u) => {
  const isCount = u in UNIT_FR;
  const nb = isCount ? Math.ceil(v) : Math.round(v * 10) / 10;
  return `${Number.isInteger(nb) ? nb : nb.toFixed(1).replace(".", ",")} ${UNIT_FR[u] ?? u}`;
};
var days = (d) => `${(Math.round(d * 10) / 10).toString().replace(".", ",")} j`;
var dayFr = (iso) => iso ? new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" }) : null;
var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function digestHeadline(d) {
  if (d.stock.urgent.length) {
    const f = d.stock.urgent[0];
    return `${d.stock.urgent.length} produit${d.stock.urgent.length > 1 ? "s" : ""} \xE0 commander aujourd\u2019hui \u2014 ${f.productName} en premier`;
  }
  if (d.priceAlerts.length) return `${d.priceAlerts.length} hausse${d.priceAlerts.length > 1 ? "s" : ""} de prix \xE0 regarder`;
  if (d.discrepancies.count) return `${eur3(d.discrepancies.openValue)} \xE0 r\xE9cup\xE9rer sur des livraisons incompl\xE8tes`;
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
    lines: [`${d.cart.lineCount} produit${d.cart.lineCount > 1 ? "s" : ""} chez ${d.cart.supplierCount} fournisseur${d.cart.supplierCount > 1 ? "s" : ""} pour ${eur3(d.cart.total)}${d.cart.saving > 0 ? ` \u2014 ${eur3(d.cart.saving)} d\u2019\xE9conomie vs vos habitudes` : ""}.`],
    cta: { label: "Valider le panier", path: "/app/achats/panier" }
  });
  if (d.autoReorder.length) sections.push({
    emoji: "\u{1F916}",
    title: "Commandes pr\xE9par\xE9es automatiquement (\xE0 valider)",
    lines: d.autoReorder.map((a) => `${a.productName} chez ${a.supplierName} \u2014 ${eur3(a.total)} (${a.reference})`),
    cta: { label: "Voir mes achats", path: "/app/achats" }
  });
  if (d.priceAlerts.length) sections.push({ emoji: "\u{1F4C8}", title: "Prix en hausse", lines: d.priceAlerts.slice(0, 5).map((a) => a.message), cta: { label: "Comparer les fournisseurs", path: "/app/stock" } });
  if (d.opportunities.length) sections.push({ emoji: "\u{1F7E2}", title: "Moins cher ailleurs", lines: d.opportunities.slice(0, 4).map((a) => a.message) });
  if (d.discrepancies.count) sections.push({ emoji: "\u26A0\uFE0F", title: "\xC9carts de livraison \xE0 r\xE9clamer", lines: [`${d.discrepancies.count} \xE9cart${d.discrepancies.count > 1 ? "s" : ""} ouvert${d.discrepancies.count > 1 ? "s" : ""} \u2014 ${eur3(d.discrepancies.openValue)} \xE0 r\xE9cup\xE9rer.`], cta: { label: "Voir les \xE9carts", path: "/app/achats/ecarts" } });
  if (d.pendingOrders.length) sections.push({ emoji: "\u{1F69A}", title: "Livraisons attendues", lines: d.pendingOrders.slice(0, 5).map((o) => `${o.supplierName} (${o.reference})${o.expectedAt ? ` \u2014 ${dayFr(o.expectedAt)}` : ""}`) });
  const footerFacts = [
    `Stock : ${d.stock.ok} \u{1F7E2} \xB7 ${d.stock.bas} \u{1F7E0} \xB7 ${d.stock.critique} \u{1F534}`,
    d.salesYesterday === null ? "Ventes d\u2019hier non saisies \u2014 30 secondes pour am\xE9liorer la pr\xE9vision" : `${d.salesYesterday} portions saisies hier`,
    `Achats du mois : ${eur3(d.spend.thisMonth)}${d.spend.evolutionPct !== null ? ` (${d.spend.evolutionPct > 0 ? "+" : ""}${d.spend.evolutionPct} % vs 30 j pr\xE9c\xE9dents)` : ""}`
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

// apps/api/src/lib/mailer.ts
import { mkdir, writeFile } from "node:fs/promises";
import path2 from "node:path";
function mailerConfig() {
  return {
    transport: process.env.RESEND_API_KEY ? "resend" : "file",
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

// apps/api/src/jobs/daily.ts
var n5 = (v) => v === null || v === void 0 ? 0 : Number(v);
var APP_URL = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
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
  const recentAlerts = await db.select().from(alerts).where(and6(eq9(alerts.restaurantId, rid), eq9(alerts.isRead, false), gte4(alerts.createdAt, since))).orderBy(desc5(alerts.createdAt)).limit(50);
  const [disc] = await db.select({ count: sql7`count(*)`, value: sql7`coalesce(sum(greatest(${deliveryDiscrepancies.orderedQty} - ${deliveryDiscrepancies.receivedQty}, 0) * ${orderLines.unitPriceEur}), 0)` }).from(deliveryDiscrepancies).innerJoin(deliveries, eq9(deliveries.id, deliveryDiscrepancies.deliveryId)).innerJoin(orderLines, eq9(orderLines.id, deliveryDiscrepancies.orderLineId)).where(and6(eq9(deliveries.restaurantId, rid), eq9(deliveryDiscrepancies.resolved, false)));
  const pending = await db.select({ reference: orders.reference, supplierName: suppliers.name, status: orders.status, expectedAt: orders.expectedAt }).from(orders).innerJoin(suppliers, eq9(suppliers.id, orders.supplierId)).where(and6(eq9(orders.restaurantId, rid), inArray5(orders.status, ["envoyee", "confirmee"]))).orderBy(orders.expectedAt).limit(10);
  const yesterday = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
  const [ys] = await db.select({ p: sql7`coalesce(sum(${sales.portions}), 0)`, c: sql7`count(*)` }).from(sales).where(and6(eq9(sales.restaurantId, rid), eq9(sales.day, yesterday)));
  const startMonth = new Date(now);
  startMonth.setDate(1);
  startMonth.setHours(0, 0, 0, 0);
  const d30 = new Date(now.getTime() - 30 * 864e5).toISOString(), d60 = new Date(now.getTime() - 60 * 864e5).toISOString();
  const [sp] = await db.select({
    thisMonth: sql7`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${startMonth.toISOString()}),0)`,
    last30: sql7`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${d30}),0)`,
    prev30: sql7`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${d60} and ${orders.createdAt} < ${d30}),0)`
  }).from(orders).where(and6(eq9(orders.restaurantId, rid), sql7`${orders.status} <> 'annulee'`));
  const evolutionPct = n5(sp.prev30) > 0 ? Math.round((n5(sp.last30) - n5(sp.prev30)) / n5(sp.prev30) * 1e3) / 10 : null;
  const statuses = [...statusOf.values()];
  const input = {
    restaurantName: ctx.restaurant.name,
    firstName: "chef",
    date: now,
    appUrl: APP_URL(),
    stock: { critique: statuses.filter((s) => s === "critique").length, bas: statuses.filter((s) => s === "bas").length, ok: statuses.filter((s) => s === "ok").length, urgent },
    cart: cart ? { total: cart.total, saving: cart.saving, supplierCount: cart.suppliers.length, lineCount: cart.suppliers.reduce((a, s) => a + s.lines.length, 0) } : null,
    autoReorder: opts.autoReorderPrepared ?? [],
    priceAlerts: recentAlerts.filter((a) => a.kind === "hausse_prix").map((a) => ({ title: a.title, message: a.message })),
    opportunities: recentAlerts.filter((a) => a.kind === "opportunite").map((a) => ({ title: a.title, message: a.message })),
    discrepancies: { count: n5(disc.count), openValue: Math.round(n5(disc.value) * 100) / 100 },
    pendingOrders: pending,
    salesYesterday: n5(ys.c) > 0 ? n5(ys.p) : null,
    spend: { thisMonth: n5(sp.thisMonth), evolutionPct }
  };
  return { input, ctx };
}
async function recipientsFor(rid, settingsRecipients) {
  if (settingsRecipients?.length) return settingsRecipients.map((e) => ({ email: e, firstName: "chef" }));
  const db = await getDb();
  const rows = await db.select({ email: users.email, fullName: users.fullName, role: restaurantMembers.role }).from(restaurantMembers).innerJoin(users, eq9(users.id, restaurantMembers.userId)).where(eq9(restaurantMembers.restaurantId, rid));
  return rows.filter((r) => r.role !== "staff").map((r) => ({ email: r.email, firstName: r.fullName.split(" ")[0] || "chef" }));
}
async function runDailyForRestaurant(rid, opts = {}) {
  const db = await getDb();
  const now = opts.now ?? /* @__PURE__ */ new Date();
  const [r] = await db.select().from(restaurants).where(eq9(restaurants.id, rid));
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
  for (const r of all) {
    const { preview: _p, ...res } = await runDailyForRestaurant(r.id, opts);
    results.push(res);
  }
  return { ranAt: (opts.now ?? /* @__PURE__ */ new Date()).toISOString(), count: results.length, sent: results.filter((r) => r.digest === "sent").length, results };
}

// apps/api/src/routes/jobs.ts
var jobsRoutes = new Hono7();
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
jobsRoutes.get("/jobs/daily", runDaily);
var settingsRoutes = new Hono7();
settingsRoutes.use("*", requireAuth, requireRestaurant);
settingsRoutes.get("/settings", async (c) => {
  const db = await getDb();
  const [r] = await db.select().from(restaurants).where(eq10(restaurants.id, c.get("restaurantId")));
  const s = r.settings ?? {};
  return c.json({ restaurant: { id: r.id, name: r.name, city: r.city, coversPerDay: r.coversPerDay, plan: r.plan, trialEndsAt: r.trialEndsAt }, settings: { priceIncreaseAlertPct: s.priceIncreaseAlertPct ?? 8, forecastHorizonDays: s.forecastHorizonDays ?? 7, autoReorderEnabled: s.autoReorderEnabled ?? true, dailyDigestEnabled: s.dailyDigestEnabled ?? true, digestRecipients: s.digestRecipients ?? [], closedWeekdays: s.closedWeekdays ?? [] }, mail: { transport: mailerConfig().transport, from: mailerConfig().from } });
});
settingsRoutes.put("/settings", async (c) => {
  const body = z7.object({
    name: z7.string().min(2).optional(),
    city: z7.string().nullable().optional(),
    coversPerDay: z7.number().int().positive().nullable().optional(),
    priceIncreaseAlertPct: z7.number().min(1).max(50).optional(),
    forecastHorizonDays: z7.number().int().min(3).max(14).optional(),
    autoReorderEnabled: z7.boolean().optional(),
    dailyDigestEnabled: z7.boolean().optional(),
    digestRecipients: z7.array(z7.string().email()).max(10).optional(),
    closedWeekdays: z7.array(z7.number().int().min(0).max(6)).optional()
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Donn\xE9es invalides", details: body.error.flatten() }, 400);
  const db = await getDb();
  const rid = c.get("restaurantId");
  const [r] = await db.select().from(restaurants).where(eq10(restaurants.id, rid));
  const { name, city, coversPerDay, ...settingsPatch } = body.data;
  const [row] = await db.update(restaurants).set({ name, city, coversPerDay, settings: { ...r.settings ?? {}, ...settingsPatch } }).where(eq10(restaurants.id, rid)).returning();
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

// apps/api/src/app.ts
init_src();
var app = new Hono8();
app.use("*", logger());
app.use("/api/*", cors({ origin: (o) => o ?? "*", credentials: true }));
app.get("/api/health", (c) => c.json({ ok: true, service: "afrisupply-api", db: isNeon() ? "neon" : "pglite-local", time: (/* @__PURE__ */ new Date()).toISOString() }));
app.route("/api", jobsRoutes);
app.route("/api", publicRoutes);
app.route("/api/auth", authRoutes);
app.route("/api", restaurantRoutes);
app.route("/api", catalogRoutes);
app.route("/api", intelligenceRoutes);
app.route("/api", manageRoutes);
app.route("/api", settingsRoutes);
app.notFound((c) => c.json({ error: "Route inconnue" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Erreur serveur", detail: process.env.NODE_ENV === "production" ? void 0 : String(err) }, 500);
});

// api/_src/index.ts
var index_default = getRequestListener(app.fetch);
export {
  index_default as default
};

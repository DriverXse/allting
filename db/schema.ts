import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
const created = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio").notNull().default(""),
    city: text("city").notNull().default("Norrtälje"),
    lat: real("latitude_approx").notNull().default(59.76),
    lng: real("longitude_approx").notNull().default(18.7),
    radius: integer("default_search_radius_km").notNull().default(15),
    themePreference: text("theme_preference").notNull().default("system"),
    emailVerified: integer("email_verified").notNull().default(0),
    onboarded: integer("onboarded").notNull().default(0),
    role: text("role").notNull().default("user"),
    suspended: integer("suspended").notNull().default(0),
    createdAt: created(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [
    check("radius_options", sql`${t.radius} IN (5,15,50)`),
    check(
      "theme_options",
      sql`${t.themePreference} IN ('light','dark','system')`,
    ),
    check("role_options", sql`${t.role} IN ('user','admin')`),
  ],
);
export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});
export const listings = sqliteTable(
  "listings",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    condition: text("condition").notNull(),
    city: text("city").notNull(),
    lat: real("latitude_approx").notNull(),
    lng: real("longitude_approx").notNull(),
    status: text("status").notNull().default("active"),
    open: integer("open_to_suggestions").notNull().default(0),
    hidden: integer("moderated_hidden").notNull().default(0),
    reservedOffer: text("reserved_offer_id"),
    createdAt: created(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [
    check(
      "listing_status",
      sql`${t.status} IN ('active','reserved','traded','paused','deleted')`,
    ),
    check(
      "listing_condition",
      sql`${t.condition} IN ('new','excellent','good','used','worn')`,
    ),
    index("listing_discovery").on(t.status, t.hidden, t.createdAt),
    index("listing_owner").on(t.ownerId),
  ],
);
export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  key: text("object_key").notNull().unique(),
  createdAt: created(),
});
export const listingImages = sqliteTable("listing_images", {
  id: text("id").primaryKey(),
  listingId: text("listing_id")
    .notNull()
    .references(() => listings.id),
  imageUrl: text("image_url").notNull(),
  sortOrder: integer("sort_order").notNull(),
});
export const wantedTerms = sqliteTable(
  "wanted_terms",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id),
    listingId: text("listing_id").references(() => listings.id),
    term: text("term").notNull(),
    categoryId: text("category_id").references(() => categories.id),
  },
  (t) => [
    check(
      "one_wanted_owner",
      sql`(${t.userId} IS NULL) != (${t.listingId} IS NULL)`,
    ),
  ],
);
export const favorites = sqliteTable(
  "favorites",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.listingId] })],
);
export const tradeOffers = sqliteTable(
  "trade_offers",
  {
    id: text("id").primaryKey(),
    initiatorId: text("initiator_id")
      .notNull()
      .references(() => users.id),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => users.id),
    targetListingId: text("target_listing_id")
      .notNull()
      .references(() => listings.id),
    status: text("status").notNull().default("draft"),
    parentOfferId: text("parent_offer_id"),
    rootOfferId: text("root_offer_id").notNull(),
    proposerId: text("proposer_id")
      .notNull()
      .references(() => users.id),
    message: text("message"),
    acceptedAt: text("accepted_at"),
    initiatorConfirmed: integer("initiator_confirmed").notNull().default(0),
    recipientConfirmed: integer("recipient_confirmed").notNull().default(0),
    createdAt: created(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [
    check(
      "offer_status",
      sql`${t.status} IN ('draft','pending','countered','accepted','declined','cancelled','completed')`,
    ),
    check("two_parties", sql`${t.initiatorId} != ${t.recipientId}`),
    index("offer_root").on(t.rootOfferId),
    uniqueIndex("one_child").on(t.parentOfferId),
  ],
);
export const tradeOfferItems = sqliteTable(
  "trade_offer_items",
  {
    id: text("id").primaryKey(),
    tradeOfferId: text("trade_offer_id")
      .notNull()
      .references(() => tradeOffers.id),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id),
    side: text("side").notNull(),
  },
  (t) => [
    uniqueIndex("unique_offer_item").on(t.tradeOfferId, t.listingId),
    check("item_side", sql`${t.side} IN ('initiator','recipient')`),
  ],
);
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  tradeOfferId: text("trade_offer_id")
    .notNull()
    .references(() => tradeOffers.id)
    .unique(),
  currentOfferId: text("current_offer_id").notNull(),
  createdAt: created(),
});
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    senderId: text("sender_id").references(() => users.id),
    type: text("type").notNull(),
    body: text("body").notNull(),
    createdAt: created(),
    readAt: text("read_at"),
  },
  (t) => [
    index("conversation_messages").on(t.conversationId, t.createdAt),
    check("message_kind", sql`${t.type} IN ('user','system')`),
  ],
);
export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    tradeOfferId: text("trade_offer_id")
      .notNull()
      .references(() => tradeOffers.id),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => users.id),
    reviewedUserId: text("reviewed_user_id")
      .notNull()
      .references(() => users.id),
    stars: integer("stars").notNull(),
    comment: text("comment"),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("one_review").on(t.tradeOfferId, t.reviewerId),
    check("stars_range", sql`${t.stars} BETWEEN 1 AND 5`),
  ],
);
export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => users.id),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details").notNull().default(""),
    status: text("status").notNull().default("open"),
    createdAt: created(),
  },
  (t) => [
    check(
      "report_target",
      sql`${t.targetType} IN ('listing','user','message')`,
    ),
    check("report_state", sql`${t.status} IN ('open','resolved')`),
  ],
);
export const blocks = sqliteTable(
  "blocks",
  {
    blockerId: text("blocker_id")
      .notNull()
      .references(() => users.id),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => users.id),
    createdAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    check("not_self", sql`${t.blockerId} != ${t.blockedId}`),
  ],
);
export const savedSearches = sqliteTable(
  "saved_searches",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    query: text("query").notNull().default(""),
    categoryId: text("category_id").references(() => categories.id),
    city: text("city").notNull(),
    radiusKm: integer("radius_km").notNull().default(15),
    lat: real("latitude_approx").notNull(),
    lng: real("longitude_approx").notNull(),
    createdAt: created(),
  },
  (t) => [check("saved_radius", sql`${t.radiusKm} IN (5,15,50)`)],
);
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type").notNull(),
    body: text("body").notNull(),
    href: text("href").notNull(),
    dedupe: text("dedupe").unique(),
    readAt: text("read_at"),
    createdAt: created(),
  },
  (t) => [index("user_notifications").on(t.userId, t.createdAt)],
);
export const audit = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").references(() => users.id),
  action: text("action").notNull(),
  targetId: text("target_id").notNull(),
  createdAt: created(),
});
export const events = sqliteTable("analytics_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  type: text("type").notNull(),
  radius: integer("radius_km"),
  count: integer("item_count"),
  createdAt: created(),
});
export const limits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expires: integer("expires").notNull(),
});

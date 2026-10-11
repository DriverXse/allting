CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `blocks` (
	`blocker_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`blocker_id`, `blocked_id`),
	FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "not_self" CHECK("blocks"."blocker_id" != "blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`trade_offer_id` text NOT NULL,
	`current_offer_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`trade_offer_id`) REFERENCES `trade_offers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_trade_offer_id_unique` ON `conversations` (`trade_offer_id`);--> statement-breakpoint
CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`radius_km` integer,
	`item_count` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `favorites` (
	`user_id` text NOT NULL,
	`listing_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`user_id`, `listing_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `listing_images` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`image_url` text NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category_id` text NOT NULL,
	`condition` text NOT NULL,
	`city` text NOT NULL,
	`latitude_approx` real NOT NULL,
	`longitude_approx` real NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`open_to_suggestions` integer DEFAULT 0 NOT NULL,
	`moderated_hidden` integer DEFAULT 0 NOT NULL,
	`reserved_offer_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "listing_status" CHECK("listings"."status" IN ('active','reserved','traded','paused','deleted')),
	CONSTRAINT "listing_condition" CHECK("listings"."condition" IN ('new','excellent','good','used','worn'))
);
--> statement-breakpoint
CREATE INDEX `listing_discovery` ON `listings` (`status`,`moderated_hidden`,`created_at`);--> statement-breakpoint
CREATE INDEX `listing_owner` ON `listings` (`owner_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_id` text,
	`type` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`read_at` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "message_kind" CHECK("messages"."type" IN ('user','system'))
);
--> statement-breakpoint
CREATE INDEX `conversation_messages` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`body` text NOT NULL,
	`href` text NOT NULL,
	`dedupe` text,
	`read_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_unique` ON `notifications` (`dedupe`);--> statement-breakpoint
CREATE INDEX `user_notifications` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "report_target" CHECK("reports"."target_type" IN ('listing','user','message')),
	CONSTRAINT "report_state" CHECK("reports"."status" IN ('open','resolved'))
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`trade_offer_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`reviewed_user_id` text NOT NULL,
	`stars` integer NOT NULL,
	`comment` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`trade_offer_id`) REFERENCES `trade_offers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stars_range" CHECK("reviews"."stars" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_review` ON `reviews` (`trade_offer_id`,`reviewer_id`);--> statement-breakpoint
CREATE TABLE `saved_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`query` text DEFAULT '' NOT NULL,
	`category_id` text,
	`city` text NOT NULL,
	`radius_km` integer DEFAULT 15 NOT NULL,
	`latitude_approx` real NOT NULL,
	`longitude_approx` real NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "saved_radius" CHECK("saved_searches"."radius_km" IN (5,15,50))
);
--> statement-breakpoint
CREATE TABLE `trade_offer_items` (
	`id` text PRIMARY KEY NOT NULL,
	`trade_offer_id` text NOT NULL,
	`listing_id` text NOT NULL,
	`side` text NOT NULL,
	FOREIGN KEY (`trade_offer_id`) REFERENCES `trade_offers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "item_side" CHECK("trade_offer_items"."side" IN ('initiator','recipient'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_offer_item` ON `trade_offer_items` (`trade_offer_id`,`listing_id`);--> statement-breakpoint
CREATE TABLE `trade_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`initiator_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`target_listing_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`parent_offer_id` text,
	`root_offer_id` text NOT NULL,
	`proposer_id` text NOT NULL,
	`message` text,
	`accepted_at` text,
	`initiator_confirmed` integer DEFAULT 0 NOT NULL,
	`recipient_confirmed` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`initiator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "offer_status" CHECK("trade_offers"."status" IN ('draft','pending','countered','accepted','declined','cancelled','completed')),
	CONSTRAINT "two_parties" CHECK("trade_offers"."initiator_id" != "trade_offers"."recipient_id")
);
--> statement-breakpoint
CREATE INDEX `offer_root` ON `trade_offers` (`root_offer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_child` ON `trade_offers` (`parent_offer_id`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uploads_object_key_unique` ON `uploads` (`object_key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`bio` text DEFAULT '' NOT NULL,
	`city` text DEFAULT 'Norrtälje' NOT NULL,
	`latitude_approx` real DEFAULT 59.76 NOT NULL,
	`longitude_approx` real DEFAULT 18.7 NOT NULL,
	`default_search_radius_km` integer DEFAULT 15 NOT NULL,
	`email_verified` integer DEFAULT 0 NOT NULL,
	`onboarded` integer DEFAULT 0 NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`suspended` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "radius_options" CHECK("users"."default_search_radius_km" IN (5,15,50)),
	CONSTRAINT "role_options" CHECK("users"."role" IN ('user','admin'))
);
--> statement-breakpoint
CREATE TABLE `wanted_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`listing_id` text,
	`term` text NOT NULL,
	`category_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "one_wanted_owner" CHECK(("wanted_terms"."user_id" IS NULL) != ("wanted_terms"."listing_id" IS NULL))
);

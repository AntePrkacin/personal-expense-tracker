CREATE TABLE `category_templates` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`colour_id` text NOT NULL,
	`icon_id` text NOT NULL,
	`description` text NOT NULL,
	`sort_order` integer NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `colour_templates` (
	`id` text PRIMARY KEY,
	`token` text NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `icon_templates` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `login_links` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`superseded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`email` text NOT NULL,
	`db_name` text NOT NULL,
	`db_url` text,
	`db_auth_token` text,
	`onboarding_payload` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_templates_name_live_unique` ON `category_templates` (`name`) WHERE ("category_templates"."deleted_at" is null);--> statement-breakpoint
CREATE INDEX `category_templates_sort_order_idx` ON `category_templates` (`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `colour_templates_token_live_unique` ON `colour_templates` (`token`) WHERE ("colour_templates"."deleted_at" is null);--> statement-breakpoint
CREATE UNIQUE INDEX `icon_templates_name_live_unique` ON `icon_templates` (`name`) WHERE ("icon_templates"."deleted_at" is null);--> statement-breakpoint
CREATE UNIQUE INDEX `login_links_token_hash_unique` ON `login_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `login_links_user_id_idx` ON `login_links` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_live_unique` ON `users` (`email`) WHERE ("users"."deleted_at" is null);--> statement-breakpoint
CREATE UNIQUE INDEX `users_db_name_unique` ON `users` (`db_name`);
CREATE TABLE `budget_history` (
	`id` text PRIMARY KEY,
	`effective_from` text NOT NULL,
	`budget_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`icon` text NOT NULL,
	`description` text,
	`is_fallback` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `category_cap_history` (
	`id` text PRIMARY KEY,
	`category_id` text NOT NULL,
	`effective_from` text NOT NULL,
	`cap_cents` integer,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `insight_sets` (
	`id` text PRIMARY KEY,
	`status` text NOT NULL,
	`month_label` text,
	`summary_headline` text,
	`summary_body` text,
	`generated_at` integer,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `insights` (
	`id` text PRIMARY KEY,
	`set_id` text NOT NULL,
	`tone` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `period_rules` (
	`id` text PRIMARY KEY,
	`effective_from` text NOT NULL,
	`month_start_day` integer NOT NULL,
	`transition_start` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`id` text PRIMARY KEY,
	`full_name` text NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY,
	`merchant` text NOT NULL,
	`category_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `budget_history_effective_from_idx` ON `budget_history` (`effective_from`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_fallback_idx` ON `categories` (`is_fallback`) WHERE "categories"."is_fallback" = 1;--> statement-breakpoint
CREATE INDEX `category_cap_history_category_effective_idx` ON `category_cap_history` (`category_id`,`effective_from`);--> statement-breakpoint
CREATE UNIQUE INDEX `insight_sets_generating_idx` ON `insight_sets` (`status`) WHERE "insight_sets"."status" = 'generating';--> statement-breakpoint
CREATE INDEX `insights_set_id_idx` ON `insights` (`set_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `period_rules_effective_from_unique` ON `period_rules` (`effective_from`);--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `transactions_category_id_idx` ON `transactions` (`category_id`);
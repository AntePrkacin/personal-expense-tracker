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
CREATE UNIQUE INDEX `category_templates_name_live_unique` ON `category_templates` (`name`) WHERE ("category_templates"."deleted_at" is null);--> statement-breakpoint
CREATE INDEX `category_templates_sort_order_idx` ON `category_templates` (`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `colour_templates_token_live_unique` ON `colour_templates` (`token`) WHERE ("colour_templates"."deleted_at" is null);--> statement-breakpoint
CREATE UNIQUE INDEX `icon_templates_name_live_unique` ON `icon_templates` (`name`) WHERE ("icon_templates"."deleted_at" is null);
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
CREATE INDEX `insights_set_id_idx` ON `insights` (`set_id`);
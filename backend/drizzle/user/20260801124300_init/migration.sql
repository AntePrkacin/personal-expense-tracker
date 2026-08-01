CREATE TABLE `profile` (
	`id` text PRIMARY KEY,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`monthly_budget_cents` integer NOT NULL,
	`month_start_day` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);

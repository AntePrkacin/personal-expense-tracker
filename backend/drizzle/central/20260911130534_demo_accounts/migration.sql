CREATE TABLE `demo_accounts` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`lease_expires_at` integer,
	`leased_at` integer,
	`seeded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `demo_accounts_user_id_live_unique` ON `demo_accounts` (`user_id`) WHERE ("demo_accounts"."deleted_at" is null);--> statement-breakpoint
CREATE INDEX `demo_accounts_lease_expires_at_idx` ON `demo_accounts` (`lease_expires_at`);
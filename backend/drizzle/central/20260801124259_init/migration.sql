CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`email` text NOT NULL,
	`db_name` text NOT NULL,
	`db_url` text,
	`db_auth_token` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_db_name_unique` ON `users` (`db_name`);
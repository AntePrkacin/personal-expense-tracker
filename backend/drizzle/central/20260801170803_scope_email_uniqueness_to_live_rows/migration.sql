DROP INDEX IF EXISTS `users_email_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_live_unique` ON `users` (`email`) WHERE ("users"."deleted_at" is null);
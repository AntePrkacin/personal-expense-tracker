CREATE TABLE `assistant_messages` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `assistant_sessions` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`last_message_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `assistant_messages_session_id_idx` ON `assistant_messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `assistant_sessions_last_message_at_idx` ON `assistant_sessions` (`last_message_at`);
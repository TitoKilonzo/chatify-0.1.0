CREATE TABLE `message_reactions` (
	`message_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`message_id`, `user_id`),
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_reactions_user_id_idx` ON `message_reactions` (`user_id`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_id_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
ALTER TABLE `attachments` ADD `is_voice` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD `duration_ms` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `reply_to_id` integer REFERENCES messages(id);--> statement-breakpoint
ALTER TABLE `messages` ADD `forwarded` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `pinned_at` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `pinned_by` text;--> statement-breakpoint
CREATE INDEX `messages_reply_to_id_idx` ON `messages` (`reply_to_id`);--> statement-breakpoint
CREATE INDEX `messages_conversation_pinned_idx` ON `messages` (`conversation_id`,`pinned_at`);
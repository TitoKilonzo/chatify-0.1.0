CREATE TABLE `user_keys` (
	`user_id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`backup` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `conversations` ADD `encrypted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `encrypted` integer DEFAULT false NOT NULL;
CREATE TABLE `phone_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`purpose` text NOT NULL,
	`code_hash` text NOT NULL,
	`user_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `phone_codes_phone_idx` ON `phone_codes` (`phone`,`created_at`);--> statement-breakpoint
CREATE INDEX `phone_codes_user_id_idx` ON `phone_codes` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `users` ADD `phone_verified_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);
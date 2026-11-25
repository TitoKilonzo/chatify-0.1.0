CREATE TABLE `upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`offset_bytes` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upload_sessions_user_id_idx` ON `upload_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `upload_sessions_updated_at_idx` ON `upload_sessions` (`updated_at`);
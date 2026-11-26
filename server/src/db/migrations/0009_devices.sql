ALTER TABLE `refresh_tokens` ADD `session_id` text;--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD `session_started_at` integer;--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD `last_used_at` integer;--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD `revoked_reason` text;
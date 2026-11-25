ALTER TABLE `conversations` ADD `disappear_after_seconds` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `expires_at` integer;--> statement-breakpoint
CREATE INDEX `messages_expires_at_idx` ON `messages` (`expires_at`);
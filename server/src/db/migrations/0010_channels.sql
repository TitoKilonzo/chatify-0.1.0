ALTER TABLE `conversations` ADD `broadcast` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `description` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `is_public` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `conversations_public_channels_idx` ON `conversations` (`is_public`,`broadcast`);
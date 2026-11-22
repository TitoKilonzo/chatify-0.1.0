DROP INDEX `messages_attachment_id_idx`;--> statement-breakpoint
CREATE INDEX `messages_conversation_id_idx` ON `messages` (`conversation_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_attachment_id_unique` ON `messages` (`attachment_id`);
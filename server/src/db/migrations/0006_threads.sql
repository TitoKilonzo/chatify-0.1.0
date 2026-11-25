ALTER TABLE `messages` ADD `thread_root_id` integer REFERENCES messages(id);--> statement-breakpoint
CREATE INDEX `messages_thread_root_idx` ON `messages` (`thread_root_id`,`id`);
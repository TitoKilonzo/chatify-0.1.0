CREATE TABLE `call_history` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`caller_id` text NOT NULL,
	`callee_id` text NOT NULL,
	`video` integer DEFAULT false NOT NULL,
	`outcome` text,
	`ended_by` text,
	`started_at` integer NOT NULL,
	`answered_at` integer,
	`ended_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`caller_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`callee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "call_history_outcome_valid" CHECK("call_history"."outcome" IS NULL OR "call_history"."outcome" IN ('missed', 'cancelled', 'declined', 'ended', 'timeout', 'dropped'))
);
--> statement-breakpoint
CREATE INDEX `call_history_caller_started_idx` ON `call_history` (`caller_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `call_history_callee_started_idx` ON `call_history` (`callee_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `call_history_conversation_idx` ON `call_history` (`conversation_id`);
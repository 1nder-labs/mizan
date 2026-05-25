CREATE TABLE `eval_promotions` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`run_id` text NOT NULL,
	`action_id` text NOT NULL,
	`recommendation` text NOT NULL,
	`reviewer_action` text NOT NULL,
	`promoted_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`action_id`) REFERENCES `reviewer_actions`(`action_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eval_promotions_run_action_uniq` ON `eval_promotions` (`run_id`,`action_id`);--> statement-breakpoint
CREATE INDEX `eval_promotions_case_id_idx` ON `eval_promotions` (`case_id`);
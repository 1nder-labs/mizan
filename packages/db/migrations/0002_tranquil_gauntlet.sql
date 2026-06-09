CREATE TABLE `case_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`author_role` text NOT NULL,
	`visibility` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `case_notes_case_visibility_idx` ON `case_notes` (`case_id`,`visibility`,`created_at`);--> statement-breakpoint
CREATE INDEX `case_notes_org_case_idx` ON `case_notes` (`organization_id`,`case_id`);
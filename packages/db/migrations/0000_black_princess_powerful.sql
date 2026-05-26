CREATE TABLE `briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`run_id` text NOT NULL,
	`recommendation` text NOT NULL,
	`confidence` integer NOT NULL,
	`composed_at` integer NOT NULL,
	`payload_json` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `briefs_case_id_idx` ON `briefs` (`case_id`);--> statement-breakpoint
CREATE INDEX `briefs_run_id_idx` ON `briefs` (`run_id`);--> statement-breakpoint
CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`category` text NOT NULL,
	`geography` text NOT NULL,
	`claimed_zakat_category` text,
	`current_run_id` text,
	`brief_partial_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `cases_status_updated_idx` ON `cases` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `cases_created_by_idx` ON `cases` (`created_by`);--> statement-breakpoint
CREATE TABLE `reviewer_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`run_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`action` text NOT NULL,
	`rationale` text NOT NULL,
	`acted_at` integer NOT NULL,
	`action_id` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `reviewer_actions_case_id_idx` ON `reviewer_actions` (`case_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_actions_action_id_idx` ON `reviewer_actions` (`action_id`);--> statement-breakpoint
CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`run_id` text NOT NULL,
	`signal_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `signals_case_run_idx` ON `signals` (`case_id`,`run_id`);--> statement-breakpoint
CREATE TABLE `workflow_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`run_id` text NOT NULL,
	`seq` integer NOT NULL,
	`event_type` text NOT NULL,
	`step_id` text,
	`payload_json` text,
	`emitted_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_events_run_seq_idx` ON `workflow_events` (`run_id`,`seq`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `accounts_userId_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`timezone` text,
	`city` text,
	`country` text,
	`region` text,
	`region_code` text,
	`colo` text,
	`latitude` text,
	`longitude` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_userId_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`role` text DEFAULT 'reviewer'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verifications_identifier_idx` ON `verifications` (`identifier`);
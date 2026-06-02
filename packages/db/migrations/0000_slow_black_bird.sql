CREATE TABLE `briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`run_id` text NOT NULL,
	`recommendation` text NOT NULL,
	`confidence` integer NOT NULL,
	`composed_at` integer NOT NULL,
	`payload_json` text NOT NULL,
	`organization_id` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `briefs_org_case_id_idx` ON `briefs` (`organization_id`,`case_id`);--> statement-breakpoint
CREATE INDEX `briefs_org_run_id_idx` ON `briefs` (`organization_id`,`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `briefs_case_run_uniq` ON `briefs` (`case_id`,`run_id`);--> statement-breakpoint
CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`title` text DEFAULT 'Untitled campaign' NOT NULL,
	`category` text NOT NULL,
	`geography` text NOT NULL,
	`claimed_zakat_category` text,
	`current_run_id` text,
	`brief_partial_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`assigned_to` text,
	`organization_id` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `cases_org_status_updated_idx` ON `cases` (`organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `cases_org_created_by_idx` ON `cases` (`organization_id`,`created_by`);--> statement-breakpoint
CREATE INDEX `cases_org_assigned_to_idx` ON `cases` (`organization_id`,`assigned_to`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`parts_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_messages_thread_created_idx` ON `chat_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`title` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_threads_user_org_updated_idx` ON `chat_threads` (`user_id`,`organization_id`,`updated_at`);--> statement-breakpoint
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
CREATE INDEX `eval_promotions_case_id_idx` ON `eval_promotions` (`case_id`);--> statement-breakpoint
CREATE TABLE `live_events` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`seq` integer NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`organization_id` text,
	`actor_user_id` text,
	`emitted_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_events_topic_seq_uniq` ON `live_events` (`topic`,`seq`);--> statement-breakpoint
CREATE INDEX `live_events_topic_emitted_idx` ON `live_events` (`topic`,`emitted_at`);--> statement-breakpoint
CREATE TABLE `reviewer_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`run_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`action` text NOT NULL,
	`rationale` text NOT NULL,
	`acted_at` integer NOT NULL,
	`action_id` text NOT NULL,
	`organization_id` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `reviewer_actions_org_case_id_idx` ON `reviewer_actions` (`organization_id`,`case_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_actions_action_id_idx` ON `reviewer_actions` (`action_id`);--> statement-breakpoint
CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`run_id` text NOT NULL,
	`signal_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`organization_id` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signals_case_run_type_uniq` ON `signals` (`case_id`,`run_id`,`signal_type`);--> statement-breakpoint
CREATE INDEX `signals_org_case_id_idx` ON `signals` (`organization_id`,`case_id`);--> statement-breakpoint
CREATE TABLE `workflow_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`run_id` text NOT NULL,
	`seq` integer NOT NULL,
	`event_type` text NOT NULL,
	`step_id` text,
	`payload_json` text,
	`emitted_at` integer NOT NULL,
	`organization_id` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_events_run_seq_idx` ON `workflow_events` (`run_id`,`seq`);--> statement-breakpoint
CREATE INDEX `workflow_events_org_case_id_idx` ON `workflow_events` (`organization_id`,`case_id`);--> statement-breakpoint
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
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`inviter_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`role` text DEFAULT 'reviewer' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invitations_email_status_idx` ON `invitations` (`email`,`status`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_user_org_uniq` ON `members` (`user_id`,`organization_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`active_organization_id` text,
	`timezone` text,
	`city` text,
	`country` text,
	`region` text,
	`region_code` text,
	`colo` text,
	`latitude` text,
	`longitude` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`active_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
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
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
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
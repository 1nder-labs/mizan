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
CREATE UNIQUE INDEX `organization_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
DROP TABLE `invitations`;--> statement-breakpoint
DROP INDEX `briefs_case_id_idx`;--> statement-breakpoint
DROP INDEX `briefs_run_id_idx`;--> statement-breakpoint
ALTER TABLE `briefs` ADD `organization_id` text NOT NULL REFERENCES organizations(id);--> statement-breakpoint
CREATE INDEX `briefs_org_case_id_idx` ON `briefs` (`organization_id`,`case_id`);--> statement-breakpoint
CREATE INDEX `briefs_org_run_id_idx` ON `briefs` (`organization_id`,`run_id`);--> statement-breakpoint
DROP INDEX `cases_status_updated_idx`;--> statement-breakpoint
DROP INDEX `cases_created_by_idx`;--> statement-breakpoint
DROP INDEX `cases_assigned_to_idx`;--> statement-breakpoint
ALTER TABLE `cases` ADD `organization_id` text NOT NULL REFERENCES organizations(id);--> statement-breakpoint
CREATE INDEX `cases_org_status_updated_idx` ON `cases` (`organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `cases_org_created_by_idx` ON `cases` (`organization_id`,`created_by`);--> statement-breakpoint
CREATE INDEX `cases_org_assigned_to_idx` ON `cases` (`organization_id`,`assigned_to`);--> statement-breakpoint
DROP INDEX `reviewer_actions_case_id_idx`;--> statement-breakpoint
ALTER TABLE `reviewer_actions` ADD `organization_id` text NOT NULL REFERENCES organizations(id);--> statement-breakpoint
CREATE INDEX `reviewer_actions_org_case_id_idx` ON `reviewer_actions` (`organization_id`,`case_id`);--> statement-breakpoint
ALTER TABLE `signals` ADD `organization_id` text NOT NULL REFERENCES organizations(id);--> statement-breakpoint
CREATE INDEX `signals_org_case_id_idx` ON `signals` (`organization_id`,`case_id`);--> statement-breakpoint
ALTER TABLE `workflow_events` ADD `organization_id` text NOT NULL REFERENCES organizations(id);--> statement-breakpoint
CREATE INDEX `workflow_events_org_case_id_idx` ON `workflow_events` (`organization_id`,`case_id`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `active_organization_id` text REFERENCES organizations(id);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `role`;
ALTER TABLE `cases` ADD `assigned_to` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `cases_assigned_to_idx` ON `cases` (`assigned_to`);
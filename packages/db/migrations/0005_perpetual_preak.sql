CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`doc_kind` text NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text DEFAULT '' NOT NULL,
	`content_type` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	`organization_id` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `documents_org_case_idx` ON `documents` (`organization_id`,`case_id`);--> statement-breakpoint
CREATE INDEX `documents_case_kind_uploaded_idx` ON `documents` (`case_id`,`doc_kind`,`uploaded_at`);
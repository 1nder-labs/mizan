DROP INDEX IF EXISTS `signals_case_run_idx`;
--> statement-breakpoint
-- Removed in favor of `signals_case_run_type_uniq` (added in 0002) whose
-- leading `(case_id, run_id)` prefix already covers the same read path.
-- Rollback: CREATE INDEX IF NOT EXISTS `signals_case_run_idx` ON `signals` (`case_id`, `run_id`);

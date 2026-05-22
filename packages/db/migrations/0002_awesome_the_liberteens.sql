CREATE UNIQUE INDEX IF NOT EXISTS `signals_case_run_type_uniq` ON `signals` (`case_id`,`run_id`,`signal_type`);
--> statement-breakpoint
-- Rollback (manual): wrangler d1 execute mizan [--local|--remote] \
--   --command="DROP INDEX IF EXISTS signals_case_run_type_uniq;"

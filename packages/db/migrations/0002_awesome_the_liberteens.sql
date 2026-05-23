-- Pre-dedup: keep only the most recently inserted row per
-- (case_id, run_id, signal_type) so the unique index below cannot
-- hard-fail on D1 instances that accumulated duplicates before
-- `upsertSignal`'s ON CONFLICT contract was wired up. Uses SQLite's
-- monotonic `rowid` (always increasing on INSERT) as the disambiguator;
-- on greenfield D1 this DELETE removes zero rows and is a no-op.
DELETE FROM `signals` WHERE `rowid` NOT IN (
  SELECT MAX(`rowid`) FROM `signals` GROUP BY `case_id`, `run_id`, `signal_type`
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `signals_case_run_type_uniq` ON `signals` (`case_id`,`run_id`,`signal_type`);
--> statement-breakpoint
-- Rollback (manual): wrangler d1 execute mizan [--local|--remote] \
--   --command="DROP INDEX IF EXISTS signals_case_run_type_uniq;"

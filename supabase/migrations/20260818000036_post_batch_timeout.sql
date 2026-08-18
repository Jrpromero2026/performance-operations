-- ============================================================================
-- Performance Operations — Phase H, Migration 36: posting timeout budget
--
-- Posting a real Timberhill month (~2,900 rows) executes ~17k statements
-- inside app.post_import_batch's per-row loop. The role-level
-- statement_timeout kills that mid-flight; the function is atomic, so the
-- kill is SAFE but makes posting impossible at real volume. Scope a larger
-- budget to the posting and reversal functions only — the global timeout
-- is deliberately untouched.
-- ============================================================================
alter function app.post_import_batch(uuid) set statement_timeout = '300s';
alter function app.reverse_import_batch(uuid, text) set statement_timeout = '300s';

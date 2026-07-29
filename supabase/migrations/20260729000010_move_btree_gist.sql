-- ============================================================================
-- Performance Operations — Phase 2, Migration 10: move btree_gist extension
--
-- Security-advisor remediation: Phase 1 installed btree_gist into public
-- (the default). Relocate it to the extensions schema; operator classes keep
-- working via search_path resolution for existing exclusion constraints.
-- ============================================================================

alter extension btree_gist set schema extensions;

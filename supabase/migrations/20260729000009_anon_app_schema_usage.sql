-- ============================================================================
-- Performance Operations — Phase 2, Migration 9: anon schema usage
--
-- The pre-auth invite preview (public.get_invitation_preview → app.*) needs
-- the anon role to have USAGE on schema app. anon holds EXECUTE only on
-- app.get_invitation_preview; every other app.* function remains
-- authenticated-only.
-- ============================================================================

grant usage on schema app to anon;

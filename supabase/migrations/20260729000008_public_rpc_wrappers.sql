-- ============================================================================
-- Performance Operations — Phase 2, Migration 8: public RPC wrappers
--
-- PostgREST only exposes the `public` schema, so the invitation functions in
-- `app` get thin SECURITY INVOKER wrappers here. All validation and privilege
-- logic stays in the app.* functions (documented in migration 3).
-- ============================================================================

create or replace function public.get_invitation_preview(p_token text)
returns table (
  email             text,
  organization_name text,
  role_name         text,
  status            text,
  expires_at        timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from app.get_invitation_preview(p_token);
$$;

revoke all on function public.get_invitation_preview(text) from public;
grant execute on function public.get_invitation_preview(text) to anon, authenticated;

create or replace function public.accept_invitation(p_token text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app.accept_invitation(p_token);
$$;

revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;

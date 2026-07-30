-- ============================================================================
-- Performance Operations — Phase 8, Migration 25: revocation reachability
--
-- Found by the Phase 8 live SQL suite: credential revocation must fail
-- closed from ANY credentialed state, but the migration-22 transition
-- matrix did not permit awaiting_credentials → revoked (or validating →
-- revoked), so revoking a never-activated credential was rejected.
-- ADDITIVE redefinition of app.integration_connection_guard (migration 22
-- file unchanged) adding `revoked` as a valid target from
-- awaiting_credentials and validating. All other transitions unchanged.
-- ============================================================================

create or replace function app.integration_connection_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if new.status = old.status then
    return new;
  end if;
  allowed := case old.status
    when 'draft'                then new.status in ('awaiting_credentials', 'disabled')
    when 'awaiting_credentials' then new.status in ('validating', 'disabled', 'revoked')
    when 'validating'           then new.status in ('active', 'failed', 'awaiting_credentials', 'revoked')
    when 'active'               then new.status in ('degraded', 'disabled', 'revoked', 'failed', 'validating')
    when 'degraded'             then new.status in ('active', 'disabled', 'revoked', 'failed', 'validating')
    when 'disabled'             then new.status in ('validating', 'revoked', 'awaiting_credentials')
    when 'failed'               then new.status in ('validating', 'disabled', 'revoked', 'awaiting_credentials')
    when 'revoked'              then new.status in ('awaiting_credentials')
    else false
  end;
  if not allowed then
    raise exception 'invalid_connection_transition_%_to_%', old.status, new.status
      using errcode = '42501';
  end if;
  return new;
end;
$$;

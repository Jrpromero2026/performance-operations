-- ============================================================================
-- Performance Operations — Phase 8, Migration 24: worker secret access
--
-- Server-side credential retrieval WITHOUT the service-role key: the
-- worker/sync path (Next.js server actions and the worker route) proves
-- it is running on the server by presenting the WORKER_SECRET
-- environment value, which is compared against the Vault secret named
-- 'worker_server_key'. Browsers can never present it, so a credential
-- can never round-trip to a client even for platform admins.
--
-- Fails closed: if 'worker_server_key' has not been provisioned in
-- Vault, every call is rejected. The key is provisioned per environment
-- (dev: Vault + .env.local; never committed).
-- ============================================================================

create or replace function app.get_connection_secret_with_key(
  p_connection_id uuid,
  p_server_key text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conn public.integration_connections%rowtype;
  v_expected text;
  v_secret text;
begin
  -- Caller must still be an authenticated platform admin or service role.
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role'
     and not app.is_platform_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select decrypted_secret into v_expected
  from vault.decrypted_secrets where name = 'worker_server_key';
  if v_expected is null then
    raise exception 'worker_key_not_provisioned' using errcode = '42501';
  end if;
  if p_server_key is null or p_server_key is distinct from v_expected then
    raise exception 'worker_key_mismatch' using errcode = '42501';
  end if;

  select * into v_conn from public.integration_connections where id = p_connection_id;
  if v_conn.id is null or v_conn.secret_ref is null then
    raise exception 'secret_not_found' using errcode = 'P0002';
  end if;
  if v_conn.status = 'revoked' then
    raise exception 'credentials_revoked' using errcode = '42501';
  end if;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where id = v_conn.secret_ref;
  return v_secret;
end;
$$;
revoke all on function app.get_connection_secret_with_key(uuid, text) from public;
grant execute on function app.get_connection_secret_with_key(uuid, text) to authenticated, service_role;

create or replace function public.get_connection_secret_with_key(p_connection_id uuid, p_server_key text)
returns text language sql security invoker set search_path = ''
as $$ select app.get_connection_secret_with_key(p_connection_id, p_server_key); $$;
revoke all on function public.get_connection_secret_with_key(uuid, text) from public;
grant execute on function public.get_connection_secret_with_key(uuid, text) to authenticated, service_role;

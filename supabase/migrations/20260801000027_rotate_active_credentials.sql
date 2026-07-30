-- ============================================================================
-- Performance Operations — Phase 8, Migration 27: rotate live credentials
--
-- Third live-suite finding: app.store_connection_secret rejected ACTIVE
-- (and degraded) connections, but rotating the credential of a live
-- connection is the primary rotation scenario. ADDITIVE redefinition
-- permitting rotation in active/degraded as well; the connection keeps
-- its current status (re-validation is recommended and available), and
-- pre-active states continue to advance to awaiting_credentials.
-- ============================================================================

create or replace function app.store_connection_secret(
  p_connection_id uuid,
  p_secret text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conn public.integration_connections%rowtype;
  v_secret_id uuid;
  v_fingerprint text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_secret is null or length(p_secret) < 8 then
    raise exception 'secret_too_short' using errcode = 'P0001';
  end if;
  select * into v_conn from public.integration_connections
  where id = p_connection_id for update;
  if v_conn.id is null then
    raise exception 'connection_not_found' using errcode = 'P0002';
  end if;
  if not app.has_permission_in(v_conn.organization_id, 'integration:manage_credentials') then
    raise exception 'not_authorized_to_manage_credentials' using errcode = '42501';
  end if;
  if v_conn.status not in
     ('draft', 'awaiting_credentials', 'revoked', 'failed', 'disabled', 'active', 'degraded') then
    raise exception 'connection_not_awaiting_credentials' using errcode = 'P0003';
  end if;

  v_fingerprint := left(encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'), 12)
                   || '…' || right(p_secret, 4);

  if v_conn.secret_ref is not null then
    perform vault.update_secret(v_conn.secret_ref, p_secret);
    v_secret_id := v_conn.secret_ref;
  else
    v_secret_id := vault.create_secret(
      p_secret,
      'integration_connection:' || v_conn.id,
      'Provider credential for integration connection ' || v_conn.id);
  end if;

  update public.integration_connections
  set secret_ref = v_secret_id,
      secret_fingerprint = v_fingerprint,
      secret_version = v_conn.secret_version + 1,
      secret_rotated_at = now(),
      failure_reason = case when status in ('revoked', 'failed') then null else failure_reason end,
      status = case when status in ('draft', 'revoked', 'failed')
                    then 'awaiting_credentials' else status end
  where id = v_conn.id;

  insert into public.audit_events
    (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_conn.organization_id, v_uid, 'integration_connection', v_conn.id,
          case when v_conn.secret_version = 0 then 'integration_credentials_submitted'
               else 'integration_credentials_rotated' end,
          jsonb_build_object('secret_version', v_conn.secret_version + 1,
                             'fingerprint', v_fingerprint));

  return jsonb_build_object(
    'fingerprint', v_fingerprint,
    'secret_version', v_conn.secret_version + 1);
end;
$$;

-- PREPARED ONLY: do not run until shared-project approval is granted.
-- First-run migration: fail closed if a schema or wrapper name is unexpectedly already in use.
create schema mindcanvas;

create table mindcanvas.mindcanvas_sessions (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{22,128}$'),
  therapist_invite_hash text not null,
  client_invite_hash text not null,
  client_redeemed_at timestamptz,
  expires_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table mindcanvas.mindcanvas_session_grants (
  session_id text not null references mindcanvas.mindcanvas_sessions(id) on delete cascade,
  role text not null check (role in ('therapist', 'client')),
  refresh_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (session_id, role)
);

alter table mindcanvas.mindcanvas_sessions enable row level security;
alter table mindcanvas.mindcanvas_session_grants enable row level security;
revoke all on schema mindcanvas from public;
revoke all on all tables in schema mindcanvas from anon, authenticated;

-- These private functions are invoked only by a server-side database connection.
-- Do not expose this schema through Supabase Data API settings.
create function mindcanvas.mindcanvas_create_session(
  p_id text, p_expires_at timestamptz, p_therapist_invite_hash text,
  p_client_invite_hash text, p_therapist_refresh_hash text
) returns void language plpgsql security definer set search_path = pg_catalog as $$
begin
  if p_expires_at <= now() then raise exception 'session expiry must be in the future'; end if;
  insert into mindcanvas.mindcanvas_sessions (id, expires_at, therapist_invite_hash, client_invite_hash)
  values (p_id, p_expires_at, p_therapist_invite_hash, p_client_invite_hash);
  insert into mindcanvas.mindcanvas_session_grants (session_id, role, refresh_hash, expires_at)
  values (p_id, 'therapist', p_therapist_refresh_hash, p_expires_at);
end $$;

create function mindcanvas.mindcanvas_redeem_client_invite(
  p_session_id text, p_invite_hash text, p_refresh_hash text, p_expires_at timestamptz
) returns boolean language plpgsql security definer set search_path = pg_catalog as $$
begin
  update mindcanvas.mindcanvas_sessions set client_redeemed_at = now()
  where id = p_session_id and client_invite_hash = p_invite_hash
    and client_redeemed_at is null and ended_at is null and expires_at > now()
    and p_expires_at > now() and p_expires_at <= expires_at;
  if not found then return false; end if;
  insert into mindcanvas.mindcanvas_session_grants (session_id, role, refresh_hash, expires_at)
  values (p_session_id, 'client', p_refresh_hash, p_expires_at);
  return true;
end $$;

create function mindcanvas.mindcanvas_rotate_grant(
  p_session_id text, p_role text, p_old_refresh_hash text, p_next_refresh_hash text, p_expires_at timestamptz
) returns boolean language plpgsql security definer set search_path = pg_catalog as $$
begin
  update mindcanvas.mindcanvas_session_grants as session_grant set refresh_hash = p_next_refresh_hash, expires_at = p_expires_at
  from mindcanvas.mindcanvas_sessions session
  where session_grant.session_id = p_session_id and session_grant.role = p_role and session_grant.refresh_hash = p_old_refresh_hash
    and session_grant.revoked_at is null and session_grant.expires_at > now()
    and session.id = session_grant.session_id and session.ended_at is null and session.expires_at > now()
    and p_expires_at > now() and p_expires_at <= session.expires_at;
  return found;
end $$;

create function mindcanvas.mindcanvas_end_session(p_session_id text, p_therapist_refresh_hash text)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
begin
  update mindcanvas.mindcanvas_session_grants as session_grant set revoked_at = now()
  from mindcanvas.mindcanvas_sessions session
  where session_grant.session_id = p_session_id and session_grant.role = 'therapist'
    and session_grant.refresh_hash = p_therapist_refresh_hash and session_grant.revoked_at is null and session_grant.expires_at > now()
    and session.id = session_grant.session_id and session.ended_at is null and session.expires_at > now();
  if not found then return false; end if;
  update mindcanvas.mindcanvas_sessions set ended_at = now() where id = p_session_id;
  update mindcanvas.mindcanvas_session_grants set revoked_at = now() where session_id = p_session_id and revoked_at is null;
  return true;
end $$;

create function mindcanvas.mindcanvas_cleanup_sessions(p_now timestamptz)
returns integer language plpgsql security definer set search_path = pg_catalog as $$
declare removed integer;
begin
  -- Retain non-content tombstones for 15 minutes so concurrent requests reliably see revocation.
  delete from mindcanvas.mindcanvas_sessions
  where expires_at <= p_now - interval '15 minutes'
     or (ended_at is not null and ended_at <= p_now - interval '15 minutes');
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke all on schema mindcanvas from public, anon, authenticated, service_role;
revoke all on all functions in schema mindcanvas from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema mindcanvas revoke execute on functions from public, anon, authenticated;

-- Public API façades: service_role-only, no records or hashes are returned.
-- They deliberately use a restricted path and invoke private functions by fully qualified name.
create function public.mindcanvas_api_create_session(
  p_id text, p_expires_at timestamptz, p_therapist_invite_hash text,
  p_client_invite_hash text, p_therapist_refresh_hash text
) returns void language sql security definer set search_path = pg_catalog as $$
  select mindcanvas.mindcanvas_create_session(p_id, p_expires_at, p_therapist_invite_hash, p_client_invite_hash, p_therapist_refresh_hash)
$$;

create function public.mindcanvas_api_session_status(p_session_id text)
returns table (expires_at timestamptz, ended_at timestamptz)
language sql security definer set search_path = pg_catalog as $$
  select session.expires_at, session.ended_at
  from mindcanvas.mindcanvas_sessions as session
  where session.id = p_session_id
$$;

create function public.mindcanvas_api_redeem_client_invite(
  p_session_id text, p_invite_hash text, p_refresh_hash text, p_expires_at timestamptz
) returns boolean language sql security definer set search_path = pg_catalog as $$
  select mindcanvas.mindcanvas_redeem_client_invite(p_session_id, p_invite_hash, p_refresh_hash, p_expires_at)
$$;

create function public.mindcanvas_api_rotate_grant(
  p_session_id text, p_role text, p_old_refresh_hash text, p_next_refresh_hash text, p_expires_at timestamptz
) returns boolean language sql security definer set search_path = pg_catalog as $$
  select mindcanvas.mindcanvas_rotate_grant(p_session_id, p_role, p_old_refresh_hash, p_next_refresh_hash, p_expires_at)
$$;

create function public.mindcanvas_api_end_session(p_session_id text, p_therapist_refresh_hash text)
returns boolean language sql security definer set search_path = pg_catalog as $$
  select mindcanvas.mindcanvas_end_session(p_session_id, p_therapist_refresh_hash)
$$;

create function public.mindcanvas_api_cleanup_sessions(p_now timestamptz)
returns integer language sql security definer set search_path = pg_catalog as $$
  select mindcanvas.mindcanvas_cleanup_sessions(p_now)
$$;

alter function public.mindcanvas_api_create_session(text, timestamptz, text, text, text) owner to postgres;
alter function public.mindcanvas_api_session_status(text) owner to postgres;
alter function public.mindcanvas_api_redeem_client_invite(text, text, text, timestamptz) owner to postgres;
alter function public.mindcanvas_api_rotate_grant(text, text, text, text, timestamptz) owner to postgres;
alter function public.mindcanvas_api_end_session(text, text) owner to postgres;
alter function public.mindcanvas_api_cleanup_sessions(timestamptz) owner to postgres;

revoke all on function public.mindcanvas_api_create_session(text, timestamptz, text, text, text) from public, anon, authenticated;
revoke all on function public.mindcanvas_api_session_status(text) from public, anon, authenticated;
revoke all on function public.mindcanvas_api_redeem_client_invite(text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mindcanvas_api_rotate_grant(text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mindcanvas_api_end_session(text, text) from public, anon, authenticated;
revoke all on function public.mindcanvas_api_cleanup_sessions(timestamptz) from public, anon, authenticated;
grant execute on function public.mindcanvas_api_create_session(text, timestamptz, text, text, text) to service_role;
grant execute on function public.mindcanvas_api_session_status(text) to service_role;
grant execute on function public.mindcanvas_api_redeem_client_invite(text, text, text, timestamptz) to service_role;
grant execute on function public.mindcanvas_api_rotate_grant(text, text, text, text, timestamptz) to service_role;
grant execute on function public.mindcanvas_api_end_session(text, text) to service_role;
grant execute on function public.mindcanvas_api_cleanup_sessions(timestamptz) to service_role;

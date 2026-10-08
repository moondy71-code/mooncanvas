-- STAGING ONLY. Apply mindcanvas_sessions.sql first, then run this as the database owner.
-- Do not run against the shared production project. ROLLBACK leaves no test data.
begin;

-- Catalog-level proof of wrapper grants and denied private access.
do $$
declare
  wrapper regprocedure;
begin
  foreach wrapper in array array[
    'public.mindcanvas_api_create_session(text,timestamptz,text,text,text)'::regprocedure,
    'public.mindcanvas_api_session_status(text)'::regprocedure,
    'public.mindcanvas_api_redeem_client_invite(text,text,text,timestamptz)'::regprocedure,
    'public.mindcanvas_api_rotate_grant(text,text,text,text,timestamptz)'::regprocedure,
    'public.mindcanvas_api_end_session(text,text)'::regprocedure,
    'public.mindcanvas_api_cleanup_sessions(timestamptz)'::regprocedure
  ] loop
    if has_function_privilege('anon', wrapper, 'execute')
       or has_function_privilege('authenticated', wrapper, 'execute')
       or not has_function_privilege('service_role', wrapper, 'execute') then
      raise exception 'unexpected wrapper privilege on %', wrapper;
    end if;
  end loop;

  if has_schema_privilege('anon', 'mindcanvas', 'usage')
     or has_schema_privilege('authenticated', 'mindcanvas', 'usage')
     or has_table_privilege('anon', 'mindcanvas.mindcanvas_sessions', 'select')
     or has_table_privilege('authenticated', 'mindcanvas.mindcanvas_sessions', 'select')
     or has_function_privilege('anon', 'mindcanvas.mindcanvas_create_session(text,timestamptz,text,text,text)'::regprocedure, 'execute')
     or has_function_privilege('authenticated', 'mindcanvas.mindcanvas_create_session(text,timestamptz,text,text,text)'::regprocedure, 'execute') then
    raise exception 'browser role reaches a private MindCanvas object';
  end if;
end $$;

-- Execution-denial check: in separate queries, run the following once after SET ROLE anon,
-- and once after SET ROLE authenticated. Each must fail with SQLSTATE 42501.
-- select public.mindcanvas_api_session_status('mc_staging_verify_00001');

-- Run this remaining flow only where the test operator can SET ROLE service_role.
set local role service_role;
select public.mindcanvas_api_create_session(
  'mc_staging_verify_00001', now() + interval '1 hour', 'therapist-invite-hash',
  'client-invite-hash', 'therapist-refresh-hash'
);

do $$
declare
  redeemed_once boolean;
  redeemed_twice boolean;
  rotated boolean;
  unauthorized_end boolean;
  ended boolean;
  cleaned integer;
begin
  select public.mindcanvas_api_redeem_client_invite('mc_staging_verify_00001', 'client-invite-hash', 'client-refresh-hash', now() + interval '30 minutes') into redeemed_once;
  select public.mindcanvas_api_redeem_client_invite('mc_staging_verify_00001', 'client-invite-hash', 'second-client-refresh-hash', now() + interval '30 minutes') into redeemed_twice;
  select public.mindcanvas_api_rotate_grant('mc_staging_verify_00001', 'client', 'client-refresh-hash', 'next-client-refresh-hash', now() + interval '30 minutes') into rotated;
  select public.mindcanvas_api_end_session('mc_staging_verify_00001', 'wrong-therapist-refresh-hash') into unauthorized_end;
  select public.mindcanvas_api_end_session('mc_staging_verify_00001', 'therapist-refresh-hash') into ended;
  select public.mindcanvas_api_cleanup_sessions(now() + interval '16 minutes') into cleaned;

  if not redeemed_once or redeemed_twice or not rotated or unauthorized_end or not ended or cleaned <> 1 then
    raise exception 'unexpected session flow: redeem %, repeat %, rotate %, unauthorized end %, end %, cleanup %', redeemed_once, redeemed_twice, rotated, unauthorized_end, ended, cleaned;
  end if;
end $$;

rollback;

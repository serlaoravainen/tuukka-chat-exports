
\restrict [REDACTED]

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.6 (Ubuntu 17.6-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "auth";


ALTER SCHEMA "auth" OWNER TO "supabase_admin";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE SCHEMA IF NOT EXISTS "storage";


ALTER SCHEMA "storage" OWNER TO "supabase_admin";


CREATE TYPE "auth"."aal_level" AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


ALTER TYPE "auth"."aal_level" OWNER TO "supabase_auth_admin";


CREATE TYPE "auth"."code_challenge_method" AS ENUM (
    's256',
    'plain'
);


ALTER TYPE "auth"."code_challenge_method" OWNER TO "supabase_auth_admin";


CREATE TYPE "auth"."factor_status" AS ENUM (
    'unverified',
    'verified'
);


ALTER TYPE "auth"."factor_status" OWNER TO "supabase_auth_admin";


CREATE TYPE "auth"."factor_type" AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


ALTER TYPE "auth"."factor_type" OWNER TO "supabase_auth_admin";


CREATE TYPE "auth"."oauth_registration_type" AS ENUM (
    'dynamic',
    'manual'
);


ALTER TYPE "auth"."oauth_registration_type" OWNER TO "supabase_auth_admin";


CREATE TYPE "auth"."one_time_token_type" AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


ALTER TYPE "auth"."one_time_token_type" OWNER TO "supabase_auth_admin";


CREATE OR REPLACE FUNCTION "auth"."email"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


ALTER FUNCTION "auth"."email"() OWNER TO "supabase_auth_admin";


COMMENT ON FUNCTION "auth"."email"() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';



CREATE OR REPLACE FUNCTION "auth"."jwt"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


ALTER FUNCTION "auth"."jwt"() OWNER TO "supabase_auth_admin";


CREATE OR REPLACE FUNCTION "auth"."role"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


ALTER FUNCTION "auth"."role"() OWNER TO "supabase_auth_admin";


COMMENT ON FUNCTION "auth"."role"() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';



CREATE OR REPLACE FUNCTION "auth"."uid"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


ALTER FUNCTION "auth"."uid"() OWNER TO "supabase_auth_admin";


COMMENT ON FUNCTION "auth"."uid"() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
begin
    raise debug 'PgBouncer auth request: %', p_usename;

    return query
    select 
        rolname::text, 
        case when rolvaliduntil < now() 
            then null 
            else rolpassword::text 
        end 
    from pg_authid 
    where rolname=$1 and rolcanlogin;
end;
$_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: mail_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mail_jobs (
    id bigint NOT NULL,
    type text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    job_key text GENERATED ALWAYS AS (
CASE
    WHEN (type = 'admin_new_absence'::text) THEN (((((payload ->> 'employee_id'::text) || '|'::text) || (payload ->> 'start_date'::text)) || '|'::text) || COALESCE((payload ->> 'end_date'::text), ''::text))
    ELSE NULL::text
END) STORED
);


--
-- Name: claim_employee_jobs(text, timestamp with time zone, text[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_employee_jobs(p_employee_id text, p_since timestamp with time zone, p_types text[], p_limit integer DEFAULT 200) RETURNS SETOF public.mail_jobs
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with candidate as (
    select id
    from public.mail_jobs
    where status = 'queued'
      and created_at >= p_since
      and type = any(p_types)
      and payload->>'employee_id' = p_employee_id
    order by created_at asc
    limit p_limit
  ),
  locked as (
    update public.mail_jobs m
      set status = 'processing',
          processed_at = now(),
          attempt_count = m.attempt_count + 1
    where m.id in (select id from candidate)
      and m.status = 'queued'
    returning m.*
  )
  select * from locked;
$$;


--
-- Name: claim_employee_jobs(uuid, timestamp with time zone, text[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_employee_jobs(p_employee_id uuid, p_since timestamp with time zone, p_types text[], p_limit integer DEFAULT 200) RETURNS SETOF public.mail_jobs
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return query
  with cte as (
    select id
    from mail_jobs
    where status = 'queued'
      and (payload->>'employee_id') = p_employee_id::text
      and type = any(p_types)
      and created_at >= p_since
    order by created_at asc
    limit p_limit
    for update skip locked
  )
  update mail_jobs m
  set status = 'processing'
  from cte
  where m.id = cte.id
  returning m.*;
end;
$$;


--
-- Name: current_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public."current_role"() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select current_setting('role');
$$;


--
-- Name: delete_shifts(uuid, date[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_shifts(_employee_id uuid, _dates date[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  delete from public.shifts
  where employee_id = _employee_id
    and work_date = any(_dates);
end;
$$;


--
-- Name: enqueue_admin_new_absence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_admin_new_absence() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  cfg RECORD;
  _end_date date;
BEGIN
  SELECT email_notifications, absence_requests, admin_notification_emails
    INTO cfg
  FROM public.app_settings
  WHERE id = 1;

  IF COALESCE(cfg.email_notifications,false) IS NOT TRUE THEN RETURN NEW; END IF;
  IF COALESCE(cfg.absence_requests,false)     IS NOT TRUE THEN RETURN NEW; END IF;
  IF cfg.admin_notification_emails IS NULL
     OR array_length(cfg.admin_notification_emails,1) < 1 THEN
    RETURN NEW;
  END IF;

  -- normalisoi: jos end_date puuttuu → start_date
  _end_date := COALESCE(NEW.end_date, NEW.start_date);

  INSERT INTO public.mail_jobs (type, status, attempt_count, payload)
  VALUES (
    'admin_new_absence',
    'queued',
    0,
    jsonb_build_object(
      'employee_id', NEW.employee_id,
      'start_date', NEW.start_date,
      'end_date',   _end_date,
      'reason',     NEW.reason
    )
  )
  ON CONFLICT (job_key) DO NOTHING;  -- nyt toimii, koska on UNIQUE CONSTRAINT

  -- älä kaada inserttiä vaikka HTTP failaa
  BEGIN
    PERFORM net.http_post(
      url     := 'https://musrmpblsazxcrhwthtc.functions.supabase.co/mailer',
      headers := jsonb_build_object('Authorization','Bearer '||'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.[REDACTED].k6zU1Eiif-06XVvlHMugfxsL-ZFnXiTuf5Qg28r5x8A'),
      body    := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;


--
-- Name: enqueue_employee_new_shift(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_employee_new_shift() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enqueue_employee_new_shift"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_employee_shift_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.published is distinct from old.published
     and new.work_date  is not distinct from old.work_date
     and new.start_time is not distinct from old.start_time
     and new.end_time   is not distinct from old.end_time
     and new.type       is not distinct from old.type
     and new.minutes    is not distinct from old.minutes then
    return new;
  end if;

  if (new.work_date  is distinct from old.work_date
      or new.start_time is distinct from old.start_time
      or new.end_time   is distinct from old.end_time
      or new.type       is distinct from old.type
      or new.minutes    is distinct from old.minutes) then
    insert into public.employee_notifications (employee_id, type, title, message, created_at, is_read, priority)
    values (new.employee_id,
            'schedule_updated',
            'Työvuorosi on muuttunut',
            'Päivämäärä: ' || new.work_date::text,
            now(), false, 'medium')
    on conflict do nothing;
  end if;

  return new;
end;
$$;


--
-- Name: enqueue_employee_shift_deleted(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_employee_shift_deleted() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.published IS TRUE THEN
    -- sähköposti
    INSERT INTO public.mail_jobs(type, payload)
    VALUES ('employee_shift_deleted', jsonb_build_object(
      'employee_id', OLD.employee_id,
      'work_date',   OLD.work_date::text,
      'start',       OLD.start_time::text,
      'end',         OLD.end_time::text
    ));

    -- notifikaatio
    INSERT INTO public.employee_notifications (employee_id, type, title, message, created_at, is_read, priority)
    VALUES (
      OLD.employee_id,
      'shift_declined',
      'Vuorosi on peruttu',
      'Päivämäärä: ' || OLD.work_date::text,
      now(),
      FALSE,
      'medium'
    );
  END IF;
  RETURN OLD;
END;
$$;


--
-- Name: enqueue_on_publish_flip(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_on_publish_flip() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enqueue_on_publish_flip"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_shift_publication_jobs"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."enqueue_shift_publication_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_absence_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.notifications(type, title, message)
  values (
    'absence_request',
    'Uusi poissaolopyyntö',
    'Työntekijä ' || coalesce((select name from public.employees e where e.id = new.employee_id), 'Tuntematon')
      || ' on jättänyt poissaolopyynnön ' || new.start_date::text
      || coalesce(' – ' || new.end_date::text, '')
  );
  return new;
end $$;


ALTER FUNCTION "public"."notify_absence_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_absence_status_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status is distinct from old.status then
    if new.status = 'approved' then
      insert into public.notifications(type, title, message)
      values (
        'absence_approved',
        'Poissaolo hyväksytty',
        'Poissaolo ('|| new.start_date::text || coalesce(' – '||new.end_date::text,'') || ') hyväksyttiin.'
      );
    elsif new.status = 'declined' then
      insert into public.notifications(type, title, message)
      values (
        'absence_declined',
        'Poissaolo hylätty',
        'Poissaolopyyntö hylättiin.'
      );
    end if;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."notify_absence_status_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_employee_added"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.notifications(type, title, message)
  values (
    'employee_added',
    'Uusi työntekijä',
    coalesce(new.name,'Tuntematon') || ' on lisätty järjestelmään.'
  );
  return new;
end $$;


--
-- Name: publish_shifts(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_shifts(_start_date date, _end_date date) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.minutes IS NULL OR NEW.minutes <= 0 THEN
    RAISE EXCEPTION 'Minutes must be > 0, got %', NEW.minutes;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end; $$;


--
-- Name: trg_absence_enqueue_job(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_absence_enqueue_job() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  insert into mail_jobs (type, payload)
  values (
    'admin_new_absence',
    jsonb_build_object(
      'absence_id', new.id,
      'employee_id', new.employee_id,
      'start_date', new.start_date,
      'end_date', new.end_date,
      'reason', new.reason
    )
  );
  return new;
end;
$$;


--
-- Name: unpublish_shifts(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unpublish_shifts(_start_date date, _end_date date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  update public.shifts
  set published = true, published_at = ts
  where work_date between _start_date and _end_date
    and published = false;

  update public.shift_publications
  set status = 'canceled'
  where start_date = _start_date
    and end_date = _end_date;
end;
$$;


--
-- Name: upsert_shifts(uuid, date, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_shifts(_employee_id uuid, _work_date date, _type text, _minutes integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  insert into public.shifts (employee_id, work_date, type, minutes)
  values (_employee_id, _work_date, _type, _minutes)
  on conflict (employee_id, work_date)
  do update set
    type = excluded.type,
    minutes = excluded.minutes;
end;
$$;


--
-- Name: upsert_shifts_bulk(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_shifts_bulk(_rows jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  insert into shifts (employee_id, work_date, type, minutes)
  select (r->>'employee_id')::uuid,
         (r->>'work_date')::date,
         r->>'type',
         (r->>'minutes')::int
  from jsonb_array_elements(_rows) as r
  on conflict (employee_id, work_date)
  do update set type = excluded.type,
                minutes = excluded.minutes;
end;
$$;


ALTER FUNCTION "public"."publish_shifts_debug"("_start_date" "date", "_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_shifts_instant"("_start_date" "date", "_end_date" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  ts timestamp := now();
  pub_id uuid;
  emails text[];
begin
  insert into debug_log (context, message)
  values ('publish_shifts_instant', 'start ' || _start_date || ' - ' || _end_date);

  -- Merkitse vuorot julkaistuiksi
  update public.shifts
  set published = true, published_at = ts
  where work_date between _start_date and _end_date
    and published = false;
  insert into debug_log (context, message)
  values ('publish_shifts_instant', 'shifts updated: ' || found);

  -- Luo julkaisun merkintä
  insert into public.shift_publications (start_date, end_date, status, published_at)
  values (_start_date, _end_date, 'sent', ts)
  returning id into pub_id;
  insert into debug_log (context, message)
  values ('publish_shifts_instant', 'publication id: ' || pub_id);

  -- Luo in-app ilmoitukset
  insert into public.employee_notifications (employee_id, type, title, message, created_at, is_read, priority)
  select distinct s.employee_id,
         'schedule_published',
         'Uusi aikataulu julkaistu',
         'Tarkista uudet työvuorosi. Julkaisu: ' || pub_id,
         ts, false, 'high'
  from public.shifts s
  where s.work_date between _start_date and _end_date
    and s.published = true;
  insert into debug_log (context, message)
  values ('publish_shifts_instant', 'notifications inserted: ' || found);

  -- Kerää emailit
  select array_agg(distinct e.email)
  into emails
  from public.shifts s
  join public.employees e on e.id = s.employee_id
  where s.work_date between _start_date and _end_date
    and s.published = true
    and e.email is not null;
  insert into debug_log (context, message)
  values ('publish_shifts_instant', 'emails collected: ' || coalesce(array_length(emails,1),0));

  -- Lähetä kaikki kerralla arrayna
  if emails is not null and array_length(emails,1) > 0 then
    perform net.http_post(
      url := 'https://musrmpblsazxcrhwthtc.functions.supabase.co/sendemail',
      headers := jsonb_build_object(
        'Authorization','Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.[REDACTED].IsmXis0LAg4lUTD9nSB1i9212C9f1JSet0bKYKW1s1w',
        'Content-Type','application/json'
      ),
      body := jsonb_build_object(
        'to', (select jsonb_agg(e) from unnest(emails) e),
        'subject','Uudet vuorot julkaistu',
        'text','Sinulle on julkaistu uusia vuoroja. Tarkista työvuorosi sovelluksesta.'
      )
    );
    insert into debug_log (context, message)
    values ('publish_shifts_instant', 'http_post executed, recipients: ' || array_to_string(emails, ', '));
  else
    insert into debug_log (context, message)
    values ('publish_shifts_instant', 'no emails to send');
  end if;

  insert into debug_log (context, message)
  values ('publish_shifts_instant', 'end');
end;
$$;


ALTER FUNCTION "public"."publish_shifts_instant"("_start_date" "date", "_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_shifts_instant_debug"("_start_date" "date", "_end_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  ts timestamp := now();
  pub_id uuid;
  emails text[];
  sent_count int := 0;
begin
  -- Merkitse vuorot julkaistuiksi
  update public.shifts
  set published = true, published_at = ts
  where work_date between _start_date and _end_date
    and published = false;

  -- Luo julkaisun merkintä
  insert into public.shift_publications (start_date, end_date, status, published_at)
  values (_start_date, _end_date, 'sent', ts)
  returning id into pub_id;

  -- Luo in-app ilmoitukset
  insert into public.employee_notifications (employee_id, type, title, message, created_at, is_read, priority)
  select distinct s.employee_id,
         'schedule_published',
         'Uusi aikataulu julkaistu',
         'Tarkista uudet työvuorosi. Julkaisu: ' || pub_id,
         ts, false, 'high'
  from public.shifts s
  where s.work_date between _start_date and _end_date
    and s.published = true
  group by s.employee_id;

  -- Kerää emailit
  select array_agg(distinct e.email)
  into emails
  from public.shifts s
  join public.employees e on e.id = s.employee_id
  where s.work_date between _start_date and _end_date
    and s.published = true
    and e.email is not null;

  -- Lähetä sähköpostit yksi kerrallaan
  if emails is not null and array_length(emails,1) > 0 then
    for i in 1 .. array_length(emails,1) loop
      perform net.http_post(
        url := 'https://musrmpblsazxcrhwthtc.functions.supabase.co/sendemail',
        headers := jsonb_build_object(
          'Authorization','Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.[REDACTED].IsmXis0LAg4lUTD9nSB1i9212C9f1JSet0bKYKW1s1w',
          'Content-Type','application/json'
        ),
        body := jsonb_build_object(
          'to', emails[i],
          'subject','Uudet vuorot julkaistu',
          'text','Sinulle on julkaistu uusia vuoroja. Tarkista työvuorosi sovelluksesta.'
        )
      );
      sent_count := sent_count + 1;
    end loop;

    return jsonb_build_object('emails', emails, 'sent_count', sent_count);
  else
    return jsonb_build_object('emails','[]','sent_count',0,'error','no emails found');
  end if;
end;
$$;


ALTER FUNCTION "public"."publish_shifts_instant_debug"("_start_date" "date", "_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_shifts_bulk"("_deletes" "jsonb", "_upserts" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- 1) Poistot
  DELETE FROM public.shifts s
  USING jsonb_to_recordset(_deletes) AS d(employee_id uuid, work_date date)
  WHERE s.employee_id = d.employee_id
    AND s.work_date = d.work_date;

  -- 2) Upsertit
  INSERT INTO public.shifts (employee_id, work_date, type, minutes)
  SELECT employee_id, work_date, type, minutes
  FROM jsonb_to_recordset(_upserts)
       AS u(employee_id uuid, work_date date, type text, minutes int)
  ON CONFLICT (employee_id, work_date)
  DO UPDATE
    SET type = EXCLUDED.type,
        minutes = EXCLUDED.minutes,
        updated_at = now();
END;
$$;


ALTER FUNCTION "public"."save_shifts_bulk"("_deletes" "jsonb", "_upserts" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end; $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_shifts"("_employee_id" "uuid", "_work_date" "date", "_type" "text", "_minutes" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  insert into public.shifts (employee_id, work_date, type, minutes)
  values (_employee_id, _work_date, _type, _minutes)
  on conflict (employee_id, work_date)
  do update set
    type = excluded.type,
    minutes = excluded.minutes;
end;
$$;


ALTER FUNCTION "public"."upsert_shifts"("_employee_id" "uuid", "_work_date" "date", "_type" "text", "_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_shifts_bulk"("_rows" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO public.shifts (employee_id, work_date, type, minutes)
  SELECT employee_id, work_date, type, minutes
  FROM jsonb_to_recordset(_rows)
       AS x(employee_id uuid, work_date date, type text, minutes integer)
  WHERE minutes IS NOT NULL AND minutes > 0
  ON CONFLICT (employee_id, work_date)
  DO UPDATE
    SET type = EXCLUDED.type,
        minutes = EXCLUDED.minutes,
        updated_at = now();
END;
$$;


ALTER FUNCTION "public"."upsert_shifts_bulk"("_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "storage"."can_insert_object"("bucketid" "text", "name" "text", "owner" "uuid", "metadata" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


ALTER FUNCTION "storage"."can_insert_object"("bucketid" "text", "name" "text", "owner" "uuid", "metadata" "jsonb") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."extension"("name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
_parts text[];
_filename text;
BEGIN
	select string_to_array(name, '/') into _parts;
	select _parts[array_length(_parts,1)] into _filename;
	-- @todo return the last part instead of 2
	return reverse(split_part(reverse(_filename), '.', 1));
END
$$;


ALTER FUNCTION "storage"."extension"("name" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."filename"("name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


ALTER FUNCTION "storage"."filename"("name" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."foldername"("name" "text") RETURNS "text"[]
    LANGUAGE "plpgsql"
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[1:array_length(_parts,1)-1];
END
$$;


ALTER FUNCTION "storage"."foldername"("name" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."get_size_by_bucket"() RETURNS TABLE("size" bigint, "bucket_id" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::int) as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


ALTER FUNCTION "storage"."get_size_by_bucket"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."list_multipart_uploads_with_delimiter"("bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer DEFAULT 100, "next_key_token" "text" DEFAULT ''::"text", "next_upload_token" "text" DEFAULT ''::"text") RETURNS TABLE("key" "text", "id" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


ALTER FUNCTION "storage"."list_multipart_uploads_with_delimiter"("bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer, "next_key_token" "text", "next_upload_token" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."list_objects_with_delimiter"("bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer DEFAULT 100, "start_after" "text" DEFAULT ''::"text", "next_token" "text" DEFAULT ''::"text") RETURNS TABLE("name" "text", "id" "uuid", "metadata" "jsonb", "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(name COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                        substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1)))
                    ELSE
                        name
                END AS name, id, metadata, updated_at
            FROM
                storage.objects
            WHERE
                bucket_id = $5 AND
                name ILIKE $1 || ''%'' AND
                CASE
                    WHEN $6 != '''' THEN
                    name COLLATE "C" > $6
                ELSE true END
                AND CASE
                    WHEN $4 != '''' THEN
                        CASE
                            WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                                substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                name COLLATE "C" > $4
                            END
                    ELSE
                        true
                END
            ORDER BY
                name COLLATE "C" ASC) as e order by name COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_token, bucket_id, start_after;
END;
$_$;


ALTER FUNCTION "storage"."list_objects_with_delimiter"("bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer, "start_after" "text", "next_token" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."operation"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


ALTER FUNCTION "storage"."operation"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."search"("prefix" "text", "bucketname" "text", "limits" integer DEFAULT 100, "levels" integer DEFAULT 1, "offsets" integer DEFAULT 0, "search" "text" DEFAULT ''::"text", "sortcolumn" "text" DEFAULT 'name'::"text", "sortorder" "text" DEFAULT 'asc'::"text") RETURNS TABLE("name" "text", "id" "uuid", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone, "metadata" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $_$
declare
  v_order_by text;
  v_sort_order text;
begin
  case
    when sortcolumn = 'name' then
      v_order_by = 'name';
    when sortcolumn = 'updated_at' then
      v_order_by = 'updated_at';
    when sortcolumn = 'created_at' then
      v_order_by = 'created_at';
    when sortcolumn = 'last_accessed_at' then
      v_order_by = 'last_accessed_at';
    else
      v_order_by = 'name';
  end case;

  case
    when sortorder = 'asc' then
      v_sort_order = 'asc';
    when sortorder = 'desc' then
      v_sort_order = 'desc';
    else
      v_sort_order = 'asc';
  end case;

  v_order_by = v_order_by || ' ' || v_sort_order;

  return query execute
    'with folders as (
       select path_tokens[$1] as folder
       from storage.objects
         where objects.name ilike $2 || $3 || ''%''
           and bucket_id = $4
           and array_length(objects.path_tokens, 1) <> $1
       group by folder
       order by folder ' || v_sort_order || '
     )
     (select folder as "name",
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[$1] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where objects.name ilike $2 || $3 || ''%''
       and bucket_id = $4
       and array_length(objects.path_tokens, 1) = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


ALTER FUNCTION "storage"."search"("prefix" "text", "bucketname" "text", "limits" integer, "levels" integer, "offsets" integer, "search" "text", "sortcolumn" "text", "sortorder" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

ALTER FUNCTION "storage"."update_updated_at_column"() OWNER TO "supabase_storage_admin";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "auth"."audit_log_entries" (
    "instance_id" "uuid",
    "id" "uuid" NOT NULL,
    "payload" json,
    "created_at" timestamp with time zone,
    "ip_address" character varying(64) DEFAULT ''::character varying NOT NULL
);


ALTER TABLE "auth"."audit_log_entries" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."audit_log_entries" IS 'Auth: Audit trail for user actions.';



CREATE TABLE IF NOT EXISTS "auth"."flow_state" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid",
    "auth_code" "text" NOT NULL,
    "code_challenge_method" "auth"."code_challenge_method" NOT NULL,
    "code_challenge" "text" NOT NULL,
    "provider_type" "text" NOT NULL,
    "provider_access_token" "text",
    "provider_refresh_token" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "authentication_method" "text" NOT NULL,
    "auth_code_issued_at" timestamp with time zone
);


ALTER TABLE "auth"."flow_state" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."flow_state" IS 'stores metadata for pkce logins';



CREATE TABLE IF NOT EXISTS "auth"."identities" (
    "provider_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "identity_data" "jsonb" NOT NULL,
    "provider" "text" NOT NULL,
    "last_sign_in_at" timestamp with time zone,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "email" "text" GENERATED ALWAYS AS ("lower"(("identity_data" ->> 'email'::"text"))) STORED,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "auth"."identities" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."identities" IS 'Auth: Stores identities associated to a user.';



COMMENT ON COLUMN "auth"."identities"."email" IS 'Auth: Email is a generated column that references the optional email property in the identity_data';



CREATE TABLE IF NOT EXISTS "auth"."instances" (
    "id" "uuid" NOT NULL,
    "uuid" "uuid",
    "raw_base_config" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "auth"."instances" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."instances" IS 'Auth: Manages users across multiple sites.';



CREATE TABLE IF NOT EXISTS "auth"."mfa_amr_claims" (
    "session_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "authentication_method" "text" NOT NULL,
    "id" "uuid" NOT NULL
);


ALTER TABLE "auth"."mfa_amr_claims" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."mfa_amr_claims" IS 'auth: stores authenticator method reference claims for multi factor authentication';



CREATE TABLE IF NOT EXISTS "auth"."mfa_challenges" (
    "id" "uuid" NOT NULL,
    "factor_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "verified_at" timestamp with time zone,
    "ip_address" "inet" NOT NULL,
    "otp_code" "text",
    "web_authn_session_data" "jsonb"
);


ALTER TABLE "auth"."mfa_challenges" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."mfa_challenges" IS 'auth: stores metadata about challenge requests made';



CREATE TABLE IF NOT EXISTS "auth"."mfa_factors" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "friendly_name" "text",
    "factor_type" "auth"."factor_type" NOT NULL,
    "status" "auth"."factor_status" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "secret" "text",
    "phone" "text",
    "last_challenged_at" timestamp with time zone,
    "web_authn_credential" "jsonb",
    "web_authn_aaguid" "uuid"
);


ALTER TABLE "auth"."mfa_factors" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."mfa_factors" IS 'auth: stores metadata about factors';



CREATE TABLE IF NOT EXISTS "auth"."oauth_clients" (
    "id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "client_secret_hash" "text" NOT NULL,
    "registration_type" "auth"."oauth_registration_type" NOT NULL,
    "redirect_uris" "text" NOT NULL,
    "grant_types" "text" NOT NULL,
    "client_name" "text",
    "client_uri" "text",
    "logo_uri" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "oauth_clients_client_name_length" CHECK (("char_length"("client_name") <= 1024)),
    CONSTRAINT "oauth_clients_client_uri_length" CHECK (("char_length"("client_uri") <= 2048)),
    CONSTRAINT "oauth_clients_logo_uri_length" CHECK (("char_length"("logo_uri") <= 2048))
);


ALTER TABLE "auth"."oauth_clients" OWNER TO "supabase_auth_admin";


CREATE TABLE IF NOT EXISTS "auth"."one_time_tokens" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_type" "auth"."one_time_token_type" NOT NULL,
    "token_hash" "text" NOT NULL,
    "relates_to" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "one_time_tokens_token_hash_check" CHECK (("char_length"("token_hash") > 0))
);


ALTER TABLE "auth"."one_time_tokens" OWNER TO "supabase_auth_admin";


CREATE TABLE IF NOT EXISTS "auth"."refresh_tokens" (
    "instance_id" "uuid",
    "id" bigint NOT NULL,
    "token" character varying(255),
    "user_id" character varying(255),
    "revoked" boolean,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "parent" character varying(255),
    "session_id" "uuid"
);


ALTER TABLE "auth"."refresh_tokens" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."refresh_tokens" IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';



CREATE SEQUENCE IF NOT EXISTS "auth"."refresh_tokens_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "auth"."refresh_tokens_id_seq" OWNER TO "supabase_auth_admin";


ALTER SEQUENCE "auth"."refresh_tokens_id_seq" OWNED BY "auth"."refresh_tokens"."id";



CREATE TABLE IF NOT EXISTS "auth"."saml_providers" (
    "id" "uuid" NOT NULL,
    "sso_provider_id" "uuid" NOT NULL,
    "entity_id" "text" NOT NULL,
    "metadata_xml" "text" NOT NULL,
    "metadata_url" "text",
    "attribute_mapping" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "name_id_format" "text",
    CONSTRAINT "entity_id not empty" CHECK (("char_length"("entity_id") > 0)),
    CONSTRAINT "metadata_url not empty" CHECK ((("metadata_url" = NULL::"text") OR ("char_length"("metadata_url") > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK (("char_length"("metadata_xml") > 0))
);


ALTER TABLE "auth"."saml_providers" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."saml_providers" IS 'Auth: Manages SAML Identity Provider connections.';



CREATE TABLE IF NOT EXISTS "auth"."saml_relay_states" (
    "id" "uuid" NOT NULL,
    "sso_provider_id" "uuid" NOT NULL,
    "request_id" "text" NOT NULL,
    "for_email" "text",
    "redirect_to" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "flow_state_id" "uuid",
    CONSTRAINT "request_id not empty" CHECK (("char_length"("request_id") > 0))
);


ALTER TABLE "auth"."saml_relay_states" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."saml_relay_states" IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';



CREATE TABLE IF NOT EXISTS "auth"."schema_migrations" (
    "version" character varying(255) NOT NULL
);


ALTER TABLE "auth"."schema_migrations" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."schema_migrations" IS 'Auth: Manages updates to the auth system.';



CREATE TABLE IF NOT EXISTS "auth"."sessions" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "factor_id" "uuid",
    "aal" "auth"."aal_level",
    "not_after" timestamp with time zone,
    "refreshed_at" timestamp without time zone,
    "user_agent" "text",
    "ip" "inet",
    "tag" "text"
);


ALTER TABLE "auth"."sessions" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."sessions" IS 'Auth: Stores session data associated to a user.';



COMMENT ON COLUMN "auth"."sessions"."not_after" IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';



CREATE TABLE IF NOT EXISTS "auth"."sso_domains" (
    "id" "uuid" NOT NULL,
    "sso_provider_id" "uuid" NOT NULL,
    "domain" "text" NOT NULL,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK (("char_length"("domain") > 0))
);


ALTER TABLE "auth"."sso_domains" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."sso_domains" IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';



CREATE TABLE IF NOT EXISTS "auth"."sso_providers" (
    "id" "uuid" NOT NULL,
    "resource_id" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "disabled" boolean,
    CONSTRAINT "resource_id not empty" CHECK ((("resource_id" = NULL::"text") OR ("char_length"("resource_id") > 0)))
);


ALTER TABLE "auth"."sso_providers" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."sso_providers" IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';



COMMENT ON COLUMN "auth"."sso_providers"."resource_id" IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';



CREATE TABLE IF NOT EXISTS "auth"."users" (
    "instance_id" "uuid",
    "id" "uuid" NOT NULL,
    "aud" character varying(255),
    "role" character varying(255),
    "email" character varying(255),
    "encrypted_password" character varying(255),
    "email_confirmed_at" timestamp with time zone,
    "invited_at" timestamp with time zone,
    "confirmation_token" character varying(255),
    "confirmation_sent_at" timestamp with time zone,
    "recovery_token" character varying(255),
    "recovery_sent_at" timestamp with time zone,
    "email_change_token_new" character varying(255),
    "email_change" character varying(255),
    "email_change_sent_at" timestamp with time zone,
    "last_sign_in_at" timestamp with time zone,
    "raw_app_meta_data" "jsonb",
    "raw_user_meta_data" "jsonb",
    "is_super_admin" boolean,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "phone" "text" DEFAULT NULL::character varying,
    "phone_confirmed_at" timestamp with time zone,
    "phone_change" "text" DEFAULT ''::character varying,
    "phone_change_token" character varying(255) DEFAULT ''::character varying,
    "phone_change_sent_at" timestamp with time zone,
    "confirmed_at" timestamp with time zone GENERATED ALWAYS AS (LEAST("email_confirmed_at", "phone_confirmed_at")) STORED,
    "email_change_token_current" character varying(255) DEFAULT ''::character varying,
    "email_change_confirm_status" smallint DEFAULT 0,
    "banned_until" timestamp with time zone,
    "reauthentication_token" character varying(255) DEFAULT ''::character varying,
    "reauthentication_sent_at" timestamp with time zone,
    "is_sso_user" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "is_anonymous" boolean DEFAULT false NOT NULL,
    CONSTRAINT "users_email_change_confirm_status_check" CHECK ((("email_change_confirm_status" >= 0) AND ("email_change_confirm_status" <= 2)))
);


ALTER TABLE "auth"."users" OWNER TO "supabase_auth_admin";


COMMENT ON TABLE "auth"."users" IS 'Auth: Stores user login data within a secure schema.';



COMMENT ON COLUMN "auth"."users"."is_sso_user" IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';



CREATE TABLE IF NOT EXISTS "public"."absences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "reason" "text",
    "message" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "absences_status_valid_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."absences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "id" integer NOT NULL,
    "email_notifications" boolean DEFAULT true NOT NULL,
    "admin_notification_emails" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "absence_requests" boolean DEFAULT true NOT NULL,
    "schedule_changes" boolean DEFAULT true NOT NULL,
    "employee_updates" boolean DEFAULT false NOT NULL,
    "system_updates" boolean DEFAULT false NOT NULL,
    "daily_digest" boolean DEFAULT false NOT NULL,
    "digest_time" "text" DEFAULT '08:00'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_settings_id_check" CHECK (("id" = 1))
);


--
-- Name: employee_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    priority text DEFAULT 'low'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text,
    department text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    auth_user_id uuid,
    role text DEFAULT 'employee'::text,
    CONSTRAINT employees_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'employee'::text])))
);


--
-- Name: shift_publications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_publications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL
);


--
-- Name: TABLE shift_publications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.shift_publications IS 'Tallentaa vuorojen julkaisun ja sen tilan (pending/sent/canceled).';


--
-- Name: latest_publications_overview; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.latest_publications_overview AS
 SELECT sp.id AS publication_id,
    sp.start_date,
    sp.end_date,
    sp.status AS publication_status,
    count(j.*) FILTER (WHERE (j.status = 'queued'::text)) AS jobs_queued,
    count(j.*) FILTER (WHERE (j.status = 'processing'::text)) AS jobs_processing,
    count(j.*) FILTER (WHERE (j.status = 'sent'::text)) AS jobs_sent
   FROM (public.shift_publications sp
     LEFT JOIN public.mail_jobs j ON ((((((j.payload ->> 'work_date'::text))::date >= sp.start_date) AND (((j.payload ->> 'work_date'::text))::date <= sp.end_date)) AND (j.type = 'shift_publication'::text))))
  GROUP BY sp.id, sp.start_date, sp.end_date, sp.status
  ORDER BY sp.start_date DESC;


--
-- Name: mail_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mail_jobs ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.mail_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['absence_request'::text, 'absence_approved'::text, 'absence_declined'::text, 'employee_added'::text, 'shift_auto'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    is_admin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: publication_jobs_debug; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.publication_jobs_debug AS
 SELECT sp.id AS publication_id,
    sp.start_date,
    sp.end_date,
    sp.status AS publication_status,
    j.id AS job_id,
    j.status AS job_status,
    j.created_at AS job_created,
    j.processed_at AS job_processed,
    (j.payload ->> 'employee_id'::text) AS employee_id,
    (j.payload ->> 'work_date'::text) AS work_date
   FROM (public.shift_publications sp
     LEFT JOIN public.mail_jobs j ON ((((((j.payload ->> 'work_date'::text))::date >= sp.start_date) AND (((j.payload ->> 'work_date'::text))::date <= sp.end_date)) AND (j.type = 'shift_publication'::text))))
  ORDER BY sp.start_date DESC, j.created_at DESC;


--
-- Name: shift_change_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_change_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid,
    target_employee_id uuid,
    current_shift_date date NOT NULL,
    requested_shift_date date NOT NULL,
    reason text,
    message text,
    status text DEFAULT 'pending'::text NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    work_date date NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    type text DEFAULT 'normal'::text NOT NULL,
    is_locked boolean DEFAULT false NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    minutes integer DEFAULT 0 NOT NULL,
    CONSTRAINT shifts_time_order_chk CHECK (((start_time IS NULL) OR (end_time IS NULL) OR (start_time < end_time))),
    CONSTRAINT shifts_type_allowed_chk CHECK ((type = ANY (ARRAY['normal'::text, 'locked'::text, 'absent'::text, 'holiday'::text]))),
    CONSTRAINT shifts_type_check CHECK ((type = ANY (ARRAY['normal'::text, 'locked'::text, 'absent'::text, 'holiday'::text])))
);


--
-- Name: time_off_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_off_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text,
    message text,
    status text DEFAULT 'pending'::text NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE "public"."shift_change_requests" OWNER TO "postgres";


CREATE TABLE public.time_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
)
PARTITION BY RANGE (inserted_at);


--
-- Name: messages_2025_09_06; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_09_06 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2025_09_07; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_09_07 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2025_09_08; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_09_08 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2025_09_09; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_09_09 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2025_09_10; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_09_10 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2025_09_11; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_09_11 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2025_09_12; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_09_12 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text
);


ALTER TABLE "storage"."buckets" OWNER TO "supabase_storage_admin";


COMMENT ON COLUMN "storage"."buckets"."owner" IS 'Field is deprecated, use owner_id instead';



CREATE TABLE IF NOT EXISTS "storage"."migrations" (
    "id" integer NOT NULL,
    "name" character varying(100) NOT NULL,
    "hash" character varying(40) NOT NULL,
    "executed_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "storage"."migrations" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."objects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bucket_id" "text",
    "name" "text",
    "owner" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_accessed_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb",
    "path_tokens" "text"[] GENERATED ALWAYS AS ("string_to_array"("name", '/'::"text")) STORED,
    "version" "text",
    "owner_id" "text",
    "user_metadata" "jsonb"
);


ALTER TABLE "storage"."objects" OWNER TO "supabase_storage_admin";


COMMENT ON COLUMN "storage"."objects"."owner" IS 'Field is deprecated, use owner_id instead';



CREATE TABLE IF NOT EXISTS "storage"."s3_multipart_uploads" (
    "id" "text" NOT NULL,
    "in_progress_size" bigint DEFAULT 0 NOT NULL,
    "upload_signature" "text" NOT NULL,
    "bucket_id" "text" NOT NULL,
    "key" "text" NOT NULL COLLATE "pg_catalog"."C",
    "version" "text" NOT NULL,
    "owner_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_metadata" "jsonb"
);


ALTER TABLE "storage"."s3_multipart_uploads" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."s3_multipart_uploads_parts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "upload_id" "text" NOT NULL,
    "size" bigint DEFAULT 0 NOT NULL,
    "part_number" integer NOT NULL,
    "bucket_id" "text" NOT NULL,
    "key" "text" NOT NULL COLLATE "pg_catalog"."C",
    "etag" "text" NOT NULL,
    "owner_id" "text",
    "version" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    statements text[],
    name text
);


--
-- Name: seed_files; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.seed_files (
    path text NOT NULL,
    hash text NOT NULL
);


--
-- Name: messages_2025_09_06; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_09_06 FOR VALUES FROM ('2025-09-06 00:00:00') TO ('2025-09-07 00:00:00');


--
-- Name: messages_2025_09_07; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_09_07 FOR VALUES FROM ('2025-09-07 00:00:00') TO ('2025-09-08 00:00:00');


--
-- Name: messages_2025_09_08; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_09_08 FOR VALUES FROM ('2025-09-08 00:00:00') TO ('2025-09-09 00:00:00');


--
-- Name: messages_2025_09_09; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_09_09 FOR VALUES FROM ('2025-09-09 00:00:00') TO ('2025-09-10 00:00:00');


--
-- Name: messages_2025_09_10; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_09_10 FOR VALUES FROM ('2025-09-10 00:00:00') TO ('2025-09-11 00:00:00');


--
-- Name: messages_2025_09_11; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_09_11 FOR VALUES FROM ('2025-09-11 00:00:00') TO ('2025-09-12 00:00:00');


--
-- Name: messages_2025_09_12; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_09_12 FOR VALUES FROM ('2025-09-12 00:00:00') TO ('2025-09-13 00:00:00');


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);



ALTER TABLE ONLY "auth"."flow_state"
    ADD CONSTRAINT "flow_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."identities"
    ADD CONSTRAINT "identities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."identities"
    ADD CONSTRAINT "identities_provider_id_provider_unique" UNIQUE ("provider_id", "provider");



ALTER TABLE ONLY "auth"."instances"
    ADD CONSTRAINT "instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."mfa_amr_claims"
    ADD CONSTRAINT "[REDACTED]" UNIQUE ("session_id", "authentication_method");



ALTER TABLE ONLY "auth"."mfa_challenges"
    ADD CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."mfa_factors"
    ADD CONSTRAINT "mfa_factors_last_challenged_at_key" UNIQUE ("last_challenged_at");



ALTER TABLE ONLY "auth"."mfa_factors"
    ADD CONSTRAINT "mfa_factors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."oauth_clients"
    ADD CONSTRAINT "oauth_clients_client_id_key" UNIQUE ("client_id");



ALTER TABLE ONLY "auth"."oauth_clients"
    ADD CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."one_time_tokens"
    ADD CONSTRAINT "one_time_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_token_unique" UNIQUE ("token");



ALTER TABLE ONLY "auth"."saml_providers"
    ADD CONSTRAINT "saml_providers_entity_id_key" UNIQUE ("entity_id");



ALTER TABLE ONLY "auth"."saml_providers"
    ADD CONSTRAINT "saml_providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."saml_relay_states"
    ADD CONSTRAINT "saml_relay_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."schema_migrations"
    ADD CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("version");



ALTER TABLE ONLY "auth"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."sso_domains"
    ADD CONSTRAINT "sso_domains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."sso_providers"
    ADD CONSTRAINT "sso_providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "auth"."users"
    ADD CONSTRAINT "users_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "auth"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");


--
-- Name: debug_log debug_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debug_log
    ADD CONSTRAINT debug_log_pkey PRIMARY KEY (id);


--
-- Name: email_send_log email_send_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_send_log
    ADD CONSTRAINT email_send_log_pkey PRIMARY KEY (id);


--
-- Name: employee_notifications employee_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_notifications
    ADD CONSTRAINT employee_notifications_pkey PRIMARY KEY (id);


--
-- Name: employees employees_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_email_unique UNIQUE (email);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: employees employees_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_user_id_unique UNIQUE (auth_user_id);


--
-- Name: mail_jobs mail_jobs_job_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_jobs
    ADD CONSTRAINT mail_jobs_job_key_unique UNIQUE (job_key);


--
-- Name: mail_jobs mail_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_jobs
    ADD CONSTRAINT mail_jobs_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: shift_change_requests shift_change_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_change_requests
    ADD CONSTRAINT shift_change_requests_pkey PRIMARY KEY (id);



ALTER TABLE ONLY "public"."shift_publications"
    ADD CONSTRAINT "shift_publications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_employee_id_work_date_key" UNIQUE ("employee_id", "work_date");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."time_off_requests"
    ADD CONSTRAINT "time_off_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."time_periods"
    ADD CONSTRAINT "time_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY public.employee_notifications
    ADD CONSTRAINT uniq_emp_date_update UNIQUE (employee_id, type, message);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_09_06 messages_2025_09_06_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_09_06
    ADD CONSTRAINT messages_2025_09_06_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_09_07 messages_2025_09_07_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_09_07
    ADD CONSTRAINT messages_2025_09_07_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_09_08 messages_2025_09_08_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_09_08
    ADD CONSTRAINT messages_2025_09_08_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_09_09 messages_2025_09_09_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_09_09
    ADD CONSTRAINT messages_2025_09_09_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_09_10 messages_2025_09_10_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_09_10
    ADD CONSTRAINT messages_2025_09_10_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_09_11 messages_2025_09_11_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_09_11
    ADD CONSTRAINT messages_2025_09_11_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_09_12 messages_2025_09_12_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_09_12
    ADD CONSTRAINT messages_2025_09_12_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);



ALTER TABLE ONLY "storage"."s3_multipart_uploads"
    ADD CONSTRAINT "s3_multipart_uploads_pkey" PRIMARY KEY ("id");



CREATE INDEX "audit_logs_instance_id_idx" ON "auth"."audit_log_entries" USING "btree" ("instance_id");



CREATE UNIQUE INDEX "confirmation_token_idx" ON "auth"."users" USING "btree" ("confirmation_token") WHERE (("confirmation_token")::"text" !~ '^[0-9 ]*$'::"text");



CREATE UNIQUE INDEX "email_change_token_current_idx" ON "auth"."users" USING "btree" ("email_change_token_current") WHERE (("email_change_token_current")::"text" !~ '^[0-9 ]*$'::"text");



CREATE UNIQUE INDEX "email_change_token_new_idx" ON "auth"."users" USING "btree" ("email_change_token_new") WHERE (("email_change_token_new")::"text" !~ '^[0-9 ]*$'::"text");



CREATE INDEX "factor_id_created_at_idx" ON "auth"."mfa_factors" USING "btree" ("user_id", "created_at");



CREATE INDEX "flow_state_created_at_idx" ON "auth"."flow_state" USING "btree" ("created_at" DESC);



CREATE INDEX "identities_email_idx" ON "auth"."identities" USING "btree" ("email" "text_pattern_ops");



COMMENT ON INDEX "auth"."identities_email_idx" IS 'Auth: Ensures indexed queries on the email column';



CREATE INDEX "identities_user_id_idx" ON "auth"."identities" USING "btree" ("user_id");



CREATE INDEX "idx_auth_code" ON "auth"."flow_state" USING "btree" ("auth_code");



CREATE INDEX "idx_user_id_auth_method" ON "auth"."flow_state" USING "btree" ("user_id", "authentication_method");



CREATE INDEX "mfa_challenge_created_at_idx" ON "auth"."mfa_challenges" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "mfa_factors_user_friendly_name_unique" ON "auth"."mfa_factors" USING "btree" ("friendly_name", "user_id") WHERE (TRIM(BOTH FROM "friendly_name") <> ''::"text");



CREATE INDEX "mfa_factors_user_id_idx" ON "auth"."mfa_factors" USING "btree" ("user_id");



CREATE INDEX "oauth_clients_client_id_idx" ON "auth"."oauth_clients" USING "btree" ("client_id");



CREATE INDEX "oauth_clients_deleted_at_idx" ON "auth"."oauth_clients" USING "btree" ("deleted_at");



CREATE INDEX "one_time_tokens_relates_to_hash_idx" ON "auth"."one_time_tokens" USING "hash" ("relates_to");



CREATE INDEX "one_time_tokens_token_hash_hash_idx" ON "auth"."one_time_tokens" USING "hash" ("token_hash");



CREATE UNIQUE INDEX "one_time_tokens_user_id_token_type_key" ON "auth"."one_time_tokens" USING "btree" ("user_id", "token_type");



CREATE UNIQUE INDEX "reauthentication_token_idx" ON "auth"."users" USING "btree" ("reauthentication_token") WHERE (("reauthentication_token")::"text" !~ '^[0-9 ]*$'::"text");



CREATE UNIQUE INDEX "recovery_token_idx" ON "auth"."users" USING "btree" ("recovery_token") WHERE (("recovery_token")::"text" !~ '^[0-9 ]*$'::"text");



CREATE INDEX "refresh_tokens_instance_id_idx" ON "auth"."refresh_tokens" USING "btree" ("instance_id");



CREATE INDEX "refresh_tokens_instance_id_user_id_idx" ON "auth"."refresh_tokens" USING "btree" ("instance_id", "user_id");



CREATE INDEX "refresh_tokens_parent_idx" ON "auth"."refresh_tokens" USING "btree" ("parent");



CREATE INDEX "refresh_tokens_session_id_revoked_idx" ON "auth"."refresh_tokens" USING "btree" ("session_id", "revoked");



CREATE INDEX "refresh_tokens_updated_at_idx" ON "auth"."refresh_tokens" USING "btree" ("updated_at" DESC);



CREATE INDEX "saml_providers_sso_provider_id_idx" ON "auth"."saml_providers" USING "btree" ("sso_provider_id");



CREATE INDEX "saml_relay_states_created_at_idx" ON "auth"."saml_relay_states" USING "btree" ("created_at" DESC);



CREATE INDEX "saml_relay_states_for_email_idx" ON "auth"."saml_relay_states" USING "btree" ("for_email");



CREATE INDEX "saml_relay_states_sso_provider_id_idx" ON "auth"."saml_relay_states" USING "btree" ("sso_provider_id");



CREATE INDEX "sessions_not_after_idx" ON "auth"."sessions" USING "btree" ("not_after" DESC);



CREATE INDEX "sessions_user_id_idx" ON "auth"."sessions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "sso_domains_domain_idx" ON "auth"."sso_domains" USING "btree" ("lower"("domain"));



CREATE INDEX "sso_domains_sso_provider_id_idx" ON "auth"."sso_domains" USING "btree" ("sso_provider_id");



CREATE UNIQUE INDEX "sso_providers_resource_id_idx" ON "auth"."sso_providers" USING "btree" ("lower"("resource_id"));



CREATE INDEX "sso_providers_resource_id_pattern_idx" ON "auth"."sso_providers" USING "btree" ("resource_id" "text_pattern_ops");



CREATE UNIQUE INDEX "unique_phone_factor_per_user" ON "auth"."mfa_factors" USING "btree" ("user_id", "phone");



CREATE INDEX "user_id_created_at_idx" ON "auth"."sessions" USING "btree" ("user_id", "created_at");



CREATE UNIQUE INDEX "users_email_partial_key" ON "auth"."users" USING "btree" ("email") WHERE ("is_sso_user" = false);



COMMENT ON INDEX "auth"."users_email_partial_key" IS 'Auth: A partial unique index that applies only when is_sso_user is false';



CREATE INDEX "users_instance_id_email_idx" ON "auth"."users" USING "btree" ("instance_id", "lower"(("email")::"text"));



CREATE INDEX "users_instance_id_idx" ON "auth"."users" USING "btree" ("instance_id");



CREATE INDEX "users_is_anonymous_idx" ON "auth"."users" USING "btree" ("is_anonymous");



CREATE UNIQUE INDEX "employees_email_lower_uq" ON "public"."employees" USING "btree" ("lower"("email")) WHERE ("email" IS NOT NULL);



CREATE INDEX "idx_absences_emp_dates" ON "public"."absences" USING "btree" ("employee_id", "start_date", "end_date");



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_is_read" ON "public"."notifications" USING "btree" ("is_read");



CREATE INDEX "idx_shifts_emp_date_pub" ON "public"."shifts" USING "btree" ("employee_id", "work_date", "published");



CREATE INDEX "idx_shifts_employee_id" ON "public"."shifts" USING "btree" ("employee_id");



CREATE INDEX idx_shifts_published ON public.shifts USING btree (published);


--
-- Name: idx_shifts_work_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shifts_work_date ON public.shifts USING btree (work_date);


--
-- Name: mail_jobs_emp_queued_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mail_jobs_emp_queued_idx ON public.mail_jobs USING btree (((payload ->> 'employee_id'::text))) WHERE (status = 'queued'::text);


--
-- Name: mail_jobs_queued_time_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mail_jobs_queued_time_type_idx ON public.mail_jobs USING btree (created_at, type) WHERE (status = 'queued'::text);


--
-- Name: mail_jobs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mail_jobs_status_idx ON public.mail_jobs USING btree (status) WHERE (status = 'queued'::text);


--
-- Name: mail_jobs_unique_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mail_jobs_unique_key ON public.mail_jobs USING btree (job_key) WHERE (type = 'admin_new_absence'::text);


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: subscription_subscription_id_entity_filters_key; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_key ON realtime.subscription USING btree (subscription_id, entity, filters);


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);



CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: messages_2025_09_06_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_09_06_pkey;


--
-- Name: messages_2025_09_07_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_09_07_pkey;


--
-- Name: messages_2025_09_08_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_09_08_pkey;


--
-- Name: messages_2025_09_09_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_09_09_pkey;


--
-- Name: messages_2025_09_10_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_09_10_pkey;


--
-- Name: messages_2025_09_11_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_09_11_pkey;


--
-- Name: messages_2025_09_12_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_09_12_pkey;


--
-- Name: absences trg_absence_enqueue_job; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_absence_enqueue_job AFTER INSERT ON public.absences FOR EACH ROW EXECUTE FUNCTION public.trg_absence_enqueue_job();


--
-- Name: absences trg_admin_new_absence; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_admin_new_absence AFTER INSERT ON public.absences FOR EACH ROW EXECUTE FUNCTION public.enqueue_admin_new_absence();


--
-- Name: shifts trg_employee_shift_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_employee_shift_changed AFTER UPDATE ON public.shifts FOR EACH ROW WHEN ((new.employee_id IS NOT NULL)) EXECUTE FUNCTION public.enqueue_employee_shift_changed();


--
-- Name: shifts trg_employee_shift_deleted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_employee_shift_deleted AFTER DELETE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.enqueue_employee_shift_deleted();


--
-- Name: absences trg_notify_absence_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_absence_insert AFTER INSERT ON public.absences FOR EACH ROW EXECUTE FUNCTION public.notify_absence_insert();


--
-- Name: absences trg_notify_absence_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_absence_update AFTER UPDATE ON public.absences FOR EACH ROW EXECUTE FUNCTION public.notify_absence_status_update();


--
-- Name: employees trg_notify_employee_added; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_employee_added AFTER INSERT ON public.employees FOR EACH ROW EXECUTE FUNCTION public.notify_employee_added();


--
-- Name: shifts trg_shifts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_shifts_updated_at BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();



ALTER TABLE ONLY "auth"."identities"
    ADD CONSTRAINT "identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."mfa_amr_claims"
    ADD CONSTRAINT "mfa_amr_claims_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."mfa_challenges"
    ADD CONSTRAINT "mfa_challenges_auth_factor_id_fkey" FOREIGN KEY ("factor_id") REFERENCES "auth"."mfa_factors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."mfa_factors"
    ADD CONSTRAINT "mfa_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."one_time_tokens"
    ADD CONSTRAINT "one_time_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."saml_providers"
    ADD CONSTRAINT "saml_providers_sso_provider_id_fkey" FOREIGN KEY ("sso_provider_id") REFERENCES "auth"."sso_providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."saml_relay_states"
    ADD CONSTRAINT "saml_relay_states_flow_state_id_fkey" FOREIGN KEY ("flow_state_id") REFERENCES "auth"."flow_state"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."saml_relay_states"
    ADD CONSTRAINT "saml_relay_states_sso_provider_id_fkey" FOREIGN KEY ("sso_provider_id") REFERENCES "auth"."sso_providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."sessions"
    ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "auth"."sso_domains"
    ADD CONSTRAINT "sso_domains_sso_provider_id_fkey" FOREIGN KEY ("sso_provider_id") REFERENCES "auth"."sso_providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_notifications"
    ADD CONSTRAINT "employee_notifications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "fk_employees_auth" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shift_change_requests"
    ADD CONSTRAINT "shift_change_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_change_requests"
    ADD CONSTRAINT "shift_change_requests_target_employee_id_fkey" FOREIGN KEY ("target_employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_off_requests"
    ADD CONSTRAINT "time_off_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "storage"."objects"
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads"
    ADD CONSTRAINT "s3_multipart_uploads_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads_parts"
    ADD CONSTRAINT "s3_multipart_uploads_parts_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads_parts"
    ADD CONSTRAINT "s3_multipart_uploads_parts_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "storage"."s3_multipart_uploads"("id") ON DELETE CASCADE;



ALTER TABLE "auth"."audit_log_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."flow_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."identities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."mfa_amr_claims" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."mfa_challenges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."mfa_factors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."one_time_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."refresh_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."saml_providers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."saml_relay_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."schema_migrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."sso_domains" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."sso_providers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "auth"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Employees manage their own shift change requests" ON "public"."shift_change_requests" USING (("auth"."uid"() = "employee_id")) WITH CHECK (("auth"."uid"() = "employee_id"));



CREATE POLICY "Employees manage their own time off requests" ON "public"."time_off_requests" USING (("auth"."uid"() = "employee_id")) WITH CHECK (("auth"."uid"() = "employee_id"));



CREATE POLICY "Employees view their own notifications" ON "public"."employee_notifications" FOR SELECT USING (("auth"."uid"() = "employee_id"));



ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_delete_shifts" ON "public"."shifts" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_insert_absences" ON "public"."absences" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_insert_app_settings" ON "public"."app_settings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_insert_employees" ON "public"."employees" FOR INSERT TO "authenticated" WITH CHECK ((("role" = 'admin'::"text") AND ("auth_user_id" = "auth"."uid"())));



CREATE POLICY "admin_insert_notifications" ON "public"."employee_notifications" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_insert_shift_changes" ON "public"."shift_change_requests" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_insert_shifts" ON "public"."shifts" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_insert_time_off" ON "public"."time_off_requests" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_insert_time_periods" ON "public"."time_periods" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_select_all_absences" ON "public"."absences" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_select_all_employees" ON "public"."employees" FOR SELECT TO "authenticated" USING ((("role" = 'admin'::"text") AND ("auth_user_id" = "auth"."uid"())));



CREATE POLICY "admin_select_all_notifications" ON "public"."employee_notifications" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_select_all_shift_changes" ON "public"."shift_change_requests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_select_all_shifts" ON "public"."shifts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_select_all_time_off" ON "public"."time_off_requests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_update_absences" ON "public"."absences" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_update_app_settings" ON "public"."app_settings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_update_employees" ON "public"."employees" FOR UPDATE TO "authenticated" USING ((("role" = 'admin'::"text") AND ("auth_user_id" = "auth"."uid"()))) WITH CHECK ((("role" = 'admin'::"text") AND ("auth_user_id" = "auth"."uid"())));



CREATE POLICY "admin_update_notifications" ON "public"."employee_notifications" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_update_shift_changes" ON "public"."shift_change_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_update_shifts" ON "public"."shifts" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY "admin_update_time_off" ON "public"."time_off_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."auth_user_id" = "auth"."uid"()) AND ("e"."role" = 'admin'::"text")))));



CREATE POLICY admin_update_time_periods ON public.time_periods FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.auth_user_id = auth.uid()) AND (e.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.auth_user_id = auth.uid()) AND (e.role = 'admin'::text)))));


--
-- Name: shifts allow anon insert shifts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "allow anon insert shifts" ON public.shifts FOR INSERT TO anon WITH CHECK (true);


--
-- Name: shifts allow anon shifts access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "allow anon shifts access" ON public.shifts TO anon USING (true) WITH CHECK (true);


--
-- Name: shifts allow anon update shifts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "allow anon update shifts" ON public.shifts FOR UPDATE TO anon USING (true) WITH CHECK (true);


--
-- Name: shifts anon delete shifts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon delete shifts" ON public.shifts FOR DELETE TO anon USING (true);


--
-- Name: shifts anon insert shifts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon insert shifts" ON public.shifts FOR INSERT TO anon WITH CHECK (true);


--
-- Name: shifts anon select shifts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon select shifts" ON public.shifts FOR SELECT TO anon USING (true);


--
-- Name: shifts anon update shifts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon update shifts" ON public.shifts FOR UPDATE TO anon USING (true) WITH CHECK (true);


--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: employees dev: employees select for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dev: employees select for anon" ON public.employees FOR SELECT TO anon USING (true);


--
-- Name: notifications dev: notifications select for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dev: notifications select for anon" ON public.notifications FOR SELECT TO anon USING (true);


--
-- Name: notifications dev_read_notifications_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dev_read_notifications_anon ON public.notifications FOR SELECT TO anon USING (true);


--
-- Name: absences employee_insert_own_absences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_insert_own_absences ON public.absences FOR INSERT TO authenticated WITH CHECK ((employee_id IN ( SELECT e.id
   FROM public.employees e
  WHERE (e.auth_user_id = auth.uid()))));



CREATE POLICY "employee_insert_own_shift_change" ON "public"."shift_change_requests" FOR INSERT TO "authenticated" WITH CHECK (("employee_id" IN ( SELECT "e"."id"
   FROM "public"."employees" "e"
  WHERE ("e"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "employee_insert_own_time_off" ON "public"."time_off_requests" FOR INSERT TO "authenticated" WITH CHECK (("employee_id" IN ( SELECT "e"."id"
   FROM "public"."employees" "e"
  WHERE ("e"."auth_user_id" = "auth"."uid"()))));



ALTER TABLE "public"."employee_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_select_employees" ON "public"."employees" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "employee_select_own_absences" ON "public"."absences" FOR SELECT TO "authenticated" USING (("employee_id" IN ( SELECT "e"."id"
   FROM "public"."employees" "e"
  WHERE ("e"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "employee_select_own_notifications" ON "public"."employee_notifications" FOR SELECT TO "authenticated" USING (("employee_id" IN ( SELECT "e"."id"
   FROM "public"."employees" "e"
  WHERE ("e"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "employee_select_own_shift_changes" ON "public"."shift_change_requests" FOR SELECT TO "authenticated" USING ((("employee_id" IN ( SELECT "e"."id"
   FROM "public"."employees" "e"
  WHERE ("e"."auth_user_id" = "auth"."uid"()))) OR ("target_employee_id" IN ( SELECT "e"."id"
   FROM "public"."employees" "e"
  WHERE ("e"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "employee_select_own_shifts" ON "public"."shifts" FOR SELECT TO "authenticated" USING (("employee_id" IN ( SELECT "e"."id"
   FROM "public"."employees" "e"
  WHERE ("e"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "employee_select_own_time_off" ON "public"."time_off_requests" FOR SELECT TO "authenticated" USING (("employee_id" IN ( SELECT "e"."id"
   FROM "public"."employees" "e"
  WHERE ("e"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "employee_select_self" ON "public"."employees" FOR SELECT TO "authenticated" USING (("auth_user_id" = "auth"."uid"()));



CREATE POLICY "employee_update_own_absences" ON "public"."absences" FOR UPDATE TO "authenticated" USING (("employee_id" IN ( SELECT "e"."id"
   FROM "public"."employees" "e"
  WHERE ("e"."auth_user_id" = "auth"."uid"())))) WITH CHECK (("employee_id" IN ( SELECT "e"."id"
   FROM "public"."employees" "e"
  WHERE ("e"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "employee_update_own_notifications" ON "public"."employee_notifications" FOR UPDATE TO "authenticated" USING (("employee_id" IN ( SELECT "e"."id"
   FROM "public"."employees" "e"
  WHERE ("e"."auth_user_id" = "auth"."uid"())))) WITH CHECK (("employee_id" IN ( SELECT "e"."id"
   FROM "public"."employees" "e"
  WHERE ("e"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "employee_update_own_shift_change" ON "public"."shift_change_requests" FOR UPDATE TO "authenticated" USING (("employee_id" IN ( SELECT "e"."id"
   FROM "public"."employees" "e"
  WHERE ("e"."auth_user_id" = "auth"."uid"())))) WITH CHECK (("employee_id" IN ( SELECT "e"."id"
   FROM "public"."employees" "e"
  WHERE ("e"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "employee_update_own_time_off" ON "public"."time_off_requests" FOR UPDATE TO "authenticated" USING (("employee_id" IN ( SELECT "e"."id"
   FROM "public"."employees" "e"
  WHERE ("e"."auth_user_id" = "auth"."uid"())))) WITH CHECK (("employee_id" IN ( SELECT "e"."id"
   FROM "public"."employees" "e"
  WHERE ("e"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "employee_update_self" ON "public"."employees" FOR UPDATE TO "authenticated" USING (("auth_user_id" = "auth"."uid"())) WITH CHECK (("auth_user_id" = "auth"."uid"()));



ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employees delete" ON "public"."employees" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "employees_select_auth" ON "public"."employees" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: employees employees delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "employees delete" ON public.employees FOR DELETE TO authenticated USING (true);


--
-- Name: employees employees_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_select_auth ON public.employees FOR SELECT TO authenticated USING (true);


--
-- Name: mail_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mail_jobs ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."time_periods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."buckets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."migrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."objects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."s3_multipart_uploads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."s3_multipart_uploads_parts" ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: notifications notifications select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications select" ON public.notifications FOR SELECT TO authenticated USING (true);


--
-- Name: notifications notifications update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications update" ON public.notifications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: notifications notifications_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select_auth ON public.notifications FOR SELECT TO authenticated USING (true);


--
-- Name: app_settings select_app_settings_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_app_settings_all ON public.app_settings FOR SELECT TO authenticated USING (true);


--
-- Name: time_periods select_time_periods_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_time_periods_all ON public.time_periods FOR SELECT TO authenticated USING (true);


--
-- Name: shift_change_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shift_change_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: shifts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

--
-- Name: shifts shifts_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shifts_select_auth ON public.shifts FOR SELECT TO authenticated USING (true);


--
-- Name: time_off_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.time_off_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: time_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.time_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime_messages_publication; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime_messages_publication WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime shifts; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.shifts;


--
-- Name: supabase_realtime_messages_publication messages; Type: PUBLICATION TABLE; Schema: realtime; Owner: -
--

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE ONLY realtime.messages;


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE FUNCTION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


--
-- PostgreSQL database dump complete
--

\unrestrict [REDACTED]


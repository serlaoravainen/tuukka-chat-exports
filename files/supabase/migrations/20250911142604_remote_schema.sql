create sequence "public"."debug_log_id_seq";

create sequence "public"."email_queue_id_seq";

create sequence "public"."email_send_log_id_seq";

drop trigger if exists "trg_absence_enqueue_job" on "public"."absences";

drop trigger if exists "trg_admin_new_absence" on "public"."absences";

drop trigger if exists "trg_employee_shift_deleted" on "public"."shifts";

drop policy "dev: employees select for anon" on "public"."employees";

drop policy "dev: notifications select for anon" on "public"."notifications";

drop policy "dev_read_notifications_anon" on "public"."notifications";

drop policy "allow anon insert shifts" on "public"."shifts";

drop policy "allow anon shifts access" on "public"."shifts";

drop policy "allow anon update shifts" on "public"."shifts";

drop policy "anon delete shifts" on "public"."shifts";

drop policy "anon insert shifts" on "public"."shifts";

drop policy "anon select shifts" on "public"."shifts";

drop policy "anon update shifts" on "public"."shifts";

revoke delete on table "public"."absences" from "anon";

revoke insert on table "public"."absences" from "anon";

revoke references on table "public"."absences" from "anon";

revoke trigger on table "public"."absences" from "anon";

revoke truncate on table "public"."absences" from "anon";

revoke update on table "public"."absences" from "anon";

revoke delete on table "public"."app_settings" from "anon";

revoke insert on table "public"."app_settings" from "anon";

revoke references on table "public"."app_settings" from "anon";

revoke select on table "public"."app_settings" from "anon";

revoke trigger on table "public"."app_settings" from "anon";

revoke truncate on table "public"."app_settings" from "anon";

revoke update on table "public"."app_settings" from "anon";

revoke delete on table "public"."app_settings" from "authenticated";

revoke insert on table "public"."app_settings" from "authenticated";

revoke references on table "public"."app_settings" from "authenticated";

revoke select on table "public"."app_settings" from "authenticated";

revoke trigger on table "public"."app_settings" from "authenticated";

revoke truncate on table "public"."app_settings" from "authenticated";

revoke update on table "public"."app_settings" from "authenticated";

revoke delete on table "public"."employees" from "anon";

revoke insert on table "public"."employees" from "anon";

revoke references on table "public"."employees" from "anon";

revoke trigger on table "public"."employees" from "anon";

revoke truncate on table "public"."employees" from "anon";

revoke update on table "public"."employees" from "anon";

revoke delete on table "public"."mail_jobs" from "anon";

revoke insert on table "public"."mail_jobs" from "anon";

revoke references on table "public"."mail_jobs" from "anon";

revoke select on table "public"."mail_jobs" from "anon";

revoke trigger on table "public"."mail_jobs" from "anon";

revoke truncate on table "public"."mail_jobs" from "anon";

revoke update on table "public"."mail_jobs" from "anon";

revoke delete on table "public"."mail_jobs" from "authenticated";

revoke insert on table "public"."mail_jobs" from "authenticated";

revoke references on table "public"."mail_jobs" from "authenticated";

revoke select on table "public"."mail_jobs" from "authenticated";

revoke trigger on table "public"."mail_jobs" from "authenticated";

revoke truncate on table "public"."mail_jobs" from "authenticated";

revoke update on table "public"."mail_jobs" from "authenticated";

revoke delete on table "public"."mail_jobs" from "service_role";

revoke insert on table "public"."mail_jobs" from "service_role";

revoke references on table "public"."mail_jobs" from "service_role";

revoke select on table "public"."mail_jobs" from "service_role";

revoke trigger on table "public"."mail_jobs" from "service_role";

revoke truncate on table "public"."mail_jobs" from "service_role";

revoke update on table "public"."mail_jobs" from "service_role";

revoke delete on table "public"."notifications" from "anon";

revoke insert on table "public"."notifications" from "anon";

revoke references on table "public"."notifications" from "anon";

revoke trigger on table "public"."notifications" from "anon";

revoke truncate on table "public"."notifications" from "anon";

revoke update on table "public"."notifications" from "anon";

revoke delete on table "public"."shifts" from "anon";

revoke insert on table "public"."shifts" from "anon";

revoke references on table "public"."shifts" from "anon";

revoke trigger on table "public"."shifts" from "anon";

revoke truncate on table "public"."shifts" from "anon";

revoke update on table "public"."shifts" from "anon";

alter table "public"."mail_jobs" drop constraint "mail_jobs_job_key_unique";

drop function if exists "public"."claim_employee_jobs"(p_employee_id text, p_since timestamp with time zone, p_types text[], p_limit integer);

drop function if exists "public"."claim_employee_jobs"(p_employee_id uuid, p_since timestamp with time zone, p_types text[], p_limit integer);

drop function if exists "public"."enqueue_admin_new_absence"();

drop function if exists "public"."enqueue_employee_shift_deleted"();

drop view if exists "public"."latest_publications_overview";

drop view if exists "public"."publication_jobs_debug";

drop function if exists "public"."publish_shifts"(_start_date date, _end_date date);

drop function if exists "public"."trg_absence_enqueue_job"();

drop function if exists "public"."unpublish_shifts"(_start_date date, _end_date date);

alter table "public"."mail_jobs" drop constraint "mail_jobs_pkey";

drop index if exists "public"."mail_jobs_emp_queued_idx";

drop index if exists "public"."mail_jobs_job_key_unique";

drop index if exists "public"."mail_jobs_pkey";

drop index if exists "public"."mail_jobs_queued_time_type_idx";

drop index if exists "public"."mail_jobs_status_idx";

drop index if exists "public"."mail_jobs_unique_key";

drop table "public"."mail_jobs";


  create table "public"."debug_log" (
    "id" bigint not null default nextval('debug_log_id_seq'::regclass),
    "context" text,
    "message" text,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."email_queue" (
    "id" bigint not null default nextval('email_queue_id_seq'::regclass),
    "recipient" text not null,
    "subject" text not null,
    "body" text not null,
    "status" text not null default 'queued'::text,
    "error" text,
    "created_at" timestamp with time zone not null default now(),
    "sent_at" timestamp with time zone
      );



  create table "public"."email_send_log" (
    "id" bigint not null default nextval('email_send_log_id_seq'::regclass),
    "pub_id" uuid not null,
    "email" text not null,
    "sent_at" timestamp with time zone default now()
      );


alter table "public"."shifts" alter column "minutes" drop default;

alter sequence "public"."debug_log_id_seq" owned by "public"."debug_log"."id";

alter sequence "public"."email_queue_id_seq" owned by "public"."email_queue"."id";

alter sequence "public"."email_send_log_id_seq" owned by "public"."email_send_log"."id";

CREATE UNIQUE INDEX debug_log_pkey ON public.debug_log USING btree (id);

CREATE UNIQUE INDEX email_queue_pkey ON public.email_queue USING btree (id);

CREATE UNIQUE INDEX email_send_log_pkey ON public.email_send_log USING btree (id);

CREATE INDEX idx_email_queue_status_created ON public.email_queue USING btree (status, created_at);

alter table "public"."debug_log" add constraint "debug_log_pkey" PRIMARY KEY using index "debug_log_pkey";

alter table "public"."email_queue" add constraint "email_queue_pkey" PRIMARY KEY using index "email_queue_pkey";

alter table "public"."email_send_log" add constraint "email_send_log_pkey" PRIMARY KEY using index "email_send_log_pkey";

alter table "public"."shifts" add constraint "minutes_positive" CHECK ((minutes > 0)) not valid;

alter table "public"."shifts" validate constraint "minutes_positive";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.delete_shifts_bulk(_emp uuid, _dates date[])
 RETURNS void
 LANGUAGE sql
AS $function$
  DELETE FROM public.shifts
  WHERE employee_id = _emp
    AND work_date = ANY(_dates);
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_zero_minutes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.minutes IS NULL OR NEW.minutes <= 0 THEN
    RAISE EXCEPTION 'Minutes must be > 0, got %', NEW.minutes;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.publish_shifts_debug(_start_date date, _end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  ts timestamp := now();
  pub_id uuid;
  emails text[];
  result jsonb;
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

  -- Lähetä emailit yhdellä POSTilla
  if emails is not null and array_length(emails,1) > 0 then
    select net.http_post(
      url := 'https://musrmpblsazxcrhwthtc.functions.supabase.co/sendemail',
      headers := jsonb_build_object(
        'Authorization','Bearer ' || 'TÄHÄN_SERVICE_ROLE_KEY',
        'Content-Type','application/json'
      ),
      body := jsonb_build_object(
        'to', to_jsonb(emails),
        'subject','Uudet vuorot julkaistu',
        'text','Sinulle on julkaistu uusia vuoroja. Tarkista työvuorosi sovelluksesta.'
      )
    ) into result;

    return jsonb_build_object('emails', emails, 'http_post', result);
  else
    return jsonb_build_object('emails','[]','error','no emails found');
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.publish_shifts_instant(_start_date date, _end_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.publish_shifts_instant_debug(_start_date date, _end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.save_shifts_bulk(_deletes jsonb, _upserts jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_shifts_bulk(_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
$function$
;

grant delete on table "public"."debug_log" to "anon";

grant insert on table "public"."debug_log" to "anon";

grant references on table "public"."debug_log" to "anon";

grant select on table "public"."debug_log" to "anon";

grant trigger on table "public"."debug_log" to "anon";

grant truncate on table "public"."debug_log" to "anon";

grant update on table "public"."debug_log" to "anon";

grant delete on table "public"."debug_log" to "authenticated";

grant insert on table "public"."debug_log" to "authenticated";

grant references on table "public"."debug_log" to "authenticated";

grant select on table "public"."debug_log" to "authenticated";

grant trigger on table "public"."debug_log" to "authenticated";

grant truncate on table "public"."debug_log" to "authenticated";

grant update on table "public"."debug_log" to "authenticated";

grant delete on table "public"."debug_log" to "service_role";

grant insert on table "public"."debug_log" to "service_role";

grant references on table "public"."debug_log" to "service_role";

grant select on table "public"."debug_log" to "service_role";

grant trigger on table "public"."debug_log" to "service_role";

grant truncate on table "public"."debug_log" to "service_role";

grant update on table "public"."debug_log" to "service_role";

grant delete on table "public"."email_queue" to "anon";

grant insert on table "public"."email_queue" to "anon";

grant references on table "public"."email_queue" to "anon";

grant select on table "public"."email_queue" to "anon";

grant trigger on table "public"."email_queue" to "anon";

grant truncate on table "public"."email_queue" to "anon";

grant update on table "public"."email_queue" to "anon";

grant delete on table "public"."email_queue" to "authenticated";

grant insert on table "public"."email_queue" to "authenticated";

grant references on table "public"."email_queue" to "authenticated";

grant select on table "public"."email_queue" to "authenticated";

grant trigger on table "public"."email_queue" to "authenticated";

grant truncate on table "public"."email_queue" to "authenticated";

grant update on table "public"."email_queue" to "authenticated";

grant delete on table "public"."email_queue" to "service_role";

grant insert on table "public"."email_queue" to "service_role";

grant references on table "public"."email_queue" to "service_role";

grant select on table "public"."email_queue" to "service_role";

grant trigger on table "public"."email_queue" to "service_role";

grant truncate on table "public"."email_queue" to "service_role";

grant update on table "public"."email_queue" to "service_role";

grant delete on table "public"."email_send_log" to "anon";

grant insert on table "public"."email_send_log" to "anon";

grant references on table "public"."email_send_log" to "anon";

grant select on table "public"."email_send_log" to "anon";

grant trigger on table "public"."email_send_log" to "anon";

grant truncate on table "public"."email_send_log" to "anon";

grant update on table "public"."email_send_log" to "anon";

grant delete on table "public"."email_send_log" to "authenticated";

grant insert on table "public"."email_send_log" to "authenticated";

grant references on table "public"."email_send_log" to "authenticated";

grant select on table "public"."email_send_log" to "authenticated";

grant trigger on table "public"."email_send_log" to "authenticated";

grant truncate on table "public"."email_send_log" to "authenticated";

grant update on table "public"."email_send_log" to "authenticated";

grant delete on table "public"."email_send_log" to "service_role";

grant insert on table "public"."email_send_log" to "service_role";

grant references on table "public"."email_send_log" to "service_role";

grant select on table "public"."email_send_log" to "service_role";

grant trigger on table "public"."email_send_log" to "service_role";

grant truncate on table "public"."email_send_log" to "service_role";

grant update on table "public"."email_send_log" to "service_role";


  create policy "admin_delete_shifts"
  on "public"."shifts"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.auth_user_id = auth.uid()) AND (e.role = 'admin'::text)))));


CREATE TRIGGER trg_prevent_zero_minutes BEFORE INSERT OR UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION prevent_zero_minutes();



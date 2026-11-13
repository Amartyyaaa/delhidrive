-- =====================================================================
-- DelhiDrive — Host Your Car
-- =====================================================================
-- Run this in Supabase → SQL Editor AFTER supabase-setup.sql. It is safe to
-- run again: every statement is idempotent.
--
-- It adds what the /host-your-car page and Admin → Host management need:
--
--   1. host_applications — one row per car a vendor offers: their details,
--                          the car, and references to the RC, insurance and
--                          6–8 car photos.
--   2. Security          — a vendor reads and files only their own
--                          applications and can never approve one. Only an
--                          admin decides, so a pending or rejected car is
--                          never visible to the public: it becomes a row in
--                          `fleet` — which the website and the app both read —
--                          only when an admin approves it.
--   3. hosts bucket      — private storage for those documents and photos.
--   4. Realtime          — a new application appears in the console, and a
--                          decision reaches the vendor's screen, live.
--   5. Telegram          — a "new host application" alert, if the Telegram
--                          alerts are already set up.
--
-- Depends on public.is_admin() from supabase-setup.sql.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------
-- Same shape as every other table: id + user_id + created_at + a jsonb `data`
-- column. `data` holds host{}, car{}, insurance{}, docs{}, photos[] and the
-- decision (status, reviewedAt, reviewedBy, rejectionReason, fleetId).
create table if not exists public.host_applications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists host_applications_user_id_idx on public.host_applications (user_id);
create index if not exists host_applications_created_idx on public.host_applications (created_at desc);

-- Projects that require explicit grants for new tables need these; on the
-- rest they change nothing. Visitors who are not signed in get no access.
grant select, insert, update, delete on public.host_applications to authenticated;
grant all on public.host_applications to service_role;


-- ---------------------------------------------------------------------
-- 2. Row level security
-- ---------------------------------------------------------------------
alter table public.host_applications enable row level security;

-- A vendor sees and files their own applications. There is deliberately no
-- update or delete policy for them: an application is a record of what was
-- submitted, and re-applying after a rejection files a new one.
drop policy if exists host_applications_read   on public.host_applications;
drop policy if exists host_applications_insert on public.host_applications;
drop policy if exists host_applications_admin  on public.host_applications;
create policy host_applications_read on public.host_applications for select
  using (public.is_admin() or auth.uid() = user_id);
create policy host_applications_insert on public.host_applications for insert
  with check (auth.uid() = user_id);
create policy host_applications_admin on public.host_applications for all
  using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------
-- 3. Vendors cannot approve their own car
-- ---------------------------------------------------------------------
-- A vendor's application always lands as "Pending", whatever the request
-- claims, and has to be a complete one: contact details, the car, the RC, the
-- insurance and 6–8 photos — all of them files in the vendor's own folder.
-- Admins, the service role and the SQL editor are not restricted.

-- Is this a reference to a file in this user's folder of the hosts bucket?
create or replace function public.dd_host_file_ok(ref text, owner uuid)
returns boolean
language sql
immutable
as $$
  select ref is not null and left(ref, 43) = 'hosts:' || owner::text || '/' and length(ref) between 44 and 300;
$$;

create or replace function public.host_applications_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plate text;
  photo_count int;
  clash_ref text;
begin
  if public.is_admin()
     or coalesce(auth.jwt() ->> 'role', 'postgres') not in ('anon', 'authenticated') then
    return new;
  end if;

  if length(new.data::text) > 20000 then
    raise exception 'This application is too large to save.' using errcode = 'P0001';
  end if;

  -- Who and which car.
  if coalesce(btrim(new.data #>> '{host,name}'), '') = ''
     or coalesce(new.data #>> '{host,phone}', '') !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter your name and a valid 10-digit mobile number.' using errcode = 'P0001';
  end if;

  plate := upper(regexp_replace(coalesce(new.data #>> '{car,plate}', ''), '[^A-Za-z0-9]', '', 'g'));
  if coalesce(btrim(new.data #>> '{car,brand}'), '') = ''
     or coalesce(btrim(new.data #>> '{car,model}'), '') = ''
     or length(plate) not between 6 and 11 then
    raise exception 'Enter the car''s brand, model and registration number.' using errcode = 'P0001';
  end if;

  -- The documents.
  if not public.dd_host_file_ok(new.data #>> '{docs,rc}', new.user_id)
     or not public.dd_host_file_ok(new.data #>> '{docs,insurance}', new.user_id)
     or (new.data #>> '{docs,rcBack}' is not null
         and not public.dd_host_file_ok(new.data #>> '{docs,rcBack}', new.user_id)) then
    raise exception 'Upload the RC and the insurance policy before submitting.' using errcode = 'P0001';
  end if;

  -- 6 to 8 photos of the car.
  if jsonb_typeof(new.data -> 'photos') is distinct from 'array' then
    raise exception 'Upload 6 to 8 photos of the car before submitting.' using errcode = 'P0001';
  end if;
  select count(*) into photo_count
  from jsonb_array_elements(new.data -> 'photos') p
  where public.dd_host_file_ok(p ->> 'ref', new.user_id);
  if photo_count <> jsonb_array_length(new.data -> 'photos') or photo_count not between 6 and 8 then
    raise exception 'Upload 6 to 8 photos of the car before submitting.' using errcode = 'P0001';
  end if;

  -- One live application per car. The lock makes a double tap on Submit wait
  -- for the first request, so the second one sees it.
  perform pg_advisory_xact_lock(hashtext('delhidrive-host:' || new.user_id::text));
  select h.data ->> 'ref' into clash_ref
  from public.host_applications h
  where h.user_id = new.user_id
    and h.data ->> 'status' in ('Pending', 'Approved')
    and upper(regexp_replace(coalesce(h.data #>> '{car,plate}', ''), '[^A-Za-z0-9]', '', 'g')) = plate
  limit 1;
  if found then
    raise exception 'You have already submitted this car (reference %). Check its status on this page.', clash_ref
      using errcode = 'P0001';
  end if;

  if (select count(*) from public.host_applications h
      where h.user_id = new.user_id and h.data ->> 'status' = 'Pending') >= 10 then
    raise exception 'You already have 10 cars waiting for review. Please wait for a decision on those first.'
      using errcode = 'P0001';
  end if;

  -- Every application starts in the review queue, with no decision on it.
  new.data := (new.data - 'reviewedAt' - 'reviewedBy' - 'rejectionReason' - 'fleetId' - 'listedAt' - 'delistedAt')
    || jsonb_build_object(
         'status', 'Pending',
         'submittedAt', floor(extract(epoch from now()) * 1000)::bigint
       );
  return new;
end;
$$;

drop trigger if exists host_applications_guard_trg on public.host_applications;
create trigger host_applications_guard_trg
  before insert or update on public.host_applications
  for each row execute function public.host_applications_guard();


-- ---------------------------------------------------------------------
-- 4. Realtime
-- ---------------------------------------------------------------------
do $$
begin
  execute 'alter publication supabase_realtime add table public.host_applications';
exception
  when duplicate_object then null;  -- already added, fine
end $$;


-- ---------------------------------------------------------------------
-- 5. Storage: the private "hosts" bucket
-- ---------------------------------------------------------------------
-- RC, insurance and the vendor's own car photos. Nothing here is public: the
-- photos an admin approves are copied into the public "fleet" bucket at that
-- point, and only those.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hosts', 'hosts', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- A vendor may add files under their own uid folder ("<uid>/HST…/rc-….jpg")
-- and look at them. They cannot replace or delete one, so what was reviewed is
-- what stays on record. Admins see and manage everything.
drop policy if exists hosts_obj_read   on storage.objects;
drop policy if exists hosts_obj_insert on storage.objects;
drop policy if exists hosts_obj_admin  on storage.objects;
create policy hosts_obj_read on storage.objects for select
  using (
    bucket_id = 'hosts'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );
create policy hosts_obj_insert on storage.objects for insert
  with check (
    bucket_id = 'hosts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy hosts_obj_admin on storage.objects for all
  using (bucket_id = 'hosts' and public.is_admin())
  with check (bucket_id = 'hosts' and public.is_admin());


-- ---------------------------------------------------------------------
-- 6. Telegram alert for a new application (only if alerts are set up)
-- ---------------------------------------------------------------------
-- Uses the trigger function from supabase/functions/notify-telegram/webhooks.sql.
-- Redeploy the notify-telegram function once so it knows how to word the
-- alert; until then it simply ignores these rows.
do $$
begin
  if to_regprocedure('public.notify_telegram_on_insert()') is not null then
    drop trigger if exists trg_telegram_host_applications on public.host_applications;
    create trigger trg_telegram_host_applications
      after insert on public.host_applications
      for each row execute function public.notify_telegram_on_insert();
  end if;
end $$;


-- =====================================================================
-- Check it worked:
--   select count(*) from public.host_applications;             -- 0 to begin with
--   select id, public from storage.buckets where id = 'hosts'; -- hosts | false
-- =====================================================================

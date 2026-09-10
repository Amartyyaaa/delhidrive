-- DelhiDrive — broadcasts
--
-- Run this ONCE in Supabase → SQL Editor, after supabase-setup.sql.
-- It is safe to run again: every statement is idempotent.
--
-- Two tables:
--   broadcasts       the message itself. Readable by everyone, writable only
--                    by admins.
--   broadcast_reads  one row per person per broadcast, written by the reader's
--                    own app when the message reaches their screen. This is
--                    what the "Seen by" figure in the ops console counts.
--
-- This depends on public.is_admin() from supabase-setup.sql.

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table if not exists public.broadcasts (
  id          uuid primary key default gen_random_uuid(),
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.broadcast_reads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Counting "seen by" scans reads for one broadcast, so index that lookup.
create index if not exists broadcast_reads_broadcast_idx
  on public.broadcast_reads ((data->>'broadcastId'));

-- ---------------------------------------------------------------------
-- 2. Row level security
-- ---------------------------------------------------------------------

alter table public.broadcasts      enable row level security;
alter table public.broadcast_reads enable row level security;

-- Broadcasts: anyone may read — including someone who is not signed in, since
-- an "All" audience is meant to reach them too. Only admins may write.
drop policy if exists broadcasts_read  on public.broadcasts;
drop policy if exists broadcasts_write on public.broadcasts;
create policy broadcasts_read  on public.broadcasts for select using (true);
create policy broadcasts_write on public.broadcasts for all
  using (public.is_admin()) with check (public.is_admin());

-- Reads: you may only ever record your OWN receipt, so nobody can inflate the
-- seen count. Admins may read them all, which is what the console counts.
drop policy if exists broadcast_reads_insert on public.broadcast_reads;
drop policy if exists broadcast_reads_read   on public.broadcast_reads;
drop policy if exists broadcast_reads_admin  on public.broadcast_reads;
create policy broadcast_reads_insert on public.broadcast_reads for insert
  with check (auth.uid() = user_id);
create policy broadcast_reads_read on public.broadcast_reads for select
  using (public.is_admin() or auth.uid() = user_id);
create policy broadcast_reads_admin on public.broadcast_reads for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. Realtime — this is what makes a broadcast land without a refresh
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['broadcasts','broadcast_reads']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;  -- already added, fine
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Check it worked
-- ---------------------------------------------------------------------
-- select tablename from pg_publication_tables
--   where pubname = 'supabase_realtime' and tablename like 'broadcast%';
--
-- Expect two rows. If either is missing, realtime is off for it and
-- broadcasts will only appear when someone reopens the app.

-- DelhiDrive — fire the Telegram alert from the database itself.
--
-- Run this in the Supabase SQL Editor AFTER deploying the notify-telegram
-- function. Two things to replace first:
--   joobrzcchmgwixcdmozi  → joobrzcchmgwixcdmozi
--   sb_publishable__Ud4J2x3xxRNOVaFQ7Gs7A_AJR_X-6p     → your publishable / anon key (Settings > API Keys)
--
-- The anon key is only used so the function accepts the call; the bot token
-- itself never appears here and stays in Supabase's secret store.

-- pg_net lets Postgres make outbound HTTP calls. Safe to run if already on.
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------
-- New rows: one shared trigger function for all three tables
-- ---------------------------------------------------------------------
create or replace function public.notify_telegram_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url     := 'https://joobrzcchmgwixcdmozi.supabase.co/functions/v1/notify-telegram',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer sb_publishable__Ud4J2x3xxRNOVaFQ7Gs7A_AJR_X-6p'
               ),
    body    := jsonb_build_object(
                 'type',   'INSERT',
                 'table',  TG_TABLE_NAME,
                 'record', to_jsonb(NEW)
               )
  );
  -- Never let a messaging problem roll back the customer's booking.
  return NEW;
exception when others then
  raise warning 'notify_telegram_on_insert failed: %', sqlerrm;
  return NEW;
end;
$$;

-- ---------------------------------------------------------------------
-- Attach it
-- ---------------------------------------------------------------------
drop trigger if exists trg_telegram_bookings on public.bookings;
create trigger trg_telegram_bookings
  after insert on public.bookings
  for each row execute function public.notify_telegram_on_insert();

drop trigger if exists trg_telegram_kyc on public.kyc;
create trigger trg_telegram_kyc
  after insert on public.kyc
  for each row execute function public.notify_telegram_on_insert();

-- The app writes subscriptions to this table; create it if the website's
-- setup script predates that feature.
create table if not exists public.subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  data       jsonb not null default '{}'::jsonb
);
alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_read   on public.subscriptions;
drop policy if exists subscriptions_insert on public.subscriptions;
drop policy if exists subscriptions_update on public.subscriptions;
drop policy if exists subscriptions_admin  on public.subscriptions;
create policy subscriptions_read on public.subscriptions for select
  using (public.is_admin() or auth.uid() = user_id);
create policy subscriptions_insert on public.subscriptions for insert
  with check (auth.uid() = user_id);
create policy subscriptions_update on public.subscriptions for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy subscriptions_admin on public.subscriptions for all
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists trg_telegram_subscriptions on public.subscriptions;
create trigger trg_telegram_subscriptions
  after insert on public.subscriptions
  for each row execute function public.notify_telegram_on_insert();

-- ---------------------------------------------------------------------
-- Booking changes and KYC re-submissions
-- ---------------------------------------------------------------------
-- Fires only when something worth an alert changed: a booking's status,
-- payment, car or dates, or a KYC going back to review after a rejection.
-- Photos and documents are left out of the payload; no alert needs them.
create or replace function public.notify_telegram_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_TABLE_NAME = 'bookings' and not (
       (NEW.data ->> 'status')        is distinct from (OLD.data ->> 'status')
    or (NEW.data ->> 'paymentStatus') is distinct from (OLD.data ->> 'paymentStatus')
    or (NEW.data ->> 'carId')         is distinct from (OLD.data ->> 'carId')
    or (NEW.data ->> 'pickupMs')      is distinct from (OLD.data ->> 'pickupMs')
    or (NEW.data ->> 'returnMs')      is distinct from (OLD.data ->> 'returnMs')
  ) then
    return NEW;
  end if;

  if TG_TABLE_NAME = 'kyc' and not (
       NEW.data ->> 'status' = 'Pending Review'
       and (OLD.data ->> 'status') is distinct from 'Pending Review'
  ) then
    return NEW;
  end if;

  perform net.http_post(
    url     := 'https://joobrzcchmgwixcdmozi.supabase.co/functions/v1/notify-telegram',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer sb_publishable__Ud4J2x3xxRNOVaFQ7Gs7A_AJR_X-6p'
               ),
    body    := jsonb_build_object(
                 'type',       'UPDATE',
                 'table',      TG_TABLE_NAME,
                 'record',     to_jsonb(NEW) #- '{data,inspections}' #- '{data,verification}'
                                             #- '{data,licence}' #- '{data,aadhaar}',
                 'old_record', to_jsonb(OLD) #- '{data,inspections}' #- '{data,verification}'
                                             #- '{data,licence}' #- '{data,aadhaar}'
               )
  );
  -- Never let a messaging problem roll back the change itself.
  return NEW;
exception when others then
  raise warning 'notify_telegram_on_update failed: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_telegram_bookings_update on public.bookings;
create trigger trg_telegram_bookings_update
  after update on public.bookings
  for each row execute function public.notify_telegram_on_update();

drop trigger if exists trg_telegram_kyc_update on public.kyc;
create trigger trg_telegram_kyc_update
  after update on public.kyc
  for each row execute function public.notify_telegram_on_update();

-- ---------------------------------------------------------------------
-- Overdue cars — checked every 15 minutes
-- ---------------------------------------------------------------------
-- Alerts once for each car past its return time that nobody has marked
-- received. Needs the pg_cron extension: if the next line errors, switch it
-- on under Database → Extensions (search "pg_cron") and run this file again.
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('delhidrive-overdue-cars');
exception when others then
  null;  -- not scheduled yet
end $$;

select cron.schedule(
  'delhidrive-overdue-cars',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url     := 'https://joobrzcchmgwixcdmozi.supabase.co/functions/v1/notify-telegram',
    headers := jsonb_build_object('Content-Type',  'application/json',
                                  'Authorization', 'Bearer sb_publishable__Ud4J2x3xxRNOVaFQ7Gs7A_AJR_X-6p'),
    body    := '{"overdue": true}'::jsonb
  );
  $job$
);

-- ---------------------------------------------------------------------
-- Check it worked: this should send a real alert to your Telegram.
-- ---------------------------------------------------------------------
-- select net.http_post(
--   url     := 'https://joobrzcchmgwixcdmozi.supabase.co/functions/v1/notify-telegram',
--   headers := jsonb_build_object('Content-Type','application/json',
--                                 'Authorization','Bearer sb_publishable__Ud4J2x3xxRNOVaFQ7Gs7A_AJR_X-6p'),
--   body    := '{"test": true}'::jsonb
-- );

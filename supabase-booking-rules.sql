-- =====================================================================
-- DelhiDrive — booking rules
-- =====================================================================
-- Run this in Supabase → SQL Editor AFTER supabase-setup.sql. It is safe to
-- run again: every statement is idempotent.
--
-- These rules live in the database so they hold for the website AND the app,
-- whichever one writes the booking:
--
--   1. car_busy_slots()  — which cars are taken when, so both can show a car
--                          as sold out on dates it is already booked. Returns
--                          car + times only, never who booked.
--   2. No double booking — a customer cannot book a car that is already
--                          booked over any part of the same window.
--   3. KYC before confirm — a booking from a renter whose KYC is not verified
--                          is held "Under review" instead of "Confirmed",
--                          and a customer cannot confirm their own booking.
--   4. Payment fields     — only the razorpay function (or an admin) can mark
--                          a payment verified, and a customer cannot rewrite
--                          the fare after booking.
--   5. Settings           — the 12-hour minimum rental and the 5-seater /
--                          7-seater late-return rates.
--   6. subscriptions      — the table the app writes customer subscriptions
--                          to, so the console's Subscriptions tab can edit them.
--   7. KYC submissions    — a customer can re-submit after a rejection (the
--                          older guard froze them out), and the Telegram bot's
--                          "KYC verified" on accept now actually sticks.
--
-- Depends on public.is_admin() from supabase-setup.sql.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Milliseconds from a jsonb text value, or null when it is not a number.
create or replace function public.dd_ms(v text)
returns bigint
language sql
immutable
as $$
  select case when v ~ '^\d{1,16}(\.\d+)?$' then floor(v::numeric)::bigint end;
$$;

-- Does this booking keep its car off the market? Mirrors holdsCar() in
-- src/lib/availability.js: cancelled and rejected bookings free the car, and
-- an online booking left unpaid for 30 minutes stops holding it.
create or replace function public.dd_booking_holds_car(d jsonb, created timestamptz)
returns boolean
language sql
stable
as $$
  select coalesce(d ->> 'status', '') not in ('Cancelled', 'Rejected')
     and public.dd_ms(d ->> 'pickupMs') is not null
     and public.dd_ms(d ->> 'returnMs') is not null
     and not (
       coalesce(d ->> 'paymentStatus', '') = 'Awaiting payment'
       and created < now() - interval '30 minutes'
     );
$$;

-- When the car is free again: when it came back, else when it is due back.
create or replace function public.dd_booking_end(d jsonb)
returns bigint
language sql
immutable
as $$
  select coalesce(public.dd_ms(d ->> 'returnedAt'), public.dd_ms(d ->> 'returnMs'));
$$;

-- Put back a key exactly as it was on the old row (or remove it if it was absent).
create or replace function public.dd_keep(newd jsonb, oldd jsonb, k text)
returns jsonb
language sql
immutable
as $$
  select case when oldd ? k then jsonb_set(newd, array[k], oldd -> k) else newd - k end;
$$;

create index if not exists bookings_car_idx on public.bookings ((data ->> 'carId'));


-- ---------------------------------------------------------------------
-- 1. Busy windows for the "sold out" display
-- ---------------------------------------------------------------------
create or replace function public.car_busy_slots()
returns table (booking_id uuid, car_id text, pickup_ms bigint, return_ms bigint)
language sql
stable
security definer
set search_path = public
as $$
  select b.id,
         b.data ->> 'carId',
         public.dd_ms(b.data ->> 'pickupMs'),
         public.dd_booking_end(b.data)
  from public.bookings b
  where public.dd_booking_holds_car(b.data, b.created_at)
    -- Anything that ended more than a day ago cannot clash with a new booking.
    and public.dd_booking_end(b.data) > (extract(epoch from now()) * 1000)::bigint - 86400000;
$$;

revoke all on function public.car_busy_slots() from public;
grant execute on function public.car_busy_slots() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 2–4. The booking guard
-- ---------------------------------------------------------------------
create or replace function public.bookings_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kyc_status text;
  car text;
  new_start bigint;
  new_end bigint;
  clash_ref text;
begin
  -- Admins, the Telegram bot and the payment function (service role), and the
  -- SQL editor itself are trusted. Only customers' own writes are checked.
  if public.is_admin()
     or coalesce(auth.jwt() ->> 'role', 'postgres') not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- The booking's KYC flag always reflects the renter's real KYC record.
    select k.data ->> 'status' into kyc_status
    from public.kyc k
    where k.user_id = new.user_id
    limit 1;

    new.data := jsonb_set(new.data, '{kycStatus}', to_jsonb(coalesce(kyc_status, 'Not submitted')));

    -- 3. Not verified yet: the booking waits for operations instead.
    if coalesce(new.data ->> 'status', '') = 'Confirmed' and coalesce(kyc_status, '') <> 'Verified' then
      new.data := jsonb_set(new.data, '{status}', '"Under review"');
    end if;

    -- 4. Proof of payment is written by the payment function, never the customer.
    new.data := new.data - 'paymentVerified' - 'razorpay';

    -- 2. No double booking. The lock makes two customers racing for the same
    --    car wait for each other, so the second one sees the first booking.
    car := new.data ->> 'carId';
    new_start := public.dd_ms(new.data ->> 'pickupMs');
    new_end := public.dd_booking_end(new.data);
    if car is not null and new_start is not null and new_end is not null
       and public.dd_booking_holds_car(new.data, now()) then
      perform pg_advisory_xact_lock(hashtext('delhidrive-car:' || car));
      select b.data ->> 'ref' into clash_ref
      from public.bookings b
      where b.data ->> 'carId' = car
        and public.dd_booking_holds_car(b.data, b.created_at)
        and public.dd_ms(b.data ->> 'pickupMs') < new_end
        and public.dd_booking_end(b.data) > new_start
      limit 1;
      if found then
        raise exception 'Sorry — this car is already booked for those dates. Pick other dates or another car.'
          using errcode = 'P0001';
      end if;
    end if;

    return new;
  end if;

  -- UPDATE by a customer on their own booking.
  -- 3. They may cancel, but not confirm.
  if new.data ->> 'status' = 'Confirmed'
     and (old.data ->> 'status') is distinct from 'Confirmed' then
    new.data := public.dd_keep(new.data, old.data, 'status');
  end if;
  -- 3–4. KYC flag, payment proof and the agreed fare stay as they were.
  new.data := public.dd_keep(new.data, old.data, 'kycStatus');
  new.data := public.dd_keep(new.data, old.data, 'paymentVerified');
  new.data := public.dd_keep(new.data, old.data, 'razorpay');
  new.data := public.dd_keep(new.data, old.data, 'quote');
  return new;
end;
$$;

drop trigger if exists bookings_guard_trg on public.bookings;
create trigger bookings_guard_trg
  before insert or update on public.bookings
  for each row execute function public.bookings_guard();


-- ---------------------------------------------------------------------
-- 5. Settings: 12-hour minimum and seat-based late-return rates
-- ---------------------------------------------------------------------
-- Keeps every other setting. An earlier single late rate becomes the
-- 5-seater rate; 7-seaters start at ₹500/hour (change it in Admin > Settings).
insert into public.settings (id, data)
values ('platform', '{"minRentalHours": 12, "latePenalty5Seater": 350, "latePenalty7Seater": 500}'::jsonb)
on conflict (id) do update
set data = public.settings.data
  || jsonb_build_object(
       'minRentalHours',
       greatest(12, coalesce(public.dd_ms(public.settings.data ->> 'minRentalHours'), 0)),
       'latePenalty5Seater',
       coalesce(public.settings.data -> 'latePenalty5Seater', public.settings.data -> 'latePenaltyPerHour', '350'::jsonb),
       'latePenalty7Seater',
       coalesce(public.settings.data -> 'latePenalty7Seater', '500'::jsonb)
     );


-- ---------------------------------------------------------------------
-- 6. Customer subscriptions (same definition as notify-telegram/webhooks.sql)
-- ---------------------------------------------------------------------
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

do $$
begin
  execute 'alter publication supabase_realtime add table public.subscriptions';
exception
  when duplicate_object then null;  -- already added, fine
end $$;


-- ---------------------------------------------------------------------
-- 7. KYC submissions (same definition as section 5 of supabase-setup.sql)
-- ---------------------------------------------------------------------
-- Booking now needs submitted KYC, so a customer whose documents were rejected
-- must be able to upload them again. They still can never verify themselves.
create or replace function public.kyc_guard_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admins, the Telegram bot (service role) and the SQL editor decide.
  if public.is_admin()
     or coalesce(auth.jwt() ->> 'role', 'postgres') not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A first submission always starts in the review queue.
    new.data := jsonb_set(new.data, '{status}', '"Pending Review"');
  elsif (new.data ->> 'status') is distinct from (old.data ->> 'status')
        and (new.data ->> 'status') is distinct from 'Pending Review' then
    -- Re-submitting puts the documents back in the queue; nothing else changes the status.
    new.data := jsonb_set(new.data, '{status}', to_jsonb(coalesce(old.data ->> 'status', 'Pending Review')));
  elsif old.data ->> 'status' = 'Verified'
        and (new.data -> 'licence', new.data -> 'aadhaar', new.data ->> 'licenceNo', new.data ->> 'aadhaarNo')
            is distinct from
            (old.data -> 'licence', old.data -> 'aadhaar', old.data ->> 'licenceNo', old.data ->> 'aadhaarNo') then
    -- New documents need checking again.
    new.data := jsonb_set(new.data, '{status}', '"Pending Review"');
  end if;
  return new;
end;
$$;

drop trigger if exists kyc_guard_status_trg on public.kyc;
create trigger kyc_guard_status_trg
  before insert or update on public.kyc
  for each row execute function public.kyc_guard_status();


-- =====================================================================
-- Check it worked:
--   select * from public.car_busy_slots();        -- one row per live booking
--   select data from public.settings where id = 'platform';
-- =====================================================================

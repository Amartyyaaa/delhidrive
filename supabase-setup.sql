-- =====================================================================
-- DelhiDrive — Supabase setup
-- =====================================================================
-- HOW TO RUN THIS
--   1. Open your project at https://supabase.com
--   2. Left sidebar -> SQL Editor -> New query
--   3. Paste this ENTIRE file and click "Run"
--
-- It is safe to run more than once — everything below is idempotent.
--
-- BEFORE YOU RUN: change the admin email on the marked line near the top
-- of the is_admin() function to your own, and make sure it matches
-- VITE_ADMIN_EMAILS in your .env file.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Who counts as an admin
-- ---------------------------------------------------------------------
-- Reads the signed-in user's email straight out of their JWT.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    lower(coalesce(
      auth.jwt() ->> 'email',
      auth.jwt() -> 'user_metadata' ->> 'email'
    )) = any (array[
      -- >>> CHANGE THIS to your own admin email(s) <<<
      'amartyaprakash06@gmail.com'
    ]),
    false
  );
$$;


-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------
-- Shape: id + (user_id) + created_at + a jsonb `data` column holding the
-- rest of the record. Row Level Security keys off the real columns; the
-- app keeps its nested shapes (quote, addons, inspections…) inside data.

-- Public catalogue: vehicles
create table if not exists public.fleet (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Public catalogue: promo codes
create table if not exists public.coupons (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Platform settings (a single row with id = 'platform')
create table if not exists public.settings (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Customer profiles, keyed by auth user id
create table if not exists public.users (
  id          text primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Reservations
create table if not exists public.bookings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Support tickets
create table if not exists public.tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- KYC submissions, one row per customer (id = the auth user id)
create table if not exists public.kyc (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists bookings_user_id_idx on public.bookings (user_id);
create index if not exists tickets_user_id_idx  on public.tickets  (user_id);
create index if not exists kyc_user_id_idx      on public.kyc      (user_id);
create index if not exists bookings_created_idx on public.bookings (created_at desc);


-- ---------------------------------------------------------------------
-- 3. Turn on Row Level Security
-- ---------------------------------------------------------------------
-- With RLS on and no policy, a table is completely closed. The policies
-- below are what open up exactly the right access.

alter table public.fleet    enable row level security;
alter table public.coupons  enable row level security;
alter table public.settings enable row level security;
alter table public.users    enable row level security;
alter table public.bookings enable row level security;
alter table public.tickets  enable row level security;
alter table public.kyc      enable row level security;


-- ---------------------------------------------------------------------
-- 4. Policies
-- ---------------------------------------------------------------------

-- --- Fleet: anyone may browse; only admins may change ---
drop policy if exists fleet_read   on public.fleet;
drop policy if exists fleet_write  on public.fleet;
create policy fleet_read  on public.fleet for select using (true);
create policy fleet_write on public.fleet for all
  using (public.is_admin()) with check (public.is_admin());

-- --- Coupons: same as fleet ---
drop policy if exists coupons_read  on public.coupons;
drop policy if exists coupons_write on public.coupons;
create policy coupons_read  on public.coupons for select using (true);
create policy coupons_write on public.coupons for all
  using (public.is_admin()) with check (public.is_admin());

-- --- Settings: same as fleet ---
drop policy if exists settings_read  on public.settings;
drop policy if exists settings_write on public.settings;
create policy settings_read  on public.settings for select using (true);
create policy settings_write on public.settings for all
  using (public.is_admin()) with check (public.is_admin());

-- --- Users: you see your own profile, admin sees everyone ---
drop policy if exists users_read   on public.users;
drop policy if exists users_write  on public.users;
drop policy if exists users_admin  on public.users;
create policy users_read on public.users for select
  using (public.is_admin() or auth.uid() = user_id);
create policy users_write on public.users for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy users_admin on public.users for all
  using (public.is_admin()) with check (public.is_admin());

-- --- Bookings: a customer sees and edits only their own ---
drop policy if exists bookings_read   on public.bookings;
drop policy if exists bookings_insert on public.bookings;
drop policy if exists bookings_update on public.bookings;
drop policy if exists bookings_admin  on public.bookings;
create policy bookings_read on public.bookings for select
  using (public.is_admin() or auth.uid() = user_id);
create policy bookings_insert on public.bookings for insert
  with check (auth.uid() = user_id);
create policy bookings_update on public.bookings for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy bookings_admin on public.bookings for all
  using (public.is_admin()) with check (public.is_admin());

-- --- Tickets: same ownership model ---
drop policy if exists tickets_read   on public.tickets;
drop policy if exists tickets_insert on public.tickets;
drop policy if exists tickets_update on public.tickets;
drop policy if exists tickets_admin  on public.tickets;
create policy tickets_read on public.tickets for select
  using (public.is_admin() or auth.uid() = user_id);
create policy tickets_insert on public.tickets for insert
  with check (auth.uid() = user_id);
create policy tickets_update on public.tickets for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tickets_admin on public.tickets for all
  using (public.is_admin()) with check (public.is_admin());

-- --- KYC: customer may upload and re-upload, admin may do anything ---
drop policy if exists kyc_read   on public.kyc;
drop policy if exists kyc_insert on public.kyc;
drop policy if exists kyc_update on public.kyc;
drop policy if exists kyc_admin  on public.kyc;
create policy kyc_read on public.kyc for select
  using (public.is_admin() or auth.uid() = user_id);
create policy kyc_insert on public.kyc for insert
  with check (auth.uid() = user_id);
create policy kyc_update on public.kyc for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy kyc_admin on public.kyc for all
  using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------
-- 5. Customers cannot approve their own KYC
-- ---------------------------------------------------------------------
-- A policy alone cannot compare the old row to the new one, so a trigger
-- does it: if a non-admin tries to change the verification status, the
-- old status is silently kept.

create or replace function public.kyc_guard_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if (new.data ->> 'status') is distinct from (old.data ->> 'status') then
      new.data = jsonb_set(
        new.data,
        '{status}',
        to_jsonb(coalesce(old.data ->> 'status', 'Pending Review'))
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists kyc_guard_status_trg on public.kyc;
create trigger kyc_guard_status_trg
  before update on public.kyc
  for each row execute function public.kyc_guard_status();


-- ---------------------------------------------------------------------
-- 6. Realtime — so screens update live across devices
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['fleet','coupons','settings','bookings','tickets','kyc','users']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;  -- already added, fine
    end;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 7. Storage buckets
-- ---------------------------------------------------------------------
-- "kyc"   private — licences, Aadhaar cards, damage inspection photos
-- "fleet" public  — vehicle photography shown in the catalogue

insert into storage.buckets (id, name, public)
values ('kyc', 'kyc', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('fleet', 'fleet', true)
on conflict (id) do nothing;

-- Private bucket: a customer may only touch files under their own uid
-- folder (paths look like "<uid>/licence-123.png"). Admins see all.
drop policy if exists kyc_obj_read   on storage.objects;
drop policy if exists kyc_obj_write  on storage.objects;
drop policy if exists kyc_obj_update on storage.objects;
create policy kyc_obj_read on storage.objects for select
  using (
    bucket_id = 'kyc'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );
create policy kyc_obj_write on storage.objects for insert
  with check (
    bucket_id = 'kyc'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy kyc_obj_update on storage.objects for update
  using (
    bucket_id = 'kyc'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- Public bucket: anyone may look, only admins may upload.
drop policy if exists fleet_obj_read  on storage.objects;
drop policy if exists fleet_obj_write on storage.objects;
create policy fleet_obj_read on storage.objects for select
  using (bucket_id = 'fleet');
create policy fleet_obj_write on storage.objects for all
  using (bucket_id = 'fleet' and public.is_admin())
  with check (bucket_id = 'fleet' and public.is_admin());


-- =====================================================================
-- Done.
--
-- Next steps back in the app:
--   1. Fill in .env with your Project URL and anon key
--   2. npm run dev
--   3. The header badge should read "Supabase live"
--   4. Sign up as your admin email, then open /admin
--
-- The 14 seed cars and 3 promo codes write themselves the first time an
-- admin loads the app.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 8. Seed data — the live 23-vehicle fleet and 3 promo codes
-- ---------------------------------------------------------------------
-- Real vehicles, prices and photos. Re-running leaves any edits you made
-- in Admin > Fleet Inventory untouched.

insert into public.fleet (id, data) values
  ('dd-maruti-suzuki-celerio', '{"name":"Maruti Suzuki Celerio","brand":"Maruti Suzuki","category":"Hatchback","transmission":"Manual","fuel":"Petrol","seats":5,"mileage":26.7,"rate":1499,"rate6h":600,"rate12h":900,"extraKmCharge":10,"engineCc":998,"bootLitres":313,"deposit":3000,"plate":"DL 1C AB 1000","hub":"station","colorHex":"#c0392b","terrain":["City"],"zeroDep":false,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/maruti-suzuki-celerio.jpg","features":["AMT-smooth city drive","Compact and easy to park","Bluetooth audio","Best-in-class mileage"],"reviews":[]}'::jsonb),
  ('dd-maruti-suzuki-wagonr', '{"name":"Maruti suzuki WagonR","brand":"Maruti Suzuki","category":"Hatchback","transmission":"Manual","fuel":"Petrol","seats":5,"mileage":25.2,"rate":1499,"rate6h":600,"rate12h":900,"extraKmCharge":10,"engineCc":998,"bootLitres":341,"deposit":3000,"plate":"DL 2C BE 1137","hub":"airport","colorHex":"#2980b9","terrain":["City"],"zeroDep":false,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/maruti-suzuki-wagonr.jpg","features":["Tall-boy cabin, easy entry","Great visibility in traffic","Bluetooth audio","Very low running cost"],"reviews":[]}'::jsonb),
  ('dd-maruti-suzuki-swift', '{"name":"Maruti Suzuki Swift","brand":"Maruti Suzuki","category":"Hatchback","transmission":"Manual","fuel":"Petrol","seats":5,"mileage":22.4,"rate":1699,"rate6h":680,"rate12h":1020,"extraKmCharge":10,"engineCc":1197,"bootLitres":265,"deposit":3000,"plate":"DL 3C CH 1274","hub":"airport","colorHex":"#c0392b","terrain":["City","Highway"],"zeroDep":false,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/maruti-suzuki-swift.jpg","features":["Peppy 1.2 petrol","Touchscreen + Android Auto","Rear parking sensors","Fun to drive"],"reviews":[]}'::jsonb),
  ('dd-hyundai-aura', '{"name":"Hyundai Aura","brand":"Hyundai","category":"Sedan","transmission":"Manual","fuel":"Petrol","seats":5,"mileage":20.5,"rate":1897,"rate6h":760,"rate12h":1140,"extraKmCharge":10,"engineCc":1197,"bootLitres":402,"deposit":3000,"plate":"DL 4C DK 1411","hub":"station","colorHex":"#ecf0f1","terrain":["City","Highway"],"zeroDep":false,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/hyundai-aura.jpg","features":["402 L boot","Wireless charging","Rear AC vents","Cruise control"],"reviews":[]}'::jsonb),
  ('dd-toyota-glanza', '{"name":"Toyota Glanza","brand":"Toyota","category":"Hatchback","transmission":"Manual","fuel":"Petrol","seats":5,"mileage":22.9,"rate":1899,"rate6h":760,"rate12h":1140,"extraKmCharge":10,"engineCc":1197,"bootLitres":318,"deposit":3000,"plate":"DL 5C EN 1548","hub":"station","colorHex":"#34495e","terrain":["City","Highway"],"zeroDep":false,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/toyota-glanza.jpg","features":["Toyota reliability","Touchscreen + Android Auto","Rear camera","Excellent mileage"],"reviews":[]}'::jsonb),
  ('dd-maruti-suzuki-baleno', '{"name":"Maruti Suzuki Baleno","brand":"Maruti Suzuki","category":"Hatchback","transmission":"Manual","fuel":"Petrol","seats":5,"mileage":22.3,"rate":1899,"rate6h":760,"rate12h":1140,"extraKmCharge":10,"engineCc":1197,"bootLitres":318,"deposit":3000,"plate":"DL 6C FQ 1685","hub":"airport","colorHex":"#2c3e50","terrain":["City","Highway"],"zeroDep":false,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/maruti-suzuki-baleno.jpg","features":["Roomy cabin","HeadUp display","360 camera","6 airbags"],"reviews":[]}'::jsonb),
  ('dd-honda-amaze', '{"name":"Honda Amaze","brand":"Honda","category":"Sedan","transmission":"Manual","fuel":"Diesel","seats":5,"mileage":24.7,"rate":1999,"rate6h":800,"rate12h":1200,"extraKmCharge":10,"engineCc":1498,"bootLitres":420,"deposit":3000,"plate":"DL 7C GT 1822","hub":"airport","colorHex":"#7f8c8d","terrain":["City","Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/honda-amaze.jpg","features":["Diesel torque","420 L boot","Cruise control","Superb highway economy"],"reviews":[]}'::jsonb),
  ('dd-tata-punch', '{"name":"Tata Punch","brand":"Tata Motors","category":"Hatchback","transmission":"Manual","fuel":"Petrol","seats":5,"mileage":20.1,"rate":1999,"rate6h":800,"rate12h":1200,"extraKmCharge":10,"engineCc":1199,"bootLitres":366,"deposit":3000,"plate":"DL 8C HW 1959","hub":"station","colorHex":"#d35400","terrain":["City"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/tata-punch.jpg","features":["5-star GNCAP safety","High ground clearance","Touchscreen","SUV stance"],"reviews":[]}'::jsonb),
  ('dd-maruti-suzuki-dzire', '{"name":"Maruti Suzuki Dzire","brand":"Maruti Suzuki","category":"Sedan","transmission":"Manual","fuel":"Petrol","seats":5,"mileage":24.1,"rate":1999,"rate6h":800,"rate12h":1200,"extraKmCharge":10,"engineCc":1197,"bootLitres":378,"deposit":3000,"plate":"DL 9C IZ 2096","hub":"station","colorHex":"#ecf0f1","terrain":["City","Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/maruti-suzuki-dzire.jpg","features":["Roomy rear seat","378 L boot","Rear AC vents","Very economical"],"reviews":[]}'::jsonb),
  ('dd-tata-punch-facelift-2026', '{"name":"Tata punch Facelift 2026","brand":"Tata Motors","category":"Hatchback","transmission":"Automatic","fuel":"CNG","seats":5,"mileage":26.9,"rate":2199,"rate6h":880,"rate12h":1320,"extraKmCharge":10,"engineCc":1199,"bootLitres":210,"deposit":4000,"plate":"DL 1C JD 2233","hub":"airport","colorHex":"#16a085","terrain":["City"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/tata-punch-facelift-2026.jpg","features":["CNG - lowest running cost","Automatic gearbox","5-star safety","2026 facelift"],"reviews":[]}'::jsonb),
  ('dd-maruti-suzuki-fronx', '{"name":"Maruti Suzuki Fronx","brand":"Maruti Suzuki","category":"SUV","transmission":"Manual","fuel":"Petrol","seats":5,"mileage":21.8,"rate":2199,"rate6h":880,"rate12h":1320,"extraKmCharge":10,"engineCc":1197,"bootLitres":308,"deposit":4000,"plate":"DL 2C KG 2370","hub":"airport","colorHex":"#2980b9","terrain":["City","Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/maruti-suzuki-fronx.jpg","features":["Coupe-SUV styling","360 camera","HeadUp display","Wireless CarPlay"],"reviews":[]}'::jsonb),
  ('dd-hyundai-venue-s', '{"name":"Hyundai venue S+","brand":"Hyundai","category":"SUV","transmission":"Manual","fuel":"Petrol","seats":5,"mileage":17.5,"rate":2280,"rate6h":920,"rate12h":1370,"extraKmCharge":8,"engineCc":1197,"bootLitres":350,"deposit":4000,"plate":"DL 3C LJ 2507","hub":"station","colorHex":"#34495e","terrain":["City","Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/hyundai-venue-s.png","features":["Sunroof","Wireless charging","Rear camera","Connected car tech"],"reviews":[]}'::jsonb),
  ('dd-maruti-suzuki-ciaz-zxi', '{"name":"Maruti Suzuki Ciaz Zxi","brand":"Maruti Suzuki","category":"Hatchback","transmission":"Manual","fuel":"Petrol","seats":5,"mileage":20.6,"rate":2349,"rate6h":940,"rate12h":1410,"extraKmCharge":8,"engineCc":1462,"bootLitres":510,"deposit":4000,"plate":"DL 4C MM 2644","hub":"station","colorHex":"#ecf0f1","terrain":["City","Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/maruti-suzuki-ciaz-zxi.jpg","features":["510 L boot - huge","Limousine-like rear space","Cruise control","Very comfortable"],"reviews":[]}'::jsonb),
  ('dd-mahindra-xuv-300', '{"name":"Mahindra Xuv 300","brand":"Mahindra","category":"SUV","transmission":"Manual","fuel":"Petrol","seats":5,"mileage":17,"rate":2399,"rate6h":960,"rate12h":1440,"extraKmCharge":10,"engineCc":1197,"bootLitres":257,"deposit":4000,"plate":"DL 5C NP 2781","hub":"airport","colorHex":"#c0392b","terrain":["City","Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/mahindra-xuv-300.jpg","features":["5-star GNCAP safety","7 airbags","Sunroof","Best-in-class braking"],"reviews":[]}'::jsonb),
  ('dd-hyundai-venue', '{"name":"Hyundai Venue","brand":"Hyundai","category":"SUV","transmission":"Manual","fuel":"Petrol","seats":5,"mileage":17.5,"rate":2399,"rate6h":960,"rate12h":1440,"extraKmCharge":10,"engineCc":1197,"bootLitres":350,"deposit":4000,"plate":"DL 6C OS 2918","hub":"airport","colorHex":"#2c3e50","terrain":["City","Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/hyundai-venue.jpg","features":["Compact SUV","Touchscreen","Rear camera","Easy in city traffic"],"reviews":[]}'::jsonb),
  ('dd-maruti-suzuki-breeza', '{"name":"Maruti Suzuki breeza","brand":"Maruti Suzuki","category":"SUV","transmission":"Manual","fuel":"Petrol","seats":5,"mileage":17.4,"rate":2399,"rate6h":960,"rate12h":1440,"extraKmCharge":10,"engineCc":1462,"bootLitres":328,"deposit":4000,"plate":"DL 7C PV 3055","hub":"station","colorHex":"#ecf0f1","terrain":["City","Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/maruti-suzuki-breeza.jpg","features":["Sunroof","360 camera","6 airbags","Proven reliability"],"reviews":[]}'::jsonb),
  ('dd-mahindra-xuv500', '{"name":"Mahindra Xuv500","brand":"Mahindra","category":"SUV","transmission":"Manual","fuel":"Diesel","seats":7,"mileage":15.1,"rate":2799,"rate6h":1120,"rate12h":1680,"extraKmCharge":12,"engineCc":2179,"bootLitres":93,"deposit":4000,"plate":"DL 8C QY 3192","hub":"station","colorHex":"#2c3e50","terrain":["Highway","Hills"],"zeroDep":true,"available":false,"status":"maintenance","rating":4.5,"reviewCount":0,"photo":"cars/mahindra-xuv500.jpg","features":["7 seats","Diesel torque","Sunroof","Commanding driving position"],"reviews":[]}'::jsonb),
  ('dd-mahindra-scorpio-classic', '{"name":"Mahindra Scorpio Classic","brand":"Mahindra","category":"SUV","transmission":"Manual","fuel":"Diesel","seats":7,"mileage":15.4,"rate":2808,"rate6h":1130,"rate12h":1690,"extraKmCharge":10,"engineCc":2184,"bootLitres":460,"deposit":6000,"plate":"DL 9C RC 3329","hub":"airport","colorHex":"#2c3e50","terrain":["Highway","Hills","Off-road"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/mahindra-scorpio-classic.jpg","features":["7 seats","132 PS mHawk diesel","Built tough","Great for hill trips"],"reviews":[]}'::jsonb),
  ('dd-mg-astor', '{"name":"MG Astor","brand":"MG","category":"SUV","transmission":"Automatic","fuel":"Petrol","seats":5,"mileage":15.4,"rate":2999,"rate6h":1200,"rate12h":1800,"extraKmCharge":10,"engineCc":1498,"bootLitres":488,"deposit":6000,"plate":"DL 1C SF 3466","hub":"airport","colorHex":"#7f8c8d","terrain":["City","Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/mg-astor.jpg","features":["ADAS Level 2","Automatic","Panoramic sunroof","Premium cabin"],"reviews":[]}'::jsonb),
  ('dd-hyundai-creta', '{"name":"Hyundai Creta","brand":"Hyundai","category":"SUV","transmission":"Manual","fuel":"Petrol","seats":5,"mileage":17.4,"rate":2999,"rate6h":1200,"rate12h":1800,"extraKmCharge":10,"engineCc":1497,"bootLitres":433,"deposit":6000,"plate":"DL 2C TI 3603","hub":"station","colorHex":"#7f8c8d","terrain":["City","Highway","Hills"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/hyundai-creta.jpg","features":["Panoramic sunroof","Ventilated seats","Bose audio","Indias favourite SUV"],"reviews":[]}'::jsonb),
  ('dd-mahindra-thar', '{"name":"Mahindra Thar","brand":"Mahindra","category":"SUV","transmission":"Manual","fuel":"Diesel","seats":5,"mileage":15.2,"rate":3499,"rate6h":1400,"rate12h":2100,"extraKmCharge":10,"engineCc":2184,"bootLitres":150,"deposit":6000,"plate":"DL 3C UL 3740","hub":"station","colorHex":"#d35400","terrain":["Off-road","Hills"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/mahindra-thar.jpg","features":["4x4 capability","Removable roof","Legendary off-roader","Head-turner"],"reviews":[]}'::jsonb),
  ('dd-mg-hector', '{"name":"MG Hector","brand":"MG","category":"Luxury","transmission":"Automatic","fuel":"Petrol","seats":5,"mileage":13.9,"rate":4299,"rate6h":1720,"rate12h":2580,"extraKmCharge":10,"engineCc":1451,"bootLitres":587,"deposit":15000,"plate":"DL 4C VO 3877","hub":"airport","colorHex":"#ecf0f1","terrain":["Highway","Hills"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/mg-hector.jpg","features":["Panoramic sunroof","587 L boot","Automatic","Huge cabin space"],"reviews":[]}'::jsonb),
  ('dd-mercedes-benz-cla-200', '{"name":"Mercedes Benz CLA 200","brand":"Mercedes-Benz","category":"Luxury","transmission":"Automatic","fuel":"Petrol","seats":5,"mileage":17,"rate":6199,"rate6h":2480,"rate12h":3720,"extraKmCharge":10,"engineCc":1332,"bootLitres":460,"deposit":15000,"plate":"DL 5C WR 4014","hub":"airport","colorHex":"#1c1c1c","terrain":["City","Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":0,"photo":"cars/mercedes-benz-cla-200.jpg","features":["Mercedes luxury","Ambient lighting","Automatic","Perfect for weddings and shoots"],"reviews":[]}'::jsonb)
on conflict (id) do nothing;

insert into public.coupons (id, data) values
  ('cp-welcome10', '{"code":"WELCOME10","label":"First ride offer","type":"percent","value":10,"minOrder":0,"maxDiscount":1000,"validFrom":"","validTo":"","active":true,"description":"10% off your first ride with DelhiDrive."}'::jsonb),
  ('cp-weekend20', '{"code":"WEEKEND20","label":"Weekend escape","type":"percent","value":20,"minOrder":3000,"maxDiscount":2000,"validFrom":"","validTo":"","active":true,"description":"20% off Friday-Sunday pickups, capped at Rs 2,000."}'::jsonb),
  ('cp-delhi10', '{"code":"DELHI10","label":"Delhi NCR resident","type":"percent","value":10,"minOrder":1500,"maxDiscount":1200,"validFrom":"","validTo":"","active":true,"description":"10% off every rental for NCR residents."}'::jsonb)
on conflict (id) do nothing;

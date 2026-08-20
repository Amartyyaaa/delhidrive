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
-- 8. Seed data — 14 vehicles and 3 promo codes
-- ---------------------------------------------------------------------
-- Inserted here so the catalogue is populated for visitors straight away,
-- without waiting for an admin to sign in first. Re-running leaves any
-- edits you have made in the Admin > Fleet Inventory screen untouched.

insert into public.fleet (id, data) values
  ('dd-swift-01', '{"name":"Maruti Swift VXi","brand":"Maruti Suzuki","category":"Hatchback","transmission":"Manual","fuel":"Petrol","seats":5,"mileage":22.4,"rate":1499,"engineCc":1197,"bootLitres":268,"deposit":3000,"plate":"DL 3C AB 1204","hub":"cp","colorHex":"#c0392b","terrain":["City","Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.6,"reviewCount":218,"features":["Touchscreen + Android Auto","Rear parking camera","Dual airbags","ABS + EBD"],"reviews":[{"author":"Rohit Malhotra","rating":5,"text":"Perfect for weaving through Karol Bagh traffic. Clean and fuel-sipping.","when":"2 weeks ago"},{"author":"Sneha Iyer","rating":4,"text":"Boot is small for four suitcases but the car itself drove beautifully.","when":"1 month ago"},{"author":"Aman Gupta","rating":5,"text":"Picked up at CP in under 6 minutes. Zero-dep claim was hassle free.","when":"1 month ago"}]}'::jsonb),
  ('dd-i20-02', '{"name":"Hyundai i20 Asta","brand":"Hyundai","category":"Hatchback","transmission":"Automatic","fuel":"Petrol","seats":5,"mileage":19.6,"rate":1899,"engineCc":1197,"bootLitres":311,"deposit":3500,"plate":"DL 8C XZ 5561","hub":"noida18","colorHex":"#2c3e50","terrain":["City","Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.7,"reviewCount":164,"features":["Sunroof","Bose 7-speaker audio","Wireless charging","6 airbags"],"reviews":[{"author":"Priya Nair","rating":5,"text":"The sunroof made the Noida–Rishikesh drive. Automatic is smooth in jams.","when":"5 days ago"},{"author":"Kabir Sethi","rating":5,"text":"Felt brand new. 18k km on the odo and not a single rattle.","when":"3 weeks ago"}]}'::jsonb),
  ('dd-tiago-03', '{"name":"Tata Tiago CNG","brand":"Tata Motors","category":"Hatchback","transmission":"Manual","fuel":"CNG","seats":5,"mileage":26.5,"rate":1299,"engineCc":1199,"bootLitres":205,"deposit":2500,"plate":"DL 1C QR 8890","hub":"cp","colorHex":"#16a085","terrain":["City"],"zeroDep":false,"available":true,"status":"active","rating":4.3,"reviewCount":97,"features":["Dual-fuel CNG","Harman audio","Reverse camera","Cheapest per km"],"reviews":[{"author":"Deepak Yadav","rating":4,"text":"Running cost is unbeatable. Boot shrinks with the CNG tank, plan light.","when":"1 week ago"},{"author":"Meera Joshi","rating":4,"text":"Great little city car. Needed a CNG refill stop near Dhaula Kuan.","when":"2 months ago"}]}'::jsonb),
  ('dd-city-04', '{"name":"Honda City ZX CVT","brand":"Honda","category":"Sedan","transmission":"Automatic","fuel":"Petrol","seats":5,"mileage":18.4,"rate":2599,"engineCc":1498,"bootLitres":506,"deposit":5000,"plate":"DL 2C KL 3345","hub":"t3","colorHex":"#ecf0f1","terrain":["City","Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.8,"reviewCount":302,"features":["Lane Watch camera","Sunroof","Cruise control","Huge 506 L boot"],"reviews":[{"author":"Ananya Rao","rating":5,"text":"Airport-to-Jaipur round trip. Silent cabin, effortless cruiser.","when":"4 days ago"},{"author":"Vikram Chauhan","rating":5,"text":"Best sedan in this price band. Boot swallowed 4 large bags.","when":"2 weeks ago"},{"author":"Farah Khan","rating":4,"text":"CVT hesitates on hard overtakes, otherwise flawless.","when":"1 month ago"}]}'::jsonb),
  ('dd-verna-05', '{"name":"Hyundai Verna SX(O)","brand":"Hyundai","category":"Sedan","transmission":"Automatic","fuel":"Diesel","seats":5,"mileage":21,"rate":2799,"engineCc":1493,"bootLitres":528,"deposit":5000,"plate":"DL 4C MN 7712","hub":"cyber","colorHex":"#34495e","terrain":["Highway","City"],"zeroDep":true,"available":true,"status":"active","rating":4.6,"reviewCount":141,"features":["Ventilated seats","ADAS Level 2","Digital cockpit","360° camera"],"reviews":[{"author":"Harsh Bansal","rating":5,"text":"ADAS on the Yamuna Expressway is a genuine fatigue-killer.","when":"6 days ago"},{"author":"Nikita Sharma","rating":4,"text":"Diesel torque is addictive. Slightly firm ride over Delhi potholes.","when":"3 weeks ago"}]}'::jsonb),
  ('dd-slavia-06', '{"name":"Skoda Slavia 1.5 TSI","brand":"Skoda","category":"Sedan","transmission":"Automatic","fuel":"Petrol","seats":5,"mileage":18.7,"rate":3199,"engineCc":1498,"bootLitres":521,"deposit":6000,"plate":"DL 5C PT 4408","hub":"cyber","colorHex":"#c0392b","terrain":["Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.7,"reviewCount":88,"features":["150 PS TSI","DSG gearbox","5-star Global NCAP","Subwoofer"],"reviews":[{"author":"Arjun Kapoor","rating":5,"text":"Fastest car I have rented under 3.5k. DSG is razor sharp.","when":"1 week ago"},{"author":"Tanvi Desai","rating":5,"text":"Rock solid at 120 kmph. Felt very safe with family aboard.","when":"1 month ago"}]}'::jsonb),
  ('dd-creta-07', '{"name":"Hyundai Creta SX","brand":"Hyundai","category":"SUV","transmission":"Automatic","fuel":"Petrol","seats":5,"mileage":17.4,"rate":3299,"engineCc":1497,"bootLitres":433,"deposit":6000,"plate":"DL 7C GH 2231","hub":"t3","colorHex":"#7f8c8d","terrain":["City","Highway","Hills"],"zeroDep":true,"available":true,"status":"active","rating":4.8,"reviewCount":411,"features":["Panoramic sunroof","Ventilated seats","Bose audio","Drive modes"],"reviews":[{"author":"Siddharth Menon","rating":5,"text":"Did Delhi–Mussoorie. Handled the hill climbs without breaking a sweat.","when":"3 days ago"},{"author":"Ritu Aggarwal","rating":5,"text":"Most comfortable SUV on this platform. Booked it three times now.","when":"2 weeks ago"},{"author":"Nabeel Ahmed","rating":4,"text":"Superb car, just wish the boot was a touch deeper.","when":"1 month ago"}]}'::jsonb),
  ('dd-nexon-08', '{"name":"Tata Nexon EV Max","brand":"Tata Motors","category":"SUV","transmission":"Automatic","fuel":"EV","seats":5,"mileage":437,"mileageUnit":"km range","rate":2999,"engineCc":0,"bootLitres":350,"deposit":6000,"plate":"DL 9C EV 0007","hub":"noida18","colorHex":"#2980b9","terrain":["City","Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.5,"reviewCount":126,"features":["437 km ARAI range","50 kW DC fast charge","Zero tailpipe emission","Air purifier"],"reviews":[{"author":"Ishaan Verma","rating":5,"text":"Zero fuel cost for a week of city driving. Charging at Cyber Hub was easy.","when":"5 days ago"},{"author":"Lakshmi Pillai","rating":4,"text":"Brilliant in town. Plan charge stops if you leave NCR.","when":"3 weeks ago"}]}'::jsonb),
  ('dd-scorpio-09', '{"name":"Mahindra Scorpio-N Z8","brand":"Mahindra","category":"SUV","transmission":"Manual","fuel":"Diesel","seats":7,"mileage":15.4,"rate":3899,"engineCc":2184,"bootLitres":460,"deposit":7500,"plate":"DL 6C SC 9911","hub":"cyber","colorHex":"#2c3e50","terrain":["Highway","Hills","Off-road"],"zeroDep":true,"available":true,"status":"active","rating":4.7,"reviewCount":197,"features":["4XPLOR 4WD","7 seats","175 PS mHawk diesel","Sony 3D audio"],"reviews":[{"author":"Gurpreet Singh","rating":5,"text":"Took seven of us to Shimla. 4WD chewed through the snow patch.","when":"1 week ago"},{"author":"Mohit Rathore","rating":5,"text":"Feels indestructible. Manual box is a joy on open highway.","when":"1 month ago"},{"author":"Divya Kulkarni","rating":4,"text":"Big for Old Delhi lanes — great everywhere else.","when":"2 months ago"}]}'::jsonb),
  ('dd-xuv700-10', '{"name":"Mahindra XUV700 AX7","brand":"Mahindra","category":"SUV","transmission":"Automatic","fuel":"Diesel","seats":7,"mileage":16.6,"rate":4299,"engineCc":2198,"bootLitres":240,"deposit":8000,"plate":"DL 8C XU 7007","hub":"t3","colorHex":"#ecf0f1","terrain":["Highway","Hills","City"],"zeroDep":true,"available":true,"status":"active","rating":4.9,"reviewCount":265,"features":["ADAS Level 2","Dual 10.25\" screens","Sony 3D 12-speaker","7 airbags"],"reviews":[{"author":"Rahul Khanna","rating":5,"text":"The best value 7-seater in India, and DelhiDrive keeps them spotless.","when":"2 days ago"},{"author":"Zoya Rahman","rating":5,"text":"Adaptive cruise made the Agra run genuinely relaxing.","when":"2 weeks ago"}]}'::jsonb),
  ('dd-thar-11', '{"name":"Mahindra Thar LX 4x4","brand":"Mahindra","category":"SUV","transmission":"Manual","fuel":"Diesel","seats":4,"mileage":15.2,"rate":3599,"engineCc":2184,"bootLitres":150,"deposit":8000,"plate":"DL 2C TH 4x44","hub":"cp","colorHex":"#d35400","terrain":["Off-road","Hills"],"zeroDep":false,"available":true,"status":"maintenance","rating":4.6,"reviewCount":152,"features":["4x4 low ratio","Removable roof","Brake locking diff","650 mm water wading"],"reviews":[{"author":"Kunal Bhatt","rating":5,"text":"Sanctuary trails near Sariska were effortless. Pure fun machine.","when":"1 week ago"},{"author":"Aditi Sood","rating":4,"text":"Loud on the highway but that is the point. Loved it.","when":"1 month ago"}]}'::jsonb),
  ('dd-c200-12', '{"name":"Mercedes-Benz C 200","brand":"Mercedes-Benz","category":"Luxury","transmission":"Automatic","fuel":"Petrol","seats":5,"mileage":14.2,"rate":8999,"engineCc":1999,"bootLitres":455,"deposit":25000,"plate":"DL 1C MB 0200","hub":"t3","colorHex":"#1c1c1c","terrain":["City","Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.9,"reviewCount":74,"features":["Burmester 3D sound","MBUX 11.9\" portrait screen","Ambient lighting 64 colours","Chauffeur add-on"],"reviews":[{"author":"Aryan Malhotra","rating":5,"text":"Booked it for a wedding. Delivered detailed, fuelled, on the dot.","when":"1 week ago"},{"author":"Simran Kaur","rating":5,"text":"Ride quality is another planet. Worth every rupee.","when":"3 weeks ago"}]}'::jsonb),
  ('dd-bmw3-13', '{"name":"BMW 330i M Sport","brand":"BMW","category":"Luxury","transmission":"Automatic","fuel":"Petrol","seats":5,"mileage":13.4,"rate":10499,"engineCc":1998,"bootLitres":480,"deposit":30000,"plate":"DL 3C BM 0330","hub":"cyber","colorHex":"#2980b9","terrain":["Highway"],"zeroDep":true,"available":true,"status":"active","rating":4.9,"reviewCount":61,"features":["258 PS TwinPower","0–100 in 5.8s","Harman Kardon","Adaptive M suspension"],"reviews":[{"author":"Dev Chandra","rating":5,"text":"Sublime on the KMP Expressway. Handover took four minutes.","when":"4 days ago"},{"author":"Neha Bhardwaj","rating":5,"text":"Rented for a shoot. Immaculate condition, no surprises on the bill.","when":"1 month ago"}]}'::jsonb),
  ('dd-fortuner-14', '{"name":"Toyota Fortuner 4x4","brand":"Toyota","category":"Luxury","transmission":"Automatic","fuel":"Diesel","seats":7,"mileage":12.8,"rate":7499,"engineCc":2755,"bootLitres":296,"deposit":20000,"plate":"DL 5C FT 4444","hub":"t3","colorHex":"#ecf0f1","terrain":["Highway","Hills","Off-road"],"zeroDep":true,"available":true,"status":"active","rating":4.8,"reviewCount":133,"features":["204 PS 4x4","Kick-sensor tailgate","JBL 11-speaker","Legendary reliability"],"reviews":[{"author":"Vivek Nanda","rating":5,"text":"Leh trip. Not one hiccup across 2,400 km.","when":"2 weeks ago"},{"author":"Pooja Malik","rating":5,"text":"Commands total respect on the road. Loved the presence.","when":"1 month ago"}]}'::jsonb)
on conflict (id) do nothing;

insert into public.coupons (id, data) values
  ('cp-first500', '{"code":"FIRST500","label":"First booking bonus","type":"flat","value":500,"minOrder":2500,"maxDiscount":500,"validFrom":"","validTo":"","active":true,"description":"₹500 off your very first DelhiDrive rental."}'::jsonb),
  ('cp-weekend20', '{"code":"WEEKEND20","label":"Weekend escape","type":"percent","value":20,"minOrder":3000,"maxDiscount":2000,"validFrom":"","validTo":"","active":true,"description":"20% off Friday–Sunday pickups, capped at ₹2,000."}'::jsonb),
  ('cp-delhi10', '{"code":"DELHI10","label":"Delhi NCR resident","type":"percent","value":10,"minOrder":1500,"maxDiscount":1200,"validFrom":"","validTo":"","active":true,"description":"10% off every rental for NCR residents."}'::jsonb)
on conflict (id) do nothing;

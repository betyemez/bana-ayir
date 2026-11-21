-- =====================================================================
-- Randevu Pazaryeri - Temel şema
-- Tasarım ilkeleri:
--  * Tüm tablolarda RLS açık; yazma işlemlerinin çoğu doğrulama yapan RPC'ler üzerinden.
--  * Müşteri değerlendirmesi YALNIZCA objektif alanlardan oluşur (serbest metin yok).
--  * Müşteri güvenilirlik özeti, yalnızca o müşteriyle randevu ilişkisi olan işletmeye
--    ve müşterinin kendisine gösterilir (amaçla sınırlılık - KVKK md.4).
--  * Müşteri kendi hakkındaki her değerlendirmeyi görür ve itiraz edebilir.
--  * Açık rıza / aydınlatma onayları ekleme-yalnız (append-only) kayıt tutulur.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enum tipleri
-- ---------------------------------------------------------------------
create type public.member_role        as enum ('owner', 'manager', 'staff');
create type public.booking_mode       as enum ('service', 'reservation');
create type public.appointment_status as enum (
  'pending', 'confirmed', 'completed', 'no_show',
  'cancelled_by_customer', 'cancelled_by_business'
);
create type public.attendance_outcome as enum ('on_time', 'late', 'no_show');
create type public.payment_outcome    as enum ('paid_full', 'paid_partial', 'unpaid', 'not_applicable');
create type public.dispute_status     as enum ('open', 'upheld', 'rejected');
create type public.review_status      as enum ('published', 'hidden', 'under_review');
create type public.consent_type       as enum (
  'kvkk_aydinlatma',          -- aydınlatma metni okundu
  'uyelik_sozlesmesi',        -- kullanım koşulları
  'acik_riza_degerlendirme',  -- güvenilirlik değerlendirmesi için açık rıza
  'ticari_ileti'              -- pazarlama SMS/e-posta (İYS)
);

-- ---------------------------------------------------------------------
-- Profiller (auth.users ile 1-1)
-- ---------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  phone             text unique,
  full_name         text check (char_length(full_name) <= 120),
  avatar_url        text,
  is_platform_admin boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.user_consents (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  consent_type public.consent_type not null,
  version      text not null,
  granted      boolean not null,
  created_at   timestamptz not null default now()
);
create index on public.user_consents (user_id, consent_type, created_at desc);

-- ---------------------------------------------------------------------
-- İşletme kategorileri (her sektör için liste etiketi ve alan şablonu)
-- ---------------------------------------------------------------------
create table public.business_categories (
  id                        smallint generated always as identity primary key,
  slug                      text not null unique,
  name                      text not null,
  list_label                text not null,              -- "Menü", "Hizmetler", "Tedaviler"...
  booking_mode              public.booking_mode not null default 'service',
  default_duration_minutes  int not null default 30 check (default_duration_minutes > 0),
  item_fields               jsonb not null default '[]', -- kalem için önerilen ek alanlar
  sort_order                int not null default 0
);

-- ---------------------------------------------------------------------
-- İşletmeler
-- ---------------------------------------------------------------------
create table public.businesses (
  id                          uuid primary key default gen_random_uuid(),
  owner_id                    uuid not null references public.profiles (id),
  category_id                 smallint not null references public.business_categories (id),
  name                        text not null check (char_length(name) between 2 and 120),
  slug                        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description                 text check (char_length(description) <= 4000),
  phone                       text,
  email                       text,
  website                     text,
  address                     text,
  city                        text,
  district                    text,
  latitude                    double precision,
  longitude                   double precision,
  cover_url                   text,
  logo_url                    text,
  timezone                    text not null default 'Europe/Istanbul',
  booking_mode                public.booking_mode not null default 'service',
  slot_interval_minutes       int not null default 15 check (slot_interval_minutes between 5 and 240),
  default_duration_minutes    int not null default 30 check (default_duration_minutes between 5 and 1440),
  min_notice_minutes          int not null default 60 check (min_notice_minutes >= 0),
  max_advance_days            int not null default 60 check (max_advance_days between 1 and 365),
  cancellation_window_hours   int not null default 2 check (cancellation_window_hours between 0 and 168),
  max_party_size              int not null default 1 check (max_party_size >= 1),
  auto_confirm                boolean not null default true,
  is_published                boolean not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index on public.businesses (category_id) where is_published;
create index on public.businesses (city, district) where is_published;

create table public.business_stats (
  business_id  uuid primary key references public.businesses (id) on delete cascade,
  rating_avg   numeric(3,2),
  rating_count int not null default 0
);

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.member_role not null default 'staff',
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index on public.business_members (user_id);

-- Çalışma saatleri (gün içinde birden fazla aralık olabilir: öğle arası vb.)
create table public.business_hours (
  id          bigint generated always as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7), -- ISO: 1=Pzt, 7=Paz
  opens_at    time not null,
  closes_at   time not null,
  check (closes_at > opens_at)
);
create index on public.business_hours (business_id, weekday);

create table public.business_closures (
  id          bigint generated always as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  starts_on   date not null,
  ends_on     date not null,
  reason      text,
  check (ends_on >= starts_on)
);
create index on public.business_closures (business_id, starts_on);

-- Kaynaklar: personel, koltuk, masa, salon, doktor, oda...
-- capacity=1 -> kişi bazlı (kuaför). capacity>1 -> kişi sayısı toplamı (restoran salonu).
create table public.resources (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  description text,
  photo_url   text,
  capacity    int not null default 1 check (capacity >= 1),
  is_active   boolean not null default true,
  sort_order  int not null default 0
);
create index on public.resources (business_id);

-- ---------------------------------------------------------------------
-- Esnek katalog: menü, hizmet listesi, tedavi listesi, paketler...
-- ---------------------------------------------------------------------
create table public.catalog_sections (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  description text,
  sort_order  int not null default 0
);
create index on public.catalog_sections (business_id);

create table public.catalog_items (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  section_id       uuid references public.catalog_sections (id) on delete set null,
  name             text not null check (char_length(name) between 1 and 120),
  description      text check (char_length(description) <= 2000),
  price            numeric(12,2) check (price >= 0),
  price_is_from    boolean not null default false,   -- "...'den başlayan fiyatlarla"
  currency         char(3) not null default 'TRY',
  duration_minutes int check (duration_minutes > 0),
  is_bookable      boolean not null default true,    -- restoran menüsü: false
  attributes       jsonb not null default '{}',      -- kategoriye göre ek alanlar
  image_url        text,
  is_active        boolean not null default true,
  sort_order       int not null default 0
);
create index on public.catalog_items (business_id, section_id);

-- Hangi kaynak hangi hizmeti verebilir? Kaynağın kaydı yoksa: hepsini verebilir.
create table public.resource_items (
  resource_id uuid not null references public.resources (id) on delete cascade,
  item_id     uuid not null references public.catalog_items (id) on delete cascade,
  primary key (resource_id, item_id)
);

-- ---------------------------------------------------------------------
-- Randevular
-- ---------------------------------------------------------------------
create table public.appointments (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references public.businesses (id) on delete cascade,
  customer_id          uuid not null references public.profiles (id) on delete cascade,
  resource_id          uuid references public.resources (id) on delete set null,
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  party_size           int not null default 1 check (party_size >= 1),
  status               public.appointment_status not null default 'pending',
  customer_note        text check (char_length(customer_note) <= 500),
  cancelled_at         timestamptz,
  cancel_reason        text check (char_length(cancel_reason) <= 500),
  is_late_cancellation boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.appointments (business_id, starts_at);
create index on public.appointments (customer_id, starts_at desc);
create index on public.appointments (resource_id, starts_at) where status in ('pending', 'confirmed');

-- Randevu anındaki hizmet/fiyat kopyası (sonradan fiyat değişse de kayıt bozulmaz)
create table public.appointment_items (
  id               bigint generated always as identity primary key,
  appointment_id   uuid not null references public.appointments (id) on delete cascade,
  item_id          uuid references public.catalog_items (id) on delete set null,
  name             text not null,
  price            numeric(12,2),
  currency         char(3) not null default 'TRY',
  duration_minutes int
);
create index on public.appointment_items (appointment_id);

-- İşletmenin kendi engel listesi (yalnızca o işletmeyi etkiler, başkaları görmez)
create table public.customer_blocks (
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (business_id, customer_id)
);

-- ---------------------------------------------------------------------
-- Değerlendirmeler
-- ---------------------------------------------------------------------
-- Müşteri -> İşletme (herkese açık yorum)
create table public.business_reviews (
  id                uuid primary key default gen_random_uuid(),
  appointment_id    uuid not null unique references public.appointments (id) on delete cascade,
  business_id       uuid not null references public.businesses (id) on delete cascade,
  customer_id       uuid not null references public.profiles (id) on delete cascade,
  reviewer_display  text not null,                       -- "Ahmet Y." (maskeli)
  rating            smallint not null check (rating between 1 and 5),
  comment           text check (char_length(comment) <= 1000),
  business_reply    text check (char_length(business_reply) <= 1000),
  business_reply_at timestamptz,
  status            public.review_status not null default 'published',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.business_reviews (business_id, created_at desc) where status = 'published';

-- İşletme -> Müşteri (YALNIZCA objektif alanlar, serbest metin yok)
create table public.customer_assessments (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments (id) on delete cascade,
  business_id    uuid not null references public.businesses (id) on delete cascade,
  customer_id    uuid not null references public.profiles (id) on delete cascade,
  attendance     public.attendance_outcome not null,
  payment        public.payment_outcome not null,
  assessed_by    uuid references public.profiles (id) on delete set null,
  voided_at      timestamptz,   -- itiraz kabul edilirse geçersiz sayılır
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (attendance <> 'no_show' or payment = 'not_applicable')
);
create index on public.customer_assessments (customer_id, created_at desc);

-- Müşterinin değerlendirmeye itirazı
create table public.assessment_disputes (
  id              uuid primary key default gen_random_uuid(),
  assessment_id   uuid not null unique references public.customer_assessments (id) on delete cascade,
  customer_id     uuid not null references public.profiles (id) on delete cascade,
  reason          text not null check (char_length(reason) between 10 and 1000),
  status          public.dispute_status not null default 'open',
  resolution_note text,
  resolved_by     uuid references public.profiles (id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index on public.assessment_disputes (status) where status = 'open';

-- =====================================================================
-- Yardımcı fonksiyonlar
-- =====================================================================
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger trg_profiles_touch     before update on public.profiles             for each row execute function public.touch_updated_at();
create trigger trg_businesses_touch   before update on public.businesses           for each row execute function public.touch_updated_at();
create trigger trg_appointments_touch before update on public.appointments         for each row execute function public.touch_updated_at();
create trigger trg_reviews_touch      before update on public.business_reviews     for each row execute function public.touch_updated_at();
create trigger trg_assessments_touch  before update on public.customer_assessments for each row execute function public.touch_updated_at();

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from profiles where id = auth.uid()), false);
$$;

create or replace function public.is_business_member(p_business uuid, p_roles public.member_role[] default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from business_members m
    where m.business_id = p_business
      and m.user_id = auth.uid()
      and (p_roles is null or m.role = any (p_roles))
  );
$$;

-- Bu müşteri, çağıran kullanıcının üyesi olduğu bir işletmeden randevu almış mı?
create or replace function public.is_customer_of_my_business(p_customer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from appointments a
    join business_members m on m.business_id = a.business_id and m.user_id = auth.uid()
    where a.customer_id = p_customer
  );
$$;

-- "Ahmet Yılmaz" -> "Ahmet Y."
create or replace function public.mask_name(p_full_name text) returns text
language sql immutable as $$
  select case
    when coalesce(trim(p_full_name), '') = '' then 'Müşteri'
    when position(' ' in trim(p_full_name)) = 0 then trim(p_full_name)
    else split_part(trim(p_full_name), ' ', 1) || ' ' ||
         upper(left(regexp_replace(trim(p_full_name), '^.*\s', ''), 1)) || '.'
  end;
$$;

-- Yeni kullanıcı -> profil
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, phone, full_name)
  values (new.id, new.phone, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Telefon numarası auth tarafında değişirse profile yansıt
create or replace function public.handle_user_phone_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set phone = new.phone where id = new.id;
  return new;
end $$;

create trigger on_auth_user_phone_changed
  after update of phone on auth.users
  for each row when (old.phone is distinct from new.phone)
  execute function public.handle_user_phone_change();

-- İşletme oluşturulunca sahibini üye yap + istatistik satırı aç
create or replace function public.handle_new_business() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into business_members (business_id, user_id, role) values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  insert into business_stats (business_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger trg_business_created
  after insert on public.businesses
  for each row execute function public.handle_new_business();

-- Yorum eklenince maskeli isim + puan ortalaması
create or replace function public.handle_review_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select mask_name(full_name) into new.reviewer_display from profiles where id = new.customer_id;
  new.reviewer_display := coalesce(new.reviewer_display, 'Müşteri');
  return new;
end $$;

create trigger trg_review_before_insert
  before insert on public.business_reviews
  for each row execute function public.handle_review_before_insert();

create or replace function public.refresh_business_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_business uuid := coalesce(new.business_id, old.business_id);
begin
  update business_stats s set
    rating_avg   = sub.avg_rating,
    rating_count = sub.cnt
  from (
    select round(avg(rating)::numeric, 2) as avg_rating, count(*)::int as cnt
    from business_reviews where business_id = v_business and status = 'published'
  ) sub
  where s.business_id = v_business;
  return null;
end $$;

create trigger trg_review_rating
  after insert or update of rating, status or delete on public.business_reviews
  for each row execute function public.refresh_business_rating();

-- =====================================================================
-- Müsaitlik ve randevu RPC'leri
-- =====================================================================
-- Belirli gün için müsait başlangıç saatleri ve uygun kaynaklar
create or replace function public.get_available_slots(
  p_business         uuid,
  p_date             date,
  p_duration_minutes int,
  p_party_size       int default 1,
  p_resource         uuid default null,
  p_item_ids         uuid[] default null
)
returns table (slot_start timestamptz, slot_end timestamptz, resource_ids uuid[])
language plpgsql stable security definer set search_path = public as $$
declare
  b businesses%rowtype;
begin
  select * into b from businesses where id = p_business and is_published;
  if not found or p_duration_minutes is null or p_duration_minutes <= 0 then
    return;
  end if;

  if exists (select 1 from business_closures c
             where c.business_id = p_business and p_date between c.starts_on and c.ends_on) then
    return;
  end if;

  return query
  with hours as (
    select (p_date + h.opens_at)  at time zone b.timezone as open_ts,
           (p_date + h.closes_at) at time zone b.timezone as close_ts
    from business_hours h
    where h.business_id = p_business
      and h.weekday = extract(isodow from p_date)::int
  ),
  slots as (
    select gs as s, gs + make_interval(mins => p_duration_minutes) as e
    from hours,
         generate_series(hours.open_ts,
                         hours.close_ts - make_interval(mins => p_duration_minutes),
                         make_interval(mins => b.slot_interval_minutes)) gs
  ),
  res as (
    select r.id, r.capacity
    from resources r
    where r.business_id = p_business
      and r.is_active
      and r.capacity >= p_party_size
      and (p_resource is null or r.id = p_resource)
      and (
        p_item_ids is null
        or not exists (select 1 from resource_items ri where ri.resource_id = r.id)
        or (select count(distinct ri.item_id) from resource_items ri
            where ri.resource_id = r.id and ri.item_id = any (p_item_ids))
           = (select count(distinct x) from unnest(p_item_ids) x)
      )
  )
  select sl.s, sl.e, array_agg(res.id order by res.id)
  from slots sl
  cross join res
  where sl.s >= now() + make_interval(mins => b.min_notice_minutes)
    and sl.s <= now() + make_interval(days => b.max_advance_days)
    and coalesce((
          select sum(a.party_size) from appointments a
          where a.resource_id = res.id
            and a.status in ('pending', 'confirmed')
            and tstzrange(a.starts_at, a.ends_at) && tstzrange(sl.s, sl.e)
        ), 0) + p_party_size <= res.capacity
  group by sl.s, sl.e
  order by sl.s;
end $$;

-- Randevu oluştur (müşteri)
create or replace function public.create_appointment(
  p_business   uuid,
  p_starts_at  timestamptz,
  p_item_ids   uuid[] default '{}',
  p_party_size int default 1,
  p_resource   uuid default null,
  p_note       text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  b          businesses%rowtype;
  v_items    uuid[] := coalesce(p_item_ids, '{}');
  v_duration int;
  v_resource uuid;
  v_id       uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into b from businesses where id = p_business and is_published;
  if not found then raise exception 'business_not_found'; end if;

  if p_party_size < 1 or p_party_size > b.max_party_size then
    raise exception 'invalid_party_size';
  end if;

  if exists (select 1 from customer_blocks where business_id = p_business and customer_id = v_uid) then
    raise exception 'booking_not_allowed';
  end if;

  -- Aynı işletmede aynı anda en fazla 3 aktif ileri tarihli randevu (spam önlemi)
  if (select count(*) from appointments
      where business_id = p_business and customer_id = v_uid
        and status in ('pending', 'confirmed') and starts_at > now()) >= 3 then
    raise exception 'too_many_active_appointments';
  end if;

  if cardinality(v_items) > 0 then
    if (select count(*) from catalog_items i
        where i.id = any (v_items) and i.business_id = p_business
          and i.is_active and i.is_bookable) <> (select count(distinct x) from unnest(v_items) x) then
      raise exception 'invalid_items';
    end if;
    select sum(coalesce(i.duration_minutes, 0)) into v_duration
    from catalog_items i where i.id = any (v_items);
  end if;
  if coalesce(v_duration, 0) <= 0 then
    v_duration := b.default_duration_minutes;
  end if;

  -- Aynı işletmeye eşzamanlı rezervasyonları sırala (çift rezervasyonu engeller)
  perform pg_advisory_xact_lock(hashtext('booking:' || p_business::text));

  select s.resource_ids[1] into v_resource
  from get_available_slots(
         p_business,
         (p_starts_at at time zone b.timezone)::date,
         v_duration, p_party_size, p_resource,
         case when cardinality(v_items) > 0 then v_items end
       ) s
  where s.slot_start = p_starts_at;

  if v_resource is null then raise exception 'slot_unavailable'; end if;

  insert into appointments (business_id, customer_id, resource_id, starts_at, ends_at,
                            party_size, status, customer_note)
  values (p_business, v_uid, v_resource, p_starts_at,
          p_starts_at + make_interval(mins => v_duration), p_party_size,
          case when b.auto_confirm then 'confirmed' else 'pending' end::appointment_status,
          nullif(trim(p_note), ''))
  returning id into v_id;

  insert into appointment_items (appointment_id, item_id, name, price, currency, duration_minutes)
  select v_id, i.id, i.name, i.price, i.currency, i.duration_minutes
  from catalog_items i where i.id = any (v_items);

  return v_id;
end $$;

-- Müşteri iptali (geç iptal otomatik ve objektif olarak işaretlenir)
create or replace function public.cancel_appointment(p_appointment uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update appointments a set
    status = 'cancelled_by_customer',
    cancelled_at = now(),
    cancel_reason = nullif(trim(p_reason), ''),
    is_late_cancellation = now() > a.starts_at - make_interval(hours => b.cancellation_window_hours)
  from businesses b
  where a.id = p_appointment
    and b.id = a.business_id
    and a.customer_id = auth.uid()
    and a.status in ('pending', 'confirmed')
    and a.starts_at > now();
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'cannot_cancel'; end if;
end $$;

-- İşletme: onayla / iptal et
create or replace function public.business_update_appointment(
  p_appointment uuid, p_action text, p_reason text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare a appointments%rowtype;
begin
  select * into a from appointments where id = p_appointment for update;
  if not found or not is_business_member(a.business_id) then raise exception 'not_found'; end if;

  if p_action = 'confirm' then
    if a.status <> 'pending' then raise exception 'invalid_state'; end if;
    update appointments set status = 'confirmed' where id = a.id;
  elsif p_action = 'cancel' then
    if a.status not in ('pending', 'confirmed') then raise exception 'invalid_state'; end if;
    update appointments set status = 'cancelled_by_business', cancelled_at = now(),
                            cancel_reason = nullif(trim(p_reason), '')
    where id = a.id;
  else
    raise exception 'invalid_action';
  end if;
end $$;

-- İşletme: randevu sonrası müşteri değerlendirmesi (randevu başladıktan sonra, 7 gün içinde)
create or replace function public.submit_customer_assessment(
  p_appointment uuid,
  p_attendance  public.attendance_outcome,
  p_payment     public.payment_outcome
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  a    appointments%rowtype;
  v_id uuid;
begin
  select * into a from appointments where id = p_appointment for update;
  if not found or not is_business_member(a.business_id) then raise exception 'not_found'; end if;
  if a.status not in ('pending', 'confirmed', 'completed', 'no_show') then raise exception 'invalid_state'; end if;
  if now() < a.starts_at then raise exception 'too_early'; end if;
  if now() > a.ends_at + interval '7 days' then raise exception 'window_closed'; end if;
  if p_attendance = 'no_show' and p_payment <> 'not_applicable' then raise exception 'invalid_payment'; end if;

  if exists (select 1 from customer_assessments ca
             join assessment_disputes d on d.assessment_id = ca.id
             where ca.appointment_id = a.id) then
    raise exception 'assessment_disputed';
  end if;

  insert into customer_assessments (appointment_id, business_id, customer_id, attendance, payment, assessed_by)
  values (a.id, a.business_id, a.customer_id, p_attendance, p_payment, auth.uid())
  on conflict (appointment_id) do update
    set attendance = excluded.attendance, payment = excluded.payment, assessed_by = excluded.assessed_by
  returning id into v_id;

  update appointments
  set status = case when p_attendance = 'no_show' then 'no_show' else 'completed' end::appointment_status
  where id = a.id;

  return v_id;
end $$;

-- Müşteri güvenilirlik özeti (son 12 ay). Yalnızca müşterinin kendisi veya
-- müşteriyle randevu ilişkisi olan işletme üyeleri görebilir.
-- Açık itirazdaki ve geçersiz sayılan değerlendirmeler hesaba katılmaz.
create or replace function public.get_customer_reliability(p_customer uuid)
returns table (
  total_appointments  int,
  attended            int,
  late_arrivals       int,
  no_shows            int,
  late_cancellations  int,
  payment_issues      int,
  reliability_pct     int,      -- yeterli veri yoksa null
  enough_data         boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null
     or (auth.uid() <> p_customer and not is_customer_of_my_business(p_customer)) then
    raise exception 'not_allowed';
  end if;

  return query
  with valid_assessments as (
    select ca.* from customer_assessments ca
    where ca.customer_id = p_customer
      and ca.voided_at is null
      and ca.created_at > now() - interval '12 months'
      and not exists (select 1 from assessment_disputes d
                      where d.assessment_id = ca.id and d.status = 'open')
  ),
  late_cancels as (
    select count(*)::int as n from appointments a
    where a.customer_id = p_customer
      and a.status = 'cancelled_by_customer'
      and a.is_late_cancellation
      and a.cancelled_at > now() - interval '12 months'
  ),
  agg as (
    select
      count(*)::int                                                     as assessed,
      count(*) filter (where attendance in ('on_time', 'late'))::int    as attended,
      count(*) filter (where attendance = 'late')::int                  as late,
      count(*) filter (where attendance = 'no_show')::int               as no_show,
      count(*) filter (where payment in ('paid_partial', 'unpaid'))::int as pay_issues
    from valid_assessments
  )
  select
    agg.assessed + lc.n,
    agg.attended,
    agg.late,
    agg.no_show,
    lc.n,
    agg.pay_issues,
    case when agg.assessed + lc.n >= 3 then
      greatest(0, round(100.0 * (
        agg.assessed + lc.n
        - agg.no_show
        - lc.n
        - 0.5 * agg.pay_issues
        - 0.25 * agg.late
      ) / (agg.assessed + lc.n)))::int
    end,
    (agg.assessed + lc.n) >= 3
  from agg, late_cancels lc;
end $$;

-- İşletme: yoruma yanıt
create or replace function public.reply_to_review(p_review uuid, p_reply text)
returns void language plpgsql security definer set search_path = public as $$
declare v_business uuid;
begin
  select business_id into v_business from business_reviews where id = p_review;
  if v_business is null or not is_business_member(v_business, array['owner', 'manager']::member_role[]) then
    raise exception 'not_found';
  end if;
  update business_reviews
  set business_reply = nullif(trim(p_reply), ''),
      business_reply_at = case when nullif(trim(p_reply), '') is null then null else now() end
  where id = p_review;
end $$;

-- Platform yöneticisi: itirazı sonuçlandır
create or replace function public.resolve_dispute(p_dispute uuid, p_upheld boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare d assessment_disputes%rowtype;
begin
  if not is_platform_admin() then raise exception 'not_allowed'; end if;
  select * into d from assessment_disputes where id = p_dispute for update;
  if not found or d.status <> 'open' then raise exception 'invalid_state'; end if;

  update assessment_disputes
  set status = case when p_upheld then 'upheld' else 'rejected' end::dispute_status,
      resolution_note = p_note, resolved_by = auth.uid(), resolved_at = now()
  where id = d.id;

  if p_upheld then
    update customer_assessments set voided_at = now() where id = d.assessment_id;
    -- Haksız "gelmedi" kaydı ise randevu tamamlandı sayılır, müşteri yorum yapabilir
    update appointments a set status = 'completed'
    from customer_assessments ca
    where ca.id = d.assessment_id and a.id = ca.appointment_id and a.status = 'no_show';
  end if;
end $$;

-- Kullanıcı: onay kaydı ekle (append-only)
create or replace function public.record_consent(p_type public.consent_type, p_version text, p_granted boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into user_consents (user_id, consent_type, version, granted)
  values (auth.uid(), p_type, p_version, p_granted);
end $$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles             enable row level security;
alter table public.user_consents        enable row level security;
alter table public.business_categories  enable row level security;
alter table public.businesses           enable row level security;
alter table public.business_stats       enable row level security;
alter table public.business_members     enable row level security;
alter table public.business_hours       enable row level security;
alter table public.business_closures    enable row level security;
alter table public.resources            enable row level security;
alter table public.catalog_sections     enable row level security;
alter table public.catalog_items        enable row level security;
alter table public.resource_items       enable row level security;
alter table public.appointments         enable row level security;
alter table public.appointment_items    enable row level security;
alter table public.customer_blocks      enable row level security;
alter table public.business_reviews     enable row level security;
alter table public.customer_assessments enable row level security;
alter table public.assessment_disputes  enable row level security;

-- Profiller: kendin + randevu ilişkisi olan işletme + admin
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_customer_of_my_business(id) or public.is_platform_admin());
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- Onaylar: yalnızca kendi kayıtların (yazma RPC ile)
create policy "consents_select_own" on public.user_consents for select to authenticated
  using (user_id = auth.uid());

-- Kategoriler: herkese açık
create policy "categories_public" on public.business_categories for select to anon, authenticated using (true);

-- İşletmeler
create policy "businesses_select" on public.businesses for select to anon, authenticated
  using (is_published or owner_id = auth.uid() or public.is_business_member(id) or public.is_platform_admin());
create policy "businesses_insert" on public.businesses for insert to authenticated
  with check (owner_id = auth.uid());
create policy "businesses_update" on public.businesses for update to authenticated
  using (public.is_business_member(id, array['owner', 'manager']::public.member_role[]))
  with check (public.is_business_member(id, array['owner', 'manager']::public.member_role[]));
create policy "businesses_delete" on public.businesses for delete to authenticated
  using (owner_id = auth.uid());
revoke update on public.businesses from anon, authenticated;
grant update (
  category_id, name, slug, description, phone, email, website, address, city, district,
  latitude, longitude, cover_url, logo_url, timezone, booking_mode, slot_interval_minutes,
  default_duration_minutes, min_notice_minutes, max_advance_days, cancellation_window_hours,
  max_party_size, auto_confirm, is_published
) on public.businesses to authenticated;

create policy "stats_public" on public.business_stats for select to anon, authenticated using (true);

-- Üyeler
create policy "members_select" on public.business_members for select to authenticated
  using (user_id = auth.uid() or public.is_business_member(business_id));
create policy "members_manage" on public.business_members for all to authenticated
  using (public.is_business_member(business_id, array['owner']::public.member_role[]) and role <> 'owner')
  with check (public.is_business_member(business_id, array['owner']::public.member_role[]) and role <> 'owner');

-- İşletmeye ait alt tablolar: yayındaysa herkes okur, owner/manager yönetir
do $$
declare t text;
begin
  foreach t in array array['business_hours', 'business_closures', 'resources', 'catalog_sections', 'catalog_items']
  loop
    execute format($f$
      create policy "%1$s_select" on public.%1$s for select to anon, authenticated
        using (exists (select 1 from public.businesses b where b.id = business_id
                       and (b.is_published or public.is_business_member(b.id))));
      create policy "%1$s_manage" on public.%1$s for all to authenticated
        using (public.is_business_member(business_id, array['owner', 'manager']::public.member_role[]))
        with check (public.is_business_member(business_id, array['owner', 'manager']::public.member_role[]));
    $f$, t);
  end loop;
end $$;

create policy "resource_items_select" on public.resource_items for select to anon, authenticated
  using (exists (select 1 from public.resources r join public.businesses b on b.id = r.business_id
                 where r.id = resource_id and (b.is_published or public.is_business_member(b.id))));
create policy "resource_items_manage" on public.resource_items for all to authenticated
  using (exists (select 1 from public.resources r where r.id = resource_id
                 and public.is_business_member(r.business_id, array['owner', 'manager']::public.member_role[])))
  with check (exists (select 1 from public.resources r join public.catalog_items i on i.id = item_id
                      where r.id = resource_id and i.business_id = r.business_id
                      and public.is_business_member(r.business_id, array['owner', 'manager']::public.member_role[])));

-- Randevular: müşteri kendininkini, işletme üyeleri kendi işletmesininkini görür.
-- Yazma işlemleri yalnızca RPC üzerinden.
create policy "appointments_select" on public.appointments for select to authenticated
  using (customer_id = auth.uid() or public.is_business_member(business_id));
create policy "appointment_items_select" on public.appointment_items for select to authenticated
  using (exists (select 1 from public.appointments a where a.id = appointment_id
                 and (a.customer_id = auth.uid() or public.is_business_member(a.business_id))));

-- Engel listesi: yalnızca o işletme
create policy "blocks_manage" on public.customer_blocks for all to authenticated
  using (public.is_business_member(business_id, array['owner', 'manager']::public.member_role[]))
  with check (public.is_business_member(business_id, array['owner', 'manager']::public.member_role[])
              and created_by = auth.uid());

-- İşletme yorumları
create policy "reviews_select" on public.business_reviews for select to anon, authenticated
  using (status = 'published' or customer_id = auth.uid()
         or public.is_business_member(business_id) or public.is_platform_admin());
create policy "reviews_insert" on public.business_reviews for insert to authenticated
  with check (
    customer_id = auth.uid()
    and exists (select 1 from public.appointments a
                where a.id = appointment_id
                  and a.customer_id = auth.uid()
                  and a.business_id = business_reviews.business_id
                  and a.status = 'completed'
                  and a.starts_at > now() - interval '30 days')
  );
create policy "reviews_update_own" on public.business_reviews for update to authenticated
  using (customer_id = auth.uid() and created_at > now() - interval '30 days')
  with check (customer_id = auth.uid());
revoke insert, update on public.business_reviews from anon, authenticated;
grant insert (appointment_id, business_id, customer_id, rating, comment) on public.business_reviews to authenticated;
grant update (rating, comment) on public.business_reviews to authenticated;

-- Müşteri değerlendirmeleri: müşteri kendi hakkındakileri, işletme kendi verdiklerini görür.
-- (Diğer işletmeler ham kayıtları göremez; yalnızca get_customer_reliability özetini görür.)
create policy "assessments_select" on public.customer_assessments for select to authenticated
  using (customer_id = auth.uid() or public.is_business_member(business_id) or public.is_platform_admin());

-- İtirazlar
create policy "disputes_select" on public.assessment_disputes for select to authenticated
  using (
    customer_id = auth.uid()
    or public.is_platform_admin()
    or exists (select 1 from public.customer_assessments ca
               where ca.id = assessment_id and public.is_business_member(ca.business_id))
  );
create policy "disputes_insert" on public.assessment_disputes for insert to authenticated
  with check (
    customer_id = auth.uid()
    and exists (select 1 from public.customer_assessments ca
                where ca.id = assessment_id
                  and ca.customer_id = auth.uid()
                  and ca.voided_at is null
                  and ca.updated_at > now() - interval '30 days')
  );
revoke insert, update on public.assessment_disputes from anon, authenticated;
grant insert (assessment_id, customer_id, reason) on public.assessment_disputes to authenticated;

-- RPC yetkileri: anonim kullanıcı yalnızca müsaitlik sorgulayabilir
revoke execute on function public.create_appointment(uuid, timestamptz, uuid[], int, uuid, text) from public, anon;
revoke execute on function public.cancel_appointment(uuid, text) from public, anon;
revoke execute on function public.business_update_appointment(uuid, text, text) from public, anon;
revoke execute on function public.submit_customer_assessment(uuid, public.attendance_outcome, public.payment_outcome) from public, anon;
revoke execute on function public.get_customer_reliability(uuid) from public, anon;
revoke execute on function public.reply_to_review(uuid, text) from public, anon;
revoke execute on function public.resolve_dispute(uuid, boolean, text) from public, anon;
revoke execute on function public.record_consent(public.consent_type, text, boolean) from public, anon;
grant execute on function public.create_appointment(uuid, timestamptz, uuid[], int, uuid, text) to authenticated;
grant execute on function public.cancel_appointment(uuid, text) to authenticated;
grant execute on function public.business_update_appointment(uuid, text, text) to authenticated;
grant execute on function public.submit_customer_assessment(uuid, public.attendance_outcome, public.payment_outcome) to authenticated;
grant execute on function public.get_customer_reliability(uuid) to authenticated;
grant execute on function public.reply_to_review(uuid, text) to authenticated;
grant execute on function public.resolve_dispute(uuid, boolean, text) to authenticated;
grant execute on function public.record_consent(public.consent_type, text, boolean) to authenticated;
grant execute on function public.get_available_slots(uuid, date, int, int, uuid, uuid[]) to anon, authenticated;

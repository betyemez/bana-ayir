-- =====================================================================
-- İzin / kapatma: işletmenin tamamı veya tek bir personel/kaynak için,
-- bir veya birkaç gün, tam gün ya da belirli saat aralığında.
-- Kapatılan zaman müşteriye hiç gösterilmez (get_available_slots) ve
-- o zamana randevu alınamaz (create_appointment aynı fonksiyonu kullanır).
-- =====================================================================

-- Kaynağın aynı işletmeye ait olduğunu veritabanı garanti etsin diye bileşik anahtar
alter table public.resources add constraint resources_id_business_key unique (id, business_id);

alter table public.business_closures
  add column resource_id uuid,
  add column start_time  time,
  add column end_time    time,
  add column created_at  timestamptz not null default now(),
  add constraint business_closures_resource_fk
    foreign key (resource_id, business_id) references public.resources (id, business_id) on delete cascade,
  add constraint business_closures_time_check check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  ),
  add constraint business_closures_reason_check check (char_length(reason) <= 200);

comment on column public.business_closures.resource_id is 'null: tüm işletme kapalı; dolu: yalnızca bu personel/kaynak izinli';
comment on column public.business_closures.start_time is 'null: tam gün; dolu: aralıktaki her gün bu saatler arası kapalı';

-- Açıklama alanı kişisel bilgi içerebilir ("Ayşe hasta"). Müşteriler kapatma kayıtlarını görmez;
-- müsaitlik zaten get_available_slots üzerinden hesaplanıyor.
drop policy "business_closures_select" on public.business_closures;
create policy "business_closures_select" on public.business_closures for select to authenticated
  using (public.is_business_member(business_id));
revoke select on public.business_closures from anon;

-- Müsaitlik: izin/kapatma kayıtlarını hesaba katan sürüm
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

  -- İşletmenin tamamı tam gün kapalıysa hiç hesaplama yapma
  if exists (select 1 from business_closures c
             where c.business_id = p_business and c.resource_id is null and c.start_time is null
               and p_date between c.starts_on and c.ends_on) then
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
  ),
  closed as (
    -- Bu güne denk gelen kapatmalar; tam gün olanlar tüm günü kaplar
    select c.resource_id,
           case when c.start_time is null then '-infinity'::timestamptz
                else (p_date + c.start_time) at time zone b.timezone end as cs,
           case when c.start_time is null then 'infinity'::timestamptz
                else (p_date + c.end_time) at time zone b.timezone end as ce
    from business_closures c
    where c.business_id = p_business and p_date between c.starts_on and c.ends_on
  )
  select sl.s, sl.e, array_agg(res.id order by res.id)
  from slots sl
  cross join res
  where sl.s >= now() + make_interval(mins => b.min_notice_minutes)
    and sl.s <= now() + make_interval(days => b.max_advance_days)
    and not exists (
          select 1 from closed c
          where (c.resource_id is null or c.resource_id = res.id)
            and tstzrange(c.cs, c.ce) && tstzrange(sl.s, sl.e)
        )
    and coalesce((
          select sum(a.party_size) from appointments a
          where a.resource_id = res.id
            and a.status in ('pending', 'confirmed')
            and tstzrange(a.starts_at, a.ends_at) && tstzrange(sl.s, sl.e)
        ), 0) + p_party_size <= res.capacity
  group by sl.s, sl.e
  order by sl.s;
end $$;

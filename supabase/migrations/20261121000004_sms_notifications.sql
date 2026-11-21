-- =====================================================================
-- SMS bildirimleri: onay, hatırlatma, işletme iptali
--
-- Akış:
--   1. appointments üzerindeki tetikleyici, gönderilecek SMS'leri sms_outbox kuyruğuna yazar.
--   2. pg_cron her dakika send-sms Edge Function'ını çağırır (kurulum: supabase/setup/sms-cron.sql).
--   3. Fonksiyon claim_sms_batch() ile vadesi gelen kayıtları alır, SMS'i gönderir,
--      sonucu complete_sms() ile yazar.
--
-- Tasarım kararları:
--   * Kuyrukta telefon ve mesaj metni SAKLANMAZ. Gönderim anında randevunun güncel hali
--     okunur; böylece iptal edilen randevuya hatırlatma gitmez, telefon değişikliği yansır
--     ve kuyruk kişisel veri biriktirmez (KVKK: veri minimizasyonu).
--   * Bu mesajlar randevuyla ilgili bilgilendirme iletileridir (sözleşmenin ifası).
--     Reklam/kampanya içeremez; ticari ileti için ayrıca İYS onayı gerekir.
--   * Her randevu için her türden en fazla bir SMS (unique kısıtı).
-- =====================================================================

-- İşletme ayarı: randevudan kaç saat önce hatırlatma gitsin (0 = kapalı)
alter table public.businesses
  add column sms_reminder_hours int not null default 24 check (sms_reminder_hours between 0 and 72);
grant update (sms_reminder_hours) on public.businesses to authenticated;

create type public.sms_kind   as enum ('confirmation', 'reminder', 'cancellation');
create type public.sms_status as enum ('queued', 'sending', 'sent', 'failed', 'skipped');

create table public.sms_outbox (
  id             bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  kind           public.sms_kind not null,
  send_after     timestamptz not null default now(),
  status         public.sms_status not null default 'queued',
  attempts       int not null default 0,
  claimed_at     timestamptz,
  sent_at        timestamptz,
  provider_ref   text,
  last_error     text,
  created_at     timestamptz not null default now(),
  unique (appointment_id, kind)
);
create index on public.sms_outbox (send_after) where status = 'queued';
create index on public.sms_outbox (claimed_at) where status = 'sending';

-- RLS açık, politika yok: kuyruğa yalnızca tetikleyici ve servis rolü erişir.
alter table public.sms_outbox enable row level security;
revoke all on public.sms_outbox from anon, authenticated;

-- ---------------------------------------------------------------------
-- Kuyruğa ekleme
-- ---------------------------------------------------------------------
create or replace function public.enqueue_appointment_sms() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_hours int;
begin
  -- Geçmiş randevular için bildirim yok (ör. sonradan girilen kayıtlar)
  if new.starts_at <= now() then return new; end if;

  if tg_op = 'INSERT' or old.status is distinct from new.status then
    if new.status = 'confirmed' then
      insert into sms_outbox (appointment_id, kind) values (new.id, 'confirmation')
      on conflict do nothing;
    elsif new.status = 'cancelled_by_business' then
      insert into sms_outbox (appointment_id, kind) values (new.id, 'cancellation')
      on conflict do nothing;
    end if;
  end if;

  -- Hatırlatma randevu oluşurken planlanır. Gönderim anında randevu onaylı değilse atlanır.
  -- Hatırlatma saatine 30 dakikadan az kaldıysa gönderilmez; onay SMS'i yeterli.
  if tg_op = 'INSERT' and new.status in ('pending', 'confirmed') then
    select sms_reminder_hours into v_hours from businesses where id = new.business_id;
    if v_hours > 0 and new.starts_at - make_interval(hours => v_hours) > now() + interval '30 minutes' then
      insert into sms_outbox (appointment_id, kind, send_after)
      values (new.id, 'reminder', new.starts_at - make_interval(hours => v_hours))
      on conflict do nothing;
    end if;
  end if;

  return new;
end $$;

create trigger appointments_enqueue_sms
  after insert or update of status on public.appointments
  for each row execute function public.enqueue_appointment_sms();

-- ---------------------------------------------------------------------
-- Gönderici (Edge Function, servis rolü) için RPC'ler
-- ---------------------------------------------------------------------

-- Vadesi gelen kayıtları kilitleyip "sending" durumuna alır ve gönderim için gereken
-- güncel bilgileri döndürür. Artık geçerli olmayanları (iptal edilmiş randevuya hatırlatma,
-- telefonu olmayan müşteri vb.) "skipped" yapar. Eşzamanlı çağrılar aynı kaydı alamaz.
create or replace function public.claim_sms_batch(p_limit int default 50)
returns table (
  id            bigint,
  kind          public.sms_kind,
  phone         text,
  customer_name text,
  business_name text,
  business_phone text,
  timezone      text,
  starts_at     timestamptz,
  party_size    int
)
language plpgsql security definer set search_path = public as $$
begin
  -- Yanıtı gelmeden kalan gönderimler tekrar denenmez: SMS gitmiş olabilir,
  -- müşteriye aynı mesajı iki kez atmaktansa kaydı başarısız saymak daha doğru.
  update sms_outbox o set status = 'failed', last_error = 'timeout'
  where o.status = 'sending' and o.claimed_at < now() - interval '10 minutes';

  return query
  with due as (
    select o.id
    from sms_outbox o
    where o.status = 'queued' and o.send_after <= now()
    order by o.send_after
    limit greatest(1, least(p_limit, 200))
    for update skip locked
  ),
  checked as (
    select d.id,
      case
        when a.starts_at <= now() then 'appointment_passed'
        when p.phone is null or p.phone = '' then 'no_phone'
        when o.kind in ('confirmation', 'reminder') and a.status <> 'confirmed' then 'status_changed'
        when o.kind = 'cancellation' and a.status <> 'cancelled_by_business' then 'status_changed'
      end as skip_reason
    from due d
    join sms_outbox o on o.id = d.id
    join appointments a on a.id = o.appointment_id
    join profiles p on p.id = a.customer_id
  ),
  upd as (
    update sms_outbox o set
      status     = case when c.skip_reason is null then 'sending' else 'skipped' end::sms_status,
      attempts   = o.attempts + case when c.skip_reason is null then 1 else 0 end,
      claimed_at = now(),
      last_error = coalesce(c.skip_reason, o.last_error)
    from checked c
    where o.id = c.id
    returning o.id, o.kind, o.status, o.appointment_id
  )
  select u.id, u.kind, p.phone, p.full_name, b.name, b.phone, b.timezone, a.starts_at, a.party_size
  from upd u
  join appointments a on a.id = u.appointment_id
  join profiles p on p.id = a.customer_id
  join businesses b on b.id = a.business_id
  where u.status = 'sending';
end $$;

-- Gönderim sonucunu yazar. Geçici hatalarda en fazla 3 deneme yapılır (5 / 10 dk arayla).
create or replace function public.complete_sms(
  p_id bigint, p_ok boolean, p_ref text default null, p_error text default null, p_retry boolean default true
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_ok then
    update sms_outbox set status = 'sent', sent_at = now(), provider_ref = p_ref, last_error = null
    where id = p_id and status = 'sending';
  else
    update sms_outbox set
      status     = case when p_retry and attempts < 3 then 'queued' else 'failed' end::sms_status,
      send_after = case when p_retry and attempts < 3 then now() + make_interval(mins => 5 * attempts) else send_after end,
      last_error = left(p_error, 500)
    where id = p_id and status = 'sending';
  end if;
end $$;

revoke execute on function public.enqueue_appointment_sms() from public, anon, authenticated;
revoke execute on function public.claim_sms_batch(int) from public, anon, authenticated;
revoke execute on function public.complete_sms(bigint, boolean, text, text, boolean) from public, anon, authenticated;
grant all on public.sms_outbox to service_role;
grant execute on function public.claim_sms_batch(int) to service_role;
grant execute on function public.complete_sms(bigint, boolean, text, text, boolean) to service_role;

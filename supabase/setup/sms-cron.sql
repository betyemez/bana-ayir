-- =====================================================================
-- SMS gönderimini her dakika tetikleyen zamanlanmış görev.
-- Migration DEĞİLDİR: gizli değer içerdiği için Supabase SQL Editor'de elle, bir kez çalıştırılır.
--
-- Önce:
--   1. send-sms fonksiyonunu dağıtın:  npx supabase functions deploy send-sms --no-verify-jwt
--   2. Uzun, rastgele bir CRON_SECRET üretin ve fonksiyon secret'ı olarak ekleyin:
--        npx supabase secrets set CRON_SECRET=<değer>
--   3. Aşağıdaki <PROJE_REF> ve <CRON_SECRET> yerlerini doldurup çalıştırın.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Gizli değerler Vault'ta saklanır; cron komutunda düz metin olarak durmaz.
select vault.create_secret('https://<PROJE_REF>.supabase.co', 'project_url');
select vault.create_secret('<CRON_SECRET>', 'sms_cron_secret');

select cron.schedule(
  'send-sms',
  '* * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-sms',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sms_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Kontrol:
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select status, kind, count(*) from sms_outbox group by 1, 2;
--   select * from sms_outbox where status = 'failed' order by id desc limit 20;
-- Durdurmak için:
--   select cron.unschedule('send-sms');

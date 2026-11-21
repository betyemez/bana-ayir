// Kuyruktaki SMS'leri gönderir. pg_cron her dakika çağırır (supabase/setup/sms-cron.sql).
//
// Ortam değişkenleri (Supabase → Edge Functions → Secrets):
//   CRON_SECRET       pg_cron'un x-cron-secret başlığında gönderdiği değerle aynı olmalı
//   SMS_PROVIDER      log | netgsm  (varsayılan: log, gerçek SMS gitmez)
//   SITE_URL          mesajdaki bağlantı (varsayılan: banaayir.com)
//   NETGSM_USERCODE, NETGSM_PASSWORD, NETGSM_HEADER   (SMS_PROVIDER=netgsm ise)
// SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik tanımlanır.
//
// Dağıtım: npx supabase functions deploy send-sms --no-verify-jwt
// (JWT yerine CRON_SECRET ile korunur.)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildMessage, normalizeTrMobile, type SmsJob } from './messages.ts';
import { getProvider } from './providers.ts';

const BATCH = 50;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET') ?? '';
  if (!secret || !safeEqual(req.headers.get('x-cron-secret') ?? '', secret)) {
    return new Response('unauthorized', { status: 401 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const provider = getProvider();
  const siteUrl = (Deno.env.get('SITE_URL') || 'banaayir.com').replace(/^https?:\/\//, '').replace(/\/$/, '');

  const { data, error } = await supabase.rpc('claim_sms_batch', { p_limit: BATCH });
  if (error) {
    console.error('claim_sms_batch', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const jobs = (data ?? []) as SmsJob[];
  let sent = 0, failed = 0;
  for (const job of jobs) {
    const phone = normalizeTrMobile(job.phone);
    const result = phone
      ? await provider.send(phone, buildMessage(job, siteUrl))
      : { ok: false, error: 'invalid_phone', retry: false };

    const { error: e } = await supabase.rpc('complete_sms', {
      p_id: job.id,
      p_ok: result.ok,
      p_ref: result.ref ?? null,
      p_error: result.error ?? null,
      p_retry: result.retry ?? true,
    });
    if (e) console.error('complete_sms', job.id, e);
    if (result.ok) sent++;
    else {
      failed++;
      console.warn(`sms ${job.id} (${job.kind}) gönderilemedi: ${result.error}`);
    }
  }

  return new Response(JSON.stringify({ provider: provider.name, claimed: jobs.length, sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

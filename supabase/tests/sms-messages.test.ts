// SMS metinlerini test eder: node supabase/tests/sms-messages.test.ts
import { buildMessage, normalizeTrMobile, whenText, type SmsJob } from '../functions/send-sms/messages.ts';

let fail = 0;
const ok = (cond: boolean, name: string, extra = '') => {
  console.log(cond ? '  ✓' : '  ✗', name, cond ? '' : extra);
  if (!cond) fail++;
};

const TZ = 'Europe/Istanbul';
const now = new Date('2026-11-21T09:00:00Z'); // İstanbul 12:00, Cumartesi

console.log('SMS metinleri');
ok(whenText('2026-11-21T11:30:00Z', TZ, now) === 'bugün 14:30', 'bugün', whenText('2026-11-21T11:30:00Z', TZ, now));
ok(whenText('2026-11-22T06:00:00Z', TZ, now) === 'yarın 09:00', 'yarın', whenText('2026-11-22T06:00:00Z', TZ, now));
// İstanbul'da gece yarısını geçen saat: UTC'de aynı gün, yerelde ertesi gün
ok(whenText('2026-11-21T21:30:00Z', TZ, now) === 'yarın 00:30', 'saat dilimi gün sınırı', whenText('2026-11-21T21:30:00Z', TZ, now));
ok(whenText('2026-11-28T11:30:00Z', TZ, now) === '28 Kasım Cumartesi 14:30', 'ileri tarih', whenText('2026-11-28T11:30:00Z', TZ, now));

const job: SmsJob = {
  id: 1, kind: 'confirmation', phone: '905320000001', customer_name: 'Ahmet Yılmaz',
  business_name: 'Makas Sanat Erkek Kuaförü ve Bakım Salonu Nilüfer Şubesi', business_phone: null,
  timezone: TZ, starts_at: '2026-11-22T06:00:00Z', party_size: 1,
};
for (const kind of ['confirmation', 'reminder', 'cancellation'] as const) {
  const m = buildMessage({ ...job, kind }, 'banaayir.com', now);
  console.log(`    ${kind} (${m.length}): ${m}`);
  ok(m.length <= 155, `${kind}: tek SMS'e sığıyor`, `(${m.length} karakter)`);
}

// En uzun tarih metni: "26 Ağustos Çarşamba 14:30"
for (const kind of ['confirmation', 'reminder', 'cancellation'] as const) {
  const m = buildMessage({ ...job, kind, starts_at: '2026-08-26T11:30:00Z' }, 'banaayir.com', now);
  ok(m.length <= 155, `${kind} + uzun tarih: tek SMS'e sığıyor`, `(${m.length}) ${m}`);
}

console.log('Telefon');
ok(normalizeTrMobile('+90 532 000 00 01') === '5320000001', '+90 ile');
ok(normalizeTrMobile('905320000001') === '5320000001', 'Supabase biçimi');
ok(normalizeTrMobile('05320000001') === '5320000001', '0 ile');
ok(normalizeTrMobile('02242000000') === null, 'sabit hat reddedilir');
ok(normalizeTrMobile('4915112345678') === null, 'yabancı numara reddedilir');

process.exit(fail ? 1 : 0);

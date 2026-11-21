// SMS metinleri. Saf fonksiyonlar: Deno (Edge Function) ve Node (test) ikisinde de çalışır.
// Türkçe karakterli SMS'te tek mesaj sınırı ~155 karakterdir; metinler bu sınırın altında tutulur.

export type SmsKind = 'confirmation' | 'reminder' | 'cancellation';

export interface SmsJob {
  id: number;
  kind: SmsKind;
  phone: string;
  customer_name: string | null;
  business_name: string;
  business_phone: string | null;
  timezone: string;
  starts_at: string;
  party_size: number;
}

const SIGN = '- Bana Ayır';

/** Uzun işletme adlarını kısaltır; mesaj tek SMS'e sığsın. */
function shortName(name: string, max = 32): string {
  const n = name.trim().replace(/\s+/g, ' ');
  return n.length <= max ? n : n.slice(0, max - 1).trimEnd() + '…';
}

function ymd(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** "bugün 14:30", "yarın 09:00" ya da "28 Kasım Cuma 14:30" */
export function whenText(startsAt: string, timeZone: string, now = new Date()): string {
  const start = new Date(startsAt);
  const time = new Intl.DateTimeFormat('tr-TR', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(start);
  const day = ymd(start, timeZone);
  if (day === ymd(now, timeZone)) return `bugün ${time}`;
  if (day === ymd(new Date(now.getTime() + 86_400_000), timeZone)) return `yarın ${time}`;
  const date = new Intl.DateTimeFormat('tr-TR', { timeZone, day: 'numeric', month: 'long', weekday: 'long' }).format(start);
  return `${date} ${time}`;
}

export function buildMessage(job: SmsJob, siteUrl: string, now = new Date()): string {
  const biz = shortName(job.business_name);
  const when = whenText(job.starts_at, job.timezone, now);
  const manage = `${siteUrl}/randevularim`;
  switch (job.kind) {
    case 'confirmation':
      return `${biz}, ${when} vaktini sana ayırdı. İptal için: ${manage} ${SIGN}`;
    case 'reminder':
      return `Hatırlatma: ${biz} ${when} seni bekliyor. Gelemeyeceksen iptal et: ${manage} ${SIGN}`;
    case 'cancellation':
      return `${biz}, ${when} randevunu iptal etti. Yeni bir vakit seçmek için: ${siteUrl} ${SIGN}`;
  }
}

/** Türk GSM numarasını 5XXXXXXXXX biçimine getirir; geçersizse null. */
export function normalizeTrMobile(phone: string): string | null {
  let d = phone.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('90')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^5\d{9}$/.test(d) ? d : null;
}

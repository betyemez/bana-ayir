// Web ve mobil uygulamaların ortak kullandığı tipler, etiketler ve yardımcılar.
// Enum değerleri supabase/migrations içindeki tiplerle birebir aynı olmalıdır.

export type MemberRole = 'owner' | 'manager' | 'staff';
export type BookingMode = 'service' | 'reservation';
export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'no_show'
  | 'cancelled_by_customer'
  | 'cancelled_by_business';
export type AttendanceOutcome = 'on_time' | 'late' | 'no_show';
export type PaymentOutcome = 'paid_full' | 'paid_partial' | 'unpaid' | 'not_applicable';
export type DisputeStatus = 'open' | 'upheld' | 'rejected';
export type ConsentType =
  | 'kvkk_aydinlatma'
  | 'uyelik_sozlesmesi'
  | 'acik_riza_degerlendirme'
  | 'ticari_ileti';

export interface ItemField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'tags' | 'select';
  options?: string[];
}

export interface BusinessCategory {
  id: number;
  slug: string;
  name: string;
  list_label: string;
  booking_mode: BookingMode;
  default_duration_minutes: number;
  item_fields: ItemField[];
}

export interface Business {
  id: string;
  owner_id: string;
  category_id: number;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  cover_url: string | null;
  logo_url: string | null;
  timezone: string;
  booking_mode: BookingMode;
  slot_interval_minutes: number;
  default_duration_minutes: number;
  min_notice_minutes: number;
  max_advance_days: number;
  cancellation_window_hours: number;
  max_party_size: number;
  auto_confirm: boolean;
  /** Randevudan kaç saat önce SMS hatırlatma gider (0 = kapalı) */
  sms_reminder_hours: number;
  is_published: boolean;
}

export interface CatalogItem {
  id: string;
  business_id: string;
  section_id: string | null;
  name: string;
  description: string | null;
  price: number | null;
  price_is_from: boolean;
  currency: string;
  duration_minutes: number | null;
  is_bookable: boolean;
  attributes: Record<string, unknown>;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface AvailableSlot {
  slot_start: string;
  slot_end: string;
  resource_ids: string[];
}

export interface CustomerReliability {
  total_appointments: number;
  attended: number;
  late_arrivals: number;
  no_shows: number;
  late_cancellations: number;
  payment_issues: number;
  reliability_pct: number | null;
  enough_data: boolean;
}

// ---------------------------------------------------------------------
// Türkçe etiketler
// ---------------------------------------------------------------------
export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: 'Onay bekliyor',
  confirmed: 'Onaylandı',
  completed: 'Tamamlandı',
  no_show: 'Gelmedi',
  cancelled_by_customer: 'Müşteri iptal etti',
  cancelled_by_business: 'İşletme iptal etti',
};

export const ATTENDANCE_LABEL: Record<AttendanceOutcome, string> = {
  on_time: 'Zamanında geldi',
  late: 'Geç geldi (15 dk+)',
  no_show: 'Gelmedi, haber vermedi',
};

export const PAYMENT_LABEL: Record<PaymentOutcome, string> = {
  paid_full: 'Ödemeyi tam yaptı',
  paid_partial: 'Eksik ödeme yaptı',
  unpaid: 'Ödeme yapmadı',
  not_applicable: 'Ödeme söz konusu değil',
};

// Onay metinlerinin sürümleri. Metin değiştiğinde sürüm artırılır ve kullanıcıdan yeniden onay alınır.
export const CONSENT_VERSIONS: Record<ConsentType, string> = {
  kvkk_aydinlatma: '2026-11-21',
  uyelik_sozlesmesi: '2026-11-21',
  acik_riza_degerlendirme: '2026-11-21',
  ticari_ileti: '2026-11-21',
};

// Veritabanı RPC hata kodları -> kullanıcı mesajı
export const RPC_ERROR_MESSAGE: Record<string, string> = {
  not_authenticated: 'Devam etmek için giriş yapın.',
  business_not_found: 'İşletme bulunamadı.',
  invalid_party_size: 'Kişi sayısı geçersiz.',
  booking_not_allowed: 'Bu işletmeden randevu alamazsınız.',
  too_many_active_appointments: 'Bu işletmede zaten 3 aktif randevunuz var.',
  invalid_items: 'Seçilen hizmetlerden biri artık mevcut değil.',
  slot_unavailable: 'Bu saat az önce doldu, lütfen başka bir saat seçin.',
  cannot_cancel: 'Bu randevu iptal edilemez.',
  invalid_state: 'Randevunun durumu bu işleme uygun değil.',
  too_early: 'Değerlendirme randevu saatinden sonra yapılabilir.',
  window_closed: 'Değerlendirme süresi (7 gün) doldu.',
  invalid_payment: 'Gelmeyen müşteri için ödeme bilgisi girilemez.',
  assessment_disputed: 'Bu değerlendirmeye itiraz edildiği için değiştirilemez.',
  not_allowed: 'Bu bilgiyi görüntüleme yetkiniz yok.',
  not_found: 'Kayıt bulunamadı.',
};

export function rpcErrorMessage(error: { message?: string } | null | undefined): string {
  if (!error?.message) return 'Beklenmeyen bir hata oluştu.';
  const code = Object.keys(RPC_ERROR_MESSAGE).find((k) => error.message!.includes(k));
  return code ? RPC_ERROR_MESSAGE[code] : 'Beklenmeyen bir hata oluştu.';
}

// ---------------------------------------------------------------------
// Telefon numarası (E.164). Varsayılan ülke: Türkiye.
// "0532 123 45 67", "532 123 4567", "+90 532..." -> "+905321234567"
// ---------------------------------------------------------------------
export function normalizePhone(input: string, defaultCountryCode = '90'): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  let e164: string;
  if (trimmed.startsWith('+')) e164 = digits;
  else if (digits.startsWith('00')) e164 = digits.slice(2);
  else if (defaultCountryCode === '90' && digits.length === 11 && digits.startsWith('0')) e164 = '90' + digits.slice(1);
  else if (defaultCountryCode === '90' && digits.length === 10 && digits.startsWith('5')) e164 = '90' + digits;
  else if (digits.startsWith(defaultCountryCode)) e164 = digits;
  else return null;

  if (e164.length < 10 || e164.length > 15) return null;
  if (e164.startsWith('90') && !/^905\d{9}$/.test(e164)) return null; // TR: yalnızca cep numarası
  return '+' + e164;
}

/** "+905321234567" veya "905321234567" (Supabase'in sakladığı biçim) -> "0532 123 45 67" */
export function formatPhoneTR(e164: string): string {
  const m = /^\+?90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}

export function formatPrice(price: number | null, currency = 'TRY', isFrom = false): string {
  if (price == null) return '';
  const whole = Number.isInteger(price);
  const s = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(price);
  // "'den/'dan/'ten/'tan" eki sayıya göre değiştiği için ek kullanmıyoruz.
  return isFrom ? `${s} ve üzeri` : s;
}

export function slugify(text: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u' };
  return text
    .replace(/[çğıİöşü]/gi, (c) => map[c] ?? map[c.toLowerCase()] ?? c)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ---------------------------------------------------------------------
// Tarih/saat: her şey işletmenin saat diliminde gösterilir.
// ---------------------------------------------------------------------
/** Bugünden başlayarak işletme saat dilimindeki `count` günün YYYY-MM-DD anahtarları. */
export function upcomingDateKeys(timeZone: string, count: number, from = new Date()): string[] {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const keys: string[] = [];
  for (let i = 0; keys.length < count && i < count + 2; i++) {
    const k = fmt.format(new Date(from.getTime() + i * 86_400_000));
    if (!keys.includes(k)) keys.push(k);
  }
  return keys;
}

export function formatDateKeyTR(key: string): { weekday: string; day: string } {
  const d = new Date(`${key}T12:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat('tr-TR', { weekday: 'short', timeZone: 'UTC' }).format(d),
    day: new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d),
  };
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso));
}

export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone,
  }).format(new Date(iso));
}

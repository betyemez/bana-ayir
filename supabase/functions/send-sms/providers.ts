// SMS sağlayıcıları. Ortam değişkeni SMS_PROVIDER ile seçilir:
//   log    → gerçek SMS göndermez, yalnızca loglar (varsayılan; geliştirme ve deneme için)
//   netgsm → Netgsm REST v2
// Başka bir sağlayıcı (İleti Merkezi vb.) eklemek için SmsProvider arayüzünü uygulamak yeterli.

export interface SendResult {
  ok: boolean;
  ref?: string;
  error?: string;
  /** false ise tekrar denemenin anlamı yok (geçersiz numara, hatalı metin vb.) */
  retry?: boolean;
}

export interface SmsProvider {
  name: string;
  send(phone: string, message: string): Promise<SendResult>;
}

const env = (k: string) => Deno.env.get(k) ?? '';

export function getProvider(): SmsProvider {
  const name = env('SMS_PROVIDER') || 'log';
  if (name === 'netgsm') return netgsm();
  if (name === 'log') return logOnly();
  throw new Error(`Bilinmeyen SMS_PROVIDER: ${name}`);
}

function logOnly(): SmsProvider {
  return {
    name: 'log',
    async send(phone, message) {
      // Telefonun yalnızca son 4 hanesi loglanır.
      console.log(`[sms:log] ***${phone.slice(-4)} (${message.length} kr): ${message}`);
      return { ok: true, ref: 'log' };
    },
  };
}

// Netgsm REST v2 (resmi istemci github.com/netgsm/netgsm-sms-js, src/legacy ile karşılaştırıldı).
// Başarı: HTTP 200, code "00" (veya tarih düzeltmesiyle kabul: "01", "02").
// Netgsm hataları HTTP 406 + JSON { code, description } olarak döner.
// iysfilter "0": ticari içerik yok, bilgilendirme iletisi (İYS kontrolü yapılmaz).
// Not: Netgsm'in yeni v3 API'si (ext-api.netgsm.com.tr/sms/v3, token ile) ayrı bir API'dir; v2 hâlâ destekleniyor.
function netgsm(): SmsProvider {
  const user = env('NETGSM_USERCODE');
  const pass = env('NETGSM_PASSWORD');
  const header = env('NETGSM_HEADER');
  if (!user || !pass || !header) throw new Error('NETGSM_USERCODE, NETGSM_PASSWORD ve NETGSM_HEADER tanımlı olmalı');
  const auth = 'Basic ' + btoa(`${user}:${pass}`);

  const ERRORS: Record<string, { text: string; retry: boolean }> = {
    '20': { text: 'Mesaj metni hatalı ya da çok uzun', retry: false },
    '30': { text: 'Geçersiz kullanıcı/şifre ya da API erişim izni yok (IP kısıtı?)', retry: true },
    '40': { text: 'Mesaj başlığı (gönderici adı) tanımlı değil', retry: true },
    '50': { text: 'İYS kontrollü hesap: gönderim yapılamadı', retry: false },
    '51': { text: 'İYS marka kodu bulunamadı', retry: false },
    '70': { text: 'Hatalı ya da eksik parametre', retry: false },
    '80': { text: 'Gönderim sınırı aşıldı', retry: true },
    '85': { text: 'Mükerrer gönderim sınırı aşıldı (aynı numaraya 1 dakikada 20+ görev)', retry: true },
    '100': { text: 'Netgsm sistem hatası', retry: true },
    '101': { text: 'Netgsm sistem hatası', retry: true },
  };
  const SUCCESS = new Set(['00', '01', '02']);

  return {
    name: 'netgsm',
    async send(phone, message) {
      let res: Response;
      try {
        res = await fetch('https://api.netgsm.com.tr/sms/rest/v2/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: auth },
          body: JSON.stringify({
            msgheader: header,
            encoding: 'TR',
            iysfilter: '0',
            messages: [{ msg: message, no: phone }],
          }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        return { ok: false, error: `netgsm bağlantı hatası: ${(e as Error).message}`, retry: true };
      }
      const text = await res.text();
      let body: { code?: string; jobid?: string; description?: string } = {};
      try { body = JSON.parse(text); } catch { /* düz metin yanıt */ }
      if (res.ok && body.code && SUCCESS.has(body.code)) return { ok: true, ref: body.jobid };
      const known = body.code ? ERRORS[body.code] : undefined;
      return {
        ok: false,
        error: `netgsm ${res.status} kod=${body.code ?? '?'} ${known?.text ?? body.description ?? text.slice(0, 200)}`,
        retry: known?.retry ?? res.status >= 500,
      };
    },
  };
}

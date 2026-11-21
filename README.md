# Bana Ayır

**banaayir.com**: Kuaförden restorana, klinikten halı sahaya kadar randevuyla çalışan her işletme için pazaryeri.
Müşteri işletmeye *"şu vakti bana ayır"* der, işletme *"bu vakti sana ayırdık"* diye yanıtlar.
Müşteri telefon numarasıyla kayıt olur; randevudan sonra iki taraf birbirini değerlendirir.

```
apps/web        Next.js 16: müşteri sitesi + işletme paneli
apps/mobile     Expo SDK 58 (iOS/Android): müşteri uygulaması
packages/shared Ortak tipler, Türkçe etiketler, telefon/tarih yardımcıları
supabase/       Veritabanı şeması, RLS kuralları, RPC fonksiyonları, testler
docs/           KVKK ve değerlendirme sistemi tasarım kararları
```

## Kurulum

### 1. Supabase projesi
1. [supabase.com](https://supabase.com) üzerinde bir proje açın. KVKK açısından bölge seçimi için `docs/` altındaki belgeye bakın.
2. Migration'ları uygulayın. İki yol var:
   - **CLI ile:** `npx supabase link --project-ref <ref>` ve ardından `npx supabase db push`
   - **Elle:** `supabase/migrations/` içindeki dosyaları sırayla SQL Editor'e yapıştırıp çalıştırın.
3. **Authentication → Providers → Phone** ayarını açın ve bir SMS sağlayıcısı bağlayın:
   - Twilio / Vonage / MessageBird doğrudan desteklenir.
   - Türk operatörleri (Netgsm, İleti Merkezi vb.) için **Auth Hooks → Send SMS Hook** ile kendi gönderim fonksiyonumuzu bağlarız. Bu adım henüz yapılmadı.
   - Geliştirme sırasında SMS göndermeden test için: Phone ayarlarında **Test phone numbers** kısmına `905320000001=123456` gibi sabit numara/kod tanımlayın.
4. Kendinizi platform yöneticisi yapmak için (itirazları sonuçlandırma yetkisi):
   `update profiles set is_platform_admin = true where phone = '905...';`

### 2. Ortam değişkenleri
```
apps/web/.env.local      ← apps/web/.env.example dosyasından kopyalayın
apps/mobile/.env         ← apps/mobile/.env.example dosyasından kopyalayın
```
URL ve anon key: Supabase → Project Settings → API.

### 3. Çalıştırma
```bash
npm install
npm run web        # http://localhost:3000
npm run mobile     # Expo: telefonda Expo Go ile QR kodu okutun
npm run test:db    # veritabanı kurallarını ve SMS metinlerini test eder (Docker gerekmez)
```

### 4. SMS bildirimleri (onay, hatırlatma, işletme iptali)
Randevu oluşunca veya durumu değişince veritabanı `sms_outbox` kuyruğuna kayıt düşer.
`send-sms` Edge Function'ı her dakika kuyruğu boşaltır. Gönderim anında randevunun güncel durumu
kontrol edilir: iptal edilmiş randevuya hatırlatma gitmez. Hatırlatma süresini işletme
panelden seçer (varsayılan 1 gün önce, "Gönderme" ile kapatılabilir).

1. Fonksiyonu dağıtın: `npx supabase functions deploy send-sms --no-verify-jwt`
2. Secret'ları girin (önce gerçek SMS göndermeden, `SMS_PROVIDER=log` ile deneyin; mesajlar fonksiyon loglarına düşer):
   ```bash
   npx supabase secrets set CRON_SECRET=<uzun-rastgele-değer> SMS_PROVIDER=log SITE_URL=banaayir.com
   ```
3. `supabase/setup/sms-cron.sql` dosyasındaki yer tutucuları doldurup SQL Editor'de bir kez çalıştırın.
4. Gerçek gönderime geçmek için Netgsm bilgilerini girin:
   ```bash
   npx supabase secrets set SMS_PROVIDER=netgsm NETGSM_USERCODE=... NETGSM_PASSWORD=... NETGSM_HEADER=...
   ```
   - `NETGSM_HEADER`: Netgsm'de onaylı mesaj başlığı (gönderici adı, ör. `BANAAYIR`).
   - Netgsm panelinde API kullanıcısına IP kısıtı varsa Supabase Edge Function'lar sabit IP kullanmaz; kısıtı kaldırın.
   - Bu mesajlar **bilgilendirme** iletisidir (`iysfilter=0`), İYS onayı gerekmez. İçlerine kampanya/reklam eklenmemelidir.

## Temel kavramlar

| Kavram | Açıklama |
|---|---|
| **Kategori** | Sektör. Liste adını ("Menü", "Hizmetler", "Tedaviler"…) ve kalemlerdeki ek alanları belirler (alerjen, seans sayısı, araç tipi…). Yeni sektör eklemek için `business_categories` tablosuna bir satır eklemek yeterli. |
| **Rezervasyon modu** | `service`: hizmet seçilir ve süre hizmetlerden hesaplanır (kuaför, klinik). `reservation`: kişi sayısı seçilir (restoran, etkinlik). |
| **Kaynak** | Aynı anda kaç randevu alınabileceğini belirler. Kuaförde her çalışan bir kaynaktır (kapasite 1). Restoranda her salon bir kaynaktır (kapasite = kişi sayısı). |
| **Katalog** | Bölümler ve kalemler. Restoran menüsü randevuya kapalı (`is_bookable = false`) kalemlerden oluşur. |

## Güvenilirlik puanı

`get_customer_reliability()` son 12 ayı hesaplar:
`(kayıt − gelmedi − geç iptal − 0,5 × ödeme sorunu − 0,25 × geç gelme) / kayıt`.
3 kayıttan az veride yüzde gösterilmez. Açık itirazdaki ve geçersiz sayılan kayıtlar hesaba katılmaz.
Ağırlıklar ürün kararıdır; değiştirmek için yalnızca bu fonksiyonu güncellemek yeterli.

## Sıradaki adımlar
- [ ] Türk SMS sağlayıcısı için Send SMS Hook (Netgsm / İleti Merkezi)
- [x] SMS bildirimleri: randevu onayı, hatırlatma, işletme iptali (Netgsm)
- [ ] Bildirimler: Expo push, değerlendirme hatırlatması, işletmeye yeni randevu bildirimi
- [ ] Görsel yükleme (logo, kapak, kalem fotoğrafı): Supabase Storage
- [ ] Platform yönetici paneli: itirazlar, şikâyet edilen yorumlar
- [ ] Personel davet etme (işletmeye `staff` üye ekleme)
- [ ] Haritada arama (PostGIS), kategori sayfaları ve SEO
- [ ] Hesap silme ve veri dışa aktarma (KVKK md. 11)
- [ ] Ödeme ve kapora (iyzico / PayTR)
- [ ] Avukat incelemesi: aydınlatma metni, açık rıza, üyelik sözleşmesi

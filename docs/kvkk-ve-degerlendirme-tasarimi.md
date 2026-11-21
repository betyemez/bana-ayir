# KVKK ve Değerlendirme Sistemi: Tasarım Kararları

Bu belge, iki yönlü değerlendirme sisteminin kişisel verileri nasıl işlediğini ve
hangi riskleri hangi teknik kararlarla azalttığını özetler. **Hukuki görüş yerine geçmez**;
yayına çıkmadan önce bir avukatın aydınlatma metni, açık rıza metni ve üyelik
sözleşmesini incelemesi gerekir.

## 1. İşletme → Müşteri değerlendirmesi

| Karar | Neden | Nerede |
|---|---|---|
| Yalnızca objektif seçenekler: *zamanında geldi / geç geldi / gelmedi* ve *ödeme tam / eksik / yok* | Serbest metin hakaret, iftira ve özel nitelikli veri (sağlık, din vb.) riskini doğurur | `customer_assessments` tablosunda yorum alanı yok |
| Geç iptal elle girilmez, sistem tarafından hesaplanır | İptal zamanı ve işletmenin iptal penceresi kayıtlı; tartışmaya açık değil | `cancel_appointment()` → `is_late_cancellation` |
| Değerlendirme randevu saatinden sonra ve en geç 7 gün içinde yapılabilir | Rastgele ya da geriye dönük kötü niyetli işaretlemeyi önler | `submit_customer_assessment()` |
| Gelmedi seçilirse ödeme alanı "söz konusu değil" olmak zorunda | Veri tutarlılığı | tablo `check` kısıtı |

## 2. Kim neyi görür? (amaçla sınırlılık, KVKK md. 4)

| Veri | Müşterinin kendisi | Değerlendiren işletme | Müşteriyle randevusu olan diğer işletmeler | Herkes |
|---|---|---|---|---|
| Tek tek değerlendirme kayıtları | ✅ | ✅ (yalnızca kendi verdikleri) | ❌ | ❌ |
| Güvenilirlik özeti (sayılar + yüzde) | ✅ | ✅ | ✅ | ❌ |
| Telefon ve ad | ✅ | ✅ | ✅ | ❌ |

- Güvenilirlik özeti yalnızca **müşteriyle aktif randevu ilişkisi olan** işletmelere açılır.
  Bir işletme, kendisinden randevu almamış birini sorgulayamaz (`get_customer_reliability()`).
- Özet **son 12 ayı** kapsar. Eski kayıtlar puanı etkilemez (saklama süresi ilkesi).
- 3'ten az kayıt varsa yüzde gösterilmez. Az veriyle haksız yargı oluşmasını önler.
- İşletmenin müşteriyi **engellemesi** yalnızca o işletmeyi etkiler, başka işletmelere yansımaz.
  Bu bilinçli bir karar: ortak kara liste kurulmuyor.

## 3. İtiraz hakkı (KVKK md. 11)

- Müşteri kendisi hakkındaki her değerlendirmeyi uygulamada görür.
- 30 gün içinde gerekçeli itiraz açabilir (`assessment_disputes`).
- **İtiraz açık kaldığı sürece kayıt puana dahil edilmez.**
- Platform yöneticisi itirazı kabul ederse kayıt geçersiz sayılır. Yanlışlıkla "gelmedi" işaretlendiyse
  randevu "tamamlandı"ya döner ve müşteri işletmeye yorum yapabilir (`resolve_dispute()`).

## 4. Müşteri → İşletme yorumları

- Yalnızca **tamamlanmış** randevudan sonra ve 30 gün içinde yorum yapılabilir. Böylece sahte yorum engellenir.
- Yorumcunun adı maskelenir ("Ahmet Y."); telefon hiçbir zaman gösterilmez.
- İşletme yoruma herkese açık yanıt verebilir; yorumu silemez.
- Platform yöneticisi şikâyet edilen yorumu `under_review` / `hidden` durumuna alabilir.

## 5. Onaylar (açık rıza ve aydınlatma)

Kayıt sırasında alınacak onaylar:

1. **Aydınlatma metni**: okundu bilgisi (zorunlu)
2. **Üyelik sözleşmesi**: zorunlu
3. **Değerlendirme sistemi için açık rıza**: randevu almak için zorunlu tutulması hukuken
   tartışmalı olabilir. Avukata sorulacak (bkz. açık sorular).
4. **Ticari ileti onayı**: isteğe bağlı. Ticari SMS gönderilecekse İYS'ye kayıt gerekir.

Tüm onaylar `user_consents` tablosunda **sürüm numarası ve zaman damgasıyla, silinmeden**
saklanır (ispat yükü). Metin değişince sürüm artırılır ve kullanıcıdan yeniden onay alınır.

## 6. Teknik güvenlik

- Tüm tablolarda Row Level Security açık. Randevu, değerlendirme ve itiraz yazma işlemleri
  yalnızca doğrulama yapan veritabanı fonksiyonları (RPC) üzerinden yapılır.
- Telefonla giriş SMS ile tek kullanımlık kodla (OTP) yapılır; şifre saklanmaz.
- Veri Türkiye dışında barındırılacaksa (ör. Supabase AB bölgesi) bu **yurt dışına aktarım**
  sayılır (KVKK md. 9, 2024 değişikliği). Standart sözleşme ve KVK Kurumu'na bildirim gerekir.
  Alternatif: Supabase'i Türkiye'de kendi sunucumuzda çalıştırmak.

## Avukata sorulacak açık sorular

1. Güvenilirlik özetinin başka işletmelerle paylaşılması için hangi hukuki sebep kullanılmalı:
   açık rıza mı, meşru menfaat mi?
2. Açık rıza vermeyen kullanıcı randevu alabilmeli mi? (Rızanın hizmet şartına bağlanması yasağı.)
3. Hesap silindiğinde değerlendirme kayıtları ne kadar süre saklanmalı?
4. VERBİS kaydı gerekli mi?
5. Sunucu yeri: yurt içi mi, yurt dışı mı?

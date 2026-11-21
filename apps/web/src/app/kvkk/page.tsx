export const metadata = { title: "KVKK Aydınlatma Metni" };

// TASLAK: Yayından önce avukat tarafından hazırlanan metinle değiştirilecek.
export default function KvkkPage() {
  return (
    <article className="card mx-auto max-w-2xl space-y-4 text-sm leading-relaxed">
      <h1 className="text-xl font-semibold">KVKK Aydınlatma Metni</h1>
      <p className="rounded-lg border border-danger p-3 text-danger">
        Taslak metindir. Hukuki inceleme sonrası güncellenecektir.
      </p>
      <h2 className="font-semibold">İşlenen veriler</h2>
      <p>Ad soyad, cep telefonu numarası, randevu kayıtları, işletmelere verdiğiniz değerlendirmeler ve randevu katılım/ödeme kayıtları.</p>
      <h2 id="degerlendirme" className="font-semibold">Güvenilirlik değerlendirmesi</h2>
      <p>
        Randevu aldığınız işletmeler randevu sonrasında yalnızca şu seçenekleri işaretleyebilir: zamanında geldi, geç geldi,
        gelmedi; ödeme tam, eksik ya da yapılmadı. Geç iptaller sistem tarafından otomatik kaydedilir. Bu kayıtlardan son 12
        ayı kapsayan bir özet oluşturulur. Özet yalnızca sizin randevu aldığınız işletmelere gösterilir. Serbest metin yorum
        yazılamaz.
      </p>
      <h2 className="font-semibold">Haklarınız</h2>
      <p>
        Hakkınızdaki tüm kayıtları “Randevularım” sayfasında görebilir, hatalı kayıtlara 30 gün içinde itiraz edebilirsiniz.
        İnceleme süresince kayıt özetinize dahil edilmez. KVKK md. 11 kapsamındaki diğer talepleriniz için: [iletişim adresi].
      </p>
    </article>
  );
}

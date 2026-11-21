// Bursa için her kategoriden örnek (demo) işletme oluşturur.
// İsimler uydurmadır; gerçek işletmelerle ilgisi yoktur.
//
// Kullanım (repo kökünden):
//   node supabase/seed/demo-bursa.mjs            -> demo işletmeleri (yeniden) oluşturur
//   node supabase/seed/demo-bursa.mjs --temizle  -> yalnızca siler
//   node supabase/seed/demo-bursa.mjs --kapaklar -> yalnızca kapak fotoğraflarını günceller
// Kapak fotoğrafları: apps/web/public/demo (kaynaklar: docs/demo-fotograf-kaynaklari.md)
//
// Supabase'de test numarası tanımlı olmalı: 905551112233=123456
// İşletmeler bu numaranın sahibi olduğu hesapta oluşturulur.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../../apps/web/.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const PHONE = process.env.DEMO_PHONE ?? '+905551112233';
const CODE = process.env.DEMO_CODE ?? '123456';

// h: [hafta içi açılış, kapanış, cumartesi açılış, kapanış, pazar açık mı]
const STD = ['09:00', '19:00', '10:00', '18:00', false];
const DEMO = [
  {
    cat: 'kuafor', name: 'Saç Atölyesi', district: 'Nilüfer', address: 'Özlüce Mah. Demo Sok. No:12',
    desc: 'Kesimden renklendirmeye, saçınız için ihtiyaç duyduğunuz her şey. Uzman ekibimizle size özel vakit ayırıyoruz.',
    resources: ['Elif', 'Burak', 'Selin'], h: STD,
    sections: {
      Kesim: [['Kadın saç kesimi', 900, 45, { gender: 'Kadın' }], ['Erkek saç kesimi', 600, 30, { gender: 'Erkek' }], ['Çocuk saç kesimi', 400, 20, { gender: 'Unisex' }]],
      Renk: [['Dip boya', 1500, 90], ['Röfle', 3000, 150, {}, true], ['Balyaj', 4500, 180, {}, true]],
      Bakım: [['Keratin bakımı', 2500, 120], ['Fön', 400, 30]],
    },
  },
  {
    cat: 'berber', name: 'Usta Berber Setbaşı', district: 'Osmangazi', address: 'Setbaşı Mah. Demo Cad. No:4',
    desc: 'Klasik berberlik, modern dokunuşlar. Sıcak havlu ve ustura tıraşı ile kendinize vakit ayırın.',
    resources: ['Mehmet Usta', 'Kaan'], h: ['08:30', '20:00', '08:30', '20:00', false],
    sections: { Hizmetler: [['Saç kesimi', 500, 30], ['Sakal tıraşı', 300, 20], ['Saç + sakal', 700, 45], ['Ense tıraşı', 150, 10], ['Cilt bakımı', 400, 25]] },
  },
  {
    cat: 'guzellik', name: 'Lavanta Güzellik Merkezi', district: 'Nilüfer', address: 'FSM Bulvarı Demo İş Merkezi K:2',
    desc: 'Cilt bakımı, lazer epilasyon ve kirpik uygulamalarında uzman kadro.',
    resources: ['Uzman Derya', 'Uzman Merve'], h: STD,
    sections: {
      Cilt: [['Klasik cilt bakımı', 1200, 60], ['Hydrafacial', 2200, 60]],
      Epilasyon: [['Lazer epilasyon - tüm bacak', 2500, 60, { sessions: 1 }], ['Lazer epilasyon - koltuk altı', 800, 20, { sessions: 1 }]],
      'Kaş & Kirpik': [['Kaş alma', 250, 15], ['İpek kirpik', 1500, 90], ['Kirpik lifting', 1100, 60]],
    },
  },
  {
    cat: 'tirnak', name: 'Pembe Tırnak Stüdyo', district: 'Nilüfer', address: 'Görükle Mah. Demo Sok. No:7',
    desc: 'Kalıcı oje, protez tırnak ve nail art. Hijyen önceliğimiz.',
    resources: ['Masa 1', 'Masa 2'], h: STD,
    sections: { Eller: [['Manikür', 500, 45], ['Kalıcı oje', 700, 60], ['Protez tırnak', 1500, 120], ['Nail art (tırnak başı)', 50, 5]], Ayaklar: [['Pedikür', 600, 50], ['Ayak kalıcı oje', 650, 45]] },
  },
  {
    cat: 'masaj-spa', name: 'Çekirge Termal Spa', district: 'Osmangazi', address: 'Çekirge Mah. Demo Cad. No:21',
    desc: 'Bursa’nın termal geleneğiyle buluşan masaj ve hamam ritüelleri.',
    resources: ['Masaj Odası 1', 'Masaj Odası 2', 'Hamam'], h: ['10:00', '22:00', '10:00', '22:00', true],
    sections: {
      Masaj: [['Klasik masaj (60 dk)', 2000, 60], ['Aromaterapi masajı', 2400, 60], ['Çift masajı', 4200, 60, { couple: true }]],
      Hamam: [['Kese köpük', 1200, 45], ['Hamam + masaj paketi', 3000, 90]],
    },
  },
  {
    cat: 'restoran', name: 'Tophane Ocakbaşı', district: 'Osmangazi', address: 'Tophane Mah. Demo Sok. No:3',
    desc: 'Tereyağlı döner, pideli köfte ve Bursa’nın sevilen lezzetleri. Kalabalık gruplar için rezervasyon önerilir.',
    resources: [['Salon', 40], ['Teras', 20]], h: ['11:00', '23:00', '11:00', '23:00', true], party: 12,
    sections: {
      Başlangıçlar: [['Mercimek çorbası', 150, null, { vegetarian: true }], ['Cacık', 120, null, { vegetarian: true }], ['Acılı ezme', 140, null, { vegan: true, spicy: true }]],
      'Ana yemekler': [['Tereyağlı döner (pideli)', 650, null, { portion: '1 porsiyon', allergens: ['gluten', 'süt'] }], ['Pideli köfte', 450, null, { allergens: ['gluten'] }], ['İnegöl köfte', 480], ['Adana kebap', 520, null, { spicy: true }]],
      Tatlılar: [['Kemalpaşa tatlısı', 180, null, { allergens: ['gluten', 'süt'] }], ['Kestane şekeri (100 g)', 250]],
    },
  },
  {
    cat: 'kafe', name: 'Koza Avlusu Kahve', district: 'Osmangazi', address: 'Çarşı Demo Han Avlusu No:9',
    desc: 'Tarihi çarşının ortasında, avlu keyfiyle kahve molası.',
    resources: [['Avlu', 30], ['İç salon', 16]], h: ['08:00', '22:00', '08:00', '22:00', true], party: 8,
    sections: {
      Kahveler: [['Türk kahvesi', 120], ['Filtre kahve', 140], ['Latte', 160, null, { allergens: ['süt'] }], ['Soğuk demleme', 170]],
      Tatlılar: [['San Sebastian cheesecake', 220, null, { allergens: ['süt', 'yumurta'] }], ['Kestaneli pasta', 240, null, { allergens: ['gluten', 'süt'] }], ['Vegan brownie', 200, null, { vegan: true }]],
    },
  },
  {
    cat: 'dis-hekimi', name: 'Gülümse Ağız ve Diş Sağlığı', district: 'Nilüfer', address: 'Beşevler Mah. Demo Cad. No:15 K:3',
    desc: 'Koruyucu diş hekimliği, estetik uygulamalar ve kanal tedavisi.',
    resources: ['Dt. Zeynep Aydın', 'Dt. Can Öztürk'], h: ['09:00', '18:00', '10:00', '14:00', false],
    sections: {
      Muayene: [['Muayene ve kontrol', 800, 20], ['Diş taşı temizliği', 1500, 30]],
      Tedaviler: [['Dolgu', 2000, 45, { requires_exam: true }, true], ['Kanal tedavisi', 5000, 60, { requires_exam: true }, true], ['Diş beyazlatma', 6000, 60]],
    },
  },
  {
    cat: 'klinik', name: 'Yeşil Vadi Poliklinik', district: 'Nilüfer', address: 'İhsaniye Mah. Demo Sok. No:2',
    desc: 'Dahiliye ve aile hekimliği alanında randevulu muayene.',
    resources: ['Dr. Selim Kara'], h: ['09:00', '17:00', '10:00', '13:00', false],
    sections: { Muayene: [['Dahiliye muayenesi', 1500, 20, { branch: 'Dahiliye' }], ['Kontrol muayenesi', 800, 15, { branch: 'Dahiliye' }], ['Online görüşme', 1200, 20, { online: true }]] },
  },
  {
    cat: 'psikolog', name: 'Denge Psikolojik Danışmanlık', district: 'Nilüfer', address: 'Ataevler Mah. Demo Cad. No:30',
    desc: 'Bireysel ve çift danışmanlığı; yüz yüze veya online.',
    resources: ['Psk. Dan. Ece Yalın'], h: ['10:00', '20:00', '10:00', '16:00', false],
    sections: { Seanslar: [['Bireysel seans (50 dk)', 2500, 50], ['Online bireysel seans', 2200, 50, { online: true }], ['Çift danışmanlığı', 3500, 60]] },
  },
  {
    cat: 'diyetisyen', name: 'Fit Tabak Beslenme', district: 'Nilüfer', address: 'Odunluk Mah. Demo Sok. No:11',
    desc: 'Kişiye özel beslenme programları ve düzenli takip.',
    resources: ['Dyt. Hande Er'], h: STD,
    sections: { Hizmetler: [['İlk görüşme ve analiz', 1500, 45], ['Kontrol görüşmesi', 800, 20], ['Online görüşme', 1000, 30, { online: true }]] },
  },
  {
    cat: 'veteriner', name: 'Pati Veteriner Kliniği', district: 'Yıldırım', address: 'Mimar Sinan Mah. Demo Cad. No:8',
    desc: 'Kedi ve köpek dostlarımız için muayene, aşı ve cerrahi.',
    resources: ['Vet. Hekim Onur Taş'], h: ['09:00', '20:00', '09:00', '18:00', false],
    sections: {
      Muayene: [['Genel muayene', 700, 20, { species: ['kedi', 'köpek'] }]],
      Aşılar: [['Karma aşı', 900, 15, { species: ['kedi', 'köpek'] }], ['Kuduz aşısı', 600, 10]],
      Cerrahi: [['Kısırlaştırma (kedi)', 4000, 90, { species: ['kedi'] }, true]],
    },
  },
  {
    cat: 'pet-kuafor', name: 'Tüylü Dostlar Pet Kuaför', district: 'Nilüfer', address: 'Fethiye Mah. Demo Sok. No:5',
    desc: 'Yıkama, tıraş ve bakım. Dostunuza stressiz bir gün.',
    resources: ['Bakım masası'], h: STD,
    sections: { Hizmetler: [['Yıkama + tarama (küçük ırk)', 600, 45, { pet_size: 'Küçük' }], ['Tıraş (orta ırk)', 900, 60, { pet_size: 'Orta' }], ['Tıraş (büyük ırk)', 1300, 90, { pet_size: 'Büyük' }], ['Tırnak kesimi', 200, 10]] },
  },
  {
    cat: 'spor', name: 'Kuvvet Atölyesi Pilates', district: 'Nilüfer', address: 'Konak Mah. Demo Cad. No:19',
    desc: 'Reformer pilates ve fonksiyonel antrenman. Grup dersleri en fazla 6 kişi.',
    resources: [['Reformer salonu', 6], ['Özel ders odası', 1]], h: ['07:00', '22:00', '09:00', '18:00', true], interval: 60,
    sections: { Dersler: [['Grup reformer dersi', 600, 50, { level: 'Başlangıç' }], ['Özel reformer dersi', 1200, 50, { level: 'Orta' }], ['Fonksiyonel antrenman', 800, 60, { level: 'İleri' }]] },
  },
  {
    cat: 'saha', name: 'Yıldız Halı Saha', district: 'Osmangazi', address: 'Demirtaş Mah. Demo Sok. No:1',
    desc: 'Işıklandırmalı kapalı ve açık sahalar. Soyunma odası ve otopark mevcut.',
    resources: ['Saha A (kapalı)', 'Saha B (açık)'], h: ['10:00', '24:00', '10:00', '24:00', true], interval: 60,
    sections: { Sahalar: [['Halı saha 1 saat', 2500, 60, { surface: 'Suni çim', indoor: true }], ['Halı saha 2 saat', 4800, 120, { surface: 'Suni çim' }]] },
  },
  {
    cat: 'oto-yikama', name: 'Parlak Oto Yıkama', district: 'Yıldırım', address: 'Yiğitler Mah. Demo Cad. No:44',
    desc: 'İç-dış yıkamadan seramik kaplamaya araç bakım hizmetleri.',
    resources: ['Yıkama hattı 1', 'Yıkama hattı 2'], h: ['08:00', '20:00', '08:00', '20:00', true], interval: 30,
    sections: { Yıkama: [['İç-dış yıkama', 400, 30, { vehicle: 'Otomobil' }], ['İç-dış yıkama (SUV)', 500, 40, { vehicle: 'SUV' }], ['Detaylı iç temizlik', 1500, 120]], Bakım: [['Pasta-cila', 3000, 180], ['Seramik kaplama', 9000, 300, {}, true]] },
  },
  {
    cat: 'oto-servis', name: 'Güven Oto Servis', district: 'Nilüfer', address: 'Demo Sanayi Sitesi 3. Blok No:12',
    desc: 'Tüm marka araçlar için periyodik bakım ve onarım.',
    resources: ['Lift 1', 'Lift 2'], h: ['08:30', '18:30', '08:30', '14:00', false], interval: 30,
    sections: { Bakım: [['Periyodik bakım', 3500, 120, { vehicle: 'Tüm markalar' }, true], ['Yağ değişimi', 1800, 45]], Onarım: [['Fren balatası değişimi', 2500, 90, {}, true], ['Arıza tespit', 750, 30]] },
  },
  {
    cat: 'dovme', name: 'Mürekkep Dövme Stüdyosu', district: 'Osmangazi', address: 'Heykel Demo Pasajı No:6',
    desc: 'Özgün tasarım dövmeler ve steril piercing uygulamaları.',
    resources: ['Sanatçı Arda'], h: ['12:00', '21:00', '12:00', '21:00', false], interval: 30,
    sections: { Dövme: [['Tasarım görüşmesi', 0, 30], ['Minimal dövme', 2000, 60, {}, true], ['Orta boy dövme', 5000, 180, {}, true]], Piercing: [['Kulak piercing', 800, 20], ['Burun piercing', 900, 20]] },
  },
  {
    cat: 'fotograf', name: 'Kare Fotoğraf Stüdyosu', district: 'Nilüfer', address: 'Kültür Mah. Demo Sok. No:23',
    desc: 'Vesikalıktan aile çekimine, stüdyoda profesyonel fotoğraf.',
    resources: ['Stüdyo'], h: STD, interval: 30,
    sections: { Paketler: [['Vesikalık / biyometrik', 300, 15, { photos_included: 4 }], ['Aile çekimi', 3000, 60, { photos_included: 15 }], ['Ürün çekimi', 5000, 120, { photos_included: 20 }, true]] },
  },
  {
    cat: 'egitim', name: 'Notalar Müzik Kursu', district: 'Nilüfer', address: 'Esentepe Mah. Demo Cad. No:10',
    desc: 'Her yaşa piyano, gitar ve şan dersleri.',
    resources: ['Piyano sınıfı', 'Gitar sınıfı'], h: ['10:00', '21:00', '10:00', '18:00', true], interval: 30,
    sections: { Dersler: [['Piyano özel ders', 1200, 45, { level: 'Her seviye' }], ['Gitar özel ders', 1000, 45, { level: 'Başlangıç' }], ['Online solfej', 700, 45, { online: true }]] },
  },
  {
    cat: 'etkinlik', name: 'Bahçe Davet Alanı', district: 'Mudanya', address: 'Demo Köyü Yolu No:3',
    desc: 'Nişan, doğum günü ve şirket davetleri için deniz manzaralı bahçe.',
    resources: [['Bahçe', 200]], h: ['10:00', '23:00', '10:00', '23:00', true], interval: 60, party: 200,
    sections: { Paketler: [['Doğum günü paketi (30 kişi)', 25000, null, { capacity: 30 }, true], ['Nişan paketi (100 kişi)', 60000, null, { capacity: 100 }, true]] },
  },
  {
    cat: 'diger', name: 'Usta Eller Terzi', district: 'Yıldırım', address: 'Davutkadı Mah. Demo Sok. No:2',
    desc: 'Tadilat, paça ve özel dikim. Randevuyla bekletmeden.',
    resources: ['Terzi Hasan'], h: STD,
    sections: { Tadilat: [['Paça kısaltma', 200, 15], ['Fermuar değişimi', 250, 20], ['Ceket daraltma', 600, 30, {}, true]] },
  },
];

async function main() {
  const temizle = process.argv.includes('--temizle');

  const { error: otpErr } = await supabase.auth.verifyOtp({ phone: PHONE, token: CODE, type: 'sms' });
  if (otpErr) throw new Error('Test numarasıyla giriş yapılamadı: ' + otpErr.message);
  const { data: { user } } = await supabase.auth.getUser();
  console.log('Giriş:', user.phone);

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
  if (!profile?.full_name) await supabase.from('profiles').update({ full_name: 'Demo İşletmeci' }).eq('id', user.id);

  // --kapaklar: işletmelere dokunmadan yalnızca kapak fotoğraflarını günceller (test randevuları korunur)
  if (process.argv.includes('--kapaklar')) {
    for (const d of DEMO) {
      const { error } = await supabase
        .from('businesses')
        .update({ cover_url: `/demo/${d.cat}.jpg` })
        .eq('owner_id', user.id)
        .eq('slug', `demo-${d.cat}`);
      if (error) throw new Error(d.name + ': ' + error.message);
    }
    console.log(`${DEMO.length} işletmenin kapak fotoğrafı güncellendi.`);
    return;
  }

  const { data: old } = await supabase.from('businesses').select('id').eq('owner_id', user.id).like('slug', 'demo-%');
  if (old?.length) {
    const { error } = await supabase.from('businesses').delete().in('id', old.map((b) => b.id));
    if (error) throw error;
    console.log(`${old.length} eski demo işletme silindi.`);
  }
  if (temizle) return;

  const { data: cats } = await supabase.from('business_categories').select('*');
  const catBySlug = Object.fromEntries(cats.map((c) => [c.slug, c]));

  for (const d of DEMO) {
    const cat = catBySlug[d.cat];
    const isRes = cat.booking_mode === 'reservation';
    const { data: biz, error } = await supabase
      .from('businesses')
      .insert({
        owner_id: user.id,
        category_id: cat.id,
        name: d.name,
        slug: `demo-${d.cat}`,
        description: d.desc,
        city: 'Bursa',
        district: d.district,
        address: d.address,
        booking_mode: cat.booking_mode,
        default_duration_minutes: cat.default_duration_minutes,
        slot_interval_minutes: d.interval ?? (isRes ? 30 : 15),
        max_party_size: d.party ?? 1,
        min_notice_minutes: 30,
        cover_url: `/demo/${d.cat}.jpg`,
        is_published: true,
      })
      .select('id')
      .single();
    if (error) throw new Error(d.name + ': ' + error.message);

    const [wkOpen, wkClose, satOpen, satClose, sunday] = d.h;
    const hours = [];
    const clamp = (t) => (t === '24:00' ? '23:59' : t);
    for (let wd = 1; wd <= 5; wd++) hours.push({ business_id: biz.id, weekday: wd, opens_at: wkOpen, closes_at: clamp(wkClose) });
    hours.push({ business_id: biz.id, weekday: 6, opens_at: satOpen, closes_at: clamp(satClose) });
    if (sunday) hours.push({ business_id: biz.id, weekday: 7, opens_at: satOpen, closes_at: clamp(satClose) });

    const resources = d.resources.map((r, i) =>
      Array.isArray(r)
        ? { business_id: biz.id, name: r[0], capacity: r[1], sort_order: i }
        : { business_id: biz.id, name: r, capacity: 1, sort_order: i },
    );

    const [h, r] = await Promise.all([
      supabase.from('business_hours').insert(hours),
      supabase.from('resources').insert(resources),
    ]);
    if (h.error || r.error) throw new Error(d.name + ': ' + (h.error ?? r.error).message);

    let sOrder = 0;
    for (const [sectionName, items] of Object.entries(d.sections)) {
      const { data: sec, error: sErr } = await supabase
        .from('catalog_sections')
        .insert({ business_id: biz.id, name: sectionName, sort_order: sOrder++ })
        .select('id')
        .single();
      if (sErr) throw sErr;
      const { error: iErr } = await supabase.from('catalog_items').insert(
        items.map(([name, price, duration, attributes, isFrom], i) => ({
          business_id: biz.id,
          section_id: sec.id,
          name,
          price,
          price_is_from: !!isFrom,
          duration_minutes: duration,
          is_bookable: !isRes && duration != null,
          attributes: attributes ?? {},
          sort_order: i,
        })),
      );
      if (iErr) throw iErr;
    }
    console.log('✓', cat.name.padEnd(24), d.name);
  }
  console.log(`\n${DEMO.length} demo işletme oluşturuldu.`);
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});

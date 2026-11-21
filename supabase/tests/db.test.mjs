// Supabase migration'larını PGlite üzerinde, auth şeması ve rolleri taklit edilerek test eder.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const migDir = process.argv[2];
const db = new PGlite();

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra); }
};
const expectError = async (fn, needle, name) => {
  try { await fn(); ok(false, name, '(hata bekleniyordu)'); }
  catch (e) { ok(e.message.includes(needle), name, `→ ${e.message}`); }
};

// --- Supabase taklidi ---
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, phone text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  -- Yeni Supabase projeleri tablolara otomatik yetki vermiyor; yetkiler migration'da açıkça verilmeli.
  alter default privileges in schema public revoke execute on functions from public;
`);

for (const f of fs.readdirSync(migDir).sort()) {
  await db.exec(fs.readFileSync(path.join(migDir, f), 'utf8'));
  console.log('migration uygulandı:', f);
}

const as = async (uid) => {
  await db.exec(`reset role`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`);
};
const asService = async () => { await db.exec(`reset role`); await db.exec(`set role service_role`); };
const su = async () => { await db.exec(`reset role`); await db.query(`select set_config('request.jwt.claim.sub', '', false)`); };
const q = async (sql, params) => (await db.query(sql, params)).rows;

const O = '00000000-0000-0000-0000-00000000000a';
const C1 = '00000000-0000-0000-0000-0000000000c1';
const C2 = '00000000-0000-0000-0000-0000000000c2';
await db.query(`insert into auth.users (id, phone, raw_user_meta_data) values
  ($1, '+905320000001', '{"full_name":"İşletme Sahibi"}'),
  ($2, '+905320000002', '{"full_name":"Ahmet Yılmaz"}'),
  ($3, '+905320000003', '{}')`, [O, C1, C2]);

console.log('\n1) Profil tetikleyicisi');
ok((await q(`select * from profiles`)).length === 3, '3 profil oluştu');

console.log('\n2) İşletme oluşturma (sahip)');
await as(O);
const [biz] = await q(`insert into businesses (owner_id, category_id, name, slug, cancellation_window_hours, min_notice_minutes)
  values ($1, (select id from business_categories where slug='kuafor'), 'Test Kuaför', 'test-kuafor', 2, 0) returning id`, [O]);
ok(!!biz?.id, 'insert ... returning sahibe görünüyor');
ok((await q(`select role from business_members where business_id=$1`, [biz.id]))[0]?.role === 'owner', 'sahip otomatik owner üyesi');
for (let d = 1; d <= 7; d++) await q(`insert into business_hours (business_id, weekday, opens_at, closes_at) values ($1,$2,'09:00','18:00')`, [biz.id, d]);
const [res] = await q(`insert into resources (business_id, name, capacity) values ($1,'Ayşe',1) returning id`, [biz.id]);
const [item] = await q(`insert into catalog_items (business_id, name, price, duration_minutes) values ($1,'Saç kesimi',500,30) returning id`, [biz.id]);
await q(`update businesses set is_published = true where id=$1`, [biz.id]);
await expectError(() => q(`update businesses set owner_id=$1 where id=$2`, [C1, biz.id]), 'permission denied', 'owner_id değiştirilemez (kolon yetkisi)');

console.log('\n3) Başka kullanıcı işletmeyi düzenleyemez');
await as(C1);
const upd = await db.query(`update businesses set name='Hack' where id=$1`, [biz.id]);
ok(upd.affectedRows === 0, 'müşteri işletmeyi güncelleyemez');
await expectError(() => q(`insert into catalog_items (business_id, name) values ($1,'x')`, [biz.id]), 'row-level security', 'müşteri kataloğa ekleyemez');

console.log('\n4) Müsaitlik (anonim)');
await as(null);
const [{ tomorrow }] = await q(`select ((now() at time zone 'Europe/Istanbul')::date + 1) as tomorrow`);
const slots = await q(`select * from get_available_slots($1, $2, 30)`, [biz.id, tomorrow]);
ok(slots.length === 35, `yarın 09:00-18:00, 15 dk aralık, 30 dk hizmet → 35 slot`, `(gelen: ${slots.length})`);
const [{ t10 }] = await q(`select (($1::date + time '10:00') at time zone 'Europe/Istanbul') as t10`, [tomorrow]);
const [{ t1030 }] = await q(`select (($1::date + time '10:30') at time zone 'Europe/Istanbul') as t1030`, [tomorrow]);
await expectError(() => q(`select create_appointment($1, $2, array[$3]::uuid[])`, [biz.id, t10, item.id]), 'permission denied', 'anonim randevu oluşturamaz');

console.log('\n5) Randevu ve çift rezervasyon');
await as(C1);
const [{ create_appointment: a1 }] = await q(`select create_appointment($1, $2, array[$3]::uuid[])`, [biz.id, t10, item.id]);
ok(!!a1, 'C1 10:00 randevusu oluştu');
ok((await q(`select status from appointments where id=$1`, [a1]))[0].status === 'confirmed', 'auto_confirm → confirmed');
ok((await q(`select price from appointment_items where appointment_id=$1`, [a1]))[0]?.price == 500, 'fiyat kopyası alındı');
await as(C2);
await expectError(() => q(`select create_appointment($1, $2, array[$3]::uuid[])`, [biz.id, t10, item.id]), 'slot_unavailable', 'C2 aynı saate randevu alamaz');
const [{ create_appointment: a2 }] = await q(`select create_appointment($1, $2, array[$3]::uuid[])`, [biz.id, t1030, item.id]);
ok(!!a2, 'C2 10:30 randevusu oluştu');
ok((await q(`select * from get_available_slots($1, $2, 30)`, [biz.id, tomorrow])).length === 30, 'iki randevuyla çakışan 5 slot listeden düştü');
await expectError(() => q(`insert into appointments (business_id, customer_id, starts_at, ends_at) values ($1,$2,now(),now()+interval '1h')`, [biz.id, C2]), 'permission denied', 'RPC dışında randevu eklenemez');

console.log('\n6) Görünürlük (KVKK)');
ok((await q(`select * from appointments`)).length === 1, 'C2 yalnızca kendi randevusunu görür');
ok((await q(`select * from profiles where id=$1`, [C1])).length === 0, 'C2, C1 profilini göremez');
await as(O);
ok((await q(`select * from appointments where business_id=$1`, [biz.id])).length === 2, 'işletme kendi randevularını görür');
ok((await q(`select * from profiles where id in ($1,$2)`, [C1, C2])).length === 2, 'işletme müşterilerinin profilini görür');

console.log('\n7) İptal: zamanında ve geç');
await as(C1);
await q(`select cancel_appointment($1, null)`, [a1]);
ok((await q(`select is_late_cancellation from appointments where id=$1`, [a1]))[0].is_late_cancellation === false, 'zamanında iptal → geç değil');
await as(O);
await q(`update businesses set cancellation_window_hours = 48 where id=$1`, [biz.id]);
await as(C2);
await q(`select cancel_appointment($1, 'hasta')`, [a2]);
ok((await q(`select is_late_cancellation from appointments where id=$1`, [a2]))[0].is_late_cancellation === true, '48 saat kuralında yarına iptal → geç iptal');
await expectError(() => q(`select cancel_appointment($1, null)`, [a2]), 'cannot_cancel', 'iptal edilmiş randevu tekrar iptal edilemez');

console.log('\n8) Müşteri değerlendirmesi');
await su();
const past = async (cust, daysAgo) => (await q(`insert into appointments (business_id, customer_id, resource_id, starts_at, ends_at, status)
  values ($1,$2,$3, now() - make_interval(days => $4), now() - make_interval(days => $4) + interval '30 min', 'confirmed') returning id`, [biz.id, cust, res.id, daysAgo]))[0].id;
const p1 = await past(C1, 1), p2 = await past(C1, 2), p3 = await past(C1, 3), pOld = await past(C1, 20);
await as(C1);
await expectError(() => q(`select submit_customer_assessment($1,'no_show','not_applicable')`, [p1]), 'not_found', 'müşteri kendini değerlendiremez');
await expectError(() => q(`insert into customer_assessments (appointment_id, business_id, customer_id, attendance, payment) values ($1,$2,$3,'on_time','paid_full')`, [p1, biz.id, C1]), 'permission denied', 'değerlendirme tablosuna doğrudan yazılamaz');
await as(O);
await q(`select submit_customer_assessment($1,'no_show','not_applicable')`, [p1]);
await q(`select submit_customer_assessment($1,'on_time','paid_full')`, [p2]);
await q(`select submit_customer_assessment($1,'late','paid_partial')`, [p3]);
ok((await q(`select status from appointments where id=$1`, [p1]))[0].status === 'no_show', 'gelmedi → randevu no_show');
ok((await q(`select status from appointments where id=$1`, [p2]))[0].status === 'completed', 'geldi → randevu completed');
await expectError(() => q(`select submit_customer_assessment($1,'no_show','paid_full')`, [p2]), 'invalid_payment', 'gelmedi + ödeme tutarsızlığı reddedilir');
await expectError(() => q(`select submit_customer_assessment($1,'on_time','paid_full')`, [pOld]), 'window_closed', '7 günden eski randevu değerlendirilemez');
await expectError(() => q(`select submit_customer_assessment($1,'on_time','paid_full')`, [a2]), 'invalid_state', 'iptal edilmiş randevu değerlendirilemez');

console.log('\n9) Güvenilirlik özeti');
await as(C1);
let [r] = await q(`select * from get_customer_reliability($1)`, [C1]);
ok(r.total_appointments === 3 && r.no_shows === 1 && r.late_arrivals === 1 && r.payment_issues === 1 && r.enough_data, 'C1 özeti doğru', JSON.stringify(r));
console.log('    C1 güvenilirlik %', r.reliability_pct);
await as(C2);
await expectError(() => q(`select * from get_customer_reliability($1)`, [C1]), 'not_allowed', 'ilişkisi olmayan kullanıcı başkasının özetini göremez');
[r] = await q(`select * from get_customer_reliability($1)`, [C2]);
ok(r.late_cancellations === 1 && !r.enough_data && r.reliability_pct === null, 'C2: 1 geç iptal, yetersiz veri → yüzde yok', JSON.stringify(r));
await as(O);
[r] = await q(`select * from get_customer_reliability($1)`, [C1]);
ok(r.total_appointments === 3, 'işletme kendi müşterisinin özetini görür');

console.log('\n10) İşletme yorumları');
await as(C1);
await q(`insert into business_reviews (appointment_id, business_id, customer_id, rating, comment) values ($1,$2,$3,5,'Harika')`, [p2, biz.id, C1]);
await expectError(() => q(`insert into business_reviews (appointment_id, business_id, customer_id, rating) values ($1,$2,$3,1)`, [p1, biz.id, C1]), 'row-level security', 'gelmediği randevuya yorum yapamaz');
await expectError(() => q(`insert into business_reviews (appointment_id, business_id, customer_id, rating) values ($1,$2,$3,1)`, [a2, biz.id, C1]), 'row-level security', 'başkasının randevusuna yorum yapamaz');
await expectError(() => q(`update business_reviews set business_reply='x'`), 'permission denied', 'müşteri işletme yanıtını yazamaz');
await as(null);
const [rev] = await q(`select reviewer_display, rating from business_reviews`);
ok(rev?.reviewer_display === 'Ahmet Y.', 'isim maskelendi: "Ahmet Y."', rev?.reviewer_display);
ok((await q(`select rating_avg, rating_count from business_stats where business_id=$1`, [biz.id]))[0].rating_count === 1, 'puan istatistiği güncellendi');
await as(O);
await q(`select reply_to_review((select id from business_reviews limit 1), 'Teşekkürler!')`);
ok((await q(`select business_reply from business_reviews`))[0].business_reply === 'Teşekkürler!', 'işletme yanıt verdi');

console.log('\n11) İtiraz akışı');
await as(C1);
const [ca] = await q(`select id from customer_assessments where appointment_id=$1`, [p1]);
await q(`insert into assessment_disputes (assessment_id, customer_id, reason) values ($1,$2,'O gün gittim, kayıt hatalı')`, [ca.id, C1]);
[r] = await q(`select * from get_customer_reliability($1)`, [C1]);
ok(r.no_shows === 0 && r.total_appointments === 2, 'açık itirazdaki kayıt özete dahil değil', JSON.stringify(r));
await as(O);
await expectError(() => q(`select submit_customer_assessment($1,'no_show','not_applicable')`, [p1]), 'assessment_disputed', 'itiraz edilen kayıt değiştirilemez');
await expectError(() => q(`select resolve_dispute((select id from assessment_disputes limit 1), true, null)`), 'not_allowed', 'işletme itirazı sonuçlandıramaz');
await su();
await q(`update profiles set is_platform_admin = true where id=$1`, [C2]);
await as(C2);
await q(`select resolve_dispute((select id from assessment_disputes limit 1), true, 'Kayıt hatalı bulundu')`);
await su();
ok((await q(`select status from appointments where id=$1`, [p1]))[0].status === 'completed', 'itiraz kabul → randevu completed');
ok((await q(`select voided_at from customer_assessments where id=$1`, [ca.id]))[0].voided_at !== null, 'değerlendirme geçersiz sayıldı');
await as(C1);
await expectError(() => q(`update profiles set is_platform_admin = true where id=$1`, [C1]), 'permission denied', 'kullanıcı kendini admin yapamaz');

console.log('\n12) Onay kaydı');
await q(`select record_consent('kvkk_aydinlatma','2026-11-21',true)`);
ok((await q(`select * from user_consents`)).length === 1, 'onay kaydedildi ve kullanıcıya görünüyor');
await expectError(() => q(`delete from user_consents`), 'permission denied', 'onay kaydı silinemez');

console.log('\n13) SMS bildirim kuyruğu');
await su();
const outbox = async (appt) => Object.fromEntries((await q(`select kind, status, send_after, last_error, attempts from sms_outbox where appointment_id=$1`, [appt])).map((r) => [r.kind, r]));
ok((await outbox(a1)).confirmation?.status === 'queued', 'onaylı randevu → onay SMS kuyrukta');
ok(Object.keys(await outbox(p1)).length === 0, 'geçmiş tarihli randevu için SMS yok');
const [{ d3 }] = await q(`select ((($1::date + 3) + time '10:00') at time zone 'Europe/Istanbul') as d3`, [tomorrow]);
await as(C2);
const [{ create_appointment: a3 }] = await q(`select create_appointment($1, $2, array[$3]::uuid[])`, [biz.id, d3, item.id]);
await su();
let ob = await outbox(a3);
await as(C2);
ok(ob.confirmation && ob.reminder, 'yeni randevu → onay + hatırlatma kuyrukta');
ok(new Date(ob.reminder.send_after).getTime() === new Date(d3).getTime() - 24 * 3600e3, 'hatırlatma 24 saat önceye planlandı');
await expectError(() => q(`select * from sms_outbox`), 'permission denied', 'müşteri SMS kuyruğunu okuyamaz');
await expectError(() => q(`select * from claim_sms_batch(10)`), 'permission denied', 'müşteri kuyruktan kayıt alamaz');

await asService();
let claimed = await q(`select * from claim_sms_batch(50)`);
ok(claimed.length === 1 && claimed[0].kind === 'confirmation' && claimed[0].phone === '+905320000003', 'yalnızca geçerli onay SMS alındı', JSON.stringify(claimed));
ok(claimed[0]?.business_name === 'Test Kuaför' && claimed[0]?.timezone === 'Europe/Istanbul', 'gönderim için işletme bilgisi geldi');
ok((await q(`select * from claim_sms_batch(50)`)).length === 0, 'aynı kayıt ikinci kez alınamaz');
await q(`select complete_sms($1, true, 'job-1')`, [claimed[0].id]);
await su();
ok((await outbox(a1)).confirmation.status === 'skipped' && (await outbox(a1)).confirmation.last_error === 'status_changed', 'müşterinin iptal ettiği randevunun onay SMS\'i atlandı');
ok((await outbox(a3)).confirmation.status === 'sent', 'gönderilen SMS "sent" oldu');

await as(O);
await q(`select business_update_appointment($1, 'cancel', 'Personel hasta')`, [a3]);
await su();
await q(`update sms_outbox set send_after = now() - interval '1 min' where appointment_id=$1 and kind='reminder'`, [a3]);
await asService();
claimed = await q(`select * from claim_sms_batch(50)`);
ok(claimed.length === 1 && claimed[0].kind === 'cancellation', 'işletme iptali → iptal SMS alındı', JSON.stringify(claimed));
await q(`select complete_sms($1, false, null, 'netgsm 500', true)`, [claimed[0].id]);
await su();
ob = await outbox(a3);
ok(ob.reminder.status === 'skipped', 'iptal edilen randevuya hatırlatma gitmez');
ok(ob.cancellation.status === 'queued' && ob.cancellation.attempts === 1 && new Date(ob.cancellation.send_after) > new Date(), 'geçici hata → ileri tarihe yeniden kuyruk');
await q(`update sms_outbox set send_after = now() where appointment_id=$1`, [a3]);
await asService();
const [retry] = await q(`select * from claim_sms_batch(50)`);
await q(`select complete_sms($1, false, null, 'invalid_phone', false)`, [retry.id]);
await su();
ok((await outbox(a3)).cancellation.status === 'failed', 'kalıcı hata → failed, tekrar denenmez');

await as(O);
await q(`update businesses set sms_reminder_hours = 0 where id=$1`, [biz.id]);
const [{ d4 }] = await q(`select ((($1::date + 4) + time '11:00') at time zone 'Europe/Istanbul') as d4`, [tomorrow]);
await as(C2);
const [{ create_appointment: a4 }] = await q(`select create_appointment($1, $2, array[$3]::uuid[])`, [biz.id, d4, item.id]);
await su();
ob = await outbox(a4);
ok(ob.confirmation && !ob.reminder, 'hatırlatma kapalıysa yalnızca onay SMS');

console.log('\n14) İzin ve kapatma');
const day = async (n) => (await q(`select ($1::date + $2::int)::text as d`, [tomorrow, n]))[0].d;
const [D5, D6, D7] = [await day(5), await day(6), await day(7)];
await as(O);
const [res2] = await q(`insert into resources (business_id, name, capacity, sort_order) values ($1,'Mehmet',1,1) returning id`, [biz.id]);
await q(`insert into business_closures (business_id, starts_on, ends_on, reason) values ($1,$2,$2,'Bayram')`, [biz.id, D5]);
await q(`insert into business_closures (business_id, resource_id, starts_on, ends_on, reason) values ($1,$2,$3,$3,'Ayşe izinli')`, [biz.id, res.id, D6]);
await q(`insert into business_closures (business_id, starts_on, ends_on, start_time, end_time) values ($1,$2,$2,'12:00','14:00')`, [biz.id, D7]);
await expectError(() => q(`insert into business_closures (business_id, starts_on, ends_on, start_time, end_time) values ($1,$2,$2,'14:00','12:00')`, [biz.id, D7]), 'check constraint', 'bitiş saati başlangıçtan önce olamaz');
await expectError(() => q(`insert into business_closures (business_id, starts_on, ends_on, start_time) values ($1,$2,$2,'14:00')`, [biz.id, D7]), 'check constraint', 'yalnızca başlangıç saati girilemez');

await as(null);
ok((await q(`select * from get_available_slots($1, $2, 30)`, [biz.id, D5])).length === 0, 'işletme tam gün kapalı → müşteri hiç saat görmez');
const d6slots = await q(`select * from get_available_slots($1, $2, 30)`, [biz.id, D6]);
ok(d6slots.length === 35 && d6slots.every((s) => !s.resource_ids.includes(res.id)), 'Ayşe izinli → saatler yalnızca Mehmet ile', `(${d6slots.length})`);
ok((await q(`select * from get_available_slots($1, $2, 30, 1, $3)`, [biz.id, D6, res.id])).length === 0, 'Ayşe seçilince o gün hiç saat yok');
ok((await q(`select * from get_available_slots($1, $2, 30)`, [biz.id, D7])).length === 26, '12:00-14:00 kapalı → çakışan 9 saat gizlendi');
await expectError(() => q(`select * from business_closures`), 'permission denied', 'anonim kapatma kayıtlarını (açıklama) göremez');

await as(C2);
const [{ t7 }] = await q(`select (($1::date + time '12:30') at time zone 'Europe/Istanbul') as t7`, [D7]);
await expectError(() => q(`select create_appointment($1, $2, array[$3]::uuid[])`, [biz.id, t7, item.id]), 'slot_unavailable', 'kapalı saate randevu alınamaz');
ok((await q(`select * from business_closures`)).length === 0, 'müşteri kapatma kayıtlarını göremez');
await expectError(() => q(`insert into business_closures (business_id, starts_on, ends_on) values ($1,$2,$2)`, [biz.id, D7]), 'row-level security', 'müşteri işletmeyi kapatamaz');
await as(O);
ok((await q(`select * from business_closures where business_id=$1`, [biz.id])).length === 3, 'işletme kendi kapatmalarını görür');
await q(`delete from resources where id=$1`, [res2.id]);

console.log(`\nSonuç: ${pass} geçti, ${fail} başarısız`);
process.exit(fail ? 1 : 0);

-- =====================================================================
-- Açık yetkiler
-- Yeni Supabase projeleri public şemadaki tablolara anon/authenticated rollerine
-- otomatik yetki vermiyor. Neye kimin erişebileceğini burada tek tek tanımlıyoruz.
-- Satır düzeyindeki kısıtlar (kim hangi satırı görür) RLS politikalarındadır;
-- buradaki yetkiler yalnızca "bu rol bu tabloya hangi işlemi deneyebilir" sorusunu yanıtlar.
-- =====================================================================

grant usage on schema public to anon, authenticated;

-- Herkese açık okunan tablolar (yayındaki işletme sayfaları)
grant select on
  public.business_categories,
  public.businesses,
  public.business_stats,
  public.business_hours,
  public.business_closures,
  public.resources,
  public.catalog_sections,
  public.catalog_items,
  public.resource_items,
  public.business_reviews
to anon, authenticated;

-- Yalnızca giriş yapmış kullanıcıların okuyabildiği tablolar
grant select on
  public.profiles,
  public.user_consents,
  public.business_members,
  public.appointments,
  public.appointment_items,
  public.customer_blocks,
  public.customer_assessments,
  public.assessment_disputes
to authenticated;

-- İşletme yönetimi (RLS: yalnızca owner/manager)
grant insert, delete on public.businesses to authenticated;
grant insert, update, delete on
  public.business_members,
  public.business_hours,
  public.business_closures,
  public.resources,
  public.catalog_sections,
  public.catalog_items,
  public.resource_items,
  public.customer_blocks
to authenticated;

-- Identity kolonlu tablolara ekleme için
grant usage on all sequences in schema public to authenticated;

-- Kolon bazlı güncelleme/ekleme yetkileri 20261121000001_init.sql içinde verildi:
--   profiles (full_name, avatar_url), businesses (sahip dışı alanlar),
--   business_reviews (insert + rating/comment), assessment_disputes (insert).

-- RLS politikalarının çağırdığı yardımcı fonksiyonlar
grant execute on function public.is_platform_admin() to anon, authenticated;
grant execute on function public.is_business_member(uuid, public.member_role[]) to anon, authenticated;
grant execute on function public.is_customer_of_my_business(uuid) to authenticated;
grant execute on function public.mask_name(text) to anon, authenticated;

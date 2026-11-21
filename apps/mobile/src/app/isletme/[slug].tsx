import {
  formatDateKeyTR,
  formatPrice,
  formatTime,
  rpcErrorMessage,
  upcomingDateKeys,
  type AvailableSlot,
  type CatalogItem,
} from '@randevu/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ErrorText, Input, Muted, Screen, styles } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

interface BusinessDetail {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  timezone: string;
  booking_mode: 'service' | 'reservation';
  max_party_size: number;
  default_duration_minutes: number;
  max_advance_days: number;
  cancellation_window_hours: number;
  auto_confirm: boolean;
  list_label: string;
}
interface Review {
  id: string;
  reviewer_display: string;
  rating: number;
  comment: string | null;
  business_reply: string | null;
}

export default function BusinessScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [business, setBusiness] = useState<BusinessDetail | null | undefined>(undefined);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string }[]>([]);
  const [resources, setResources] = useState<{ id: string; name: string }[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    (async () => {
      const { data: b } = await supabase
        .from('businesses')
        .select('*, business_categories(list_label)')
        .eq('slug', slug)
        .maybeSingle();
      if (!b) return setBusiness(null);
      const cat = Array.isArray(b.business_categories) ? b.business_categories[0] : b.business_categories;
      setBusiness({ ...b, list_label: cat?.list_label ?? 'Liste' });
      const [s, i, r, rv] = await Promise.all([
        supabase.from('catalog_sections').select('id, name').eq('business_id', b.id).order('sort_order'),
        supabase.from('catalog_items').select('*').eq('business_id', b.id).eq('is_active', true).order('sort_order'),
        supabase.from('resources').select('id, name').eq('business_id', b.id).eq('is_active', true).order('sort_order'),
        supabase
          .from('business_reviews')
          .select('id, reviewer_display, rating, comment, business_reply')
          .eq('business_id', b.id)
          .eq('status', 'published')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);
      setSections(s.data ?? []);
      setItems((i.data ?? []) as CatalogItem[]);
      setResources(r.data ?? []);
      setReviews((rv.data ?? []) as Review[]);
    })();
  }, [slug]);

  if (business === undefined) return <Screen><Muted>Yükleniyor…</Muted></Screen>;
  if (business === null) return <Screen><Muted>İşletme bulunamadı.</Muted></Screen>;

  const groups = [
    ...sections.map((s) => ({ key: s.id, name: s.name, items: items.filter((i) => i.section_id === s.id) })),
    { key: 'none', name: sections.length ? 'Diğer' : '', items: items.filter((i) => !i.section_id) },
  ].filter((g) => g.items.length);

  return (
    <Screen>
      <Stack.Screen options={{ title: business.name }} />
      <Card>
        <ThemedText type="smallBold" style={{ fontSize: 20 }}>{business.name}</ThemedText>
        <Muted>{[business.address, business.district, business.city].filter(Boolean).join(', ')}</Muted>
        {business.description && <ThemedText type="small">{business.description}</ThemedText>}
      </Card>

      <Booking business={business} items={items.filter((i) => i.is_bookable)} resources={resources} />

      <ThemedText type="smallBold">{business.list_label}</ThemedText>
      {groups.map((g) => (
        <Card key={g.key}>
          {g.name ? <ThemedText type="smallBold">{g.name}</ThemedText> : null}
          {g.items.map((i) => (
            <View key={i.id} style={[styles.row, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1 }}>
                <ThemedText type="small">{i.name}</ThemedText>
                {i.description && <Muted>{i.description}</Muted>}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <ThemedText type="small">{formatPrice(i.price, i.currency, i.price_is_from)}</ThemedText>
                {i.duration_minutes ? <Muted>{i.duration_minutes} dk</Muted> : null}
              </View>
            </View>
          ))}
        </Card>
      ))}

      <ThemedText type="smallBold">Değerlendirmeler</ThemedText>
      {reviews.length === 0 && <Muted>Henüz değerlendirme yok.</Muted>}
      {reviews.map((r) => (
        <Card key={r.id}>
          <ThemedText type="small">
            {r.reviewer_display} · {'★'.repeat(r.rating)}
          </ThemedText>
          {r.comment && <ThemedText type="small">{r.comment}</ThemedText>}
          {r.business_reply && <Muted>İşletmenin yanıtı: {r.business_reply}</Muted>}
        </Card>
      ))}
    </Screen>
  );
}

function Booking({
  business,
  items,
  resources,
}: {
  business: BusinessDetail;
  items: CatalogItem[];
  resources: { id: string; name: string }[];
}) {
  const { session } = useAuth();
  const isService = business.booking_mode === 'service';
  const [selected, setSelected] = useState<string[]>([]);
  const [partySize, setPartySize] = useState(isService ? 1 : 2);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const dates = useMemo(
    () => upcomingDateKeys(business.timezone, Math.min(14, business.max_advance_days)),
    [business.timezone, business.max_advance_days],
  );
  const [date, setDate] = useState(dates[0]);
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const duration = useMemo(() => {
    const sum = items.filter((i) => selected.includes(i.id)).reduce((s, i) => s + (i.duration_minutes ?? 0), 0);
    return sum > 0 ? sum : business.default_duration_minutes;
  }, [items, selected, business.default_duration_minutes]);
  const ready = !isService || items.length === 0 || selected.length > 0;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    supabase
      .rpc('get_available_slots', {
        p_business: business.id,
        p_date: date,
        p_duration_minutes: duration,
        p_party_size: partySize,
        p_resource: resourceId,
        p_item_ids: selected.length ? selected : null,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        setSlot(null);
        setSlots(error ? [] : ((data ?? []) as AvailableSlot[]));
      });
    return () => {
      cancelled = true;
    };
  }, [ready, business.id, date, duration, partySize, resourceId, selected]);

  async function book() {
    if (!slot) return;
    if (!session) return router.push('/giris');
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('create_appointment', {
      p_business: business.id,
      p_starts_at: slot,
      p_item_ids: selected,
      p_party_size: partySize,
      p_resource: resourceId,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError(rpcErrorMessage(error));
      setSlots((s) => s?.filter((x) => x.slot_start !== slot) ?? null);
      setSlot(null);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Card>
        <ThemedText type="smallBold">{business.auto_confirm ? 'Bu vakit sana ayrıldı ✓' : 'Talebin işletmeye iletildi'}</ThemedText>
        <Muted>
          {business.auto_confirm
            ? 'Detaylar “Randevularım” sekmesinde.'
            : 'İşletme onayladığında bu vakit sana ayrılmış olacak. Durumu “Randevularım” sekmesinden takip edebilirsin.'}
        </Muted>
        <Button title="Randevularım" onPress={() => router.navigate('/randevularim')} />
      </Card>
    );
  }

  return (
    <Card>
      <ThemedText type="smallBold">Vakit seç</ThemedText>

      {isService && items.length > 0 && (
        <View style={{ gap: 6 }}>
          <Muted>Hizmet seçin</Muted>
          {items.map((i) => (
            <Chip
              key={i.id}
              selected={selected.includes(i.id)}
              label={`${i.name}${i.duration_minutes ? ` · ${i.duration_minutes} dk` : ''}${i.price != null ? ` · ${formatPrice(i.price, i.currency)}` : ''}`}
              onPress={() => setSelected((s) => (s.includes(i.id) ? s.filter((x) => x !== i.id) : [...s, i.id]))}
            />
          ))}
        </View>
      )}

      {!isService && (
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Muted>Kişi sayısı</Muted>
          <View style={styles.row}>
            <Button title="−" variant="ghost" onPress={() => setPartySize((n) => Math.max(1, n - 1))} />
            <ThemedText>{partySize}</ThemedText>
            <Button title="+" variant="ghost" onPress={() => setPartySize((n) => Math.min(business.max_party_size, n + 1))} />
          </View>
        </View>
      )}

      {isService && resources.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <Chip label="Fark etmez" selected={resourceId === null} onPress={() => setResourceId(null)} />
          {resources.map((r) => (
            <Chip key={r.id} label={r.name} selected={resourceId === r.id} onPress={() => setResourceId(r.id)} />
          ))}
        </ScrollView>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {dates.map((d) => {
          const f = formatDateKeyTR(d);
          return <Chip key={d} label={`${f.weekday}\n${f.day}`} selected={d === date} onPress={() => setDate(d)} />;
        })}
      </ScrollView>

      {!ready && <Muted>Önce hizmet seçin.</Muted>}
      {ready && slots === null && <Muted>Yükleniyor…</Muted>}
      {ready && slots?.length === 0 && <Muted>Bu gün için boş saat yok.</Muted>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {slots?.map((s) => (
          <Chip
            key={s.slot_start}
            label={formatTime(s.slot_start, business.timezone)}
            selected={slot === s.slot_start}
            onPress={() => setSlot(s.slot_start)}
          />
        ))}
      </View>

      {slot && (
        <>
          <Input placeholder="İşletmeye not (isteğe bağlı)" value={note} onChangeText={setNote} maxLength={500} />
          <Muted>
            Randevudan {business.cancellation_window_hours} saat öncesine kadar ücretsiz iptal edebilirsiniz. Daha geç
            iptaller ve gelinmeyen randevular güvenilirlik özetinize yansır.
          </Muted>
          {error && <ErrorText>{error}</ErrorText>}
          <Button title={session ? 'Bu vakti bana ayır' : 'Giriş yap, vakti ayır'} loading={busy} onPress={book} />
        </>
      )}
    </Card>
  );
}

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Chip, Input, Muted, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';

interface Category {
  id: number;
  slug: string;
  name: string;
}
interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  district: string | null;
  business_categories: { name: string } | { name: string }[] | null;
  business_stats: { rating_avg: number | null; rating_count: number } | { rating_avg: number | null; rating_count: number }[] | null;
}

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

export default function ExploreScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [businesses, setBusinesses] = useState<BusinessRow[] | null>(null);

  useEffect(() => {
    supabase
      .from('business_categories')
      .select('id, slug, name')
      .order('sort_order')
      .then(({ data }) => setCategories((data ?? []) as Category[]));
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      let query = supabase
        .from('businesses')
        .select('id, name, slug, city, district, business_categories(name), business_stats(rating_avg, rating_count)')
        .eq('is_published', true)
        .limit(60);
      if (category) query = query.eq('category_id', category);
      if (q.trim()) query = query.ilike('name', `%${q.trim().replace(/[%_]/g, '')}%`);
      if (city.trim()) query = query.ilike('city', city.trim());
      const { data } = await query;
      setBusinesses((data ?? []) as BusinessRow[]);
    }, 300);
    return () => clearTimeout(t);
  }, [category, q, city]);

  return (
    <Screen>
      <ThemedText type="subtitle">Keşfet</ThemedText>
      <View style={styles.row}>
        <Input style={{ flex: 2 }} placeholder="İşletme adı" value={q} onChangeText={setQ} />
        <Input style={{ flex: 1 }} placeholder="Şehir" value={city} onChangeText={setCity} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="Tümü" selected={category === null} onPress={() => setCategory(null)} />
        {categories.map((c) => (
          <Chip key={c.id} label={c.name} selected={category === c.id} onPress={() => setCategory(c.id)} />
        ))}
      </ScrollView>

      {businesses === null && <Muted>Yükleniyor…</Muted>}
      {businesses?.length === 0 && <Muted>Bu aramaya uygun işletme bulunamadı.</Muted>}
      {businesses?.map((b) => {
        const stats = one(b.business_stats);
        return (
          <Pressable key={b.id} onPress={() => router.push({ pathname: '/isletme/[slug]', params: { slug: b.slug } })}>
            <Card>
              <Muted>{one(b.business_categories)?.name}</Muted>
              <ThemedText type="smallBold">{b.name}</ThemedText>
              <Muted>{[b.district, b.city].filter(Boolean).join(', ')}</Muted>
              <ThemedText type="small">
                {stats?.rating_count ? `★ ${Number(stats.rating_avg).toFixed(1)} (${stats.rating_count})` : 'Henüz değerlendirme yok'}
              </ThemedText>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

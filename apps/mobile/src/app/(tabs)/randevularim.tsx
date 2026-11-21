import {
  APPOINTMENT_STATUS_LABEL,
  ATTENDANCE_LABEL,
  PAYMENT_LABEL,
  formatDateTime,
  rpcErrorMessage,
  type AppointmentStatus,
  type AttendanceOutcome,
  type CustomerReliability,
  type DisputeStatus,
  type PaymentOutcome,
} from '@randevu/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Muted, Screen, styles } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

interface Row {
  id: string;
  business_id: string;
  starts_at: string;
  status: AppointmentStatus;
  is_late_cancellation: boolean;
  businesses: { name: string; slug: string; timezone: string; cancellation_window_hours: number };
  appointment_items: { name: string }[];
  business_reviews: { id: string; rating: number } | null;
  customer_assessments: {
    id: string;
    attendance: AttendanceOutcome;
    payment: PaymentOutcome;
    voided_at: string | null;
    updated_at: string;
    assessment_disputes: { id: string; status: DisputeStatus } | null;
  } | null;
}

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));
const DAY = 86_400_000;

export default function MyAppointmentsScreen() {
  const { session } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [reliability, setReliability] = useState<CustomerReliability | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!session) return;
    setNow(Date.now());
    const [{ data }, rel] = await Promise.all([
      supabase
        .from('appointments')
        .select(
          `id, business_id, starts_at, status, is_late_cancellation,
           businesses(name, slug, timezone, cancellation_window_hours),
           appointment_items(name),
           business_reviews(id, rating),
           customer_assessments(id, attendance, payment, voided_at, updated_at, assessment_disputes(id, status))`,
        )
        .eq('customer_id', session.user.id)
        .order('starts_at', { ascending: false })
        .limit(100),
      supabase.rpc('get_customer_reliability', { p_customer: session.user.id }).single(),
    ]);
    setRows(
      (data ?? []).map((r) => {
        const ca = one(r.customer_assessments);
        return {
          ...r,
          businesses: one(r.businesses),
          business_reviews: one(r.business_reviews),
          customer_assessments: ca ? { ...ca, assessment_disputes: one(ca.assessment_disputes) } : null,
        } as Row;
      }),
    );
    setReliability((rel.data as CustomerReliability) ?? null);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!session) {
    return (
      <Screen>
        <ThemedText type="subtitle">Randevularım</ThemedText>
        <Muted>Randevularınızı görmek için giriş yapın.</Muted>
        <Button title="Giriş yap" onPress={() => router.push('/giris')} />
      </Screen>
    );
  }

  const upcoming = (rows ?? [])
    .filter((r) => ['pending', 'confirmed'].includes(r.status) && new Date(r.starts_at).getTime() > now)
    .reverse();
  const past = (rows ?? []).filter((r) => !upcoming.includes(r));

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }>
      <ThemedText type="subtitle">Randevularım</ThemedText>
      {rows === null && <Muted>Yükleniyor…</Muted>}

      <ThemedText type="smallBold">Yaklaşan</ThemedText>
      {rows && upcoming.length === 0 && <Muted>Yaklaşan randevunuz yok.</Muted>}
      {upcoming.map((r) => (
        <AppointmentCard key={r.id} row={r}>
          <Button
            title="İptal et"
            variant="danger"
            onPress={() => {
              const late = now > new Date(r.starts_at).getTime() - r.businesses.cancellation_window_hours * 3_600_000;
              Alert.alert(
                'Randevu iptali',
                late
                  ? `Ücretsiz iptal süresi (${r.businesses.cancellation_window_hours} saat) geçti; geç iptal olarak kaydedilir. Yine de gelemeyecekseniz iptal etmeniz, hiç gelmemekten çok daha iyidir.`
                  : 'Randevuyu iptal etmek istediğinize emin misiniz?',
                [
                  { text: 'Vazgeç', style: 'cancel' },
                  {
                    text: 'İptal et',
                    style: 'destructive',
                    onPress: async () => {
                      const { error } = await supabase.rpc('cancel_appointment', { p_appointment: r.id, p_reason: null });
                      if (error) Alert.alert(rpcErrorMessage(error));
                      load();
                    },
                  },
                ],
              );
            }}
          />
        </AppointmentCard>
      ))}

      <ThemedText type="smallBold">Geçmiş</ThemedText>
      {rows && past.length === 0 && <Muted>Henüz geçmiş randevunuz yok.</Muted>}
      {past.map((r) => (
        <AppointmentCard key={r.id} row={r}>
          {r.status === 'completed' && !r.business_reviews && now - new Date(r.starts_at).getTime() < 30 * DAY && (
            <ReviewForm row={r} customerId={session.user.id} onDone={load} />
          )}
          {r.business_reviews && <Muted>Puanınız: {'★'.repeat(r.business_reviews.rating)}</Muted>}
          <AssessmentInfo row={r} now={now} customerId={session.user.id} onDone={load} />
        </AppointmentCard>
      ))}

      <ThemedText type="smallBold">Güvenilirlik özetiniz</ThemedText>
      <Muted>
        Son 12 ayı kapsar ve yalnızca randevu aldığınız işletmelere gösterilir. Hatalı kayıtlara itiraz edebilirsiniz.
        İtiraz süresince kayıt özete dahil edilmez.
      </Muted>
      {reliability && (
        <Card>
          <ThemedText type="smallBold">
            {reliability.enough_data ? `Güvenilirlik: %${reliability.reliability_pct}` : 'Yeterli veri yok (en az 3 kayıt)'}
          </ThemedText>
          <Muted>
            Geldi {reliability.attended} · Geç {reliability.late_arrivals} · Gelmedi {reliability.no_shows} · Geç iptal{' '}
            {reliability.late_cancellations} · Ödeme sorunu {reliability.payment_issues}
          </Muted>
        </Card>
      )}
    </Screen>
  );
}

function AppointmentCard({ row, children }: { row: Row; children?: React.ReactNode }) {
  return (
    <Card>
      <Pressable onPress={() => router.push({ pathname: '/isletme/[slug]', params: { slug: row.businesses.slug } })}>
        <ThemedText type="smallBold">{row.businesses.name}</ThemedText>
      </Pressable>
      <Muted>{formatDateTime(row.starts_at, row.businesses.timezone)}</Muted>
      {row.appointment_items.length > 0 && (
        <ThemedText type="small">{row.appointment_items.map((i) => i.name).join(', ')}</ThemedText>
      )}
      <Muted>
        {APPOINTMENT_STATUS_LABEL[row.status]}
        {row.is_late_cancellation ? ' (geç iptal)' : ''}
      </Muted>
      {children}
    </Card>
  );
}

function ReviewForm({ row, customerId, onDone }: { row: Row; customerId: string; onDone: () => void }) {
  const theme = useTheme();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <ThemedText type="small">İşletmeyi değerlendirin</ThemedText>
      <View style={styles.row}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setRating(n)} accessibilityLabel={`${n} yıldız`}>
            <ThemedText style={{ fontSize: 28, color: n <= rating ? theme.accent : theme.line }}>★</ThemedText>
          </Pressable>
        ))}
      </View>
      <Input placeholder="Yorumunuz (isteğe bağlı)" value={comment} onChangeText={setComment} maxLength={1000} multiline />
      <Button
        title="Gönder"
        disabled={!rating}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          const { error } = await supabase.from('business_reviews').insert({
            appointment_id: row.id,
            business_id: row.business_id,
            customer_id: customerId,
            rating,
            comment: comment.trim() || null,
          });
          setBusy(false);
          if (error) return Alert.alert('Değerlendirme kaydedilemedi.');
          onDone();
        }}
      />
    </View>
  );
}

function AssessmentInfo({ row, now, customerId, onDone }: { row: Row; now: number; customerId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const a = row.customer_assessments;
  if (!a) return null;
  const dispute = a.assessment_disputes;
  const canDispute = !dispute && !a.voided_at && now - new Date(a.updated_at).getTime() < 30 * DAY;
  const disputeLabel: Record<DisputeStatus, string> = {
    open: 'İtirazınız inceleniyor; bu sürede özetinize dahil edilmiyor.',
    upheld: 'İtirazınız kabul edildi, kayıt geçersiz sayıldı.',
    rejected: 'İtirazınız reddedildi.',
  };

  return (
    <View style={{ gap: 6 }}>
      <Muted>
        İşletmenin kaydı: {ATTENDANCE_LABEL[a.attendance]}
        {a.payment !== 'not_applicable' ? ` · ${PAYMENT_LABEL[a.payment]}` : ''}
      </Muted>
      {dispute && <Muted>{disputeLabel[dispute.status]}</Muted>}
      {canDispute && !open && <Button title="Bu kayıt hatalı, itiraz et" variant="ghost" onPress={() => setOpen(true)} />}
      {open && (
        <>
          <Input placeholder="Ne oldu? (en az 10 karakter)" value={reason} onChangeText={setReason} multiline maxLength={1000} />
          <Button
            title="İtirazı gönder"
            disabled={reason.trim().length < 10}
            loading={busy}
            onPress={async () => {
              setBusy(true);
              const { error } = await supabase
                .from('assessment_disputes')
                .insert({ assessment_id: a.id, customer_id: customerId, reason: reason.trim() });
              setBusy(false);
              Alert.alert(error ? 'İtiraz gönderilemedi.' : 'İtirazınız alındı.');
              onDone();
            }}
          />
        </>
      )}
    </View>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ATTENDANCE_LABEL,
  PAYMENT_LABEL,
  formatDateTime,
  rpcErrorMessage,
  type AppointmentStatus,
  type AttendanceOutcome,
  type CustomerReliability,
  type DisputeStatus,
  type PaymentOutcome,
} from "@randevu/shared";
import { createClient } from "@/lib/supabase/client";
import { ReliabilityCard } from "@/components/reliability-card";
import { StatusBadge } from "@/components/status-badge";

interface Row {
  id: string;
  business_id: string;
  starts_at: string;
  status: AppointmentStatus;
  party_size: number;
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

export function MyAppointments() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [reliability, setReliability] = useState<CustomerReliability | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const [{ data }, rel] = await Promise.all([
      supabase
        .from("appointments")
        .select(
          `id, business_id, starts_at, status, party_size, is_late_cancellation,
           businesses(name, slug, timezone, cancellation_window_hours),
           appointment_items(name),
           business_reviews(id, rating),
           customer_assessments(id, attendance, payment, voided_at, updated_at, assessment_disputes(id, status))`,
        )
        .eq("customer_id", auth.user.id)
        .order("starts_at", { ascending: false })
        .limit(100),
      supabase.rpc("get_customer_reliability", { p_customer: auth.user.id }).single(),
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
  }, [supabase]);

  // load() async: setState yalnızca await sonrasında çalışır, senkron kaskad oluşmaz.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (!rows) return <p className="text-sm text-muted">Yükleniyor…</p>;

  const upcoming = rows.filter((r) => ["pending", "confirmed"].includes(r.status) && new Date(r.starts_at).getTime() > now).reverse();
  const past = rows.filter((r) => !upcoming.includes(r));

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Randevularım</h1>
      {msg && <p className="card text-sm">{msg}</p>}

      <section className="space-y-3">
        <h2 className="section-title">Yaklaşan</h2>
        {upcoming.length === 0 && (
          <p className="text-sm text-muted">
            Yaklaşan randevunuz yok. <Link href="/" className="underline">İşletmeleri keşfedin</Link>.
          </p>
        )}
        {upcoming.map((r) => (
          <AppointmentCard key={r.id} row={r}>
            <CancelButton row={r} onDone={(m) => { setMsg(m); load(); }} />
          </AppointmentCard>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="section-title">Geçmiş</h2>
        {past.length === 0 && <p className="text-sm text-muted">Henüz geçmiş randevunuz yok.</p>}
        {past.map((r) => (
          <AppointmentCard key={r.id} row={r}>
            {r.status === "completed" && !r.business_reviews && now - new Date(r.starts_at).getTime() < 30 * DAY && (
              <ReviewForm row={r} onDone={() => { setMsg("Değerlendirmeniz için teşekkürler."); load(); }} />
            )}
            {r.business_reviews && <p className="text-sm text-muted">Puanınız: {"★".repeat(r.business_reviews.rating)}</p>}
            <AssessmentInfo row={r} onDone={(m) => { setMsg(m); load(); }} />
          </AppointmentCard>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="section-title">Güvenilirlik özetin</h2>
        <p className="text-sm text-muted">
          Bu özet son 12 ayı kapsar ve yalnızca randevu aldığınız işletmelere gösterilir. Hakkınızdaki her kaydı
          yukarıda görebilir, hatalı bulduklarınıza itiraz edebilirsiniz. İtiraz süresince kayıt özete dahil edilmez.
        </p>
        {reliability && <ReliabilityCard data={reliability} />}
      </section>
    </div>
  );
}

function AppointmentCard({ row, children }: { row: Row; children?: React.ReactNode }) {
  const b = row.businesses;
  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/isletme/${b.slug}`} className="text-base font-bold hover:text-brand">{b.name}</Link>
          <p className="text-sm text-muted">{formatDateTime(row.starts_at, b.timezone)}</p>
          {row.appointment_items.length > 0 && (
            <p className="text-sm">{row.appointment_items.map((i) => i.name).join(", ")}</p>
          )}
          {row.party_size > 1 && <p className="text-sm">{row.party_size} kişi</p>}
        </div>
        <StatusBadge status={row.status} late={row.is_late_cancellation} />
      </div>
      {children}
    </div>
  );
}

function CancelButton({ row, onDone }: { row: Row; onDone: (msg: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const windowMs = row.businesses.cancellation_window_hours * 3_600_000;
  const isLate = now > new Date(row.starts_at).getTime() - windowMs;

  return (
    <div className="space-y-1">
      {isLate && (
        <p className="text-xs text-danger">
          Ücretsiz iptal süresi ({row.businesses.cancellation_window_hours} saat) geçti. Şimdi iptal ederseniz geç iptal
          olarak kaydedilir. Yine de gelemeyecekseniz iptal etmeniz, hiç gelmemekten çok daha iyidir.
        </p>
      )}
      <button
        className="btn-ghost text-danger"
        disabled={busy}
        onClick={async () => {
          if (!confirm("Randevuyu iptal etmek istediğinize emin misiniz?")) return;
          setBusy(true);
          const { error } = await supabase.rpc("cancel_appointment", { p_appointment: row.id, p_reason: null });
          setBusy(false);
          onDone(error ? rpcErrorMessage(error) : "Randevunuz iptal edildi.");
        }}
      >
        İptal et
      </button>
    </div>
  );
}

function ReviewForm({ row, onDone }: { row: Row; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-2 border-t border-line pt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!rating) return setError("Lütfen puan verin.");
        setBusy(true);
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase.from("business_reviews").insert({
          appointment_id: row.id,
          business_id: row.business_id,
          customer_id: auth.user!.id,
          rating,
          comment: comment.trim() || null,
        });
        setBusy(false);
        if (error) return setError("Değerlendirme kaydedilemedi.");
        onDone();
      }}
    >
      <p className="text-sm font-medium">İşletmeyi değerlendirin</p>
      <div className="flex gap-1 text-2xl">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} onClick={() => setRating(n)} className={n <= rating ? "text-accent" : "text-line"} aria-label={`${n} yıldız`}>
            ★
          </button>
        ))}
      </div>
      <textarea className="input" rows={2} maxLength={1000} placeholder="Yorumunuz (isteğe bağlı)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className="btn" disabled={busy}>Gönder</button>
    </form>
  );
}

function AssessmentInfo({ row, onDone }: { row: Row; onDone: (msg: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const a = row.customer_assessments;
  if (!a) return null;

  const dispute = a.assessment_disputes;
  const canDispute = !dispute && !a.voided_at && now - new Date(a.updated_at).getTime() < 30 * DAY;
  const disputeLabel: Record<DisputeStatus, string> = {
    open: "İtirazınız inceleniyor. Bu süre içinde kayıt özetinize dahil edilmiyor.",
    upheld: "İtirazınız kabul edildi, kayıt geçersiz sayıldı.",
    rejected: "İtirazınız reddedildi.",
  };

  return (
    <div className="space-y-2 border-t border-line pt-3 text-sm">
      <p className="text-muted">
        İşletmenin kaydı: {ATTENDANCE_LABEL[a.attendance]}
        {a.payment !== "not_applicable" && ` · ${PAYMENT_LABEL[a.payment]}`}
      </p>
      {dispute && <p className="text-xs">{disputeLabel[dispute.status]}</p>}
      {canDispute && !open && (
        <button className="text-xs underline" onClick={() => setOpen(true)}>Bu kayıt hatalı, itiraz et</button>
      )}
      {open && (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const { data: auth } = await supabase.auth.getUser();
            const { error } = await supabase
              .from("assessment_disputes")
              .insert({ assessment_id: a.id, customer_id: auth.user!.id, reason: reason.trim() });
            setBusy(false);
            onDone(error ? "İtiraz gönderilemedi." : "İtirazınız alındı. İnceleme sonucunu burada göreceksiniz.");
          }}
        >
          <textarea
            className="input"
            rows={3}
            minLength={10}
            maxLength={1000}
            required
            placeholder="Ne oldu? (en az 10 karakter)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button className="btn" disabled={busy || reason.trim().length < 10}>İtirazı gönder</button>
        </form>
      )}
    </div>
  );
}

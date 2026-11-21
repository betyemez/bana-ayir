"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APPOINTMENT_STATUS_LABEL,
  ATTENDANCE_LABEL,
  PAYMENT_LABEL,
  formatDateKeyTR,
  formatPhoneTR,
  formatTime,
  rpcErrorMessage,
  upcomingDateKeys,
  type AppointmentStatus,
  type AttendanceOutcome,
  type CustomerReliability,
  type PaymentOutcome,
} from "@randevu/shared";
import { createClient } from "@/lib/supabase/client";
import { ReliabilityCard } from "@/components/reliability-card";
import { StatusBadge } from "@/components/status-badge";
import type { PanelBusiness } from "./business-panel";
import { CLOSURE_COLUMNS, TimeOffForm, describeClosure, type Closure } from "./time-off";

interface Row {
  id: string;
  customer_id: string;
  resource_id: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  party_size: number;
  customer_note: string | null;
  is_late_cancellation: boolean;
  profiles: { full_name: string | null; phone: string | null } | null;
  resources: { name: string } | null;
  appointment_items: { name: string }[];
  customer_assessments: { attendance: AttendanceOutcome; payment: PaymentOutcome } | null;
}

interface Resource {
  id: string;
  name: string;
  capacity: number;
  is_active: boolean;
  sort_order: number;
}

interface Hours {
  weekday: number;
  opens_at: string;
  closes_at: string;
}

/** Takvimde yer kaplayan durumlar. İptal edilenler ızgaranın altında ayrıca listelenir. */
const OCCUPYING: AppointmentStatus[] = ["pending", "confirmed", "completed", "no_show"];
const UNASSIGNED = "__none__";
const ROW_H = "2.5rem";

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));
const staffColor = (i: number) => ({ strong: `var(--staff-${(i % 8) + 1})`, soft: `var(--staff-${(i % 8) + 1}-soft)` });
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fmtMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Bir anın işletme saat dilimindeki "gece yarısından itibaren dakika" karşılığı */
function minutesInTz(iso: string, timeZone: string): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso));
  return Number(p.find((x) => x.type === "hour")!.value) * 60 + Number(p.find((x) => x.type === "minute")!.value);
}

/** 1 = Pazartesi … 7 = Pazar (business_hours ile aynı) */
function isoWeekday(dateKey: string): number {
  const d = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** İşletme saat dilimindeki bir günün [başlangıç, bitiş) UTC aralığı */
function dayRange(dateKey: string, timeZone: string): [string, string] {
  const guess = new Date(`${dateKey}T00:00:00Z`);
  const tzOffset = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(d);
    const v = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    return Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second")) - d.getTime();
  };
  const start = new Date(guess.getTime() - tzOffset(guess));
  const end = new Date(start.getTime() + 86_400_000);
  return [start.toISOString(), end.toISOString()];
}

export function AppointmentsTab({ business }: { business: PanelBusiness }) {
  const supabase = useMemo(() => createClient(), []);
  const tz = business.timezone;
  const [now] = useState(() => Date.now());
  // Son 7 gün (değerlendirme için) + önümüzdeki 14 gün
  const dates = useMemo(() => {
    const past = upcomingDateKeys(tz, 8, new Date(now - 7 * 86_400_000)).slice(0, 7);
    return [...past, ...upcomingDateKeys(tz, 14, new Date(now))];
  }, [tz, now]);
  const [date, setDate] = useState(dates[7]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [hours, setHours] = useState<Hours[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  // Seçim: randevu kimliği ya da kapatmalar için "c:<id>"
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingOff, setAddingOff] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [from, to] = dayRange(date, tz);
    const [{ data }, { data: off }] = await Promise.all([
      supabase
        .from("appointments")
        .select(
          `id, customer_id, resource_id, starts_at, ends_at, status, party_size, customer_note, is_late_cancellation,
           profiles(full_name, phone), resources(name), appointment_items(name),
           customer_assessments(attendance, payment)`,
        )
        .eq("business_id", business.id)
        .gte("starts_at", from)
        .lt("starts_at", to)
        .order("starts_at"),
      supabase.from("business_closures").select(CLOSURE_COLUMNS).eq("business_id", business.id).lte("starts_on", date).gte("ends_on", date),
    ]);
    setClosures((off ?? []) as Closure[]);
    setRows(
      (data ?? []).map((r) => ({
        ...r,
        profiles: one(r.profiles),
        resources: one(r.resources),
        customer_assessments: one(r.customer_assessments),
      })) as Row[],
    );
  }, [supabase, business.id, date, tz]);

  // load() async: setState yalnızca await sonrasında çalışır, senkron kaskad oluşmaz.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    Promise.all([
      supabase.from("resources").select("id, name, capacity, is_active, sort_order").eq("business_id", business.id).order("sort_order"),
      supabase.from("business_hours").select("weekday, opens_at, closes_at").eq("business_id", business.id),
    ]).then(([r, h]) => {
      setResources((r.data ?? []) as Resource[]);
      setHours((h.data ?? []) as Hours[]);
    });
  }, [supabase, business.id]);

  const act = async (fn: PromiseLike<{ error: { message?: string } | null }>, ok: string) => {
    const { error } = await fn;
    setMsg(error ? rpcErrorMessage(error) : ok);
    load();
  };

  const select = (id: string) => {
    setSelectedId(id);
    // Dar ekranda detay ızgaranın altında kalır; oraya kaydır.
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 1023px)").matches) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const removeClosure = async (id: number) => {
    const { error } = await supabase.from("business_closures").delete().eq("id", id);
    setMsg(error ? "Kaldırılamadı." : "Kapatma kaldırıldı; bu zaman tekrar randevuya açık.");
    setSelectedId(null);
    load();
  };

  const selected = rows?.find((r) => r.id === selectedId) ?? null;
  const selectedClosure = closures.find((c) => `c:${c.id}` === selectedId) ?? null;
  const cancelled = rows?.filter((r) => !OCCUPYING.includes(r.status)) ?? [];
  const active = rows?.filter((r) => OCCUPYING.includes(r.status)) ?? [];
  const pendingCount = active.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {dates.map((d, i) => {
          const f = formatDateKeyTR(d);
          return (
            <button
              key={d}
              onClick={() => {
                if (d !== date) {
                  setRows(null);
                  setSelectedId(null);
                  setAddingOff(false);
                  setMsg(null);
                }
                setDate(d);
              }}
              className={`min-w-[3.75rem] shrink-0 rounded-xl border px-2 py-2 text-center text-xs transition ${
                d === date ? "border-ink bg-ink text-ink-fg" : i < 7 ? "border-line text-muted" : "border-line"
              }`}
            >
              <span className="block">{i === 7 ? "Bugün" : f.weekday}</span>
              <span className="block font-medium">{f.day}</span>
            </button>
          );
        })}
      </div>

      {msg && <p className="card text-sm">{msg}</p>}
      {rows === null ? (
        <p className="text-sm text-muted">Yükleniyor…</p>
      ) : (
        <div className="gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">
                {active.length === 0 ? "Bu gün için randevu yok." : `${active.length} randevu`}
                {pendingCount > 0 && <span className="font-semibold text-warning"> · {pendingCount} onay bekliyor</span>}
              </p>
              {!addingOff && date >= dates[7] && (
                <button className="btn-ghost" onClick={() => setAddingOff(true)}>
                  Bu günü / personeli kapat
                </button>
              )}
            </div>
            {addingOff && (
              <div className="card">
                <h3 className="mb-3 font-semibold">İzin veya kapatma ekle</h3>
                <TimeOffForm
                  business={business}
                  resources={resources.filter((r) => r.is_active)}
                  defaultDate={date}
                  onCancel={() => setAddingOff(false)}
                  onSaved={(m) => {
                    setMsg(m);
                    setAddingOff(false);
                    load();
                  }}
                />
              </div>
            )}
            <DayGrid
              business={business}
              date={date}
              isToday={date === dates[7]}
              now={now}
              rows={active}
              resources={resources}
              hours={hours}
              closures={closures}
              selectedId={selectedId}
              onSelect={select}
            />
            {cancelled.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">İptal edilenler</p>
                <div className="flex flex-wrap gap-2">
                  {cancelled.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => select(r.id)}
                      className={`chip text-muted line-through decoration-muted/60 ${selectedId === r.id ? "chip-active no-underline" : ""}`}
                    >
                      {formatTime(r.starts_at, tz)} · {r.profiles?.full_name ?? "Müşteri"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div ref={detailRef} className="mt-4 scroll-mt-4 lg:sticky lg:top-4 lg:mt-0">
            {selected ? (
              <AppointmentCard
                key={selected.id}
                row={selected}
                tz={tz}
                now={now}
                onClose={() => setSelectedId(null)}
                act={act}
              />
            ) : selectedClosure ? (
              <div className="card space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{describeClosure(selectedClosure, resources).who}: kapalı</p>
                    <p className="text-sm text-muted">{describeClosure(selectedClosure, resources).when}</p>
                    {selectedClosure.reason && <p className="text-sm">{selectedClosure.reason}</p>}
                  </div>
                  <button className="shrink-0 rounded-lg px-2 py-1 text-muted hover:bg-surface-2" onClick={() => setSelectedId(null)} aria-label="Kapat">
                    ✕
                  </button>
                </div>
                <p className="text-xs text-muted">Bu zaman müşterilere gösterilmiyor.</p>
                <button className="btn-ghost" onClick={() => removeClosure(selectedClosure.id)}>
                  Kapatmayı kaldır
                </button>
              </div>
            ) : (
              <p className="card text-sm text-muted">Ayrıntıları görmek ve işlem yapmak için takvimden bir randevuya dokunun.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Günlük takvim ızgarası: satırlar saat, sütunlar personel/salon
// ---------------------------------------------------------------------
function DayGrid({
  business,
  date,
  isToday,
  now,
  rows,
  resources,
  hours,
  closures,
  selectedId,
  onSelect,
}: {
  business: PanelBusiness;
  date: string;
  isToday: boolean;
  now: number;
  rows: Row[];
  resources: Resource[];
  hours: Hours[];
  closures: Closure[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const tz = business.timezone;
  const isReservation = business.booking_mode === "reservation";
  // 5-10 dakikalık aralıklarda ızgara çok uzamasın diye satır en az 15 dakika
  const step = Math.max(15, business.slot_interval_minutes);

  const model = useMemo(() => {
    const items = rows.map((r) => {
      const start = minutesInTz(r.starts_at, tz);
      const duration = Math.max(1, Math.round((new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()) / 60_000));
      return { row: r, start, end: start + duration };
    });

    // Sütunlar: aktif kaynaklar + o gün randevusu olan pasif kaynaklar + atanmamış randevular
    const used = new Set(rows.map((r) => r.resource_id ?? UNASSIGNED));
    const cols = resources
      .map((res, i) => ({ id: res.id, name: res.name, capacity: res.capacity, color: staffColor(i), show: res.is_active || used.has(res.id) }))
      .filter((c) => c.show);
    if (used.has(UNASSIGNED) || rows.some((r) => r.resource_id && !cols.some((c) => c.id === r.resource_id))) {
      cols.push({ id: UNASSIGNED, name: "Atanmamış", capacity: 1, color: { strong: "var(--muted)", soft: "var(--surface-2)" }, show: true });
    }

    // Gün aralığı: çalışma saatleri, dışına taşan randevular varsa onlar da dahil
    const today = hours.filter((h) => h.weekday === isoWeekday(date));
    const bounds = [
      ...today.flatMap((h) => [toMin(h.opens_at), toMin(h.closes_at)]),
      ...items.flatMap((i) => [i.start, i.end]),
    ];
    if (bounds.length === 0) return null;
    const dayStart = Math.floor(Math.min(...bounds) / step) * step;
    const dayEnd = Math.ceil(Math.max(...bounds) / step) * step;
    const rowCount = Math.max(1, (dayEnd - dayStart) / step);
    const isOpen = (m: number) => today.some((h) => m >= toMin(h.opens_at) && m < toMin(h.closes_at));

    // Her sütunda çakışan randevular yan yana şeritlere bölünür (ör. restoranda aynı salonda iki masa)
    const tiles = cols.flatMap((col, ci) => {
      const mine = items
        .filter((i) => (i.row.resource_id && cols.some((c) => c.id === i.row.resource_id) ? i.row.resource_id : UNASSIGNED) === col.id)
        .sort((a, b) => a.start - b.start);
      const laneEnds: number[] = [];
      const placed = mine.map((i) => {
        let lane = laneEnds.findIndex((end) => end <= i.start);
        if (lane === -1) lane = laneEnds.push(i.end) - 1;
        else laneEnds[lane] = i.end;
        const r0 = Math.floor((i.start - dayStart) / step);
        const span = Math.max(1, Math.ceil((i.end - dayStart) / step) - r0);
        return { ...i, lane, r0, span, ci };
      });
      return placed.map((p) => ({ ...p, lanes: laneEnds.length }));
    });

    // İzin/kapatma blokları: işletme geneli tüm sütunlara, personel izni yalnızca kendi sütununa
    const offBlocks = cols.flatMap((col, ci) =>
      col.id === UNASSIGNED
        ? []
        : closures
            .filter((c) => c.resource_id === null || c.resource_id === col.id)
            .map((c) => {
              const from = c.start_time ? Math.max(dayStart, toMin(c.start_time)) : dayStart;
              const to = c.end_time ? Math.min(dayEnd, toMin(c.end_time)) : dayEnd;
              const r0 = Math.floor((from - dayStart) / step);
              const span = Math.ceil((to - dayStart) / step) - r0;
              return { closure: c, ci, r0, span };
            })
            .filter((b) => b.span > 0),
    );

    const covered = new Set(
      [...tiles, ...offBlocks].flatMap((t) => Array.from({ length: t.span }, (_, k) => `${t.ci}:${t.r0 + k}`)),
    );
    const wholeDayClosed = closures.some((c) => c.resource_id === null && c.start_time === null);
    return { cols, dayStart, rowCount, isOpen, tiles, offBlocks, covered, wholeDayClosed };
  }, [rows, resources, hours, closures, date, tz, step]);

  if (!model) return <p className="card text-sm text-muted">Bu gün kapalısınız. Çalışma saatlerini Ayarlar sekmesinden değiştirebilirsiniz.</p>;
  if (model.cols.length === 0) return <p className="card text-sm text-muted">Takvimi görmek için Ayarlar sekmesinden en az bir personel/kaynak ekleyin.</p>;

  const { cols, dayStart, rowCount, isOpen, tiles, offBlocks, covered, wholeDayClosed } = model;
  const nowMin = isToday ? minutesInTz(new Date(now).toISOString(), tz) : null;
  const nowRow = nowMin !== null ? (nowMin - dayStart) / step : null;
  const slotPast = (r: number) => nowMin !== null && dayStart + (r + 1) * step <= nowMin;
  const multi = cols.length > 1;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
        {multi &&
          cols.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: c.color.strong }} />
              {c.name}
            </span>
          ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 rounded border border-dashed border-line bg-background" />
          Boş
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 rounded border-[1.5px] border-dashed border-warning" />
          Onay bekliyor
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 rounded border border-line bg-[repeating-linear-gradient(135deg,var(--danger-soft)_0_4px,transparent_4px_8px)]" />
          Kapalı / izinli
        </span>
      </div>

      {wholeDayClosed && (
        <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          İşletme bu gün kapalı. Müşteriler bu gün için saat göremez.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <div
          className="relative grid min-w-full"
          style={{
            gridTemplateColumns: `3.25rem repeat(${cols.length}, minmax(${multi ? "8.5rem" : "12rem"}, 1fr))`,
            gridTemplateRows: `auto repeat(${rowCount}, ${ROW_H})`,
          }}
        >
          {/* Başlık satırı */}
          <div className="z-20 border-b border-line bg-surface" style={{ gridRow: 1, gridColumn: 1 }} />
          {cols.map((c, ci) => (
            <div
              key={c.id}
              className="z-20 flex items-center gap-2 border-b border-line bg-surface px-2 py-2.5 text-sm font-semibold"
              style={{ gridRow: 1, gridColumn: ci + 2 }}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color.strong }} />
              <span className="truncate">{c.name}</span>
              {isReservation && c.id !== UNASSIGNED && <span className="ml-auto shrink-0 text-xs font-normal text-muted">{c.capacity} kişi</span>}
            </div>
          ))}

          {/* Saat etiketleri */}
          {Array.from({ length: rowCount }, (_, r) => {
            const m = dayStart + r * step;
            const full = m % 60 === 0;
            return (
              <div
                key={`t${r}`}
                className={`border-t px-1.5 pt-0.5 text-right text-[11px] tabular-nums ${full ? "border-line font-semibold text-foreground" : "border-line/50 text-muted"}`}
                style={{ gridRow: r + 2, gridColumn: 1 }}
              >
                {fmtMin(m)}
              </div>
            );
          })}

          {/* Boş kutucuklar */}
          {cols.flatMap((c, ci) =>
            Array.from({ length: rowCount }, (_, r) => {
              if (covered.has(`${ci}:${r}`)) return null;
              const open = isOpen(dayStart + r * step);
              const past = slotPast(r);
              return (
                <div
                  key={`e${ci}:${r}`}
                  className={`m-[3px] flex items-center rounded-lg px-2 text-[11px] ${
                    open
                      ? `border border-dashed border-line bg-background text-muted ${past ? "opacity-40" : ""}`
                      : "bg-[repeating-linear-gradient(135deg,var(--surface-2)_0_6px,transparent_6px_12px)] opacity-60"
                  }`}
                  style={{ gridRow: r + 2, gridColumn: ci + 2 }}
                  title={open ? `${fmtMin(dayStart + r * step)} boş` : "Çalışma saati dışında"}
                >
                  {open && !past && "Boş"}
                </div>
              );
            }),
          )}

          {/* İzin / kapatma blokları (randevular bunların üstünde görünür) */}
          {offBlocks.map((b) => {
            const c = b.closure;
            const key = `c:${c.id}`;
            const label = c.resource_id ? "İzinli" : "Kapalı";
            const time = c.start_time && c.end_time ? `${c.start_time.slice(0, 5)}–${c.end_time.slice(0, 5)}` : "Tüm gün";
            return (
              <button
                key={`${key}:${b.ci}`}
                onClick={() => onSelect(key)}
                className={`m-[3px] flex flex-col items-start justify-start overflow-hidden rounded-lg border border-line bg-[repeating-linear-gradient(135deg,var(--danger-soft)_0_6px,transparent_6px_12px)] px-2 py-1 text-left text-[11px] leading-tight text-muted transition hover:border-danger/40 ${
                  selectedId === key ? "ring-2 ring-foreground ring-offset-1 ring-offset-surface" : ""
                }`}
                style={{ gridRow: `${b.r0 + 2} / span ${b.span}`, gridColumn: b.ci + 2 }}
                title={`${label} · ${time}${c.reason ? ` · ${c.reason}` : ""}`}
              >
                <span className="font-semibold text-danger">{label}</span>
                <span className="truncate">
                  {time}
                  {c.reason && ` · ${c.reason}`}
                </span>
              </button>
            );
          })}

          {/* Randevu kutucukları */}
          {tiles.map((t) => {
            const r = t.row;
            const color = cols[t.ci].color;
            const pending = r.status === "pending";
            const noShow = r.status === "no_show";
            const isSel = r.id === selectedId;
            return (
              <button
                key={r.id}
                onClick={() => onSelect(r.id)}
                className={`relative z-10 my-[3px] flex min-w-0 flex-col justify-start self-stretch justify-self-start overflow-hidden rounded-lg px-2 py-1 text-left text-xs leading-tight transition hover:brightness-95 dark:hover:brightness-110 ${
                  isSel ? "ring-2 ring-foreground ring-offset-1 ring-offset-surface" : ""
                } ${noShow ? "opacity-60" : ""}`}
                style={{
                  gridRow: `${t.r0 + 2} / span ${t.span}`,
                  gridColumn: t.ci + 2,
                  width: `calc(${100 / t.lanes}% - 6px)`,
                  marginLeft: `calc(${(t.lane * 100) / t.lanes}% + 3px)`,
                  background: color.soft,
                  borderLeft: `4px solid ${color.strong}`,
                  outline: pending ? `1.5px dashed ${color.strong}` : undefined,
                  outlineOffset: pending ? "-1.5px" : undefined,
                }}
                title={`${formatTime(r.starts_at, tz)}–${formatTime(r.ends_at, tz)} · ${r.profiles?.full_name ?? "Müşteri"} · ${APPOINTMENT_STATUS_LABEL[r.status]}`}
              >
                <span className={`truncate font-semibold ${noShow ? "line-through" : ""}`}>
                  {r.profiles?.full_name ?? "Müşteri"}
                  {r.party_size > 1 && <span className="font-normal"> · {r.party_size} kişi</span>}
                </span>
                <span className="truncate tabular-nums text-muted">
                  {formatTime(r.starts_at, tz)}–{formatTime(r.ends_at, tz)}
                  {pending && <span className="font-semibold text-warning"> · Onay bekliyor</span>}
                  {r.status === "completed" && " · ✓"}
                  {noShow && " · Gelmedi"}
                </span>
                {t.span >= 2 && r.appointment_items.length > 0 && (
                  <span className="mt-0.5 truncate">{r.appointment_items.map((i) => i.name).join(", ")}</span>
                )}
              </button>
            );
          })}

          {/* Şu anki saat çizgisi */}
          {nowRow !== null && nowRow >= 0 && nowRow < rowCount && (
            <div
              className="pointer-events-none relative z-30 h-0 self-start"
              style={{ gridRow: Math.floor(nowRow) + 2, gridColumn: "1 / -1", marginTop: `calc(${nowRow % 1} * ${ROW_H})` }}
            >
              <div className="absolute inset-x-0 -top-px h-0.5 bg-brand" />
              <div className="absolute -top-1 left-[3.1rem] size-2 rounded-full bg-brand" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Seçilen randevunun ayrıntısı ve işlemleri
// ---------------------------------------------------------------------
function AppointmentCard({
  row: r,
  tz,
  now,
  onClose,
  act,
}: {
  row: Row;
  tz: string;
  now: number;
  onClose: () => void;
  act: (fn: PromiseLike<{ error: { message?: string } | null }>, ok: string) => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const started = now >= new Date(r.starts_at).getTime();
  const canAssess =
    started && now <= new Date(r.ends_at).getTime() + 7 * 86_400_000 && OCCUPYING.includes(r.status);

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {formatTime(r.starts_at, tz)}–{formatTime(r.ends_at, tz)} · {r.profiles?.full_name ?? "Müşteri"}
          </p>
          <p className="text-sm text-muted">
            {r.profiles?.phone && formatPhoneTR(r.profiles.phone)}
            {r.resources && ` · ${r.resources.name}`}
            {r.party_size > 1 && ` · ${r.party_size} kişi`}
          </p>
          {r.appointment_items.length > 0 && <p className="text-sm">{r.appointment_items.map((i) => i.name).join(", ")}</p>}
          {r.customer_note && <p className="text-sm italic">“{r.customer_note}”</p>}
        </div>
        <button className="shrink-0 rounded-lg px-2 py-1 text-muted hover:bg-surface-2" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
      </div>
      <StatusBadge status={r.status} late={r.is_late_cancellation} />

      <div className="flex flex-wrap gap-2">
        {r.status === "pending" && (
          <button className="btn" onClick={() => act(supabase.rpc("business_update_appointment", { p_appointment: r.id, p_action: "confirm" }), "Onaylandı: bu vakit müşteriye ayrıldı.")}>
            Onayla
          </button>
        )}
        {["pending", "confirmed"].includes(r.status) && !started && (
          <button
            className="btn-ghost text-danger"
            onClick={() => {
              const reason = prompt("İptal nedeni (müşteriye gösterilir):");
              if (reason === null) return;
              act(supabase.rpc("business_update_appointment", { p_appointment: r.id, p_action: "cancel", p_reason: reason }), "Randevu iptal edildi.");
            }}
          >
            İptal et
          </button>
        )}
        <ReliabilityButton customerId={r.customer_id} />
      </div>

      {canAssess && (
        <AssessForm
          current={r.customer_assessments}
          onSubmit={(attendance, payment) =>
            act(
              supabase.rpc("submit_customer_assessment", { p_appointment: r.id, p_attendance: attendance, p_payment: payment }),
              "Değerlendirme kaydedildi.",
            )
          }
        />
      )}
      {!canAssess && r.customer_assessments && (
        <p className="text-sm text-muted">
          Değerlendirme: {ATTENDANCE_LABEL[r.customer_assessments.attendance]}
          {r.customer_assessments.payment !== "not_applicable" && ` · ${PAYMENT_LABEL[r.customer_assessments.payment]}`}
        </p>
      )}
    </div>
  );
}

function ReliabilityButton({ customerId }: { customerId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<CustomerReliability | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="btn-ghost"
        onClick={async () => {
          if (!open && !data) {
            const { data: d } = await supabase.rpc("get_customer_reliability", { p_customer: customerId }).single();
            setData(d as CustomerReliability);
          }
          setOpen((o) => !o);
        }}
      >
        Müşteri güvenilirliği
      </button>
      {open && data && (
        <div className="w-full">
          <ReliabilityCard data={data} />
        </div>
      )}
    </>
  );
}

function AssessForm({
  current,
  onSubmit,
}: {
  current: { attendance: AttendanceOutcome; payment: PaymentOutcome } | null;
  onSubmit: (a: AttendanceOutcome, p: PaymentOutcome) => void;
}) {
  const [attendance, setAttendance] = useState<AttendanceOutcome | "">(current?.attendance ?? "");
  const [payment, setPayment] = useState<PaymentOutcome | "">(current?.payment ?? "");
  const noShow = attendance === "no_show";

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <p className="text-sm font-medium">{current ? "Değerlendirmeyi güncelle" : "Müşteriyi değerlendir"}</p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ATTENDANCE_LABEL) as AttendanceOutcome[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setAttendance(k);
              if (k === "no_show") setPayment("not_applicable");
              else if (payment === "not_applicable") setPayment("");
            }}
            className={`chip ${attendance === k ? "chip-active" : ""}`}
          >
            {ATTENDANCE_LABEL[k]}
          </button>
        ))}
      </div>
      {attendance && !noShow && (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PAYMENT_LABEL) as PaymentOutcome[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setPayment(k)}
              className={`chip ${payment === k ? "chip-active" : ""}`}
            >
              {PAYMENT_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">
        Değerlendirme müşteriye gösterilir ve müşteri itiraz edebilir. Yalnızca gerçekleşen durumu işaretleyin.
        Müşteri randevuyu iptal ettiyse burada değerlendirme gerekmez, sistem bunu otomatik kaydeder.
      </p>
      <button className="btn" disabled={!attendance || !payment} onClick={() => attendance && payment && onSubmit(attendance, payment)}>
        Kaydet
      </button>
    </div>
  );
}

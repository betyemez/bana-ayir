"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatTime, upcomingDateKeys } from "@randevu/shared";
import { createClient } from "@/lib/supabase/client";
import type { PanelBusiness } from "./business-panel";

export interface Closure {
  id: number;
  resource_id: string | null;
  starts_on: string;
  ends_on: string;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
}

export interface ClosureResource {
  id: string;
  name: string;
}

export const CLOSURE_COLUMNS = "id, resource_id, starts_on, ends_on, start_time, end_time, reason";

const fmtDate = (key: string) =>
  new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", weekday: "short", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));

/** "Ayşe · 24 Kasım Pzt · 12:00–14:00" gibi kısa açıklama */
export function describeClosure(c: Closure, resources: ClosureResource[]): { who: string; when: string } {
  const who = c.resource_id ? (resources.find((r) => r.id === c.resource_id)?.name ?? "Personel") : "Tüm işletme";
  const days = c.starts_on === c.ends_on ? fmtDate(c.starts_on) : `${fmtDate(c.starts_on)} – ${fmtDate(c.ends_on)}`;
  const time = c.start_time && c.end_time ? `${c.start_time.slice(0, 5)}–${c.end_time.slice(0, 5)}` : "tüm gün";
  return { who, when: `${days} · ${time}` };
}

// ---------------------------------------------------------------------
// İzin / kapatma ekleme formu
// ---------------------------------------------------------------------
export function TimeOffForm({
  business,
  resources,
  defaultDate,
  onSaved,
  onCancel,
}: {
  business: PanelBusiness;
  resources: ClosureResource[];
  defaultDate: string;
  onSaved: (message: string) => void;
  onCancel?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const isReservation = business.booking_mode === "reservation";
  const [who, setWho] = useState<string>("");
  const [from, setFrom] = useState(defaultDate);
  const [to, setTo] = useState(defaultDate);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("14:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (to < from) return setError("Bitiş tarihi başlangıçtan önce olamaz.");
    if (!allDay && endTime <= startTime) return setError("Bitiş saati başlangıçtan sonra olmalı.");
    setSaving(true);
    const { error: err } = await supabase.from("business_closures").insert({
      business_id: business.id,
      resource_id: who || null,
      starts_on: from,
      ends_on: to,
      start_time: allDay ? null : startTime,
      end_time: allDay ? null : endTime,
      reason: reason.trim() || null,
    });
    if (err) {
      setSaving(false);
      return setError("Kaydedilemedi. Lütfen tekrar deneyin.");
    }

    // Kapatılan zamana önceden alınmış randevular otomatik iptal edilmez; işletmeyi uyar.
    const conflicts = await countConflicts();
    setSaving(false);
    const name = who ? (resources.find((r) => r.id === who)?.name ?? "Personel") : "İşletme";
    onSaved(
      conflicts > 0
        ? `${name} için kapatma eklendi. Bu aralıkta önceden alınmış ${conflicts} randevu var; müşteriler otomatik iptal edilmedi, takvimden kontrol edin.`
        : `${name} için kapatma eklendi. Müşteriler bu zamanı artık göremez.`,
    );
  }

  async function countConflicts(): Promise<number> {
    // Saat dilimi farkını tolere eden geniş aralık; kesin eleme aşağıda işletme saat diliminde yapılır.
    const lo = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000).toISOString();
    const hi = new Date(Date.parse(`${to}T00:00:00Z`) + 2 * 86_400_000).toISOString();
    let query = supabase
      .from("appointments")
      .select("starts_at, ends_at, resource_id")
      .eq("business_id", business.id)
      .in("status", ["pending", "confirmed"])
      .gte("starts_at", lo)
      .lt("starts_at", hi);
    if (who) query = query.eq("resource_id", who);
    const { data } = await query;
    const tz = business.timezone;
    const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    return (data ?? []).filter((a) => {
      const key = dayKey.format(new Date(a.starts_at));
      if (key < from || key > to) return false;
      if (allDay) return true;
      const s = formatTime(a.starts_at, tz);
      const e = formatTime(a.ends_at, tz);
      return s < endTime && e > startTime;
    }).length;
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Kim için?</label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setWho("")} className={`chip ${who === "" ? "chip-active" : ""}`}>
              Tüm işletme
            </button>
            {resources.map((r) => (
              <button key={r.id} type="button" onClick={() => setWho(r.id)} className={`chip ${who === r.id ? "chip-active" : ""}`}>
                {r.name}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {who
              ? `Yalnızca bu ${isReservation ? "alan" : "kişi"} kapanır; diğerlerinden randevu alınmaya devam edilir.`
              : "İşletmenin tamamı kapanır; bu zamanda kimseden randevu alınamaz."}
          </p>
        </div>
        <div>
          <label className="label">Başlangıç tarihi</label>
          <input
            type="date"
            className="input"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              if (to < e.target.value) setTo(e.target.value);
            }}
            required
          />
        </div>
        <div>
          <label className="label">Bitiş tarihi</label>
          <input type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        Tüm gün
      </label>
      {!allDay && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input type="time" className="input w-32" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          –
          <input type="time" className="input w-32" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          <span className="text-xs text-muted">{from !== to && "Seçilen her gün bu saatler arası kapalı olur."}</span>
        </div>
      )}

      <div>
        <label className="label">Not (isteğe bağlı, yalnızca siz görürsünüz)</label>
        <input className="input" maxLength={200} placeholder="ör. Yıllık izin, bakım, özel etkinlik" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button className="btn" disabled={saving}>
          {saving ? "Kaydediliyor…" : "Kapat"}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Vazgeç
          </button>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Ayarlar sekmesi: yaklaşan izin/kapatmalar + ekleme
// ---------------------------------------------------------------------
export function TimeOffSection({ business, resources }: { business: PanelBusiness; resources: ClosureResource[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [today] = useState(() => upcomingDateKeys(business.timezone, 1)[0]);
  const [list, setList] = useState<Closure[]>([]);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("business_closures")
      .select(CLOSURE_COLUMNS)
      .eq("business_id", business.id)
      .gte("ends_on", today)
      .order("starts_on");
    setList((data ?? []) as Closure[]);
  }, [supabase, business.id, today]);

  // load() async: setState yalnızca await sonrasında çalışır, senkron kaskad oluşmaz.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function remove(id: number) {
    const { error } = await supabase.from("business_closures").delete().eq("id", id);
    setMsg(error ? "Kaldırılamadı." : "Kapatma kaldırıldı; bu zaman tekrar randevuya açık.");
    load();
  }

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">İzin ve kapalı günler</h2>
          <p className="text-sm text-muted">
            İşletmenin tamamını ya da tek bir {business.booking_mode === "reservation" ? "alanı" : "personeli"} belirli günlerde veya saatlerde kapatın.
            Kapalı zaman müşteriye hiç gösterilmez.
          </p>
        </div>
        {!adding && (
          <button className="btn-ghost" onClick={() => setAdding(true)}>
            Kapatma ekle
          </button>
        )}
      </div>

      {msg && <p className="text-sm">{msg}</p>}

      {adding && (
        <div className="rounded-xl border border-line p-4">
          <TimeOffForm
            business={business}
            resources={resources}
            defaultDate={today}
            onCancel={() => setAdding(false)}
            onSaved={(m) => {
              setMsg(m);
              setAdding(false);
              load();
            }}
          />
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-sm text-muted">Yaklaşan kapatma yok.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((c) => {
            const d = describeClosure(c, resources);
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{d.who}</p>
                  <p className="text-muted">
                    {d.when}
                    {c.reason && ` · ${c.reason}`}
                  </p>
                </div>
                <button className="btn-ghost" onClick={() => remove(c.id)}>
                  Kaldır
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

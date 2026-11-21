"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PanelBusiness } from "./business-panel";
import { TimeOffSection } from "./time-off";

const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

interface DayHours {
  open: boolean;
  opens_at: string;
  closes_at: string;
}
interface Resource {
  id: string;
  name: string;
  capacity: number;
  is_active: boolean;
}

export function SettingsTab({ business, onSaved }: { business: PanelBusiness; onSaved: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [info, setInfo] = useState({
    name: business.name,
    description: business.description ?? "",
    phone: business.phone ?? "",
    address: business.address ?? "",
    city: business.city ?? "",
    district: business.district ?? "",
    slot_interval_minutes: business.slot_interval_minutes,
    default_duration_minutes: business.default_duration_minutes,
    min_notice_minutes: business.min_notice_minutes,
    max_advance_days: business.max_advance_days,
    cancellation_window_hours: business.cancellation_window_hours,
    max_party_size: business.max_party_size,
    auto_confirm: business.auto_confirm,
    sms_reminder_hours: business.sms_reminder_hours ?? 24,
  });
  const [hours, setHours] = useState<DayHours[]>(DAYS.map(() => ({ open: false, opens_at: "09:00", closes_at: "19:00" })));
  const [resources, setResources] = useState<Resource[]>([]);
  const [newResource, setNewResource] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const isReservation = business.booking_mode === "reservation";

  const load = useCallback(async () => {
    const [h, r] = await Promise.all([
      supabase.from("business_hours").select("weekday, opens_at, closes_at").eq("business_id", business.id).order("opens_at"),
      supabase.from("resources").select("id, name, capacity, is_active").eq("business_id", business.id).order("sort_order"),
    ]);
    setHours(
      DAYS.map((_, i) => {
        const row = (h.data ?? []).find((x) => x.weekday === i + 1);
        return row ? { open: true, opens_at: row.opens_at.slice(0, 5), closes_at: row.closes_at.slice(0, 5) } : { open: false, opens_at: "09:00", closes_at: "19:00" };
      }),
    );
    setResources((r.data ?? []) as Resource[]);
  }, [supabase, business.id]);

  // load() async: setState yalnızca await sonrasında çalışır, senkron kaskad oluşmaz.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 3000);
  };

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase
      .from("businesses")
      .update({
        ...info,
        name: info.name.trim(),
        description: info.description.trim() || null,
        phone: info.phone.trim() || null,
        address: info.address.trim() || null,
        city: info.city.trim() || null,
        district: info.district.trim() || null,
      })
      .eq("id", business.id);
    flash(error ? "Kaydedilemedi: değerleri kontrol edin." : "Bilgiler kaydedildi.");
    if (!error) onSaved();
  }

  async function saveHours() {
    if (hours.some((h) => h.open && h.closes_at <= h.opens_at)) return flash("Kapanış saati açılıştan sonra olmalı.");
    // Not: öğle arası gibi bölünmüş saatler veritabanında destekleniyor; bu basit editör günde tek aralık yönetir.
    const { error: delErr } = await supabase.from("business_hours").delete().eq("business_id", business.id);
    const rows = hours
      .map((h, i) => ({ business_id: business.id, weekday: i + 1, opens_at: h.opens_at, closes_at: h.closes_at, open: h.open }))
      .filter((h) => h.open)
      .map((h) => ({ business_id: h.business_id, weekday: h.weekday, opens_at: h.opens_at, closes_at: h.closes_at }));
    const { error } = rows.length ? await supabase.from("business_hours").insert(rows) : { error: null };
    flash(delErr || error ? "Saatler kaydedilemedi." : "Çalışma saatleri kaydedildi.");
  }

  async function togglePublish() {
    if (!business.is_published) {
      if (!hours.some((h) => h.open)) return flash("Yayına almadan önce çalışma saatlerini girin.");
      if (!resources.some((r) => r.is_active)) return flash("En az bir aktif personel/kaynak gerekli.");
    }
    const { error } = await supabase.from("businesses").update({ is_published: !business.is_published }).eq("id", business.id);
    flash(error ? "İşlem başarısız." : business.is_published ? "İşletme yayından kaldırıldı." : "İşletmeniz yayında!");
    onSaved();
  }

  const num = (k: keyof typeof info) => (e: React.ChangeEvent<HTMLInputElement>) => setInfo((s) => ({ ...s, [k]: Number(e.target.value) }));
  const txt = (k: keyof typeof info) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setInfo((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      {msg && <p className="card sticky top-2 z-10 text-sm">{msg}</p>}

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{business.is_published ? "İşletmeniz yayında" : "İşletmeniz taslak durumunda"}</p>
          <p className="text-sm text-muted">
            {business.is_published ? "Müşteriler sizi bulabilir ve randevu alabilir." : "Bilgileri tamamlayıp yayına aldığınızda müşteriler sizi görebilir."}
          </p>
        </div>
        <button className={business.is_published ? "btn-ghost" : "btn"} onClick={togglePublish}>
          {business.is_published ? "Yayından kaldır" : "Yayına al"}
        </button>
      </div>

      <form onSubmit={saveInfo} className="card space-y-4">
        <h2 className="font-semibold">İşletme bilgileri</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Ad</label>
            <input className="input" value={info.name} onChange={txt("name")} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Tanıtım yazısı</label>
            <textarea className="input" rows={4} value={info.description} onChange={txt("description")} />
          </div>
          <div><label className="label">Telefon</label><input className="input" value={info.phone} onChange={txt("phone")} /></div>
          <div><label className="label">Adres</label><input className="input" value={info.address} onChange={txt("address")} /></div>
          <div><label className="label">Şehir</label><input className="input" value={info.city} onChange={txt("city")} /></div>
          <div><label className="label">İlçe</label><input className="input" value={info.district} onChange={txt("district")} /></div>
        </div>

        <h2 className="pt-2 font-semibold">Randevu kuralları</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label">Saat aralığı (dk)</label><input className="input" type="number" min={5} step={5} value={info.slot_interval_minutes} onChange={num("slot_interval_minutes")} /></div>
          <div><label className="label">Varsayılan süre (dk)</label><input className="input" type="number" min={5} step={5} value={info.default_duration_minutes} onChange={num("default_duration_minutes")} /></div>
          <div><label className="label">En az kaç dk önceden</label><input className="input" type="number" min={0} step={15} value={info.min_notice_minutes} onChange={num("min_notice_minutes")} /></div>
          <div><label className="label">En fazla kaç gün ileri</label><input className="input" type="number" min={1} max={365} value={info.max_advance_days} onChange={num("max_advance_days")} /></div>
          <div><label className="label">Ücretsiz iptal (saat önce)</label><input className="input" type="number" min={0} max={168} value={info.cancellation_window_hours} onChange={num("cancellation_window_hours")} /></div>
          {isReservation && (
            <div><label className="label">En fazla kişi</label><input className="input" type="number" min={1} value={info.max_party_size} onChange={num("max_party_size")} /></div>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={info.auto_confirm} onChange={(e) => setInfo((s) => ({ ...s, auto_confirm: e.target.checked }))} />
          Randevuları otomatik onayla
        </label>

        <h2 className="pt-2 font-semibold">SMS bildirimleri</h2>
        <p className="text-sm text-muted">
          Müşteriye randevu onaylandığında ve siz iptal ettiğinizde SMS gider. Hatırlatma SMS&apos;i gelmeme oranını düşürür.
        </p>
        <div className="max-w-xs">
          <label className="label">Hatırlatma SMS&apos;i</label>
          <select
            className="input"
            value={info.sms_reminder_hours}
            onChange={(e) => setInfo((s) => ({ ...s, sms_reminder_hours: Number(e.target.value) }))}
          >
            <option value={0}>Gönderme</option>
            {[1, 2, 3, 6, 12, 24, 48].map((h) => (
              <option key={h} value={h}>
                Randevudan {h === 24 ? "1 gün" : h === 48 ? "2 gün" : `${h} saat`} önce
              </option>
            ))}
          </select>
        </div>
        <button className="btn">Kaydet</button>
      </form>

      <div className="card space-y-3">
        <h2 className="font-semibold">Çalışma saatleri</h2>
        {hours.map((h, i) => (
          <div key={i} className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex w-32 items-center gap-2">
              <input type="checkbox" checked={h.open} onChange={(e) => setHours((s) => s.map((x, j) => (j === i ? { ...x, open: e.target.checked } : x)))} />
              {DAYS[i]}
            </label>
            {h.open ? (
              <>
                <input type="time" className="input w-28" value={h.opens_at} onChange={(e) => setHours((s) => s.map((x, j) => (j === i ? { ...x, opens_at: e.target.value } : x)))} />
                –
                <input type="time" className="input w-28" value={h.closes_at} onChange={(e) => setHours((s) => s.map((x, j) => (j === i ? { ...x, closes_at: e.target.value } : x)))} />
              </>
            ) : (
              <span className="text-muted">Kapalı</span>
            )}
          </div>
        ))}
        <button className="btn" onClick={saveHours}>Saatleri kaydet</button>
      </div>

      <div className="card space-y-3">
        <div>
          <h2 className="font-semibold">{isReservation ? "Salonlar / alanlar" : "Personel / kaynaklar"}</h2>
          <p className="text-sm text-muted">
            {isReservation
              ? "Kapasite, o alanda aynı anda ağırlayabileceğiniz toplam kişi sayısıdır."
              : "Aynı anda kaç randevu alınabileceğini kaynak sayısı belirler (ör. her çalışan bir kaynak)."}
          </p>
        </div>
        <ul className="divide-y divide-line">
          {resources.map((r) => (
            <li key={r.id} className={`flex flex-wrap items-center gap-2 py-2 text-sm ${r.is_active ? "" : "opacity-50"}`}>
              <input
                className="input max-w-48"
                defaultValue={r.name}
                onBlur={async (e) => {
                  if (e.target.value.trim() && e.target.value !== r.name) {
                    await supabase.from("resources").update({ name: e.target.value.trim() }).eq("id", r.id);
                    load();
                  }
                }}
              />
              {isReservation && (
                <input
                  className="input w-24"
                  type="number"
                  min={1}
                  defaultValue={r.capacity}
                  title="Kapasite"
                  onBlur={async (e) => {
                    const c = Number(e.target.value);
                    if (c >= 1 && c !== r.capacity) {
                      await supabase.from("resources").update({ capacity: c }).eq("id", r.id);
                      load();
                    }
                  }}
                />
              )}
              <button
                className="btn-ghost"
                onClick={async () => {
                  await supabase.from("resources").update({ is_active: !r.is_active }).eq("id", r.id);
                  load();
                }}
              >
                {r.is_active ? "Pasifleştir" : "Aktifleştir"}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newResource.trim()) return;
            await supabase.from("resources").insert({
              business_id: business.id,
              name: newResource.trim(),
              capacity: isReservation ? 20 : 1,
              sort_order: resources.length,
            });
            setNewResource("");
            load();
          }}
        >
          <input className="input max-w-xs" placeholder={isReservation ? "ör. Bahçe" : "ör. Ayşe"} value={newResource} onChange={(e) => setNewResource(e.target.value)} />
          <button className="btn-ghost">Ekle</button>
        </form>
      </div>

      <TimeOffSection business={business} resources={resources.filter((r) => r.is_active)} />
    </div>
  );
}

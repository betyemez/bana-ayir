"use client";

import { useEffect, useMemo, useState } from "react";
import { slugify, type BusinessCategory } from "@randevu/shared";
import { createClient } from "@/lib/supabase/client";

export function CreateBusiness({ onCreated }: { onCreated: (id: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [form, setForm] = useState({ name: "", category_id: "", city: "", district: "", address: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("business_categories").select("*").order("sort_order").then(({ data }) => setCategories((data ?? []) as BusinessCategory[]));
  }, [supabase]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const category = categories.find((c) => String(c.id) === form.category_id);
    if (form.name.trim().length < 2 || !category) return setError("İşletme adı ve kategori zorunludur.");

    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const isReservation = category.booking_mode === "reservation";
    const { data: biz, error } = await supabase
      .from("businesses")
      .insert({
        owner_id: auth.user!.id,
        category_id: category.id,
        name: form.name.trim(),
        slug: `${slugify(form.name) || "isletme"}-${Math.random().toString(36).slice(2, 6)}`,
        city: form.city.trim() || null,
        district: form.district.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        booking_mode: category.booking_mode,
        default_duration_minutes: category.default_duration_minutes,
        slot_interval_minutes: isReservation ? 30 : 15,
        max_party_size: isReservation ? 12 : 1,
      })
      .select("id")
      .single();

    if (error || !biz) {
      setBusy(false);
      return setError("İşletme oluşturulamadı.");
    }

    // Hızlı başlangıç: varsayılan kaynak ve Pzt–Cmt 09:00–19:00 çalışma saatleri
    await Promise.all([
      supabase.from("resources").insert({
        business_id: biz.id,
        name: isReservation ? "Salon" : "Genel",
        capacity: isReservation ? 40 : 1,
      }),
      supabase.from("business_hours").insert(
        [1, 2, 3, 4, 5, 6].map((weekday) => ({ business_id: biz.id, weekday, opens_at: "09:00", closes_at: "19:00" })),
      ),
    ]);
    setBusy(false);
    onCreated(biz.id);
  }

  return (
    <form onSubmit={submit} className="card mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-xl font-semibold">İşletmenizi oluşturun</h1>
        <p className="text-sm text-muted">Bilgileri daha sonra Ayarlar sekmesinden değiştirebilirsiniz.</p>
      </div>
      <div>
        <label className="label">İşletme adı</label>
        <input className="input" value={form.name} onChange={set("name")} />
      </div>
      <div>
        <label className="label">Kategori</label>
        <select className="input" value={form.category_id} onChange={set("category_id")}>
          <option value="">Seçin…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Şehir</label>
          <input className="input" value={form.city} onChange={set("city")} />
        </div>
        <div>
          <label className="label">İlçe</label>
          <input className="input" value={form.district} onChange={set("district")} />
        </div>
      </div>
      <div>
        <label className="label">Adres</label>
        <input className="input" value={form.address} onChange={set("address")} />
      </div>
      <div>
        <label className="label">İşletme telefonu</label>
        <input className="input" type="tel" value={form.phone} onChange={set("phone")} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className="btn w-full" disabled={busy}>{busy ? "Oluşturuluyor…" : "Oluştur"}</button>
    </form>
  );
}

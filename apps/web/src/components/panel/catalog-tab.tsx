"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPrice, type CatalogItem, type ItemField } from "@randevu/shared";
import { createClient } from "@/lib/supabase/client";
import type { PanelBusiness } from "./business-panel";

interface Section {
  id: string;
  name: string;
  sort_order: number;
}

export function CatalogTab({ business }: { business: PanelBusiness }) {
  const supabase = useMemo(() => createClient(), []);
  const [sections, setSections] = useState<Section[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [newSection, setNewSection] = useState("");
  const [editing, setEditing] = useState<Partial<CatalogItem> | null>(null);
  const isService = business.booking_mode === "service";
  const fields = business.business_categories.item_fields ?? [];

  const load = useCallback(async () => {
    const [s, i] = await Promise.all([
      supabase.from("catalog_sections").select("id, name, sort_order").eq("business_id", business.id).order("sort_order"),
      supabase.from("catalog_items").select("*").eq("business_id", business.id).order("sort_order"),
    ]);
    setSections((s.data ?? []) as Section[]);
    setItems((i.data ?? []) as CatalogItem[]);
  }, [supabase, business.id]);

  // load() async: setState yalnızca await sonrasında çalışır, senkron kaskad oluşmaz.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function addSection(e: React.FormEvent) {
    e.preventDefault();
    if (!newSection.trim()) return;
    await supabase.from("catalog_sections").insert({ business_id: business.id, name: newSection.trim(), sort_order: sections.length });
    setNewSection("");
    load();
  }

  const groups = [
    ...sections.map((s) => ({ section: s as Section | null, items: items.filter((i) => i.section_id === s.id) })),
    { section: null, items: items.filter((i) => !i.section_id) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          className="btn"
          onClick={() =>
            setEditing({ is_bookable: isService, is_active: true, currency: "TRY", attributes: {}, price_is_from: false, section_id: sections[0]?.id ?? null })
          }
        >
          + Yeni kalem
        </button>
        <form onSubmit={addSection} className="flex gap-2">
          <input className="input" placeholder="Yeni bölüm adı (ör. Saç, Ana Yemekler)" value={newSection} onChange={(e) => setNewSection(e.target.value)} />
          <button className="btn-ghost">Bölüm ekle</button>
        </form>
      </div>

      {editing && (
        <ItemEditor
          item={editing}
          sections={sections}
          fields={fields}
          isService={isService}
          onCancel={() => setEditing(null)}
          onSave={async (item) => {
            const payload = {
              business_id: business.id,
              section_id: item.section_id || null,
              name: item.name,
              description: item.description || null,
              price: item.price ?? null,
              price_is_from: !!item.price_is_from,
              duration_minutes: item.duration_minutes || null,
              is_bookable: !!item.is_bookable,
              is_active: item.is_active ?? true,
              attributes: item.attributes ?? {},
            };
            const { error } = item.id
              ? await supabase.from("catalog_items").update(payload).eq("id", item.id)
              : await supabase.from("catalog_items").insert({ ...payload, sort_order: items.length });
            if (error) return "Kaydedilemedi.";
            setEditing(null);
            load();
            return null;
          }}
        />
      )}

      {groups.map(({ section, items: list }) =>
        section || list.length ? (
          <div key={section?.id ?? "none"} className="card">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium">{section?.name ?? "Bölümsüz"}</h3>
              {section && (
                <button
                  className="text-xs text-danger underline"
                  onClick={async () => {
                    if (!confirm(`"${section.name}" bölümü silinsin mi? İçindeki kalemler bölümsüz kalır.`)) return;
                    await supabase.from("catalog_sections").delete().eq("id", section.id);
                    load();
                  }}
                >
                  Bölümü sil
                </button>
              )}
            </div>
            {list.length === 0 && <p className="text-sm text-muted">Bu bölümde kalem yok.</p>}
            <ul className="divide-y divide-line">
              {list.map((i) => (
                <li key={i.id} className={`flex items-center gap-3 py-2 text-sm ${i.is_active ? "" : "opacity-50"}`}>
                  <div className="flex-1">
                    <p className="font-medium">{i.name}</p>
                    <p className="text-xs text-muted">
                      {[i.duration_minutes && `${i.duration_minutes} dk`, formatPrice(i.price, i.currency, i.price_is_from), !i.is_bookable && "randevuya kapalı"]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <button className="btn-ghost" onClick={() => setEditing(i)}>Düzenle</button>
                  <button
                    className="btn-ghost"
                    onClick={async () => {
                      await supabase.from("catalog_items").update({ is_active: !i.is_active }).eq("id", i.id);
                      load();
                    }}
                  >
                    {i.is_active ? "Gizle" : "Göster"}
                  </button>
                  <button
                    className="btn-ghost text-danger"
                    onClick={async () => {
                      if (!confirm(`"${i.name}" silinsin mi?`)) return;
                      await supabase.from("catalog_items").delete().eq("id", i.id);
                      load();
                    }}
                  >
                    Sil
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </div>
  );
}

function ItemEditor({
  item: initial,
  sections,
  fields,
  isService,
  onSave,
  onCancel,
}: {
  item: Partial<CatalogItem>;
  sections: Section[];
  fields: ItemField[];
  isService: boolean;
  onSave: (item: Partial<CatalogItem>) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [item, setItem] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CatalogItem>(k: K, v: CatalogItem[K] | null) => setItem((s) => ({ ...s, [k]: v }));
  const setAttr = (k: string, v: unknown) => setItem((s) => ({ ...s, attributes: { ...(s.attributes ?? {}), [k]: v } }));
  const num = (v: string) => (v === "" ? null : Number(v));

  return (
    <form
      className="card space-y-3 border-accent"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!item.name?.trim()) return setError("Ad zorunludur.");
        if (item.is_bookable && isService && !item.duration_minutes) return setError("Randevu alınabilen hizmetler için süre girin.");
        setBusy(true);
        setError(await onSave({ ...item, name: item.name.trim() }));
        setBusy(false);
      }}
    >
      <h3 className="font-medium">{item.id ? "Kalemi düzenle" : "Yeni kalem"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Ad</label>
          <input className="input" value={item.name ?? ""} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Açıklama</label>
          <textarea className="input" rows={2} value={item.description ?? ""} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div>
          <label className="label">Bölüm</label>
          <select className="input" value={item.section_id ?? ""} onChange={(e) => set("section_id", e.target.value || null)}>
            <option value="">Bölümsüz</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Fiyat (₺)</label>
          <input className="input" type="number" min={0} step="0.01" value={item.price ?? ""} onChange={(e) => set("price", num(e.target.value))} />
          <label className="mt-1 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={!!item.price_is_from} onChange={(e) => set("price_is_from", e.target.checked)} />
            “…’den başlayan” fiyat
          </label>
        </div>
        <div>
          <label className="label">Süre (dakika)</label>
          <input className="input" type="number" min={5} step={5} value={item.duration_minutes ?? ""} onChange={(e) => set("duration_minutes", num(e.target.value))} />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!item.is_bookable} onChange={(e) => set("is_bookable", e.target.checked)} />
            Randevu ile seçilebilir
          </label>
        </div>

        {fields.map((f) => {
          const v = item.attributes?.[f.key];
          return (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              {f.type === "boolean" && (
                <input type="checkbox" checked={!!v} onChange={(e) => setAttr(f.key, e.target.checked)} />
              )}
              {f.type === "text" && <input className="input" value={(v as string) ?? ""} onChange={(e) => setAttr(f.key, e.target.value)} />}
              {f.type === "number" && (
                <input className="input" type="number" value={(v as number) ?? ""} onChange={(e) => setAttr(f.key, num(e.target.value))} />
              )}
              {f.type === "tags" && (
                <input
                  className="input"
                  placeholder="Virgülle ayırın"
                  defaultValue={Array.isArray(v) ? v.join(", ") : ""}
                  onBlur={(e) => setAttr(f.key, e.target.value.split(",").map((x) => x.trim()).filter(Boolean))}
                />
              )}
              {f.type === "select" && (
                <select className="input" value={(v as string) ?? ""} onChange={(e) => setAttr(f.key, e.target.value || null)}>
                  <option value="">—</option>
                  {f.options?.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button className="btn" disabled={busy}>Kaydet</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Vazgeç</button>
      </div>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Business, BusinessCategory, MemberRole } from "@randevu/shared";
import { createClient } from "@/lib/supabase/client";
import { AppointmentsTab } from "./appointments-tab";
import { CatalogTab } from "./catalog-tab";
import { CreateBusiness } from "./create-business";
import { SettingsTab } from "./settings-tab";

export type PanelBusiness = Business & { business_categories: BusinessCategory; role: MemberRole };
type Tab = "appointments" | "catalog" | "settings";

export function BusinessPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [businesses, setBusinesses] = useState<PanelBusiness[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("appointments");

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data } = await supabase
      .from("business_members")
      .select("role, businesses(*, business_categories(*))")
      .eq("user_id", auth.user.id);
    const list = (data ?? [])
      .map((m) => {
        const b = Array.isArray(m.businesses) ? m.businesses[0] : m.businesses;
        return b ? ({ ...b, role: m.role } as PanelBusiness) : null;
      })
      .filter((b): b is PanelBusiness => !!b);
    setBusinesses(list);
    setActiveId((id) => id ?? list[0]?.id ?? null);
  }, [supabase]);

  // load() async: setState yalnızca await sonrasında çalışır, senkron kaskad oluşmaz.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (!businesses) return <p className="text-sm text-muted">Yükleniyor…</p>;
  if (businesses.length === 0) {
    return <CreateBusiness onCreated={(id) => { setActiveId(id); setTab("settings"); load(); }} />;
  }

  const business = businesses.find((b) => b.id === activeId) ?? businesses[0];
  const canManage = business.role !== "staff";
  const tabs: [Tab, string][] = [
    ["appointments", "Randevular"],
    ...(canManage ? ([["catalog", business.business_categories.list_label], ["settings", "Ayarlar"]] as [Tab, string][]) : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {businesses.length > 1 ? (
          <select className="input max-w-xs" value={business.id} onChange={(e) => setActiveId(e.target.value)}>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        ) : (
          <h1 className="text-3xl font-extrabold tracking-tight">{business.name}</h1>
        )}
        <span className={`badge ${business.is_published ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
          {business.is_published ? "Yayında" : "Taslak"}
        </span>
        {business.is_published && (
          <Link href={`/isletme/${business.slug}`} className="text-sm underline" target="_blank">Sayfayı gör</Link>
        )}
      </div>

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1 shadow-card">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === key ? "bg-ink text-ink-fg" : "text-muted hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "appointments" && <AppointmentsTab business={business} />}
      {tab === "catalog" && canManage && <CatalogTab business={business} />}
      {tab === "settings" && canManage && <SettingsTab business={business} onSaved={load} />}
    </div>
  );
}

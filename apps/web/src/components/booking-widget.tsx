"use client";

import { CalendarCheck, Check, Clock, Minus, Plus, ShieldCheck, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  formatDateKeyTR,
  formatPrice,
  formatTime,
  rpcErrorMessage,
  upcomingDateKeys,
  type AvailableSlot,
  type BookingMode,
  type CatalogItem,
} from "@randevu/shared";
import { createClient } from "@/lib/supabase/client";

interface Props {
  business: {
    id: string;
    slug: string;
    timezone: string;
    booking_mode: BookingMode;
    max_party_size: number;
    default_duration_minutes: number;
    max_advance_days: number;
    cancellation_window_hours: number;
    auto_confirm: boolean;
  };
  items: CatalogItem[];
  resources: { id: string; name: string; capacity: number }[];
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <p className="mb-2 flex items-center gap-2 text-sm font-bold">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] text-ink-fg">{n}</span>
      {title}
    </p>
  );
}

export function BookingWidget({ business, items, resources }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const isService = business.booking_mode === "service";

  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [partySize, setPartySize] = useState(isService ? 1 : Math.min(2, business.max_party_size));
  const [resourceId, setResourceId] = useState<string>("");
  const dates = useMemo(
    () => upcomingDateKeys(business.timezone, Math.min(14, business.max_advance_days)),
    [business.timezone, business.max_advance_days],
  );
  const [date, setDate] = useState(dates[0]);
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  const duration = useMemo(() => {
    const sum = items.filter((i) => selectedItems.includes(i.id)).reduce((s, i) => s + (i.duration_minutes ?? 0), 0);
    return sum > 0 ? sum : business.default_duration_minutes;
  }, [items, selectedItems, business.default_duration_minutes]);

  const total = items.filter((i) => selectedItems.includes(i.id)).reduce((s, i) => s + (i.price ?? 0), 0);
  const needsItems = isService && items.length > 0;
  const showResources = isService && resources.length > 1;
  const ready = !needsItems || selectedItems.length > 0;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    supabase
      .rpc("get_available_slots", {
        p_business: business.id,
        p_date: date,
        p_duration_minutes: duration,
        p_party_size: partySize,
        p_resource: resourceId || null,
        p_item_ids: selectedItems.length ? selectedItems : null,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        setSlot(null);
        setSlots(error ? [] : ((data ?? []) as AvailableSlot[]));
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, ready, business.id, date, duration, partySize, resourceId, selectedItems]);

  async function book() {
    if (!slot) return;
    setBusy(true);
    setError(null);
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      router.push(`/giris?next=/isletme/${business.slug}`);
      return;
    }
    const { data, error } = await supabase.rpc("create_appointment", {
      p_business: business.id,
      p_starts_at: slot,
      p_item_ids: selectedItems,
      p_party_size: partySize,
      p_resource: resourceId || null,
      p_note: note || null,
    });
    setBusy(false);
    if (error) {
      setError(rpcErrorMessage(error));
      setSlots((s) => s?.filter((x) => x.slot_start !== slot) ?? null);
      setSlot(null);
      return;
    }
    setDoneId(data as string);
  }

  const slotLabel = slot
    ? `${formatDateKeyTR(date).weekday} ${formatDateKeyTR(date).day} · ${formatTime(slot, business.timezone)}`
    : null;

  if (doneId) {
    return (
      <div className="card space-y-4 text-center shadow-pop">
        <span
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
            business.auto_confirm ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
          }`}
        >
          {business.auto_confirm ? <Check size={28} strokeWidth={3} /> : <Clock size={26} />}
        </span>
        <div className="space-y-1">
          <p className="text-lg font-extrabold">
            {business.auto_confirm ? "Bu vakit sana ayrıldı" : "Talebin işletmeye iletildi"}
          </p>
          <p className="text-sm font-semibold">{slotLabel}</p>
          <p className="text-sm text-muted">
            {business.auto_confirm
              ? "Detayları “Randevularım” sayfasında bulabilirsin."
              : "İşletme onayladığında bu vakit sana ayrılmış olacak. Durumu “Randevularım” sayfasından takip edebilirsin."}
          </p>
        </div>
        <button className="btn w-full" onClick={() => router.push("/randevularim")}>
          Randevularım
        </button>
      </div>
    );
  }

  // Adım numaraları: gösterilen bölümlere göre
  const stepOf: Record<string, number> = {};
  let n = 0;
  if (needsItems) stepOf.items = ++n;
  if (!isService) stepOf.party = ++n;
  if (showResources) stepOf.resource = ++n;
  stepOf.day = ++n;
  stepOf.time = ++n;

  return (
    <div className="card space-y-5 shadow-pop">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">Vakit seç</h2>
        <p className="text-sm text-muted">Seç, “bana ayır” de; gerisini işletme halletsin.</p>
      </div>

      {needsItems && (
        <div>
          <StepTitle n={stepOf.items} title="Hizmet" />
          <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {items.map((i) => {
              const on = selectedItems.includes(i.id);
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedItems((s) => (on ? s.filter((x) => x !== i.id) : [...s, i.id]))}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      on ? "border-brand bg-brand-soft" : "border-line hover:border-foreground/20"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        on ? "border-brand bg-brand text-brand-fg" : "border-line"
                      }`}
                    >
                      {on && <Check size={12} strokeWidth={3.5} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{i.name}</span>
                      {i.duration_minutes ? <span className="text-xs text-muted">{i.duration_minutes} dk</span> : null}
                    </span>
                    <span className="shrink-0 font-semibold">{formatPrice(i.price, i.currency, i.price_is_from)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!isService && (
        <div>
          <StepTitle n={stepOf.party} title="Kişi sayısı" />
          <div className="flex items-center justify-between rounded-xl border border-line px-2 py-1.5">
            <button
              type="button"
              aria-label="Azalt"
              className="rounded-lg p-2 hover:bg-surface-2 disabled:opacity-30"
              disabled={partySize <= 1}
              onClick={() => setPartySize((v) => v - 1)}
            >
              <Minus size={16} />
            </button>
            <span className="flex items-center gap-2 font-bold">
              <Users size={16} className="text-muted" /> {partySize} kişi
            </span>
            <button
              type="button"
              aria-label="Artır"
              className="rounded-lg p-2 hover:bg-surface-2 disabled:opacity-30"
              disabled={partySize >= business.max_party_size}
              onClick={() => setPartySize((v) => v + 1)}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}

      {showResources && (
        <div>
          <StepTitle n={stepOf.resource} title="Kiminle?" />
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setResourceId("")} className={`chip ${resourceId === "" ? "chip-active" : ""}`}>
              Fark etmez
            </button>
            {resources.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => setResourceId(r.id)}
                className={`chip ${resourceId === r.id ? "chip-active" : ""}`}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <StepTitle n={stepOf.day} title="Gün" />
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {dates.map((d) => {
            const f = formatDateKeyTR(d);
            const on = d === date;
            return (
              <button
                type="button"
                key={d}
                onClick={() => setDate(d)}
                className={`min-w-[3.75rem] shrink-0 rounded-xl border px-2 py-2 text-center transition ${
                  on ? "border-ink bg-ink text-ink-fg" : "border-line hover:border-foreground/20"
                }`}
              >
                <span className={`block text-[11px] font-medium uppercase ${on ? "opacity-75" : "text-muted"}`}>{f.weekday}</span>
                <span className="block text-sm font-bold">{f.day}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <StepTitle n={stepOf.time} title="Saat" />
        {!ready && (
          <p className="rounded-xl bg-surface-2 px-3 py-3 text-sm text-muted">Önce bir hizmet seç, uygun saatleri gösterelim.</p>
        )}
        {ready && slots === null && (
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="h-9 animate-pulse rounded-xl bg-surface-2" />
            ))}
          </div>
        )}
        {ready && slots?.length === 0 && (
          <p className="rounded-xl bg-surface-2 px-3 py-3 text-sm text-muted">Bu gün boş vakit kalmamış. Başka bir gün seç.</p>
        )}
        {ready && !!slots?.length && (
          <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
            {slots.map((s) => (
              <button
                type="button"
                key={s.slot_start}
                onClick={() => setSlot(s.slot_start)}
                className={`rounded-xl border py-2 text-sm font-semibold transition ${
                  slot === s.slot_start ? "border-brand bg-brand text-brand-fg" : "border-line hover:border-brand hover:text-brand"
                }`}
              >
                {formatTime(s.slot_start, business.timezone)}
              </button>
            ))}
          </div>
        )}
      </div>

      {slot && (
        <div className="space-y-3 border-t border-line pt-4">
          <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 font-bold">
              <CalendarCheck size={16} className="text-brand" /> {slotLabel}
            </p>
            <p className="mt-1 text-muted">
              {duration} dk{!isService && ` · ${partySize} kişi`}
              {total > 0 && ` · ${formatPrice(total)}`}
            </p>
          </div>
          <textarea
            className="input"
            rows={2}
            maxLength={500}
            placeholder="İşletmeye not (isteğe bağlı)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <button className="btn w-full py-3 text-base" disabled={busy} onClick={book}>
            {busy ? "Gönderiliyor…" : "Bu vakti bana ayır"}
          </button>
          <p className="flex gap-2 text-xs text-muted">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            Randevudan {business.cancellation_window_hours} saat öncesine kadar ücretsiz iptal edebilirsin. Daha geç iptaller
            ve gelinmeyen randevular güvenilirlik özetine yansır.
          </p>
        </div>
      )}
    </div>
  );
}

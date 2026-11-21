import { CalendarCheck, Clock, MapPin, MessageSquare, Phone, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatPrice, type CatalogItem, type ItemField } from "@randevu/shared";
import { BookingWidget } from "@/components/booking-widget";
import { categoryStyle, gradient } from "@/lib/category-style";
import { createClient } from "@/lib/supabase/server";

const DAYS = ["", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

export default function BusinessPage({ params }: PageProps<"/isletme/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BusinessContent params={params} />
    </Suspense>
  );
}

async function BusinessContent({ params }: { params: PageProps<"/isletme/[slug]">["params"] }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: b } = await supabase
    .from("businesses")
    .select("*, business_categories(slug, name, list_label, item_fields), business_stats(rating_avg, rating_count)")
    .eq("slug", slug)
    .maybeSingle();
  if (!b) notFound();

  const [{ data: sections }, { data: items }, { data: resources }, { data: hours }, { data: reviews }] = await Promise.all([
    supabase.from("catalog_sections").select("id, name, description").eq("business_id", b.id).order("sort_order"),
    supabase.from("catalog_items").select("*").eq("business_id", b.id).eq("is_active", true).order("sort_order"),
    supabase.from("resources").select("id, name, capacity").eq("business_id", b.id).eq("is_active", true).order("sort_order"),
    supabase.from("business_hours").select("weekday, opens_at, closes_at").eq("business_id", b.id).order("weekday").order("opens_at"),
    supabase
      .from("business_reviews")
      .select("id, reviewer_display, rating, comment, business_reply, created_at")
      .eq("business_id", b.id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const category = one(b.business_categories);
  const stats = one(b.business_stats);
  const { icon: Icon } = categoryStyle(category?.slug);
  const allItems = (items ?? []) as CatalogItem[];
  const groups = [
    ...(sections ?? []).map((s) => ({ ...s, items: allItems.filter((i) => i.section_id === s.id) })),
    { id: "other", name: sections?.length ? "Diğer" : "", description: null, items: allItems.filter((i) => !i.section_id) },
  ].filter((g) => g.items.length > 0);

  const status = openStatus(hours ?? [], b.timezone);
  const location = [b.address, b.district, b.city].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      {/* Kapak */}
      <div className="relative -mx-4 -mt-8 h-48 overflow-hidden sm:mx-0 sm:mt-0 sm:h-64 sm:rounded-3xl" style={{ background: gradient(category?.slug, 120) }}>
        {b.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.cover_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <>
            <Icon className="absolute -right-6 -top-6 text-white/10" size={280} strokeWidth={1} />
            <Icon className="absolute bottom-6 left-1/3 text-white/10" size={90} strokeWidth={1.25} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {/* Başlık kartı */}
          <section className="card relative -mt-20 space-y-4 sm:mx-4">
            <div className="flex items-start gap-4">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-white shadow-card ring-4 ring-surface"
                style={{ background: gradient(category?.slug) }}
              >
                {b.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon size={28} />
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <Link href={`/?kategori=${category?.slug}`} className="text-xs font-semibold uppercase tracking-wide text-brand hover:underline">
                  {category?.name}
                </Link>
                <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{b.name}</h1>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              {stats?.rating_count ? (
                <span className="badge bg-amber-100 py-1 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                  <Star size={13} className="fill-current" /> {Number(stats.rating_avg).toFixed(1)} · {stats.rating_count} değerlendirme
                </span>
              ) : (
                <span className="badge bg-surface-2 py-1 text-muted">Yeni işletme</span>
              )}
              {status && (
                <span className={`badge py-1 ${status.open ? "bg-success-soft text-success" : "bg-surface-2 text-muted"}`}>
                  <Clock size={13} /> {status.label}
                </span>
              )}
            </div>

            <div className="grid gap-2 text-sm text-muted sm:grid-cols-2">
              {location && (
                <p className="flex items-start gap-2">
                  <MapPin size={16} className="mt-0.5 shrink-0" /> {location}
                </p>
              )}
              {b.phone && (
                <a href={`tel:${b.phone}`} className="flex items-center gap-2 hover:text-foreground">
                  <Phone size={16} className="shrink-0" /> {b.phone}
                </a>
              )}
            </div>

            {b.description && <p className="whitespace-pre-line border-t border-line pt-4 leading-relaxed">{b.description}</p>}
          </section>

          {/* Katalog */}
          <section className="space-y-3">
            <h2 className="section-title">{category?.list_label ?? "Liste"}</h2>
            {groups.length === 0 && <p className="card text-sm text-muted">Henüz liste eklenmemiş.</p>}
            {groups.map((g) => (
              <div key={g.id} className="card p-0">
                {g.name && <h3 className="border-b border-line px-5 py-3 font-bold">{g.name}</h3>}
                <ul className="divide-y divide-line">
                  {g.items.map((i) => (
                    <li key={i.id} className="flex gap-4 px-5 py-4">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-semibold">{i.name}</p>
                        {i.description && <p className="text-sm text-muted">{i.description}</p>}
                        <ItemAttributes item={i} fields={(category?.item_fields ?? []) as ItemField[]} />
                      </div>
                      <div className="shrink-0 space-y-1 text-right">
                        <p className="font-bold">{i.price === 0 ? "Ücretsiz" : formatPrice(i.price, i.currency, i.price_is_from)}</p>
                        {i.duration_minutes ? (
                          <p className="flex items-center justify-end gap-1 text-xs text-muted">
                            <Clock size={12} /> {formatDuration(i.duration_minutes)}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {/* Yorumlar */}
          <section className="space-y-3">
            <h2 className="section-title">Değerlendirmeler</h2>
            {!reviews?.length && (
              <div className="card flex items-center gap-3 text-sm text-muted">
                <MessageSquare size={18} className="shrink-0" /> Henüz değerlendirme yok. Randevusunu tamamlayan müşteriler burada yorum yapabilir.
              </div>
            )}
            {reviews?.map((r) => (
              <div key={r.id} className="card space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-sm font-bold">
                      {r.reviewer_display.charAt(0)}
                    </span>
                    <span className="font-semibold">{r.reviewer_display}</span>
                  </div>
                  <span className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} size={14} className={n <= r.rating ? "fill-amber-400 text-amber-400" : "text-line"} />
                    ))}
                  </span>
                </div>
                {r.comment && <p className="text-sm leading-relaxed">{r.comment}</p>}
                {r.business_reply && (
                  <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
                    <span className="font-semibold">İşletmenin yanıtı: </span>
                    {r.business_reply}
                  </p>
                )}
              </div>
            ))}
          </section>
        </div>

        <aside id="vakit-sec" className="min-w-0 scroll-mt-20 space-y-4 lg:sticky lg:top-24 lg:self-start">
          <BookingWidget
            business={{
              id: b.id,
              slug: b.slug,
              timezone: b.timezone,
              booking_mode: b.booking_mode,
              max_party_size: b.max_party_size,
              default_duration_minutes: b.default_duration_minutes,
              max_advance_days: b.max_advance_days,
              cancellation_window_hours: b.cancellation_window_hours,
              auto_confirm: b.auto_confirm,
            }}
            items={allItems.filter((i) => i.is_bookable)}
            resources={resources ?? []}
          />
          <div className="card text-sm">
            <h3 className="mb-3 flex items-center gap-2 font-bold">
              <Clock size={16} /> Çalışma saatleri
            </h3>
            <ul className="space-y-1">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const h = (hours ?? []).filter((x) => x.weekday === d);
                const today = status?.weekday === d;
                return (
                  <li key={d} className={`flex justify-between rounded-lg px-2 py-1 ${today ? "bg-surface-2 font-semibold" : ""}`}>
                    <span>{DAYS[d]}</span>
                    <span className={h.length ? "" : "text-muted"}>
                      {h.length ? h.map((x) => `${x.opens_at.slice(0, 5)} – ${x.closes_at.slice(0, 5)}`).join(", ") : "Kapalı"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>

      {/* Telefonda randevu kutusu en altta kalır; sabit çubuk oraya götürür */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-lg lg:hidden">
        <a href="#vakit-sec" className="btn w-full py-3 text-base">
          <CalendarCheck size={18} /> Vakit seç
        </a>
      </div>
      <div className="h-16 lg:hidden" />
    </div>
  );
}

function ItemAttributes({ item, fields }: { item: CatalogItem; fields: ItemField[] }) {
  const parts = fields
    .map((f) => {
      const v = item.attributes?.[f.key];
      if (v == null || v === "" || v === false) return null;
      if (v === true) return f.label;
      if (Array.isArray(v)) return v.length ? `${f.label}: ${v.join(", ")}` : null;
      return `${f.label}: ${String(v)}`;
    })
    .filter((x): x is string => !!x);
  if (!parts.length) return null;
  return (
    <div className="flex flex-wrap gap-1 pt-1">
      {parts.map((p) => (
        <span key={p} className="badge bg-surface-2 font-medium text-muted">{p}</span>
      ))}
    </div>
  );
}

function formatDuration(min: number) {
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} sa ${m} dk` : `${h} saat`;
}

/** İşletmenin saat dilimine göre şu an açık mı? */
function openStatus(hours: { weekday: number; opens_at: string; closes_at: string }[], timeZone: string) {
  if (!hours.length) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.find((p) => p.type === "weekday")!.value) + 1;
  const now = `${parts.find((p) => p.type === "hour")!.value}:${parts.find((p) => p.type === "minute")!.value}`;
  const today = hours.filter((h) => h.weekday === wd);
  const current = today.find((h) => now >= h.opens_at.slice(0, 5) && now < h.closes_at.slice(0, 5));
  if (current) return { open: true, weekday: wd, label: `Şu an açık · Kapanış ${current.closes_at.slice(0, 5)}` };
  const next = today.find((h) => now < h.opens_at.slice(0, 5));
  return { open: false, weekday: wd, label: next ? `Kapalı · Açılış ${next.opens_at.slice(0, 5)}` : "Şu an kapalı" };
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-64 animate-pulse rounded-3xl bg-surface-2" />
      <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  );
}

function one<T>(x: T | T[] | null | undefined): T | undefined {
  return Array.isArray(x) ? x[0] : (x ?? undefined);
}

import { ArrowRight, BadgeCheck, CalendarCheck, Check, MapPin, Search, Star } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BusinessCard } from "@/components/business-card";
import { categoryStyle } from "@/lib/category-style";
import { createClient } from "@/lib/supabase/server";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <div className="space-y-16">
      <Hero />
      <Suspense fallback={<GridSkeleton />}>
        <Explore searchParams={searchParams} />
      </Suspense>
      <HowItWorks />
      <BusinessCta />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative -mt-8 pb-4 pt-12 sm:pt-16">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-10 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl" />

      <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <span className="badge bg-brand-soft text-brand">
            <BadgeCheck size={14} /> Vaktine değer veren işletmeler
          </span>
          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
            Hangi vakti <span className="text-brand">sana ayıralım?</span>
          </h1>
          <p className="max-w-xl text-lg text-muted">
            Kuaförden restorana, klinikten halı sahaya. Vaktini seç, <strong className="text-foreground">“bana ayır”</strong> de;
            işletme o vakti sana ayırsın.
          </p>

          <form action="/" className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-2 shadow-pop sm:flex-row">
            <label className="flex flex-1 items-center gap-2 px-3">
              <Search size={18} className="shrink-0 text-muted" />
              <input name="q" placeholder="Kuaför, diş hekimi, işletme adı…" className="w-full bg-transparent py-2.5 text-sm outline-none" />
            </label>
            <label className="flex items-center gap-2 border-line px-3 sm:w-44 sm:border-l">
              <MapPin size={18} className="shrink-0 text-muted" />
              <input name="sehir" placeholder="Şehir" defaultValue="" className="w-full bg-transparent py-2.5 text-sm outline-none" />
            </label>
            <button className="btn">Ara</button>
          </form>
        </div>

        <HeroIllustration />
      </div>
    </section>
  );
}

/** Markayı anlatan küçük sahne: müşteri "bana ayır" der, işletme "sana ayırdık" yanıtlar. */
function HeroIllustration() {
  const { icon: Icon, from, to } = categoryStyle("kuafor");
  return (
    <div className="relative mx-auto hidden w-full max-w-sm lg:block" aria-hidden="true">
      <div className="rotate-[-3deg] rounded-3xl border border-line bg-surface p-5 shadow-pop">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
            <Icon size={22} />
          </div>
          <div>
            <p className="font-bold">Saç Atölyesi</p>
            <p className="flex items-center gap-1 text-xs text-muted">
              <Star size={12} className="fill-amber-400 text-amber-400" /> 4.9 · Nilüfer, Bursa
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-1.5 text-center text-xs">
          {["10:00", "10:30", "11:15", "13:00", "14:30", "15:00", "16:45", "17:30"].map((t) => (
            <span
              key={t}
              className={`rounded-lg border py-1.5 font-semibold ${t === "14:30" ? "border-brand bg-brand text-brand-fg" : "border-line text-muted"}`}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-ink px-4 py-3 text-center text-sm font-semibold text-ink-fg">Bu vakti bana ayır</div>
      </div>
      <div className="absolute -bottom-16 -right-6 rotate-[2deg] rounded-2xl border border-line bg-surface px-4 py-3 shadow-pop">
        <p className="flex items-center gap-2 text-sm font-bold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success text-white">
            <Check size={14} strokeWidth={3} />
          </span>
          Bu vakit sana ayrıldı
        </p>
        <p className="mt-0.5 pl-8 text-xs text-muted">Yarın 14:30 · Kadın saç kesimi</p>
      </div>
    </div>
  );
}

async function Explore({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const sp = await searchParams;
  const kategori = typeof sp.kategori === "string" ? sp.kategori : undefined;
  const sehir = typeof sp.sehir === "string" ? sp.sehir.trim() : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim() : undefined;

  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("business_categories")
    .select("id, slug, name")
    .order("sort_order");

  // Arama metni bir kategori adına uyuyorsa o kategoriyi de getir ("kuaför" -> Kuaför kategorisi)
  const matchedCats = q
    ? (categories ?? []).filter((c) => c.name.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr"))).map((c) => c.id)
    : [];

  let query = supabase
    .from("businesses")
    .select("id, name, slug, city, district, cover_url, category_id, business_categories!inner(slug, name), business_stats(rating_avg, rating_count)")
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(60);
  if (kategori) query = query.eq("business_categories.slug", kategori);
  if (sehir) query = query.ilike("city", sehir);
  if (q) {
    const safe = q.replace(/[%_,()"\\]/g, "");
    query = matchedCats.length
      ? query.or(`name.ilike."%${safe}%",category_id.in.(${matchedCats.join(",")})`)
      : query.ilike("name", `%${safe}%`);
  }
  const { data: businesses, error } = await query;

  const filtered = !!(kategori || sehir || q);
  const activeCat = categories?.find((c) => c.slug === kategori);
  const title = filtered
    ? [activeCat?.name, sehir && `${sehir} bölgesinde`, q && `“${q}” için`].filter(Boolean).join(" · ") || "Sonuçlar"
    : "Yeni katılan işletmeler";

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <h2 className="section-title">Kategoriler</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {categories?.map((c) => {
            const { icon: Icon, from, to } = categoryStyle(c.slug);
            const active = kategori === c.slug;
            return (
              <Link
                key={c.id}
                href={active ? "/" : `/?kategori=${c.slug}`}
                className={`group flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition hover:-translate-y-0.5 hover:shadow-card ${
                  active ? "border-ink bg-surface shadow-card" : "border-transparent hover:border-line hover:bg-surface"
                }`}
              >
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-card transition group-hover:scale-105"
                  style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
                >
                  <Icon size={22} />
                </span>
                <span className="text-xs font-semibold leading-tight">{c.name}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="section-title">{title}</h2>
            {businesses && <p className="text-sm text-muted">{businesses.length} işletme</p>}
          </div>
          {filtered && (
            <Link href="/" className="btn-ghost">Filtreleri temizle</Link>
          )}
        </div>

        {error && <p className="card text-sm text-danger">İşletmeler yüklenemedi, lütfen sayfayı yenileyin.</p>}
        {businesses?.length === 0 && (
          <div className="card flex flex-col items-center gap-2 py-12 text-center">
            <Search className="text-muted" />
            <p className="font-semibold">Bu aramaya uygun işletme bulunamadı</p>
            <p className="text-sm text-muted">Farklı bir kategori veya şehir deneyin.</p>
          </div>
        )}

        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {businesses?.map((b) => {
            const cat = one(b.business_categories);
            const stats = one(b.business_stats);
            return (
              <li key={b.id}>
                <BusinessCard
                  b={{
                    ...b,
                    categoryName: cat?.name,
                    categorySlug: cat?.slug,
                    ratingAvg: stats?.rating_avg,
                    ratingCount: stats?.rating_count,
                  }}
                />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { icon: Search, title: "Vaktini seç", text: "İşletmeyi bul, hizmetini ve sana uyan saati seç." },
    { icon: CalendarCheck, title: "“Bana ayır” de", text: "Tek dokunuşla iste; işletme o vakti sana ayırsın." },
    { icon: Star, title: "Değerlendir", text: "Randevudan sonra işletmeyi puanla. Güven iki yönlü." },
  ];
  return (
    <section className="space-y-6">
      <h2 className="section-title text-center">Nasıl çalışır?</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="card relative space-y-2">
            <span className="absolute right-5 top-4 text-4xl font-extrabold text-line">{i + 1}</span>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <s.icon size={20} />
            </span>
            <p className="font-bold">{s.title}</p>
            <p className="text-sm text-muted">{s.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function BusinessCta() {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-ink px-6 py-10 text-ink-fg sm:px-10">
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand/40 blur-3xl" />
      <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div className="max-w-xl space-y-2">
          <h2 className="text-2xl font-extrabold tracking-tight">İşletmen mi var? Müşterilerine vakit ayır.</h2>
          <p className="opacity-75">
            Hizmet listeni ya da menünü ekle, çalışma saatlerini gir; randevular doğrudan paneline düşsün. Gelmeyen
            müşteriler ve son dakika iptalleri artık sürpriz değil.
          </p>
        </div>
        <Link href="/panel" className="btn shrink-0">
          İşletmeni ücretsiz ekle <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}

function GridSkeleton() {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="h-60 animate-pulse rounded-2xl border border-line bg-surface" />
      ))}
    </ul>
  );
}

function one<T>(x: T | T[] | null | undefined): T | undefined {
  return Array.isArray(x) ? x[0] : (x ?? undefined);
}

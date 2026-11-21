import { MapPin, Star } from "lucide-react";
import Link from "next/link";
import { categoryStyle, gradient } from "@/lib/category-style";

export interface BusinessCardData {
  name: string;
  slug: string;
  city: string | null;
  district: string | null;
  cover_url: string | null;
  categoryName?: string;
  categorySlug?: string;
  ratingAvg?: number | null;
  ratingCount?: number;
}

export function BusinessCard({ b }: { b: BusinessCardData }) {
  const { icon: Icon } = categoryStyle(b.categorySlug);
  return (
    <Link
      href={`/isletme/${b.slug}`}
      className="group block overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-pop"
    >
      <div className="relative h-36 overflow-hidden" style={{ background: gradient(b.categorySlug) }}>
        {b.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.cover_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <>
            <Icon className="absolute -right-4 -bottom-6 text-white/15 transition duration-500 group-hover:scale-110" size={150} strokeWidth={1.25} />
            <div className="absolute left-4 top-4 flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-sm">
              <Icon size={22} />
            </div>
          </>
        )}
        <div className="absolute right-3 top-3">
          {b.ratingCount ? (
            <span className="badge bg-white/95 text-[#1d1a26] shadow-card">
              <Star size={12} className="fill-amber-400 text-amber-400" />
              {Number(b.ratingAvg).toFixed(1)} <span className="font-normal text-[#6d6878]">({b.ratingCount})</span>
            </span>
          ) : (
            <span className="badge bg-white/95 text-[#1d1a26] shadow-card">Yeni</span>
          )}
        </div>
      </div>
      <div className="space-y-1 p-4">
        {b.categoryName && <p className="text-xs font-semibold uppercase tracking-wide text-brand">{b.categoryName}</p>}
        <p className="text-base font-bold leading-snug">{b.name}</p>
        <p className="flex items-center gap-1 text-sm text-muted">
          <MapPin size={14} className="shrink-0" />
          {[b.district, b.city].filter(Boolean).join(", ") || "Konum belirtilmemiş"}
        </p>
      </div>
    </Link>
  );
}

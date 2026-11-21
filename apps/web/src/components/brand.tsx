import Link from "next/link";

/** Logo işareti: köşesi kıvrık takvim yaprağı + onay işareti ("bu vakit ayrıldı") */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="4" width="28" height="26" rx="8" fill="var(--brand)" />
      <rect x="9" y="1.5" width="3" height="6" rx="1.5" fill="var(--ink)" />
      <rect x="20" y="1.5" width="3" height="6" rx="1.5" fill="var(--ink)" />
      <path d="M10 18.5l4 4 8-8.5" fill="none" stroke="var(--brand-fg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="Bana Ayır ana sayfa">
      <LogoMark />
      <span className="text-lg font-extrabold tracking-tight">
        Bana <span className="text-brand">Ayır</span>
      </span>
    </Link>
  );
}

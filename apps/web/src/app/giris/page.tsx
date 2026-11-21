import { CalendarCheck, ShieldCheck, Smartphone } from "lucide-react";
import { Suspense } from "react";
import { LogoMark } from "@/components/brand";
import { PhoneLogin } from "@/components/phone-login";

export const metadata = { title: "Giriş" };

export default function LoginPage() {
  const perks = [
    { icon: Smartphone, text: "Şifre yok: telefonuna gelen kodla giriş" },
    { icon: CalendarCheck, text: "Tüm randevuların tek yerde" },
    { icon: ShieldCheck, text: "Bilgilerin yalnızca randevu aldığın işletmeyle paylaşılır" },
  ];
  return (
    <div className="mx-auto grid max-w-4xl overflow-hidden rounded-3xl border border-line bg-surface shadow-pop md:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink p-10 text-ink-fg md:block">
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-brand/50 blur-3xl" />
        <div className="relative space-y-8">
          <LogoMark size={44} />
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight">
              Vaktini seç,
              <br />
              sana ayrılsın.
            </h1>
            <p className="opacity-70">Bana Ayır hesabınla saniyeler içinde randevu al.</p>
          </div>
          <ul className="space-y-3 text-sm">
            {perks.map((p) => (
              <li key={p.text} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <p.icon size={16} />
                </span>
                <span className="opacity-90">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="p-6 sm:p-10">
        <Suspense>
          <PhoneLogin />
        </Suspense>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { HeaderAuth } from "@/components/header-auth";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: { default: "Bana Ayır · Randevunu al, vaktin sana ayrılsın", template: "%s · Bana Ayır" },
  description: "Kuaförden restorana, randevuyla çalışan işletmeleri keşfet; istediğin vakti sana ayırsınlar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-40 border-b border-line/70 bg-background/80 backdrop-blur-lg">
          <nav className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
            <Logo />
            <div className="ml-auto flex items-center gap-2 text-sm">
              <HeaderAuth />
            </div>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

        <footer className="mt-16 border-t border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
            <div className="space-y-3">
              <Logo />
              <p className="text-muted">Randevuyla çalışan işletmeler ve vaktine değer veren müşteriler için.</p>
            </div>
            <div className="space-y-2">
              <p className="font-semibold">Müşteriler</p>
              <Link href="/" className="block text-muted hover:text-foreground">İşletmeleri keşfet</Link>
              <Link href="/randevularim" className="block text-muted hover:text-foreground">Randevularım</Link>
            </div>
            <div className="space-y-2">
              <p className="font-semibold">İşletmeler & Yasal</p>
              <Link href="/panel" className="block text-muted hover:text-foreground">İşletmeni ekle</Link>
              <Link href="/kvkk" className="block text-muted hover:text-foreground">KVKK Aydınlatma Metni</Link>
              <Link href="/uyelik-sozlesmesi" className="block text-muted hover:text-foreground">Üyelik Sözleşmesi</Link>
            </div>
          </div>
          <p className="border-t border-line py-4 text-center text-xs text-muted">© 2026 Bana Ayır</p>
        </footer>
      </body>
    </html>
  );
}

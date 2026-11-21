"use client";

import { CalendarDays, LayoutDashboard, LogOut, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function HeaderAuth() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (signedIn === null) return <div className="h-9 w-28" />;

  if (!signedIn) {
    return (
      <>
        <Link href="/panel" className="btn-ghost border-brand/40 font-semibold text-brand hover:border-brand hover:bg-brand-soft">
          <Store size={16} />
          <span className="hidden sm:inline">İşletmeni ekle</span>
          <span className="sm:hidden">İşletme</span>
        </Link>
        <Link href="/giris" className="btn-ink">Giriş yap</Link>
      </>
    );
  }

  return (
    <>
      <Link href="/randevularim" className="flex items-center gap-1.5 rounded-xl px-3 py-2 font-medium hover:bg-surface-2">
        <CalendarDays size={16} /> <span className="hidden sm:inline">Randevularım</span>
      </Link>
      <Link href="/panel" className="flex items-center gap-1.5 rounded-xl px-3 py-2 font-medium hover:bg-surface-2">
        <LayoutDashboard size={16} /> <span className="hidden sm:inline">İşletme paneli</span>
      </Link>
      <button
        title="Çıkış yap"
        className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-foreground"
        onClick={async () => {
          await createClient().auth.signOut();
          router.push("/");
          router.refresh();
        }}
      >
        <LogOut size={16} />
      </button>
    </>
  );
}

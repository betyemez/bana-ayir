import { Suspense } from "react";
import { BusinessPanel } from "@/components/panel/business-panel";

export const metadata = { title: "İşletme paneli" };

// Panel o anki saate göre hesap yapıyor; Suspense ile her ziyarette yeniden hesaplanır.
export default function PanelPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Yükleniyor…</p>}>
      <BusinessPanel />
    </Suspense>
  );
}

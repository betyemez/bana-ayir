import { Suspense } from "react";
import { MyAppointments } from "@/components/my-appointments";

export const metadata = { title: "Randevularım" };

// Bileşen o anki saate göre hesap yapıyor; Suspense ile her ziyarette yeniden hesaplanır.
export default function MyAppointmentsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Yükleniyor…</p>}>
      <MyAppointments />
    </Suspense>
  );
}

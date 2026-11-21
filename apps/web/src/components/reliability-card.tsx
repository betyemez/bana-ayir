import type { CustomerReliability } from "@randevu/shared";

export function ReliabilityCard({ data }: { data: CustomerReliability }) {
  const stats: [string, number][] = [
    ["Toplam kayıt", data.total_appointments],
    ["Geldi", data.attended],
    ["Geç geldi", data.late_arrivals],
    ["Gelmedi", data.no_shows],
    ["Geç iptal", data.late_cancellations],
    ["Ödeme sorunu", data.payment_issues],
  ];
  return (
    <div className="card space-y-3">
      <p className="text-sm">
        {data.enough_data ? (
          <>
            Güvenilirlik: <span className="text-2xl font-extrabold text-brand">%{data.reliability_pct}</span>
          </>
        ) : (
          <span className="text-muted">Yeterli veri yok (en az 3 kayıt gerekir). Yeni müşteri olarak gösterilir.</span>
        )}
      </p>
      <dl className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-surface-2 p-2.5">
            <dd className="text-base font-semibold">{value}</dd>
            <dt className="text-muted">{label}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}

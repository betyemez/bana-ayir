import { APPOINTMENT_STATUS_LABEL, type AppointmentStatus } from "@randevu/shared";

const TONE: Record<AppointmentStatus, string> = {
  pending: "bg-warning-soft text-warning",
  confirmed: "bg-success-soft text-success",
  completed: "bg-info-soft text-info",
  no_show: "bg-danger-soft text-danger",
  cancelled_by_customer: "bg-surface-2 text-muted",
  cancelled_by_business: "bg-surface-2 text-muted",
};

export function StatusBadge({ status, late }: { status: AppointmentStatus; late?: boolean }) {
  return (
    <span className={`badge shrink-0 ${TONE[status]}`}>
      {APPOINTMENT_STATUS_LABEL[status]}
      {late && " · geç iptal"}
    </span>
  );
}

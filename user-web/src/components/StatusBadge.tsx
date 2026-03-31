const statusLabels: Record<string, string> = {
  pending: "접수완료",
  processing: "분석중",
  completed: "완료",
  cancelled: "취소",
  requested: "예약신청",
  confirmed: "예약확정",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status}`}>
      {statusLabels[status] || status}
    </span>
  );
}

const statusLabels: Record<string, string> = {
  applied: "신청완료",
  uploaded: "업로드완료",
  pending: "대기",
  processing: "분석중",
  completed: "완료",
  cancelled: "취소",
  requested: "신청",
  confirmed: "확정",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status}`}>
      {statusLabels[status] || status}
    </span>
  );
}

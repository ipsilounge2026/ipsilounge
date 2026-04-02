const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** 다운로드 URL이 상대경로이면 API 서버 주소를 앞에 붙여줌 */
export function toFullUrl(url: string): string {
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return url;
}

async function request(path: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("user_token") : null;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("user_token");
      window.location.href = "/login";
    }
    throw new Error("인증이 만료되었습니다");
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "요청에 실패했습니다" }));
    throw new Error(error.detail || "요청에 실패했습니다");
  }

  return res.json();
}

// --- 인증 ---
export async function register(
  email: string,
  password: string,
  name: string,
  phone?: string,
  member_type?: string,
  student_name?: string,
  student_birth?: string,
) {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name, phone, member_type, student_name, student_birth }),
  });
}

export async function login(email: string, password: string) {
  const data = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("user_token", data.access_token);
  return data;
}

// --- 사용자 ---
export async function getMe() {
  return request("/api/users/me");
}

export async function updateMe(data: { name?: string; phone?: string; student_name?: string; student_birth?: string }) {
  return request("/api/users/me", { method: "PUT", body: JSON.stringify(data) });
}

export async function getNotifications() {
  return request("/api/users/notifications");
}

// --- 분석 ---
export async function applyAnalysis(data: {
  service_type: string;
  target_university?: string;
  target_major?: string;
  memo?: string;
}) {
  return request("/api/analysis/apply", { method: "POST", body: JSON.stringify(data) });
}

export async function uploadSchoolRecordToOrder(orderId: string, formData: FormData) {
  return request(`/api/analysis/${orderId}/upload`, { method: "POST", body: formData });
}

export async function uploadSchoolRecord(formData: FormData) {
  return request("/api/analysis/upload", { method: "POST", body: formData });
}

export async function checkConsultationEligible() {
  return request("/api/analysis/check-consultation-eligible");
}

export async function getAnalysisList() {
  return request("/api/analysis/list");
}

export async function getAnalysisDetail(id: string) {
  return request(`/api/analysis/${id}`);
}

export async function getReportExcelUrl(id: string) {
  return request(`/api/analysis/${id}/report/excel`);
}

export async function getReportPdfUrl(id: string) {
  return request(`/api/analysis/${id}/report/pdf`);
}

// --- 상담 ---
export async function getAvailableSlots(year: number, month: number) {
  return request(`/api/consultation/slots?year=${year}&month=${month}`);
}

export async function bookConsultation(data: {
  slot_id: string;
  type: string;
  memo?: string;
  analysis_order_id?: string;
}) {
  return request("/api/consultation/book", { method: "POST", body: JSON.stringify(data) });
}

export async function getMyBookings() {
  return request("/api/consultation/my");
}

export async function cancelBooking(id: string) {
  return request(`/api/consultation/${id}/cancel`, { method: "PUT" });
}

export async function getMyConsultationNotes() {
  return request("/api/consultation-notes");
}

// --- 결제 ---
export async function preparePayment(data: {
  order_type: "analysis" | "consultation";
  order_id: string;
  amount: number;
}) {
  return request("/api/payment/toss/ready", { method: "POST", body: JSON.stringify(data) });
}

export async function confirmTossPayment(data: {
  payment_key: string;
  order_id: string;
  amount: number;
}) {
  return request("/api/payment/toss/confirm", { method: "POST", body: JSON.stringify(data) });
}

export async function getMyPayments() {
  return request("/api/payment/my");
}

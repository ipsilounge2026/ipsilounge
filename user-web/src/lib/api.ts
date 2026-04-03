const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** 다운로드 URL이 상대경로이면 API 서버 주소를 앞에 붙여줌 */
export function toFullUrl(url: string): string {
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return url;
}

async function request(path: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined"
    ? (localStorage.getItem("user_token") || sessionStorage.getItem("user_token"))
    : null;

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
      sessionStorage.removeItem("user_token");
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
export async function register(data: {
  email: string;
  password: string;
  name: string;
  phone?: string;
  member_type?: string;
  student_name?: string;
  student_birth?: string;
  birth_date?: string;
  school_name?: string;
  grade?: number;
  branch_name?: string;
}) {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function searchSchools(query: string) {
  return request(`/api/schools/search?query=${encodeURIComponent(query)}`);
}

export async function login(email: string, password: string) {
  const data = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const keepLoggedIn = localStorage.getItem("keep_logged_in") === "true";
  if (keepLoggedIn) {
    localStorage.setItem("user_token", data.access_token);
  } else {
    sessionStorage.setItem("user_token", data.access_token);
  }
  return data;
}

// --- 사용자 ---
export async function getMe() {
  return request("/api/users/me");
}

export async function updateMe(data: {
  name?: string;
  phone?: string;
  student_name?: string;
  student_birth?: string;
  birth_date?: string;
  school_name?: string;
  grade?: number;
  branch_name?: string;
}) {
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

export async function checkApplyCooldown() {
  return request("/api/analysis/check-apply-cooldown");
}

export async function checkBookingCooldown() {
  return request("/api/consultation/check-booking-cooldown");
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
export async function getCounselors() {
  return request("/api/consultation/counselors");
}

export async function getAvailableSlots(year: number, month: number, adminId?: string) {
  const params = new URLSearchParams({ year: String(year), month: String(month) });
  if (adminId) params.set("admin_id", adminId);
  return request(`/api/consultation/slots?${params}`);
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

// --- 설명회 (지점 담당자용) ---
export async function getSeminarSchedules() {
  return request("/api/seminar/schedules");
}

export async function getSeminarAvailability(scheduleId: string) {
  return request(`/api/seminar/schedules/${scheduleId}/availability`);
}

export async function createSeminarReservation(data: {
  schedule_id: string;
  reservation_date: string;
  time_slot: string;
  contact_name: string;
  contact_phone: string;
  attendee_count: number;
  memo?: string;
}) {
  return request("/api/seminar/reserve", { method: "POST", body: JSON.stringify(data) });
}

export async function getMySeminarReservations() {
  return request("/api/seminar/my");
}

export async function modifySeminarReservation(id: string, data: {
  reservation_date?: string;
  time_slot?: string;
  contact_name?: string;
  contact_phone?: string;
  attendee_count?: number;
  memo?: string;
  modify_reason: string;
}) {
  return request(`/api/seminar/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function cancelSeminarReservation(id: string, cancelReason: string) {
  return request(`/api/seminar/${id}/cancel`, {
    method: "PUT",
    body: JSON.stringify({ cancel_reason: cancelReason }),
  });
}

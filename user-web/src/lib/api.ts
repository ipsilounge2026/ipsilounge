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
    const err = new Error(error.detail || "요청에 실패했습니다") as any;
    err.status = res.status;
    throw err;
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
  branch_name?: string | null;
  is_academy_student?: boolean;
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
  owner_user_id?: string;
}) {
  return request("/api/analysis/apply", { method: "POST", body: JSON.stringify(data) });
}

export async function uploadSchoolRecordToOrder(orderId: string, formData: FormData) {
  return request(`/api/analysis/${orderId}/upload`, { method: "POST", body: formData });
}

export async function uploadSchoolRecord(formData: FormData) {
  return request("/api/analysis/upload", { method: "POST", body: formData });
}

export async function checkConsultationEligible(consultationType?: string) {
  const params = consultationType ? `?consultation_type=${encodeURIComponent(consultationType)}` : "";
  return request(`/api/analysis/check-consultation-eligible${params}`);
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
  owner_user_id?: string;
}) {
  return request("/api/consultation/book", { method: "POST", body: JSON.stringify(data) });
}

export async function getMyBookings() {
  return request("/api/consultation/my");
}

export async function getMyCounselor() {
  return request("/api/consultation/my-counselor");
}

export async function getAvailableCounselors() {
  return request("/api/consultation/available-counselors");
}

export async function requestCounselorChange(data: { requested_admin_id: string | null; reason: string }) {
  return request("/api/consultation/change-counselor-request", { method: "POST", body: JSON.stringify(data) });
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

// --- 공지사항 ---
export async function getActiveNotices() {
  return request("/api/notices/active");
}

// --- 대학/학과 드롭다운 ---
export async function getUniversities(): Promise<{ year: number | null; universities: string[] }> {
  return request("/api/universities");
}

export async function getUniversityMajors(university: string): Promise<{ year: number | null; university: string; majors: string[] }> {
  return request(`/api/universities/majors?university=${encodeURIComponent(university)}`);
}

// --- 사전 상담 설문 (Consultation Survey) ---
export async function getSurveySchema(surveyType: string) {
  return request(`/api/consultation-surveys/schema/${surveyType}`);
}

export async function getSurveySuggest(surveyType: string) {
  return request(`/api/consultation-surveys/suggest/${surveyType}`);
}

export async function createSurvey(data: {
  survey_type: string;
  timing?: string | null;
  mode?: string | null;
  booking_id?: string | null;
  started_platform?: string;
  owner_user_id?: string;
}) {
  return request("/api/consultation-surveys", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listMySurveys(params?: { survey_type?: string; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.survey_type) qs.set("survey_type", params.survey_type);
  if (params?.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request(`/api/consultation-surveys${suffix}`);
}

export async function getSurvey(id: string) {
  return request(`/api/consultation-surveys/${id}`);
}

export async function patchSurvey(
  id: string,
  data: {
    answers?: Record<string, any>;
    category_status?: Record<string, string>;
    last_category?: string;
    last_question?: string;
    last_edited_platform?: string;
    note?: string;
    last_known_updated_at?: string;
  }
) {
  return request(`/api/consultation-surveys/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteSurvey(id: string) {
  return request(`/api/consultation-surveys/${id}`, { method: "DELETE" });
}

export async function getSurveyComputed(id: string) {
  return request(`/api/consultation-surveys/${id}/computed`);
}

export async function getSurveyActionPlan(id: string) {
  return request(`/api/consultation-surveys/${id}/action-plan`);
}

export async function getSurveyRoadmap(id: string) {
  return request(`/api/consultation-surveys/${id}/roadmap`);
}

export async function getSurveyDelta(id: string) {
  return request(`/api/consultation-surveys/${id}/delta`);
}

export async function updateRoadmapProgress(id: string, progress: Record<string, Record<string, boolean>>) {
  return request(`/api/consultation-surveys/${id}/roadmap-progress`, {
    method: "PATCH",
    body: JSON.stringify({ progress }),
  });
}

export async function submitSurvey(id: string) {
  return request(`/api/consultation-surveys/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  });
}

export async function issueSurveyResumeToken(
  id: string,
  data: { expires_in_hours?: number; send_email?: boolean }
) {
  return request(`/api/consultation-surveys/${id}/resume-token`, {
    method: "POST",
    body: JSON.stringify({
      expires_in_hours: data.expires_in_hours ?? 72,
      send_email: data.send_email ?? false,
    }),
  });
}

// 토큰 기반 이어쓰기 (인증 불필요)
export async function getSurveyByResumeToken(token: string) {
  const res = await fetch(`${API_BASE}/api/consultation-surveys/resume?token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "이어쓰기 토큰이 유효하지 않습니다" }));
    throw new Error(error.detail || "이어쓰기 토큰이 유효하지 않습니다");
  }
  return res.json();
}

// --- 가족 연결 (학생-학부모) ---
export interface FamilyMemberInfo {
  user_id: string;
  name: string;
  email: string;
  member_type: string;
  school_name: string | null;
  grade: number | null;
}

export interface FamilyLinkItem {
  link_id: string;
  role: "parent" | "child"; // 호출자 입장에서 상대방의 역할
  member: FamilyMemberInfo;
  created_at: string;
  can_revoke: boolean;
}

export async function createFamilyInvite(): Promise<{
  code: string;
  expires_at: string;
  inviter_role: string;
}> {
  return request("/api/family/invite", { method: "POST" });
}

export async function connectFamilyByCode(code: string): Promise<FamilyLinkItem> {
  return request("/api/family/connect", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function listFamilyLinks(): Promise<{ items: FamilyLinkItem[] }> {
  return request("/api/family/links");
}

export async function revokeFamilyLink(linkId: string): Promise<{ message: string }> {
  return request(`/api/family/links/${linkId}`, { method: "DELETE" });
}

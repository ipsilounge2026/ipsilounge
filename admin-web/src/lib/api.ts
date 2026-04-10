const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** 다운로드 URL이 상대경로이면 API 서버 주소를 앞에 붙여줌 */
export function toFullUrl(url: string): string {
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return url;
}

let isRefreshing = false;

async function tryAutoReLogin(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (isRefreshing) return false;
  const keepLoggedIn = localStorage.getItem("admin_keep_logged_in");
  const savedEmail = localStorage.getItem("admin_saved_email");
  const savedCred = localStorage.getItem("admin_keep_cred");
  if (keepLoggedIn !== "true" || !savedEmail || !savedCred) return false;

  isRefreshing = true;
  try {
    const res = await fetch(`${API_BASE}/api/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: savedEmail, password: atob(savedCred) }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem("admin_token", data.access_token);
    return true;
  } catch {
    return false;
  } finally {
    isRefreshing = false;
  }
}

async function request(path: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // FormData인 경우 Content-Type을 설정하지 않음 (브라우저가 자동 설정)
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    // 로그인 유지 설정 시 자동 재로그인 시도
    const refreshed = await tryAutoReLogin();
    if (refreshed) {
      const newToken = localStorage.getItem("admin_token");
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("admin_token");
        window.location.href = "/login";
      }
      throw new Error("인증이 만료되었습니다");
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "요청에 실패했습니다" }));
    throw new Error(error.detail || "요청에 실패했습니다");
  }

  return res.json();
}

// --- 인증 ---
export async function adminLogin(email: string, password: string) {
  const data = await request("/api/auth/admin/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("admin_token", data.access_token);
  return data;
}

// --- 대시보드 ---
export async function getDashboard() {
  return request("/api/admin/dashboard");
}

// --- 분석 관리 ---
export async function getAnalysisList(page = 1, status?: string, serviceType?: string) {
  const params = new URLSearchParams({ page: String(page), size: "20" });
  if (status) params.set("status_filter", status);
  if (serviceType) params.set("service_type_filter", serviceType);
  return request(`/api/admin/analysis/list?${params}`);
}

export async function getAnalysisDetail(id: string) {
  return request(`/api/admin/analysis/${id}`);
}

export async function downloadSchoolRecord(id: string) {
  return request(`/api/admin/analysis/${id}/download`);
}

export async function uploadReport(id: string, formData: FormData) {
  return request(`/api/admin/analysis/${id}/upload-report`, {
    method: "POST",
    body: formData,
  });
}

export async function updateAnalysisStatus(id: string, status: string, adminMemo?: string) {
  return request(`/api/admin/analysis/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ status, admin_memo: adminMemo }),
  });
}

// --- 상담 관리 ---
export async function getCounselors() {
  return request("/api/admin/consultation/counselors");
}

export async function getConsultationSlots(year: number, month: number, adminId?: string) {
  const params = new URLSearchParams({ year: String(year), month: String(month) });
  if (adminId) params.set("admin_id", adminId);
  return request(`/api/admin/consultation/slots?${params}`);
}

export async function createSlot(data: Record<string, any>) {
  return request("/api/admin/consultation/slots", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateSlot(id: string, data: Record<string, any>) {
  return request(`/api/admin/consultation/slots/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteSlot(id: string, scope: string = "single") {
  return request(`/api/admin/consultation/slots/${id}?scope=${scope}`, { method: "DELETE" });
}

export async function getBookings(statusFilter?: string, year?: number, month?: number) {
  const params = new URLSearchParams();
  if (statusFilter) params.set("status_filter", statusFilter);
  if (year) params.set("year", String(year));
  if (month) params.set("month", String(month));
  return request(`/api/admin/consultation/bookings?${params}`);
}

export async function getBookingDetail(id: string) {
  return request(`/api/admin/consultation/bookings/${id}`);
}

export async function updateBookingStatus(id: string, status: string, cancelReason?: string) {
  const payload: any = { status };
  if (cancelReason) payload.cancel_reason = cancelReason;
  return request(`/api/admin/consultation/bookings/${id}/status`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function searchUsersForBooking(q: string) {
  return request(`/api/admin/consultation/users/search?q=${encodeURIComponent(q)}`);
}

export async function createManualBooking(data: {
  user_id: string;
  date: string;
  start_time: string;
  end_time: string;
  type: string;
  memo?: string;
}) {
  return request("/api/admin/consultation/bookings/manual", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// --- 회원 관리 ---
export async function getUsers(page = 1, search?: string, memberType?: string, isActive?: boolean, excludeBranchManager = false) {
  const params = new URLSearchParams({ page: String(page), size: "20" });
  if (search) params.set("search", search);
  if (memberType) params.set("member_type", memberType);
  if (isActive !== undefined) params.set("is_active", String(isActive));
  if (excludeBranchManager) params.set("exclude_branch_manager", "true");
  return request(`/api/admin/users?${params}`);
}

export async function getUserDetail(id: string) {
  return request(`/api/admin/users/${id}`);
}

export async function activateUser(id: string) {
  return request(`/api/admin/users/${id}/activate`, { method: "PUT" });
}

export async function deactivateUser(id: string) {
  return request(`/api/admin/users/${id}/deactivate`, { method: "PUT" });
}

// --- 결제 ---
export async function getPayments(page = 1, status?: string) {
  const params = new URLSearchParams({ page: String(page), size: "20" });
  if (status) params.set("status", status);
  return request(`/api/admin/payments?${params}`);
}

export async function getPaymentStats() {
  return request("/api/admin/payments/stats");
}

export async function refundPayment(id: string) {
  return request(`/api/admin/payments/${id}/refund`, { method: "PUT" });
}

// --- 관리자 계정 ---
export async function getAdminMe() {
  return request("/api/admin/admins/me");
}

export async function getAdmins() {
  return request("/api/admin/admins");
}

export async function createAdmin(data: { email: string; password: string; name: string; role: string; allowed_menus: string[] }) {
  return request("/api/admin/admins", { method: "POST", body: JSON.stringify(data) });
}

export async function promoteToAdmin(data: { user_id: string; role: string; allowed_menus: string[] }) {
  return request("/api/admin/admins/promote", { method: "POST", body: JSON.stringify(data) });
}

export async function searchUsersForPromotion(search: string) {
  const params = new URLSearchParams({ page: "1", size: "10", search });
  return request(`/api/admin/users?${params}`);
}

export async function updateAdmin(id: string, data: { name?: string; role?: string; is_active?: boolean; allowed_menus?: string[] }) {
  return request(`/api/admin/admins/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function resetAdminPassword(id: string, newPassword: string) {
  return request(`/api/admin/admins/${id}/reset-password`, { method: "PUT", body: JSON.stringify({ new_password: newPassword }) });
}

export async function getAllMenus() {
  return request("/api/admin/admins/menus");
}

// --- 학생-담당자 매칭 ---
export async function getAssignments() {
  return request("/api/admin/admins/assignments");
}

export async function createAssignment(adminId: string, userId: string) {
  return request("/api/admin/admins/assignments", { method: "POST", body: JSON.stringify({ admin_id: adminId, user_id: userId }) });
}

export async function deleteAssignment(id: string) {
  return request(`/api/admin/admins/assignments/${id}`, { method: "DELETE" });
}

export async function getMyStudents() {
  return request("/api/admin/admins/my-students");
}

export async function getUnmatchedStudents() {
  return request("/api/admin/admins/assignments/unmatched");
}

export async function getChangeRequests(status?: string) {
  const params = status ? `?status_filter=${status}` : "";
  return request(`/api/admin/admins/change-requests${params}`);
}

export async function processChangeRequest(requestId: string, data: { status: string; new_admin_id?: string | null; admin_memo?: string }) {
  return request(`/api/admin/admins/change-requests/${requestId}`, { method: "PUT", body: JSON.stringify(data) });
}

// --- 상담 기록 ---
export async function getConsultationNotes(userId?: string, category?: string) {
  const params = new URLSearchParams();
  if (userId) params.set("user_id", userId);
  if (category) params.set("category", category);
  return request(`/api/admin/consultation-notes?${params}`);
}

export async function createConsultationNote(data: {
  user_id: string;
  booking_id?: string;
  category: string;
  consultation_date: string;
  student_grade?: string;
  timing?: string;
  goals?: string;
  main_content?: string;
  advice_given?: string;
  next_steps?: string;
  next_topic?: string;
  topic_notes?: Record<string, string>;
  admin_private_notes?: string;
  is_visible_to_user: boolean;
}) {
  return request("/api/admin/consultation-notes", { method: "POST", body: JSON.stringify(data) });
}

export async function addConsultationNoteAddendum(id: string, content: string) {
  return request(`/api/admin/consultation-notes/${id}/addenda`, { method: "POST", body: JSON.stringify({ content }) });
}

export async function toggleConsultationNoteVisibility(id: string) {
  return request(`/api/admin/consultation-notes/${id}/visibility`, { method: "PATCH" });
}

// --- 설명회 관리 ---
export async function getSeminarDashboard(scheduleId?: string) {
  const params = new URLSearchParams();
  if (scheduleId) params.set("schedule_id", scheduleId);
  return request(`/api/admin/seminar/dashboard?${params}`);
}

export async function getSeminarSchedules() {
  return request("/api/admin/seminar/schedules");
}

export async function getSeminarSchedule(id: string) {
  return request(`/api/admin/seminar/schedules/${id}`);
}

export async function createSeminarSchedule(data: {
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  blocked_dates?: string[];
  morning_max: number;
  afternoon_max: number;
  evening_max: number;
  deadline_at: string;
  is_visible: boolean;
}) {
  return request("/api/admin/seminar/schedules", { method: "POST", body: JSON.stringify(data) });
}

export async function updateSeminarSchedule(id: string, data: Record<string, any>) {
  return request(`/api/admin/seminar/schedules/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteSeminarSchedule(id: string) {
  return request(`/api/admin/seminar/schedules/${id}`, { method: "DELETE" });
}

export async function toggleSeminarVisibility(id: string) {
  return request(`/api/admin/seminar/schedules/${id}/visibility`, { method: "PUT" });
}

export async function getSeminarReservations(scheduleId?: string, statusFilter?: string, branchName?: string) {
  const params = new URLSearchParams();
  if (scheduleId) params.set("schedule_id", scheduleId);
  if (statusFilter) params.set("status_filter", statusFilter);
  if (branchName) params.set("branch_name", branchName);
  return request(`/api/admin/seminar/reservations?${params}`);
}

export async function approveSeminarReservation(id: string) {
  return request(`/api/admin/seminar/reservations/${id}/approve`, { method: "PUT" });
}

export async function cancelSeminarReservation(id: string, cancelReason: string) {
  return request(`/api/admin/seminar/reservations/${id}/cancel`, {
    method: "PUT",
    body: JSON.stringify({ cancel_reason: cancelReason }),
  });
}

export async function updateSeminarActualAttendee(id: string, count: number) {
  return request(`/api/admin/seminar/reservations/${id}/actual-attendee`, {
    method: "PUT",
    body: JSON.stringify({ actual_attendee_count: count }),
  });
}

export async function getSeminarStatsByBranch(scheduleId?: string) {
  const params = new URLSearchParams();
  if (scheduleId) params.set("schedule_id", scheduleId);
  return request(`/api/admin/seminar/stats/by-branch?${params}`);
}

export async function getSeminarStatsBySchedule() {
  return request("/api/admin/seminar/stats/by-schedule");
}

export async function sendSeminarMail(data: {
  schedule_ids?: string[];
  branch_names?: string[];
  subject: string;
  body: string;
}) {
  return request("/api/admin/seminar/mail/send", { method: "POST", body: JSON.stringify(data) });
}

export async function getSeminarMailLogs() {
  return request("/api/admin/seminar/mail/logs");
}

export async function getSeminarMailLogDetail(id: string) {
  return request(`/api/admin/seminar/mail/logs/${id}`);
}

// --- 사전 상담 설문 ---
export async function getSurveys(page = 1, surveyType?: string, status?: string, search?: string) {
  const params = new URLSearchParams({ page: String(page), size: "20" });
  if (surveyType) params.set("survey_type", surveyType);
  if (status) params.set("status", status);
  if (search) params.set("search", search);
  return request(`/api/admin/surveys?${params}`);
}

export async function getSurveyDetail(id: string) {
  return request(`/api/admin/surveys/${id}`);
}

export async function getSurveyComputed(id: string) {
  return request(`/api/admin/surveys/${id}/computed`);
}

export async function getSurveyDelta(id: string) {
  return request(`/api/admin/surveys/${id}/delta`);
}

export async function updateSurveyMemo(id: string, adminMemo: string) {
  return request(`/api/admin/surveys/${id}/memo`, {
    method: "PUT",
    body: JSON.stringify({ admin_memo: adminMemo }),
  });
}

export async function deleteSurveyMemo(id: string) {
  return request(`/api/admin/surveys/${id}/memo`, { method: "DELETE" });
}

export async function downloadSurveyReport(id: string): Promise<void> {
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;
  const res = await fetch(`${API_BASE}/api/admin/surveys/${id}/report`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("리포트 생성에 실패했습니다");
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : "survey_report.pdf";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function getSurveyActionPlan(id: string) {
  return request(`/api/admin/surveys/${id}/action-plan`);
}

export async function updateSurveyActionPlan(id: string, data: { items: any[]; note?: string }) {
  return request(`/api/admin/surveys/${id}/action-plan`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// --- 상담사 초안 편집 (override) ---
export async function updateSurveyOverrides(id: string, overrides: Record<string, any>) {
  return request(`/api/admin/surveys/${id}/overrides`, {
    method: "PUT",
    body: JSON.stringify({ overrides }),
  });
}

export async function deleteSurveyOverrides(id: string) {
  return request(`/api/admin/surveys/${id}/overrides`, { method: "DELETE" });
}

// --- 상담사 체크리스트 ---
export async function updateSurveyChecklist(id: string, items: { content: string; checked: boolean }[]) {
  return request(`/api/admin/surveys/${id}/checklist`, {
    method: "PUT",
    body: JSON.stringify({ items }),
  });
}

export async function deleteSurveyChecklist(id: string) {
  return request(`/api/admin/surveys/${id}/checklist`, { method: "DELETE" });
}

// --- 예비고1 → 고1 전환 ---
export async function convertPreheigh1ToHigh(id: string) {
  return request(`/api/admin/surveys/${id}/convert-to-high`, { method: "POST" });
}

// --- 공지사항 관리 ---
export async function getNotices(page = 1, targetAudience?: string, isActive?: boolean) {
  const params = new URLSearchParams({ page: String(page), size: "20" });
  if (targetAudience) params.set("target_audience", targetAudience);
  if (isActive !== undefined) params.set("is_active", String(isActive));
  return request(`/api/admin/notices?${params}`);
}

export async function getNoticeDetail(id: string) {
  return request(`/api/admin/notices/${id}`);
}

export async function createNotice(data: {
  title: string;
  content: string;
  target_audience: string;
  is_pinned: boolean;
  is_active: boolean;
  send_push: boolean;
}) {
  return request("/api/admin/notices", { method: "POST", body: JSON.stringify(data) });
}

export async function updateNotice(id: string, data: Record<string, any>) {
  return request(`/api/admin/notices/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteNotice(id: string) {
  return request(`/api/admin/notices/${id}`, { method: "DELETE" });
}

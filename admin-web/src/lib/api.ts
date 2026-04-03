const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** 다운로드 URL이 상대경로이면 API 서버 주소를 앞에 붙여줌 */
export function toFullUrl(url: string): string {
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return url;
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

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("admin_token");
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

export async function updateBookingStatus(id: string, status: string) {
  return request(`/api/admin/consultation/bookings/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
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
export async function getUsers(page = 1, search?: string, memberType?: string, isActive?: boolean) {
  const params = new URLSearchParams({ page: String(page), size: "20" });
  if (search) params.set("search", search);
  if (memberType) params.set("member_type", memberType);
  if (isActive !== undefined) params.set("is_active", String(isActive));
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
  goals?: string;
  main_content: string;
  advice_given?: string;
  next_steps?: string;
  next_topic?: string;
  admin_private_notes?: string;
  is_visible_to_user: boolean;
}) {
  return request("/api/admin/consultation-notes", { method: "POST", body: JSON.stringify(data) });
}

export async function updateConsultationNote(id: string, data: Record<string, any>) {
  return request(`/api/admin/consultation-notes/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteConsultationNote(id: string) {
  return request(`/api/admin/consultation-notes/${id}`, { method: "DELETE" });
}

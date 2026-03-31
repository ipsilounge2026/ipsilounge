const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
export async function getAnalysisList(page = 1, status?: string) {
  const params = new URLSearchParams({ page: String(page), size: "20" });
  if (status) params.set("status_filter", status);
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
export async function getConsultationSlots(year: number, month: number) {
  return request(`/api/admin/consultation/slots?year=${year}&month=${month}`);
}

export async function createSlot(data: { date: string; start_time: string; end_time: string; max_bookings: number }) {
  return request("/api/admin/consultation/slots", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function createSlotsBulk(data: {
  start_date: string;
  end_date: string;
  weekdays: number[];
  start_time: string;
  end_time: string;
  duration_minutes: number;
  max_bookings: number;
}) {
  return request("/api/admin/consultation/slots/bulk", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateSlot(id: string, data: { max_bookings?: number; is_active?: boolean }) {
  return request(`/api/admin/consultation/slots/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteSlot(id: string) {
  return request(`/api/admin/consultation/slots/${id}`, { method: "DELETE" });
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

// --- 회원 관리 ---
export async function getUsers(page = 1, search?: string) {
  const params = new URLSearchParams({ page: String(page), size: "20" });
  if (search) params.set("search", search);
  return request(`/api/admin/users?${params}`);
}

export async function getUserDetail(id: string) {
  return request(`/api/admin/users/${id}`);
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

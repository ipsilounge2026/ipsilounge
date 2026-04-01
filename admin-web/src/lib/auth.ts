"use client";

export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("admin_token");
}

export function logout() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_info");
  window.location.href = "/login";
}

export function getAdminInfo(): { id: string; name: string; role: string; allowed_menus: string[] } | null {
  if (typeof window === "undefined") return null;
  const info = localStorage.getItem("admin_info");
  if (!info) return null;
  try {
    return JSON.parse(info);
  } catch {
    return null;
  }
}

export function setAdminInfo(info: { id: string; name: string; role: string; allowed_menus: string[] }) {
  localStorage.setItem("admin_info", JSON.stringify(info));
}

export function hasMenuAccess(menuKey: string): boolean {
  const info = getAdminInfo();
  if (!info) return false;
  if (info.role === "super_admin") return true;
  return info.allowed_menus.includes(menuKey);
}

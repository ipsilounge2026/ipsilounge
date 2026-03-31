"use client";

export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("admin_token");
}

export function logout() {
  localStorage.removeItem("admin_token");
  window.location.href = "/login";
}

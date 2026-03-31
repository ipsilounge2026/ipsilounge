"use client";

export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("user_token");
}

export function logout() {
  localStorage.removeItem("user_token");
  window.location.href = "/login";
}

"use client";

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (!payload.exp) return false;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  const token = localStorage.getItem("user_token") || sessionStorage.getItem("user_token");
  if (!token) return false;
  if (isTokenExpired(token)) {
    localStorage.removeItem("user_token");
    sessionStorage.removeItem("user_token");
    return false;
  }
  return true;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("user_token") || sessionStorage.getItem("user_token");
}

export function logout() {
  localStorage.removeItem("user_token");
  sessionStorage.removeItem("user_token");
  localStorage.removeItem("keep_logged_in");
  window.location.href = "/login";
}

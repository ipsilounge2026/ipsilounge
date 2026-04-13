"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout, getAdminInfo } from "@/lib/auth";
import {
  FiHome,
  FiFileText,
  FiCalendar,
  FiUsers,
  FiDollarSign,
  FiSettings,
  FiUserCheck,
  FiLink,
  FiMic,
  FiBell,
  FiClipboard,
} from "react-icons/fi";

const allMenuItems = [
  { key: "dashboard", href: "/", label: "대시보드", icon: FiHome },
  { key: "analysis", href: "/analysis", label: "분석 관리", icon: FiFileText },
  { key: "consultation", href: "/consultation", label: "상담 관리", icon: FiCalendar },
  { key: "surveys", href: "/surveys", label: "사전설문 관리", icon: FiClipboard },
  { key: "users", href: "/users", label: "회원 관리", icon: FiUsers },
  { key: "payments", href: "/payments", label: "결제 현황", icon: FiDollarSign },
  { key: "admins", href: "/admins", label: "담당자 관리", icon: FiUserCheck },
  { key: "seminar", href: "/seminar", label: "설명회 관리", icon: FiMic },
  { key: "notice", href: "/notice", label: "공지사항 관리", icon: FiBell },
  { key: "assignments", href: "/assignments", label: "학생-담당자 매칭", icon: FiLink },
  { key: "settings", href: "/settings", label: "설정", icon: FiSettings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const adminInfo = getAdminInfo();

  const visibleMenus = allMenuItems.filter((item) => {
    if (!adminInfo) return item.key === "dashboard";
    if (adminInfo.role === "super_admin") return true;
    return adminInfo.allowed_menus.includes(item.key);
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">입시라운지 관리자</div>
      {adminInfo && (
        <div style={{ padding: "0 20px 12px", fontSize: 12, color: "#9ca3af" }}>
          {adminInfo.name} (
          {adminInfo.role === "super_admin"
            ? "최고관리자"
            : adminInfo.role === "admin"
            ? "관리자"
            : adminInfo.role === "counselor"
            ? "상담사"
            : adminInfo.role === "senior"
            ? "선배"
            : "담당자"}
          )
        </div>
      )}
      <nav className="sidebar-nav">
        {visibleMenus.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-item ${isActive ? "active" : ""}`}
            >
              <Icon />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <button onClick={logout}>로그아웃</button>
      </div>
    </aside>
  );
}

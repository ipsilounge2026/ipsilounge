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
  FiBook,
  FiBarChart2,
  FiAlertTriangle,
  FiUser,
  FiShield,
  FiActivity,
} from "react-icons/fi";

const allMenuItems = [
  { key: "dashboard", href: "/", label: "대시보드", icon: FiHome },
  { key: "analysis", href: "/analysis", label: "분석 관리", icon: FiFileText },
  { key: "consultation", href: "/consultation", label: "상담 관리", icon: FiCalendar },
  { key: "senior-quality", href: "/senior-quality", label: "선배 상담 품질", icon: FiBarChart2 },
  // HSGAP-P2-senior-counselor-context-share-ui: 선배 전용 담당 학생 요약
  { key: "my_students_senior", href: "/my-students", label: "담당 학생 요약", icon: FiUser, seniorOnly: true },
  { key: "surveys", href: "/surveys", label: "사전설문 관리", icon: FiClipboard },
  // 연계규칙 V1 §6: 상담사→선배 공유 검토 (super_admin/admin 노출)
  { key: "counselor_sharing_review", href: "/consultation/counselor-sharing", label: "상담사→선배 공유 검토", icon: FiShield },
  // 기획서 §4-8-1: 슈퍼관리자 QA 이슈 큐 (blocked/repaired/warn 설문 점검)
  { key: "super_admin_issues", href: "/super-admin/issues", label: "QA 이슈 큐", icon: FiAlertTriangle, superAdminOnly: true },
  // 연계규칙 V1 §10-2: 상담 데이터 열람 감사 로그 (super_admin 전용)
  { key: "consultation_access_logs", href: "/super-admin/access-logs", label: "열람 감사 로그", icon: FiActivity, superAdminOnly: true },
  { key: "users", href: "/users", label: "회원 관리", icon: FiUsers },
  { key: "payments", href: "/payments", label: "결제 현황", icon: FiDollarSign },
  { key: "admins", href: "/admins", label: "담당자 관리", icon: FiUserCheck },
  { key: "seminar", href: "/seminar", label: "설명회 관리", icon: FiMic },
  { key: "notice", href: "/notice", label: "공지사항 관리", icon: FiBell },
  { key: "guidebook", href: "/guidebook", label: "가이드북 관리", icon: FiBook },
  { key: "assignments", href: "/assignments", label: "학생-담당자 매칭", icon: FiLink },
  { key: "settings", href: "/settings", label: "설정", icon: FiSettings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const adminInfo = getAdminInfo();

  const visibleMenus = allMenuItems.filter((item) => {
    if (!adminInfo) return item.key === "dashboard";
    // super_admin 전용 메뉴는 super_admin 에게만 노출
    if ((item as { superAdminOnly?: boolean }).superAdminOnly) {
      return adminInfo.role === "super_admin";
    }
    // HSGAP-P2: senior 전용 메뉴는 role === "senior"에게만 노출 (super_admin에는 노출 안 함)
    if ((item as { seniorOnly?: boolean }).seniorOnly) {
      return adminInfo.role === "senior";
    }
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

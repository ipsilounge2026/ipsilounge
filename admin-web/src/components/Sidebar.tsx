"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth";
import {
  FiHome,
  FiFileText,
  FiCalendar,
  FiUsers,
  FiDollarSign,
  FiSettings,
} from "react-icons/fi";

const menuItems = [
  { href: "/", label: "대시보드", icon: FiHome },
  { href: "/analysis", label: "분석 관리", icon: FiFileText },
  { href: "/consultation", label: "상담 관리", icon: FiCalendar },
  { href: "/users", label: "회원 관리", icon: FiUsers },
  { href: "/payments", label: "결제 현황", icon: FiDollarSign },
  { href: "/settings", label: "설정", icon: FiSettings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">입시라운지 관리자</div>
      <nav className="sidebar-nav">
        {menuItems.map((item) => {
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

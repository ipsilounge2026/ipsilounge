"use client";

import { useEffect, useState } from "react";
import { getMemberType } from "@/lib/auth";
import { listFamilyLinks, FamilyLinkItem } from "@/lib/api";

interface Child {
  user_id: string;
  name: string;
  school_name: string | null;
  grade: number | null;
}

interface ChildSelectorProps {
  /** 선택된 자녀 user_id (학생이면 항상 null) */
  value: string | null;
  onChange: (childId: string | null) => void;
  /** 로딩 완료 후 호출 (학생이면 즉시, 학부모면 자녀 목록 로드 후) */
  onReady?: (isParent: boolean, children: Child[]) => void;
}

/**
 * 학부모 계정일 때 자녀 선택 드롭다운을 표시하는 컴포넌트.
 * 학생 계정이면 아무것도 렌더링하지 않음.
 */
export default function ChildSelector({ value, onChange, onReady }: ChildSelectorProps) {
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const memberType = getMemberType();
  const isParent = memberType === "parent";

  useEffect(() => {
    if (!isParent) {
      setLoading(false);
      onReady?.(false, []);
      return;
    }
    listFamilyLinks()
      .then((res) => {
        const kids = res.items
          .filter((item: FamilyLinkItem) => item.role === "child")
          .map((item: FamilyLinkItem) => ({
            user_id: item.member.user_id,
            name: item.member.name,
            school_name: item.member.school_name,
            grade: item.member.grade,
          }));
        setChildren(kids);
        // 자녀가 1명이면 자동 선택
        if (kids.length === 1 && !value) {
          onChange(kids[0].user_id);
        }
        onReady?.(true, kids);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!isParent) return null;
  if (loading) return <p style={{ fontSize: 14, color: "var(--gray-500)" }}>자녀 정보 로딩 중...</p>;

  if (children.length === 0) {
    return (
      <div
        style={{
          padding: "16px 20px",
          background: "#FFF7ED",
          border: "1px solid #FDBA74",
          borderRadius: 10,
          marginBottom: 16,
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 600, color: "#9A3412", marginBottom: 4 }}>
          연결된 자녀가 없습니다
        </p>
        <p style={{ fontSize: 13, color: "#C2410C" }}>
          마이페이지에서 자녀와 가족 연결을 먼저 진행해주세요.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6, color: "var(--gray-700)" }}>
        신청 대상 자녀
      </label>
      {children.length === 1 ? (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--gray-50)",
            border: "1px solid var(--gray-200)",
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          {children[0].name}
          {children[0].school_name && ` (${children[0].school_name}`}
          {children[0].grade && ` ${children[0].grade}학년`}
          {children[0].school_name && ")"}
        </div>
      ) : (
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value || null)}
          style={{
            width: "100%",
            padding: "10px 14px",
            border: "1px solid var(--gray-300)",
            borderRadius: 8,
            fontSize: 14,
            background: "#fff",
          }}
        >
          <option value="">자녀를 선택해주세요</option>
          {children.map((child) => (
            <option key={child.user_id} value={child.user_id}>
              {child.name}
              {child.school_name ? ` (${child.school_name}` : ""}
              {child.grade ? ` ${child.grade}학년` : ""}
              {child.school_name ? ")" : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

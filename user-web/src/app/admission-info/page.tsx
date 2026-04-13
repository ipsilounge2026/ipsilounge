"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

type TabKey = "types" | "minimums" | "courses";

const TABS: { key: TabKey; label: string }[] = [
  { key: "types", label: "전형별 정보" },
  { key: "minimums", label: "수능 최저" },
  { key: "courses", label: "선택과목 가이드" },
];

/* ── 전형 데이터 ── */
const ADMISSION_TYPES = [
  {
    id: "gyo",
    name: "학생부교과전형",
    color: "#2563EB",
    bg: "#EFF6FF",
    summary: "내신 성적 중심 선발, 교과 등급이 당락 결정",
    features: [
      "내신(교과) 성적이 절대적 비중",
      "수능 최저학력기준 적용 대학이 많음",
      "정량 평가 위주 — 비교과 영향 적음",
      "지역균형(학교추천) 전형이 대표적",
    ],
    suitable: "내신 성적이 우수한 학생, 안정적 합격을 원하는 학생",
    preparation: "내신 관리가 핵심. 수능 최저 충족을 위한 수능 대비 병행 필요",
  },
  {
    id: "jonghap",
    name: "학생부종합전형",
    color: "#7C3AED",
    bg: "#F3E8FF",
    summary: "내신 + 세특 + 창체 + 행특 종합 평가",
    features: [
      "서류 평가(학생부) 중심 + 면접(일부 대학)",
      "학업역량 · 진로역량 · 공동체역량 종합 판단",
      "세부능력특기사항(세특)이 매우 중요",
      "학교 추천 / 활동 우수 등 세부 전형으로 구분",
    ],
    suitable: "내신은 중상위이나 세특·창체·행특이 우수한 학생",
    preparation: "교과 세특에 탐구 활동 기록 확보, 진로 일관성 있는 활동 설계",
  },
  {
    id: "nonsul",
    name: "논술전형",
    color: "#EA580C",
    bg: "#FFF7ED",
    summary: "논술 시험 비중이 높은 전형",
    features: [
      "논술 시험 성적이 합격 핵심 변수",
      "내신 반영은 있으나 실질 영향 작음",
      "수능 최저학력기준 적용 대학이 대부분",
      "수도권 주요 대학 위주로 시행",
    ],
    suitable: "논리적 사고력이 뛰어나고, 내신이 다소 부족한 학생",
    preparation: "대학별 논술 유형(인문/수리) 파악 후 꾸준한 연습 필요",
  },
  {
    id: "jeongsi",
    name: "정시전형 (수능)",
    color: "#16A34A",
    bg: "#F0FDF4",
    summary: "대학수학능력시험(수능) 점수 중심 선발",
    features: [
      "수능 성적(표준점수/백분위/등급)으로 선발",
      "대학별 영역 반영 비율이 다름",
      "가/나/다 군으로 나뉘어 3회 지원 가능",
      "정시 비율 40% 이상으로 확대 추세",
    ],
    suitable: "수능 성적이 내신보다 우수한 학생, 재수/반수 고려 학생",
    preparation: "수능 영역별 목표 점수 설정 후 체계적 학습 필수",
  },
];

/* ── 수능 최저 데이터 (2025 기준 예시) ── */
const CSAT_MINIMUMS = [
  { univ: "서울대", type: "학종(일반)", requirement: "없음", note: "면접 비중 높음" },
  { univ: "연세대", type: "교과(추천형)", requirement: "3개 합 7 이내", note: "영어 2등급 이내" },
  { univ: "연세대", type: "학종(활동우수)", requirement: "없음", note: "" },
  { univ: "고려대", type: "교과(학교추천)", requirement: "3개 합 7 이내", note: "영어 2등급 이내" },
  { univ: "고려대", type: "학종(학업우수)", requirement: "없음", note: "" },
  { univ: "성균관대", type: "교과(학교장)", requirement: "2개 합 5 이내", note: "" },
  { univ: "성균관대", type: "학종(계열적합)", requirement: "없음", note: "" },
  { univ: "서강대", type: "교과(지균)", requirement: "3개 합 7 이내", note: "" },
  { univ: "서강대", type: "학종(일반)", requirement: "없음", note: "" },
  { univ: "한양대", type: "교과(지역균형)", requirement: "없음", note: "교과 100%" },
  { univ: "한양대", type: "학종(일반)", requirement: "없음", note: "" },
  { univ: "중앙대", type: "교과(지균)", requirement: "3개 합 7 이내", note: "" },
  { univ: "중앙대", type: "학종(다빈치)", requirement: "없음", note: "" },
  { univ: "경희대", type: "교과(지균)", requirement: "2개 합 5 이내", note: "" },
  { univ: "경희대", type: "학종(네오르네상스)", requirement: "없음", note: "" },
  { univ: "이화여대", type: "교과(고교추천)", requirement: "3개 합 6 이내", note: "" },
  { univ: "건국대", type: "교과(지균)", requirement: "2개 합 5 이내", note: "" },
  { univ: "동국대", type: "교과(학교장)", requirement: "2개 합 5 이내", note: "" },
  { univ: "숙명여대", type: "교과(지균)", requirement: "2개 합 5 이내", note: "" },
  { univ: "홍익대", type: "교과(학교장)", requirement: "2개 합 6 이내", note: "" },
];

/* ── 선택과목 가이드 ── */
const COURSE_GUIDE_TRACKS: {
  track: string;
  color: string;
  bg: string;
  core: string[];
  recommended: string[];
  majors: string;
}[] = [
  {
    track: "인문·사회 계열",
    color: "#2563EB",
    bg: "#EFF6FF",
    core: ["화법과 작문", "언어와 매체", "확률과 통계", "사회·문화"],
    recommended: ["심화국어", "경제", "정치와 법", "세계사", "동아시아사", "윤리와 사상"],
    majors: "경영학, 경제학, 법학, 행정학, 심리학, 사회학, 국어국문, 영어영문, 사학 등",
  },
  {
    track: "자연·공학 계열",
    color: "#16A34A",
    bg: "#F0FDF4",
    core: ["미적분", "기하", "물리학I", "화학I"],
    recommended: ["물리학II", "화학II", "생명과학II", "확률과 통계", "경제수학", "정보"],
    majors: "컴퓨터공학, 전자공학, 기계공학, 화학공학, 수학, 물리학 등",
  },
  {
    track: "의약학 계열",
    color: "#DC2626",
    bg: "#FEF2F2",
    core: ["미적분", "기하", "생명과학I", "화학I"],
    recommended: ["생명과학II", "화학II", "물리학I", "확률과 통계"],
    majors: "의학, 치의학, 한의학, 약학, 수의학, 간호학 등",
  },
  {
    track: "교육 계열",
    color: "#CA8A04",
    bg: "#FEFCE8",
    core: ["교과 관련 심화과목", "교육학"],
    recommended: ["심리학", "철학", "사회·문화", "통계 관련 과목"],
    majors: "국어교육, 영어교육, 수학교육, 사회교육, 과학교육, 초등교육 등",
  },
  {
    track: "예체능 계열",
    color: "#DB2777",
    bg: "#FDF2F8",
    core: ["관련 실기/전공 과목", "미술/음악/체육 관련 진로선택"],
    recommended: ["미술 창작", "음악 연주와 창작", "체육 탐구", "미술사", "음악 감상과 비평"],
    majors: "미술, 디자인, 음악, 체육, 무용, 연극영화 등",
  },
];

export default function AdmissionInfoPage() {
  const [tab, setTab] = useState<TabKey>("types");
  const [expandedType, setExpandedType] = useState<string | null>(null);

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: 800 }}>
        <div className="page-header">
          <div>
            <h1>대입 정보</h1>
            <p style={{ fontSize: 14, color: "var(--gray-500)", marginTop: 4 }}>
              대학 입시 전형, 수능 최저, 선택과목 가이드
            </p>
          </div>
        </div>

        {/* 안내 문구 */}
        <div style={{ padding: "10px 14px", backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#92400E" }}>
          본 정보는 참고용이며, 정확한 내용은 각 대학 입학처를 통해 확인해주세요.
        </div>

        {/* 탭 */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--gray-200)", paddingBottom: 0 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "10px 18px",
                fontSize: 14,
                fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? "var(--primary)" : "var(--gray-500)",
                backgroundColor: "transparent",
                border: "none",
                borderBottom: tab === t.key ? "2px solid var(--primary)" : "2px solid transparent",
                cursor: "pointer",
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── 전형별 정보 ─── */}
        {tab === "types" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ADMISSION_TYPES.map((at) => {
              const isOpen = expandedType === at.id;
              return (
                <div key={at.id} className="card" style={{ padding: 0, overflow: "hidden", border: `1px solid ${isOpen ? at.color + "40" : "var(--gray-200)"}` }}>
                  <div onClick={() => setExpandedType(isOpen ? null : at.id)} style={{ padding: 16, cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 13, fontWeight: 600, backgroundColor: at.bg, color: at.color }}>{at.name}</span>
                      <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--gray-400)", transform: isOpen ? "rotate(180deg)" : "none", transition: "0.2s" }}>▼</span>
                    </div>
                    <p style={{ fontSize: 14, color: "var(--gray-600)" }}>{at.summary}</p>
                  </div>

                  {isOpen && (
                    <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--gray-100)" }}>
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-400)", marginBottom: 6 }}>주요 특징</div>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: "var(--gray-700)", lineHeight: 1.8 }}>
                          {at.features.map((f, i) => <li key={i}>{f}</li>)}
                        </ul>
                      </div>
                      <div style={{ marginTop: 12, padding: 12, backgroundColor: at.bg, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: at.color, marginBottom: 4 }}>적합한 학생</div>
                        <p style={{ fontSize: 14, color: "var(--gray-700)", margin: 0 }}>{at.suitable}</p>
                      </div>
                      <div style={{ marginTop: 12, padding: 12, backgroundColor: "#F9FAFB", borderRadius: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-500)", marginBottom: 4 }}>준비 방법</div>
                        <p style={{ fontSize: 14, color: "var(--gray-700)", margin: 0 }}>{at.preparation}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ─── 수능 최저학력기준 ─── */}
        {tab === "minimums" && (
          <div>
            {/* 설명 박스 */}
            <div className="card" style={{ marginBottom: 16, padding: 16, backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD" }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#0369A1", marginBottom: 6 }}>수능 최저학력기준이란?</div>
              <p style={{ fontSize: 13, color: "#0C4A6E", margin: 0, lineHeight: 1.7 }}>
                수시 합격을 위해 수능에서 충족해야 하는 최소 등급 기준입니다. 예를 들어 &quot;2개 합 5&quot;는 국·수·영·탐 중 2개 영역 등급의 합이 5 이하여야 한다는 의미입니다.
                학종은 대체로 최저가 없고, 교과전형은 최저 적용 대학이 많습니다.
              </p>
            </div>

            {/* 테이블 */}
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 500 }}>
                <thead>
                  <tr style={{ backgroundColor: "#F1F5F9" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, borderBottom: "2px solid var(--gray-300)" }}>대학</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, borderBottom: "2px solid var(--gray-300)" }}>전형</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, borderBottom: "2px solid var(--gray-300)" }}>최저 기준</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, borderBottom: "2px solid var(--gray-300)" }}>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {CSAT_MINIMUMS.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--gray-100)", backgroundColor: i % 2 === 0 ? "white" : "#FAFAFA" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 500 }}>{row.univ}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{
                          fontSize: 12, padding: "2px 6px", borderRadius: 4,
                          backgroundColor: row.type.includes("교과") ? "#EFF6FF" : row.type.includes("학종") ? "#F3E8FF" : "#F9FAFB",
                          color: row.type.includes("교과") ? "#2563EB" : row.type.includes("학종") ? "#7C3AED" : "#6B7280",
                        }}>
                          {row.type}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px", fontWeight: row.requirement === "없음" ? 400 : 600, color: row.requirement === "없음" ? "var(--gray-400)" : "var(--gray-800)" }}>
                        {row.requirement}
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--gray-500)" }}>{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 12, color: "var(--gray-400)", marginTop: 12, textAlign: "center" }}>
              * 2025학년도 기준 참고 자료 (대학별 요강에서 반드시 재확인)
            </p>
          </div>
        )}

        {/* ─── 선택과목 가이드 ─── */}
        {tab === "courses" && (
          <div>
            <div className="card" style={{ marginBottom: 16, padding: 16, backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0" }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#166534", marginBottom: 6 }}>2022 개정교육과정 선택과목</div>
              <p style={{ fontSize: 13, color: "#14532D", margin: 0, lineHeight: 1.7 }}>
                선택과목은 진로·전공과의 연관성이 중요합니다. 지원 학과에서 핵심/권장으로 지정한 과목을 이수하면 학종에서 유리하며,
                교과전형에서도 관련 과목 성적이 반영될 수 있습니다.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {COURSE_GUIDE_TRACKS.map((tr) => (
                <div key={tr.track} className="card" style={{ padding: 16, border: `1px solid ${tr.color}20` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 13, fontWeight: 600, backgroundColor: tr.bg, color: tr.color }}>{tr.track}</span>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-500)", marginBottom: 4 }}>핵심 선택과목</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {tr.core.map((c) => (
                        <span key={c} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 6, backgroundColor: tr.bg, color: tr.color, fontWeight: 500 }}>{c}</span>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-500)", marginBottom: 4 }}>권장 선택과목</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {tr.recommended.map((c) => (
                        <span key={c} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 6, backgroundColor: "#F3F4F6", color: "var(--gray-600)" }}>{c}</span>
                      ))}
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: "var(--gray-400)", borderTop: "1px solid var(--gray-100)", paddingTop: 8 }}>
                    <strong>관련 학과:</strong> {tr.majors}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}

"use client";

/**
 * 영역 내 취약 유형 자가진단 (C2)
 *
 * 데이터 형식:
 * {
 *   "korean":  { "selected": ["문법(언어)", "시간 부족"] },
 *   "math":    { "selected": ["특정 단원"], "text": "확률과 통계" },
 *   "english": { "selected": ["빈칸추론"] },
 *   "inquiry": { "selected": ["자료·그래프 해석"] }
 * }
 *
 * - question.subjects: [{ key, label, options, with_text? }]
 * - 수학 등 with_text가 정의된 과목에서 "특정 단원" 옵션이 선택되면 텍스트 입력 노출.
 */

import { CSSProperties } from "react";

interface Props {
  question: any;
  value: any;
  onChange: (v: any) => void;
}

const chipStyle = (selected: boolean): CSSProperties => ({
  padding: "6px 12px",
  borderRadius: 999,
  border: `1px solid ${selected ? "var(--primary, #4F46E5)" : "var(--gray-300)"}`,
  background: selected ? "var(--primary, #4F46E5)" : "white",
  color: selected ? "white" : "var(--gray-700)",
  fontSize: 13,
  cursor: "pointer",
  userSelect: "none",
});

const subjectCardStyle: CSSProperties = {
  border: "1px solid var(--gray-200)",
  borderRadius: 8,
  padding: 12,
  background: "white",
};

export function WeakTypePerSubject({ question, value, onChange }: Props) {
  const data: Record<string, any> =
    value && typeof value === "object" ? value : {};

  const subjects: any[] = Array.isArray(question.subjects)
    ? question.subjects
    : [];

  const setSubject = (key: string, next: any) => {
    onChange({ ...data, [key]: next });
  };

  const toggleOption = (subjectKey: string, option: string) => {
    const cur = data[subjectKey] || { selected: [] };
    const list: string[] = Array.isArray(cur.selected) ? cur.selected : [];
    const next = list.includes(option)
      ? list.filter((o) => o !== option)
      : [...list, option];
    setSubject(subjectKey, { ...cur, selected: next });
  };

  const updateText = (subjectKey: string, text: string) => {
    const cur = data[subjectKey] || { selected: [] };
    setSubject(subjectKey, { ...cur, text });
  };

  return (
    <div>
      {question.label && (
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
          {question.label}
          {question.required && (
            <span style={{ color: "#DC2626", marginLeft: 4 }}>*</span>
          )}
        </div>
      )}
      {question.instruction && (
        <p
          style={{
            fontSize: 12,
            color: "var(--gray-600)",
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          {question.instruction}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {subjects.map((s) => {
          const cur = data[s.key] || { selected: [] };
          const selected: string[] = Array.isArray(cur.selected)
            ? cur.selected
            : [];
          const options: string[] = Array.isArray(s.options) ? s.options : [];
          const hasTextOption = !!s.with_text;
          // "특정 단원"이라는 키워드 옵션이 선택되었을 때 텍스트 입력 노출
          const textTriggerSelected = selected.some((o) =>
            o.includes("특정 단원"),
          );

          return (
            <div key={s.key} style={subjectCardStyle}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--gray-800)",
                  marginBottom: 8,
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {options.map((opt) => {
                  const isOn = selected.includes(opt);
                  return (
                    <span
                      key={opt}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleOption(s.key, opt)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleOption(s.key, opt);
                        }
                      }}
                      style={chipStyle(isOn)}
                    >
                      {opt}
                    </span>
                  );
                })}
              </div>

              {hasTextOption && textTriggerSelected && (
                <div style={{ marginTop: 10 }}>
                  <input
                    type="text"
                    value={cur.text || ""}
                    onChange={(e) => updateText(s.key, e.target.value)}
                    placeholder={s.with_text}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "1px solid var(--gray-300)",
                      borderRadius: 6,
                      fontSize: 13,
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

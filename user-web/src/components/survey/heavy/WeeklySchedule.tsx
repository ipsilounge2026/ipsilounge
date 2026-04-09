"use client";

/**
 * 주간 학습 스케줄 입력.
 *
 * 데이터 형식:
 * {
 *   "월": [{ "category": "academy_class", "subject": "수학", "hours": 1.5 }, ...],
 *   "화": [...],
 *   ...
 * }
 *
 * UI: 요일 카드 그리드, 각 카드 내에서 항목 추가(카테고리/과목/시간) 가능.
 */

import { CSSProperties } from "react";

interface Props {
  question: any;
  value: any;
  onChange: (v: any) => void;
}

interface Entry {
  category: string;
  subject: string;
  hours: number | null;
}

const dayCardStyle: CSSProperties = {
  border: "1px solid var(--gray-200)",
  borderRadius: 8,
  padding: 10,
  background: "white",
};

const inputStyle: CSSProperties = {
  padding: "4px 6px",
  border: "1px solid var(--gray-300)",
  borderRadius: 4,
  fontSize: 12,
};

export function WeeklySchedule({ question, value, onChange }: Props) {
  const data: Record<string, Entry[]> = value && typeof value === "object" ? value : {};

  const setDay = (day: string, entries: Entry[]) => {
    onChange({ ...data, [day]: entries });
  };

  const addEntry = (day: string) => {
    const cur = data[day] || [];
    setDay(day, [...cur, { category: question.categories[0]?.key || "", subject: "", hours: null }]);
  };

  const updateEntry = (day: string, idx: number, patch: Partial<Entry>) => {
    const cur = [...(data[day] || [])];
    cur[idx] = { ...cur[idx], ...patch };
    setDay(day, cur);
  };

  const removeEntry = (day: string, idx: number) => {
    const cur = [...(data[day] || [])];
    cur.splice(idx, 1);
    setDay(day, cur);
  };

  // 자동 계산 (총 시간)
  const totalHours = Object.values(data).reduce((sum, entries) => {
    return sum + (entries || []).reduce((s, e) => s + (e.hours || 0), 0);
  }, 0);

  const subjectField = (question.fields_per_entry as any[]).find((f) => f.name === "subject");
  const subjectOptions: string[] = subjectField?.options || ["국어", "영어", "수학", "사회", "과학", "기타"];

  return (
    <div>
      {question.label && (
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
          {question.label}
          {question.required && <span style={{ color: "#DC2626", marginLeft: 4 }}>*</span>}
        </div>
      )}
      {question.instruction && (
        <p style={{ fontSize: 12, color: "var(--gray-600)", marginBottom: 12, lineHeight: 1.5 }}>
          {question.instruction}
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {question.days.map((day: string) => {
          const entries = data[day] || [];
          return (
            <div key={day} style={dayCardStyle}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--primary-dark)" }}>
                {day}요일
              </div>
              {entries.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--gray-500)", marginBottom: 6 }}>항목 없음</div>
              )}
              {entries.map((e, idx) => (
                <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6, padding: 6, background: "var(--gray-50)", borderRadius: 4 }}>
                  <select
                    value={e.category}
                    onChange={(ev) => updateEntry(day, idx, { category: ev.target.value })}
                    style={inputStyle}
                  >
                    {(question.categories as any[]).map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={e.subject}
                    onChange={(ev) => updateEntry(day, idx, { subject: ev.target.value })}
                    style={inputStyle}
                  >
                    <option value="">과목 선택</option>
                    {subjectOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      max={24}
                      value={e.hours ?? ""}
                      onChange={(ev) => updateEntry(day, idx, { hours: ev.target.value === "" ? null : Number(ev.target.value) })}
                      placeholder="시간"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <span style={{ fontSize: 11, color: "var(--gray-600)" }}>시간</span>
                    <button
                      type="button"
                      onClick={() => removeEntry(day, idx)}
                      style={{ padding: "2px 6px", border: "1px solid var(--gray-300)", borderRadius: 4, background: "white", cursor: "pointer", fontSize: 11, color: "#DC2626" }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addEntry(day)}
                style={{
                  width: "100%",
                  padding: 6,
                  border: "1px dashed var(--gray-400)",
                  borderRadius: 4,
                  background: "white",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "var(--gray-600)",
                }}
              >
                + 추가
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12, padding: 10, background: "var(--primary-light)", borderRadius: 6, fontSize: 12, color: "var(--primary-dark)" }}>
        주간 총 학습 시간: <strong>{totalHours}시간</strong>
        {question.auto_calculations && (
          <span style={{ marginLeft: 8, color: "var(--gray-600)" }}>
            (상세 분석은 제출 후 자동 산출됩니다)
          </span>
        )}
      </div>
    </div>
  );
}

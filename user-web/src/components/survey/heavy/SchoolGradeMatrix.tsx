"use client";

/**
 * 학기별 교과 성적 (B1~B4)
 *
 * 학기 목록은 DynamicSurvey가 사전 resolve 하여 question.resolved_semesters 로 주입.
 *   resolved_semesters: ["고1-1학기", "고1-2학기", ...]  (semester_generation_rules[A4])
 *   resolved_subject_courses: { "국어": [...], "수학": [...], ... }
 *
 * 데이터 형식:
 * {
 *   "고1-1학기": {
 *     "exempt": false,
 *     "rows": [
 *       {
 *         "category": "국어",
 *         "course_name": "공통국어1",
 *         "rank_grade": "2",
 *         "achievement": "A",
 *         "raw_score": 88,
 *         "subject_avg": 72,
 *         "enrolled_count": 280,
 *         "exam_ratio": "70:30"
 *       },
 *       ...
 *     ]
 *   }
 * }
 *
 * - 학기마다 [+ 과목 추가] 버튼으로 row 추가
 * - 각 row는 question.fields 정의에 따라 select / select_dynamic / number 렌더
 *   (select_dynamic: depends_on 필드값 → resolved_subject_courses[해당값] 로 옵션 채움)
 */

import { CSSProperties } from "react";

interface Props {
  question: any;
  value: any;
  onChange: (v: any) => void;
}

const cellStyle: CSSProperties = {
  padding: 6,
  border: "1px solid var(--gray-200)",
  textAlign: "center",
  background: "white",
  verticalAlign: "middle",
};

const headerCellStyle: CSSProperties = {
  ...cellStyle,
  background: "var(--gray-100)",
  fontWeight: 600,
  fontSize: 12,
};

const inputBase: CSSProperties = {
  width: "100%",
  minWidth: 70,
  padding: "4px 6px",
  border: "1px solid var(--gray-300)",
  borderRadius: 4,
  fontSize: 12,
  textAlign: "center",
  background: "white",
};

export function SchoolGradeMatrix({ question, value, onChange }: Props) {
  const data: Record<string, any> =
    value && typeof value === "object" ? value : {};

  const semesters: string[] = Array.isArray(question.resolved_semesters)
    ? question.resolved_semesters
    : [];
  const subjectCourses: Record<string, string[]> =
    question.resolved_subject_courses || {};
  const fields: any[] = Array.isArray(question.fields) ? question.fields : [];

  const setSemester = (semKey: string, next: any) => {
    onChange({ ...data, [semKey]: next });
  };

  const toggleExempt = (semKey: string, current: boolean) => {
    if (current) {
      setSemester(semKey, { exempt: false, rows: data[semKey]?.rows || [] });
    } else {
      setSemester(semKey, { exempt: true, rows: [] });
    }
  };

  const addRow = (semKey: string) => {
    const sd = data[semKey] || { exempt: false, rows: [] };
    const next = { ...sd, rows: [...(sd.rows || []), {}] };
    setSemester(semKey, next);
  };

  const removeRow = (semKey: string, idx: number) => {
    const sd = data[semKey] || { exempt: false, rows: [] };
    const rows = [...(sd.rows || [])];
    rows.splice(idx, 1);
    setSemester(semKey, { ...sd, rows });
  };

  const updateCell = (
    semKey: string,
    rowIdx: number,
    fieldName: string,
    raw: string,
    fieldDef: any,
  ) => {
    const sd = data[semKey] || { exempt: false, rows: [] };
    const rows = [...(sd.rows || [])];
    const row = { ...(rows[rowIdx] || {}) };

    if (raw === "") {
      row[fieldName] = null;
    } else if (fieldDef.type === "number") {
      const n = Number(raw);
      row[fieldName] = Number.isNaN(n) ? null : n;
    } else {
      row[fieldName] = raw;
    }

    // category 변경 시 course_name 초기화 (의존 필드)
    if (fieldName === "category") {
      const dependent = fields.find(
        (f) => f.depends_on === "category" || f.options_source?.includes("category"),
      );
      if (dependent) row[dependent.name] = "";
    }

    rows[rowIdx] = row;
    setSemester(semKey, { ...sd, rows });
  };

  if (semesters.length === 0) {
    return (
      <div
        style={{
          padding: 12,
          background: "#FEF3C7",
          border: "1px solid #FDE68A",
          borderRadius: 8,
          fontSize: 12,
          color: "#92400E",
        }}
      >
        상담 시점(A4)을 먼저 선택해주세요. 입력 학기가 자동 생성됩니다.
      </div>
    );
  }

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

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {semesters.map((sem) => {
          const sd = data[sem] || { exempt: false, rows: [] };
          const exempt = !!sd.exempt;
          const rows: any[] = Array.isArray(sd.rows) ? sd.rows : [];

          return (
            <div
              key={sem}
              style={{
                border: "1px solid var(--gray-200)",
                borderRadius: 8,
                padding: 12,
                background: "white",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <strong style={{ fontSize: 14 }}>{sem}</strong>
                <label
                  style={{
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "var(--gray-600)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={exempt}
                    onChange={() => toggleExempt(sem, exempt)}
                  />
                  해당 없음 (자유학기 등)
                </label>
              </div>

              {!exempt && (
                <>
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        borderCollapse: "collapse",
                        width: "100%",
                        minWidth: 880,
                      }}
                    >
                      <thead>
                        <tr>
                          {fields.map((f) => (
                            <th key={f.name} style={headerCellStyle}>
                              {f.label}
                              {f.required && (
                                <span style={{ color: "#DC2626", marginLeft: 2 }}>
                                  *
                                </span>
                              )}
                            </th>
                          ))}
                          <th style={{ ...headerCellStyle, width: 50 }}>삭제</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 && (
                          <tr>
                            <td
                              colSpan={fields.length + 1}
                              style={{
                                ...cellStyle,
                                color: "var(--gray-500)",
                                fontSize: 12,
                                padding: 16,
                              }}
                            >
                              아래 [+ 과목 추가] 버튼을 눌러 과목을 입력해주세요.
                            </td>
                          </tr>
                        )}
                        {rows.map((row, idx) => (
                          <tr key={idx}>
                            {fields.map((f) => (
                              <td key={f.name} style={cellStyle}>
                                {renderFieldCell(
                                  f,
                                  row,
                                  subjectCourses,
                                  (raw) =>
                                    updateCell(sem, idx, f.name, raw, f),
                                )}
                              </td>
                            ))}
                            <td style={cellStyle}>
                              <button
                                type="button"
                                onClick={() => removeRow(sem, idx)}
                                style={{
                                  padding: "4px 8px",
                                  fontSize: 11,
                                  border: "1px solid var(--gray-300)",
                                  borderRadius: 4,
                                  background: "white",
                                  color: "#DC2626",
                                  cursor: "pointer",
                                }}
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    type="button"
                    onClick={() => addRow(sem)}
                    style={{
                      marginTop: 8,
                      padding: "6px 12px",
                      fontSize: 12,
                      border: "1px dashed var(--gray-400)",
                      borderRadius: 6,
                      background: "var(--gray-50, #F9FAFB)",
                      color: "var(--gray-700)",
                      cursor: "pointer",
                    }}
                  >
                    + 과목 추가
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderFieldCell(
  field: any,
  row: Record<string, any>,
  subjectCourses: Record<string, string[]>,
  onValue: (raw: string) => void,
) {
  const v = row[field.name];

  if (field.type === "select") {
    const options: string[] = Array.isArray(field.options) ? field.options : [];
    return (
      <select
        value={v ?? ""}
        onChange={(e) => onValue(e.target.value)}
        style={inputBase}
      >
        <option value="">-</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "select_dynamic") {
    const dep = field.depends_on || "category";
    const cat = row[dep];
    const options: string[] = (cat && subjectCourses[cat]) || [];
    return (
      <select
        value={v ?? ""}
        onChange={(e) => onValue(e.target.value)}
        style={inputBase}
        disabled={!cat}
      >
        <option value="">{cat ? "-" : "교과 먼저 선택"}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        value={v ?? ""}
        min={field.min}
        max={field.max}
        onChange={(e) => onValue(e.target.value)}
        style={inputBase}
      />
    );
  }

  // fallback text
  return (
    <input
      type="text"
      value={v ?? ""}
      onChange={(e) => onValue(e.target.value)}
      style={inputBase}
    />
  );
}

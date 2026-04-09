"use client";

/**
 * 학기 × 과목 × 필드 (원점수/평균/표준편차) 행렬 입력.
 *
 * 데이터 형식:
 * {
 *   "C1": { "exempt": false, "subjects": { "국어": {"raw_score": 85, "subject_avg": 70, "stdev": 12}, ... } },
 *   "C2": { "exempt": true, "exempt_reason": "free_semester" },
 *   ...
 * }
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
};

const headerCellStyle: CSSProperties = {
  ...cellStyle,
  background: "var(--gray-100)",
  fontWeight: 600,
  fontSize: 12,
};

const inputCellStyle: CSSProperties = {
  width: 64,
  padding: "4px 6px",
  border: "1px solid var(--gray-300)",
  borderRadius: 4,
  fontSize: 12,
  textAlign: "center",
};

export function SemesterGradeMatrix({ question, value, onChange }: Props) {
  const data: Record<string, any> = value && typeof value === "object" ? value : {};

  const setSemester = (key: string, semData: any) => {
    onChange({ ...data, [key]: semData });
  };

  const toggleExempt = (key: string, current: boolean, reason?: string) => {
    if (current) {
      setSemester(key, { exempt: false, subjects: data[key]?.subjects || {} });
    } else {
      setSemester(key, { exempt: true, exempt_reason: reason });
    }
  };

  const updateField = (semKey: string, subject: string, field: string, v: string) => {
    const semData = data[semKey] || { exempt: false, subjects: {} };
    const subjects = { ...(semData.subjects || {}) };
    subjects[subject] = { ...(subjects[subject] || {}), [field]: v === "" ? null : Number(v) };
    setSemester(semKey, { ...semData, subjects });
  };

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

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {question.semesters.map((sem: any) => {
          const semData = data[sem.key] || { exempt: false, subjects: {} };
          const exempt = !!semData.exempt;

          return (
            <div key={sem.key} style={{ border: "1px solid var(--gray-200)", borderRadius: 8, padding: 12, background: "white" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong style={{ fontSize: 14 }}>{sem.label}</strong>
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: "var(--gray-600)" }}>
                  <input
                    type="checkbox"
                    checked={exempt}
                    onChange={() => toggleExempt(sem.key, exempt, sem.exempt_reason)}
                  />
                  {sem.exempt_label || "해당 없음"}
                </label>
              </div>

              {!exempt && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 480 }}>
                    <thead>
                      <tr>
                        <th style={headerCellStyle}>과목</th>
                        {question.fields.map((f: any) => (
                          <th key={f.name} style={headerCellStyle}>
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {question.subjects.map((subj: string) => (
                        <tr key={subj}>
                          <td style={{ ...cellStyle, fontWeight: 600 }}>{subj}</td>
                          {question.fields.map((f: any) => {
                            const v = semData.subjects?.[subj]?.[f.name];
                            return (
                              <td key={f.name} style={cellStyle}>
                                <input
                                  type="number"
                                  value={v ?? ""}
                                  min={f.min}
                                  max={f.max}
                                  onChange={(e) => updateField(sem.key, subj, f.name, e.target.value)}
                                  style={inputCellStyle}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

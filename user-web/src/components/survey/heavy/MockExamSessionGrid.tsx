"use client";

/**
 * 모의고사 회차 × 영역 입력 (C1)
 *
 * 회차 목록은 DynamicSurvey가 사전 resolve 하여 question.resolved_sessions 로 주입.
 *   resolved_sessions: ["고1-3월", "고1-6월", ...]  (mock_exam_generation_rules[A4])
 *
 * 데이터 형식:
 * {
 *   "고1-3월": {
 *     "absent": false,
 *     "areas": {
 *       "korean":   { "rank": "2", "raw_score": 86, "percentile": 91 },
 *       "math":     { "rank": "3", "raw_score": 72, "percentile": 78 },
 *       "english":  { "rank": "1", "raw_score": 92 },
 *       "inquiry1": { "subject_name": "생활과 윤리", "rank": "2", "raw_score": 45, "percentile": 88 },
 *       "inquiry2": { "subject_name": "사회문화",   "rank": "3", "raw_score": 42, "percentile": 75 }
 *     }
 *   },
 *   "고1-6월": { "absent": true }
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
  width: 72,
  padding: "4px 6px",
  border: "1px solid var(--gray-300)",
  borderRadius: 4,
  fontSize: 12,
  textAlign: "center",
};

export function MockExamSessionGrid({ question, value, onChange }: Props) {
  const data: Record<string, any> =
    value && typeof value === "object" ? value : {};

  const sessions: string[] = Array.isArray(question.resolved_sessions)
    ? question.resolved_sessions
    : [];
  const areas: any[] = Array.isArray(question.areas) ? question.areas : [];
  const fieldSpecs: Record<string, any> = question.field_specs || {};
  const allowAbsent = question.absent_option !== false;

  const setSession = (sessionKey: string, next: any) => {
    onChange({ ...data, [sessionKey]: next });
  };

  const toggleAbsent = (sessionKey: string, current: boolean) => {
    if (current) {
      setSession(sessionKey, { absent: false, areas: {} });
    } else {
      setSession(sessionKey, { absent: true });
    }
  };

  const updateAreaField = (
    sessionKey: string,
    areaKey: string,
    fieldName: string,
    raw: string,
  ) => {
    const sd = data[sessionKey] || { absent: false, areas: {} };
    const areasObj = { ...(sd.areas || {}) };
    const cur = { ...(areasObj[areaKey] || {}) };
    const spec = fieldSpecs[fieldName] || {};
    if (raw === "") {
      cur[fieldName] = null;
    } else if (spec.type === "number") {
      const n = Number(raw);
      cur[fieldName] = Number.isNaN(n) ? null : n;
    } else {
      cur[fieldName] = raw;
    }
    areasObj[areaKey] = cur;
    setSession(sessionKey, { ...sd, absent: false, areas: areasObj });
  };

  const updateAreaSubjectName = (
    sessionKey: string,
    areaKey: string,
    name: string,
  ) => {
    const sd = data[sessionKey] || { absent: false, areas: {} };
    const areasObj = { ...(sd.areas || {}) };
    const cur = { ...(areasObj[areaKey] || {}) };
    cur.subject_name = name;
    areasObj[areaKey] = cur;
    setSession(sessionKey, { ...sd, absent: false, areas: areasObj });
  };

  if (sessions.length === 0) {
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
        상담 시점(A4)을 먼저 선택해주세요. 회차가 자동 생성됩니다.
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
        {sessions.map((sess) => {
          const sd = data[sess] || { absent: false, areas: {} };
          const absent = !!sd.absent;

          return (
            <div
              key={sess}
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
                <strong style={{ fontSize: 14 }}>{sess}</strong>
                {allowAbsent && (
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
                      checked={absent}
                      onChange={() => toggleAbsent(sess, absent)}
                    />
                    미응시
                  </label>
                )}
              </div>

              {!absent && (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      borderCollapse: "collapse",
                      width: "100%",
                      minWidth: 560,
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={headerCellStyle}>영역</th>
                        {/* 통합 헤더: 등급 / 원점수 / 백분위 (영역에 따라 백분위 없음) */}
                        <th style={headerCellStyle}>등급</th>
                        <th style={headerCellStyle}>원점수</th>
                        <th style={headerCellStyle}>백분위</th>
                      </tr>
                    </thead>
                    <tbody>
                      {areas.map((area) => {
                        const cur = sd.areas?.[area.key] || {};
                        const fields: string[] = Array.isArray(area.fields)
                          ? area.fields
                          : [];
                        const hasPercentile = fields.includes("percentile");

                        return (
                          <tr key={area.key}>
                            <td
                              style={{
                                ...cellStyle,
                                fontWeight: 600,
                                textAlign: "left",
                                padding: 8,
                              }}
                            >
                              <div>{area.label}</div>
                              {area.with_subject_name && (
                                <input
                                  type="text"
                                  value={cur.subject_name || ""}
                                  onChange={(e) =>
                                    updateAreaSubjectName(
                                      sess,
                                      area.key,
                                      e.target.value,
                                    )
                                  }
                                  placeholder="과목명"
                                  style={{
                                    marginTop: 4,
                                    width: 110,
                                    padding: "3px 6px",
                                    border: "1px solid var(--gray-300)",
                                    borderRadius: 4,
                                    fontSize: 11,
                                  }}
                                />
                              )}
                              {area.note && (
                                <div
                                  style={{
                                    fontSize: 10,
                                    color: "var(--gray-500)",
                                    marginTop: 2,
                                  }}
                                >
                                  {area.note}
                                </div>
                              )}
                            </td>

                            {/* 등급 (select) */}
                            <td style={cellStyle}>
                              {fields.includes("rank") ? (
                                <select
                                  value={cur.rank ?? ""}
                                  onChange={(e) =>
                                    updateAreaField(
                                      sess,
                                      area.key,
                                      "rank",
                                      e.target.value,
                                    )
                                  }
                                  style={{
                                    ...inputCellStyle,
                                    width: 60,
                                  }}
                                >
                                  <option value="">-</option>
                                  {(
                                    fieldSpecs.rank?.options || [
                                      "1",
                                      "2",
                                      "3",
                                      "4",
                                      "5",
                                      "6",
                                      "7",
                                      "8",
                                      "9",
                                    ]
                                  ).map((o: string) => (
                                    <option key={o} value={o}>
                                      {o}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span style={{ color: "var(--gray-400)" }}>
                                  -
                                </span>
                              )}
                            </td>

                            {/* 원점수 */}
                            <td style={cellStyle}>
                              {fields.includes("raw_score") ? (
                                <input
                                  type="number"
                                  value={cur.raw_score ?? ""}
                                  min={fieldSpecs.raw_score?.min ?? 0}
                                  max={fieldSpecs.raw_score?.max ?? 100}
                                  onChange={(e) =>
                                    updateAreaField(
                                      sess,
                                      area.key,
                                      "raw_score",
                                      e.target.value,
                                    )
                                  }
                                  style={inputCellStyle}
                                />
                              ) : (
                                <span style={{ color: "var(--gray-400)" }}>
                                  -
                                </span>
                              )}
                            </td>

                            {/* 백분위 */}
                            <td style={cellStyle}>
                              {hasPercentile ? (
                                <input
                                  type="number"
                                  value={cur.percentile ?? ""}
                                  min={fieldSpecs.percentile?.min ?? 0}
                                  max={fieldSpecs.percentile?.max ?? 100}
                                  onChange={(e) =>
                                    updateAreaField(
                                      sess,
                                      area.key,
                                      "percentile",
                                      e.target.value,
                                    )
                                  }
                                  style={inputCellStyle}
                                />
                              ) : (
                                <span style={{ color: "var(--gray-400)" }}>
                                  -
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
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

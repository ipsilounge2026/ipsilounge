"use client";

/**
 * 과목별 학습 현황 섹션 (E1~E4).
 *
 * subsections에 다양한 타입이 들어있다:
 *   radio_grid, select_grid, level_accuracy, mock_exam_grid, subject_progress_grid, composite, checkboxes
 *
 * 데이터 형식 (전체 question 값):
 * {
 *   "<subsection.key>": {
 *     // type별 다른 형식
 *     // radio_grid: { "item_label": "scale_value", ... }
 *     // select_grid: { "item": "value", ... }
 *     // level_accuracy: { "low": 80, "mid": 60, ... }
 *     // mock_exam_grid: { "고1": [{ year_month, rank }, ...], "none": true/false }
 *     // subject_progress_grid: { "통합과학1": { study_status, study_level }, ... }
 *     // composite: 일반 composite와 동일
 *   }
 * }
 */

import { CSSProperties } from "react";
import { CompositeField } from "../QuestionRenderer";

interface Props {
  question: any;
  value: any;
  onChange: (v: any) => void;
}

const subsectionWrapStyle: CSSProperties = {
  border: "1px solid var(--gray-200)",
  borderRadius: 8,
  padding: 12,
  background: "white",
  marginBottom: 12,
};

const cellStyle: CSSProperties = {
  padding: 6,
  border: "1px solid var(--gray-200)",
  fontSize: 12,
  textAlign: "center",
  background: "white",
};

const headerCellStyle: CSSProperties = {
  ...cellStyle,
  background: "var(--gray-100)",
  fontWeight: 600,
};

const subsectionTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--gray-800)",
  marginBottom: 8,
};

export function SubjectSection({ question, value, onChange }: Props) {
  const data: Record<string, any> = value && typeof value === "object" ? value : {};

  const updateSub = (key: string, v: any) => {
    onChange({ ...data, [key]: v });
  };

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "var(--primary-dark)" }}>
        {question.label}
      </div>
      <div>
        {question.subsections.map((sub: any) => (
          <div key={sub.key} style={subsectionWrapStyle}>
            <div style={subsectionTitleStyle}>{sub.label}</div>
            {sub.instruction && (
              <p style={{ fontSize: 11, color: "var(--gray-600)", marginBottom: 8 }}>{sub.instruction}</p>
            )}
            <SubsectionRenderer
              sub={sub}
              value={data[sub.key]}
              onChange={(v) => updateSub(sub.key, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SubsectionRenderer({ sub, value, onChange }: { sub: any; value: any; onChange: (v: any) => void }) {
  switch (sub.type) {
    case "radio_grid":
      return <RadioGrid sub={sub} value={value} onChange={onChange} />;
    case "select_grid":
      return <SelectGrid sub={sub} value={value} onChange={onChange} />;
    case "level_accuracy":
      return <LevelAccuracy sub={sub} value={value} onChange={onChange} />;
    case "mock_exam_grid":
      return <MockExamGrid sub={sub} value={value} onChange={onChange} />;
    case "subject_progress_grid":
      return <SubjectProgressGrid sub={sub} value={value} onChange={onChange} />;
    case "composite":
      return (
        <CompositeField
          question={{ ...sub, fields: sub.fields, label: undefined }}
          value={value}
          onChange={onChange}
        />
      );
    case "checkboxes":
      return <CheckboxesInline sub={sub} value={value} onChange={onChange} />;
    default:
      return (
        <div style={{ fontSize: 12, color: "#92400E" }}>[미구현 subsection 타입] {sub.type}</div>
      );
  }
}

// ===== radio_grid (행=item, 열=scale) =====
function RadioGrid({ sub, value, onChange }: { sub: any; value: any; onChange: (v: any) => void }) {
  const data: Record<string, string> = value && typeof value === "object" ? value : {};
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 480 }}>
        <thead>
          <tr>
            <th style={{ ...headerCellStyle, textAlign: "left" }}>항목</th>
            {sub.scale.map((s: any) => (
              <th key={s.value} style={headerCellStyle}>
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sub.items.map((item: string) => (
            <tr key={item}>
              <td style={{ ...cellStyle, textAlign: "left", fontSize: 12 }}>{item}</td>
              {sub.scale.map((s: any) => (
                <td key={s.value} style={cellStyle}>
                  <input
                    type="radio"
                    name={`${sub.key}_${item}`}
                    checked={data[item] === s.value}
                    onChange={() => onChange({ ...data, [item]: s.value })}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===== select_grid (각 item에 select) =====
function SelectGrid({ sub, value, onChange }: { sub: any; value: any; onChange: (v: any) => void }) {
  const data: Record<string, string> = value && typeof value === "object" ? value : {};
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
      {sub.items.map((item: string) => (
        <div key={item} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, flex: 1 }}>{item}</span>
          <select
            value={data[item] || ""}
            onChange={(e) => onChange({ ...data, [item]: e.target.value })}
            style={{ padding: "4px 6px", border: "1px solid var(--gray-300)", borderRadius: 4, fontSize: 12 }}
          >
            <option value="">-</option>
            {sub.options.map((opt: any) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

// ===== level_accuracy (상/중/하 정답률 입력) =====
function LevelAccuracy({ sub, value, onChange }: { sub: any; value: any; onChange: (v: any) => void }) {
  const data: Record<string, number | null> = value && typeof value === "object" ? value : {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {sub.levels.map((lv: any) => (
        <div key={lv.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, minWidth: 40 }}>{lv.label}</span>
          <span style={{ fontSize: 11, color: "var(--gray-500)", flex: 1 }}>{lv.examples}</span>
          <input
            type="number"
            min={0}
            max={100}
            value={data[lv.key] ?? ""}
            onChange={(e) => onChange({ ...data, [lv.key]: e.target.value === "" ? null : Number(e.target.value) })}
            style={{ width: 64, padding: "4px 6px", border: "1px solid var(--gray-300)", borderRadius: 4, fontSize: 12, textAlign: "center" }}
          />
          <span style={{ fontSize: 11, color: "var(--gray-600)" }}>%</span>
        </div>
      ))}
    </div>
  );
}

// ===== mock_exam_grid (학년별 모의고사 등급 입력) =====
function MockExamGrid({ sub, value, onChange }: { sub: any; value: any; onChange: (v: any) => void }) {
  const data: Record<string, any> = value && typeof value === "object" ? value : {};
  const none = !!data.none;

  const setNone = (v: boolean) => onChange({ ...data, none: v });

  const setEntry = (grade: string, idx: number, patch: any) => {
    const cur = [...(data[grade] || [])];
    cur[idx] = { ...cur[idx], ...patch };
    onChange({ ...data, [grade]: cur });
  };

  const addEntry = (grade: string) => {
    const cur = [...(data[grade] || [])];
    cur.push({ year_month: "", rank: "" });
    onChange({ ...data, [grade]: cur });
  };

  const removeEntry = (grade: string, idx: number) => {
    const cur = [...(data[grade] || [])];
    cur.splice(idx, 1);
    onChange({ ...data, [grade]: cur });
  };

  return (
    <div>
      {sub.none_option && (
        <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8, color: "var(--gray-600)" }}>
          <input type="checkbox" checked={none} onChange={(e) => setNone(e.target.checked)} />
          모의고사 응시 경험 없음
        </label>
      )}
      {!none && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sub.grades.map((grade: string) => {
            const list = (data[grade] || []) as any[];
            return (
              <div key={grade} style={{ padding: 8, background: "var(--gray-50)", borderRadius: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{grade}</div>
                {list.map((entry, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                    {sub.fields.map((f: any) => {
                      if (f.type === "select") {
                        return (
                          <select
                            key={f.name}
                            value={entry[f.name] || ""}
                            onChange={(e) => setEntry(grade, idx, { [f.name]: e.target.value })}
                            style={{ padding: "4px 6px", border: "1px solid var(--gray-300)", borderRadius: 4, fontSize: 11 }}
                          >
                            <option value="">{f.label}</option>
                            {f.options.map((o: string) => (
                              <option key={o} value={o}>
                                {o}등급
                              </option>
                            ))}
                          </select>
                        );
                      }
                      return (
                        <input
                          key={f.name}
                          type="text"
                          value={entry[f.name] || ""}
                          onChange={(e) => setEntry(grade, idx, { [f.name]: e.target.value })}
                          placeholder={f.placeholder || f.label}
                          style={{ padding: "4px 6px", border: "1px solid var(--gray-300)", borderRadius: 4, fontSize: 11, flex: 1 }}
                        />
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => removeEntry(grade, idx)}
                      style={{ padding: "2px 6px", border: "1px solid var(--gray-300)", borderRadius: 4, background: "white", cursor: "pointer", fontSize: 11, color: "#DC2626" }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addEntry(grade)}
                  style={{ padding: "4px 8px", border: "1px dashed var(--gray-400)", borderRadius: 4, background: "white", cursor: "pointer", fontSize: 11, color: "var(--gray-600)" }}
                >
                  + 추가
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===== subject_progress_grid =====
function SubjectProgressGrid({ sub, value, onChange }: { sub: any; value: any; onChange: (v: any) => void }) {
  const data: Record<string, any> = value && typeof value === "object" ? value : {};
  const update = (subj: string, patch: any) => {
    onChange({ ...data, [subj]: { ...(data[subj] || {}), ...patch } });
  };

  const evalShowWhen = (showWhen: any, current: any) => {
    if (!showWhen) return true;
    if (showWhen.in) return showWhen.in.includes(current?.[showWhen.field]);
    if (showWhen.equals !== undefined) return current?.[showWhen.field] === showWhen.equals;
    return true;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sub.subjects.map((subj: string) => {
        const cur = data[subj] || {};
        return (
          <div key={subj} style={{ padding: 8, background: "var(--gray-50)", borderRadius: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{subj}</div>
            {sub.fields.map((f: any) => {
              if (!evalShowWhen(f.show_when, cur)) return null;
              return (
                <div key={f.name} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: "var(--gray-600)", marginBottom: 4 }}>{f.label}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {f.options.map((opt: any) => {
                      const checked = cur[f.name] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => update(subj, { [f.name]: opt.value })}
                          style={{
                            padding: "3px 8px",
                            border: `1px solid ${checked ? "var(--primary)" : "var(--gray-300)"}`,
                            borderRadius: 12,
                            background: checked ? "var(--primary)" : "white",
                            color: checked ? "white" : "var(--gray-800)",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ===== checkboxes inline (간이) =====
function CheckboxesInline({ sub, value, onChange }: { sub: any; value: any; onChange: (v: any) => void }) {
  const list: string[] = Array.isArray(value) ? value : [];
  const toggle = (val: string, exclusive?: boolean) => {
    if (list.includes(val)) {
      onChange(list.filter((v) => v !== val));
      return;
    }
    if (exclusive) {
      onChange([val]);
      return;
    }
    const exclusives = (sub.options as any[]).filter((o) => o.exclusive).map((o) => o.value);
    const filtered = list.filter((v) => !exclusives.includes(v));
    onChange([...filtered, val]);
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {sub.options.map((opt: any) => {
        const checked = list.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value, opt.exclusive)}
            style={{
              padding: "5px 12px",
              border: `1px solid ${checked ? "var(--primary)" : "var(--gray-300)"}`,
              borderRadius: 14,
              background: checked ? "var(--primary)" : "white",
              color: checked ? "white" : "var(--gray-800)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

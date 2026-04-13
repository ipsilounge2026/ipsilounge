"use client";

/**
 * 질문 렌더러
 *
 * - 질문 타입(`type` 필드)에 따라 적절한 입력 컴포넌트를 렌더한다.
 * - 값/onChange 패턴: 모든 입력은 (value, onChange) 인터페이스로 통일.
 * - composite는 재귀 렌더(자식 필드도 동일 렌더러로 처리).
 * - 복잡한 web-only 컴포넌트(matrix/grid 등)는 별도 파일로 분리.
 */

import { CSSProperties, useState } from "react";
import { evaluateShowWhen } from "@/lib/surveyTypes";
import { SemesterGradeMatrix } from "./heavy/SemesterGradeMatrix";
import { WeeklySchedule } from "./heavy/WeeklySchedule";
import { SubjectSection } from "./heavy/SubjectSection";

interface RendererProps {
  question: any;
  value: any;
  onChange: (value: any) => void;
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--gray-300)",
  borderRadius: 8,
  fontSize: 14,
  background: "white",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 600,
  color: "var(--gray-800)",
  marginBottom: 6,
};

const instructionStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--gray-600)",
  marginBottom: 8,
  lineHeight: 1.5,
};

const noteStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--gray-500)",
  marginTop: 4,
};

export function QuestionRenderer({ question, value, onChange }: RendererProps) {
  // 일반 질문은 자체적인 show_when을 가지지 않음 (카테고리 안에서만 렌더)
  // 단, composite 내부에서는 evaluateShowWhen이 부모 컨텍스트로부터 값을 받아야 하므로
  // 여기서는 단순히 렌더만 처리
  switch (question.type) {
    case "text":
      return <TextField question={question} value={value} onChange={onChange} />;
    case "textarea":
      return <TextareaField question={question} value={value} onChange={onChange} />;
    case "number":
      return <NumberField question={question} value={value} onChange={onChange} />;
    case "radio":
      return <RadioField question={question} value={value} onChange={onChange} />;
    case "checkbox":
      return <CheckboxField question={question} value={value} onChange={onChange} />;
    case "checkboxes":
      return <CheckboxesField question={question} value={value} onChange={onChange} />;
    case "select":
      return <SelectField question={question} value={value} onChange={onChange} />;
    case "multi_select":
      return <MultiSelectField question={question} value={value} onChange={onChange} />;
    case "slider":
      return <SliderField question={question} value={value} onChange={onChange} />;
    case "text_list":
      return <TextListField question={question} value={value} onChange={onChange} />;
    case "rank":
      return <RankField question={question} value={value} onChange={onChange} />;
    case "group_select":
      return <GroupSelectField question={question} value={value} onChange={onChange} />;
    case "cascading_select":
      return <CascadingSelectField question={question} value={value} onChange={onChange} />;
    case "career_select":
      return <CareerSelectField question={question} value={value} onChange={onChange} />;
    case "composite":
      return <CompositeField question={question} value={value} onChange={onChange} />;
    case "subject_pick":
      return <SubjectPickField question={question} value={value} onChange={onChange} />;
    case "auto_calculated":
      return <AutoCalculatedField question={question} />;
    // ----- 무거운 web-only 컴포넌트 -----
    case "semester_grade_matrix":
      return <SemesterGradeMatrix question={question} value={value} onChange={onChange} />;
    case "weekly_schedule":
      return <WeeklySchedule question={question} value={value} onChange={onChange} />;
    case "subject_section":
      return <SubjectSection question={question} value={value} onChange={onChange} />;
    case "subject_study_method_panel":
      return <SubjectStudyMethodPanel question={question} value={value} onChange={onChange} />;
    default:
      return (
        <div style={{ padding: 12, background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, fontSize: 12, color: "#92400E" }}>
          [미구현 질문 타입] <code>{question.type}</code> — id: {question.id}
        </div>
      );
  }
}

// ===== 공통 헤더 =====
function QHeader({ question }: { question: any }) {
  return (
    <>
      {question.label && (
        <label style={labelStyle}>
          {question.label}
          {question.required && <span style={{ color: "#DC2626", marginLeft: 4 }}>*</span>}
        </label>
      )}
      {question.instruction && <p style={instructionStyle}>{question.instruction}</p>}
    </>
  );
}

// ===== text =====
function TextField({ question, value, onChange }: RendererProps) {
  return (
    <div>
      <QHeader question={question} />
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder}
        maxLength={question.max_length}
        style={inputStyle}
      />
      {question.note && <p style={noteStyle}>{question.note}</p>}
    </div>
  );
}

// ===== textarea =====
function TextareaField({ question, value, onChange }: RendererProps) {
  const len = (value || "").length;
  return (
    <div>
      <QHeader question={question} />
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder}
        rows={question.rows || 4}
        maxLength={question.max_length}
        style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
      />
      {question.max_length && (
        <div style={{ ...noteStyle, textAlign: "right" }}>
          {len} / {question.max_length}
        </div>
      )}
    </div>
  );
}

// ===== number =====
function NumberField({ question, value, onChange }: RendererProps) {
  return (
    <div>
      <QHeader question={question} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          min={question.min}
          max={question.max}
          step={question.step ?? 1}
          placeholder={question.placeholder}
          style={{ ...inputStyle, maxWidth: 200 }}
        />
        {question.unit && <span style={{ fontSize: 13, color: "var(--gray-600)" }}>{question.unit}</span>}
      </div>
    </div>
  );
}

// ===== radio =====
function RadioField({ question, value, onChange }: RendererProps) {
  return (
    <div>
      <QHeader question={question} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {question.options.map((opt: any) => (
          <label
            key={opt.value}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              border: `1px solid ${value === opt.value ? "var(--primary)" : "var(--gray-300)"}`,
              borderRadius: 8,
              cursor: "pointer",
              background: value === opt.value ? "var(--primary-light)" : "white",
              fontSize: 14,
            }}
          >
            <input
              type="radio"
              name={question.id}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              style={{ margin: 0 }}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ===== checkbox (단일 boolean) =====
function CheckboxField({ question, value, onChange }: RendererProps) {
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          {question.label_true || question.label}
          {question.required && <span style={{ color: "#DC2626", marginLeft: 4 }}>*</span>}
        </span>
      </label>
      {question.instruction && <p style={instructionStyle}>{question.instruction}</p>}
    </div>
  );
}

// ===== checkboxes (다중 체크) =====
function CheckboxesField({ question, value, onChange }: RendererProps) {
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
    // exclusive 옵션이 이미 선택되어 있으면 제거 후 새로 선택
    const exclusives = (question.options as any[])
      .filter((o) => o.exclusive)
      .map((o) => o.value);
    const filtered = list.filter((v) => !exclusives.includes(v));
    onChange([...filtered, val]);
  };

  return (
    <div>
      <QHeader question={question} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
        {question.options.map((opt: any) => {
          const checked = list.includes(opt.value);
          return (
            <label
              key={opt.value}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                border: `1px solid ${checked ? "var(--primary)" : "var(--gray-300)"}`,
                borderRadius: 8,
                cursor: "pointer",
                background: checked ? "var(--primary-light)" : "white",
                fontSize: 14,
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(opt.value, opt.exclusive)}
              />
              <span>{opt.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ===== select =====
function SelectField({ question, value, onChange }: RendererProps) {
  return (
    <div>
      <QHeader question={question} />
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        style={inputStyle}
      >
        <option value="">{question.placeholder || "선택하세요"}</option>
        {question.options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ===== multi_select (다중 선택; checkboxes와 유사하나 그리드 대신 칩 스타일) =====
function MultiSelectField({ question, value, onChange }: RendererProps) {
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
    const exclusives = (question.options as any[])
      .filter((o) => o.exclusive)
      .map((o) => o.value);
    const filtered = list.filter((v) => !exclusives.includes(v));
    onChange([...filtered, val]);
  };

  return (
    <div>
      <QHeader question={question} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {question.options.map((opt: any) => {
          const checked = list.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value, opt.exclusive)}
              style={{
                padding: "6px 14px",
                border: `1px solid ${checked ? "var(--primary)" : "var(--gray-300)"}`,
                borderRadius: 16,
                background: checked ? "var(--primary)" : "white",
                color: checked ? "white" : "var(--gray-800)",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: checked ? 600 : 400,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===== slider =====
function SliderField({ question, value, onChange }: RendererProps) {
  const v = typeof value === "number" ? value : question.min;
  return (
    <div>
      <QHeader question={question} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          type="range"
          min={question.min}
          max={question.max}
          step={question.step || 1}
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--primary)", minWidth: 32, textAlign: "center" }}>
          {v}
        </span>
      </div>
      {question.labels && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--gray-500)", marginTop: 4 }}>
          <span>{question.labels[String(question.min)] || ""}</span>
          <span>{question.labels[String(question.max)] || ""}</span>
        </div>
      )}
    </div>
  );
}

// ===== text_list (가변 길이 텍스트 배열) =====
function TextListField({ question, value, onChange }: RendererProps) {
  const list: string[] = Array.isArray(value) ? value : [];
  const max = question.max_items || 10;

  const updateAt = (idx: number, v: string) => {
    const copy = [...list];
    copy[idx] = v;
    onChange(copy);
  };

  const removeAt = (idx: number) => {
    onChange(list.filter((_, i) => i !== idx));
  };

  const add = () => {
    if (list.length < max) onChange([...list, ""]);
  };

  return (
    <div>
      <QHeader question={question} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {list.map((item, idx) => (
          <div key={idx} style={{ display: "flex", gap: 6 }}>
            <input
              type="text"
              value={item}
              onChange={(e) => updateAt(idx, e.target.value)}
              placeholder={question.placeholder}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => removeAt(idx)}
              style={{
                padding: "0 12px",
                border: "1px solid var(--gray-300)",
                borderRadius: 8,
                background: "white",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--gray-600)",
              }}
            >
              삭제
            </button>
          </div>
        ))}
        {list.length < max && (
          <button
            type="button"
            onClick={add}
            style={{
              padding: "8px 12px",
              border: "1px dashed var(--gray-400)",
              borderRadius: 8,
              background: "white",
              cursor: "pointer",
              fontSize: 13,
              color: "var(--gray-600)",
            }}
          >
            + 항목 추가 ({list.length}/{max})
          </button>
        )}
      </div>
    </div>
  );
}

// ===== rank (순위 선택) =====
function RankField({ question, value, onChange }: RendererProps) {
  const picks: string[] = Array.isArray(value) ? value : [];
  const max = question.max_picks || 5;

  const togglePick = (val: string) => {
    if (picks.includes(val)) {
      onChange(picks.filter((v) => v !== val));
      return;
    }
    if (picks.length >= max) return;
    onChange([...picks, val]);
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const copy = [...picks];
    [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
    onChange(copy);
  };

  const moveDown = (idx: number) => {
    if (idx === picks.length - 1) return;
    const copy = [...picks];
    [copy[idx + 1], copy[idx]] = [copy[idx], copy[idx + 1]];
    onChange(copy);
  };

  return (
    <div>
      <QHeader question={question} />

      {picks.length > 0 && (
        <div style={{ marginBottom: 12, padding: 12, background: "var(--primary-light)", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "var(--primary-dark)", marginBottom: 6, fontWeight: 600 }}>
            선택된 순위 ({picks.length}/{max})
          </div>
          {picks.map((p, idx) => {
            const opt = (question.options as any[]).find((o) => o.value === p);
            return (
              <div
                key={p}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  background: "white",
                  borderRadius: 6,
                  marginBottom: 4,
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 700, color: "var(--primary)", minWidth: 24 }}>{idx + 1}.</span>
                <span style={{ flex: 1 }}>{opt?.label || p}</span>
                <button
                  type="button"
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  style={{ padding: "2px 6px", fontSize: 11, cursor: idx === 0 ? "default" : "pointer", border: "1px solid var(--gray-300)", borderRadius: 4, background: "white" }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(idx)}
                  disabled={idx === picks.length - 1}
                  style={{ padding: "2px 6px", fontSize: 11, cursor: idx === picks.length - 1 ? "default" : "pointer", border: "1px solid var(--gray-300)", borderRadius: 4, background: "white" }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => togglePick(p)}
                  style={{ padding: "2px 6px", fontSize: 11, cursor: "pointer", border: "1px solid var(--gray-300)", borderRadius: 4, background: "white", color: "#DC2626" }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {(question.options as any[])
          .filter((opt) => !picks.includes(opt.value))
          .map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => togglePick(opt.value)}
              disabled={picks.length >= max}
              style={{
                padding: "6px 14px",
                border: "1px solid var(--gray-300)",
                borderRadius: 16,
                background: "white",
                fontSize: 13,
                cursor: picks.length >= max ? "not-allowed" : "pointer",
                opacity: picks.length >= max ? 0.5 : 1,
              }}
            >
              {opt.label}
              {opt.group && (
                <span style={{ marginLeft: 4, fontSize: 11, color: "var(--gray-500)" }}>· {opt.group}</span>
              )}
            </button>
          ))}
      </div>
    </div>
  );
}

// ===== group_select (그룹별 1개 선택) =====
function GroupSelectField({ question, value, onChange }: RendererProps) {
  const map: Record<string, string> = value && typeof value === "object" ? value : {};

  return (
    <div>
      <QHeader question={question} />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {question.groups.map((g: any) => (
          <div key={g.id} style={{ padding: 12, background: "var(--gray-50)", borderRadius: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{g.label}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {g.options.map((opt: any) => {
                const selected = map[g.id] === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange({ ...map, [g.id]: opt.value })}
                    style={{
                      padding: "5px 12px",
                      border: `1px solid ${selected ? "var(--primary)" : "var(--gray-300)"}`,
                      borderRadius: 14,
                      background: selected ? "var(--primary)" : "white",
                      color: selected ? "white" : "var(--gray-800)",
                      fontSize: 12,
                      cursor: "pointer",
                      fontWeight: selected ? 600 : 400,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== cascading_select (시·도 / 시·군·구) =====
// 주의: 실제 지역 옵션은 별도 API/상수가 있을 수 있으나, 여기서는 자유 입력 fallback으로 처리
function CascadingSelectField({ question, value, onChange }: RendererProps) {
  const obj = (value && typeof value === "object") ? value : {};

  return (
    <div>
      <QHeader question={question} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
        {question.levels.map((lv: any) => (
          <div key={lv.name}>
            <div style={{ fontSize: 12, color: "var(--gray-600)", marginBottom: 4 }}>{lv.label}</div>
            <input
              type="text"
              value={obj[lv.name] || ""}
              onChange={(e) => onChange({ ...obj, [lv.name]: e.target.value })}
              placeholder={lv.label}
              style={inputStyle}
            />
          </div>
        ))}
      </div>
      {question.note && <p style={noteStyle}>{question.note}</p>}
    </div>
  );
}

// ===== career_select (계열 자동 매핑) =====
function CareerSelectField({ question, value, onChange }: RendererProps) {
  const picks: string[] = Array.isArray(value) ? value : [];
  const [openCat, setOpenCat] = useState<string | null>(null);

  const toggle = (val: string) => {
    if (picks.includes(val)) {
      onChange(picks.filter((v) => v !== val));
    } else {
      onChange([...picks, val]);
    }
  };

  return (
    <div>
      <QHeader question={question} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {question.categories.map((cat: any) => {
          const isOpen = openCat === cat.key;
          const subPicks = (cat.subcategories as string[]).filter((s) => picks.includes(s));
          return (
            <div key={cat.key} style={{ border: "1px solid var(--gray-300)", borderRadius: 8, overflow: "hidden" }}>
              <button
                type="button"
                onClick={() => setOpenCat(isOpen ? null : cat.key)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: isOpen ? "var(--primary-light)" : "white",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span>
                  {cat.label}
                  <span style={{ marginLeft: 6, fontSize: 11, color: "var(--gray-500)", fontWeight: 400 }}>
                    · {cat.mapped_track}
                  </span>
                  {subPicks.length > 0 && (
                    <span style={{ marginLeft: 6, color: "var(--primary-dark)" }}>({subPicks.length})</span>
                  )}
                </span>
                <span>{isOpen ? "▼" : "▶"}</span>
              </button>
              {isOpen && cat.subcategories.length > 0 && (
                <div style={{ padding: 10, display: "flex", flexWrap: "wrap", gap: 6, background: "var(--gray-50)" }}>
                  {cat.subcategories.map((sub: string) => {
                    const checked = picks.includes(sub);
                    return (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => toggle(sub)}
                        style={{
                          padding: "5px 10px",
                          border: `1px solid ${checked ? "var(--primary)" : "var(--gray-300)"}`,
                          borderRadius: 14,
                          background: checked ? "var(--primary)" : "white",
                          color: checked ? "white" : "var(--gray-800)",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        {sub}
                      </button>
                    );
                  })}
                </div>
              )}
              {isOpen && cat.subcategories.length === 0 && (
                <div style={{ padding: 10, fontSize: 12, color: "var(--gray-500)", background: "var(--gray-50)" }}>
                  하위 항목이 없습니다. (탐색 중 카테고리)
                  <div style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => toggle(cat.key)}
                      style={{
                        padding: "5px 10px",
                        border: `1px solid ${picks.includes(cat.key) ? "var(--primary)" : "var(--gray-300)"}`,
                        borderRadius: 14,
                        background: picks.includes(cat.key) ? "var(--primary)" : "white",
                        color: picks.includes(cat.key) ? "white" : "var(--gray-800)",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      이 카테고리 선택
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== composite (재귀) =====
export function CompositeField({ question, value, onChange }: RendererProps) {
  const obj = value && typeof value === "object" ? value : {};

  const updateField = (name: string, v: any) => {
    onChange({ ...obj, [name]: v });
  };

  const renderField = (field: any) => {
    if (!evaluateShowWhen(field.show_when, obj)) return null;

    // 필드를 question 형식으로 변환
    const subQuestion = {
      ...field,
      id: field.name,
      label: field.label,
    };

    return (
      <div key={field.name} style={{ marginBottom: 12 }}>
        <QuestionRenderer
          question={subQuestion}
          value={obj[field.name]}
          onChange={(v) => updateField(field.name, v)}
        />
      </div>
    );
  };

  return (
    <div>
      <QHeader question={question} />
      <div style={{ padding: 14, background: "var(--gray-50)", borderRadius: 8 }}>
        {question.fields.map(renderField)}
      </div>
    </div>
  );
}

// ===== subject_pick =====
function SubjectPickField({ question, value, onChange }: RendererProps) {
  const picks: string[] = Array.isArray(value) ? value : [];
  const max = question.max_picks || 2;

  const toggle = (s: string) => {
    if (picks.includes(s)) {
      onChange(picks.filter((p) => p !== s));
      return;
    }
    if (picks.length >= max) return;
    onChange([...picks, s]);
  };

  return (
    <div>
      <QHeader question={question} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {question.subject_pool.map((s: string) => {
          const checked = picks.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              disabled={!checked && picks.length >= max}
              style={{
                padding: "8px 16px",
                border: `1px solid ${checked ? "var(--primary)" : "var(--gray-300)"}`,
                borderRadius: 20,
                background: checked ? "var(--primary)" : "white",
                color: checked ? "white" : "var(--gray-800)",
                fontSize: 14,
                cursor: !checked && picks.length >= max ? "not-allowed" : "pointer",
                fontWeight: checked ? 600 : 400,
                opacity: !checked && picks.length >= max ? 0.5 : 1,
              }}
            >
              {s}
            </button>
          );
        })}
      </div>
      <p style={noteStyle}>최대 {max}개 선택</p>
    </div>
  );
}

// ===== subject_study_method_panel (D7 과목별 학습법) =====
function SubjectStudyMethodPanel({ question, value, onChange }: RendererProps) {
  const data: Record<string, any> = value && typeof value === "object" ? value : {};
  const subjects: string[] = question.default_subjects || [];
  // TODO: extra_subjects_from으로 D6에서 취약 과목 가져오기는 DynamicSurvey 레벨에서 처리 필요
  const allSubjects = [...new Set([...subjects, ...Object.keys(data).filter(k => k !== "_meta")])];
  const questionsPerSubject: any[] = question.questions_per_subject || [];
  const isDelta = question.delta === "diff_view_change_check";

  const updateSubject = (subject: string, fieldName: string, fieldValue: any) => {
    const subData = { ...(data[subject] || {}) };
    subData[fieldName] = fieldValue;
    onChange({ ...data, [subject]: subData });
  };

  const setChangeStatus = (subject: string, status: string) => {
    const subData = { ...(data[subject] || {}) };
    subData._change_status = status;
    if (status === "완전변경") {
      // Clear all fields except _change_status
      const cleared: Record<string, any> = { _change_status: status };
      onChange({ ...data, [subject]: cleared });
    } else {
      onChange({ ...data, [subject]: subData });
    }
  };

  return (
    <div>
      <QHeader question={question} />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {allSubjects.map((subject) => {
          const subData = data[subject] || {};
          const changeStatus = subData._change_status;
          const hasPrevData = isDelta && Object.keys(subData).some(k => k !== "_change_status" && subData[k] != null);

          return (
            <div
              key={subject}
              style={{
                border: "1px solid var(--gray-200)",
                borderRadius: 10,
                overflow: "hidden",
                background: "white",
              }}
            >
              {/* 과목 헤더 */}
              <div style={{
                padding: "10px 14px",
                background: "var(--gray-50)",
                borderBottom: "1px solid var(--gray-200)",
                fontSize: 14,
                fontWeight: 700,
                color: "var(--primary-dark)",
              }}>
                {subject}
              </div>

              {/* Delta 변경 확인 UI */}
              {isDelta && hasPrevData && !changeStatus && (
                <div style={{
                  padding: 14,
                  background: "#FFFBEB",
                  borderBottom: "1px solid #FDE68A",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#92400E", marginBottom: 8 }}>
                    이전 상담에서 입력한 학습 방법이 있습니다. 변경 사항을 확인해주세요.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      { value: "유지", label: "그대로 유지", desc: "이전과 동일", bg: "#F0FDF4", border: "#BBF7D0", color: "#166534" },
                      { value: "일부변경", label: "일부 변경", desc: "일부 항목 수정", bg: "#EFF6FF", border: "#BFDBFE", color: "#1E40AF" },
                      { value: "완전변경", label: "완전히 바꿈", desc: "처음부터 다시", bg: "#FEF2F2", border: "#FECACA", color: "#991B1B" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setChangeStatus(subject, opt.value)}
                        style={{
                          flex: 1,
                          minWidth: 100,
                          padding: "10px 12px",
                          border: `2px solid ${opt.border}`,
                          borderRadius: 8,
                          background: opt.bg,
                          cursor: "pointer",
                          textAlign: "center",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: opt.color }}>{opt.label}</div>
                        <div style={{ fontSize: 11, color: opt.color, opacity: 0.7, marginTop: 2 }}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 변경 상태 표시 + 재선택 */}
              {isDelta && changeStatus && (
                <div style={{
                  padding: "8px 14px",
                  background: changeStatus === "유지" ? "#F0FDF4" : changeStatus === "일부변경" ? "#EFF6FF" : "#FEF2F2",
                  borderBottom: "1px solid var(--gray-200)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <span style={{
                    fontSize: 12, fontWeight: 600,
                    color: changeStatus === "유지" ? "#166534" : changeStatus === "일부변경" ? "#1E40AF" : "#991B1B",
                  }}>
                    {changeStatus === "유지" ? "이전 학습법 유지" : changeStatus === "일부변경" ? "일부 항목 변경 중" : "새로 입력 중"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setChangeStatus(subject, "")}
                    style={{
                      fontSize: 11, color: "var(--gray-500)", background: "transparent",
                      border: "none", cursor: "pointer", textDecoration: "underline",
                    }}
                  >
                    다시 선택
                  </button>
                </div>
              )}

              {/* 질문 필드 (유지 선택 시 읽기전용) */}
              {(!isDelta || !hasPrevData || changeStatus) && (
                <div style={{
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  ...(changeStatus === "유지" ? { opacity: 0.6, pointerEvents: "none" as const } : {}),
                }}>
                  {questionsPerSubject.map((q: any) => {
                    const fieldKey = q.name;
                    const fieldValue = subData[fieldKey];

                    if (q.type === "checkboxes") {
                      const selected: string[] = Array.isArray(fieldValue) ? fieldValue : [];
                      return (
                        <div key={fieldKey}>
                          <div style={labelStyle}>{q.label}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {q.options.map((opt: any) => {
                              const isChecked = selected.includes(opt.value);
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => {
                                    const next = isChecked
                                      ? selected.filter((v) => v !== opt.value)
                                      : [...selected, opt.value];
                                    updateSubject(subject, fieldKey, next);
                                  }}
                                  style={{
                                    padding: "6px 12px", fontSize: 13, borderRadius: 6,
                                    border: `1px solid ${isChecked ? "var(--primary)" : "var(--gray-300)"}`,
                                    background: isChecked ? "var(--primary)" : "white",
                                    color: isChecked ? "white" : "var(--gray-700)",
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
                    }

                    if (q.type === "radio") {
                      return (
                        <div key={fieldKey}>
                          <div style={labelStyle}>{q.label}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {q.options.map((opt: any) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => updateSubject(subject, fieldKey, opt.value)}
                                style={{
                                  padding: "6px 12px", fontSize: 13, borderRadius: 6,
                                  border: `1px solid ${fieldValue === opt.value ? "var(--primary)" : "var(--gray-300)"}`,
                                  background: fieldValue === opt.value ? "var(--primary)" : "white",
                                  color: fieldValue === opt.value ? "white" : "var(--gray-700)",
                                  cursor: "pointer",
                                }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    if (q.type === "text") {
                      return (
                        <div key={fieldKey}>
                          <div style={labelStyle}>{q.label}</div>
                          <input
                            style={inputStyle}
                            placeholder={q.placeholder || ""}
                            value={fieldValue || ""}
                            onChange={(e) => updateSubject(subject, fieldKey, e.target.value)}
                          />
                        </div>
                      );
                    }

                    if (q.type === "composite") {
                      const compData = (fieldValue && typeof fieldValue === "object") ? fieldValue : {};
                      return (
                        <div key={fieldKey}>
                          <div style={labelStyle}>{q.label}</div>
                          <div style={{ padding: 10, background: "var(--gray-50)", borderRadius: 6 }}>
                            {q.fields.map((f: any) => {
                              // show_when 평가
                              if (f.show_when) {
                                const refVal = compData[f.show_when.field];
                                if (refVal !== f.show_when.equals) return null;
                              }
                              if (f.type === "radio") {
                                return (
                                  <div key={f.name} style={{ marginBottom: 8 }}>
                                    {f.label && <div style={{ ...labelStyle, fontSize: 12 }}>{f.label}</div>}
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                      {f.options.map((opt: any) => (
                                        <button
                                          key={opt.value}
                                          type="button"
                                          onClick={() => updateSubject(subject, fieldKey, { ...compData, [f.name]: opt.value })}
                                          style={{
                                            padding: "5px 10px", fontSize: 12, borderRadius: 6,
                                            border: `1px solid ${compData[f.name] === opt.value ? "var(--primary)" : "var(--gray-300)"}`,
                                            background: compData[f.name] === opt.value ? "var(--primary)" : "white",
                                            color: compData[f.name] === opt.value ? "white" : "var(--gray-700)",
                                            cursor: "pointer",
                                          }}
                                        >
                                          {opt.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }
                              if (f.type === "text") {
                                return (
                                  <div key={f.name} style={{ marginBottom: 8 }}>
                                    {f.label && <div style={{ ...labelStyle, fontSize: 12 }}>{f.label}</div>}
                                    <input
                                      style={{ ...inputStyle, fontSize: 13 }}
                                      placeholder={f.placeholder || ""}
                                      value={compData[f.name] || ""}
                                      onChange={(e) => updateSubject(subject, fieldKey, { ...compData, [f.name]: e.target.value })}
                                    />
                                  </div>
                                );
                              }
                              return null;
                            })}
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== auto_calculated (디스플레이만) =====
function AutoCalculatedField({ question }: { question: any }) {
  return (
    <div style={{ padding: 14, background: "var(--gray-50)", border: "1px dashed var(--gray-300)", borderRadius: 8 }}>
      {question.label && (
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", marginBottom: 6 }}>
          {question.label}
        </div>
      )}
      {question.instruction && <p style={{ ...instructionStyle, marginBottom: 8 }}>{question.instruction}</p>}
      <ul style={{ paddingLeft: 18, fontSize: 12, color: "var(--gray-600)", margin: 0 }}>
        {(question.calculations || []).map((c: any) => (
          <li key={c.name}>{c.label}</li>
        ))}
      </ul>
    </div>
  );
}

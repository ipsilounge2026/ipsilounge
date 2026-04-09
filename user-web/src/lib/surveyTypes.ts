/**
 * 사전 상담 설문 (Consultation Survey) 공통 타입 정의
 *
 * 백엔드 JSON 스키마(`backend/app/surveys/schemas/*.json`)와 1:1로 매핑된다.
 * 새 질문 타입을 추가할 때는 이 파일과 `components/survey/QuestionRenderer.tsx`를 함께 수정한다.
 */

export type Platform = "web" | "mobile";
export type Fatigue = "light" | "heavy";
export type CategoryStatus = "not_started" | "in_progress" | "skipped" | "completed";

// ----- 옵션 -----
export interface Option {
  value: string;
  label: string;
  exclusive?: boolean;
  group?: string;
}

// ----- 조건부 표시 -----
export interface ShowWhen {
  field: string;
  equals?: string | number | boolean;
  in?: (string | number | boolean)[];
}

// ----- 모든 질문이 공유하는 베이스 -----
export interface QuestionBase {
  id: string;
  type: string;
  label?: string;
  instruction?: string;
  note?: string;
  required?: boolean;
  show_when?: ShowWhen;
}

// ----- 구체 질문 타입 -----
export interface TextQuestion extends QuestionBase {
  type: "text";
  placeholder?: string;
  max_length?: number;
}

export interface TextareaQuestion extends QuestionBase {
  type: "textarea";
  placeholder?: string;
  max_length?: number;
  rows?: number;
}

export interface NumberQuestion extends QuestionBase {
  type: "number";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
}

export interface RadioQuestion extends QuestionBase {
  type: "radio";
  options: Option[];
}

export interface CheckboxQuestion extends QuestionBase {
  type: "checkbox";
  label_true?: string;
}

export interface CheckboxesQuestion extends QuestionBase {
  type: "checkboxes";
  options: Option[];
  min_items?: number;
  max_items?: number;
}

export interface SelectQuestion extends QuestionBase {
  type: "select";
  options: Option[];
  placeholder?: string;
}

export interface MultiSelectQuestion extends QuestionBase {
  type: "multi_select";
  options: Option[];
  min_items?: number;
  max_items?: number;
}

export interface SliderQuestion extends QuestionBase {
  type: "slider";
  min: number;
  max: number;
  step?: number;
  labels?: Record<string, string>;
}

export interface TextListQuestion extends QuestionBase {
  type: "text_list";
  max_items?: number;
  placeholder?: string;
}

export interface RankQuestion extends QuestionBase {
  type: "rank";
  options: Option[];
  max_picks: number;
}

export interface GroupSelectQuestion extends QuestionBase {
  type: "group_select";
  groups: { id: string; label: string; options: Option[] }[];
}

export interface CascadingSelectQuestion extends QuestionBase {
  type: "cascading_select";
  levels: {
    name: string;
    label: string;
    options_source: string;
    depends_on?: string;
  }[];
}

export interface CareerSelectQuestion extends QuestionBase {
  type: "career_select";
  categories: {
    key: string;
    label: string;
    mapped_track: string;
    subcategories: string[];
  }[];
}

export interface CompositeQuestion extends QuestionBase {
  type: "composite";
  fields: AnyField[];
}

// composite 내부 필드 (질문과 거의 같은 구조)
export interface AnyField {
  name: string;
  type: string;
  label?: string;
  options?: Option[];
  min?: number;
  max?: number;
  step?: number;
  show_when?: ShowWhen;
  fields?: AnyField[];
  unit?: string;
}

// ----- 무거운 질문 (web only) -----
export interface SemesterGradeMatrixQuestion extends QuestionBase {
  type: "semester_grade_matrix";
  semesters: { key: string; label: string; exempt_label?: string; exempt_reason?: string }[];
  subjects: string[];
  fields: { name: string; label: string; type: string; min?: number; max?: number; required?: boolean }[];
}

export interface AutoCalculatedQuestion extends QuestionBase {
  type: "auto_calculated";
  calculations: { name: string; label: string; rules?: string }[];
}

export interface SubjectPickQuestion extends QuestionBase {
  type: "subject_pick";
  subject_pool: string[];
  max_picks: number;
}

export interface WeeklyScheduleQuestion extends QuestionBase {
  type: "weekly_schedule";
  days: string[];
  categories: { key: string; label: string }[];
  fields_per_entry: AnyField[];
  auto_calculations?: string[];
}

export interface SubjectSectionQuestion extends QuestionBase {
  type: "subject_section";
  subject: string;
  subsections: SubsectionDef[];
}

export interface SubsectionDef {
  key: string;
  label: string;
  type: string;
  scale?: { value: string; label: string }[];
  items?: string[];
  options?: Option[];
  fields?: AnyField[];
  levels?: { key: string; label: string; examples?: string }[];
  field?: AnyField;
  grades?: string[];
  none_option?: boolean;
  subjects?: string[];
  instruction?: string;
}

// ----- 카테고리 / 스키마 -----
export interface Category {
  id: string;
  order: number;
  title: string;
  description?: string;
  estimated_time_minutes?: [number, number];
  fatigue?: Fatigue;
  platforms?: Platform[];
  skippable?: boolean;
  respondent?: string;
  questions: any[]; // 다양한 질문 타입 union
}

export interface SurveySchema {
  id: string;
  version: string;
  title: string;
  target?: string;
  estimated_time_minutes?: [number, number];
  source_doc?: string;
  subject_codes?: Record<string, string>;
  categories: Category[];
}

// ----- 백엔드 응답 -----
export interface SurveyResponseData {
  id: string;
  user_id: string;
  survey_type: string;
  timing: string | null;
  mode: string;
  answers: Record<string, any>;
  category_status: Record<string, CategoryStatus>;
  status: string;
  last_category: string | null;
  last_question: string | null;
  started_platform: string;
  last_edited_platform: string;
  schema_version: string;
  booking_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
}

// ----- show_when 평가 헬퍼 -----
export function evaluateShowWhen(
  showWhen: ShowWhen | undefined,
  values: Record<string, any>
): boolean {
  if (!showWhen) return true;
  const v = values[showWhen.field];
  if (showWhen.equals !== undefined) return v === showWhen.equals;
  if (showWhen.in !== undefined) return showWhen.in.includes(v);
  return true;
}

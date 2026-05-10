-- 상담 기록 카테고리 리뉴얼: Enum → String + 새 필드 추가
-- 실행 (수동 적용 필요 시): psql -U ipsilounge -d ipsilounge -f update_consultation_notes_categories.sql
-- ※ `sudo -u postgres` 로 실행하지 말 것 (소유권 비일관 유발 — 2026-05-10 사고 사례).

-- 1. category 컬럼을 VARCHAR로 변경 (Enum → String)
ALTER TABLE consultation_notes
  ALTER COLUMN category TYPE VARCHAR(30) USING category::text;

-- 2. student_grade 컬럼을 VARCHAR로 변경
ALTER TABLE consultation_notes
  ALTER COLUMN student_grade TYPE VARCHAR(20) USING student_grade::text;

-- 3. timing 컬럼 추가 (학업 상담 시점: T1/T2/T3/T4)
ALTER TABLE consultation_notes ADD COLUMN IF NOT EXISTS timing VARCHAR(10);

-- 4. topic_notes JSONB 컬럼 추가 (카테고리별 주제 기록)
ALTER TABLE consultation_notes ADD COLUMN IF NOT EXISTS topic_notes JSONB;

-- 5. 기존 카테고리 값을 새 체계로 매핑
UPDATE consultation_notes SET category = 'academic' WHERE category IN ('study_method', 'school_life', 'career');
UPDATE consultation_notes SET category = 'record' WHERE category = 'analysis';
UPDATE consultation_notes SET category = 'admission' WHERE category = 'strategy';
UPDATE consultation_notes SET category = 'mental' WHERE category = 'mental';
UPDATE consultation_notes SET category = 'other' WHERE category = 'other';

-- 6. main_content NOT NULL 제약을 유지하되 빈 문자열 허용
ALTER TABLE consultation_notes ALTER COLUMN main_content SET DEFAULT '';

-- 7. Enum 타입 정리 (더 이상 사용하지 않음)
DROP TYPE IF EXISTS consultationcategory CASCADE;
DROP TYPE IF EXISTS studentstatus CASCADE;

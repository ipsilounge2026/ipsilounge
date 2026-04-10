-- 상담사 검토/수정 + 고1 전환 데이터 연계를 위한 DB 마이그레이션
-- 실행: psql -d ipsilounge -f add_counselor_overrides_and_conversion.sql

-- 1. 상담사 초안 편집 (자동 분석 결과 수정값)
ALTER TABLE consultation_surveys ADD COLUMN IF NOT EXISTS counselor_overrides JSONB;

-- 2. 상담사 체크리스트 (상담 전 확인 사항, 리포트 미포함)
ALTER TABLE consultation_surveys ADD COLUMN IF NOT EXISTS counselor_checklist JSONB;

-- 3. 전환 원본 설문 ID (예비고1 → 고1 전환 시)
ALTER TABLE consultation_surveys ADD COLUMN IF NOT EXISTS source_survey_id UUID REFERENCES consultation_surveys(id) ON DELETE SET NULL;

-- 4. 보존 데이터 (예비고1 E영역 등, 비교 상담용)
ALTER TABLE consultation_surveys ADD COLUMN IF NOT EXISTS preserved_data JSONB;

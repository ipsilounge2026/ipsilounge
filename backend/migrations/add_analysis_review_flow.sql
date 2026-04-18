-- Phase C (2026-04-17): 학생부 분석 검수 흐름
-- 실행: psql -d ipsilounge -f add_analysis_review_flow.sql
--
-- 변경 내용:
--   1. status 상태 전이 확장: applied → uploaded → processing → review → completed
--      - review: Claude 리포트 업로드 완료 → 관리자 검수 대기
--      - review 에서 "확인 완료" → completed
--      - review 에서 "재분석 요청" → processing (재분석 루프)
--   2. review_feedback TEXT: 관리자가 "재분석 요청" 시 선택적으로 입력하는 피드백
--   3. reviewed_at TIMESTAMP: Claude 가 리포트 업로드하여 review 상태로 진입한 시각
--
-- status 값은 VARCHAR(20) 그대로 유지. ENUM 이 아니므로 추가만 하면 됨.

-- 1. review_feedback 컬럼 추가
ALTER TABLE analysis_orders ADD COLUMN IF NOT EXISTS review_feedback TEXT;

-- 2. reviewed_at 컬럼 추가
ALTER TABLE analysis_orders ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

-- 3. (검증용) 현재 status 값 분포 확인
-- SELECT status, COUNT(*) FROM analysis_orders GROUP BY status;

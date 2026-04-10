-- 상담 기록 불변 정책: 수정/삭제 불가, 추가 기록만 가능
-- 실행: sudo -u postgres psql -d ipsilounge -f add_consultation_note_addenda.sql

-- 1. 추가 기록 필드 (append-only JSONB 배열)
ALTER TABLE consultation_notes ADD COLUMN IF NOT EXISTS addenda JSONB;

-- 2. updated_at 컬럼 삭제 (수정 불가이므로 불필요)
ALTER TABLE consultation_notes DROP COLUMN IF EXISTS updated_at;

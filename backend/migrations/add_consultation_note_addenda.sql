-- 상담 기록 불변 정책: 수정/삭제 불가, 추가 기록만 가능
-- 실행 (수동 적용 필요 시): psql -U ipsilounge -d ipsilounge -f add_consultation_note_addenda.sql
-- ※ `sudo -u postgres` 로 실행하지 말 것 (소유권 비일관 유발 — 2026-05-10 사고 사례).
--   본 파일의 ALTER 는 이미 main.py 자동 마이그레이션에 반영되었을 수 있으므로
--   실제로는 백엔드 startup 만으로 적용된다.

-- 1. 추가 기록 필드 (append-only JSONB 배열)
ALTER TABLE consultation_notes ADD COLUMN IF NOT EXISTS addenda JSONB;

-- 2. updated_at 컬럼 삭제 (수정 불가이므로 불필요)
ALTER TABLE consultation_notes DROP COLUMN IF EXISTS updated_at;

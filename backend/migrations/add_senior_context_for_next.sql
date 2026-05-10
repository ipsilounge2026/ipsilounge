-- 선배 상담 기록에 context_for_next 필드 추가
-- 다음 상담자(선배/상담사)에게 전달할 맥락 요약
-- 실행 (수동 적용 필요 시): psql -U ipsilounge -d ipsilounge -f add_senior_context_for_next.sql
-- ※ `sudo -u postgres` 로 실행하지 말 것 (소유권 비일관 유발 — 2026-05-10 사고 사례).
--   본 ALTER 는 main.py 자동 마이그레이션에 반영되었을 수 있다.

ALTER TABLE senior_consultation_notes ADD COLUMN IF NOT EXISTS context_for_next TEXT;

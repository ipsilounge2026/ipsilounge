-- 선배 상담 기록에 context_for_next 필드 추가
-- 다음 상담자(선배/상담사)에게 전달할 맥락 요약
-- 실행: sudo -u postgres psql -d ipsilounge -f add_senior_context_for_next.sql

ALTER TABLE senior_consultation_notes ADD COLUMN IF NOT EXISTS context_for_next TEXT;

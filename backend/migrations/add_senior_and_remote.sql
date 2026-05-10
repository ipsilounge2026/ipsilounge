-- 선배 매칭 + 대면/비대면 상담 지원을 위한 DB 마이그레이션
--
-- ⚠️ 운영 환경에서는 이 파일을 직접 실행하지 말 것.
--    senior_student_assignments / senior_change_requests 두 테이블은
--    SQLAlchemy 모델이 정의되어 있으므로 백엔드 startup 시
--    `_check_and_migrate()` 의 `Base.metadata.create_all()` 가 자동 생성한다.
--    `mode` / `meeting_url` 컬럼도 main.py 자동 마이그레이션 블록에서 처리.
--
-- 만약 굳이 수동 실행이 필요한 경우(예: 로컬 디버깅)에는
--   psql -U ipsilounge -d ipsilounge -f add_senior_and_remote.sql
-- 처럼 **반드시 ipsilounge 유저로 실행**할 것. `sudo -u postgres` 로 실행하면
-- 테이블 소유자가 postgres 가 되어 앱 유저(ipsilounge) 가 SELECT 도 못 하는
-- InsufficientPrivilegeError 가 발생함 (실제 사고 사례: 2026-05-10).

-- 1. 학생-선배 매칭 테이블
CREATE TABLE IF NOT EXISTS senior_student_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    senior_id UUID NOT NULL REFERENCES admins(id),
    user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. 선배 변경 요청 테이블
CREATE TABLE IF NOT EXISTS senior_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    current_senior_id UUID REFERENCES admins(id),
    requested_senior_id UUID REFERENCES admins(id),
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    admin_memo TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP
);

-- 3. 상담 예약에 대면/비대면 필드 추가
ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS mode VARCHAR(20) DEFAULT 'in_person';
ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS meeting_url TEXT;

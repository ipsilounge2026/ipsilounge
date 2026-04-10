-- 선배 매칭 + 대면/비대면 상담 지원을 위한 DB 마이그레이션
-- 실행: sudo -u postgres psql -d ipsilounge -f add_senior_and_remote.sql

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

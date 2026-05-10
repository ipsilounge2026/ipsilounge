-- 정시 입결 데이터 테이블 생성
--
-- ⚠️ 운영 환경에서는 이 파일을 직접 실행하지 말 것.
--    `JeongsiAdmissionData` SQLAlchemy 모델이 정의되어 있어 백엔드 startup 시
--    `Base.metadata.create_all()` 가 자동 생성한다.
--    데이터 적재만 필요한 경우 `python scripts/import_admission_data.py` 사용.
--
-- 수동 실행이 필요한 경우 **반드시 ipsilounge 유저로 실행**:
--   psql -U ipsilounge -d ipsilounge -f add_jeongsi_admission_data.sql
-- `sudo -u postgres psql` 으로 실행하면 테이블 소유자가 postgres 가 되어
-- 앱 유저(ipsilounge) 가 SELECT 도 못 하는 InsufficientPrivilegeError 가 발생함
-- (실제 사고 사례: 2026-05-10).

CREATE TABLE IF NOT EXISTS jeongsi_admission_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier VARCHAR(50),
    field VARCHAR(100),
    general_local VARCHAR(50),
    category2 VARCHAR(50),
    track VARCHAR(50),
    university VARCHAR(100) NOT NULL,
    major VARCHAR(200) NOT NULL,
    year INTEGER NOT NULL,
    gun VARCHAR(10),
    initial_count INTEGER,
    transfer_count INTEGER,
    final_count INTEGER,
    applicants INTEGER,
    competition_rate DOUBLE PRECISION,
    chu_hap INTEGER,
    chung_won_rate DOUBLE PRECISION,
    converted_score DOUBLE PRECISION,
    percentile_70 DOUBLE PRECISION,
    univ_percentile DOUBLE PRECISION,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_jeongsi_admission_data_university ON jeongsi_admission_data(university);
CREATE INDEX IF NOT EXISTS ix_jeongsi_admission_data_major ON jeongsi_admission_data(major);
CREATE INDEX IF NOT EXISTS ix_jeongsi_admission_data_year ON jeongsi_admission_data(year);
CREATE INDEX IF NOT EXISTS ix_jeongsi_admission_data_tier ON jeongsi_admission_data(tier);
CREATE INDEX IF NOT EXISTS ix_jeongsi_admission_data_track ON jeongsi_admission_data(track);

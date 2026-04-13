-- 정시 입결 데이터 테이블 생성
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

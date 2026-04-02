-- 신청/업로드 분리를 위한 DB 마이그레이션
-- 실행: psql -d ipsilounge -f add_service_type_and_uploaded_at.sql

-- 1. service_type 컬럼 추가
ALTER TABLE analysis_orders ADD COLUMN IF NOT EXISTS service_type VARCHAR(20) DEFAULT '학생부라운지';

-- 2. uploaded_at 컬럼 추가
ALTER TABLE analysis_orders ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP;

-- 3. school_record_url, school_record_filename을 nullable로 변경
ALTER TABLE analysis_orders ALTER COLUMN school_record_url DROP NOT NULL;
ALTER TABLE analysis_orders ALTER COLUMN school_record_filename DROP NOT NULL;

-- 4. 기존 'pending' 상태 데이터를 'uploaded'로 변경 (이미 파일이 업로드된 건이므로)
UPDATE analysis_orders SET status = 'uploaded' WHERE status = 'pending';

-- 5. 기존 데이터의 uploaded_at을 created_at으로 설정 (이미 업로드된 건)
UPDATE analysis_orders SET uploaded_at = created_at WHERE uploaded_at IS NULL AND school_record_url IS NOT NULL;

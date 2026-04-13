-- Add roadmap_progress column to consultation_surveys
ALTER TABLE consultation_surveys
    ADD COLUMN IF NOT EXISTS roadmap_progress JSONB;

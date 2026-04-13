-- Add sharing_settings and content_checklist columns to senior_consultation_notes
ALTER TABLE senior_consultation_notes
    ADD COLUMN IF NOT EXISTS sharing_settings JSONB,
    ADD COLUMN IF NOT EXISTS content_checklist JSONB;

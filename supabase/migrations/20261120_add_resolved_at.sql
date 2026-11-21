-- ============================================================
-- Migration: add resolved_at to reports
-- Records the exact timestamp when a report is marked RESOLVED.
-- Compatible with existing rows (nullable — NULL = not yet resolved).
-- ============================================================

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;

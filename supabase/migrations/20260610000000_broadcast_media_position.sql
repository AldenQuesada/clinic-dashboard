-- ============================================================
-- Migration: Add media_position to wa_broadcasts
-- ============================================================

ALTER TABLE wa_broadcasts ADD COLUMN IF NOT EXISTS media_position text DEFAULT 'above';

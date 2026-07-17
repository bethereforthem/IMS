-- ============================================================================
-- Supabase Storage — field-media bucket
-- Run this single statement in the Supabase SQL Editor.
-- The upload route uses the service_role key (bypasses RLS), and the bucket
-- is marked public so getPublicUrl() works without signing.
-- No manual policy creation is needed.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'field-media',
  'field-media',
  true,
  52428800,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

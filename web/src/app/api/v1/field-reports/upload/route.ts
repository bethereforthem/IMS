import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

const BUCKET = 'field-media'
const MAX_BYTES = 50 * 1024 * 1024 // 50 MB per file
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
])

// ---------------------------------------------------------------------------
// POST /api/v1/field-reports/upload
// Accepts a single multipart/form-data file upload from the mobile agent.
// Stores the file in the Supabase Storage "field-media" bucket under a
// path scoped to the authenticated agent, and returns the public URL.
//
// The "field-media" bucket must be created in Supabase dashboard as PUBLIC
// (or with a signed-URL policy) before this endpoint will work.
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload }) => {
  try {
    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.startsWith('multipart/form-data')) {
      return apiError('Request must be multipart/form-data', 400)
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return apiError('No file in form data (field: "file")', 400)

    if (!ALLOWED_MIME.has(file.type)) {
      return apiError(`File type not allowed: ${file.type}`, 415)
    }

    if (file.size > MAX_BYTES) {
      return apiError(`File exceeds 50 MB limit`, 413)
    }

    const ext = file.name.split('.').pop() ?? 'bin'
    const ts  = Date.now()
    const path = `${user.user_id}/${ts}.${ext}`

    const supabase = createServerSupabaseClient()
    const arrayBuffer = await file.arrayBuffer()

    const { error: uploadErr } = await supabase
      .storage
      .from(BUCKET)
      .upload(path, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadErr) {
      console.error('[field-reports/upload POST] storage error', uploadErr)
      return apiError('Storage upload failed: ' + uploadErr.message, 500)
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)

    return apiSuccess({ url: urlData.publicUrl, path }, 201)
  } catch (err) {
    console.error('[field-reports/upload POST]', err)
    return apiError('Internal server error', 500)
  }
}) // auth-only

import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'

// ---------------------------------------------------------------------------
// POST /api/v1/cases/[id]/suspects  — link a suspect to a case
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const caseId = params?.id
    if (!caseId) return apiError('Case ID is required', 400)

    const body = await req.json()
    const { suspect_id, role } = body

    if (!suspect_id) {
      return apiError('suspect_id is required', 400)
    }

    const supabase = createServerSupabaseClient()

    // Verify both case and suspect exist
    const [{ data: caseRecord }, { data: suspect }] = await Promise.all([
      supabase.from('cases').select('id').eq('id', caseId).single(),
      supabase.from('suspects').select('id').eq('id', suspect_id).single(),
    ])

    if (!caseRecord) return apiError('Case not found', 404)
    if (!suspect) return apiError('Suspect not found', 404)

    const { error } = await supabase
      .from('case_suspects')
      .insert({
        case_id: caseId,
        suspect_id,
        role: role ?? null,
        added_at: new Date().toISOString(),
      })

    if (error) {
      // Duplicate link — treat as idempotent success
      if (error.code === '23505') {
        return apiSuccess({ message: 'Suspect already linked to case' })
      }
      console.error('[POST /api/v1/cases/[id]/suspects]', error)
      return apiError('Failed to link suspect to case', 500)
    }

    await logAudit({
      event_type: 'CASE_SUSPECT_LINKED',
      action: 'CREATE',
      actor: user,
      target_type: 'case',
      target_id: caseId,
    })

    return apiSuccess({ message: 'Suspect linked to case' }, 201)
  } catch (err) {
    console.error('[POST /api/v1/cases/[id]/suspects]', err)
    return apiError('Internal server error', 500)
  }
}, 'cases:write')

// ---------------------------------------------------------------------------
// DELETE /api/v1/cases/[id]/suspects  — unlink a suspect from a case
// ---------------------------------------------------------------------------
export const DELETE = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const caseId = params?.id
    if (!caseId) return apiError('Case ID is required', 400)

    const body = await req.json()
    const { suspect_id } = body

    if (!suspect_id) {
      return apiError('suspect_id is required', 400)
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('case_suspects')
      .delete()
      .eq('case_id', caseId)
      .eq('suspect_id', suspect_id)

    if (error) {
      console.error('[DELETE /api/v1/cases/[id]/suspects]', error)
      return apiError('Failed to unlink suspect from case', 500)
    }

    await logAudit({
      event_type: 'CASE_SUSPECT_REMOVED',
      action: 'DELETE',
      actor: user,
      target_type: 'case',
      target_id: caseId,
    })

    return apiSuccess({ message: 'Suspect removed from case' })
  } catch (err) {
    console.error('[DELETE /api/v1/cases/[id]/suspects]', err)
    return apiError('Internal server error', 500)
  }
}, 'cases:write')

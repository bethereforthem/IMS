import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'

// ---------------------------------------------------------------------------
// GET /api/v1/suspects/[id]/warrants
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const suspectId = params?.id
    if (!suspectId) return apiError('Suspect ID is required', 400)

    const supabase = createServerSupabaseClient()

    const { data: warrants, error } = await supabase
      .from('warrants')
      .select('*')
      .eq('suspect_id', suspectId)
      .order('issued_at', { ascending: false })

    if (error) {
      console.error('[GET /api/v1/suspects/[id]/warrants]', error)
      return apiError('Failed to fetch warrants', 500)
    }

    return apiSuccess({ warrants: warrants ?? [] })
  } catch (err) {
    console.error('[GET /api/v1/suspects/[id]/warrants]', err)
    return apiError('Internal server error', 500)
  }
}, 'suspects:read')

// ---------------------------------------------------------------------------
// POST /api/v1/suspects/[id]/warrants
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const suspectId = params?.id
    if (!suspectId) return apiError('Suspect ID is required', 400)

    const body = await req.json()
    const {
      warrant_type,
      charges,
      issued_by_court,
      case_reference,
      expires_at,
      priority,
      notes,
    } = body

    if (!warrant_type || !charges) {
      return apiError('warrant_type and charges are required', 400)
    }

    const supabase = createServerSupabaseClient()

    // Verify suspect exists
    const { data: suspect, error: suspectError } = await supabase
      .from('suspects')
      .select('id')
      .eq('id', suspectId)
      .single()

    if (suspectError || !suspect) {
      return apiError('Suspect not found', 404)
    }

    const { data: warrant, error } = await supabase
      .from('warrants')
      .insert({
        suspect_id: suspectId,
        warrant_type,
        charges,
        issued_by: user.institution,
        issued_by_court: issued_by_court ?? null,
        case_reference: case_reference ?? null,
        issued_at: new Date().toISOString(),
        expires_at: expires_at ?? null,
        active: true,
        priority: priority ?? 'MEDIUM',
        notes: notes ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[POST /api/v1/suspects/[id]/warrants]', error)
      return apiError('Failed to create warrant', 500)
    }

    await logAudit({
      event_type: 'WARRANT_ISSUED',
      action: 'CREATE',
      actor: user,
      target_type: 'warrant',
      target_id: warrant.id,
      after_state: warrant,
    })

    return apiSuccess(warrant, 201)
  } catch (err) {
    console.error('[POST /api/v1/suspects/[id]/warrants]', err)
    return apiError('Internal server error', 500)
  }
}, 'suspects:write')

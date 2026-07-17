import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'

// ---------------------------------------------------------------------------
// GET /api/v1/cases/[id]/report
// ---------------------------------------------------------------------------
export const GET = withAuth(async (_req: NextRequest, { user, params }) => {
  const caseId = (params as { id: string }).id
  try {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('investigation_reports')
      .select('*')
      .eq('case_id', caseId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('[GET /api/v1/cases/:id/report]', error)
      return apiError('Failed to fetch report', 500)
    }

    return apiSuccess(data ?? null)
  } catch (err) {
    console.error('[GET /api/v1/cases/:id/report]', err)
    return apiError('Internal server error', 500)
  }
}, 'cases:read')

// ---------------------------------------------------------------------------
// PUT /api/v1/cases/[id]/report  — upsert draft or submit
// ---------------------------------------------------------------------------
export const PUT = withAuth(async (req: NextRequest, { user, params }) => {
  const caseId = (params as { id: string }).id
  try {
    const body = await req.json()
    const { report_data, status } = body as { report_data: Record<string, unknown>; status?: string }

    if (!report_data) return apiError('report_data is required', 400)

    const supabase = createServerSupabaseClient()

    const payload: Record<string, unknown> = {
      case_id: caseId,
      report_data,
      updated_at: new Date().toISOString(),
    }

    if (status) {
      payload.status = status
      if (status === 'SUBMITTED') {
        payload.submitted_by = user.user_id
        payload.submitted_at = new Date().toISOString()
      }
    }

    const { data: existing } = await supabase
      .from('investigation_reports')
      .select('id')
      .eq('case_id', caseId)
      .single()

    let result
    if (existing) {
      const { data, error } = await supabase
        .from('investigation_reports')
        .update(payload)
        .eq('case_id', caseId)
        .select()
        .single()
      if (error) {
        console.error('[PUT /api/v1/cases/:id/report] update', error)
        return apiError('Failed to save report', 500)
      }
      result = data
    } else {
      payload.created_by = user.user_id
      const { data, error } = await supabase
        .from('investigation_reports')
        .insert(payload)
        .select()
        .single()
      if (error) {
        console.error('[PUT /api/v1/cases/:id/report] insert', error)
        return apiError('Failed to save report', 500)
      }
      result = data
    }

    await logAudit({
      event_type: status === 'SUBMITTED' ? 'REPORT_SUBMITTED' : 'REPORT_SAVED',
      action: status === 'SUBMITTED' ? 'SUBMIT' : 'UPDATE',
      actor: user,
      target_type: 'investigation_report',
      target_id: result.id,
      after_state: { case_id: caseId, status: result.status },
    })

    return apiSuccess(result)
  } catch (err) {
    console.error('[PUT /api/v1/cases/:id/report]', err)
    return apiError('Internal server error', 500)
  }
}, 'cases:write')

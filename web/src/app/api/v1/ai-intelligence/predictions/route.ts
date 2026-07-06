import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

// GET /api/v1/ai-intelligence/predictions
// Returns the most recent completed prediction run for the caller's institution.
export const GET = withAuth(
  async (req: NextRequest, { user }: { user: AuthPayload }) => {
    const db = createServerSupabaseClient()
    const { searchParams } = new URL(req.url)
    const runId = searchParams.get('run_id')
    const institution = user.institution

    // Find the run to use
    let resolvedRunId = runId
    if (!resolvedRunId) {
      const { data: latest } = await db
        .from('ai_prediction_runs')
        .select('id, completed_at, total_incidents_analyzed, status')
        .eq('institution', institution)
        .eq('status', 'COMPLETED')
        .order('completed_at', { ascending: false })
        .limit(1)
        .single()

      if (!latest) {
        return apiSuccess({
          run: null,
          predictions: [],
          insights: [],
          has_data: false,
          message: 'No predictions available. Run an analysis first.',
        })
      }
      resolvedRunId = latest.id
    }

    const [
      { data: run },
      { data: predictions },
      { data: insights },
    ] = await Promise.all([
      db.from('ai_prediction_runs')
        .select('id, institution, total_incidents_analyzed, time_window_days, completed_at, created_at, status')
        .eq('id', resolvedRunId)
        .single(),
      db.from('ai_predictions')
        .select('*')
        .eq('run_id', resolvedRunId)
        .order('rank'),
      db.from('ai_insight_cache')
        .select('*')
        .eq('run_id', resolvedRunId)
        .gt('expires_at', new Date().toISOString())
        .order('priority', { ascending: false }),
    ])

    if (!run) return apiError('Prediction run not found', 404)

    // Also check if there's a newer run in progress
    const { data: inProgress } = await db
      .from('ai_prediction_runs')
      .select('id, created_at')
      .eq('institution', institution)
      .eq('status', 'RUNNING')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return apiSuccess({
      run,
      predictions: predictions ?? [],
      insights: insights ?? [],
      has_data: (predictions?.length ?? 0) > 0,
      analysis_in_progress: !!inProgress,
    })
  },
  'ai_intelligence:read'
)

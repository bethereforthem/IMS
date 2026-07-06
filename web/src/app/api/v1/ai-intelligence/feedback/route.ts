import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

// POST /api/v1/ai-intelligence/feedback
// Commanders mark predictions accurate/inaccurate — feeds the accuracy metric.
export const POST = withAuth(
  async (req: NextRequest, { user }: { user: AuthPayload }) => {
    const db = createServerSupabaseClient()

    let body: Record<string, unknown>
    try { body = await req.json() } catch { return apiError('Invalid JSON', 400) }

    const { prediction_id, accurate, accuracy_rating, notes, actual_event_id } = body as {
      prediction_id: string
      accurate: boolean
      accuracy_rating?: number
      notes?: string
      actual_event_id?: string
    }

    if (!prediction_id || typeof accurate !== 'boolean') {
      return apiError('prediction_id and accurate (boolean) are required', 400)
    }

    // Verify the prediction belongs to this institution
    const { data: pred } = await db
      .from('ai_predictions')
      .select('id, run_id, institution')
      .eq('id', prediction_id)
      .single()

    if (!pred) return apiError('Prediction not found', 404)
    if (pred.institution !== user.institution) return apiError('Cross-institution access denied', 403)

    // Upsert: one feedback per user per prediction
    const { error } = await db
      .from('ai_prediction_feedback')
      .upsert({
        prediction_id,
        run_id: pred.run_id,
        submitted_by: user.user_id,
        badge_number: user.badge_number,
        institution: user.institution,
        accurate,
        accuracy_rating: accuracy_rating ?? null,
        notes: notes ?? null,
        actual_event_id: actual_event_id ?? null,
      }, { onConflict: 'prediction_id,submitted_by' })

    if (error) return apiError('Failed to save feedback', 500)

    // Recalculate and update institution accuracy in insight cache (fire-and-forget)
    recalcAccuracy(db, user.institution).catch(console.error)

    return apiSuccess({ recorded: true, accurate })
  },
  'ai_intelligence:read'
)

async function recalcAccuracy(
  db: ReturnType<typeof createServerSupabaseClient>,
  institution: string,
) {
  const { data } = await db
    .from('ai_prediction_feedback')
    .select('accurate')
    .eq('institution', institution)
    .limit(500)

  if (!data || data.length < 3) return
  const accuracy = data.filter(r => r.accurate).length / data.length

  // Get the latest run for this institution
  const { data: run } = await db
    .from('ai_prediction_runs')
    .select('id')
    .eq('institution', institution)
    .eq('status', 'COMPLETED')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single()

  if (!run) return

  // Upsert an accuracy insight
  await db.from('ai_insight_cache').upsert({
    run_id: run.id,
    institution,
    insight_type: 'RISK_OVERVIEW',
    title: 'Prediction Accuracy',
    content: `Current model accuracy based on ${data.length} commander feedback submissions: ${(accuracy * 100).toFixed(0)}%. ${accuracy >= 0.7 ? 'Predictions are reliable.' : accuracy >= 0.5 ? 'Predictions are moderately reliable — continue submitting feedback.' : 'Model is learning — more feedback will improve accuracy.'}`,
    priority: 'LOW',
    expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  }, { onConflict: 'run_id,institution,insight_type,title' })
}

import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

/** Severity order for `ai_insight_cache.priority`, which is stored as text. */
const INSIGHT_PRIORITY_RANK: Record<string, number> = {
  LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3,
}

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
        // With no completed run, the panel used to show a bare "No Predictions
        // Yet" even when the last attempt had failed with a recorded reason.
        // Report that reason — the RNP run failed with "No spatial clusters
        // found", which an operator can act on; "no predictions" is not.
        const [{ data: lastFailure }, { data: firstRunning }] = await Promise.all([
          db.from('ai_prediction_runs')
            .select('created_at, error_message')
            .eq('institution', institution)
            .eq('status', 'FAILED')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          // A very first analysis has no completed run to compare against, and
          // this branch never reported one as running — so the panel would not
          // start polling and the result only appeared on a manual reload.
          db.from('ai_prediction_runs')
            .select('id')
            .eq('institution', institution)
            .eq('status', 'RUNNING')
            .limit(1)
            .maybeSingle(),
        ])

        return apiSuccess({
          run: null,
          predictions: [],
          insights: [],
          has_data: false,
          analysis_in_progress: !!firstRunning,
          last_failure: lastFailure ?? null,
          message: lastFailure?.error_message
            ? `The most recent analysis did not complete: ${lastFailure.error_message}`
            : 'No predictions available. Run an analysis first.',
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
        // model_version and claude_model are what the run actually used. They
        // were omitted here, so the panel had nothing to display and printed a
        // hardcoded model name instead.
        .select('id, institution, total_incidents_analyzed, time_window_days, completed_at, created_at, status, model_version, claude_model')
        .eq('id', resolvedRunId)
        .single(),
      db.from('ai_predictions')
        .select('*')
        .eq('run_id', resolvedRunId)
        .order('rank'),
      db.from('ai_insight_cache')
        .select('*')
        .eq('run_id', resolvedRunId)
        .gt('expires_at', new Date().toISOString()),
    ])

    if (!run) return apiError('Prediction run not found', 404)

    // `priority` is a text column, so ordering it in the database sorted
    // alphabetically — descending that gives MEDIUM, LOW, HIGH, CRITICAL, which
    // buried the critical insights at the bottom of the list. Rank by severity.
    const sortedInsights = [...(insights ?? [])].sort(
      (a, b) => (INSIGHT_PRIORITY_RANK[b.priority] ?? -1) - (INSIGHT_PRIORITY_RANK[a.priority] ?? -1)
    )

    // Also check if there's a newer run in progress
    const { data: inProgress } = await db
      .from('ai_prediction_runs')
      .select('id, created_at')
      .eq('institution', institution)
      .eq('status', 'RUNNING')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Predictions carry a `valid_until` (24h from the run) but nothing ever
    // consulted it, so a run from weeks ago was served to the panel with no
    // indication it had expired — under a footer that says "Predictions valid
    // for 24h". Report the expiry rather than dropping the rows: an analyst
    // needs to see that the last assessment is stale, not an empty page.
    const validUntil = (predictions ?? [])
      .map(p => p.valid_until as string | null)
      .filter(Boolean)
      .sort()
      .pop() ?? null
    const stale = validUntil ? new Date(validUntil).getTime() < Date.now() : false

    return apiSuccess({
      run,
      predictions: predictions ?? [],
      insights: sortedInsights,
      has_data: (predictions?.length ?? 0) > 0,
      analysis_in_progress: !!inProgress,
      valid_until: validUntil,
      stale,
    })
  },
  'ai_intelligence:read'
)

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import {
  runFullAnalysis,
  type RawIncident,
  type HotspotCluster,
} from '@/lib/crimeAnalysis'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'
// Analysis can take time — raise timeout ceiling
export const maxDuration = 60

const WINDOW_DAYS = 90

// ── Helpers ──────────────────────────────────────────────────────────────────

function riskLevel(score: number): string {
  return score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW'
}

async function getFeedbackAccuracy(
  db: ReturnType<typeof createServerSupabaseClient>,
  institution: string,
): Promise<number> {
  const { data } = await db
    .from('ai_prediction_feedback')
    .select('accurate')
    .eq('institution', institution)
    .limit(200)
  if (!data || data.length === 0) return 0.7  // optimistic default
  const correct = data.filter(r => r.accurate).length
  return correct / data.length
}

// ── POST /api/v1/ai-intelligence/analyze ─────────────────────────────────────

export const POST = withAuth(
  async (req: NextRequest, { user }: { user: AuthPayload }) => {
    const db = createServerSupabaseClient()
    const ctx = extractAuditContext(req)

    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch { /* optional body */ }

    const forceRefresh = body.force_refresh === true
    const institution  = user.institution

    // ── Check for a recent completed run (< 6 hours) unless forced ────────
    if (!forceRefresh) {
      const { data: recent } = await db
        .from('ai_prediction_runs')
        .select('id, completed_at')
        .eq('institution', institution)
        .eq('status', 'COMPLETED')
        .gte('completed_at', new Date(Date.now() - 6 * 3600 * 1000).toISOString())
        .order('completed_at', { ascending: false })
        .limit(1)
        .single()

      if (recent) {
        // Return the cached predictions
        const { data: predictions } = await db
          .from('ai_predictions')
          .select('*')
          .eq('run_id', recent.id)
          .order('rank')
        const { data: insights } = await db
          .from('ai_insight_cache')
          .select('*')
          .eq('run_id', recent.id)
          .gt('expires_at', new Date().toISOString())
          .order('priority', { ascending: false })
        return apiSuccess({ cached: true, run_id: recent.id, predictions: predictions ?? [], insights: insights ?? [] })
      }
    }

    // ── Create a prediction run record ────────────────────────────────────
    const { data: run, error: runErr } = await db
      .from('ai_prediction_runs')
      .insert({
        triggered_by: user.user_id,
        triggered_by_badge: user.badge_number,
        institution,
        time_window_days: WINDOW_DAYS,
        status: 'RUNNING',
      })
      .select('id')
      .single()

    if (runErr || !run) return apiError('Failed to create prediction run', 500)
    const runId = run.id

    try {
      // ── Fetch incidents ─────────────────────────────────────────────────
      const windowStart = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()

      // Field reports (primary data source for field intelligence)
      const { data: reports } = await db
        .from('field_reports')
        .select('id, title, category, priority, location_lat, location_lng, incident_date, created_at')
        .gte('created_at', windowStart)
        .not('location_lat', 'is', null)
        .not('location_lng', 'is', null)
        .limit(2000)

      // Intelligence events (CCTV, NID scans with criminal records)
      const { data: events } = await db
        .from('intelligence_events')
        .select('id, source_tag, location_lat, location_lng, event_timestamp, criminal_record_found')
        .gte('event_timestamp', windowStart)
        .eq('criminal_record_found', true)
        .not('location_lat', 'is', null)
        .limit(1000)

      // Merge into RawIncident array
      const incidents: RawIncident[] = [
        ...(reports ?? []).map(r => ({
          id: r.id,
          location_lat: r.location_lat as number,
          location_lng: r.location_lng as number,
          category: r.category as string,
          priority: r.priority as string,
          created_at: r.incident_date ?? r.created_at,
          title: r.title as string,
          institution,
        })),
        ...(events ?? []).map(e => ({
          id: e.id,
          location_lat: e.location_lat as number,
          location_lng: e.location_lng as number,
          category: 'OFFICER_REPORT',
          priority: 'MEDIUM',
          created_at: e.event_timestamp as string,
          institution,
        })),
      ]

      await db.from('ai_prediction_runs').update({ total_incidents_analyzed: incidents.length }).eq('id', runId)

      if (incidents.length === 0) {
        await db.from('ai_prediction_runs').update({ status: 'FAILED', error_message: 'No geolocated incidents found', completed_at: new Date().toISOString() }).eq('id', runId)
        return apiError('No geolocated incidents found in the past 90 days. Submit field reports with GPS coordinates to enable AI predictions.', 400)
      }

      // ── Run statistical analysis ────────────────────────────────────────
      const feedbackAccuracy = await getFeedbackAccuracy(db, institution)
      const { clusters, temporal, categories, prompt } = runFullAnalysis(
        incidents, WINDOW_DAYS, feedbackAccuracy, institution
      )

      if (clusters.length === 0) {
        await db.from('ai_prediction_runs').update({ status: 'FAILED', error_message: 'No spatial clusters found', completed_at: new Date().toISOString() }).eq('id', runId)
        return apiError('Insufficient spatial concentration of incidents to generate predictions. More field reports with GPS data are needed.', 400)
      }

      // ── Call Claude for natural-language analysis ───────────────────────
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

      const anthropic = new Anthropic({ apiKey })
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      })

      await db.from('ai_prediction_runs').update({ claude_model: 'claude-sonnet-4-6' }).eq('id', runId)

      // Parse Claude response
      const rawContent = (message.content[0] as { type: string; text: string }).text
      let claudeOutput: {
        hotspots: Array<{
          cluster_index: number
          explanation: string
          patrol_recommendation: string
          preventive_actions: string[]
        }>
        insights: Array<{
          type: string
          title: string
          content: string
          priority: string
        }>
      }

      try {
        // Strip any accidental markdown fences
        const clean = rawContent.replace(/```[a-z]*\n?/g, '').trim()
        claudeOutput = JSON.parse(clean)
      } catch {
        console.error('[ai-intelligence/analyze] Claude output parse failed:', rawContent.slice(0, 500))
        throw new Error('Failed to parse Claude response as JSON')
      }

      // ── Persist predictions ─────────────────────────────────────────────
      const validUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

      const predictionRows = clusters.map((c: HotspotCluster, i: number) => {
        const ai = claudeOutput.hotspots[i] ?? { explanation: 'Analysis unavailable.', patrol_recommendation: null, preventive_actions: [] }
        return {
          run_id: runId,
          rank: i + 1,
          center_lat: c.center_lat,
          center_lng: c.center_lng,
          radius_km: c.radius_km,
          confidence_score: c.confidence_score,
          risk_level: riskLevel(c.confidence_score),
          dominant_categories: c.dominant_categories,
          peak_hours: c.peak_hours,
          peak_days: c.peak_days,
          trend_direction: c.trend_direction,
          incident_count_90d: c.incident_count_90d,
          incident_count_30d: c.incident_count_30d,
          incident_count_7d: c.incident_count_7d,
          severity_score: c.severity_score,
          explanation: ai.explanation,
          patrol_recommendation: ai.patrol_recommendation ?? null,
          preventive_actions: ai.preventive_actions ?? [],
          data_points_used: c.incidents.length,
          institution,
          valid_until: validUntil,
        }
      })

      const { data: savedPredictions } = await db
        .from('ai_predictions')
        .insert(predictionRows)
        .select('*')

      // ── Persist insights ────────────────────────────────────────────────
      const insightRows = (claudeOutput.insights ?? []).map(ins => ({
        run_id: runId,
        institution,
        insight_type: ins.type,
        title: ins.title,
        content: ins.content,
        priority: ins.priority ?? 'MEDIUM',
        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      }))

      const { data: savedInsights } = await db
        .from('ai_insight_cache')
        .insert(insightRows)
        .select('*')

      // ── Mark run complete ───────────────────────────────────────────────
      await db.from('ai_prediction_runs').update({
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
      }).eq('id', runId)

      await logAudit({
        event_type: 'AI_ANALYSIS',
        action: 'ai_intelligence_analysis',
        actor: user,
        target_type: 'ai_prediction_run',
        target_id: runId,
        context: ctx,
        after_state: {
          incidents_analyzed: incidents.length,
          hotspots_generated: clusters.length,
          institution,
        },
      }).catch(() => {})

      return apiSuccess({
        cached: false,
        run_id: runId,
        predictions: savedPredictions ?? [],
        insights: savedInsights ?? [],
        stats: {
          incidents_analyzed: incidents.length,
          clusters_found: clusters.length,
          temporal_pattern: temporal.seasonal_pattern,
          top_category: categories[0]?.name ?? null,
          feedback_accuracy: Math.round(feedbackAccuracy * 100),
        },
      })

    } catch (err) {
      console.error('[ai-intelligence/analyze] Error:', err)
      await db.from('ai_prediction_runs').update({
        status: 'FAILED',
        error_message: err instanceof Error ? err.message : 'Unknown error',
        completed_at: new Date().toISOString(),
      }).eq('id', runId)
      return apiError('Analysis failed: ' + (err instanceof Error ? err.message : 'Unknown error'), 500)
    }
  },
  'ai_intelligence:analyze'
)

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import {
  runFullAnalysis,
  type RawIncident,
  type HotspotCluster,
  type TemporalPattern,
  type CategoryStats,
} from '@/lib/crimeAnalysis'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'
export const maxDuration = 60

const WINDOW_DAYS = 90

// ── Helpers ───────────────────────────────────────────────────────────────────

function riskLevel(score: number) {
  return score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW'
}

function countBy<T>(arr: T[], key: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const item of arr) {
    const k = key(item) ?? 'Unknown'
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

function topKeys(map: Record<string, number>, n = 3): string[] {
  return Object.entries(map).sort(([, a], [, b]) => b - a).slice(0, n).map(([k]) => k)
}

async function getFeedbackAccuracy(
  db: ReturnType<typeof createServerSupabaseClient>,
  institution: string,
): Promise<number> {
  const { data } = await db
    .from('ai_prediction_feedback').select('accurate')
    .eq('institution', institution).limit(200)
  if (!data || data.length === 0) return 0.7
  return data.filter(r => r.accurate).length / data.length
}

// ── Programmatic crime analysis (no API needed) ───────────────────────────────

interface SuspectStats {
  total: number
  newCount: number
  threatCounts: Record<string, number>
  nationalityCounts: Record<string, number>
}

interface WarrantStats {
  total: number
  topCharges: string[]
  priorityCounts: Record<string, number>
}

interface CaseStats {
  total: number
  topCategories: string[]
}

function generateCrimeAnalysis(
  clusters: HotspotCluster[],
  temporal: TemporalPattern,
  categories: CategoryStats[],
  suspects: SuspectStats,
  warrants: WarrantStats,
  cases: CaseStats,
): { who: string; when: string; where: string; how: string; predictions: string } {
  const critical = suspects.threatCounts['CRITICAL'] ?? 0
  const high     = suspects.threatCounts['HIGH'] ?? 0
  const topNats  = topKeys(suspects.nationalityCounts, 3)
  const chargeList = warrants.topCharges.slice(0, 3).join(', ')

  const who =
    `${suspects.total} suspects are currently tracked, with ${critical} classified as CRITICAL threat` +
    ` and ${high} as HIGH risk. ${suspects.newCount} new suspects were recorded in this analysis period.` +
    ` Active warrants stand at ${warrants.total}` +
    (chargeList ? `, primarily for ${chargeList}.` : '.') +
    (topNats.length ? ` Suspect nationalities are led by ${topNats.join(', ')}.` : '')

  const isWeekdayHeavy = temporal.weekday_vs_weekend.weekday > temporal.weekday_vs_weekend.weekend
  const when =
    `Crime activity peaks at ${String(temporal.busiest_hour).padStart(2, '0')}:00 on ${temporal.busiest_day}s.` +
    ` The ${temporal.seasonal_pattern} seasonal pattern dominates, with weekday averages of` +
    ` ${temporal.weekday_vs_weekend.weekday} incidents/day vs ${temporal.weekday_vs_weekend.weekend} on weekends.` +
    (isWeekdayHeavy
      ? ' Elevated weekday activity suggests work-hour opportunistic crime.'
      : ' Weekend spikes indicate night-time or social gathering related incidents.')

  const topCluster   = clusters[0]
  const increasing   = clusters.filter(c => c.trend_direction === 'INCREASING').length
  const where =
    `${clusters.length} crime hotspot zone${clusters.length !== 1 ? 's' : ''} identified.` +
    (topCluster
      ? ` The highest-risk zone (${topCluster.risk_level}, ${topCluster.confidence_score}% confidence)` +
        ` recorded ${topCluster.incident_count_90d} incidents over 90 days, dominated by ${topCluster.dominant_categories.slice(0, 2).join(' and ')}.`
      : '') +
    ` ${increasing} of ${clusters.length} zones show an INCREASING trend, indicating expanding criminal activity.`

  const top3 = categories.slice(0, 3)
  const how =
    `The dominant crime type is ${top3[0]?.name ?? 'UNKNOWN'} (${top3[0]?.percentage ?? 0}% of incidents)` +
    (top3[1] ? `, followed by ${top3[1].name} (${top3[1].percentage}%)` : '') +
    (top3[2] ? ` and ${top3[2].name} (${top3[2].percentage}%)` : '') + '.' +
    (top3[0]?.trend === 'INCREASING' ? ` ${top3[0].name} is on an upward trend — requires immediate attention.` : '') +
    ` ${cases.total} formal cases were opened this period` +
    (cases.topCategories.length ? `, most frequently classified as ${cases.topCategories.slice(0, 2).join(' and ')}.` : '.')

  const risingCats = categories.filter(c => c.trend === 'INCREASING').slice(0, 2).map(c => c.name)
  const criticalWarrantCount = warrants.priorityCounts['CRITICAL'] ?? warrants.priorityCounts['HIGH'] ?? 0
  const predictions =
    `Over the next 30 days, expect` +
    (increasing > 0
      ? ` escalation in ${increasing} hotspot zone${increasing !== 1 ? 's' : ''} based on current trends.`
      : ' stable crime levels if current patrol strategies are maintained.') +
    (risingCats.length ? ` Monitor ${risingCats.join(' and ')} closely — both show increasing trajectories.` : '') +
    ` Peak risk windows remain ${String(temporal.busiest_hour).padStart(2, '0')}:00–${String((temporal.busiest_hour + 2) % 24).padStart(2, '0')}:00 on ${temporal.busiest_day}s.` +
    (criticalWarrantCount > 0 ? ` ${criticalWarrantCount} high-priority warrant${criticalWarrantCount !== 1 ? 's' : ''} outstanding — apprehension could significantly reduce activity.` : '')

  return { who, when, where, how, predictions }
}

function generateHotspotOutput(cluster: HotspotCluster): {
  explanation: string
  patrol_recommendation: string
  preventive_actions: string[]
} {
  const trendText =
    cluster.trend_direction === 'INCREASING'
      ? `on an INCREASING trend (${cluster.trend_ratio.toFixed(1)}× recent rate)`
      : cluster.trend_direction === 'DECREASING'
      ? 'showing a DECREASING trend'
      : 'holding a STABLE pattern'

  const explanation =
    `This ${cluster.risk_level} zone recorded ${cluster.incident_count_90d} incidents over 90 days` +
    ` (${cluster.incident_count_30d} last month, ${cluster.incident_count_7d} this week),` +
    ` dominated by ${cluster.dominant_categories.slice(0, 2).join(' and ')}.` +
    ` Activity is ${trendText}, with a severity score of ${cluster.severity_score.toFixed(1)}/4.0.` +
    ` Incidents concentrate at ${cluster.peak_hours.map(h => `${String(h).padStart(2,'0')}:00`).join(', ')} on ${cluster.peak_days.join(', ')}.`

  const unitCount =
    cluster.risk_level === 'CRITICAL' ? '3–4 units' :
    cluster.risk_level === 'HIGH' ? '2–3 units' : '1–2 units'

  const patrol_recommendation =
    `Deploy ${unitCount} to this zone during peak hours` +
    ` (${cluster.peak_hours.slice(0, 2).map(h => `${String(h).padStart(2,'0')}:00`).join('–')}),` +
    ` especially on ${cluster.peak_days.slice(0, 2).join(' and ')}.` +
    (cluster.trend_direction === 'INCREASING'
      ? ' Increase patrol frequency by 50% to counter the escalating trend.'
      : ' Maintain regular checkpoints and maintain current patrol density.')

  const preventive_actions = [
    `Increase visible patrol presence at ${cluster.peak_hours.slice(0, 2).map(h => `${String(h).padStart(2,'0')}:00`).join(' and ')} in this zone`,
    `Establish checkpoint operations on ${cluster.peak_days.slice(0, 2).join(' and ')} targeting ${cluster.dominant_categories[0]} incidents`,
    `Launch community intelligence network in this ${cluster.radius_km.toFixed(1)}km radius area to surface early warnings`,
  ]

  if (cluster.trend_direction === 'INCREASING') {
    preventive_actions.push(`Execute targeted operation to address INCREASING ${cluster.dominant_categories[0]} pattern`)
    preventive_actions.splice(2, 1)
  }

  return { explanation, patrol_recommendation, preventive_actions }
}

function generateOperationalInsights(
  clusters: HotspotCluster[],
  temporal: TemporalPattern,
  categories: CategoryStats[],
  warrants: WarrantStats,
): Array<{ type: string; title: string; content: string; priority: string }> {
  const insights = []

  // Trend summary
  const increasing = clusters.filter(c => c.trend_direction === 'INCREASING').length
  insights.push({
    type: 'TREND_SUMMARY',
    title: `${increasing > 0 ? '⚠️' : '✓'} Overall Crime Trend`,
    content: `${increasing} of ${clusters.length} hotspot zones are showing INCREASING crime trends over the past 90 days. ` +
      `The top category ${categories[0]?.name ?? 'N/A'} accounts for ${categories[0]?.percentage ?? 0}% of all incidents ` +
      `and is ${categories[0]?.trend ?? 'STABLE'}.`,
    priority: increasing >= 3 ? 'CRITICAL' : increasing >= 1 ? 'HIGH' : 'MEDIUM',
  })

  // Peak time alert
  insights.push({
    type: 'ANOMALY_ALERT',
    title: `Peak Risk: ${String(temporal.busiest_hour).padStart(2,'0')}:00 on ${temporal.busiest_day}`,
    content: `Crime activity concentrates at ${String(temporal.busiest_hour).padStart(2,'0')}:00 on ${temporal.busiest_day}s. ` +
      `Weekend incidents average ${temporal.weekday_vs_weekend.weekend}/day vs ${temporal.weekday_vs_weekend.weekday}/day on weekdays. ` +
      `Ensure maximum deployment during these windows.`,
    priority: 'HIGH',
  })

  // Seasonal pattern
  insights.push({
    type: 'SEASONAL_PATTERN',
    title: `${temporal.seasonal_pattern} Season Pattern Active`,
    content: `The current ${temporal.seasonal_pattern} seasonal crime pattern is in effect for Rwanda. ` +
      `Historical data shows this period correlates with ${temporal.seasonal_pattern === 'RAINY' ? 'indoor crimes and property offences' : 'outdoor and road-related incidents'}. ` +
      `Adjust patrol strategies accordingly.`,
    priority: 'MEDIUM',
  })

  // High-risk warrant alert
  if (warrants.total > 0) {
    const critCount = (warrants.priorityCounts['CRITICAL'] ?? 0) + (warrants.priorityCounts['HIGH'] ?? 0)
    insights.push({
      type: 'RISK_OVERVIEW',
      title: `${warrants.total} Active Warrants Outstanding`,
      content: `${warrants.total} warrants remain active, including ${critCount} at CRITICAL/HIGH priority. ` +
        `Top charges: ${warrants.topCharges.slice(0, 3).join(', ')}. ` +
        `Apprehending warrant subjects in hotspot areas could significantly reduce local crime rates.`,
      priority: critCount > 5 ? 'CRITICAL' : critCount > 0 ? 'HIGH' : 'MEDIUM',
    })
  }

  // Patrol strategy
  const topZone = clusters[0]
  if (topZone) {
    insights.push({
      type: 'PATROL_STRATEGY',
      title: 'Priority Deployment Recommendation',
      content: `Concentrate resources on the ${topZone.risk_level} zone (${topZone.incident_count_7d} incidents last 7 days). ` +
        `A focused patrol strategy during ${topZone.peak_hours.map(h => `${String(h).padStart(2,'0')}:00`).join('/')} on ` +
        `${topZone.peak_days.slice(0,2).join(' and ')} is estimated to cover the highest-density crime window.`,
      priority: topZone.risk_level,
    })
  }

  return insights
}

// ── POST /api/v1/ai-intelligence/analyze ─────────────────────────────────────

export const POST = withAuth(
  async (req: NextRequest, { user }: { user: AuthPayload }) => {
    const db  = createServerSupabaseClient()
    const ctx = extractAuditContext(req)

    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch { /* optional */ }

    const forceRefresh = body.force_refresh === true
    const institution  = user.institution

    // ── Cache check (< 6 hours) ───────────────────────────────────────────
    if (!forceRefresh) {
      const { data: recent } = await db
        .from('ai_prediction_runs')
        .select('id, completed_at')
        .eq('institution', institution)
        .eq('status', 'COMPLETED')
        .gte('completed_at', new Date(Date.now() - 6 * 3600 * 1000).toISOString())
        .order('completed_at', { ascending: false })
        .limit(1).single()

      if (recent) {
        const { data: predictions } = await db.from('ai_predictions').select('*').eq('run_id', recent.id).order('rank')
        const { data: insights }    = await db.from('ai_insight_cache').select('*').eq('run_id', recent.id)
          .gt('expires_at', new Date().toISOString()).order('priority', { ascending: false })
        return apiSuccess({ cached: true, run_id: recent.id, predictions: predictions ?? [], insights: insights ?? [] })
      }
    }

    // ── Create run ────────────────────────────────────────────────────────
    const { data: run, error: runErr } = await db
      .from('ai_prediction_runs')
      .insert({ triggered_by: user.user_id, triggered_by_badge: user.badge_number, institution, time_window_days: WINDOW_DAYS, status: 'RUNNING' })
      .select('id').single()
    if (runErr || !run) return apiError('Failed to create prediction run', 500)
    const runId = run.id

    try {
      const windowStart = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()

      // ── Fetch data ────────────────────────────────────────────────────
      const [
        { data: reports },
        { data: events },
        { data: allActiveSuspects },
        { data: newSuspects },
        { data: warrantRows },
        { data: caseRows },
      ] = await Promise.all([
        db.from('field_reports')
          .select('id, title, description, category, priority, location_lat, location_lng, incident_date, created_at')
          .gte('created_at', windowStart).limit(2000),
        db.from('intelligence_events')
          .select('id, source_tag, location_lat, location_lng, event_timestamp, criminal_record_found')
          .gte('event_timestamp', windowStart).not('location_lat', 'is', null).limit(1000),
        db.from('suspects')
          .select('id, threat_level, status, nationality, owning_institution')
          .not('status', 'in', '("DECEASED")').limit(2000),
        db.from('suspects')
          .select('id, threat_level, nationality').gte('created_at', windowStart).limit(500),
        db.from('warrants')
          .select('id, charges, priority').eq('active', true).limit(300),
        db.from('cases')
          .select('id, category, status').gte('created_at', windowStart).limit(300),
      ])

      // ── Build incidents for spatial analysis ──────────────────────────
      const incidents: RawIncident[] = [
        ...(reports ?? []).filter(r => r.location_lat != null && r.location_lng != null).map(r => ({
          id: r.id, location_lat: r.location_lat as number, location_lng: r.location_lng as number,
          category: r.category as string, priority: r.priority as string,
          created_at: (r.incident_date ?? r.created_at) as string,
          title: r.title as string, institution,
        })),
        ...(events ?? []).filter(e => e.criminal_record_found && e.location_lat != null).map(e => ({
          id: e.id, location_lat: e.location_lat as number, location_lng: e.location_lng as number,
          category: 'OFFICER_REPORT', priority: 'MEDIUM',
          created_at: e.event_timestamp as string, institution,
        })),
      ]

      await db.from('ai_prediction_runs').update({ total_incidents_analyzed: incidents.length }).eq('id', runId)

      if (incidents.length === 0) {
        await db.from('ai_prediction_runs').update({
          status: 'FAILED', error_message: 'No geolocated incidents found',
          completed_at: new Date().toISOString(),
        }).eq('id', runId)
        return apiError('No geolocated incidents found in the past 90 days. Submit field reports with GPS coordinates to enable AI predictions.', 400)
      }

      // ── Statistical analysis ──────────────────────────────────────────
      const feedbackAccuracy = await getFeedbackAccuracy(db, institution)
      const { clusters, temporal, categories } = runFullAnalysis(incidents, WINDOW_DAYS, feedbackAccuracy, institution)

      if (clusters.length === 0) {
        await db.from('ai_prediction_runs').update({
          status: 'FAILED', error_message: 'No spatial clusters found',
          completed_at: new Date().toISOString(),
        }).eq('id', runId)
        return apiError('Insufficient spatial concentration of incidents to generate predictions.', 400)
      }

      // ── Build stats summaries ─────────────────────────────────────────
      const activeSusp = allActiveSuspects ?? []
      const newSusp    = newSuspects ?? []
      const warrantList = warrantRows ?? []
      const caseList    = caseRows ?? []

      const suspectStats: SuspectStats = {
        total: activeSusp.length,
        newCount: newSusp.length,
        threatCounts: countBy(activeSusp, s => (s.threat_level as string) ?? 'UNKNOWN'),
        nationalityCounts: countBy(activeSusp.filter(s => s.nationality), s => s.nationality as string),
      }

      const allCharges = warrantList.flatMap(w => {
        const c = w.charges
        return Array.isArray(c) ? c as string[] : typeof c === 'string' ? [c] : []
      })
      const warrantStats: WarrantStats = {
        total: warrantList.length,
        topCharges: topKeys(countBy(allCharges, c => c), 5),
        priorityCounts: countBy(warrantList, w => (w.priority as string) ?? 'UNKNOWN'),
      }

      const caseStats: CaseStats = {
        total: caseList.length,
        topCategories: topKeys(countBy(caseList.filter(c => c.category), c => (c.category as string)), 3),
      }

      // ── Generate analysis programmatically (always works, no API needed) ──
      const crimeAnalysis = generateCrimeAnalysis(clusters, temporal, categories, suspectStats, warrantStats, caseStats)

      // Hotspot explanations + operational insights
      let hotspotOutputs = clusters.map(c => generateHotspotOutput(c))
      let operationalInsights = generateOperationalInsights(clusters, temporal, categories, warrantStats)

      // ── Optional: enhance with Claude if credentials available ────────
      const apiKey    = process.env.ANTHROPIC_API_KEY
      const authToken = process.env.ANTHROPIC_AUTH_TOKEN
      if (apiKey || authToken) {
        try {
          const anthropic = apiKey ? new Anthropic({ apiKey }) : new Anthropic({ authToken })

          // Short focused prompt — only ask for hotspot explanations to minimise tokens
          const shortPrompt = `You are a crime analyst for ${institution} Rwanda. Enhance these ${clusters.length} hotspot explanations with local context. Return ONLY valid JSON (no fences):
{"hotspots":[${clusters.map((c, i) => `{"cluster_index":${i},"explanation":"${hotspotOutputs[i].explanation.replace(/"/g, "'")}","patrol_recommendation":"${hotspotOutputs[i].patrol_recommendation.replace(/"/g, "'")}","preventive_actions":${JSON.stringify(hotspotOutputs[i].preventive_actions)}}`).join(',')}]}
Improve each explanation to 2-3 sentences with specific Rwanda crime intelligence context. Keep same JSON structure.`

          const msg = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            messages: [{ role: 'user', content: shortPrompt }],
          })

          const raw   = (msg.content[0] as { text: string }).text
          const clean = raw.replace(/```[a-z]*\n?/g, '').trim()
          const parsed = JSON.parse(clean)
          if (Array.isArray(parsed.hotspots)) {
            hotspotOutputs = clusters.map((_, i) => ({
              explanation:           parsed.hotspots[i]?.explanation           ?? hotspotOutputs[i].explanation,
              patrol_recommendation: parsed.hotspots[i]?.patrol_recommendation ?? hotspotOutputs[i].patrol_recommendation,
              preventive_actions:    parsed.hotspots[i]?.preventive_actions    ?? hotspotOutputs[i].preventive_actions,
            }))
          }
        } catch {
          // Claude enhancement failed — programmatic output is already good, continue
        }
      }

      // ── Persist predictions ───────────────────────────────────────────
      const validUntil    = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
      const insightExpiry = new Date(Date.now() + 48 * 3600 * 1000).toISOString()

      const predictionRows = clusters.map((c: HotspotCluster, i: number) => ({
        run_id: runId, rank: i + 1,
        center_lat: c.center_lat, center_lng: c.center_lng, radius_km: c.radius_km,
        confidence_score: c.confidence_score, risk_level: riskLevel(c.confidence_score),
        dominant_categories: c.dominant_categories, peak_hours: c.peak_hours, peak_days: c.peak_days,
        trend_direction: c.trend_direction, incident_count_90d: c.incident_count_90d,
        incident_count_30d: c.incident_count_30d, incident_count_7d: c.incident_count_7d,
        severity_score: c.severity_score, explanation: hotspotOutputs[i].explanation,
        patrol_recommendation: hotspotOutputs[i].patrol_recommendation,
        preventive_actions: hotspotOutputs[i].preventive_actions,
        data_points_used: c.incidents.length, institution, valid_until: validUntil,
      }))

      const { data: savedPredictions } = await db.from('ai_predictions').insert(predictionRows).select('*')

      // ── Persist insights ──────────────────────────────────────────────
      const ca = crimeAnalysis
      const allInsightRows = [
        ...operationalInsights.map(ins => ({
          run_id: runId, institution, insight_type: ins.type,
          title: ins.title, content: ins.content, priority: ins.priority, expires_at: insightExpiry,
        })),
        { run_id: runId, institution, insight_type: 'WHO_ANALYSIS',      title: 'Who Commits Crimes',       content: ca.who,         priority: 'HIGH',     expires_at: insightExpiry },
        { run_id: runId, institution, insight_type: 'WHEN_ANALYSIS',     title: 'When Crimes Occur',        content: ca.when,        priority: 'MEDIUM',   expires_at: insightExpiry },
        { run_id: runId, institution, insight_type: 'WHERE_ANALYSIS',    title: 'Where Crimes Concentrate', content: ca.where,       priority: 'HIGH',     expires_at: insightExpiry },
        { run_id: runId, institution, insight_type: 'HOW_ANALYSIS',      title: 'How Crimes Are Committed', content: ca.how,         priority: 'MEDIUM',   expires_at: insightExpiry },
        { run_id: runId, institution, insight_type: 'CRIME_PREDICTIONS', title: 'Future Crime Predictions', content: ca.predictions, priority: 'CRITICAL', expires_at: insightExpiry },
      ]

      const { data: savedInsights } = await db.from('ai_insight_cache').insert(allInsightRows).select('*')

      // ── Complete ──────────────────────────────────────────────────────
      await db.from('ai_prediction_runs').update({ status: 'COMPLETED', completed_at: new Date().toISOString() }).eq('id', runId)

      await logAudit({
        event_type: 'AI_ANALYSIS', action: 'ai_intelligence_analysis',
        actor: user, target_type: 'ai_prediction_run', target_id: runId, context: ctx,
        after_state: { incidents_analyzed: incidents.length, hotspots_generated: clusters.length, institution },
      }).catch(() => {})

      return apiSuccess({
        cached: false, run_id: runId,
        predictions: savedPredictions ?? [], insights: savedInsights ?? [],
        stats: {
          incidents_analyzed: incidents.length, clusters_found: clusters.length,
          temporal_pattern: temporal.seasonal_pattern,
          top_category: categories[0]?.name ?? null,
          feedback_accuracy: Math.round(feedbackAccuracy * 100),
        },
      })

    } catch (err) {
      console.error('[ai-intelligence/analyze]', err)
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

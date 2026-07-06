// ── Crime Analysis Engine ──────────────────────────────────────────────────
// Pure TypeScript statistical analysis. No external ML dependencies.
// Runs server-side only. Results are fed to Claude for natural-language output.

export interface RawIncident {
  id: string
  location_lat: number
  location_lng: number
  category: string
  priority: string
  created_at: string         // ISO string
  incident_date?: string     // ISO string
  title?: string
  institution?: string
}

export interface GridCell {
  row: number
  col: number
  lat: number
  lng: number
  incidents: RawIncident[]
  weighted_count: number     // time-decayed sum
}

export interface HotspotCluster {
  id: string
  cells: GridCell[]
  center_lat: number
  center_lng: number
  radius_km: number
  incidents: RawIncident[]
  incident_count_90d: number
  incident_count_30d: number
  incident_count_7d: number
  dominant_categories: string[]
  category_breakdown: Record<string, number>
  peak_hours: number[]       // top 3 hours
  peak_days: string[]        // top 3 days
  hour_distribution: number[] // 24 slots
  day_distribution: number[]  // 7 slots (0=Mon)
  trend_direction: 'INCREASING' | 'STABLE' | 'DECREASING'
  trend_ratio: number        // recent7/prior7, or 0 if no prior
  severity_score: number     // weighted by priority
  confidence_score: number   // 0-100
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

export interface TemporalPattern {
  busiest_hour: number
  busiest_day: string
  monthly_trend: Record<string, number>   // 'YYYY-MM' → count
  seasonal_pattern: 'SUMMER' | 'WINTER' | 'RAINY' | 'DRY' | 'UNIFORM'
  weekday_vs_weekend: { weekday: number; weekend: number }
}

export interface CategoryStats {
  name: string
  count: number
  percentage: number
  avg_priority_score: number
  hottest_hour: number
  trend: 'INCREASING' | 'STABLE' | 'DECREASING'
}

export interface AnalysisSummary {
  total_incidents: number
  time_window_days: number
  hotspots: HotspotCluster[]
  temporal: TemporalPattern
  categories: CategoryStats[]
  feedback_accuracy: number   // 0-1 from historical feedback
}

// ── Constants ──────────────────────────────────────────────────────────────

const GRID_STEP = 0.05          // ~5.5 km per cell
const DECAY_HALFLIFE_DAYS = 14  // incidents halve in weight every 14 days
const MIN_INCIDENTS_CLUSTER = 2 // minimum to form a cluster
const MAX_CLUSTERS = 12         // cap to keep Claude prompt reasonable

const PRIORITY_SCORE: Record<string, number> = {
  CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1,
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── Utility functions ──────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180)
          * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function timeDecayWeight(createdAt: string, nowMs: number): number {
  const ageMs = nowMs - new Date(createdAt).getTime()
  const ageDays = ageMs / 86_400_000
  return Math.pow(0.5, ageDays / DECAY_HALFLIFE_DAYS)
}

function topN<T>(arr: T[], key: (x: T) => number, n: number): T[] {
  return [...arr].sort((a, b) => key(b) - key(a)).slice(0, n)
}

// ── Step 1: Build spatial grid ─────────────────────────────────────────────

export function buildGrid(incidents: RawIncident[], nowMs: number): Map<string, GridCell> {
  const grid = new Map<string, GridCell>()

  for (const inc of incidents) {
    if (inc.location_lat == null || inc.location_lng == null) continue
    const row = Math.floor(inc.location_lat / GRID_STEP)
    const col = Math.floor(inc.location_lng / GRID_STEP)
    const key = `${row}:${col}`

    if (!grid.has(key)) {
      grid.set(key, {
        row, col,
        lat: row * GRID_STEP + GRID_STEP / 2,
        lng: col * GRID_STEP + GRID_STEP / 2,
        incidents: [],
        weighted_count: 0,
      })
    }

    const cell = grid.get(key)!
    cell.incidents.push(inc)
    cell.weighted_count += timeDecayWeight(inc.created_at, nowMs)
  }

  return grid
}

// ── Step 2: Identify hot cells and merge into clusters ────────────────────

function hotCellThreshold(grid: Map<string, GridCell>): number {
  const counts = [...grid.values()].map(c => c.weighted_count)
  if (counts.length === 0) return 1
  const sorted = [...counts].sort((a, b) => b - a)
  // top 20% or at least 1.5
  const idx = Math.max(0, Math.floor(sorted.length * 0.2))
  return Math.max(sorted[idx] ?? 1, 1.5)
}

export function extractClusters(grid: Map<string, GridCell>, nowMs: number): HotspotCluster[] {
  const threshold = hotCellThreshold(grid)
  const hotCells = [...grid.values()].filter(c => c.weighted_count >= threshold)

  if (hotCells.length === 0) return []

  // Union-Find to merge adjacent hot cells
  const parent = new Map<string, string>()
  const key = (c: GridCell) => `${c.row}:${c.col}`

  for (const c of hotCells) parent.set(key(c), key(c))

  function find(k: string): string {
    if (parent.get(k) !== k) parent.set(k, find(parent.get(k)!))
    return parent.get(k)!
  }
  function union(a: string, b: string) {
    parent.set(find(a), find(b))
  }

  for (const c of hotCells) {
    for (const [dr, dc] of [[0,1],[1,0],[1,1],[-1,1]]) {
      const neighborKey = `${c.row+dr}:${c.col+dc}`
      if (parent.has(neighborKey)) union(key(c), neighborKey)
    }
  }

  // Group cells by root
  const groups = new Map<string, GridCell[]>()
  for (const c of hotCells) {
    const root = find(key(c))
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(c)
  }

  const clusters: HotspotCluster[] = []

  for (const [, cells] of groups) {
    const allInc = cells.flatMap(c => c.incidents)
    if (allInc.length < MIN_INCIDENTS_CLUSTER) continue

    // Weighted centroid
    let wLat = 0, wLng = 0, wSum = 0
    for (const c of cells) {
      wLat  += c.lat * c.weighted_count
      wLng  += c.lng * c.weighted_count
      wSum  += c.weighted_count
    }
    const centerLat = wLat / wSum
    const centerLng = wLng / wSum

    // Radius = max distance from centroid to any incident
    const radiusKm = Math.max(
      ...allInc.map(i => haversineKm(centerLat, centerLng, i.location_lat, i.location_lng)),
      1.0
    )

    // Time bucketing
    const now30  = nowMs - 30  * 86_400_000
    const now7   = nowMs - 7   * 86_400_000
    const count30 = allInc.filter(i => new Date(i.created_at).getTime() >= now30).length
    const count7  = allInc.filter(i => new Date(i.created_at).getTime() >= now7).length
    const prevWeek = allInc.filter(i => {
      const t = new Date(i.created_at).getTime()
      return t >= now7 - 7 * 86_400_000 && t < now7
    }).length

    const trendRatio = prevWeek === 0 ? (count7 > 0 ? 2 : 1) : count7 / prevWeek
    const trendDirection: HotspotCluster['trend_direction'] =
      trendRatio > 1.25 ? 'INCREASING' : trendRatio < 0.75 ? 'DECREASING' : 'STABLE'

    // Category breakdown
    const catMap: Record<string, number> = {}
    for (const i of allInc) { catMap[i.category] = (catMap[i.category] ?? 0) + 1 }
    const dominantCats = Object.entries(catMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([c]) => c)

    // Hour distribution (0-23)
    const hourDist = new Array(24).fill(0)
    const dayDist  = new Array(7).fill(0)
    for (const i of allInc) {
      const d = new Date(i.created_at)
      hourDist[d.getHours()]++
      dayDist[(d.getDay() + 6) % 7]++  // 0=Mon
    }
    const peakHours = topN(
      hourDist.map((v, h) => ({ h, v })), x => x.v, 3
    ).map(x => x.h)
    const peakDays = topN(
      dayDist.map((v, d) => ({ d, v })), x => x.v, 3
    ).map(x => DAY_NAMES[x.d])

    // Severity score (weighted priority)
    const severityScore = allInc.reduce(
      (s, i) => s + (PRIORITY_SCORE[i.priority] ?? 1),
      0
    ) / allInc.length

    // Confidence score (0-100)
    const volumeScore    = Math.min(allInc.length / 20, 1) * 40     // max 40 pts
    const recencyScore   = Math.min(count7 / 5, 1) * 20            // max 20 pts
    const severityBonus  = Math.min((severityScore - 1) / 3, 1) * 20 // max 20 pts
    const trendBonus     = trendDirection === 'INCREASING' ? 10 : 0  // max 10 pts
    const patternBonus   = (hourDist.some(v => v > allInc.length * 0.3)) ? 10 : 5 // consistency
    const confidenceScore = Math.min(
      Math.round(volumeScore + recencyScore + severityBonus + trendBonus + patternBonus),
      100
    )

    const riskLevel: HotspotCluster['risk_level'] =
      confidenceScore >= 80 ? 'CRITICAL'
      : confidenceScore >= 60 ? 'HIGH'
      : confidenceScore >= 35 ? 'MEDIUM'
      : 'LOW'

    clusters.push({
      id: `cluster-${clusters.length + 1}`,
      cells,
      center_lat: centerLat,
      center_lng: centerLng,
      radius_km: Math.min(radiusKm, 15),
      incidents: allInc,
      incident_count_90d: allInc.length,
      incident_count_30d: count30,
      incident_count_7d: count7,
      dominant_categories: dominantCats,
      category_breakdown: catMap,
      peak_hours: peakHours,
      peak_days: peakDays,
      hour_distribution: hourDist,
      day_distribution: dayDist,
      trend_direction: trendDirection,
      trend_ratio: trendRatio,
      severity_score: severityScore,
      confidence_score: confidenceScore,
      risk_level: riskLevel,
    })
  }

  // Sort by confidence desc, cap at MAX_CLUSTERS
  return clusters
    .sort((a, b) => b.confidence_score - a.confidence_score)
    .slice(0, MAX_CLUSTERS)
}

// ── Step 3: System-wide temporal analysis ─────────────────────────────────

export function analyzeTemporalPatterns(incidents: RawIncident[]): TemporalPattern {
  const hourDist = new Array(24).fill(0)
  const dayDist  = new Array(7).fill(0)
  const monthly: Record<string, number> = {}

  for (const i of incidents) {
    const d = new Date(i.created_at)
    hourDist[d.getHours()]++
    dayDist[(d.getDay() + 6) % 7]++
    const mon = i.created_at.slice(0, 7)
    monthly[mon] = (monthly[mon] ?? 0) + 1
  }

  const busiestHour = hourDist.indexOf(Math.max(...hourDist))
  const busiestDay  = DAY_NAMES[dayDist.indexOf(Math.max(...dayDist))]

  const weekdayTotal = dayDist.slice(0, 5).reduce((s, v) => s + v, 0)
  const weekendTotal = dayDist.slice(5).reduce((s, v) => s + v, 0)
  const weekdayAvg = weekdayTotal / 5
  const weekendAvg = weekendTotal / 2

  // Rwanda has two rainy seasons: Mar-May and Oct-Dec
  const rainyMonths = new Set([3, 4, 5, 10, 11, 12])
  const monthCounts = incidents.reduce<Record<number, number>>((acc, i) => {
    const m = new Date(i.created_at).getMonth() + 1
    acc[m] = (acc[m] ?? 0) + 1
    return acc
  }, {})
  const rainyTotal = Object.entries(monthCounts)
    .filter(([m]) => rainyMonths.has(+m))
    .reduce((s, [, v]) => s + v, 0)
  const dryTotal = Object.entries(monthCounts)
    .filter(([m]) => !rainyMonths.has(+m))
    .reduce((s, [, v]) => s + v, 0)

  const seasonal: TemporalPattern['seasonal_pattern'] =
    rainyTotal > dryTotal * 1.3 ? 'RAINY'
    : dryTotal > rainyTotal * 1.3 ? 'DRY'
    : 'UNIFORM'

  return {
    busiest_hour: busiestHour,
    busiest_day: busiestDay,
    monthly_trend: monthly,
    seasonal_pattern: seasonal,
    weekday_vs_weekend: { weekday: Math.round(weekdayAvg), weekend: Math.round(weekendAvg) },
  }
}

// ── Step 4: Category statistics ────────────────────────────────────────────

export function analyzeCategoryStats(incidents: RawIncident[], windowDays: number): CategoryStats[] {
  const nowMs = Date.now()
  const halfMs = windowDays / 2 * 86_400_000
  const halfpoint = nowMs - halfMs

  const cats = new Map<string, RawIncident[]>()
  for (const i of incidents) {
    if (!cats.has(i.category)) cats.set(i.category, [])
    cats.get(i.category)!.push(i)
  }

  const stats: CategoryStats[] = []
  const total = incidents.length || 1

  for (const [name, incs] of cats) {
    const recent = incs.filter(i => new Date(i.created_at).getTime() >= halfpoint).length
    const prior  = incs.length - recent
    const trend: CategoryStats['trend'] =
      prior === 0 ? 'INCREASING'
      : recent / prior > 1.25 ? 'INCREASING'
      : recent / prior < 0.75 ? 'DECREASING'
      : 'STABLE'

    const hourCounts = new Array(24).fill(0)
    for (const i of incs) hourCounts[new Date(i.created_at).getHours()]++
    const hottestHour = hourCounts.indexOf(Math.max(...hourCounts))

    const avgPriority = incs.reduce(
      (s, i) => s + (PRIORITY_SCORE[i.priority] ?? 1), 0
    ) / incs.length

    stats.push({
      name,
      count: incs.length,
      percentage: Math.round((incs.length / total) * 100),
      avg_priority_score: Math.round(avgPriority * 10) / 10,
      hottest_hour: hottestHour,
      trend,
    })
  }

  return stats.sort((a, b) => b.count - a.count)
}

// ── Step 5: Build Claude prompt payload ───────────────────────────────────

export function buildClaudePrompt(
  clusters: HotspotCluster[],
  temporal: TemporalPattern,
  categories: CategoryStats[],
  windowDays: number,
  feedbackAccuracy: number,
  institution: string,
): string {
  const clusterSummaries = clusters.map((c, i) => `
HOTSPOT ${i + 1} (${c.risk_level}, Confidence: ${c.confidence_score}%):
  Location: lat=${c.center_lat.toFixed(4)}, lng=${c.center_lng.toFixed(4)}, radius=${c.radius_km.toFixed(1)}km
  Incidents: ${c.incident_count_90d} (90d), ${c.incident_count_30d} (30d), ${c.incident_count_7d} (7d)
  Trend: ${c.trend_direction} (ratio: ${c.trend_ratio.toFixed(2)})
  Categories: ${c.dominant_categories.join(', ')}
  Peak hours: ${c.peak_hours.map(h => `${h}:00`).join(', ')}
  Peak days: ${c.peak_days.join(', ')}
  Severity score: ${c.severity_score.toFixed(1)}/4.0`).join('\n')

  const catSummary = categories.slice(0, 6).map(c =>
    `  ${c.name}: ${c.count} incidents (${c.percentage}%), trend=${c.trend}, peak hour=${c.hottest_hour}:00`
  ).join('\n')

  return `You are a senior crime intelligence analyst for ${institution} in Rwanda. Analyze the following statistical data from the past ${windowDays} days and generate structured intelligence predictions.

TEMPORAL PATTERNS:
  Busiest hour: ${temporal.busiest_hour}:00
  Busiest day: ${temporal.busiest_day}
  Seasonal pattern: ${temporal.seasonal_pattern}
  Weekday avg incidents: ${temporal.weekday_vs_weekend.weekday}/day
  Weekend avg incidents: ${temporal.weekday_vs_weekend.weekend}/day

CATEGORY BREAKDOWN:
${catSummary}

PREDICTED HOTSPOT ZONES:
${clusterSummaries}

Historical feedback accuracy: ${(feedbackAccuracy * 100).toFixed(0)}%

Respond ONLY with a valid JSON object in this exact format (no markdown fences):
{
  "hotspots": [
    {
      "cluster_index": 0,
      "explanation": "2-3 sentence analytical explanation of WHY this area is high risk, referencing specific patterns",
      "patrol_recommendation": "Specific patrol deployment recommendation (timing, frequency, unit type)",
      "preventive_actions": ["action 1", "action 2", "action 3"]
    }
  ],
  "insights": [
    {
      "type": "TREND_SUMMARY|ANOMALY_ALERT|SEASONAL_PATTERN|PATROL_STRATEGY|RISK_OVERVIEW",
      "title": "short title",
      "content": "2-3 sentences",
      "priority": "LOW|MEDIUM|HIGH|CRITICAL"
    }
  ]
}

Rules:
- Provide exactly ${clusters.length} hotspot objects, one per cluster (in order)
- Provide 3-5 insight objects
- explanations must reference actual data patterns (hours, categories, trends)
- patrol_recommendation must be actionable and specific
- preventive_actions must be 3 concrete, implementable measures
- Be concise and professional. No markdown in output. Pure JSON only.`
}

// ── Complete analysis pipeline ─────────────────────────────────────────────

export function runFullAnalysis(
  incidents: RawIncident[],
  windowDays: number,
  feedbackAccuracy: number,
  institution: string,
): { clusters: HotspotCluster[]; temporal: TemporalPattern; categories: CategoryStats[]; prompt: string } {
  const nowMs = Date.now()
  const grid = buildGrid(incidents, nowMs)
  const clusters = extractClusters(grid, nowMs)
  const temporal = analyzeTemporalPatterns(incidents)
  const categories = analyzeCategoryStats(incidents, windowDays)
  const prompt = buildClaudePrompt(clusters, temporal, categories, windowDays, feedbackAccuracy, institution)

  return { clusters, temporal, categories, prompt }
}

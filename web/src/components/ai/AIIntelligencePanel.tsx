'use client'

import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { aiIntelligenceApi, type AIPrediction, type AIInsight, type AIPredictionRun } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Brain, RefreshCw, TrendingUp, TrendingDown, Minus,
  Clock, MapPin, ShieldAlert, ChevronDown, ChevronUp,
  ThumbsUp, ThumbsDown, Lightbulb, Target, Users,
} from 'lucide-react'
import { BarChart, Bar, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const PredictionZoneMap = lazy(() => import('./PredictionZoneMap'))

// ── Constants ────────────────────────────────────────────────────────────────

const RISK_COLOR: Record<string, string>  = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#22c55e' }
const RISK_BG: Record<string, string>     = { CRITICAL: '#450a0a', HIGH: '#431407', MEDIUM: '#451a03', LOW: '#052e16' }
const TREND_ICON = {
  INCREASING: <TrendingUp style={{ width: 14, height: 14, color: '#ef4444' }} />,
  STABLE:     <Minus       style={{ width: 14, height: 14, color: '#f59e0b' }} />,
  DECREASING: <TrendingDown style={{ width: 14, height: 14, color: '#22c55e' }} />,
}
const INSIGHT_ICON: Record<string, string> = {
  TREND_SUMMARY:    '📊',
  ANOMALY_ALERT:    '🚨',
  SEASONAL_PATTERN: '🌦️',
  PATROL_STRATEGY:  '🚔',
  RISK_OVERVIEW:    '🛡️',
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AIIntelligencePanel() {
  const [run,          setRun]          = useState<AIPredictionRun | null>(null)
  const [predictions,  setPredictions]  = useState<AIPrediction[]>([])
  const [insights,     setInsights]     = useState<AIInsight[]>([])
  const [selected,     setSelected]     = useState<AIPrediction | null>(null)
  const [analyzing,    setAnalyzing]    = useState(false)
  const [loadState,    setLoadState]    = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg,     setErrorMsg]     = useState('')
  const [view,         setView]         = useState<'map' | 'list' | 'insights'>('map')
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set())
  const [feedback,     setFeedback]     = useState<Record<string, boolean>>({})
  const [feedbackMsg,  setFeedbackMsg]  = useState('')
  const [hasData,      setHasData]      = useState(false)
  const [inProgress,   setInProgress]   = useState(false)
  const [stats, setStats] = useState<{
    incidents_analyzed: number; clusters_found: number
    temporal_pattern: string; top_category: string | null; feedback_accuracy: number
  } | null>(null)

  // ── Load existing predictions on mount ───────────────────────────────────
  const loadPredictions = useCallback(async () => {
    setLoadState('loading')
    try {
      const res = await aiIntelligenceApi.getPredictions()
      const d = res.data
      setRun(d.run)
      setPredictions(d.predictions)
      setInsights(d.insights)
      setHasData(d.has_data)
      setInProgress(d.analysis_in_progress)
      setLoadState('done')
    } catch {
      setLoadState('error')
      setErrorMsg('Failed to load predictions')
    }
  }, [])

  useEffect(() => { loadPredictions() }, [loadPredictions])

  // Poll while analysis is in progress
  useEffect(() => {
    if (!inProgress) return
    const t = setInterval(() => { loadPredictions() }, 5000)
    return () => clearInterval(t)
  }, [inProgress, loadPredictions])

  // ── Trigger new analysis ──────────────────────────────────────────────────
  const runAnalysis = async (force = false) => {
    setAnalyzing(true)
    setErrorMsg('')
    try {
      const res = await aiIntelligenceApi.analyze(force)
      const d = res.data
      setPredictions(d.predictions)
      setInsights(d.insights)
      setStats(d.stats ?? null)
      setHasData(d.predictions.length > 0)
      setLoadState('done')
      if (d.predictions.length > 0) setView('map')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Analysis failed'
      setErrorMsg(msg)
    } finally {
      setAnalyzing(false)
      loadPredictions()
    }
  }

  // ── Feedback submission ───────────────────────────────────────────────────
  const submitFeedback = async (predId: string, accurate: boolean) => {
    try {
      await aiIntelligenceApi.submitFeedback({ prediction_id: predId, accurate })
      setFeedback(prev => ({ ...prev, [predId]: accurate }))
      setFeedbackMsg(accurate ? '✓ Marked accurate — thank you' : '✓ Marked inaccurate — helps improve the model')
      setTimeout(() => setFeedbackMsg(''), 3000)
    } catch { /* silent */ }
  }

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ── Render states ─────────────────────────────────────────────────────────
  const isEmpty = loadState === 'done' && !hasData

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Brain style={{ width: 22, height: 22, color: '#fff' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>AI Intelligence Assistant</h1>
            <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>
              {run
                ? `Last analysis: ${formatDistanceToNow(new Date(run.completed_at ?? run.created_at), { addSuffix: true })} · ${run.total_incidents_analyzed} incidents analyzed`
                : 'Powered by Claude · Statistical crime pattern analysis'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {hasData && (
            <button
              onClick={() => runAnalysis(true)}
              disabled={analyzing || inProgress}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: '#1e293b', color: '#94a3b8',
                border: '1px solid #334155', borderRadius: '7px',
                padding: '8px 14px', fontSize: '12px', cursor: 'pointer', fontWeight: 600,
                opacity: (analyzing || inProgress) ? 0.6 : 1,
              }}
            >
              <RefreshCw style={{ width: 13, height: 13 }} />
              Refresh
            </button>
          )}
          <button
            onClick={() => runAnalysis(false)}
            disabled={analyzing || inProgress}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: analyzing || inProgress
                ? '#1e293b'
                : 'linear-gradient(135deg, #6366f1, #a855f7)',
              color: '#fff',
              border: 'none', borderRadius: '7px',
              padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: 700,
              opacity: (analyzing || inProgress) ? 0.7 : 1,
            }}
          >
            {analyzing || inProgress ? (
              <>
                <RefreshCw style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                {inProgress ? 'Analyzing…' : 'Starting…'}
              </>
            ) : (
              <><Brain style={{ width: 14, height: 14 }} /> {hasData ? 'New Analysis' : 'Run Analysis'}</>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {errorMsg && (
        <div style={{
          background: '#450a0a', border: '1px solid #ef444433',
          borderRadius: '8px', padding: '10px 14px',
          fontSize: '12px', color: '#fca5a5',
        }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Feedback toast */}
      {feedbackMsg && (
        <div style={{
          background: '#052e16', border: '1px solid #22c55e33',
          borderRadius: '8px', padding: '8px 14px',
          fontSize: '12px', color: '#6ee7b7',
        }}>
          {feedbackMsg}
        </div>
      )}

      {/* In-progress banner */}
      {inProgress && !analyzing && (
        <div style={{
          background: '#1e1b4b', border: '1px solid #6366f133',
          borderRadius: '8px', padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <RefreshCw style={{ width: 16, height: 16, color: '#a5b4fc', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '13px', color: '#c7d2fe' }}>
            Analysis in progress — Claude is processing crime patterns…
          </span>
        </div>
      )}

      {/* Stats bar */}
      {stats && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px',
        }}>
          {[
            { label: 'Incidents Analyzed', value: stats.incidents_analyzed, color: '#3b82f6' },
            { label: 'Hotspot Zones',       value: stats.clusters_found,       color: '#a855f7' },
            { label: 'Top Category',        value: stats.top_category ?? '—',  color: '#f97316' },
            { label: 'Model Accuracy',      value: `${stats.feedback_accuracy}%`, color: '#22c55e' },
          ].map(c => (
            <div key={c.label} style={{ background: '#0f172a', border: `1px solid ${c.color}33`, borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{c.label}</div>
              <div style={{ fontSize: '18px', fontWeight: 900, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {loadState === 'loading' && (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', background: '#0f172a', borderRadius: '10px', border: '1px solid #1e293b' }}>
          <Brain style={{ width: 32, height: 32, margin: '0 auto 12px', opacity: 0.4 }} />
          <div style={{ fontSize: '14px' }}>Loading predictions…</div>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div style={{
          padding: '60px 24px', textAlign: 'center',
          background: '#0f172a', border: '1px dashed #334155', borderRadius: '12px',
        }}>
          <Brain style={{ width: 48, height: 48, color: '#334155', margin: '0 auto 16px' }} />
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#94a3b8', marginBottom: '8px' }}>No Predictions Yet</div>
          <p style={{ fontSize: '13px', color: '#64748b', maxWidth: '420px', margin: '0 auto 20px', lineHeight: 1.6 }}>
            Run the AI Analysis to generate crime hotspot predictions, patrol recommendations, and risk assessments based on 90 days of field data.
          </p>
          <button
            onClick={() => runAnalysis()}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              color: '#fff', border: 'none', borderRadius: '8px',
              padding: '10px 24px', fontSize: '14px', cursor: 'pointer', fontWeight: 700,
            }}
          >
            <Brain style={{ width: 16, height: 16, display: 'inline', marginRight: 6 }} />
            Run AI Analysis
          </button>
        </div>
      )}

      {/* Main content */}
      {hasData && (
        <>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: '4px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '4px' }}>
            {([
              { id: 'map', icon: <MapPin style={{ width: 14, height: 14 }} />, label: `Map (${predictions.length})` },
              { id: 'list', icon: <Target style={{ width: 14, height: 14 }} />, label: 'Hotspots' },
              { id: 'insights', icon: <Lightbulb style={{ width: 14, height: 14 }} />, label: `Insights (${insights.length})` },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  background: view === tab.id ? '#1e293b' : 'transparent',
                  color: view === tab.id ? '#f1f5f9' : '#64748b',
                  border: 'none', borderRadius: '6px', padding: '8px 12px',
                  fontSize: '12px', cursor: 'pointer', fontWeight: view === tab.id ? 700 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* MAP VIEW */}
          {view === 'map' && (
            <div style={{ height: '520px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #1e293b' }}>
              <Suspense fallback={
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#64748b' }}>
                  Loading map…
                </div>
              }>
                <PredictionZoneMap
                  predictions={predictions}
                  onSelectPrediction={p => { setSelected(p); setView('list') }}
                  selectedId={selected?.id}
                />
              </Suspense>
            </div>
          )}

          {/* LIST VIEW */}
          {view === 'list' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {predictions.map(p => {
                const isExpanded = expanded.has(p.id)
                const isSelected = selected?.id === p.id
                const color = RISK_COLOR[p.risk_level]
                const peakHoursData = p.peak_hours.map(h => ({ hour: `${h}:00`, count: 1 }))

                return (
                  <div
                    key={p.id}
                    style={{
                      background: isSelected ? '#1a1a2e' : '#0f172a',
                      border: `1px solid ${isSelected ? color + '66' : '#1e293b'}`,
                      borderLeft: `4px solid ${color}`,
                      borderRadius: '10px',
                      overflow: 'hidden',
                      transition: 'all 0.15s',
                    }}
                  >
                    {/* Card header */}
                    <div
                      onClick={() => { setSelected(p); toggleExpand(p.id) }}
                      style={{ padding: '14px 16px', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        {/* Rank badge */}
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: color, color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '14px', fontWeight: 900, flexShrink: 0,
                          boxShadow: `0 0 12px ${color}66`,
                        }}>
                          {p.rank}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Top row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{
                              background: RISK_BG[p.risk_level],
                              color, fontSize: '10px', fontWeight: 900,
                              padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.5px',
                            }}>
                              {p.risk_level}
                            </span>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>
                              {p.dominant_categories.slice(0, 2).join(' · ')}
                            </span>
                            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#64748b' }}>
                              {TREND_ICON[p.trend_direction]}
                              {p.trend_direction}
                            </span>
                          </div>

                          {/* Metrics row */}
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                              <span style={{ color, fontWeight: 700 }}>{p.incident_count_7d}</span> this week
                            </span>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                              <span style={{ fontWeight: 600 }}>{p.incident_count_30d}</span> this month
                            </span>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                              <span style={{ fontWeight: 600 }}>{p.confidence_score}%</span> confidence
                            </span>
                          </div>

                          {/* Confidence bar */}
                          <div style={{ height: 4, background: '#1e293b', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${p.confidence_score}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.5s' }} />
                          </div>
                        </div>

                        <div style={{ flexShrink: 0, color: '#64748b' }}>
                          {isExpanded ? <ChevronUp style={{ width: 16, height: 16 }} /> : <ChevronDown style={{ width: 16, height: 16 }} />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #1e293b', padding: '16px' }}>

                        {/* AI Explanation */}
                        <div style={{
                          background: '#1e293b', borderRadius: '8px', padding: '12px 14px',
                          marginBottom: '14px',
                          borderLeft: `3px solid ${color}`,
                        }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: color, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                            🧠 AI Analysis
                          </div>
                          <p style={{ fontSize: '13px', color: '#cbd5e1', margin: 0, lineHeight: 1.6 }}>
                            {p.explanation}
                          </p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>

                          {/* Patrol recommendation */}
                          {p.patrol_recommendation && (
                            <div style={{ background: '#1e293b', borderRadius: '8px', padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                <Users style={{ width: 13, height: 13, color: '#3b82f6' }} />
                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Patrol Recommendation</span>
                              </div>
                              <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: 1.5 }}>
                                {p.patrol_recommendation}
                              </p>
                            </div>
                          )}

                          {/* Preventive actions */}
                          {p.preventive_actions.length > 0 && (
                            <div style={{ background: '#1e293b', borderRadius: '8px', padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                <ShieldAlert style={{ width: 13, height: 13, color: '#22c55e' }} />
                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Preventive Actions</span>
                              </div>
                              <ul style={{ margin: 0, paddingLeft: '14px' }}>
                                {p.preventive_actions.map((a, i) => (
                                  <li key={i} style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '3px', lineHeight: 1.4 }}>
                                    {a}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Time pattern mini chart */}
                        <div style={{ background: '#1e293b', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                            <Clock style={{ width: 11, height: 11, display: 'inline', marginRight: 4 }} />
                            Peak Activity Windows
                          </div>
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '3px' }}>PEAK HOURS</div>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {p.peak_hours.map(h => (
                                  <span key={h} style={{ background: color + '33', color, fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px' }}>
                                    {String(h).padStart(2, '0')}:00
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '3px' }}>PEAK DAYS</div>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {p.peak_days.map(d => (
                                  <span key={d} style={{ background: '#334155', color: '#94a3b8', fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px' }}>
                                    {d}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 90d bar chart */}
                        <div style={{ background: '#1e293b', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                            Incident Volume
                          </div>
                          <ResponsiveContainer width="100%" height={60}>
                            <BarChart data={[
                              { label: '90d', value: p.incident_count_90d },
                              { label: '30d', value: p.incident_count_30d },
                              { label: '7d',  value: p.incident_count_7d },
                            ]} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} />
                              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 11 }} />
                              <Bar dataKey="value" radius={[3,3,0,0]}>
                                {[p.incident_count_90d, p.incident_count_30d, p.incident_count_7d].map((_, i) => (
                                  <Cell key={i} fill={color} fillOpacity={[0.4, 0.65, 1][i]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                          <div style={{ display: 'none' }}>{peakHoursData.length}</div>
                        </div>

                        {/* Location + feedback */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ fontSize: '11px', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MapPin style={{ width: 12, height: 12 }} />
                            {p.center_lat.toFixed(4)}, {p.center_lng.toFixed(4)} · {p.radius_km.toFixed(1)}km radius · {p.data_points_used} data points
                          </div>
                          {!(p.id in feedback) ? (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <span style={{ fontSize: '10px', color: '#64748b' }}>Accurate?</span>
                              <button
                                onClick={() => submitFeedback(p.id, true)}
                                style={{ display: 'flex', alignItems: 'center', gap: '3px', background: '#052e16', color: '#6ee7b7', border: '1px solid #22c55e44', borderRadius: '5px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}
                              >
                                <ThumbsUp style={{ width: 11, height: 11 }} /> Yes
                              </button>
                              <button
                                onClick={() => submitFeedback(p.id, false)}
                                style={{ display: 'flex', alignItems: 'center', gap: '3px', background: '#450a0a', color: '#fca5a5', border: '1px solid #ef444444', borderRadius: '5px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}
                              >
                                <ThumbsDown style={{ width: 11, height: 11 }} /> No
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: feedback[p.id] ? '#6ee7b7' : '#fca5a5' }}>
                              {feedback[p.id] ? '✓ Marked accurate' : '✓ Marked inaccurate'}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* INSIGHTS VIEW */}
          {view === 'insights' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {insights.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', color: '#64748b' }}>
                  No insights available. Run an analysis to generate insights.
                </div>
              ) : insights.map(ins => {
                const priorityColor = RISK_COLOR[ins.priority] ?? '#64748b'
                return (
                  <div key={ins.id} style={{
                    background: '#0f172a',
                    border: `1px solid ${priorityColor}33`,
                    borderLeft: `4px solid ${priorityColor}`,
                    borderRadius: '10px',
                    padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <span style={{ fontSize: '22px', flexShrink: 0 }}>{INSIGHT_ICON[ins.insight_type] ?? '📌'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>{ins.title}</span>
                          <span style={{
                            background: RISK_BG[ins.priority] ?? '#1e293b',
                            color: priorityColor, fontSize: '9px', fontWeight: 900,
                            padding: '2px 6px', borderRadius: '3px', letterSpacing: '0.5px',
                          }}>{ins.priority}</span>
                        </div>
                        <p style={{ fontSize: '13px', color: '#cbd5e1', margin: 0, lineHeight: 1.6 }}>
                          {ins.content}
                        </p>
                        <div style={{ fontSize: '10px', color: '#475569', marginTop: '6px' }}>
                          {ins.insight_type.replace(/_/g, ' ')} · Expires {format(new Date(ins.expires_at), 'dd MMM HH:mm')}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer */}
          {run && (
            <div style={{
              padding: '10px 14px',
              background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px',
              display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
            }}>
              <Brain style={{ width: 14, height: 14, color: '#6366f1', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: '#475569' }}>
                Analysis run <strong style={{ color: '#64748b' }}>{format(new Date(run.created_at), 'dd MMM yyyy HH:mm')}</strong>
                {' · '}{run.total_incidents_analyzed} incidents · {predictions.length} hotspot zones
                {' · '}<span style={{ color: '#6366f1' }}>claude-sonnet-4-6</span>
              </span>
              <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#334155' }}>
                Predictions valid for 24h · Submit feedback to improve accuracy
              </span>
            </div>
          )}
        </>
      )}

      {/* Spin keyframe injected once */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

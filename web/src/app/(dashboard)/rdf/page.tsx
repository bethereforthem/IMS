'use client'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { statsApi, cameraApi } from '@/lib/api'
import { StatCard } from '@/components/shared/StatCard'
import { AlertFeed } from '@/components/shared/AlertFeed'
import { useAuth } from '@/hooks/useAuth'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ComposedChart, Area, Legend,
} from 'recharts'
import { Radio, Users, AlertTriangle, Activity, Wifi, WifiOff, MapPin } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import type { DashboardStats, CameraNode, IntelligenceEvent } from '@/types'

const BORDER_POSTS = [
  { name: 'Gatuna', country: 'Uganda', code: 'GTN', prefix: 'GTN-' },
  { name: 'Rubavu', country: 'DRC', code: 'RBV', prefix: 'RBV-' },
  { name: 'Rusizi', country: 'Burundi', code: 'RSZ', prefix: 'RSZ-' },
  { name: 'Nyagatare', country: 'Uganda', code: 'NYG', prefix: 'NYG-' },
]

const BorderMap = dynamic(() => import('./map/_BorderMap'), { ssr: false })

function SkeletonCard() {
  return <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 h-24 animate-pulse" />
}

export default function RDFBorderOps() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [cameras, setCameras] = useState<CameraNode[]>([])
  const [events, setEvents] = useState<IntelligenceEvent[]>([])

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      statsApi.getDashboard(),
      cameraApi.list(),
      statsApi.getRecentEvents(14),
    ]).then(([s, c, e]) => {
      if (s.data) setStats(s.data)
      const allCams = c.data as CameraNode[]
      if (allCams?.length) {
        setCameras(allCams.filter(n => n.institution === 'RDF'))
      }
      if (e.data?.length) {
        setEvents(e.data.filter((ev: IntelligenceEvent) => ev.source_tag === 'CCTV_NODE'))
      }
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const onlineCount = cameras.filter(c => c.is_active).length
  const cctv_with_record = events.filter(e => e.criminal_record_found).length

  // Compute 7-day CCTV detection trend
  const trendData = (() => {
    const days: Record<string, { detections: number; records: number }> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toLocaleDateString('en-RW', { month: 'short', day: 'numeric' })
      days[key] = { detections: 0, records: 0 }
    }
    events.forEach(ev => {
      const key = new Date(ev.created_at).toLocaleDateString('en-RW', { month: 'short', day: 'numeric' })
      if (days[key]) {
        days[key].detections++
        if (ev.criminal_record_found) days[key].records++
      }
    })
    return Object.entries(days).map(([date, v]) => ({ date, ...v }))
  })()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Border Operations</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {user?.full_name} · {user?.role?.replace('_', ' ')} · {user?.badge_number}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rdf animate-pulse" />
          RDF Border Command
        </div>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Border Cameras"
            value={`${onlineCount}/${cameras.length}`}
            icon={Radio}
            variant={onlineCount < cameras.length ? 'warn' : 'ok'}
            sub={onlineCount < cameras.length ? `${cameras.length - onlineCount} offline` : 'All nodes online'} />
          <StatCard label="Border Suspects" value={stats.total_suspects} icon={Users}
            sub="Cross-border flagged" />
          <StatCard label="Alerts Today" value={stats.alerts_today} icon={AlertTriangle}
            variant={stats.critical_alerts > 0 ? 'danger' : 'warn'} />
          <StatCard label="CCTV Detections" value={events.length} icon={Activity}
            sub={`${cctv_with_record} record found`}
            variant={cctv_with_record > 0 ? 'danger' : 'default'} />
        </div>
      ) : (
        <p className="text-sm text-slate-500 py-4">Could not load statistics.</p>
      )}

      {/* Border Intelligence Map */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="h-4 w-4 text-rdf" />
          <h2 className="text-sm font-semibold text-slate-200">Border Intelligence Map</h2>
          <span className="ml-1 text-[10px] text-green-500 font-mono animate-pulse">● LIVE</span>
          <span className="ml-auto text-[10px] text-slate-500">Use the layer panel (top-right) to switch base maps and toggle overlays</span>
        </div>
        <BorderMap cameras={cameras} events={events} />
      </div>

      {/* Camera nodes + Alerts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-rdf/20 bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Border Camera Nodes</h2>
            <span className={clsx('text-xs font-bold',
              cameras.length === 0 ? 'text-slate-500' :
              onlineCount === cameras.length ? 'text-green-400' : 'text-amber-400')}>
              {cameras.length === 0 ? 'NO NODES' : `${onlineCount}/${cameras.length} ONLINE`}
            </span>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-slate-800 animate-pulse" />
            ))}</div>
          ) : cameras.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No camera nodes registered</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {cameras.map(cam => (
                <div key={cam.id}
                  className={clsx(
                    'flex items-center gap-3 rounded-lg border px-4 py-2.5',
                    cam.is_active
                      ? 'border-green-900/50 bg-green-950/20'
                      : 'border-red-900/50 bg-red-950/20'
                  )}>
                  {cam.is_active
                    ? <Wifi className="h-4 w-4 text-green-400 shrink-0" />
                    : <WifiOff className="h-4 w-4 text-red-400 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{cam.node_identifier}</p>
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{cam.location_name}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={clsx('text-xs font-bold',
                      cam.is_active ? 'text-green-400' : 'text-red-400')}>
                      {cam.is_active ? 'ONLINE' : 'OFFLINE'}
                    </span>
                    {cam.last_heartbeat && (
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {formatDistanceToNow(new Date(cam.last_heartbeat), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Border Alerts</h2>
          <AlertFeed limit={5} />
        </div>
      </div>

      {/* Border posts summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BORDER_POSTS.map(post => {
          const postCams = cameras.filter(c => c.node_identifier.startsWith(post.prefix))
          const postOnline = postCams.filter(c => c.is_active).length
          const postEvents = events.filter(e => e.camera_node_id?.startsWith(post.prefix) ?? false)
          return (
            <div key={post.code}
              className={clsx(
                'rounded-xl border p-4',
                postCams.length === 0
                  ? 'border-slate-800 bg-slate-900'
                  : postOnline === postCams.length
                    ? 'border-green-900/40 bg-green-950/10'
                    : postOnline === 0
                      ? 'border-red-900/40 bg-red-950/10'
                      : 'border-amber-900/40 bg-amber-950/10'
              )}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-bold text-white">{post.name}</p>
                  <p className="text-xs text-slate-500">Border with {post.country}</p>
                </div>
                <div className={clsx('h-2 w-2 rounded-full mt-1',
                  postCams.length === 0 ? 'bg-slate-600' :
                  postOnline > 0 ? 'bg-green-400' : 'bg-red-400')} />
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Cameras</span>
                  <span className="text-white font-medium">{postOnline}/{postCams.length}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Detections</span>
                  <span className={clsx('font-medium',
                    postEvents.length > 0 ? 'text-amber-400' : 'text-slate-400')}>
                    {postEvents.length}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* CCTV detection trend */}
      <div className="rounded-xl border border-rdf/20 bg-slate-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-200">CCTV Detections — Last 7 Days</h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">No CCTV events recorded</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={trendData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="detectGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#15803D" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#15803D" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94a3b8', fontSize: 10 }} width={30} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Area yAxisId="left" type="monotone" dataKey="detections" stroke="#15803D" fill="url(#detectGrad)"
                strokeWidth={2} name="Total Detections" />
              <Bar yAxisId="right" dataKey="records" fill="#DC2626" radius={[3, 3, 0, 0]} name="Records Found" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Pi Camera Live Feed */}
      <div className="rounded-xl border border-rdf/30 bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">Pi Camera Live Preview</h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-green-400 bg-green-950 px-2 py-0.5 rounded font-bold">
              INSIGHTFACE ACTIVE
            </span>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
              GTN-BORDER-01
            </span>
          </div>
        </div>
        <div className="relative rounded-lg bg-black overflow-hidden" style={{ aspectRatio: '16/9', maxHeight: 300 }}>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
            <Radio className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm text-slate-500">MJPEG stream from Pi Camera (ArcFace active)</p>
            <p className="text-xs mt-1 text-slate-600">Connect Raspberry Pi 4 node to enable live feed</p>
            <code className="mt-3 text-[11px] bg-slate-900 px-3 py-1.5 rounded border border-slate-700 text-slate-400">
              {'<img src="http://PI_NODE_IP:8080/?action=stream" />'}
            </code>
          </div>
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 rounded px-2 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] text-red-400 font-bold">REC</span>
          </div>
          <div className="absolute bottom-2 right-2 text-[10px] text-slate-600 bg-black/60 px-2 py-1 rounded">
            InsightFace buffalo_s · 5th frame · mTLS secured
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Face matches trigger <code className="bg-slate-800 px-1 rounded">CCTV_NODE</code> intelligence events.
          Offline queue active — events replay on reconnect.
        </p>
      </div>

      {/* CCTV Detections */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">Recent CCTV Detections</h2>
          {cctv_with_record > 0 && (
            <span className="text-xs font-bold text-red-400 bg-red-950 px-2 py-0.5 rounded">
              {cctv_with_record} RECORD FOUND
            </span>
          )}
        </div>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-slate-800 animate-pulse" />
          ))}</div>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No recent CCTV events</p>
        ) : (
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {events.map(ev => (
              <div key={ev.id}
                className={clsx(
                  'flex items-center gap-3 text-xs rounded-lg px-3 py-2',
                  ev.criminal_record_found
                    ? 'border border-red-900/40 bg-red-950/10'
                    : 'border border-slate-800'
                )}>
                <div className={clsx('h-2 w-2 rounded-full shrink-0 mt-0.5',
                  ev.criminal_record_found ? 'bg-red-500' : 'bg-green-500')} />
                <div className="flex-1 min-w-0">
                  <span className="text-slate-200 font-medium">{ev.suspect_name ?? '—'}</span>
                  {ev.location_description && (
                    <p className="text-slate-500 text-[10px] truncate">{ev.location_description}</p>
                  )}
                </div>
                <span className="text-slate-500 shrink-0">{ev.camera_node_id ?? '—'}</span>
                {ev.confidence_score != null && (
                  <span className="text-slate-400 shrink-0">{(ev.confidence_score * 100).toFixed(1)}%</span>
                )}
                {ev.criminal_record_found && (
                  <span className="text-red-400 font-bold shrink-0">⚠ RECORD</span>
                )}
                <span className="text-slate-500 shrink-0 whitespace-nowrap">
                  {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

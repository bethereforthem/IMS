'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useAuth } from '@/hooks/useAuth'
import { cameraApi, statsApi, intelligenceApi } from '@/lib/api'
import { Wifi, WifiOff, Radio, AlertTriangle, Bell } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { StatCard } from '@/components/shared/StatCard'
import clsx from 'clsx'
import type { CameraNode, IntelligenceEvent } from '@/types'

const BORDER_POSTS = [
  { name: 'Gatuna',       country: 'Uganda',         code: 'GTN', prefix: 'GTN-',        lat: -1.7018, lng: 29.7350 },
  { name: 'Rubavu',       country: 'DRC/Congo',       code: 'RBV', prefix: 'RBV-',        lat: -1.6763, lng: 29.3460 },
  { name: 'Rusizi',       country: 'Burundi',         code: 'RSZ', prefix: 'RSZ-',        lat: -2.4797, lng: 28.9078 },
  { name: 'Nyagatare',    country: 'Uganda (East)',   code: 'NYG', prefix: 'NYG-',        lat: -1.2948, lng: 30.3288 },
  { name: 'Kigali Airport',country: 'International', code: 'KGL', prefix: 'KGL-AIRPORT', lat: -1.9706, lng: 30.1328 },
]

// Dynamically import the map to avoid SSR issues with Leaflet
const BorderMap = dynamic(() => import('./_BorderMap'), { ssr: false, loading: () => (
  <div className="flex items-center justify-center bg-slate-950 rounded-xl" style={{ height: '520px' }}>
    <div className="text-center space-y-2">
      <Radio className="h-8 w-8 text-slate-600 mx-auto animate-pulse" />
      <p className="text-sm text-slate-500">Loading map…</p>
    </div>
  </div>
)})

export default function RDFMapPage() {
  const { user } = useAuth()
  const [rdfCameras,   setRdfCameras]   = useState<CameraNode[]>([])
  const [events,       setEvents]       = useState<IntelligenceEvent[]>([])
  const [alertEvents,  setAlertEvents]  = useState<IntelligenceEvent[]>([])
  const [alertSyncedAt, setAlertSyncedAt] = useState<Date | null>(null)

  useEffect(() => {
    cameraApi.list().then(r => {
      if (r.data?.length) setRdfCameras(r.data.filter((c: CameraNode) => c.institution === 'RDF'))
    }).catch(() => {})
    statsApi.getRecentEvents(50).then(r => {
      if (r.data?.length) setEvents(r.data.filter((e: IntelligenceEvent) => e.source_tag === 'CCTV_NODE'))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const fetchAlerts = () => {
      intelligenceApi.getAlertEvents(24).then(r => {
        if (Array.isArray(r.data)) {
          setAlertEvents(r.data as IntelligenceEvent[])
          setAlertSyncedAt(new Date())
        }
      }).catch(() => {})
    }
    fetchAlerts()
    const id = setInterval(fetchAlerts, 15_000)
    return () => clearInterval(id)
  }, [])

  const onlineCount  = rdfCameras.filter(c => c.is_active).length
  const offlineCount = rdfCameras.filter(c => !c.is_active).length
  const cctvEvents   = events

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">BORDER MAP</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rdf animate-pulse" />
          RDF Border Command
        </div>
      </div>

      {/* Live feed status bar */}
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-2">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="font-medium text-slate-400">{rdfCameras.length} cameras · {events.length} detections</span>
          <span>— use the layer panel inside the map (top-right) to switch base maps and toggle overlays</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            <Bell className="h-3 w-3 text-red-400" />
            <span className="text-red-400 font-bold">{alertEvents.length}</span>
            <span className="text-slate-500">alert signal{alertEvents.length !== 1 ? 's' : ''} · last 24 h</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-slate-500">
            <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            {alertSyncedAt ? `synced ${formatDistanceToNow(alertSyncedAt, { addSuffix: true })}` : 'syncing…'}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-rdf/20">
        <BorderMap cameras={rdfCameras} events={events} alertEvents={alertEvents} />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 flex-wrap px-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="inline-block h-3 w-3 rounded-full bg-green-500 shrink-0" />
          Online Camera
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="inline-block h-3 w-3 rounded-full bg-red-500 shrink-0" />
          Offline Camera
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="inline-block h-3 w-3 rounded-full bg-orange-500 shrink-0 opacity-70" />
          Detection Event
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="RDF Cameras"       value={rdfCameras.length}  icon={Radio}         variant="default" />
        <StatCard label="Online"            value={onlineCount}         icon={Wifi}          variant="ok"    sub="Heartbeat nominal" />
        <StatCard label="Offline"           value={offlineCount}        icon={WifiOff}       variant={offlineCount > 0 ? 'danger' : 'default'} />
        <StatCard label="CCTV Detections"   value={cctvEvents.length}   icon={AlertTriangle} variant={cctvEvents.filter(e => e.criminal_record_found).length > 0 ? 'danger' : 'default'} sub={`${cctvEvents.filter(e => e.criminal_record_found).length} record found`} />
      </div>

      {/* Border post summary cards */}
      <div>
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Border Post Status</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {BORDER_POSTS.map(post => {
            const postCams    = rdfCameras.filter(c => c.node_identifier.startsWith(post.prefix))
            const postOnline  = postCams.filter(c => c.is_active).length
            const postEvents  = cctvEvents.filter(e => e.camera_node_id?.startsWith(post.prefix))
            const allOnline   = postCams.length > 0 && postOnline === postCams.length
            const someOffline = postCams.length > 0 && postOnline < postCams.length && postOnline > 0
            const allOffline  = postCams.length === 0 || postOnline === 0
            return (
              <div
                key={post.code}
                className={clsx(
                  'rounded-xl border p-4',
                  allOnline   ? 'border-green-900/40 bg-green-950/10' :
                  someOffline ? 'border-amber-900/40 bg-amber-950/10' :
                                'border-red-900/40 bg-red-950/10'
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-white">{post.name}</p>
                    <p className="text-[10px] text-slate-500">{post.country}</p>
                  </div>
                  <div className={clsx(
                    'h-2 w-2 rounded-full mt-1 shrink-0',
                    allOnline ? 'bg-green-400 animate-pulse' : someOffline ? 'bg-amber-400' : 'bg-red-500'
                  )} />
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Cameras</span>
                    <span className="text-white font-medium">{postOnline}/{postCams.length}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Events</span>
                    <span className={clsx('font-medium', postEvents.length > 0 ? 'text-orange-400' : 'text-slate-500')}>
                      {postEvents.length}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span className="text-[10px] font-mono text-slate-600">{post.code}</span>
                    <span className="text-[10px] font-mono text-slate-600">{post.lat.toFixed(2)},{post.lng.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { cameraApi, locationApi, intelligenceApi } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { Map, Video, Radio, Users, Bell } from 'lucide-react'
import clsx from 'clsx'
import dynamic from 'next/dynamic'
import type { CameraNode, IntelligenceEvent, LocationRecord } from '@/types'

const MapView = dynamic(() => import('./_MapView'), { ssr: false, loading: () => (
  <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900 flex items-center justify-center" style={{ height: 500 }}>
    <p className="text-sm text-slate-500">Loading map…</p>
  </div>
)})

export default function MapPage() {
  const { user } = useAuth()
  const [cameraNodes,   setCameraNodes]   = useState<CameraNode[]>([])
  const [intelEvents,   setIntelEvents]   = useState<IntelligenceEvent[]>([])
  const [villageEvents, setVillageEvents] = useState<IntelligenceEvent[]>([])
  const [alertEvents,    setAlertEvents]   = useState<IntelligenceEvent[]>([])
  const [alertSyncedAt,  setAlertSyncedAt] = useState<Date | null>(null)

  useEffect(() => {
    cameraApi.list().then(r => {
      if (r.data?.length) {
        setCameraNodes((r.data as CameraNode[]).filter(c => c.latitude != null && c.longitude != null))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    locationApi.getRecentLocations().then(r => {
      if (r.data?.length) {
        const mapped: IntelligenceEvent[] = (r.data as LocationRecord[])
          .filter(loc => loc.latitude != null && loc.longitude != null)
          .map(loc => ({
            id: loc.id,
            source_tag: loc.source_tag,
            suspect_id: loc.suspect_id,
            suspect_name: loc.suspect_name,
            ims_reference: loc.ims_reference,
            criminal_record_found: false,
            alert_generated: false,
            location_lat: loc.latitude,
            location_lng: loc.longitude,
            location_description: loc.location_description,
            created_at: loc.recorded_at,
          }))
        setIntelEvents(mapped)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    intelligenceApi.getVillageEvents().then(r => {
      if (Array.isArray(r.data)) {
        setVillageEvents(
          (r.data as IntelligenceEvent[]).filter(
            ev => ev.location_lat != null && ev.location_lng != null
          )
        )
      }
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Patrol Map</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rnp animate-pulse" />
          RNP Operations
        </div>
      </div>

      {/* Live alert feed status bar */}
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-2">
        <div className="flex items-center gap-2">
          <Map className="h-3.5 w-3.5 text-rnp" />
          <span className="text-xs font-semibold text-slate-300">Layer Control</span>
          <span className="text-[10px] text-slate-500 ml-1">— use the panel inside the map (top-right corner) to switch base maps and toggle overlays</span>
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
      <MapView cameraNodes={cameraNodes} intelEvents={intelEvents} villageEvents={villageEvents} alertEvents={alertEvents} />

      {/* Legend */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-xs font-semibold text-slate-300 mb-3">Map Legend</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] uppercase text-slate-500 font-semibold mb-2 flex items-center gap-1">
              <Video className="h-3 w-3" /> Camera Nodes
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="h-3 w-3 rounded-full bg-green-400 border-2 border-green-300 shrink-0" />
                Online camera node
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="h-3 w-3 rounded-full bg-red-500 border-2 border-red-400 shrink-0" />
                Offline camera node
              </div>
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase text-slate-500 font-semibold mb-2 flex items-center gap-1">
              <Radio className="h-3 w-3" /> Intel Events
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="h-3 w-3 rounded-full bg-red-600 border-2 border-red-400 shrink-0" />
                Criminal record found
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="h-3 w-3 rounded-full bg-blue-500 border-2 border-blue-400 shrink-0" />
                No criminal record
              </div>
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase text-slate-500 font-semibold mb-2 flex items-center gap-1">
              <Users className="h-3 w-3" /> Village Intel
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="h-3 w-3 rounded-full bg-orange-500 border-2 border-orange-300 shrink-0" />
                Village leader detection
              </div>
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase text-slate-500 font-semibold mb-2 flex items-center gap-1">
              <Bell className="h-3 w-3" /> Alert Signals
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="h-3 w-3 rounded-full bg-red-500 border-2 border-red-300 shrink-0 animate-pulse" />
                Live alert with GPS location
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Event summary below map */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">
            Mapped Camera Nodes <span className="text-slate-500 font-normal">({cameraNodes.length})</span>
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {cameraNodes.map(c => (
              <div key={c.id} className="flex items-center gap-2 text-xs border-b border-slate-800/50 pb-1.5">
                <div className={clsx('h-1.5 w-1.5 rounded-full shrink-0', c.is_active ? 'bg-green-400' : 'bg-red-500')} />
                <span className="font-mono text-slate-300">{c.node_identifier}</span>
                <span className="text-slate-500 truncate flex-1">{c.location_name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">
            Mapped Intel Events <span className="text-slate-500 font-normal">({intelEvents.length})</span>
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {intelEvents.map(ev => (
              <div key={ev.id} className="flex items-center gap-2 text-xs border-b border-slate-800/50 pb-1.5">
                <div className={clsx('h-1.5 w-1.5 rounded-full shrink-0', ev.criminal_record_found ? 'bg-red-500' : 'bg-blue-400')} />
                <span className="text-slate-300 font-medium">{ev.suspect_name ?? 'Unknown'}</span>
                <span className="text-slate-500 truncate flex-1">{ev.location_description}</span>
                <span className="text-slate-600 whitespace-nowrap">
                  {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-orange-900/30 bg-orange-950/10 p-5">
          <h3 className="text-sm font-semibold text-orange-300 mb-3 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Village Detections <span className="text-orange-500/60 font-normal">({villageEvents.length})</span>
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {villageEvents.length === 0 && (
              <p className="text-[11px] text-slate-500">No village-level detections on record.</p>
            )}
            {villageEvents.map(ev => (
              <div key={ev.id} className="flex items-center gap-2 text-xs border-b border-orange-900/20 pb-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0 animate-pulse" />
                <span className="text-orange-300 font-medium">{ev.suspect_name ?? 'Unknown'}</span>
                <span className="text-slate-500 truncate flex-1">{ev.location_description}</span>
                <span className="text-slate-600 whitespace-nowrap">
                  {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

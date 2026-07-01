'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { cameraApi, locationApi } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import { Map, Video, Radio } from 'lucide-react'
import clsx from 'clsx'
import dynamic from 'next/dynamic'
import type { CameraNode, IntelligenceEvent, LocationRecord } from '@/types'

// Leaflet must be dynamically imported (no SSR) because it accesses window
const MapView = dynamic(() => import('./_MapView'), { ssr: false, loading: () => (
  <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900 flex items-center justify-center" style={{ height: 500 }}>
    <p className="text-sm text-slate-500">Loading map…</p>
  </div>
)})

export default function MapPage() {
  const { user } = useAuth()
  const [showCameras, setShowCameras] = useState(true)
  const [showEvents, setShowEvents] = useState(true)
  const [cameraNodes, setCameraNodes] = useState<CameraNode[]>([])
  const [intelEvents, setIntelEvents] = useState<IntelligenceEvent[]>([])

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

      {/* Map controls */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <Map className="h-4 w-4 text-rnp" />
            <span className="font-semibold">Map Layers</span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showCameras}
              onChange={e => setShowCameras(e.target.checked)}
              className="accent-rnp h-3.5 w-3.5"
            />
            <span className="text-xs text-slate-300">
              Show Cameras <span className="text-slate-500">({cameraNodes.length})</span>
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showEvents}
              onChange={e => setShowEvents(e.target.checked)}
              className="accent-rnp h-3.5 w-3.5"
            />
            <span className="text-xs text-slate-300">
              Show Intel Events <span className="text-slate-500">({intelEvents.length})</span>
            </span>
          </label>
        </div>
      </div>

      {/* Map */}
      <MapView
        showCameras={showCameras}
        showEvents={showEvents}
        cameraNodes={cameraNodes}
        intelEvents={intelEvents}
      />

      {/* Legend */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-xs font-semibold text-slate-300 mb-3">Map Legend</h3>
        <div className="grid sm:grid-cols-2 gap-4">
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
              <Radio className="h-3 w-3" /> Intelligence Events
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
        </div>
      </div>

      {/* Event summary below map */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Camera list */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">
            Mapped Camera Nodes <span className="text-slate-500 font-normal">({cameraNodes.length})</span>
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {cameraNodes.map(c => (
              <div key={c.id} className="flex items-center gap-2 text-xs border-b border-slate-800/50 pb-1.5">
                <div className={clsx(
                  'h-1.5 w-1.5 rounded-full shrink-0',
                  c.is_active ? 'bg-green-400' : 'bg-red-500'
                )} />
                <span className="font-mono text-slate-300">{c.node_identifier}</span>
                <span className="text-slate-500 truncate flex-1">{c.location_name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Events list */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">
            Mapped Intel Events <span className="text-slate-500 font-normal">({intelEvents.length})</span>
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {intelEvents.map(ev => (
              <div key={ev.id} className="flex items-center gap-2 text-xs border-b border-slate-800/50 pb-1.5">
                <div className={clsx(
                  'h-1.5 w-1.5 rounded-full shrink-0',
                  ev.criminal_record_found ? 'bg-red-500' : 'bg-blue-400'
                )} />
                <span className="text-slate-300 font-medium">{ev.suspect_name ?? 'Unknown'}</span>
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

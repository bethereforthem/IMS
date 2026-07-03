'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip as LeafletTooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { formatDistanceToNow, format } from 'date-fns'
import type { CameraNode, IntelligenceEvent } from '@/types'
import { alarmManager, type MapSoundType } from '@/lib/mapSounds'

interface Props {
  showCameras: boolean
  showEvents: boolean
  cameraNodes: CameraNode[]
  intelEvents: IntelligenceEvent[]
}

function FullscreenEffect() {
  const map = useMap()
  useEffect(() => {
    const handler = () => setTimeout(() => map.invalidateSize(), 150)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [map])
  return null
}

export default function MapView({ showCameras, showEvents, cameraNodes, intelEvents }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const registeredRef = useRef<Set<string>>(new Set())

  // Intel event tracking
  const evSeenRef   = useRef<Set<string>>(new Set())
  const evFirstRef  = useRef(true)

  // Camera offline tracking (skip first render)
  const camOffRef   = useRef<Set<string>>(new Set())
  const camFirstRef = useRef(true)

  // UI state
  const [alarm, setAlarm]         = useState<{ active: boolean; type: MapSoundType | null }>({ active: false, type: null })
  const [isFullscreen, setFullscreen] = useState(false)

  // ── Alarm UI state listener ──────────────────────────────────────────────
  useEffect(() => {
    setAlarm({ active: alarmManager.isBeeping, type: alarmManager.topType })
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ active: boolean; type: MapSoundType | null }>).detail
      setAlarm(d)
    }
    window.addEventListener('ims-alarm', handler)
    return () => window.removeEventListener('ims-alarm', handler)
  }, [])

  // ── Intel event alarms — skip initial load ───────────────────────────────
  useEffect(() => {
    if (evFirstRef.current) {
      evFirstRef.current = false
      intelEvents.forEach(ev => evSeenRef.current.add(ev.id))
      return
    }
    intelEvents.forEach(ev => {
      if (!evSeenRef.current.has(ev.id)) {
        evSeenRef.current.add(ev.id)
        const key  = `ev-${ev.id}`
        const type: MapSoundType = ev.criminal_record_found ? 'criminal' : 'suspect'
        alarmManager.register(key, type)
        registeredRef.current.add(key)
      }
    })
  }, [intelEvents])

  // ── Camera offline alarms — skip initial load ────────────────────────────
  useEffect(() => {
    if (camFirstRef.current) {
      camFirstRef.current = false
      cameraNodes.filter(c => !c.is_active).forEach(c => camOffRef.current.add(c.id))
      return
    }
    const current = new Set(cameraNodes.filter(c => !c.is_active).map(c => c.id))
    for (const id of current) {
      if (!camOffRef.current.has(id)) {
        const key = `cam-${id}`
        alarmManager.register(key, 'offline')
        registeredRef.current.add(key)
      }
    }
    for (const id of camOffRef.current) {
      if (!current.has(id)) {
        const key = `cam-${id}`
        alarmManager.drop(key)
        registeredRef.current.delete(key)
      }
    }
    camOffRef.current = current
  }, [cameraNodes])

  // ── Drop registered alarms on unmount ───────────────────────────────────
  useEffect(() => {
    return () => { registeredRef.current.forEach(id => alarmManager.drop(id)) }
  }, [])

  // ── Fullscreen ───────────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen()
    }
  }

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const alarmLabel =
    alarm.type === 'sos'      ? '🚨 SOS TRIGGERED' :
    alarm.type === 'criminal' ? '⚠ CRIMINAL RECORD' :
    alarm.type === 'suspect'  ? '◉ SUSPECT ALERT' :
                                '⚡ NODE OFFLINE'
  const alarmColor =
    alarm.type === 'sos'      ? '#ef4444' :
    alarm.type === 'criminal' ? '#fb923c' :
    alarm.type === 'suspect'  ? '#fbbf24' : '#94a3b8'

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', height: '500px', width: '100%' }}
      className="rounded-xl overflow-hidden border border-slate-800"
    >
      <MapContainer
        center={[-1.9403, 29.8739]}
        zoom={11}
        zoomSnap={0.5}
        zoomDelta={0.5}
        wheelPxPerZoomLevel={100}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <FullscreenEffect />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {showCameras && cameraNodes.map(cam => (
          <CircleMarker
            key={cam.id}
            center={[cam.latitude!, cam.longitude!]}
            radius={8}
            pathOptions={{
              color:       cam.is_active ? '#4ade80' : '#ef4444',
              fillColor:   cam.is_active ? '#4ade80' : '#ef4444',
              fillOpacity: 0.8, weight: 2,
            }}
          >
            <LeafletTooltip direction="top" offset={[0, -10]}>
              <span className="text-xs font-mono">{cam.node_identifier}</span>
            </LeafletTooltip>
            <Popup>
              <div className="text-xs space-y-1 min-w-[160px]">
                <p className="font-bold font-mono">{cam.node_identifier}</p>
                <p className="text-gray-600">{cam.location_name}</p>
                <p><span className="font-semibold">Institution:</span> {cam.institution}</p>
                <p>
                  <span className="font-semibold">Status:</span>{' '}
                  <span style={{ color: cam.is_active ? '#16a34a' : '#dc2626' }}>
                    {cam.is_active ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </p>
                <p>
                  <span className="font-semibold">Last heartbeat:</span>{' '}
                  {cam.last_heartbeat ? formatDistanceToNow(new Date(cam.last_heartbeat), { addSuffix: true }) : 'N/A'}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {showEvents && intelEvents.map(ev => (
          <CircleMarker
            key={ev.id}
            center={[ev.location_lat!, ev.location_lng!]}
            radius={6}
            pathOptions={{
              color:       ev.criminal_record_found ? '#dc2626' : '#3b82f6',
              fillColor:   ev.criminal_record_found ? '#dc2626' : '#3b82f6',
              fillOpacity: 0.75, weight: 1.5,
            }}
          >
            <LeafletTooltip direction="top" offset={[0, -8]}>
              <span className="text-xs">{ev.suspect_name ?? 'Unknown'}</span>
            </LeafletTooltip>
            <Popup>
              <div className="text-xs space-y-1 min-w-[180px]">
                <p className="font-bold">{ev.suspect_name ?? 'Unknown Subject'}</p>
                <p><span className="font-semibold">Source:</span> {ev.source_tag.replace(/_/g, ' ')}</p>
                {ev.location_description && <p className="text-gray-600">{ev.location_description}</p>}
                {ev.confidence_score != null && (
                  <p><span className="font-semibold">Confidence:</span> {(ev.confidence_score * 100).toFixed(0)}%</p>
                )}
                <p>
                  <span className="font-semibold">Record:</span>{' '}
                  <span style={{ color: ev.criminal_record_found ? '#dc2626' : '#16a34a' }}>
                    {ev.criminal_record_found ? 'FOUND' : 'CLEAR'}
                  </span>
                </p>
                <p className="text-gray-500">{format(new Date(ev.created_at), 'dd MMM yyyy HH:mm')}</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* ── STOP ALARM — top-center ───────────────────────────────────────── */}
      {alarm.active && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1001, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        }}>
          <button
            onClick={() => alarmManager.silence()}
            className="animate-pulse"
            style={{
              background: '#dc2626', border: '2px solid #fca5a5', borderRadius: 4,
              color: '#fff', cursor: 'pointer', padding: '6px 16px',
              fontSize: 12, fontFamily: "'Courier New',monospace",
              fontWeight: 'bold', letterSpacing: '0.5px', whiteSpace: 'nowrap',
            }}
          >
            ⬛ STOP ALARM
          </button>
          <div style={{
            background: '#1e293b', border: '1px solid #334155', borderRadius: 3,
            padding: '2px 10px', fontSize: 9, fontFamily: "'Courier New',monospace",
            letterSpacing: '0.5px', color: alarmColor,
          }}>
            {alarmLabel}
          </div>
        </div>
      )}

      {/* ── Fullscreen toggle — bottom-right ──────────────────────────────── */}
      <button
        onClick={toggleFullscreen}
        title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        style={{
          position: 'absolute', bottom: 30, right: 10, zIndex: 1001,
          background: '#1e293b', border: '1px solid #334155', borderRadius: 4,
          color: '#e2e8f0', cursor: 'pointer', padding: '5px 9px',
          fontSize: 11, fontFamily: "'Courier New',monospace",
          letterSpacing: '0.5px', lineHeight: '1', userSelect: 'none',
        }}
      >
        {isFullscreen ? '⊡ EXIT FULL' : '⛶ FULLSCREEN'}
      </button>
    </div>
  )
}

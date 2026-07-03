'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { formatDistanceToNow, format } from 'date-fns'
import type { CameraNode, IntelligenceEvent } from '@/types'
import { alarmManager, type MapSoundType } from '@/lib/mapSounds'

interface Props {
  cameras: CameraNode[]
  events: IntelligenceEvent[]
  showCameras: boolean
  showDetections: boolean
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

export default function BorderMap({ cameras, events, showCameras, showDetections }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const registeredRef = useRef<Set<string>>(new Set())

  // Event tracking
  const evSeenRef   = useRef<Set<string>>(new Set())
  const evFirstRef  = useRef(true)

  // Camera offline tracking
  const camOffRef   = useRef<Set<string>>(new Set())
  const camFirstRef = useRef(true)

  // UI state
  const [alarm, setAlarm]           = useState<{ active: boolean; type: MapSoundType | null }>({ active: false, type: null })
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

  // ── Detection event alarms — skip initial load ───────────────────────────
  useEffect(() => {
    if (evFirstRef.current) {
      evFirstRef.current = false
      events.forEach(ev => evSeenRef.current.add(ev.id))
      return
    }
    events.forEach(ev => {
      if (!evSeenRef.current.has(ev.id)) {
        evSeenRef.current.add(ev.id)
        const key  = `ev-${ev.id}`
        const type: MapSoundType = ev.criminal_record_found ? 'criminal' : 'suspect'
        alarmManager.register(key, type)
        registeredRef.current.add(key)
      }
    })
  }, [events])

  // ── Camera offline alarms — skip initial load ────────────────────────────
  useEffect(() => {
    if (camFirstRef.current) {
      camFirstRef.current = false
      cameras.filter(c => !c.is_active).forEach(c => camOffRef.current.add(c.id))
      return
    }
    const current = new Set(cameras.filter(c => !c.is_active).map(c => c.id))
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
  }, [cameras])

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
      style={{ position: 'relative', height: '520px', width: '100%' }}
    >
      <MapContainer
        center={[-1.9403, 29.8739]}
        zoom={8}
        zoomSnap={0.5}
        zoomDelta={0.5}
        wheelPxPerZoomLevel={100}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <FullscreenEffect />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {showCameras && cameras.map(cam => {
          if (cam.latitude == null || cam.longitude == null) return null
          return (
            <CircleMarker
              key={cam.id}
              center={[cam.latitude, cam.longitude]}
              radius={10}
              pathOptions={{
                color:       cam.is_active ? '#16a34a' : '#dc2626',
                fillColor:   cam.is_active ? '#22c55e' : '#ef4444',
                fillOpacity: 0.7, weight: 2,
              }}
            >
              <Popup>
                <div className="text-xs space-y-1 min-w-[160px]">
                  <p className="font-bold font-mono text-sm">{cam.node_identifier}</p>
                  <p className="text-slate-600">{cam.location_name}</p>
                  <p className={cam.is_active ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                    {cam.is_active ? '● ONLINE' : '● OFFLINE'}
                  </p>
                  {cam.last_heartbeat && (
                    <p className="text-slate-500">
                      Last seen: {formatDistanceToNow(new Date(cam.last_heartbeat), { addSuffix: true })}
                    </p>
                  )}
                  {cam.latitude != null && (
                    <p className="text-slate-400 font-mono text-[10px]">
                      {cam.latitude.toFixed(4)}, {cam.longitude.toFixed(4)}
                    </p>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          )
        })}

        {showDetections && events.map(ev => {
          if (ev.location_lat == null || ev.location_lng == null) return null
          return (
            <CircleMarker
              key={ev.id}
              center={[ev.location_lat, ev.location_lng]}
              radius={7}
              pathOptions={{
                color:       ev.criminal_record_found ? '#dc2626' : '#ea580c',
                fillColor:   ev.criminal_record_found ? '#ef4444' : '#f97316',
                fillOpacity: 0.7, weight: 2,
              }}
            >
              <Popup>
                <div className="text-xs space-y-1 min-w-[160px]">
                  <p className="font-bold text-sm">{ev.suspect_name ?? 'Unknown Subject'}</p>
                  {ev.camera_node_id && <p className="font-mono text-slate-600">{ev.camera_node_id}</p>}
                  {ev.confidence_score != null && (
                    <p className="text-orange-600 font-semibold">
                      Confidence: {(ev.confidence_score * 100).toFixed(1)}%
                    </p>
                  )}
                  {ev.criminal_record_found && <p className="text-red-600 font-bold">⚠ Record Found</p>}
                  {ev.location_description && <p className="text-slate-500">{ev.location_description}</p>}
                  <p className="text-slate-400">{format(new Date(ev.created_at), 'yyyy-MM-dd HH:mm')}</p>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
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

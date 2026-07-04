'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { formatDistanceToNow, format } from 'date-fns'
import type { CameraNode, IntelligenceEvent } from '@/types'
import { alarmManager, type MapSoundType } from '@/lib/mapSounds'
import { alertSignalIconHtml, alertSignalPopupHtml, alertEventSoundType, alertEventSeverity } from '@/lib/mapAlertUtils'

const THREAT_COLOR = (level?: number) =>
  !level ? '#94a3b8' : level >= 8 ? '#ef4444' : level >= 5 ? '#f97316' : '#fbbf24'

const STATUS_LABEL: Record<string, string> = {
  WANTED:    'WANTED',
  ARRESTED:  'UNDER ARREST',
  CONVICTED: 'CONVICTED',
  MISSING:   'MISSING — SUSPECT',
}

type LayerGroup = { clearLayers: () => void; addTo: (m: unknown) => unknown }

interface Props {
  cameraNodes: CameraNode[]
  intelEvents: IntelligenceEvent[]
  villageEvents?: IntelligenceEvent[]
  alertEvents?: IntelligenceEvent[]
  showCameras?: boolean
  showEvents?: boolean
}

export default function MapView({
  cameraNodes,
  intelEvents,
  villageEvents = [],
  alertEvents = [],
  showCameras = true,
  showEvents = true,
}: Props) {
  const mapRef          = useRef<unknown>(null)
  const divRef          = useRef<HTMLDivElement>(null)
  const containerRef    = useRef<HTMLDivElement>(null)
  const cameraLayerRef  = useRef<LayerGroup | null>(null)
  const eventLayerRef   = useRef<LayerGroup | null>(null)
  const villageLayerRef = useRef<LayerGroup | null>(null)
  const alertLayerRef   = useRef<LayerGroup | null>(null)

  // Alarm tracking
  const registeredRef = useRef<Set<string>>(new Set())
  const evSeenRef     = useRef<Set<string>>(new Set())
  const evFirstRef    = useRef(true)
  const camOffRef     = useRef<Set<string>>(new Set())
  const camFirstRef   = useRef(true)
  const alertSeenRef  = useRef<Set<string>>(new Set())
  const alertFirstRef = useRef(true)

  const [mapReady, setMapReady] = useState(false)
  const [alarm, setAlarm]             = useState<{ active: boolean; type: MapSoundType | null }>({ active: false, type: null })
  const [isFullscreen, setFullscreen] = useState(false)

  // ── Alarm UI listener ──────────────────────────────────────────────────────
  useEffect(() => {
    setAlarm({ active: alarmManager.isBeeping, type: alarmManager.topType })
    const h = (e: Event) => setAlarm((e as CustomEvent<{ active: boolean; type: MapSoundType | null }>).detail)
    window.addEventListener('ims-alarm', h)
    return () => window.removeEventListener('ims-alarm', h)
  }, [])

  // ── Intel event alarms ─────────────────────────────────────────────────────
  useEffect(() => {
    if (evFirstRef.current) { evFirstRef.current = false; intelEvents.forEach(ev => evSeenRef.current.add(ev.id)); return }
    intelEvents.forEach(ev => {
      if (!evSeenRef.current.has(ev.id)) {
        evSeenRef.current.add(ev.id)
        const key = `ev-${ev.id}`
        alarmManager.register(key, ev.criminal_record_found ? 'criminal' : 'suspect')
        registeredRef.current.add(key)
      }
    })
  }, [intelEvents])

  // ── Camera offline alarms ──────────────────────────────────────────────────
  useEffect(() => {
    if (camFirstRef.current) { camFirstRef.current = false; cameraNodes.filter(c => !c.is_active).forEach(c => camOffRef.current.add(c.id)); return }
    const current = new Set(cameraNodes.filter(c => !c.is_active).map(c => c.id))
    for (const id of current) {
      if (!camOffRef.current.has(id)) { alarmManager.register(`cam-${id}`, 'offline'); registeredRef.current.add(`cam-${id}`) }
    }
    for (const id of camOffRef.current) {
      if (!current.has(id)) { alarmManager.drop(`cam-${id}`); registeredRef.current.delete(`cam-${id}`) }
    }
    camOffRef.current = current
  }, [cameraNodes])

  // ── Alert event alarms ─────────────────────────────────────────────────────
  useEffect(() => {
    if (alertFirstRef.current) { alertFirstRef.current = false; alertEvents.forEach(ev => alertSeenRef.current.add(ev.id)); return }
    alertEvents.forEach(ev => {
      if (!alertSeenRef.current.has(ev.id)) {
        alertSeenRef.current.add(ev.id)
        const key = `alert-${ev.id}`
        alarmManager.register(key, alertEventSoundType(ev))
        registeredRef.current.add(key)
      }
    })
  }, [alertEvents])

  useEffect(() => { return () => { registeredRef.current.forEach(id => alarmManager.drop(id)) } }, [])

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) containerRef.current.requestFullscreen().catch(() => {})
    else document.exitFullscreen()
  }
  useEffect(() => {
    const h = () => {
      setFullscreen(!!document.fullscreenElement)
      setTimeout(() => { (mapRef.current as { invalidateSize?: () => void } | null)?.invalidateSize?.() }, 150)
    }
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  // ── Map initialisation — runs ONCE ─────────────────────────────────────────
  useEffect(() => {
    if (!divRef.current || mapRef.current) return

    import('leaflet').then((L) => {
      if (!divRef.current || mapRef.current) return

      if (!document.getElementById('ims-rnp-map-css')) {
        const s = document.createElement('style')
        s.id = 'ims-rnp-map-css'
        s.textContent = `
          @keyframes ims-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.35);opacity:.65} }
          @keyframes ims-village-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.5);opacity:.5} }
          @keyframes ims-alert-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.4);opacity:.75} }
          .leaflet-control-layers { background:#1e293b !important; border:1px solid #334155 !important; border-radius:8px !important; color:#e2e8f0 !important; font-family:'Courier New',monospace !important; font-size:11px !important; box-shadow:0 4px 20px rgba(0,0,0,.6) !important; }
          .leaflet-control-layers-toggle { background-color:#1e293b !important; border:1px solid #334155 !important; width:36px !important; height:36px !important; }
          .leaflet-control-layers-expanded { padding:10px 14px !important; }
          .leaflet-control-layers label { color:#cbd5e1 !important; margin-bottom:4px !important; display:flex !important; align-items:center !important; gap:6px !important; }
          .leaflet-control-layers-separator { border-top:1px solid #334155 !important; margin:6px 0 !important; }
          .leaflet-control-layers-base label span, .leaflet-control-layers-overlays label span { margin-left:4px; }
          .leaflet-control-zoom a { background:#1e293b !important; border:1px solid #334155 !important; color:#94a3b8 !important; }
          .leaflet-control-zoom a:hover { background:#334155 !important; color:#fff !important; }
          .leaflet-popup-content-wrapper { border-radius:4px !important; box-shadow:0 4px 20px rgba(0,0,0,.5) !important; }
          .leaflet-popup-tip-container { display:none; }
        `
        document.head.appendChild(s)
      }

      const map = L.map(divRef.current, { center: [-1.9403, 29.8739], zoom: 11, zoomSnap: 0.5, zoomDelta: 0.5, wheelPxPerZoomLevel: 100 })
      mapRef.current = map

      const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO', maxZoom: 20 })
      const baseLayers: Record<string, L.TileLayer> = {
        '🌑 Dark (Tactical)':    darkLayer,
        '🛰️ Satellite':          L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { subdomains: ['0','1','2','3'], attribution: '&copy; Google', maxZoom: 20, maxNativeZoom: 20 }),
        '🛰️ Satellite + Labels': L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { subdomains: ['0','1','2','3'], attribution: '&copy; Google', maxZoom: 20, maxNativeZoom: 20 }),
        '🗺️ Streets (English)':  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO', maxZoom: 20 }),
        '🗺️ Streets (OSM)':      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }),
        '☀️ Light':              L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO', maxZoom: 20 }),
        '⛰️ Terrain':           L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenTopoMap', maxZoom: 17 }),
      }
      darkLayer.addTo(map)

      const cameraLayer  = L.layerGroup(); if (showCameras) cameraLayer.addTo(map)
      const eventLayer   = L.layerGroup(); if (showEvents)  eventLayer.addTo(map)
      const villageLayer = L.layerGroup().addTo(map)
      const alertLayer   = L.layerGroup().addTo(map)

      cameraLayerRef.current  = cameraLayer  as unknown as LayerGroup
      eventLayerRef.current   = eventLayer   as unknown as LayerGroup
      villageLayerRef.current = villageLayer as unknown as LayerGroup
      alertLayerRef.current   = alertLayer   as unknown as LayerGroup

      L.control.layers(baseLayers, {
        '📷 Camera Nodes':  cameraLayer,
        '🎯 Intel Events':  eventLayer,
        '🏘 Village Intel': villageLayer,
        '🔔 Alert Signals': alertLayer,
      }, { position: 'topright', collapsed: false }).addTo(map)

      L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map)
      setMapReady(true)
    })

    return () => {
      if (mapRef.current) { (mapRef.current as { remove: () => void }).remove(); mapRef.current = null }
      cameraLayerRef.current = null; eventLayerRef.current = null
      villageLayerRef.current = null; alertLayerRef.current = null
    }
  }, []) // ← empty deps: map is never recreated

  // ── Camera layer ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return
    const layer = cameraLayerRef.current; if (!layer) return
    import('leaflet').then((L) => {
      layer.clearLayers()
      cameraNodes.forEach(cam => {
        if (cam.latitude == null || cam.longitude == null) return
        const color = cam.is_active ? '#22c55e' : '#ef4444'
        ;(L.circleMarker([cam.latitude, cam.longitude], { radius: 10, fillOpacity: 0.85, fillColor: color, color: '#ffffff', weight: 2 })
          .bindPopup(`
            <div style="min-width:160px;font-size:12px;padding:2px;font-family:system-ui">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px;font-family:'Courier New',monospace">${cam.node_identifier}</div>
              ${cam.location_name ? `<div style="color:#64748b;margin-bottom:6px">${cam.location_name}</div>` : ''}
              <div style="font-weight:700;color:${color}">${cam.is_active ? '● ONLINE' : '● OFFLINE'}</div>
              ${cam.last_heartbeat ? `<div style="color:#94a3b8;font-size:10px;margin-top:4px">${formatDistanceToNow(new Date(cam.last_heartbeat), { addSuffix: true })}</div>` : ''}
              <div style="color:#94a3b8;font-family:'Courier New',monospace;font-size:10px;margin-top:2px">${cam.latitude.toFixed(4)}, ${cam.longitude!.toFixed(4)}</div>
            </div>
          `, { maxWidth: 240 }) as unknown as { addTo: (g: unknown) => void }).addTo(layer)
      })
    })
  }, [cameraNodes, mapReady])

  // ── Intel event layer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return
    const layer = eventLayerRef.current; if (!layer) return
    import('leaflet').then((L) => {
      layer.clearLayers()
      intelEvents.forEach(ev => {
        if (ev.location_lat == null || ev.location_lng == null) return
        const color = ev.criminal_record_found ? '#ef4444' : '#3b82f6'
        ;(L.circleMarker([ev.location_lat, ev.location_lng], { radius: 7, fillOpacity: 0.8, fillColor: color, color: '#ffffff', weight: 1.5 })
          .bindPopup(`
            <div style="min-width:180px;font-size:12px;padding:2px;font-family:system-ui">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px">${ev.suspect_name ?? 'Unknown Subject'}</div>
              <div style="color:#64748b;margin-bottom:4px">${ev.source_tag.replace(/_/g, ' ')}</div>
              ${ev.location_description ? `<div style="color:#475569;margin-bottom:4px">${ev.location_description}</div>` : ''}
              ${ev.confidence_score != null ? `<div style="color:#94a3b8;font-size:10px">Confidence: ${(ev.confidence_score * 100).toFixed(0)}%</div>` : ''}
              <div style="color:${color};font-weight:700;margin-top:4px">${ev.criminal_record_found ? '⚠ RECORD FOUND' : '✓ CLEAR'}</div>
              <div style="color:#94a3b8;font-size:10px;margin-top:4px">${format(new Date(ev.created_at), 'dd MMM yyyy HH:mm')}</div>
            </div>
          `, { maxWidth: 260 }) as unknown as { addTo: (g: unknown) => void }).addTo(layer)
      })
    })
  }, [intelEvents, mapReady])

  // ── Village intel layer ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return
    const layer = villageLayerRef.current; if (!layer) return
    import('leaflet').then((L) => {
      layer.clearLayers()
      villageEvents.forEach(ev => {
        if (ev.location_lat == null || ev.location_lng == null) return
        const threatColor = THREAT_COLOR(ev.suspect_threat_level)
        const statusLabel = STATUS_LABEL[ev.suspect_status ?? ''] ?? (ev.suspect_status ?? 'UNKNOWN')
        const imsRef      = ev.suspect_ims_reference ?? ev.ims_reference ?? '—'
        const coordStr    = `${ev.location_lat.toFixed(5)}, ${ev.location_lng.toFixed(5)}`
        const icon = L.divIcon({
          className: '', iconSize: [28, 28], iconAnchor: [14, 14],
          html: `<div style="width:28px;height:28px;border-radius:50%;background:rgba(249,115,22,0.85);border:2.5px solid #fed7aa;animation:ims-village-pulse 1.6s ease-in-out infinite;display:flex;align-items:center;justify-content:center;font-size:13px;line-height:1;">👤</div>`,
        })
        ;(L.marker([ev.location_lat, ev.location_lng], { icon })
          .bindPopup(`
            <div style="min-width:220px;font-size:12px;padding:4px;font-family:system-ui;background:#0f172a;color:#e2e8f0;border-radius:4px">
              <div style="background:#431407;border:1px solid #7c2d12;border-radius:3px;padding:4px 8px;margin-bottom:8px">
                <span style="font-size:10px;font-weight:800;color:#fb923c;letter-spacing:1px">🏘 VILLAGE INTEL</span>
              </div>
              <div style="font-weight:700;font-size:14px;margin-bottom:2px;color:#fff">${ev.suspect_name ?? 'Unknown Subject'}</div>
              <div style="font-family:'Courier New',monospace;font-size:10px;color:#64748b;margin-bottom:8px">IMS REF: ${imsRef}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
                <div style="background:#1e293b;border-radius:3px;padding:4px 6px">
                  <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Status</div>
                  <div style="font-size:11px;font-weight:700;color:#fb923c">${statusLabel}</div>
                </div>
                <div style="background:#1e293b;border-radius:3px;padding:4px 6px">
                  <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Threat Level</div>
                  <div style="font-size:13px;font-weight:800;color:${threatColor};font-family:'Courier New',monospace">${ev.suspect_threat_level ?? '—'}/10</div>
                </div>
              </div>
              ${ev.location_description ? `<div style="background:#1e293b;border-radius:3px;padding:4px 6px;margin-bottom:6px"><div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Location</div><div style="font-size:11px;color:#cbd5e1">${ev.location_description}</div><div style="font-size:9px;color:#475569;font-family:'Courier New',monospace;margin-top:2px">${coordStr}</div></div>` : ''}
              <div style="font-size:10px;color:#475569;margin-top:4px;text-align:right">
                Detected ${formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}<br/>
                <span style="font-family:'Courier New',monospace">${format(new Date(ev.created_at), 'dd MMM yyyy HH:mm')}</span>
              </div>
            </div>
          `, { maxWidth: 280 }) as unknown as { addTo: (g: unknown) => void }).addTo(layer)
      })
    })
  }, [villageEvents, mapReady])

  // ── Alert signals layer ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return
    const layer = alertLayerRef.current; if (!layer) return
    import('leaflet').then((L) => {
      layer.clearLayers()
      alertEvents.forEach(ev => {
        if (ev.location_lat == null || ev.location_lng == null) return
        const icon = L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], html: alertSignalIconHtml(alertEventSeverity(ev)) })
        ;(L.marker([ev.location_lat, ev.location_lng], { icon })
          .bindPopup(alertSignalPopupHtml(ev), { maxWidth: 300 }) as unknown as { addTo: (g: unknown) => void }).addTo(layer)
      })
    })
  }, [alertEvents, mapReady])

  const alarmLabel =
    alarm.type === 'sos'      ? '🚨 SOS TRIGGERED'  :
    alarm.type === 'criminal' ? '⚠ CRIMINAL RECORD'  :
    alarm.type === 'suspect'  ? '◉ SUSPECT ALERT'    : '⚡ NODE OFFLINE'
  const alarmColor =
    alarm.type === 'sos'      ? '#ef4444' :
    alarm.type === 'criminal' ? '#fb923c' :
    alarm.type === 'suspect'  ? '#fbbf24' : '#94a3b8'

  return (
    <div ref={containerRef} style={{ position: 'relative', height: '500px', width: '100%' }}
      className="rounded-xl overflow-hidden border border-slate-800">
      <div ref={divRef} style={{ height: '100%', width: '100%', background: '#0f172a' }} />

      {alarm.active && (
        <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 1001, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <button onClick={() => alarmManager.silence()} className="animate-pulse"
            style={{ background: '#dc2626', border: '2px solid #fca5a5', borderRadius: 4, color: '#fff', cursor: 'pointer', padding: '6px 16px', fontSize: 12, fontFamily: "'Courier New',monospace", fontWeight: 'bold', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
            ⬛ STOP ALARM
          </button>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 3, padding: '2px 10px', fontSize: 9, fontFamily: "'Courier New',monospace", letterSpacing: '0.5px', color: alarmColor }}>
            {alarmLabel}
          </div>
        </div>
      )}

      <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        style={{ position: 'absolute', bottom: 40, right: 10, zIndex: 1001, background: '#1e293b', border: '1px solid #334155', borderRadius: 4, color: '#e2e8f0', cursor: 'pointer', padding: '5px 9px', fontSize: 11, fontFamily: "'Courier New',monospace", letterSpacing: '0.5px', lineHeight: '1', userSelect: 'none' }}>
        {isFullscreen ? '⊡ EXIT FULL' : '⛶ FULLSCREEN'}
      </button>
    </div>
  )
}

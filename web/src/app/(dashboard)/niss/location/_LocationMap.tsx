'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { formatDistanceToNow } from 'date-fns'
import type { LocationRecord } from '@/types'
import { alarmManager, type MapSoundType } from '@/lib/mapSounds'
import { alertSignalIconHtml, alertSignalPopupHtml, alertEventSoundType, alertEventSeverity } from '@/lib/mapAlertUtils'
import type { IntelligenceEvent } from '@/types'

export interface FieldAgent {
  id: string
  name: string
  badge: string
  institution: string
  lat: number
  lng: number
  status: 'ACTIVE' | 'SOS' | 'OFFLINE'
  last_ping: string
  heading?: string
}

interface Props {
  locations: LocationRecord[]
  agents?: FieldAgent[]
  alertEvents?: IntelligenceEvent[]
  onDirectAgent?: (agent: FieldAgent) => void
}

const SOURCE_COLORS: Record<string, string> = {
  CCTV_NODE:      '#22c55e',
  FACE_SCAN:      '#f59e0b',
  NID_SCAN:       '#3b82f6',
  NID_MANUAL:     '#6366f1',
  INTERPOL_FEED:  '#ef4444',
  PARTNER_QUERY:  '#8b5cf6',
  OFFICER_REPORT: '#06b6d4',
  SYSTEM_ALERT:   '#f97316',
}

type LayerGroup = { clearLayers: () => void; addTo: (m: unknown) => unknown }

export default function LocationMap({ locations, agents = [], alertEvents = [], onDirectAgent }: Props) {
  const mapRef          = useRef<unknown>(null)
  const divRef          = useRef<HTMLDivElement>(null)
  const containerRef    = useRef<HTMLDivElement>(null)
  const suspectLayerRef = useRef<LayerGroup | null>(null)
  const agentLayerRef   = useRef<LayerGroup | null>(null)
  const alertLayerRef   = useRef<LayerGroup | null>(null)

  // Keep callback in a ref so agent-layer updates don't fire when only callback identity changes
  const onDirectAgentRef = useRef(onDirectAgent)
  onDirectAgentRef.current = onDirectAgent

  // Alarm tracking
  const prevSosRef    = useRef<Set<string>>(new Set())
  const locSeenRef    = useRef<Set<string>>(new Set())
  const locFirstRef   = useRef(true)
  const alertSeenRef  = useRef<Set<string>>(new Set())
  const alertFirstRef = useRef(true)
  const registeredRef = useRef<Set<string>>(new Set())

  // Map-ready gates the layer-update effects so they don't run before Leaflet initialises
  const [mapReady, setMapReady] = useState(false)

  const [alarm, setAlarm]             = useState<{ active: boolean; type: MapSoundType | null }>({ active: false, type: null })
  const [isFullscreen, setFullscreen] = useState(false)

  // ── Alarm UI listener ──────────────────────────────────────────────────────
  useEffect(() => {
    setAlarm({ active: alarmManager.isBeeping, type: alarmManager.topType })
    const h = (e: Event) => {
      setAlarm((e as CustomEvent<{ active: boolean; type: MapSoundType | null }>).detail)
    }
    window.addEventListener('ims-alarm', h)
    return () => window.removeEventListener('ims-alarm', h)
  }, [])

  // ── SOS alarm — fires immediately, no "first-render skip" ─────────────────
  useEffect(() => {
    const current = new Set(agents.filter(a => a.status === 'SOS').map(a => a.id))
    for (const id of current) {
      if (!prevSosRef.current.has(id)) {
        const key = `sos-${id}`
        alarmManager.register(key, 'sos')
        registeredRef.current.add(key)
      }
    }
    for (const id of prevSosRef.current) {
      if (!current.has(id)) {
        alarmManager.drop(`sos-${id}`)
        registeredRef.current.delete(`sos-${id}`)
      }
    }
    prevSosRef.current = current
  }, [agents])

  // ── Location alarm — skips initial batch ──────────────────────────────────
  useEffect(() => {
    if (locFirstRef.current) {
      locFirstRef.current = false
      locations.forEach(l => locSeenRef.current.add(l.id))
      return
    }
    locations.forEach(loc => {
      if (!locSeenRef.current.has(loc.id)) {
        locSeenRef.current.add(loc.id)
        const key  = `loc-${loc.id}`
        const type: MapSoundType = loc.source_tag === 'INTERPOL_FEED' ? 'criminal' : 'suspect'
        alarmManager.register(key, type)
        registeredRef.current.add(key)
      }
    })
  }, [locations])

  // ── Alert alarm — skips initial batch ─────────────────────────────────────
  useEffect(() => {
    if (alertFirstRef.current) {
      alertFirstRef.current = false
      alertEvents.forEach(ev => alertSeenRef.current.add(ev.id))
      return
    }
    alertEvents.forEach(ev => {
      if (!alertSeenRef.current.has(ev.id)) {
        alertSeenRef.current.add(ev.id)
        const key = `alert-${ev.id}`
        alarmManager.register(key, alertEventSoundType(ev))
        registeredRef.current.add(key)
      }
    })
  }, [alertEvents])

  // ── Drop all alarms on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => { registeredRef.current.forEach(id => alarmManager.drop(id)) }
  }, [])

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

  // ── Map initialisation — runs ONCE, never recreates ────────────────────────
  useEffect(() => {
    if (!divRef.current || mapRef.current) return

    import('leaflet').then((L) => {
      if (!divRef.current || mapRef.current) return

      if (!document.getElementById('ims-map-css')) {
        const s = document.createElement('style')
        s.id = 'ims-map-css'
        s.textContent = `
          @keyframes ims-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.25);opacity:0.7} }
          @keyframes ims-ring  { 0%{transform:scale(0.8);opacity:0.8} 100%{transform:scale(2);opacity:0} }
          @keyframes ims-alert-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.4);opacity:.75} }
          .ims-sos-ring {
            position:absolute; inset:-8px; border:3px solid #ef4444; border-radius:50%;
            animation:ims-ring 1.2s ease-out infinite;
          }
          .leaflet-control-layers {
            background:#1e293b !important; border:1px solid #334155 !important;
            border-radius:8px !important; color:#e2e8f0 !important;
            font-family:'Courier New',monospace !important; font-size:11px !important;
            box-shadow:0 4px 20px rgba(0,0,0,0.6) !important;
          }
          .leaflet-control-layers-toggle {
            background-color:#1e293b !important; border:1px solid #334155 !important;
            width:36px !important; height:36px !important;
          }
          .leaflet-control-layers-expanded { padding:10px 14px !important; }
          .leaflet-control-layers label { color:#cbd5e1 !important; margin-bottom:4px; display:flex; align-items:center; gap:6px; }
          .leaflet-control-layers-separator { border-top:1px solid #334155 !important; margin:6px 0 !important; }
          .leaflet-control-layers-base label span,
          .leaflet-control-layers-overlays label span { margin-left:4px; }
          .leaflet-control-zoom a {
            background:#1e293b !important; border:1px solid #334155 !important; color:#94a3b8 !important;
          }
          .leaflet-control-zoom a:hover { background:#334155 !important; color:#fff !important; }
          .leaflet-popup-content-wrapper { border-radius:4px !important; box-shadow:0 4px 20px rgba(0,0,0,0.5) !important; }
          .leaflet-popup-tip-container { display:none; }
        `
        document.head.appendChild(s)
      }

      const map = L.map(divRef.current, {
        center: [-1.9403, 29.8739], zoom: 9, zoomControl: true,
        zoomSnap: 0.5, zoomDelta: 0.5, wheelPxPerZoomLevel: 100,
      })
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

      // Create empty layer groups — they stay alive and are updated in-place
      const suspectLayer = L.layerGroup().addTo(map)
      const agentLayer   = L.layerGroup().addTo(map)
      const alertLayer   = L.layerGroup().addTo(map)

      suspectLayerRef.current = suspectLayer as unknown as LayerGroup
      agentLayerRef.current   = agentLayer   as unknown as LayerGroup
      alertLayerRef.current   = alertLayer   as unknown as LayerGroup

      L.control.layers(
        baseLayers,
        { '🎯 Suspect Locations': suspectLayer, '📡 Field Agents GPS': agentLayer, '🔔 Alert Signals': alertLayer },
        { position: 'topright', collapsed: false }
      ).addTo(map)

      L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map)

      // Signal to data effects that they can now populate their layers
      setMapReady(true)
    })

    return () => {
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove()
        mapRef.current = null
      }
      suspectLayerRef.current = null
      agentLayerRef.current   = null
      alertLayerRef.current   = null
    }
  }, []) // ← empty deps: map lives for the lifetime of this component

  // ── Suspect locations layer — repopulates without touching the map ──────────
  useEffect(() => {
    if (!mapReady) return
    const layer = suspectLayerRef.current
    if (!layer) return

    import('leaflet').then((L) => {
      layer.clearLayers()
      locations.forEach((loc) => {
        const color = SOURCE_COLORS[loc.source_tag] ?? '#22c55e'
        ;(L.circleMarker([loc.latitude, loc.longitude], {
          radius: 16, fillOpacity: 0.12, fillColor: color, color, weight: 0.5,
        }) as unknown as { addTo: (g: unknown) => void }).addTo(layer)
        ;(L.circleMarker([loc.latitude, loc.longitude], {
          radius: 8, fillOpacity: 0.95, fillColor: color, color: '#ffffff', weight: 2,
        })
          .bindPopup(`
            <div style="min-width:210px;font-size:12px;font-family:'Courier New',monospace;padding:2px">
              <div style="font-weight:bold;color:${color};margin-bottom:6px;letter-spacing:1px;font-size:11px">▲ SUSPECT DETECTED</div>
              <div style="font-weight:bold;font-size:14px;color:#0f172a;margin-bottom:2px">${loc.suspect_name ?? 'Unknown Subject'}</div>
              ${loc.ims_reference ? `<div style="color:#64748b;font-size:10px;margin-bottom:6px">REF: ${loc.ims_reference}</div>` : ''}
              ${loc.location_description ? `<div style="color:#475569;margin-bottom:6px">${loc.location_description}</div>` : ''}
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:6px;font-size:10px;line-height:1.8">
                <span style="color:#94a3b8;font-weight:bold">SOURCE&nbsp;</span>${loc.source_tag}<br/>
                <span style="color:#94a3b8;font-weight:bold">TIME&nbsp;&nbsp;&nbsp;</span>${formatDistanceToNow(new Date(loc.recorded_at), { addSuffix: true })}<br/>
                <span style="color:#94a3b8;font-weight:bold">GPS&nbsp;&nbsp;&nbsp;&nbsp;</span>${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}
              </div>
            </div>
          `, { maxWidth: 260 }) as unknown as { addTo: (g: unknown) => void }).addTo(layer)
      })
    })
  }, [locations, mapReady])

  // ── Field agent layer — repopulates without touching the map ───────────────
  useEffect(() => {
    if (!mapReady) return
    const layer = agentLayerRef.current
    if (!layer) return

    import('leaflet').then((L) => {
      layer.clearLayers()
      agents.forEach((agent) => {
        const isSOS     = agent.status === 'SOS'
        const isOffline = agent.status === 'OFFLINE'
        const color     = isSOS ? '#ef4444' : isOffline ? '#64748b' : '#3b82f6'
        const glyph     = isSOS ? '!' : isOffline ? '×' : 'A'
        const statusLbl = isSOS ? '🔴 GPS SOS TRIGGERED' : isOffline ? '⚫ AGENT OFFLINE' : '🔵 FIELD AGENT ACTIVE'

        const icon = L.divIcon({
          html: `
            <div style="position:relative;width:32px;height:32px">
              ${isSOS ? '<div class="ims-sos-ring"></div>' : ''}
              <div style="width:32px;height:32px;background:${color};border:3px solid #fff;border-radius:50%;
                display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:13px;
                box-shadow:0 0 ${isSOS ? 18 : 8}px ${color};position:relative;z-index:1;
                ${isSOS ? 'animation:ims-pulse 0.9s ease-in-out infinite;' : ''}">${glyph}</div>
            </div>`,
          className: '', iconSize: [32, 32], iconAnchor: [16, 16],
        })

        const marker = L.marker([agent.lat, agent.lng], { icon })
        marker.bindPopup(`
          <div style="min-width:220px;font-size:12px;font-family:'Courier New',monospace;padding:2px">
            <div style="font-weight:bold;color:${color};margin-bottom:6px;letter-spacing:1px;font-size:11px">${statusLbl}</div>
            <div style="font-weight:bold;font-size:14px;color:#0f172a;margin-bottom:2px">${agent.name}</div>
            <div style="color:#64748b;margin-bottom:6px">Badge: ${agent.badge} · ${agent.institution}</div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:6px;font-size:10px;line-height:1.8;margin-bottom:8px">
              <span style="color:#94a3b8;font-weight:bold">STATUS&nbsp;</span>${agent.status}<br/>
              <span style="color:#94a3b8;font-weight:bold">PING&nbsp;&nbsp;&nbsp;</span>${formatDistanceToNow(new Date(agent.last_ping), { addSuffix: true })}<br/>
              <span style="color:#94a3b8;font-weight:bold">GPS&nbsp;&nbsp;&nbsp;&nbsp;</span>${agent.lat.toFixed(5)}, ${agent.lng.toFixed(5)}
              ${agent.heading ? `<br/><span style="color:#94a3b8;font-weight:bold">HEADING</span> ${agent.heading}` : ''}
            </div>
            ${onDirectAgentRef.current ? `<button id="direct-${agent.id}" style="width:100%;padding:7px;background:${isSOS ? '#dc2626' : '#3b82f6'};color:white;border:none;cursor:pointer;font-size:11px;font-weight:bold;border-radius:4px;letter-spacing:0.5px;font-family:'Courier New',monospace;">📡 DIRECT THIS AGENT</button>` : ''}
          </div>
        `, { maxWidth: 270 })

        marker.on('popupopen', () => {
          const btn = document.getElementById(`direct-${agent.id}`)
          if (btn) btn.addEventListener('click', () => {
            ;(mapRef.current as { closePopup?: () => void } | null)?.closePopup?.()
            onDirectAgentRef.current?.(agent)
          })
        })
        ;(marker as unknown as { addTo: (g: unknown) => void }).addTo(layer)
      })
    })
  }, [agents, mapReady])

  // ── Alert signals layer — repopulates without touching the map ─────────────
  useEffect(() => {
    if (!mapReady) return
    const layer = alertLayerRef.current
    if (!layer) return

    import('leaflet').then((L) => {
      layer.clearLayers()
      alertEvents.forEach((ev) => {
        if (ev.location_lat == null || ev.location_lng == null) return
        const severity = alertEventSeverity(ev)
        const icon = L.divIcon({
          className: '', iconSize: [30, 30], iconAnchor: [15, 15],
          html: alertSignalIconHtml(severity),
        })
        ;(L.marker([ev.location_lat, ev.location_lng], { icon })
          .bindPopup(alertSignalPopupHtml(ev), { maxWidth: 300 }) as unknown as { addTo: (g: unknown) => void })
          .addTo(layer)
      })
    })
  }, [alertEvents, mapReady])

  // ── Alarm labels ───────────────────────────────────────────────────────────
  const alarmLabel =
    alarm.type === 'sos'      ? '🚨 SOS TRIGGERED' :
    alarm.type === 'criminal' ? '⚠ CRIMINAL RECORD' :
    alarm.type === 'suspect'  ? '◉ SUSPECT ALERT'  : '⚡ NODE OFFLINE'
  const alarmColor =
    alarm.type === 'sos'      ? '#ef4444' :
    alarm.type === 'criminal' ? '#fb923c' :
    alarm.type === 'suspect'  ? '#fbbf24' : '#94a3b8'

  return (
    <div ref={containerRef} style={{ position: 'relative', height: '100%', width: '100%' }}>
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

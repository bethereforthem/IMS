'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { createBaseLayers } from '@/lib/mapBaseLayers'
import { formatDistanceToNow } from 'date-fns'
import type { WebFieldReport, ActiveAgent } from '@/lib/api'

export interface IncidentMapProps {
  reports: WebFieldReport[]
  agents: ActiveAgent[]
  onSelectReport: (r: WebFieldReport) => void
}

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#f59e0b',
  LOW:      '#22c55e',
}

const INST_COLOR: Record<string, string> = {
  NISS:    '#a855f7',
  RNP:     '#3b82f6',
  RDF:     '#22c55e',
  RIB:     '#e11d48',
  RCS:     '#64748b',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletMap = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LayerGroup = any

// Inject emergency pin keyframes + dark control styling once per page load
let _mapCssInjected = false
function injectMapKeyframes() {
  if (_mapCssInjected || typeof document === 'undefined') return
  const style = document.createElement('style')
  style.textContent = `
    @keyframes sos-pulse-ring {
      0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.85), 0 0 18px rgba(239,68,68,0.5); }
      65%  { box-shadow: 0 0 0 14px rgba(239,68,68,0), 0 0 18px rgba(239,68,68,0.5); }
      100% { box-shadow: 0 0 0 0 rgba(239,68,68,0), 0 0 18px rgba(239,68,68,0.5); }
    }
    .sos-map-pin { animation: sos-pulse-ring 1.1s ease-in-out infinite !important; }
    @keyframes rescue-pulse-ring {
      0%   { box-shadow: 0 0 0 0 rgba(245,158,11,0.9), 0 0 20px rgba(245,158,11,0.6); }
      65%  { box-shadow: 0 0 0 16px rgba(245,158,11,0), 0 0 20px rgba(245,158,11,0.6); }
      100% { box-shadow: 0 0 0 0 rgba(245,158,11,0), 0 0 20px rgba(245,158,11,0.6); }
    }
    .rescue-map-pin { animation: rescue-pulse-ring 1.0s ease-in-out infinite !important; }

    /* Match the dark chrome the other operational maps use */
    .incident-map .leaflet-control-zoom a,
    .incident-map .leaflet-control-fullscreen a {
      background:#1e293b !important; color:#cbd5e1 !important;
      border-color:#334155 !important;
    }
    .incident-map .leaflet-control-zoom a:hover,
    .incident-map .leaflet-control-fullscreen a:hover {
      background:#334155 !important; color:#fff !important;
    }
    .incident-map .leaflet-control-fullscreen a {
      font-size:16px; line-height:26px; text-align:center;
      width:30px; height:30px; display:block; text-decoration:none;
      font-weight:700;
    }
    .incident-map .leaflet-control-layers {
      background:#0f172a !important; color:#cbd5e1 !important;
      border:1px solid #334155 !important; border-radius:6px !important;
    }
    .incident-map .leaflet-control-layers-expanded { padding:8px 10px !important; }
    .incident-map .leaflet-control-layers label { font-size:11px; margin-bottom:2px; }
    .incident-map .leaflet-control-layers-separator { border-top:1px solid #334155 !important; }
    .incident-map .leaflet-control-attribution {
      background:rgba(15,23,42,0.75) !important; color:#64748b !important;
    }
    .incident-map .leaflet-control-attribution a { color:#94a3b8 !important; }
    .incident-map .leaflet-control-scale-line {
      background:rgba(15,23,42,0.75) !important; color:#cbd5e1 !important;
      border-color:#475569 !important;
    }
    .incident-map .leaflet-popup-content-wrapper {
      border-radius:4px !important; box-shadow:0 4px 20px rgba(0,0,0,0.5) !important;
    }
    .incident-map .leaflet-popup-tip-container { display:none; }
  `
  document.head.appendChild(style)
  _mapCssInjected = true
}

export default function IncidentMap({ reports, agents, onSelectReport }: IncidentMapProps) {
  const divRef             = useRef<HTMLDivElement>(null)
  const mapRef             = useRef<LeafletMap>(null)
  const reportLayerRef     = useRef<LayerGroup>(null)
  const agentLayerRef      = useRef<LayerGroup>(null)
  const fullscreenBtnRef   = useRef<HTMLAnchorElement | null>(null)
  // Held in a ref so the Leaflet control (created once) always calls the
  // current toggle rather than a stale closure.
  const toggleFullscreenRef = useRef<(() => void) | null>(null)
  const [mapReady, setMapReady]   = useState(false)
  const [maximised, setMaximised] = useState(false)

  toggleFullscreenRef.current = () => setMaximised(v => !v)

  // Keep the control's icon and tooltip in step with the current state, and
  // let Leaflet re-measure after the container changes size.
  useEffect(() => {
    const btn = fullscreenBtnRef.current
    if (btn) {
      btn.innerHTML = maximised ? '⤫' : '⛶'
      btn.title = maximised ? 'Restore map' : 'Maximise map'
      btn.setAttribute('aria-label', btn.title)
    }
    // Wait for the container to settle at its new size before re-measuring,
    // otherwise Leaflet caches the old dimensions and tiles come out grey.
    const id = requestAnimationFrame(() => mapRef.current?.invalidateSize())
    return () => cancelAnimationFrame(id)
  }, [maximised, mapReady])

  // Escape exits, and the page behind must not scroll while maximised.
  useEffect(() => {
    if (!maximised) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMaximised(false) }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [maximised])

  // Initialise Leaflet once
  useEffect(() => {
    const container = divRef.current
    if (!container || mapRef.current) return

    // The dynamic import resolves asynchronously; under StrictMode's double
    // mount the container can already be detached by then, which is what made
    // Leaflet throw "Map container not found".
    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !container.isConnected || mapRef.current) return
      // Leaflet stamps `_leaflet_id` on a container it owns. A Fast Refresh
      // that swaps this module without running cleanup leaves the old map
      // attached, and re-initialising the same node throws "Map container is
      // already initialized" — so adopt-and-reset rather than assume.
      const stamped = container as HTMLDivElement & { _leaflet_id?: number }
      if (stamped._leaflet_id != null) {
        delete stamped._leaflet_id
        container.innerHTML = ''
      }

      // Fix default icon paths
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      injectMapKeyframes()

      const map = L.map(container, {
        center: [-1.9403, 29.8739],   // Rwanda centre
        zoom: 9,
        zoomControl: true,
        zoomSnap: 0.5,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 100,
      })

      // One base layer at full opacity. Previously an OSM layer at 0.5 opacity
      // sat under a dark layer at 0.85, so street names showed through washed
      // out and half-covered — the map read as muddy at every zoom level.
      // Shared across every dashboard map — see lib/mapBaseLayers.ts.
      // These two default to the tactical dark basemap rather than satellite.
      const { layers: baseLayers, initialLayer } = createBaseLayers(L, { initial: '🌑 Dark (Tactical)' })
      initialLayer.addTo(map)

      const reportLayer = L.layerGroup().addTo(map)
      const agentLayer  = L.layerGroup().addTo(map)
      reportLayerRef.current = reportLayer
      agentLayerRef.current  = agentLayer

      L.control.layers(
        baseLayers as never,
        { '📍 Incident Reports': reportLayer, '📡 Field Agents GPS': agentLayer } as never,
        { position: 'topright', collapsed: true },
      ).addTo(map)

      L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map)

      // Maximise / restore, rendered as a Leaflet control so it stacks under
      // the zoom buttons instead of floating over the layer switcher.
      const FullscreenControl = L.Control.extend({
        options: { position: 'topleft' },
        onAdd() {
          const bar = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-fullscreen')
          const btn = L.DomUtil.create('a', '', bar) as HTMLAnchorElement
          btn.href = '#'
          btn.setAttribute('role', 'button')
          btn.innerHTML = '⛶'
          btn.title = 'Maximise map'
          btn.setAttribute('aria-label', 'Maximise map')
          fullscreenBtnRef.current = btn
          L.DomEvent.disableClickPropagation(bar)
          L.DomEvent.on(btn, 'click', (e: Event) => {
            L.DomEvent.stop(e)
            toggleFullscreenRef.current?.()
          })
          return bar
        },
      })
      new FullscreenControl().addTo(map)

      mapRef.current = map
      setMapReady(true)
    })

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      reportLayerRef.current = null
      agentLayerRef.current  = null
      fullscreenBtnRef.current = null
      setMapReady(false)
    }
  }, [])

  // Draw incident report pins
  useEffect(() => {
    if (!mapReady) return
    import('leaflet').then(L => {
      reportLayerRef.current?.clearLayers()
      reports.forEach(r => {
        if (r.location_lat == null || r.location_lng == null) return
        const isSOS     = r.title.startsWith('🚨')
        const isRescue  = r.title.startsWith('🆘')
        const color     = PRIORITY_COLOR[r.priority] ?? '#94a3b8'

        const icon = isSOS
          ? L.divIcon({
              className: '',
              html: `
                <div class="sos-map-pin" style="
                  width:40px;height:40px;border-radius:50%;
                  background:#dc2626;border:3px solid #fff;
                  display:flex;align-items:center;justify-content:center;
                  font-size:18px;z-index:9999;position:relative;
                ">🆘</div>`,
              iconSize: [40, 40],
              iconAnchor: [20, 20],
            })
          : isRescue
          ? L.divIcon({
              className: '',
              html: `
                <div class="rescue-map-pin" style="
                  width:42px;height:42px;border-radius:50%;
                  background:#d97706;border:3px solid #fef3c7;
                  display:flex;align-items:center;justify-content:center;
                  font-size:20px;z-index:9998;position:relative;
                ">👑</div>`,
              iconSize: [42, 42],
              iconAnchor: [21, 21],
            })
          : L.divIcon({
              className: '',
              html: `
                <div style="
                  width:28px;height:28px;border-radius:50%;
                  background:${color};border:2px solid #fff;
                  display:flex;align-items:center;justify-content:center;
                  box-shadow:0 0 8px ${color}88;
                  font-size:13px;
                ">📍</div>`,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            })

        const marker = L.marker([r.location_lat, r.location_lng], { icon })
        const age = formatDistanceToNow(new Date(r.created_at), { addSuffix: true })
        marker.bindPopup(`
          <div style="font-family:system-ui;min-width:220px;color:#1e293b">
            ${isSOS ? `<div style="background:#dc2626;color:#fff;font-size:10px;font-weight:800;
              text-align:center;padding:4px 8px;margin:-8px -8px 8px;border-radius:4px 4px 0 0;
              letter-spacing:1px">🆘 EMERGENCY SOS</div>` : ''}
            ${isRescue ? `<div style="background:#d97706;color:#fff;font-size:10px;font-weight:800;
              text-align:center;padding:4px 8px;margin:-8px -8px 8px;border-radius:4px 4px 0 0;
              letter-spacing:1px">👑 COMMANDER RESCUE</div>` : ''}
            <div style="font-weight:700;font-size:13px;margin-bottom:4px">${r.title}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:6px">
              ${r.category} · ${r.priority} · ${age}
            </div>
            <div style="font-size:11px;color:#475569;margin-bottom:6px">
              ${r.agent_name ?? '?'} (${r.agent_institution ?? '?'})
            </div>
            <button
              onclick="window.__selectReport('${r.id}')"
              style="
                background:${isSOS ? '#dc2626' : isRescue ? '#d97706' : '#6d28d9'};color:#fff;border:none;
                border-radius:4px;padding:5px 10px;
                font-size:11px;cursor:pointer;width:100%;
              "
            >View Full Report</button>
          </div>
        `, { maxWidth: 260 })

        marker.addTo(reportLayerRef.current)
      })

      // Bridge: expose callback so popup button can call it
      window.__selectReport = (id: string) => {
        const r = reports.find(x => x.id === id)
        if (r) { onSelectReport(r) }
      }
    })
  }, [mapReady, reports, onSelectReport])

  // Draw live agent pins
  useEffect(() => {
    if (!mapReady) return
    import('leaflet').then(L => {
      agentLayerRef.current?.clearLayers()
      agents.forEach(a => {
        if (a.last_lat == null || a.last_lng == null) return
        const color     = INST_COLOR[a.agent_institution ?? ''] ?? '#94a3b8'
        const isActive  = a.session_status === 'ACTIVE'
        const isOffline = a.availability_status === 'OFFLINE'
        const isGpsLost = a.availability_status === 'GPS_DISABLED'

        const icon = isOffline
          ? L.divIcon({
              className: '',
              html: `
                <div style="
                  width:26px;height:26px;border-radius:4px;
                  background:#374151;border:2px solid #f97316;
                  display:flex;align-items:center;justify-content:center;
                  font-size:12px;position:relative;
                  box-shadow:0 0 8px rgba(249,115,22,0.6);
                ">📵
                  <span style="
                    position:absolute;top:-5px;right:-5px;
                    background:#ef4444;color:#fff;
                    font-size:7px;font-weight:900;
                    padding:1px 3px;border-radius:3px;
                    letter-spacing:0.5px;line-height:1.2;
                  ">OFF</span>
                </div>`,
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            })
          : isGpsLost
          ? L.divIcon({
              className: '',
              html: `
                <div style="
                  width:24px;height:24px;border-radius:4px;
                  background:${color};border:2px solid #f59e0b;
                  display:flex;align-items:center;justify-content:center;
                  font-size:10px;opacity:0.75;
                  box-shadow:0 0 6px rgba(245,158,11,0.5);
                ">📡
                  <span style="
                    position:absolute;top:-4px;right:-4px;
                    background:#f59e0b;color:#fff;
                    font-size:7px;font-weight:900;
                    padding:1px 2px;border-radius:2px;
                  ">GPS</span>
                </div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            })
          : L.divIcon({
              className: '',
              html: `
                <div style="
                  width:22px;height:22px;border-radius:4px;
                  background:${color};border:2px solid #fff;
                  display:flex;align-items:center;justify-content:center;
                  font-size:10px;opacity:${isActive ? 1 : 0.5};
                ">👤</div>`,
              iconSize: [22, 22],
              iconAnchor: [11, 11],
            })

        const age = a.last_ping_at
          ? formatDistanceToNow(new Date(a.last_ping_at), { addSuffix: true })
          : 'unknown'

        const offlineSince = a.offline_since
          ? formatDistanceToNow(new Date(a.offline_since), { addSuffix: true })
          : null

        const marker = L.marker([a.last_lat, a.last_lng], { icon })
        marker.bindPopup(`
          <div style="font-family:system-ui;min-width:200px;color:#1e293b">
            ${isOffline ? `<div style="background:#ef4444;color:#fff;font-size:10px;font-weight:800;
              text-align:center;padding:3px 8px;margin:-8px -8px 8px;border-radius:4px 4px 0 0;
              letter-spacing:1px">📵 AGENT OFFLINE${offlineSince ? ' · ' + offlineSince : ''}</div>` : ''}
            ${isGpsLost ? `<div style="background:#f59e0b;color:#fff;font-size:10px;font-weight:800;
              text-align:center;padding:3px 8px;margin:-8px -8px 8px;border-radius:4px 4px 0 0;
              letter-spacing:1px">📡 GPS SIGNAL LOST</div>` : ''}
            <div style="font-weight:700;font-size:12px">${a.agent_name ?? 'Agent'}</div>
            <div style="font-size:11px;color:#64748b">${a.agent_badge} · ${a.agent_institution}</div>
            <div style="font-size:11px;color:#475569;margin-top:4px">
              ${isOffline ? '🔴 OFFLINE' : isGpsLost ? '🟡 GPS Disabled' : isActive ? '🟢 Tracking Active' : '🟡 Paused'} · ${age}
            </div>
            ${isOffline && a.offline_reason ? `<div style="font-size:10px;color:#dc2626;margin-top:2px">Reason: ${a.offline_reason.replace('_', ' ')}</div>` : ''}
            ${a.report_title ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px">${a.report_title}</div>` : ''}
          </div>
        `, { maxWidth: 220 })

        marker.addTo(agentLayerRef.current)
      })
    })
  }, [mapReady, agents])

  return (
    <div
      className={maximised
        ? 'fixed inset-0 z-[10000] bg-slate-950 p-3 flex flex-col gap-2'
        : 'w-full h-full'}
    >
      {maximised && (
        <div className="flex items-center justify-between shrink-0 px-1">
          <p className="text-xs font-bold text-white uppercase tracking-wider">
            Field Incidents — Full Screen
          </p>
          <button
            onClick={() => setMaximised(false)}
            className="text-[11px] text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg px-3 py-1.5 transition"
          >
            Exit full screen · Esc
          </button>
        </div>
      )}
      <div
        ref={divRef}
        className="incident-map"
        style={{
          width: '100%',
          height: '100%',
          flex: maximised ? '1 1 auto' : undefined,
          borderRadius: maximised ? '8px' : '12px',
          minHeight: maximised ? 0 : '480px',
        }}
      />
    </div>
  )
}

// Augment Window to allow popup bridging
declare global {
  interface Window {
    __selectReport: (id: string) => void
  }
}

'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import { formatDistanceToNow } from 'date-fns'
import type { LocationRecord } from '@/types'

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
  onDirectAgent?: (agent: FieldAgent) => void
}

const SOURCE_COLORS: Record<string, string> = {
  CCTV_NODE:     '#22c55e',
  FACE_SCAN:     '#f59e0b',
  NID_SCAN:      '#3b82f6',
  NID_MANUAL:    '#6366f1',
  INTERPOL_FEED: '#ef4444',
  PARTNER_QUERY: '#8b5cf6',
  OFFICER_REPORT:'#06b6d4',
  SYSTEM_ALERT:  '#f97316',
}

export default function LocationMap({ locations, agents = [], onDirectAgent }: Props) {
  const mapRef = useRef<unknown>(null)
  const divRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!divRef.current) return

    // Destroy any stale instance to prevent "already initialized" error
    if (mapRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mapRef.current as any).remove()
      mapRef.current = null
    }

    import('leaflet').then((L) => {
      if (!divRef.current || mapRef.current) return

      // ── Inject CSS once (layer control style overrides + pulse) ─────────────
      if (!document.getElementById('ims-map-css')) {
        const s = document.createElement('style')
        s.id = 'ims-map-css'
        s.textContent = `
          @keyframes ims-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.25);opacity:0.7} }
          @keyframes ims-ring  { 0%{transform:scale(0.8);opacity:0.8} 100%{transform:scale(2);opacity:0} }
          .ims-sos-ring {
            position:absolute; inset:-8px;
            border:3px solid #ef4444;
            border-radius:50%;
            animation:ims-ring 1.2s ease-out infinite;
          }
          /* Style the Leaflet layer control to match dark UI */
          .leaflet-control-layers {
            background:#1e293b !important;
            border:1px solid #334155 !important;
            border-radius:8px !important;
            color:#e2e8f0 !important;
            font-family:'Courier New',monospace !important;
            font-size:11px !important;
            box-shadow:0 4px 20px rgba(0,0,0,0.6) !important;
          }
          .leaflet-control-layers-toggle {
            background-color:#1e293b !important;
            border:1px solid #334155 !important;
            width:36px !important; height:36px !important;
          }
          .leaflet-control-layers-expanded { padding:10px 14px !important; }
          .leaflet-control-layers label { color:#cbd5e1 !important; margin-bottom:4px; display:flex; align-items:center; gap:6px; }
          .leaflet-control-layers-separator { border-top:1px solid #334155 !important; margin:6px 0 !important; }
          .leaflet-control-layers-base label span,
          .leaflet-control-layers-overlays label span { margin-left:4px; }
          .leaflet-control-zoom a {
            background:#1e293b !important;
            border:1px solid #334155 !important;
            color:#94a3b8 !important;
          }
          .leaflet-control-zoom a:hover { background:#334155 !important; color:#fff !important; }
          .leaflet-popup-content-wrapper {
            border-radius:4px !important;
            box-shadow:0 4px 20px rgba(0,0,0,0.5) !important;
          }
          .leaflet-popup-tip-container { display:none; }
        `
        document.head.appendChild(s)
      }

      const map = L.map(divRef.current, {
        center:      [-1.9403, 29.8739],
        zoom:         9,
        zoomControl:  true,
        preferCanvas: true,
      })
      mapRef.current = map

      // ── Base layers (user selects one) ────────────────────────────────────
      const baseLayers: Record<string, L.TileLayer> = {
        '🌑 Dark (Tactical)': L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          { attribution: '&copy; CARTO', maxZoom: 19 }
        ),
        '🛰️ Satellite': L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          { attribution: '&copy; Esri &mdash; Esri, DigitalGlobe, GeoEye, i-cubed', maxZoom: 19 }
        ),
        '🗺️ Streets (OSM)': L.tileLayer(
          'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          { attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>', maxZoom: 19 }
        ),
        '☀️ Light': L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
          { attribution: '&copy; CARTO', maxZoom: 19 }
        ),
        '⛰️ Terrain': L.tileLayer(
          'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
          { attribution: '&copy; OpenTopoMap', maxZoom: 17 }
        ),
      }

      // Dark is the default
      baseLayers['🌑 Dark (Tactical)'].addTo(map)

      // ── Overlay layers (user toggles independently) ───────────────────────
      const suspectLayer = L.layerGroup()
      const agentLayer   = L.layerGroup()

      // ── Suspect / location markers ────────────────────────────────────────
      locations.forEach((loc) => {
        const color = SOURCE_COLORS[loc.source_tag] ?? '#22c55e'

        // Outer glow ring
        L.circleMarker([loc.latitude, loc.longitude], {
          radius:      16,
          fillOpacity: 0.12,
          fillColor:   color,
          color:       color,
          weight:      0.5,
        }).addTo(suspectLayer)

        // Main dot
        L.circleMarker([loc.latitude, loc.longitude], {
          radius:      8,
          fillOpacity: 0.95,
          fillColor:   color,
          color:       '#ffffff',
          weight:      2,
        })
          .bindPopup(`
            <div style="min-width:210px;font-size:12px;font-family:'Courier New',monospace;padding:2px">
              <div style="font-weight:bold;color:${color};margin-bottom:6px;letter-spacing:1px;font-size:11px">
                ▲ SUSPECT DETECTED
              </div>
              <div style="font-weight:bold;font-size:14px;color:#0f172a;margin-bottom:2px">
                ${loc.suspect_name ?? 'Unknown Subject'}
              </div>
              ${loc.ims_reference
                ? `<div style="color:#64748b;font-size:10px;margin-bottom:6px">REF: ${loc.ims_reference}</div>`
                : ''}
              ${loc.location_description
                ? `<div style="color:#475569;margin-bottom:6px">${loc.location_description}</div>`
                : ''}
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:6px;font-size:10px;line-height:1.8">
                <span style="color:#94a3b8;font-weight:bold">SOURCE&nbsp;</span>${loc.source_tag}<br/>
                <span style="color:#94a3b8;font-weight:bold">TIME&nbsp;&nbsp;&nbsp;</span>${formatDistanceToNow(new Date(loc.recorded_at), { addSuffix: true })}<br/>
                <span style="color:#94a3b8;font-weight:bold">GPS&nbsp;&nbsp;&nbsp;&nbsp;</span>${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}
              </div>
            </div>
          `, { maxWidth: 260 })
          .addTo(suspectLayer)
      })

      // ── Field agent GPS markers ───────────────────────────────────────────
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
              <div style="
                width:32px;height:32px;
                background:${color};
                border:3px solid #fff;
                border-radius:50%;
                display:flex;align-items:center;justify-content:center;
                color:white;font-weight:900;font-size:13px;
                box-shadow:0 0 ${isSOS ? 18 : 8}px ${color};
                position:relative;z-index:1;
                ${isSOS ? 'animation:ims-pulse 0.9s ease-in-out infinite;' : ''}
              ">${glyph}</div>
            </div>
          `,
          className:  '',
          iconSize:   [32, 32],
          iconAnchor: [16, 16],
        })

        const marker = L.marker([agent.lat, agent.lng], { icon })

        marker.bindPopup(`
          <div style="min-width:220px;font-size:12px;font-family:'Courier New',monospace;padding:2px">
            <div style="font-weight:bold;color:${color};margin-bottom:6px;letter-spacing:1px;font-size:11px">
              ${statusLbl}
            </div>
            <div style="font-weight:bold;font-size:14px;color:#0f172a;margin-bottom:2px">${agent.name}</div>
            <div style="color:#64748b;margin-bottom:6px">Badge: ${agent.badge} · ${agent.institution}</div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:6px;font-size:10px;line-height:1.8;margin-bottom:8px">
              <span style="color:#94a3b8;font-weight:bold">STATUS&nbsp;</span>${agent.status}<br/>
              <span style="color:#94a3b8;font-weight:bold">PING&nbsp;&nbsp;&nbsp;</span>${formatDistanceToNow(new Date(agent.last_ping), { addSuffix: true })}<br/>
              <span style="color:#94a3b8;font-weight:bold">GPS&nbsp;&nbsp;&nbsp;&nbsp;</span>${agent.lat.toFixed(5)}, ${agent.lng.toFixed(5)}
              ${agent.heading ? `<br/><span style="color:#94a3b8;font-weight:bold">HEADING</span> ${agent.heading}` : ''}
            </div>
            ${onDirectAgent
              ? `<button id="direct-${agent.id}" style="
                  width:100%;padding:7px;
                  background:${isSOS ? '#dc2626' : '#3b82f6'};
                  color:white;border:none;cursor:pointer;
                  font-size:11px;font-weight:bold;
                  border-radius:4px;letter-spacing:0.5px;
                  font-family:'Courier New',monospace;">
                  📡 DIRECT THIS AGENT
                </button>`
              : ''
            }
          </div>
        `, { maxWidth: 270 })

        marker.on('popupopen', () => {
          const btn = document.getElementById(`direct-${agent.id}`)
          if (btn && onDirectAgent) {
            btn.addEventListener('click', () => {
              map.closePopup()
              onDirectAgent(agent)
            })
          }
        })

        marker.addTo(agentLayer)
      })

      // Add overlays to map by default
      suspectLayer.addTo(map)
      agentLayer.addTo(map)

      // ── Layer control (top-right) ─────────────────────────────────────────
      L.control.layers(
        baseLayers,
        {
          '🎯 Suspect Locations': suspectLayer,
          '📡 Field Agents GPS':  agentLayer,
        },
        { position: 'topright', collapsed: false }
      ).addTo(map)

      // Scale bar
      L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map)
    })

    return () => {
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(mapRef.current as any).remove()
        mapRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, agents])

  return <div ref={divRef} style={{ height: '100%', width: '100%', background: '#0f172a' }} />
}

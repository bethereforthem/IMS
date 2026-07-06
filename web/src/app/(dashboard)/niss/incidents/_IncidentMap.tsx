'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
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

// Inject emergency pin keyframe animations once per page load
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
  `
  document.head.appendChild(style)
  _mapCssInjected = true
}

export default function IncidentMap({ reports, agents, onSelectReport }: IncidentMapProps) {
  const divRef           = useRef<HTMLDivElement>(null)
  const mapRef           = useRef<LeafletMap>(null)
  const reportLayerRef   = useRef<LayerGroup>(null)
  const agentLayerRef    = useRef<LayerGroup>(null)
  const [mapReady, setMapReady] = useState(false)

  // Initialise Leaflet once
  useEffect(() => {
    if (!divRef.current || mapRef.current) return

    import('leaflet').then(L => {
      // Fix default icon paths
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(divRef.current!, {
        center: [-1.9403, 29.8739],   // Rwanda centre
        zoom: 9,
        zoomControl: true,
        attributionControl: false,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        opacity: 0.5,
      }).addTo(map)

      // Dark overlay via CartoDB
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        opacity: 0.85,
      }).addTo(map)

      reportLayerRef.current = L.layerGroup().addTo(map)
      agentLayerRef.current  = L.layerGroup().addTo(map)

      injectMapKeyframes()
      mapRef.current = map
      setMapReady(true)
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
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
      ref={divRef}
      style={{ width: '100%', height: '100%', borderRadius: '12px', minHeight: '480px' }}
    />
  )
}

// Augment Window to allow popup bridging
declare global {
  interface Window {
    __selectReport: (id: string) => void
  }
}

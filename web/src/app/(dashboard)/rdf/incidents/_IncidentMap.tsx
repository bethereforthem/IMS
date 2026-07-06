'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { formatDistanceToNow } from 'date-fns'
import type { WebFieldReport, ActiveAgent } from '@/lib/api'

export interface RDFIncidentMapProps {
  reports: WebFieldReport[]
  agents: ActiveAgent[]
  borderPosts: BorderPost[]
  onSelectReport: (r: WebFieldReport) => void
}

export interface BorderPost {
  name: string
  country: string
  code: string
  lat: number
  lng: number
}

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#f59e0b',
  LOW:      '#22c55e',
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

export default function RDFIncidentMap({ reports, agents, borderPosts, onSelectReport }: RDFIncidentMapProps) {
  const divRef         = useRef<HTMLDivElement>(null)
  const mapRef         = useRef<LeafletMap>(null)
  const reportLayer    = useRef<LayerGroup>(null)
  const agentLayer     = useRef<LayerGroup>(null)
  const borderLayer    = useRef<LayerGroup>(null)
  const [mapReady, setMapReady] = useState(false)

  // Init Leaflet map once
  useEffect(() => {
    if (!divRef.current || mapRef.current) return

    import('leaflet').then(L => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(divRef.current!, {
        center: [-1.9403, 29.8739],
        zoom: 8,
        zoomControl: true,
        attributionControl: false,
      })

      // Dark basemap
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        opacity: 0.9,
      }).addTo(map)

      reportLayer.current = L.layerGroup().addTo(map)
      agentLayer.current  = L.layerGroup().addTo(map)
      borderLayer.current = L.layerGroup().addTo(map)

      injectMapKeyframes()
      mapRef.current = map
      setMapReady(true)
    })

    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [])

  // Draw border post markers (static)
  useEffect(() => {
    if (!mapReady) return
    import('leaflet').then(L => {
      borderLayer.current?.clearLayers()
      borderPosts.forEach(post => {
        const icon = L.divIcon({
          className: '',
          html: `
            <div style="
              background:#064e3b;border:1.5px solid #10b981;
              border-radius:4px;padding:3px 7px;
              font-size:9px;font-weight:800;color:#6ee7b7;
              white-space:nowrap;box-shadow:0 0 6px #10b98155;
            ">${post.code}</div>`,
          iconAnchor: [20, 10],
        })
        L.marker([post.lat, post.lng], { icon })
          .bindPopup(`
            <div style="font-family:system-ui;color:#1e293b;min-width:150px">
              <div style="font-weight:700;font-size:12px">${post.name} Border Post</div>
              <div style="font-size:11px;color:#64748b">Entry to/from: ${post.country}</div>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px">Code: ${post.code}</div>
            </div>
          `, { maxWidth: 200 })
          .addTo(borderLayer.current)
      })
    })
  }, [mapReady, borderPosts])

  // Draw incident report pins
  useEffect(() => {
    if (!mapReady) return
    import('leaflet').then(L => {
      reportLayer.current?.clearLayers()
      reports.forEach(r => {
        if (r.location_lat == null || r.location_lng == null) return
        const isSOS    = r.title.startsWith('🚨')
        const isRescue = r.title.startsWith('🆘')
        const color    = PRIORITY_COLOR[r.priority] ?? '#94a3b8'

        const icon = isSOS
          ? L.divIcon({
              className: '',
              html: `<div class="sos-map-pin" style="
                width:40px;height:40px;border-radius:50%;
                background:#dc2626;border:3px solid #fff;
                display:flex;align-items:center;justify-content:center;
                font-size:18px;position:relative;z-index:9999;
              ">🆘</div>`,
              iconSize: [40, 40],
              iconAnchor: [20, 20],
            })
          : isRescue
          ? L.divIcon({
              className: '',
              html: `<div class="rescue-map-pin" style="
                width:42px;height:42px;border-radius:50%;
                background:#d97706;border:3px solid #fef3c7;
                display:flex;align-items:center;justify-content:center;
                font-size:20px;position:relative;z-index:9998;
              ">👑</div>`,
              iconSize: [42, 42],
              iconAnchor: [21, 21],
            })
          : L.divIcon({
              className: '',
              html: `
                <div style="
                  width:32px;height:32px;border-radius:50%;
                  background:${color};border:2.5px solid #fff;
                  display:flex;align-items:center;justify-content:center;
                  box-shadow:0 0 12px ${color}99;font-size:14px;
                ">⚠️</div>`,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            })

        const age = formatDistanceToNow(new Date(r.created_at), { addSuffix: true })
        L.marker([r.location_lat, r.location_lng], { icon })
          .bindPopup(`
            <div style="font-family:system-ui;min-width:230px;color:#1e293b">
              ${isSOS ? `<div style="background:#dc2626;color:#fff;font-size:10px;font-weight:800;
                text-align:center;padding:4px 8px;margin:-8px -8px 8px;border-radius:4px 4px 0 0;
                letter-spacing:1px">🆘 EMERGENCY SOS</div>` : isRescue ? `<div style="background:#d97706;color:#fff;font-size:10px;font-weight:800;
                text-align:center;padding:4px 8px;margin:-8px -8px 8px;border-radius:4px 4px 0 0;
                letter-spacing:1px">👑 COMMANDER RESCUE</div>` : `<div style="
                font-size:9px;font-weight:800;letter-spacing:0.5px;color:#16a34a;
                text-transform:uppercase;margin-bottom:4px
              ">RDF Field Report · ${r.priority}</div>`}
              <div style="font-weight:700;font-size:13px;margin-bottom:3px">${r.title}</div>
              <div style="font-size:11px;color:#64748b;margin-bottom:5px">
                ${r.category} · ${age}
              </div>
              <div style="font-size:11px;color:#475569;margin-bottom:6px">
                ${r.agent_name ?? '?'} · ${r.agent_badge ?? ''}
              </div>
              <button
                onclick="window.__rdfSelectReport('${r.id}')"
                style="
                  background:${isSOS ? '#dc2626' : isRescue ? '#d97706' : '#15803d'};color:#fff;border:none;
                  border-radius:4px;padding:5px 10px;
                  font-size:11px;cursor:pointer;width:100%;
                "
              >View Full Report</button>
            </div>
          `, { maxWidth: 270 })
          .addTo(reportLayer.current)
      })

      window.__rdfSelectReport = (id: string) => {
        const r = reports.find(x => x.id === id)
        if (r) onSelectReport(r)
      }
    })
  }, [mapReady, reports, onSelectReport])

  // Draw active agent markers
  useEffect(() => {
    if (!mapReady) return
    import('leaflet').then(L => {
      agentLayer.current?.clearLayers()
      agents.forEach(a => {
        if (a.last_lat == null || a.last_lng == null) return
        const isActive  = a.session_status === 'ACTIVE'
        const isOffline = a.availability_status === 'OFFLINE'
        const isGpsLost = a.availability_status === 'GPS_DISABLED'

        const icon = isOffline
          ? L.divIcon({
              className: '',
              html: `<div style="width:26px;height:26px;border-radius:4px;
                background:#374151;border:2px solid #f97316;
                display:flex;align-items:center;justify-content:center;
                font-size:12px;position:relative;box-shadow:0 0 8px rgba(249,115,22,0.6);">📵
                <span style="position:absolute;top:-5px;right:-5px;background:#ef4444;color:#fff;
                  font-size:7px;font-weight:900;padding:1px 3px;border-radius:3px;">OFF</span>
              </div>`,
              iconSize: [26, 26], iconAnchor: [13, 13],
            })
          : isGpsLost
          ? L.divIcon({
              className: '',
              html: `<div style="width:24px;height:24px;border-radius:4px;
                background:#15803d;border:2px solid #f59e0b;
                display:flex;align-items:center;justify-content:center;
                font-size:11px;opacity:0.75;position:relative;box-shadow:0 0 6px rgba(245,158,11,0.5);">🪖
                <span style="position:absolute;top:-4px;right:-4px;background:#f59e0b;color:#fff;
                  font-size:7px;font-weight:900;padding:1px 2px;border-radius:2px;">GPS</span>
              </div>`,
              iconSize: [24, 24], iconAnchor: [12, 12],
            })
          : L.divIcon({
              className: '',
              html: `<div style="width:22px;height:22px;border-radius:4px;
                background:#15803d;border:2px solid #86efac;
                display:flex;align-items:center;justify-content:center;
                font-size:11px;opacity:${isActive ? 1 : 0.5};
                box-shadow:0 0 6px #16a34a66;">🪖</div>`,
              iconSize: [22, 22], iconAnchor: [11, 11],
            })

        const age = a.last_ping_at
          ? formatDistanceToNow(new Date(a.last_ping_at), { addSuffix: true })
          : 'unknown'
        const offlineSince = a.offline_since
          ? formatDistanceToNow(new Date(a.offline_since), { addSuffix: true })
          : null

        L.marker([a.last_lat, a.last_lng], { icon })
          .bindPopup(`
            <div style="font-family:system-ui;min-width:200px;color:#1e293b">
              ${isOffline ? `<div style="background:#ef4444;color:#fff;font-size:10px;font-weight:800;
                text-align:center;padding:3px 8px;margin:-8px -8px 8px;border-radius:4px 4px 0 0;
                letter-spacing:1px">📵 AGENT OFFLINE${offlineSince ? ' · ' + offlineSince : ''}</div>` : ''}
              ${isGpsLost ? `<div style="background:#f59e0b;color:#fff;font-size:10px;font-weight:800;
                text-align:center;padding:3px 8px;margin:-8px -8px 8px;border-radius:4px 4px 0 0;
                letter-spacing:1px">📡 GPS SIGNAL LOST</div>` : ''}
              <div style="font-weight:700;font-size:12px">${a.agent_name ?? 'Agent'}</div>
              <div style="font-size:11px;color:#64748b">${a.agent_badge} · RDF</div>
              <div style="font-size:11px;color:#475569;margin-top:4px">
                ${isOffline ? '🔴 OFFLINE' : isGpsLost ? '🟡 GPS Disabled' : isActive ? '🟢 Tracking Active' : '🟡 Paused'} · ${age}
              </div>
              ${isOffline && a.offline_reason ? `<div style="font-size:10px;color:#dc2626;margin-top:2px">Reason: ${a.offline_reason.replace('_', ' ')}</div>` : ''}
              ${a.report_title ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px">${a.report_title}</div>` : ''}
            </div>
          `, { maxWidth: 230 })
          .addTo(agentLayer.current)
      })
    })
  }, [mapReady, agents])

  return (
    <div
      ref={divRef}
      style={{ width: '100%', height: '100%', borderRadius: '12px', minHeight: '500px' }}
    />
  )
}

declare global {
  interface Window {
    __rdfSelectReport: (id: string) => void
  }
}

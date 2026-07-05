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
        const color = PRIORITY_COLOR[r.priority] ?? '#94a3b8'

        const icon = L.divIcon({
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
                background:#6d28d9;color:#fff;border:none;
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
        const color = INST_COLOR[a.agent_institution ?? ''] ?? '#94a3b8'
        const isActive = a.session_status === 'ACTIVE'

        const icon = L.divIcon({
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

        const marker = L.marker([a.last_lat, a.last_lng], { icon })
        marker.bindPopup(`
          <div style="font-family:system-ui;min-width:180px;color:#1e293b">
            <div style="font-weight:700;font-size:12px">${a.agent_name ?? 'Agent'}</div>
            <div style="font-size:11px;color:#64748b">${a.agent_badge} · ${a.agent_institution}</div>
            <div style="font-size:11px;color:#475569;margin-top:4px">
              ${isActive ? '🟢 Tracking Active' : '🟡 Paused'} · ${age}
            </div>
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

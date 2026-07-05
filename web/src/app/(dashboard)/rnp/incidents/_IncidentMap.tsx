'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { formatDistanceToNow } from 'date-fns'
import type { WebFieldReport, ActiveAgent } from '@/lib/api'

export interface RNPIncidentMapProps {
  reports: WebFieldReport[]
  agents: ActiveAgent[]
  patrolZones: PatrolZone[]
  onSelectReport: (r: WebFieldReport) => void
}

export interface PatrolZone {
  name: string
  district: string
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

export default function RNPIncidentMap({ reports, agents, patrolZones, onSelectReport }: RNPIncidentMapProps) {
  const divRef       = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<LeafletMap>(null)
  const reportLayer  = useRef<LayerGroup>(null)
  const agentLayer   = useRef<LayerGroup>(null)
  const zoneLayer    = useRef<LayerGroup>(null)
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
      zoneLayer.current   = L.layerGroup().addTo(map)

      mapRef.current = map
      setMapReady(true)
    })

    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [])

  // Draw patrol zone / police station markers (static)
  useEffect(() => {
    if (!mapReady) return
    import('leaflet').then(L => {
      zoneLayer.current?.clearLayers()
      patrolZones.forEach(zone => {
        const icon = L.divIcon({
          className: '',
          html: `
            <div style="
              background:#1e3a5f;border:1.5px solid #3b82f6;
              border-radius:4px;padding:3px 7px;
              font-size:9px;font-weight:800;color:#93c5fd;
              white-space:nowrap;box-shadow:0 0 6px #3b82f655;
            ">${zone.code}</div>`,
          iconAnchor: [20, 10],
        })
        L.marker([zone.lat, zone.lng], { icon })
          .bindPopup(`
            <div style="font-family:system-ui;color:#1e293b;min-width:160px">
              <div style="font-weight:700;font-size:12px">${zone.name}</div>
              <div style="font-size:11px;color:#64748b">District: ${zone.district}</div>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px">Zone: ${zone.code}</div>
            </div>
          `, { maxWidth: 210 })
          .addTo(zoneLayer.current)
      })
    })
  }, [mapReady, patrolZones])

  // Draw incident report pins
  useEffect(() => {
    if (!mapReady) return
    import('leaflet').then(L => {
      reportLayer.current?.clearLayers()
      reports.forEach(r => {
        if (r.location_lat == null || r.location_lng == null) return
        const color = PRIORITY_COLOR[r.priority] ?? '#94a3b8'

        const icon = L.divIcon({
          className: '',
          html: `
            <div style="
              width:32px;height:32px;border-radius:50%;
              background:${color};border:2.5px solid #fff;
              display:flex;align-items:center;justify-content:center;
              box-shadow:0 0 12px ${color}99;font-size:14px;
            ">🚔</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        })

        const age = formatDistanceToNow(new Date(r.created_at), { addSuffix: true })
        L.marker([r.location_lat, r.location_lng], { icon })
          .bindPopup(`
            <div style="font-family:system-ui;min-width:230px;color:#1e293b">
              <div style="
                font-size:9px;font-weight:800;letter-spacing:0.5px;color:#2563eb;
                text-transform:uppercase;margin-bottom:4px
              ">RNP Field Report · ${r.priority}</div>
              <div style="font-weight:700;font-size:13px;margin-bottom:3px">${r.title}</div>
              <div style="font-size:11px;color:#64748b;margin-bottom:5px">
                ${r.category} · ${age}
              </div>
              <div style="font-size:11px;color:#475569;margin-bottom:6px">
                ${r.agent_name ?? '?'} · ${r.agent_badge ?? ''}
              </div>
              <button
                onclick="window.__rnpSelectReport('${r.id}')"
                style="
                  background:#1d4ed8;color:#fff;border:none;
                  border-radius:4px;padding:5px 10px;
                  font-size:11px;cursor:pointer;width:100%;
                "
              >View Full Report</button>
            </div>
          `, { maxWidth: 270 })
          .addTo(reportLayer.current)
      })

      window.__rnpSelectReport = (id: string) => {
        const r = reports.find(x => x.id === id)
        if (r) onSelectReport(r)
      }
    })
  }, [mapReady, reports, onSelectReport])

  // Draw active officer markers
  useEffect(() => {
    if (!mapReady) return
    import('leaflet').then(L => {
      agentLayer.current?.clearLayers()
      agents.forEach(a => {
        if (a.last_lat == null || a.last_lng == null) return
        const isActive = a.session_status === 'ACTIVE'

        const icon = L.divIcon({
          className: '',
          html: `
            <div style="
              width:22px;height:22px;border-radius:4px;
              background:#1d4ed8;border:2px solid #93c5fd;
              display:flex;align-items:center;justify-content:center;
              font-size:11px;opacity:${isActive ? 1 : 0.5};
              box-shadow:0 0 6px #2563eb66;
            ">👮</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        })

        const age = a.last_ping_at
          ? formatDistanceToNow(new Date(a.last_ping_at), { addSuffix: true })
          : 'unknown'

        L.marker([a.last_lat, a.last_lng], { icon })
          .bindPopup(`
            <div style="font-family:system-ui;min-width:190px;color:#1e293b">
              <div style="font-weight:700;font-size:12px">${a.agent_name ?? 'Officer'}</div>
              <div style="font-size:11px;color:#64748b">${a.agent_badge} · RNP</div>
              <div style="font-size:11px;color:#475569;margin-top:4px">
                ${isActive ? '🟢 Tracking Active' : '🟡 Paused'} · ${age}
              </div>
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
    __rnpSelectReport: (id: string) => void
  }
}

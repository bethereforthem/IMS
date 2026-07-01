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
  const mapRef    = useRef<unknown>(null)
  const divRef    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!divRef.current) return

    // Destroy any stale Leaflet instance to prevent "already initialized" error
    if (mapRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mapRef.current as any).remove()
      mapRef.current = null
    }

    import('leaflet').then((L) => {
      if (!divRef.current || mapRef.current) return

      const map = L.map(divRef.current, {
        center:       [-1.9403, 29.8739],
        zoom:          9,
        zoomControl:   true,
        preferCanvas:  true,
      })
      mapRef.current = map

      // Dark CARTO basemap
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }).addTo(map)

      // ── Suspect / location markers ─────────────────────────────────────────
      locations.forEach((loc) => {
        const color = SOURCE_COLORS[loc.source_tag] ?? '#22c55e'
        L.circleMarker([loc.latitude, loc.longitude], {
          radius:      9,
          fillOpacity: 0.9,
          fillColor:   color,
          color:       '#ffffff',
          weight:      1.5,
        })
          .bindPopup(`
            <div style="min-width:190px;font-size:12px;font-family:'Courier New',monospace">
              <div style="font-weight:bold;color:${color};margin-bottom:5px;letter-spacing:1px">▲ SUSPECT DETECTED</div>
              <div style="font-weight:bold;font-size:13px;color:#1e293b">${loc.suspect_name ?? 'Unknown Subject'}</div>
              ${loc.ims_reference ? `<div style="color:#64748b;font-size:10px">REF: ${loc.ims_reference}</div>` : ''}
              <div style="color:#64748b;margin-top:4px">${loc.location_description ?? '—'}</div>
              <div style="margin-top:6px;padding:4px 6px;background:#f1f5f9;border-radius:3px;font-size:10px">
                <span style="color:#94a3b8">SOURCE:</span> ${loc.source_tag}<br/>
                <span style="color:#94a3b8">TIME:</span> ${formatDistanceToNow(new Date(loc.recorded_at), { addSuffix: true })}<br/>
                <span style="color:#94a3b8">GPS:</span> ${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}
              </div>
            </div>
          `, { maxWidth: 250 })
          .addTo(map)
      })

      // ── Field agent GPS markers ────────────────────────────────────────────
      agents.forEach((agent) => {
        const isSOS     = agent.status === 'SOS'
        const isOffline = agent.status === 'OFFLINE'
        const color     = isSOS ? '#ef4444' : isOffline ? '#6b7280' : '#3b82f6'
        const label     = isSOS ? '🔴 GPS SOS' : isOffline ? '⚫ OFFLINE' : '🔵 ACTIVE'

        const icon = L.divIcon({
          html: `
            <div style="
              width:28px;height:28px;
              background:${color};
              border:3px solid #fff;
              border-radius:50%;
              display:flex;align-items:center;justify-content:center;
              color:white;font-weight:900;font-size:12px;
              box-shadow:0 0 ${isSOS ? 14 : 6}px ${color};
            ">${isSOS ? '!' : 'A'}</div>
          `,
          className:  '',
          iconSize:   [28, 28],
          iconAnchor: [14, 14],
        })

        const marker = L.marker([agent.lat, agent.lng], { icon })

        marker.bindPopup(`
          <div style="min-width:210px;font-size:12px;font-family:'Courier New',monospace">
            <div style="font-weight:bold;color:${color};margin-bottom:5px;letter-spacing:1px">${label}</div>
            <div style="font-weight:bold;font-size:13px;color:#1e293b">${agent.name}</div>
            <div style="color:#64748b">Badge: ${agent.badge} · ${agent.institution}</div>
            <div style="margin-top:6px;padding:4px 6px;background:#f1f5f9;border-radius:3px;font-size:10px">
              <span style="color:#94a3b8">STATUS:</span> ${agent.status}<br/>
              <span style="color:#94a3b8">PING:</span> ${formatDistanceToNow(new Date(agent.last_ping), { addSuffix: true })}<br/>
              <span style="color:#94a3b8">GPS:</span> ${agent.lat.toFixed(5)}, ${agent.lng.toFixed(5)}
              ${agent.heading ? `<br/><span style="color:#94a3b8">HEADING:</span> ${agent.heading}` : ''}
            </div>
            ${onDirectAgent
              ? `<button id="direct-${agent.id}" style="
                  margin-top:8px;width:100%;padding:5px;
                  background:#3b82f6;color:white;border:none;
                  cursor:pointer;font-size:11px;font-weight:bold;
                  border-radius:3px;letter-spacing:0.5px;">
                  📡 DIRECT THIS AGENT
                </button>`
              : ''
            }
          </div>
        `, { maxWidth: 260 })

        marker.on('popupopen', () => {
          const btn = document.getElementById(`direct-${agent.id}`)
          if (btn && onDirectAgent) {
            btn.addEventListener('click', () => {
              map.closePopup()
              onDirectAgent(agent)
            })
          }
        })

        marker.addTo(map)
      })

      // Inject pulse keyframes once
      if (!document.getElementById('ims-map-css')) {
        const s = document.createElement('style')
        s.id = 'ims-map-css'
        s.textContent = `@keyframes ims-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}`
        document.head.appendChild(s)
      }
    })

    return () => {
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(mapRef.current as any).remove()
        mapRef.current = null
      }
    }
  // Re-render map whenever data changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, agents])

  return <div ref={divRef} style={{ height: '100%', width: '100%', background: '#0f172a' }} />
}

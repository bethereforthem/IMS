'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import type { AIPrediction } from '@/lib/api'

export interface PredictionZoneMapProps {
  predictions: AIPrediction[]
  onSelectPrediction: (p: AIPrediction) => void
  selectedId?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletMap = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LayerGroup = any

const RISK_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#f59e0b',
  LOW:      '#22c55e',
}

const RISK_FILL: Record<string, string> = {
  CRITICAL: 'rgba(239,68,68,0.18)',
  HIGH:     'rgba(249,115,22,0.16)',
  MEDIUM:   'rgba(245,158,11,0.14)',
  LOW:      'rgba(34,197,94,0.12)',
}

let _cssInjected = false
function injectPredictionCSS() {
  if (_cssInjected || typeof document === 'undefined') return
  const style = document.createElement('style')
  style.textContent = `
    @keyframes hotspot-pulse {
      0%   { opacity: 0.8; }
      50%  { opacity: 0.25; }
      100% { opacity: 0.8; }
    }
    .hotspot-ring-CRITICAL { animation: hotspot-pulse 1.2s ease-in-out infinite; }
    .hotspot-ring-HIGH     { animation: hotspot-pulse 1.8s ease-in-out infinite; }
    .hotspot-ring-MEDIUM   { animation: hotspot-pulse 2.5s ease-in-out infinite; }
    .hotspot-ring-LOW      { animation: hotspot-pulse 3.5s ease-in-out infinite; }
  `
  document.head.appendChild(style)
  _cssInjected = true
}

export default function PredictionZoneMap({ predictions, onSelectPrediction, selectedId }: PredictionZoneMapProps) {
  const divRef          = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<LeafletMap>(null)
  const zoneLayerRef    = useRef<LayerGroup>(null)
  const pinLayerRef     = useRef<LayerGroup>(null)
  const [mapReady, setMapReady] = useState(false)

  // Init map once
  useEffect(() => {
    if (!divRef.current || mapRef.current) return
    import('leaflet').then(L => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      const map = L.map(divRef.current!, {
        center: [-1.9403, 29.8739],
        zoom: 9,
        zoomControl: true,
        attributionControl: false,
      })
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19, opacity: 0.9,
      }).addTo(map)
      zoneLayerRef.current = L.layerGroup().addTo(map)
      pinLayerRef.current  = L.layerGroup().addTo(map)
      injectPredictionCSS()
      mapRef.current = map
      setMapReady(true)
    })
    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [])

  // Draw prediction zones whenever predictions change
  useEffect(() => {
    if (!mapReady || !zoneLayerRef.current || !pinLayerRef.current) return
    import('leaflet').then(L => {
      zoneLayerRef.current!.clearLayers()
      pinLayerRef.current!.clearLayers()

      predictions.forEach(p => {
        const color    = RISK_COLOR[p.risk_level] ?? '#64748b'
        const fillColor = RISK_FILL[p.risk_level] ?? 'rgba(100,116,139,0.1)'
        const isSelected = p.id === selectedId

        // Outer pulse ring — larger, animated
        const ring = L.circle([p.center_lat, p.center_lng], {
          radius: p.radius_km * 1200,  // slightly wider than solid zone
          color,
          weight: isSelected ? 3 : 1.5,
          opacity: 0.6,
          fillColor: color,
          fillOpacity: 0,
          className: `hotspot-ring-${p.risk_level}`,
          dashArray: '6 4',
        })

        // Solid zone
        const zone = L.circle([p.center_lat, p.center_lng], {
          radius: p.radius_km * 1000,
          color,
          weight: isSelected ? 3 : 2,
          opacity: 0.9,
          fillColor,
          fillOpacity: isSelected ? 0.35 : 0.18,
        })

        ring.addTo(zoneLayerRef.current!)
        zone.addTo(zoneLayerRef.current!)

        // Pin marker at center
        const rankLabel = p.rank.toString()
        const pinIcon = L.divIcon({
          className: '',
          html: `<div style="
            width:${isSelected ? 36 : 28}px;height:${isSelected ? 36 : 28}px;
            border-radius:50%;
            background:${color};
            border:${isSelected ? 3 : 2}px solid #fff;
            display:flex;align-items:center;justify-content:center;
            font-size:${isSelected ? 14 : 11}px;font-weight:900;color:#fff;
            box-shadow:0 0 ${isSelected ? 16 : 10}px ${color}99;
            cursor:pointer;
          ">${rankLabel}</div>`,
          iconSize: [isSelected ? 36 : 28, isSelected ? 36 : 28],
          iconAnchor: [isSelected ? 18 : 14, isSelected ? 18 : 14],
        })

        const trendArrow = p.trend_direction === 'INCREASING' ? '↑' : p.trend_direction === 'DECREASING' ? '↓' : '→'
        const peakHours = p.peak_hours.map(h => `${String(h).padStart(2,'0')}:00`).join(', ')

        const pin = L.marker([p.center_lat, p.center_lng], { icon: pinIcon })
          .bindPopup(`
            <div style="font-family:system-ui;min-width:240px;color:#1e293b">
              <div style="background:${color};color:#fff;font-size:10px;font-weight:800;
                text-align:center;padding:5px 8px;margin:-8px -8px 10px;
                border-radius:4px 4px 0 0;letter-spacing:1px">
                🎯 ZONE ${p.rank} · ${p.risk_level} RISK · ${p.confidence_score}% CONFIDENCE
              </div>
              <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:#1e293b">
                ${p.dominant_categories.join(' · ')}
              </div>
              <div style="display:flex;gap:12px;margin-bottom:8px">
                <div style="text-align:center;background:#f8fafc;border-radius:5px;padding:6px 10px;flex:1">
                  <div style="font-size:20px;font-weight:900;color:${color}">${p.incident_count_7d}</div>
                  <div style="font-size:9px;color:#64748b;font-weight:700">7 DAYS</div>
                </div>
                <div style="text-align:center;background:#f8fafc;border-radius:5px;padding:6px 10px;flex:1">
                  <div style="font-size:20px;font-weight:900;color:#475569">${p.incident_count_30d}</div>
                  <div style="font-size:9px;color:#64748b;font-weight:700">30 DAYS</div>
                </div>
                <div style="text-align:center;background:#f8fafc;border-radius:5px;padding:6px 10px;flex:1">
                  <div style="font-size:16px;font-weight:900;color:${p.trend_direction === 'INCREASING' ? '#ef4444' : p.trend_direction === 'DECREASING' ? '#22c55e' : '#f59e0b'}">${trendArrow}</div>
                  <div style="font-size:9px;color:#64748b;font-weight:700">TREND</div>
                </div>
              </div>
              <div style="font-size:11px;color:#475569;margin-bottom:4px">
                <strong>Peak hours:</strong> ${peakHours}
              </div>
              <div style="font-size:11px;color:#475569;margin-bottom:8px">
                <strong>Peak days:</strong> ${p.peak_days.join(', ')}
              </div>
              <div style="font-size:11px;color:#1e293b;background:#f0f9ff;
                border-left:3px solid ${color};padding:6px 8px;border-radius:0 4px 4px 0;
                margin-bottom:8px;line-height:1.45">
                ${p.explanation}
              </div>
              <button
                onclick="window.__aiSelectPrediction('${p.id}')"
                style="width:100%;background:${color};color:#fff;border:none;
                  border-radius:4px;padding:6px;font-size:12px;cursor:pointer;font-weight:700"
              >View Full Analysis →</button>
            </div>
          `, { maxWidth: 300 })
          .on('click', () => onSelectPrediction(p))

        pin.addTo(pinLayerRef.current!)
        zone.on('click', () => { onSelectPrediction(p); pin.openPopup() })
      })

      window.__aiSelectPrediction = (id: string) => {
        const p = predictions.find(x => x.id === id)
        if (p) onSelectPrediction(p)
      }

      // Fit map to predictions if any
      if (predictions.length > 0) {
        const lats = predictions.map(p => p.center_lat)
        const lngs = predictions.map(p => p.center_lng)
        const pad = 0.15
        mapRef.current?.fitBounds([
          [Math.min(...lats) - pad, Math.min(...lngs) - pad],
          [Math.max(...lats) + pad, Math.max(...lngs) + pad],
        ])
      }
    })
  }, [mapReady, predictions, onSelectPrediction, selectedId])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '480px' }}>
      <div ref={divRef} style={{ width: '100%', height: '100%', borderRadius: '10px' }} />

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 1000,
        background: 'rgba(15,23,42,0.92)', border: '1px solid #1e293b',
        borderRadius: '8px', padding: '10px 14px',
      }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
          Risk Level
        </div>
        {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(lvl => (
          <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: RISK_COLOR[lvl] }} />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{lvl}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

declare global {
  interface Window {
    __aiSelectPrediction: (id: string) => void
  }
}

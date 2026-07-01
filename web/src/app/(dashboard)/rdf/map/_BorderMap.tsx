'use client'

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { formatDistanceToNow, format } from 'date-fns'
import type { CameraNode, IntelligenceEvent } from '@/types'

interface Props {
  cameras: CameraNode[]
  events: IntelligenceEvent[]
  showCameras: boolean
  showDetections: boolean
}

export default function BorderMap({ cameras, events, showCameras, showDetections }: Props) {
  return (
    <MapContainer
      center={[-1.9403, 29.8739]}
      zoom={8}
      style={{ height: '520px', width: '100%' }}
      className="z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Camera nodes */}
      {showCameras && cameras.map(cam => {
        if (cam.latitude == null || cam.longitude == null) return null
        return (
          <CircleMarker
            key={cam.id}
            center={[cam.latitude, cam.longitude]}
            radius={10}
            pathOptions={{
              color:       cam.is_active ? '#16a34a' : '#dc2626',
              fillColor:   cam.is_active ? '#22c55e' : '#ef4444',
              fillOpacity: 0.7,
              weight:      2,
            }}
          >
            <Popup>
              <div className="text-xs space-y-1 min-w-[160px]">
                <p className="font-bold font-mono text-sm">{cam.node_identifier}</p>
                <p className="text-slate-600">{cam.location_name}</p>
                <p className={cam.is_active ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                  {cam.is_active ? '● ONLINE' : '● OFFLINE'}
                </p>
                {cam.last_heartbeat && (
                  <p className="text-slate-500">
                    Last seen: {formatDistanceToNow(new Date(cam.last_heartbeat), { addSuffix: true })}
                  </p>
                )}
                {cam.latitude != null && (
                  <p className="text-slate-400 font-mono text-[10px]">
                    {cam.latitude.toFixed(4)}, {cam.longitude.toFixed(4)}
                  </p>
                )}
              </div>
            </Popup>
          </CircleMarker>
        )
      })}

      {/* Intel events (CCTV detections) */}
      {showDetections && events.map(ev => {
        if (ev.location_lat == null || ev.location_lng == null) return null
        return (
          <CircleMarker
            key={ev.id}
            center={[ev.location_lat, ev.location_lng]}
            radius={7}
            pathOptions={{
              color:       '#ea580c',
              fillColor:   '#f97316',
              fillOpacity: 0.7,
              weight:      2,
            }}
          >
            <Popup>
              <div className="text-xs space-y-1 min-w-[160px]">
                <p className="font-bold text-sm">{ev.suspect_name ?? 'Unknown Subject'}</p>
                {ev.camera_node_id && (
                  <p className="font-mono text-slate-600">{ev.camera_node_id}</p>
                )}
                {ev.confidence_score != null && (
                  <p className="text-orange-600 font-semibold">
                    Confidence: {(ev.confidence_score * 100).toFixed(1)}%
                  </p>
                )}
                {ev.criminal_record_found && (
                  <p className="text-red-600 font-bold">⚠ Record Found</p>
                )}
                {ev.location_description && (
                  <p className="text-slate-500">{ev.location_description}</p>
                )}
                <p className="text-slate-400">
                  {format(new Date(ev.created_at), 'yyyy-MM-dd HH:mm')}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}

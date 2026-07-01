'use client'
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip as LeafletTooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { formatDistanceToNow, format } from 'date-fns'
import type { CameraNode, IntelligenceEvent } from '@/types'

interface Props {
  showCameras: boolean
  showEvents: boolean
  cameraNodes: CameraNode[]
  intelEvents: IntelligenceEvent[]
}

export default function MapView({ showCameras, showEvents, cameraNodes, intelEvents }: Props) {
  return (
    <div className="rounded-xl overflow-hidden border border-slate-800">
      <MapContainer
        center={[-1.9403, 29.8739]}
        zoom={11}
        style={{ height: '500px', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Camera nodes */}
        {showCameras && cameraNodes.map(cam => (
          <CircleMarker
            key={cam.id}
            center={[cam.latitude!, cam.longitude!]}
            radius={8}
            pathOptions={{
              color: cam.is_active ? '#4ade80' : '#ef4444',
              fillColor: cam.is_active ? '#4ade80' : '#ef4444',
              fillOpacity: 0.8,
              weight: 2,
            }}
          >
            <LeafletTooltip direction="top" offset={[0, -10]}>
              <span className="text-xs font-mono">{cam.node_identifier}</span>
            </LeafletTooltip>
            <Popup>
              <div className="text-xs space-y-1 min-w-[160px]">
                <p className="font-bold font-mono">{cam.node_identifier}</p>
                <p className="text-gray-600">{cam.location_name}</p>
                <p>
                  <span className="font-semibold">Institution:</span> {cam.institution}
                </p>
                <p>
                  <span className="font-semibold">Status:</span>{' '}
                  <span style={{ color: cam.is_active ? '#16a34a' : '#dc2626' }}>
                    {cam.is_active ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </p>
                <p>
                  <span className="font-semibold">Last heartbeat:</span>{' '}
                  {formatDistanceToNow(new Date(cam.last_heartbeat), { addSuffix: true })}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Intel events */}
        {showEvents && intelEvents.map(ev => (
          <CircleMarker
            key={ev.id}
            center={[ev.location_lat!, ev.location_lng!]}
            radius={6}
            pathOptions={{
              color: ev.criminal_record_found ? '#dc2626' : '#3b82f6',
              fillColor: ev.criminal_record_found ? '#dc2626' : '#3b82f6',
              fillOpacity: 0.75,
              weight: 1.5,
            }}
          >
            <LeafletTooltip direction="top" offset={[0, -8]}>
              <span className="text-xs">{ev.suspect_name ?? 'Unknown'}</span>
            </LeafletTooltip>
            <Popup>
              <div className="text-xs space-y-1 min-w-[180px]">
                <p className="font-bold">{ev.suspect_name ?? 'Unknown Subject'}</p>
                <p>
                  <span className="font-semibold">Source:</span> {ev.source_tag.replace(/_/g, ' ')}
                </p>
                {ev.location_description && (
                  <p className="text-gray-600">{ev.location_description}</p>
                )}
                {ev.confidence_score != null && (
                  <p>
                    <span className="font-semibold">Confidence:</span>{' '}
                    {(ev.confidence_score * 100).toFixed(0)}%
                  </p>
                )}
                <p>
                  <span className="font-semibold">Record:</span>{' '}
                  <span style={{ color: ev.criminal_record_found ? '#dc2626' : '#16a34a' }}>
                    {ev.criminal_record_found ? 'FOUND' : 'CLEAR'}
                  </span>
                </p>
                <p className="text-gray-500">
                  {format(new Date(ev.created_at), 'dd MMM yyyy HH:mm')}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}

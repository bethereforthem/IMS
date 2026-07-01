'use client'

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { formatDistanceToNow } from 'date-fns'
import type { LocationRecord } from '@/types'

interface Props {
  locations: LocationRecord[]
}

export default function LocationMap({ locations }: Props) {
  return (
    <MapContainer
      center={[-1.9403, 29.8739]}
      zoom={9}
      style={{ height: '100%', width: '100%', background: '#0f172a' }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
      />
      {locations.map((e) => (
        <CircleMarker
          key={e.id}
          center={[e.latitude, e.longitude]}
          radius={10}
          fillOpacity={0.8}
          fillColor="#22c55e"
          color="#16a34a"
          weight={1.5}
        >
          <Popup>
            <div className="text-xs space-y-1 min-w-[160px]">
              <p className="font-bold text-sm">{e.suspect_name ?? 'Unknown Subject'}</p>
              <p className="text-slate-600">{e.location_description}</p>
              <p className="text-slate-500">Source: {e.source_tag}</p>
              <p className="text-slate-500">{formatDistanceToNow(new Date(e.recorded_at), { addSuffix: true })}</p>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}

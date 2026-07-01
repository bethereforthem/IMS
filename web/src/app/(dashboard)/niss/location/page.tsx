'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { locationApi } from '@/lib/api'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { StatCard } from '@/components/shared/StatCard'
import { formatDistanceToNow } from 'date-fns'
import { MapPin, Camera } from 'lucide-react'
import dynamic from 'next/dynamic'
import type { LocationRecord } from '@/types'

const LocationMap = dynamic(() => import('./_LocationMap'), { ssr: false })

export default function NISSLocationPage() {
  const { user } = useAuth()
  const [locations, setLocations] = useState<LocationRecord[]>([])

  useEffect(() => {
    locationApi.getRecentLocations().then((r) => {
      if (r.data?.length) setLocations(r.data)
    }).catch(() => {})
  }, [])

  const cctvCount = locations.filter((e) => e.source_tag === 'CCTV_NODE').length

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">LOCATION INTELLIGENCE</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.clearance_level} clearance</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-niss animate-pulse" />
          NISS — National Intelligence
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Total Location Records" value={locations.length} icon={MapPin} variant="default" />
        <StatCard label="CCTV Detections" value={cctvCount} icon={Camera} variant="warn" />
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-slate-800" style={{ height: 450 }}>
        <LocationMap locations={locations} />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800">
          <p className="text-sm font-semibold text-white">Location Records</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Subject</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">IMS Reference</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Lat / Lng</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody>
              {locations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-600">
                    No location records found.
                  </td>
                </tr>
              )}
              {locations.map((e) => (
                <tr key={e.id} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20">
                  <td className="px-4 py-3">
                    <SourceTagBadge tag={e.source_tag} />
                  </td>
                  <td className="px-4 py-3 text-slate-300 font-medium">{e.suspect_name ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-niss text-[10px]">{e.ims_reference ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-slate-500 text-[10px]">
                    {e.latitude.toFixed(4)}, {e.longitude.toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDistanceToNow(new Date(e.recorded_at), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

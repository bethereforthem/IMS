'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { cameraApi } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { Camera, Wifi, WifiOff, Building2, MapPin } from 'lucide-react'
import clsx from 'clsx'
import type { CameraNode } from '@/types'

type InstitutionFilter = 'ALL' | 'RDF' | 'RNP'

const INSTITUTION_FILTERS: InstitutionFilter[] = ['ALL', 'RDF', 'RNP']

export default function NISSCamerasPage() {
  const { user } = useAuth()
  const [institutionFilter, setInstitutionFilter] = useState<InstitutionFilter>('ALL')
  const [cameras, setCameras] = useState<CameraNode[]>([])

  useEffect(() => {
    cameraApi.list().then((r) => {
      if (r.data?.length) setCameras(r.data)
    }).catch(() => {})
  }, [])

  const filtered = cameras.filter((c) =>
    institutionFilter === 'ALL' || c.institution === institutionFilter
  )

  const total = cameras.length
  const online = cameras.filter((c) => c.is_active).length
  const offline = total - online
  const institutions = [...new Set(cameras.map((c) => c.institution))].length

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">CAMERA NETWORK</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.clearance_level} clearance</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-niss animate-pulse" />
          NISS — National Intelligence
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Cameras', value: total, icon: Camera, cls: 'text-slate-300' },
          { label: 'Online', value: online, icon: Wifi, cls: 'text-green-400' },
          { label: 'Offline', value: offline, icon: WifiOff, cls: 'text-red-400' },
          { label: 'Institutions', value: institutions, icon: Building2, cls: 'text-niss' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={clsx('h-4 w-4', s.cls)} />
              <span className="text-xs text-slate-500">{s.label}</span>
            </div>
            <p className={clsx('text-2xl font-bold', s.cls)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-1.5">
        {INSTITUTION_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setInstitutionFilter(f)}
            className={clsx(
              'text-xs px-3 py-1.5 rounded-lg font-medium transition-colors',
              institutionFilter === f ? 'bg-niss text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Camera grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((cam) => (
          <div
            key={cam.id}
            className={clsx(
              'rounded-xl border bg-slate-900 p-5 space-y-3',
              cam.is_active ? 'border-slate-800' : 'border-red-500/40'
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className={clsx(
                  'h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0',
                  cam.is_active ? 'bg-green-500/10' : 'bg-red-500/10'
                )}>
                  <Camera className={clsx('h-4 w-4', cam.is_active ? 'text-green-400' : 'text-red-400')} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white font-mono">{cam.node_identifier}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{cam.location_name}</p>
                </div>
              </div>
              <span className={clsx(
                'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0',
                cam.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              )}>
                {cam.is_active ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>

            {/* Details */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <Building2 className="h-3 w-3" />
                  Institution
                </span>
                <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full text-[10px] font-medium">
                  {cam.institution}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <Wifi className="h-3 w-3" />
                  Last Heartbeat
                </span>
                <span className={clsx('text-[11px]', cam.is_active ? 'text-slate-400' : 'text-red-400')}>
                  {formatDistanceToNow(new Date(cam.last_heartbeat), { addSuffix: true })}
                </span>
              </div>
              {cam.latitude != null && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <MapPin className="h-3 w-3" />
                    Coordinates
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">
                    {cam.latitude.toFixed(4)}, {cam.longitude?.toFixed(4)}
                  </span>
                </div>
              )}
            </div>

            {!cam.is_active && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[10px] text-red-400 font-medium">
                Node offline — no heartbeat received
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

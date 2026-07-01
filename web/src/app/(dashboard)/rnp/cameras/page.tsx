'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { StatCard } from '@/components/shared/StatCard'
import { cameraApi } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { Radio, WifiOff, Wifi, Video } from 'lucide-react'
import clsx from 'clsx'
import type { CameraNode } from '@/types'

type InstitutionFilter = 'ALL' | 'RNP' | 'RDF'

const INSTITUTION_FILTERS: InstitutionFilter[] = ['ALL', 'RNP', 'RDF']

export default function CamerasPage() {
  const { user } = useAuth()
  const [institutionFilter, setInstitutionFilter] = useState<InstitutionFilter>('ALL')
  const [allCameras, setAllCameras] = useState<CameraNode[]>([])

  useEffect(() => {
    cameraApi.list().then(r => {
      if (r.data?.length) {
        setAllCameras(r.data)
      }
    }).catch(() => {})
  }, [])

  const cameras = allCameras.filter(c =>
    institutionFilter === 'ALL' || c.institution === institutionFilter
  )

  const totalCount = allCameras.length
  const onlineCount = allCameras.filter(c => c.is_active).length
  const offlineCount = allCameras.filter(c => !c.is_active).length
  const rnpCount = allCameras.filter(c => c.institution === 'RNP').length

  const onlineCameras = cameras.filter(c => c.is_active)
  const offlineCameras = cameras.filter(c => !c.is_active)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Camera Nodes</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rnp animate-pulse" />
          RNP Operations
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Nodes" value={totalCount} icon={Video} variant="default" />
        <StatCard label="Online" value={onlineCount} icon={Wifi} variant="ok" sub="Transmitting" />
        <StatCard label="Offline" value={offlineCount} icon={WifiOff} variant="danger" sub="No heartbeat" />
        <StatCard label="RNP-Owned" value={rnpCount} icon={Radio} variant="default" sub="Operated by RNP" />
      </div>

      {/* Filter */}
      <div className="flex gap-1">
        {INSTITUTION_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setInstitutionFilter(f)}
            className={clsx(
              'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
              institutionFilter === f
                ? 'bg-rnp text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Online cameras */}
      {onlineCameras.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <h2 className="text-sm font-semibold text-slate-200">Online</h2>
            <span className="text-xs text-slate-500">({onlineCameras.length})</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {onlineCameras.map(cam => (
              <CameraCard key={cam.id} camera={cam} />
            ))}
          </div>
        </div>
      )}

      {/* Offline cameras */}
      {offlineCameras.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <h2 className="text-sm font-semibold text-red-400">Offline</h2>
            <span className="text-xs text-slate-500">({offlineCameras.length})</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {offlineCameras.map(cam => (
              <CameraCard key={cam.id} camera={cam} />
            ))}
          </div>
        </div>
      )}

      {cameras.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
          No camera nodes match the current filter.
        </div>
      )}
    </div>
  )
}

function CameraCard({ camera }: { camera: CameraNode }) {
  return (
    <div className={clsx(
      'rounded-xl border p-4 transition-colors',
      camera.is_active
        ? 'border-green-900/40 bg-green-950/5 hover:bg-green-950/10'
        : 'border-red-900/40 bg-red-950/5 hover:bg-red-950/10'
    )}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {camera.is_active ? (
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse shrink-0" />
          ) : (
            <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
          )}
          <span className={clsx(
            'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
            camera.is_active
              ? 'bg-green-950 text-green-400'
              : 'bg-red-950 text-red-400'
          )}>
            {camera.is_active ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
        <span className={clsx(
          'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
          camera.institution === 'RNP'
            ? 'bg-rnp/20 text-rnp'
            : 'bg-slate-800 text-slate-400'
        )}>
          {camera.institution}
        </span>
      </div>

      <p className="font-mono text-sm font-bold text-white mb-0.5">{camera.node_identifier}</p>
      <p className="text-xs text-slate-400 mb-3">{camera.location_name}</p>

      <div className="space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-slate-500">Last heartbeat</span>
          <span className={clsx(
            camera.is_active ? 'text-green-400' : 'text-red-400'
          )}>
            {formatDistanceToNow(new Date(camera.last_heartbeat), { addSuffix: true })}
          </span>
        </div>
        {camera.latitude != null && camera.longitude != null && (
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Coordinates</span>
            <span className="text-slate-400 font-mono">
              {camera.latitude.toFixed(4)}, {camera.longitude.toFixed(4)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

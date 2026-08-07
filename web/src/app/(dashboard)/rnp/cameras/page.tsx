'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { StatCard } from '@/components/shared/StatCard'
import { cameraApi, apiErrorMessage } from '@/lib/api'
import { cameraStatus } from '@/lib/camera-status'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    cameraApi.list()
      .then(r => {
        // Unconditional: a guard on `.length` kept the previous estate on screen
        // if the node list ever came back empty.
        setAllCameras(r.data ?? [])
        setError('')
      })
      .catch((e: unknown) => setError(apiErrorMessage(e, 'Could not load camera nodes.')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    // Heartbeat freshness decides the badges below, so the view has to re-render
    // periodically or a node that goes quiet keeps reading as online.
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  const cameras = allCameras.filter(c =>
    institutionFilter === 'ALL' || c.institution === institutionFilter
  )

  const totalCount = allCameras.length
  // Counted off heartbeat freshness rather than the `is_active` admin flag —
  // eight nodes are flagged active while their last heartbeat is weeks old, and
  // reporting those as "Online · Transmitting" is simply untrue.
  const onlineCount = allCameras.filter(c => cameraStatus(c).live).length
  const offlineCount = totalCount - onlineCount
  const rnpCount = allCameras.filter(c => c.institution === 'RNP').length

  const onlineCameras = cameras.filter(c => cameraStatus(c).live)
  const offlineCameras = cameras.filter(c => !cameraStatus(c).live)

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

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {loading && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500" aria-busy="true">
          Loading camera nodes…
        </div>
      )}
      {!loading && !error && cameras.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
          {allCameras.length === 0
            ? 'No camera nodes are registered to your institution.'
            : 'No camera nodes match the current filter.'}
        </div>
      )}
    </div>
  )
}

function CameraCard({ camera }: { camera: CameraNode }) {
  // Derived from heartbeat freshness, not the `is_active` enable flag — see
  // lib/camera-status.ts for why those are not the same question.
  const state = cameraStatus(camera)
  return (
    <div className={clsx(
      'rounded-xl border p-4 transition-colors',
      state.live
        ? 'border-green-900/40 bg-green-950/5 hover:bg-green-950/10'
        : 'border-red-900/40 bg-red-950/5 hover:bg-red-950/10'
    )}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2" title={state.detail}>
          {state.live ? (
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse shrink-0" />
          ) : (
            <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
          )}
          <span className={clsx(
            'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
            state.live
              ? 'bg-green-950 text-green-400'
              : state.status === 'DISABLED'
                ? 'bg-slate-800 text-slate-400'
                : 'bg-red-950 text-red-400'
          )}>
            {state.label}
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
          <span className={clsx(state.live ? 'text-green-400' : 'text-red-400')}>
            {camera.last_heartbeat
              ? formatDistanceToNow(new Date(camera.last_heartbeat), { addSuffix: true })
              : 'never'}
          </span>
        </div>
        {!state.live && (
          <p className="text-[10px] text-slate-500 pt-0.5">{state.detail}</p>
        )}
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

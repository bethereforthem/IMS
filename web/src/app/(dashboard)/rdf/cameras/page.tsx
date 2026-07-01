'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { cameraApi } from '@/lib/api'
import { Wifi, WifiOff, MapPin, Radio, AlertTriangle } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { formatDistanceToNow, format } from 'date-fns'
import clsx from 'clsx'
import type { CameraNode } from '@/types'

const BORDER_POSTS = [
  { name: 'Gatuna',   country: 'Uganda',          code: 'GTN', prefix: 'GTN-',        color: 'bg-blue-950 text-blue-300 border-blue-800' },
  { name: 'Rubavu',   country: 'DRC/Congo',        code: 'RBV', prefix: 'RBV-',        color: 'bg-purple-950 text-purple-300 border-purple-800' },
  { name: 'Rusizi',   country: 'Burundi',          code: 'RSZ', prefix: 'RSZ-',        color: 'bg-amber-950 text-amber-300 border-amber-800' },
  { name: 'Nyagatare',country: 'Uganda (East)',    code: 'NYG', prefix: 'NYG-',        color: 'bg-teal-950 text-teal-300 border-teal-800' },
  { name: 'KGL Airport',country: 'International', code: 'KGL', prefix: 'KGL-AIRPORT', color: 'bg-slate-800 text-slate-300 border-slate-700' },
]

type StatusFilter = 'ALL' | 'ONLINE' | 'OFFLINE'
type PostFilter = 'ALL' | 'GTN' | 'RBV' | 'RSZ' | 'NYG' | 'KGL'

function getPostBadge(nodeId: string) {
  const post = BORDER_POSTS.find(p => nodeId.startsWith(p.prefix))
  if (!post) return null
  return { label: post.code, color: post.color, name: post.name }
}

export default function RDFCamerasPage() {
  const { user } = useAuth()
  const [rdfCameras, setRdfCameras]     = useState<CameraNode[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [postFilter, setPostFilter]     = useState<PostFilter>('ALL')

  useEffect(() => {
    cameraApi.list().then(r => {
      if (r.data?.length) setRdfCameras(r.data.filter((c: CameraNode) => c.institution === 'RDF'))
    }).catch(() => {})
  }, [])

  const filtered = rdfCameras.filter(c => {
    if (statusFilter === 'ONLINE' && !c.is_active) return false
    if (statusFilter === 'OFFLINE' && c.is_active) return false
    if (postFilter !== 'ALL') {
      const post = BORDER_POSTS.find(p => p.code === postFilter)
      if (post && !c.node_identifier.startsWith(post.prefix)) return false
    }
    return true
  })

  const totalNodes  = rdfCameras.length
  const onlineCount = rdfCameras.filter(c => c.is_active).length
  const offlineCount = rdfCameras.filter(c => !c.is_active).length
  const coveragePct = Math.round((onlineCount / totalNodes) * 100)
  const offlineFiltered = filtered.filter(c => !c.is_active)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">CAMERA NODES</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rdf animate-pulse" />
          RDF Border Command
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Nodes"   value={totalNodes}          icon={Radio}          variant="default" />
        <StatCard label="Online"        value={onlineCount}         icon={Wifi}           variant="ok"      sub="Heartbeat nominal" />
        <StatCard label="Offline"       value={offlineCount}        icon={WifiOff}        variant={offlineCount > 0 ? 'danger' : 'default'} sub={offlineCount > 0 ? 'Requires attention' : 'All clear'} />
        <StatCard label="Coverage"      value={`${coveragePct}%`}   icon={MapPin}         variant={coveragePct === 100 ? 'ok' : coveragePct >= 80 ? 'warn' : 'danger'} sub={`${onlineCount} of ${totalNodes} active`} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 font-medium">Status:</span>
          {(['ALL', 'ONLINE', 'OFFLINE'] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={clsx(
                'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                statusFilter === f ? 'bg-rdf text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-500 font-medium">Post:</span>
          {(['ALL', 'GTN', 'RBV', 'RSZ', 'NYG', 'KGL'] as PostFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setPostFilter(f)}
              className={clsx(
                'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                postFilter === f ? 'bg-rdf text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Offline alert banner */}
      {offlineFiltered.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-800/50 bg-red-950/20 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-300 font-medium">
            {offlineFiltered.length} camera node{offlineFiltered.length > 1 ? 's' : ''} require attention —{' '}
            <span className="text-red-400 font-bold">
              {offlineFiltered.map(c => c.node_identifier).join(', ')}
            </span>
          </p>
        </div>
      )}

      {/* Count */}
      <p className="text-xs text-slate-500">
        Showing <span className="text-white font-semibold">{filtered.length}</span> of {rdfCameras.length} RDF camera nodes
      </p>

      {/* Camera Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
          <p className="text-sm text-slate-600">No camera nodes match the current filters.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(cam => {
            const badge = getPostBadge(cam.node_identifier)
            return (
              <div
                key={cam.id}
                className={clsx(
                  'rounded-xl border bg-slate-900 p-5 space-y-3',
                  cam.is_active ? 'border-green-900/40' : 'border-red-900/40'
                )}
              >
                {/* Top row: ID + status */}
                <div className="flex items-start justify-between">
                  <code className="text-base font-bold font-mono text-white tracking-wide">
                    {cam.node_identifier}
                  </code>
                  <div className={clsx(
                    'flex items-center gap-1.5 text-xs font-bold',
                    cam.is_active ? 'text-green-400' : 'text-red-400'
                  )}>
                    {cam.is_active ? (
                      <>
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                        ONLINE
                      </>
                    ) : (
                      <>
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                        OFFLINE
                      </>
                    )}
                  </div>
                </div>

                {/* Location */}
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span>{cam.location_name}</span>
                </div>

                {/* Border post badge */}
                {badge && (
                  <div>
                    <span className={clsx('inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', badge.color)}>
                      {badge.label} — {badge.name}
                    </span>
                  </div>
                )}

                {/* Divider */}
                <div className="border-t border-slate-800" />

                {/* Heartbeat */}
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Last Heartbeat</p>
                  {cam.last_heartbeat ? (
                    <div>
                      <p className={clsx('text-xs font-medium', cam.is_active ? 'text-slate-300' : 'text-red-300')}>
                        {formatDistanceToNow(new Date(cam.last_heartbeat), { addSuffix: true })}
                      </p>
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        {format(new Date(cam.last_heartbeat), 'yyyy-MM-dd HH:mm:ss')} UTC
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600">No heartbeat recorded</p>
                  )}
                </div>

                {/* Coordinates */}
                {cam.latitude != null && cam.longitude != null && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Coordinates</p>
                    <p className="text-xs font-mono text-slate-500">
                      {cam.latitude.toFixed(4)}, {cam.longitude.toFixed(4)}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

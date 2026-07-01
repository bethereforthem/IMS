'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { locationApi } from '@/lib/api'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { StatCard } from '@/components/shared/StatCard'
import { formatDistanceToNow } from 'date-fns'
import { MapPin, Camera, AlertTriangle, X, Send, RefreshCw, Radio, Users } from 'lucide-react'
import dynamic from 'next/dynamic'
import type { LocationRecord } from '@/types'
import type { FieldAgent } from './_LocationMap'

// Dynamic import — prevents Leaflet SSR crash
const LocationMap = dynamic(() => import('./_LocationMap'), { ssr: false })

// ── Simulated field operative GPS data ────────────────────────────────────────
// Replace with real API endpoint (POST /api/v1/field-agents/ping) when deployed
const FIELD_AGENTS: FieldAgent[] = [
  {
    id: 'ag1', name: 'Maj. Uwimana Patrick', badge: 'NISS-OFF-003',
    institution: 'NISS', lat: -1.9441, lng: 30.0619,
    status: 'ACTIVE', heading: 'N',
    last_ping: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
  {
    id: 'ag2', name: 'Insp. Habimana Jean', badge: 'RNP-DET-005',
    institution: 'RNP', lat: -1.9700, lng: 30.1042,
    status: 'SOS', heading: 'NE',
    last_ping: new Date(Date.now() - 30 * 1000).toISOString(),
  },
  {
    id: 'ag3', name: 'Cpl. Mukamana Rose', badge: 'RNP-PAT-012',
    institution: 'RNP', lat: -2.0150, lng: 29.9340,
    status: 'ACTIVE',
    last_ping: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'ag4', name: 'Lt. Nzabonimpa Eric', badge: 'RDF-CMD-008',
    institution: 'RDF', lat: -1.8200, lng: 29.7810,
    status: 'OFFLINE',
    last_ping: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
  },
]

interface DirectPanel {
  agent: FieldAgent
  message: string
  sent: boolean
}

export default function NISSLocationPage() {
  const { user } = useAuth()
  const [locations,    setLocations]    = useState<LocationRecord[]>([])
  const [agents]                        = useState<FieldAgent[]>(FIELD_AGENTS)
  const [direction,    setDirection]    = useState<DirectPanel | null>(null)
  const [lastRefresh,  setLastRefresh]  = useState(new Date())
  const [refreshing,   setRefreshing]   = useState(false)

  const fetchLocations = useCallback(async () => {
    setRefreshing(true)
    try {
      const r = await locationApi.getRecentLocations()
      if (Array.isArray(r.data) && r.data.length) setLocations(r.data)
    } catch { /* silently ignore — show stale data */ }
    setLastRefresh(new Date())
    setRefreshing(false)
  }, [])

  useEffect(() => { fetchLocations() }, [fetchLocations])

  // Auto-refresh every 30 s for near-real-time GPS updates
  useEffect(() => {
    const id = setInterval(fetchLocations, 30_000)
    return () => clearInterval(id)
  }, [fetchLocations])

  const sosAgents    = agents.filter(a => a.status === 'SOS')
  const activeAgents = agents.filter(a => a.status === 'ACTIVE')
  const cctvHits     = locations.filter(e => e.source_tag === 'CCTV_NODE').length

  const handleTransmit = () => {
    if (!direction?.message.trim()) return
    // TODO: POST to /api/v1/field-agents/{id}/directive
    setDirection(prev => prev ? { ...prev, sent: true } : null)
    setTimeout(() => setDirection(null), 2500)
  }

  return (
    <div className="space-y-5">

      {/* ── SOS alert banner ─────────────────────────────────────────────────── */}
      {sosAgents.length > 0 && (
        <div className="flex items-center gap-3 bg-red-950/80 border border-red-700 rounded-lg px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 animate-pulse" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-300 animate-pulse">GPS SOS TRIGGERED</p>
            <p className="text-xs text-red-400 truncate">
              {sosAgents.map(a => `${a.name} (${a.badge})`).join(' · ')}
            </p>
          </div>
          <button
            onClick={() => setDirection({ agent: sosAgents[0], message: '', sent: false })}
            className="shrink-0 text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 font-bold transition"
          >
            DIRECT NOW
          </button>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">LOCATION INTELLIGENCE</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.clearance_level}</p>
        </div>
        <button
          onClick={fetchLocations}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          {formatDistanceToNow(lastRefresh, { addSuffix: true })}
        </button>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Suspect Pings"   value={locations.length}    icon={MapPin}        variant="default" />
        <StatCard label="CCTV Detections" value={cctvHits}            icon={Camera}        variant="warn"    />
        <StatCard label="Active Agents"   value={activeAgents.length} icon={Users}         variant="ok"      />
        <StatCard label="SOS Active"      value={sosAgents.length}    icon={AlertTriangle} variant={sosAgents.length > 0 ? 'danger' : 'default'} />
      </div>

      {/* ── Map + agent panel ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

        {/* Map */}
        <div
          className="lg:col-span-3 rounded-xl overflow-hidden border border-slate-800"
          style={{ height: 500 }}
        >
          <LocationMap
            locations={locations}
            agents={agents}
            onDirectAgent={(agent) => setDirection({ agent, message: '', sent: false })}
          />
        </div>

        {/* Field GPS panel */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-blue-400" />
            <p className="text-xs font-bold text-white uppercase tracking-wider">Field GPS</p>
            <span className="ml-auto text-[10px] text-green-500 font-mono animate-pulse">● LIVE</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
            {agents.map(agent => {
              const isSOS     = agent.status === 'SOS'
              const isOffline = agent.status === 'OFFLINE'
              return (
                <div key={agent.id} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-semibold text-white truncate">{agent.name}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                      isSOS     ? 'bg-red-900 text-red-300 animate-pulse' :
                      isOffline ? 'bg-slate-800 text-slate-500' :
                                  'bg-blue-900/60 text-blue-300'
                    }`}>
                      {agent.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono">{agent.badge}</p>
                  <p className="text-[10px] text-slate-600">
                    {formatDistanceToNow(new Date(agent.last_ping), { addSuffix: true })}
                  </p>
                  <p className="text-[10px] text-slate-700 font-mono">
                    {agent.lat.toFixed(4)}, {agent.lng.toFixed(4)}
                    {agent.heading && ` · ${agent.heading}`}
                  </p>
                  <button
                    onClick={() => setDirection({ agent, message: '', sent: false })}
                    className={`w-full mt-0.5 text-[10px] py-1 border font-bold tracking-wider transition ${
                      isSOS
                        ? 'bg-red-950 hover:bg-red-900 text-red-400 border-red-800'
                        : 'bg-blue-950/60 hover:bg-blue-900/60 text-blue-400 border-blue-800/60'
                    }`}
                  >
                    📡 DIRECT
                  </button>
                </div>
              )
            })}
          </div>

          {/* Map legend */}
          <div className="border-t border-slate-800 px-4 py-3 space-y-1.5">
            <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider mb-2">Legend</p>
            {[
              { color: '#22c55e', label: 'CCTV Detection' },
              { color: '#f59e0b', label: 'Face Scan'       },
              { color: '#ef4444', label: 'Interpol / SOS'  },
              { color: '#3b82f6', label: 'Field Agent'      },
              { color: '#6b7280', label: 'Agent Offline'    },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2 text-[10px] text-slate-500">
                <div className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Location records table ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Suspect Location Records</p>
          <p className="text-xs text-slate-500">{locations.length} records · auto-refresh 30s</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Subject</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">IMS Ref</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Coordinates</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Detected</th>
              </tr>
            </thead>
            <tbody>
              {locations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-600">
                    No location records found.
                  </td>
                </tr>
              )}
              {locations.map((e) => (
                <tr key={e.id} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20 transition">
                  <td className="px-4 py-3"><SourceTagBadge tag={e.source_tag} /></td>
                  <td className="px-4 py-3 text-slate-300 font-medium">{e.suspect_name ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-green-500 text-[10px]">{e.ims_reference ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-slate-500 text-[10px]">
                    {e.latitude.toFixed(5)}, {e.longitude.toFixed(5)}
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

      {/* ── Direction modal ──────────────────────────────────────────────────── */}
      {direction && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => !direction.sent && setDirection(null)}
          />
          <div className="relative w-full max-w-md mx-4 bg-slate-900 border border-blue-700 shadow-2xl">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-blue-950/40">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-blue-400" />
                <p className="text-sm font-bold text-white tracking-wider">DIRECT FIELD AGENT</p>
              </div>
              {!direction.sent && (
                <button onClick={() => setDirection(null)}>
                  <X className="h-4 w-4 text-slate-500 hover:text-white transition" />
                </button>
              )}
            </div>

            <div className="p-5 space-y-4">
              {/* Agent info */}
              <div className="bg-slate-800 rounded-lg px-4 py-3 space-y-1 border border-slate-700">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-white">{direction.agent.name}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    direction.agent.status === 'SOS'
                      ? 'bg-red-900 text-red-300 animate-pulse'
                      : 'bg-blue-900/60 text-blue-300'
                  }`}>
                    {direction.agent.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono">
                  {direction.agent.badge} · {direction.agent.institution}
                </p>
                <p className="text-[10px] text-slate-600 font-mono mt-1">
                  GPS: {direction.agent.lat.toFixed(5)}, {direction.agent.lng.toFixed(5)}
                  {direction.agent.heading && ` · Heading: ${direction.agent.heading}`}
                </p>
                <p className="text-[10px] text-slate-600">
                  Last ping: {formatDistanceToNow(new Date(direction.agent.last_ping), { addSuffix: true })}
                </p>
              </div>

              {/* Directive input */}
              {!direction.sent ? (
                <>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                      Operational Directive
                    </label>
                    <textarea
                      rows={4}
                      value={direction.message}
                      onChange={e => setDirection(prev => prev ? { ...prev, message: e.target.value } : null)}
                      placeholder={`Enter directive for ${direction.agent.name.split(' ')[1]}...\ne.g. "Move to grid 29.87, -1.95. Suspect spotted at Kimironko market. Approach from north. Await backup."`}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-xs px-3 py-2.5 resize-none focus:outline-none focus:border-blue-500 font-mono leading-relaxed placeholder:text-slate-600"
                    />
                  </div>
                  <button
                    onClick={handleTransmit}
                    disabled={!direction.message.trim()}
                    className="w-full py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white flex items-center justify-center gap-2 transition"
                  >
                    <Send className="h-4 w-4" />
                    TRANSMIT DIRECTIVE
                  </button>
                </>
              ) : (
                <div className="bg-green-950/60 border border-green-700 rounded-lg px-4 py-4 text-center space-y-1">
                  <p className="text-sm font-bold text-green-400">✓ DIRECTIVE TRANSMITTED</p>
                  <p className="text-xs text-green-600">
                    Encrypted message sent to {direction.agent.name}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

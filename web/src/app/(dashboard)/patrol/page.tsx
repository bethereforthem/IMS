'use client'
import { useState, useEffect, useCallback } from 'react'
import { statsApi } from '@/lib/api'
import { AlertFeed } from '@/components/shared/AlertFeed'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { useAuth } from '@/hooks/useAuth'
import { AlertTriangle, Search, Shield, FileText, Info, MapPin, CheckCircle, XCircle, Activity, Users } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import type { IntelligenceEvent } from '@/types'

const QUICK_ACTIONS = [
  {
    icon: AlertTriangle,
    color: 'text-amber-400 bg-amber-950/40 border-amber-900/50',
    title: 'Report Insecurity',
    description: 'Submit a community security report about an individual causing insecurity in your village. Report goes directly to RNP for investigation.',
    badge: 'PRIMARY',
  },
  {
    icon: Search,
    color: 'text-teal-400 bg-teal-950/40 border-teal-900/50',
    title: 'NID Verification',
    description: 'Scan or manually enter a National ID via the DIV mobile app to verify identity. Result: record found or clean citizen.',
    badge: 'MOBILE APP',
  },
  {
    icon: Shield,
    color: 'text-purple-400 bg-purple-950/40 border-purple-900/50',
    title: 'Face Scan',
    description: 'Use the DIV app front camera for biometric face identification. GPS is captured automatically when a criminal record is found.',
    badge: 'MOBILE APP',
  },
  {
    icon: MapPin,
    color: 'text-blue-400 bg-blue-950/40 border-blue-900/50',
    title: 'GPS Location',
    description: 'Your GPS coordinates are automatically captured when a criminal record is found during verification or when a report is filed.',
    badge: 'AUTO',
  },
]

export default function PatrolDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [myEvents, setMyEvents] = useState<IntelligenceEvent[]>([])

  const load = useCallback(() => {
    if (!user?.id) return
    setLoading(true)
    statsApi.getRecentEvents(50).then(r => {
      const filtered = (r.data ?? []).filter(
        (e: IntelligenceEvent) => e.reporting_officer_id === user.id
      )
      setMyEvents(filtered)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [user?.id])

  useEffect(() => { load() }, [load])

  const recordsFound    = myEvents.filter(e => e.criminal_record_found).length
  const reportsCount    = myEvents.filter(e => e.source_tag === 'OFFICER_REPORT').length
  const verifications   = myEvents.filter(e =>
    ['NID_SCAN', 'NID_MANUAL', 'FACE_SCAN'].includes(e.source_tag)
  ).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Village Leader Portal</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {user?.full_name} · Village Leader · {user?.badge_number}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-patrol animate-pulse" />
          Community Intelligence
        </div>
      </div>

      {/* Role notice */}
      <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 flex items-start gap-3">
        <Users className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-300">Village Leader — Community Intelligence Reporting</p>
          <p className="text-xs text-amber-400/80 mt-1">
            Community members (Irondo) report individuals causing insecurity to you. As a Village Leader,
            you submit these reports directly into the intelligence system for follow-up by RNP and RIB.
            You see only the outcome of your own reports — no suspect profiles, case details, or
            classified data are accessible at your clearance level.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-800/60 p-4 text-center">
          {loading ? (
            <div className="h-8 w-16 rounded bg-slate-700 animate-pulse mx-auto" />
          ) : (
            <p className="text-2xl font-bold text-white">{reportsCount}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">Reports Filed</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-800/60 p-4 text-center">
          {loading ? (
            <div className="h-8 w-16 rounded bg-slate-700 animate-pulse mx-auto" />
          ) : (
            <p className="text-2xl font-bold text-white">{verifications}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">ID Verifications</p>
        </div>
        <div className={clsx(
          'rounded-xl border p-4 text-center',
          recordsFound > 0 ? 'border-red-900/50 bg-red-950/20' : 'border-green-900/50 bg-green-950/20'
        )}>
          {loading ? (
            <div className="h-8 w-16 rounded bg-slate-700 animate-pulse mx-auto" />
          ) : (
            <p className={clsx('text-2xl font-bold', recordsFound > 0 ? 'text-red-400' : 'text-green-400')}>
              {recordsFound}
            </p>
          )}
          <p className={clsx('text-xs mt-1', recordsFound > 0 ? 'text-red-400/70' : 'text-green-400/70')}>
            {recordsFound > 0 ? 'Records Found' : 'All Clear'}
          </p>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Available Actions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map(action => (
            <div key={action.title} className={clsx('rounded-xl border p-5', action.color)}>
              <div className="flex items-start justify-between mb-3">
                <action.icon className="h-7 w-7" />
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-black/20">
                  {action.badge}
                </span>
              </div>
              <p className="text-sm font-semibold text-white">{action.title}</p>
              <p className="text-xs opacity-70 mt-1">{action.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* My reports log + Alerts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-200">My Report Log</h2>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-slate-800 animate-pulse" />
            ))}</div>
          ) : myEvents.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No reports or verifications filed yet</p>
          ) : (
            <div className="space-y-2">
              {myEvents.map(ev => (
                <div key={ev.id}
                  className={clsx(
                    'flex items-center gap-3 text-xs rounded-lg border px-3 py-2.5',
                    ev.criminal_record_found
                      ? 'border-red-900/40 bg-red-950/10'
                      : 'border-slate-800 bg-slate-800/30'
                  )}>
                  <SourceTagBadge tag={ev.source_tag} />
                  <div className="flex-1 min-w-0">
                    {ev.source_tag === 'OFFICER_REPORT' ? (
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3 w-3 text-amber-400 shrink-0" />
                        <span className="text-amber-400 font-medium">Community report submitted</span>
                      </div>
                    ) : ev.criminal_record_found ? (
                      <div className="flex items-center gap-1.5">
                        <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                        <span className="text-red-400 font-bold">RECORD FOUND — Alert sent</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle className="h-3 w-3 text-green-400 shrink-0" />
                        <span className="text-green-400">No record — Clean citizen</span>
                      </div>
                    )}
                    {ev.notes && (
                      <p className="text-slate-500 text-[10px] mt-0.5 truncate">{ev.notes}</p>
                    )}
                  </div>
                  <span className="text-slate-500 shrink-0 whitespace-nowrap">
                    {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Active Alerts</h2>
          <AlertFeed limit={5} />
        </div>
      </div>

      {/* Privacy notice */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 flex items-start gap-3">
        <Info className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-semibold text-slate-300">Privacy Notice — Law No. 058/2021</p>
          <p className="text-xs text-slate-500 mt-1">
            Verification results for clean citizens are immediately discarded — no personal data is
            stored when no criminal record is found. Your GPS location is captured only when a record
            match is confirmed or when a community report is filed. All activity is immutably logged
            in the audit trail.
          </p>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { partnersApi, intelligenceApi } from '@/lib/api'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { formatDistanceToNow, parseISO, differenceInMonths } from 'date-fns'
import { Globe, ShieldCheck, AlertTriangle, Activity } from 'lucide-react'
import clsx from 'clsx'
import type { IntelligenceEvent } from '@/types'

interface Partner {
  id: string
  name: string
  country_code: string
  partner_type: string
  mou_expiry_date: string
  status: string
  primary_contact?: string
  notes?: string
  active: boolean
  created_at: string
}

export default function NISSPartnersPage() {
  const { user } = useAuth()
  const [partners, setPartners] = useState<Partner[]>([])
  const [partnerQueries, setPartnerQueries] = useState<IntelligenceEvent[]>([])

  useEffect(() => {
    partnersApi.list().then((r) => {
      if (r.data?.partners?.length) setPartners(r.data.partners as Partner[])
    }).catch(() => {})

    intelligenceApi.listEvents({ limit: 100 }).then((r) => {
      if (r.data?.events?.length) {
        setPartnerQueries(
          r.data.events.filter(
            (e: IntelligenceEvent) => e.source_tag === 'PARTNER_QUERY' || e.source_tag === 'INTERPOL_FEED'
          )
        )
      }
    }).catch(() => {})
  }, [])

  const activePartners = partners.filter((p) => p.active || p.status === 'ACTIVE')
  const interpolEvent = partnerQueries.find((e) => e.source_tag === 'INTERPOL_FEED')

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">INTERNATIONAL PARTNERS</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.clearance_level} clearance</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-niss animate-pulse" />
          NISS — National Intelligence
        </div>
      </div>

      {/* Stat row */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 bg-green-500/10 text-green-400 text-xs px-3 py-1.5 rounded-lg border border-green-500/20">
          <Globe className="h-3.5 w-3.5" />
          Active MOUs: <span className="font-bold">{activePartners.length}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 bg-niss/10 text-niss text-xs px-3 py-1.5 rounded-lg border border-niss/20">
          <Activity className="h-3.5 w-3.5" />
          Partner Queries: <span className="font-bold">{partnerQueries.length}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 bg-red-500/10 text-red-400 text-xs px-3 py-1.5 rounded-lg border border-red-500/20">
          <AlertTriangle className="h-3.5 w-3.5" />
          Red Notices Active: <span className="font-bold">1</span>
        </span>
      </div>

      {/* Partner cards */}
      <div>
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Bilateral Partners</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {partners.length === 0 && (
            <div className="col-span-3 rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
              No partners found.
            </div>
          )}
          {partners.map((p) => {
            const expiryDate = p.mou_expiry_date ? parseISO(p.mou_expiry_date) : null
            const monthsUntilExpiry = expiryDate ? differenceInMonths(expiryDate, new Date()) : 99
            const expiringSoon = monthsUntilExpiry <= 6
            const isActive = p.active || p.status === 'ACTIVE'

            return (
              <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-base font-bold text-white mt-2">{p.name}</p>
                    <p className="text-[11px] text-slate-500 font-mono">{p.country_code}</p>
                    {p.partner_type && (
                      <p className="text-[11px] text-slate-500 mt-0.5">{p.partner_type}</p>
                    )}
                  </div>
                  <span className={clsx(
                    'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                    isActive ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'
                  )}>
                    {p.status ?? (isActive ? 'ACTIVE' : 'INACTIVE')}
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  {p.mou_expiry_date && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">MOU Expires</span>
                      <span className={clsx('font-medium', expiringSoon ? 'text-amber-400' : 'text-green-400')}>
                        {p.mou_expiry_date}
                        {expiringSoon && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                      </span>
                    </div>
                  )}
                  {p.primary_contact && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Contact</span>
                      <span className="text-slate-300 font-medium">{p.primary_contact}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-green-400" />
                    <span className={clsx('text-[11px]', expiringSoon ? 'text-amber-400' : 'text-green-400')}>
                      {expiringSoon ? 'MOU expiring soon' : 'MOU active'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Interpol I-24/7 status */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-niss/10 border border-niss/20 flex items-center justify-center">
              <Globe className="h-5 w-5 text-niss" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">INTERPOL I-24/7</p>
              <p className="text-xs text-slate-500">Secure communications network</p>
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
            ACTIVE
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="rounded-lg bg-slate-800 p-3">
            <p className="text-slate-500 mb-1">Last Ingested Notice</p>
            <p className="text-slate-200 font-medium">DRC-2025-RN-00892</p>
            {interpolEvent && (
              <p className="text-slate-500 mt-0.5">
                {formatDistanceToNow(new Date(interpolEvent.created_at), { addSuffix: true })}
              </p>
            )}
          </div>
          <div className="rounded-lg bg-slate-800 p-3">
            <p className="text-slate-500 mb-1">Red Notices Active</p>
            <p className="text-2xl font-bold text-red-400">1</p>
          </div>
          <div className="rounded-lg bg-slate-800 p-3">
            <p className="text-slate-500 mb-1">Feed Status</p>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 font-medium">Live</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cross-border queries table */}
      <div>
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Recent Cross-Border Queries</h2>
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Suspect</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Notes</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {partnerQueries.map((e) => (
                  <tr key={e.id} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20">
                    <td className="px-4 py-3">
                      <SourceTagBadge tag={e.source_tag} />
                    </td>
                    <td className="px-4 py-3">
                      {e.suspect_name ? (
                        <div>
                          <p className="text-slate-200 font-medium">{e.suspect_name}</p>
                          {e.ims_reference && (
                            <p className="font-mono text-niss text-[10px]">{e.ims_reference}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 max-w-[280px]">
                      <p className="leading-relaxed">{e.notes ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
                {partnerQueries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-600">
                      No cross-border queries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth, institutionColor } from '@/hooks/useAuth'
import { useIdleTimeout } from '@/hooks/useIdleTimeout'
import { IdleWarning } from './IdleWarning'
import { SOSButton } from './SOSButton'
import { SOSAlertBanner } from './SOSAlertBanner'
import { CommanderRescueButton } from './CommanderRescueButton'
import { CommanderRescueAlertBanner } from './CommanderRescueAlertBanner'
import { OfflineAgentBanner } from './OfflineAgentBanner'
import { IntrusionAlertBanner } from './IntrusionAlertBanner'
import { useAgentHeartbeat } from '@/hooks/useAgentHeartbeat'
import { usePageTracking } from '@/hooks/usePageTracking'
import { useGeoAudit } from '@/hooks/useGeoAudit'
import { usePolicyGate } from '@/hooks/usePolicyGate'
import {
  Shield, LogOut, Bell, ChevronRight, Menu, X, AlertTriangle
} from 'lucide-react'
import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

interface Props {
  nav: NavItem[]
  institutionLabel: string
  children: React.ReactNode
  badge?: { count: number; critical: boolean }
}

const institutionBgMap: Record<string, string> = {
  niss:   'bg-niss',
  rnp:    'bg-rnp',
  rib:    'bg-rib',
  rdf:    'bg-rdf',
  rcs:    'bg-rcs',
  patrol: 'bg-patrol',
  brand:  'bg-brand-500',
}

export function DashboardShell({ nav, institutionLabel, children, badge }: Props) {
  const { user, logout } = useAuth()
  const pathname         = usePathname()
  const router           = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const color    = user ? institutionColor(user.institution) : 'brand'
  const accentBg = institutionBgMap[color] ?? 'bg-brand-500'

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  // ── Idle session timeout ──────────────────────────────────────────────────
  const { warn, secondsLeft, keepAlive } = useIdleTimeout(handleLogout)

  // Send heartbeat every 20s and detect offline/GPS events for all agents
  useAgentHeartbeat()
  // Track page visits for admin monitoring
  usePageTracking()
  // Attach GPS coords to all Axios requests for audit logging
  useGeoAudit()
  // Redirect to /agree if user hasn't accepted current policies
  usePolicyGate()

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">

      {/* ── Idle warning modal ── */}
      {warn && (
        <IdleWarning
          secondsLeft={secondsLeft}
          onKeepAlive={keepAlive}
          onLogout={handleLogout}
        />
      )}

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-800 bg-slate-900 transition-transform lg:static lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Brand */}
        <div className={clsx('flex items-center gap-3 px-5 py-4 border-b border-slate-800', accentBg)}>
          <Shield className="h-6 w-6 text-white" />
          <div>
            <p className="text-xs font-bold text-white/90 uppercase tracking-wider">{institutionLabel}</p>
            <p className="text-[10px] text-white/60">Rwanda Intelligence Management System</p>
          </div>
          <button className="ml-auto lg:hidden text-white/80" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User info */}
        {user && (
          <div className="border-b border-slate-800 px-5 py-3">
            <p className="text-xs font-semibold text-white truncate">{user.full_name}</p>
            <p className="text-[11px] text-slate-400">{user.badge_number} · {user.clearance_level}</p>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {nav.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={clsx(
                  'mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
                {active && <ChevronRight className="ml-auto h-3 w-3 text-slate-500" />}
              </Link>
            )
          })}
        </nav>

        {/* Session indicator + Logout */}
        <div className="border-t border-slate-800 p-3 space-y-1">
          {/* Session status */}
          <div className="flex items-center gap-2 px-3 py-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <p className="text-[10px] text-slate-600 font-mono tracking-wider">SESSION ACTIVE</p>
            <span className="ml-auto text-[10px] text-slate-700 font-mono">5 min timeout</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-red-950/60 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-900 px-4">
          <button
            className="text-slate-400 hover:text-white lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />

          {badge && badge.count > 0 && (
            <div className={clsx(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
              badge.critical ? 'bg-red-950 text-red-400' : 'bg-amber-950 text-amber-400'
            )}>
              {badge.critical ? <AlertTriangle className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
              {badge.count} alert{badge.count !== 1 ? 's' : ''}
            </div>
          )}

          {user && (
            <div className="hidden sm:block text-right">
              <p className="text-xs font-medium text-white">{user.full_name}</p>
              <p className="text-[11px] text-slate-500">{user.role}</p>
            </div>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {/* Alert banners — appear at the top of page content */}
          <div className="px-4 lg:px-6 pt-4 lg:pt-6">
            {user?.role === 'SYSTEM_ADMIN' && <IntrusionAlertBanner />}
            <CommanderRescueAlertBanner />
            <SOSAlertBanner />
            <OfflineAgentBanner />
          </div>
          <div className="px-4 lg:px-6 pb-4 lg:pb-6">
            {children}
          </div>
        </main>
      </div>

      {/* Commander rescue button — bottom-right, stacked above SOS (commanders only) */}
      <CommanderRescueButton />
      {/* Emergency SOS panic button — visible to all authenticated users */}
      <SOSButton />
    </div>
  )
}

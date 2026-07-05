'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { DashboardShell, NavItem } from '@/components/shared/DashboardShell'
import {
  LayoutDashboard, Users, MapPin, Shield, FileText,
  Radio, Globe, Lock, Activity, AlertTriangle, Crosshair,
} from 'lucide-react'

const nav: NavItem[] = [
  { label: 'Command Center',    href: '/niss',                icon: LayoutDashboard },
  { label: 'Field Incidents',   href: '/niss/incidents',      icon: Crosshair },
  { label: 'Alerts & SIEM',     href: '/niss/alerts',         icon: AlertTriangle },
  { label: 'Suspects',          href: '/niss/suspects',       icon: Users },
  { label: 'Location Intel',    href: '/niss/location',       icon: MapPin },
  { label: 'Intelligence Feed', href: '/niss/intelligence',   icon: Activity },
  { label: 'Cases',             href: '/niss/cases',          icon: FileText },
  { label: 'Camera Network',    href: '/niss/cameras',        icon: Radio },
  { label: 'Int\'l Partners',   href: '/niss/partners',       icon: Globe },
  { label: 'Emergency Lockdown',href: '/niss/lockdown',       icon: Lock },
  { label: 'Audit Log',         href: '/niss/audit',          icon: Shield },
]

export default function NISSLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && (!user || !['NISS', 'SYSTEM'].includes(user.institution))) {
      router.replace('/login')
    }
  }, [user, loading, router])

  if (loading || !user) return null

  return (
    <DashboardShell nav={nav} institutionLabel="NISS — National Intelligence">
      {children}
    </DashboardShell>
  )
}

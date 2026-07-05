'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { DashboardShell, NavItem } from '@/components/shared/DashboardShell'
import { LayoutDashboard, Users, FileText, Radio, AlertTriangle, Activity, Map, Crosshair } from 'lucide-react'

const nav: NavItem[] = [
  { label: 'Operations',      href: '/rnp',                icon: LayoutDashboard },
  { label: 'Field Incidents', href: '/rnp/incidents',      icon: Crosshair },
  { label: 'Wanted Suspects', href: '/rnp/wanted',         icon: Users },
  { label: 'Active Warrants', href: '/rnp/warrants',       icon: FileText },
  { label: 'Alerts',          href: '/rnp/alerts',         icon: AlertTriangle },
  { label: 'Intel Events',    href: '/rnp/intelligence',   icon: Activity },
  { label: 'Camera Feed',     href: '/rnp/cameras',        icon: Radio },
  { label: 'Patrol Map',      href: '/rnp/map',            icon: Map },
]

const ALLOWED_ROLES = ['RNP_COMMANDER','RNP_DETECTIVE','RNP_PATROL','SYSTEM_ADMIN']

export default function RNPLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && (!user || !ALLOWED_ROLES.includes(user.role))) {
      router.replace('/login')
    }
  }, [user, loading, router])

  if (loading || !user) return null

  return (
    <DashboardShell nav={nav} institutionLabel="RNP — Rwanda National Police">
      {children}
    </DashboardShell>
  )
}

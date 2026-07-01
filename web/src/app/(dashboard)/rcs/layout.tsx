'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { DashboardShell, NavItem } from '@/components/shared/DashboardShell'
import { LayoutDashboard, Users, FileText, AlertTriangle, Activity } from 'lucide-react'

const nav: NavItem[] = [
  { label: 'Custody Overview', href: '/rcs',             icon: LayoutDashboard },
  { label: 'Inmates',          href: '/rcs/inmates',     icon: Users },
  { label: 'Corrections Rec.', href: '/rcs/corrections', icon: FileText },
  { label: 'Alerts',           href: '/rcs/alerts',      icon: AlertTriangle },
  { label: 'Events',           href: '/rcs/events',      icon: Activity },
]

const ALLOWED_ROLES = ['RCS_SUPERINTENDENT','RCS_OFFICER']

export default function RCSLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && (!user || !ALLOWED_ROLES.includes(user.role))) {
      router.replace('/login')
    }
  }, [user, loading, router])

  if (loading || !user) return null

  return (
    <DashboardShell nav={nav} institutionLabel="RCS — Correctional Service">
      {children}
    </DashboardShell>
  )
}

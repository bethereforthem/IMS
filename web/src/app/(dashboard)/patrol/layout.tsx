'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { DashboardShell, NavItem } from '@/components/shared/DashboardShell'
import { LayoutDashboard, Search, AlertTriangle, Activity, UserX } from 'lucide-react'

const nav: NavItem[] = [
  { label: 'Dashboard',        href: '/patrol',          icon: LayoutDashboard },
  { label: 'NID / Face Check', href: '/patrol/check',    icon: Search },
  { label: 'Report Person',    href: '/patrol/report',   icon: UserX },
  { label: 'Alerts',           href: '/patrol/alerts',   icon: AlertTriangle },
  { label: 'My Reports',       href: '/patrol/activity', icon: Activity },
]

const ALLOWED_ROLES = ['VILLAGE_LEADER']

export default function PatrolLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && (!user || !ALLOWED_ROLES.includes(user.role))) {
      router.replace('/login')
    }
  }, [user, loading, router])

  if (loading || !user) return null

  return (
    <DashboardShell nav={nav} institutionLabel="Village Leader Portal">
      {children}
    </DashboardShell>
  )
}

'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { DashboardShell, NavItem } from '@/components/shared/DashboardShell'
import { LayoutDashboard, Search, AlertTriangle, Activity } from 'lucide-react'

const nav: NavItem[] = [
  { label: 'Patrol Dashboard', href: '/patrol',              icon: LayoutDashboard },
  { label: 'NID / Face Check', href: '/patrol/check',        icon: Search },
  { label: 'Alerts',           href: '/patrol/alerts',       icon: AlertTriangle },
  { label: 'My Activity',      href: '/patrol/activity',     icon: Activity },
]

const ALLOWED_ROLES = ['IRONDO_PATROL','DASSO_OFFICER']

export default function PatrolLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && (!user || !ALLOWED_ROLES.includes(user.role))) {
      router.replace('/login')
    }
  }, [user, loading, router])

  if (loading || !user) return null

  const label = user.role === 'IRONDO_PATROL' ? 'Irondo — Community Patrol' : 'Dasso — Local Security'

  return (
    <DashboardShell nav={nav} institutionLabel={label}>
      {children}
    </DashboardShell>
  )
}

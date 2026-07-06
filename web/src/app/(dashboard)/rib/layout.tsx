'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { DashboardShell, NavItem } from '@/components/shared/DashboardShell'
import { LayoutDashboard, Search, FileText, AlertTriangle, Activity, Users, BarChart2, Brain } from 'lucide-react'

const investigatorNav: NavItem[] = [
  { label: 'Investigations',  href: '/rib',              icon: LayoutDashboard },
  { label: 'Suspects',        href: '/rib/suspects',     icon: Search },
  { label: 'AI Intelligence', href: '/rib/ai',           icon: Brain },
  { label: 'My Cases',        href: '/rib/cases',        icon: FileText },
  { label: 'Intel Events',    href: '/rib/intelligence', icon: Activity },
  { label: 'Alerts',          href: '/rib/alerts',       icon: AlertTriangle },
  { label: 'Analysts',        href: '/rib/team',         icon: Users },
]

const analystNav: NavItem[] = [
  { label: 'Intel Analysis',  href: '/rib',              icon: BarChart2 },
  { label: 'Suspects',        href: '/rib/suspects',     icon: Search },
  { label: 'AI Intelligence', href: '/rib/ai',           icon: Brain },
  { label: 'Cases',           href: '/rib/cases',        icon: FileText },
  { label: 'Intel Events',    href: '/rib/intelligence', icon: Activity },
  { label: 'Alerts',          href: '/rib/alerts',       icon: AlertTriangle },
]

const ALLOWED_ROLES = ['RIB_INVESTIGATOR', 'RIB_ANALYST']

export default function RIBLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && (!user || !ALLOWED_ROLES.includes(user.role))) {
      router.replace('/login')
    }
  }, [user, loading, router])

  if (loading || !user) return null

  const isAnalyst = user.role === 'RIB_ANALYST'

  return (
    <DashboardShell
      nav={isAnalyst ? analystNav : investigatorNav}
      institutionLabel={isAnalyst ? 'RIB — Analysis Unit' : 'RIB — Investigation Bureau'}
    >
      {children}
    </DashboardShell>
  )
}

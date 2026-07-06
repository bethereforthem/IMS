'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { DashboardShell, NavItem } from '@/components/shared/DashboardShell'
import { LayoutDashboard, Users, ShieldAlert, BarChart3, Settings, ScrollText, FileText } from 'lucide-react'

const nav: NavItem[] = [
  { label: 'Overview',         href: '/admin',            icon: LayoutDashboard },
  { label: 'User Management',  href: '/admin/users',      icon: Users },
  { label: 'Security / IDS',   href: '/admin/security',   icon: ShieldAlert },
  { label: 'Analytics',        href: '/admin/analytics',  icon: BarChart3 },
  { label: 'System Controls',  href: '/admin/controls',   icon: Settings },
  { label: 'Audit Log',        href: '/admin/audit',      icon: ScrollText },
  { label: 'Policies',         href: '/admin/policies',   icon: FileText },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && (!user || user.role !== 'SYSTEM_ADMIN')) {
      router.replace('/login')
    }
  }, [user, loading, router])

  if (loading || !user) return null

  return (
    <DashboardShell nav={nav} institutionLabel="RCIMS — System Administration">
      {children}
    </DashboardShell>
  )
}

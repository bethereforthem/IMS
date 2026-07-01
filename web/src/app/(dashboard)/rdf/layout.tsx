'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { DashboardShell, NavItem } from '@/components/shared/DashboardShell'
import { LayoutDashboard, Radio, Users, AlertTriangle, Map, Activity } from 'lucide-react'

const nav: NavItem[] = [
  { label: 'Border Ops',      href: '/rdf',              icon: LayoutDashboard },
  { label: 'Camera Nodes',    href: '/rdf/cameras',      icon: Radio },
  { label: 'Border Suspects', href: '/rdf/suspects',     icon: Users },
  { label: 'Alerts',          href: '/rdf/alerts',       icon: AlertTriangle },
  { label: 'Border Map',      href: '/rdf/map',          icon: Map },
  { label: 'Intel Events',    href: '/rdf/intelligence', icon: Activity },
]

const ALLOWED_ROLES = ['RDF_COMMANDER','RDF_BORDER_OFFICER']

export default function RDFLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && (!user || !ALLOWED_ROLES.includes(user.role))) {
      router.replace('/login')
    }
  }, [user, loading, router])

  if (loading || !user) return null

  return (
    <DashboardShell nav={nav} institutionLabel="RDF — Defence Force Border">
      {children}
    </DashboardShell>
  )
}

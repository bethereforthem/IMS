'use client'
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { StatCard } from '@/components/shared/StatCard'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import { Users, Shield, Briefcase, Activity } from 'lucide-react'

type MemberStatus = 'ON_DUTY' | 'OFF_DUTY'
type StatusFilter = MemberStatus | 'ALL'

interface TeamMember {
  id: string
  badge: string
  name: string
  role: 'RIB_INVESTIGATOR' | 'RIB_ANALYST'
  specialisation: string
  active_cases: number
  clearance: string
  status: MemberStatus
  last_active: string
}

const TEAM: TeamMember[] = [
  { id:'t1', badge:'RIB-INV-001', name:'Pascal Habimana',       role:'RIB_INVESTIGATOR', specialisation:'Financial Crime',      active_cases:3, clearance:'SECRET', status:'ON_DUTY',  last_active:'2026-06-29T11:30:00Z' },
  { id:'t2', badge:'RIB-INV-002', name:'Rose Kayitesi',         role:'RIB_INVESTIGATOR', specialisation:'Human Trafficking',    active_cases:2, clearance:'SECRET', status:'ON_DUTY',  last_active:'2026-06-29T10:00:00Z' },
  { id:'t3', badge:'RIB-INV-003', name:'Sylvain Ndayisaba',     role:'RIB_INVESTIGATOR', specialisation:'Cybercrime',           active_cases:1, clearance:'SECRET', status:'OFF_DUTY', last_active:'2026-06-28T17:00:00Z' },
  { id:'t4', badge:'RIB-ANA-004', name:'Martine Uwiringiyimana',role:'RIB_ANALYST',      specialisation:'Intelligence Analysis',active_cases:0, clearance:'SECRET', status:'ON_DUTY',  last_active:'2026-06-29T13:00:00Z' },
  { id:'t5', badge:'RIB-ANA-005', name:'Christian Niyonsenga',  role:'RIB_ANALYST',      specialisation:'OSINT & Data Mining',  active_cases:0, clearance:'SECRET', status:'ON_DUTY',  last_active:'2026-06-29T12:45:00Z' },
]

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function shortFirstName(name: string) {
  return name.split(' ')[0]
}

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'ON_DUTY', 'OFF_DUTY']

const ROLE_BADGE: Record<string, string> = {
  RIB_INVESTIGATOR: 'text-teal-400 bg-teal-950 border border-teal-900/40',
  RIB_ANALYST:      'text-purple-400 bg-purple-950 border border-purple-900/40',
}

const ROLE_LABEL: Record<string, string> = {
  RIB_INVESTIGATOR: 'Investigator',
  RIB_ANALYST:      'Analyst',
}

function MemberCard({ m }: { m: TeamMember }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 flex gap-4 hover:border-rib/20 transition-colors">
      {/* Avatar */}
      <div className="shrink-0 h-11 w-11 rounded-full bg-rib/20 text-rib flex items-center justify-center font-bold text-sm">
        {initials(m.name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-100 truncate">{m.name}</p>
            <div className={clsx(
              'h-2 w-2 rounded-full shrink-0',
              m.status === 'ON_DUTY' ? 'bg-green-500' : 'bg-slate-600'
            )} title={m.status.replace('_', ' ')} />
          </div>
          <p className="text-[11px] text-slate-500 font-mono">{m.badge}</p>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', ROLE_BADGE[m.role])}>
            {ROLE_LABEL[m.role]}
          </span>
          <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
            {m.specialisation}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span>
            Active Cases:{' '}
            <span className={clsx(
              'font-bold ml-0.5',
              m.active_cases > 0 ? 'text-amber-400' : 'text-slate-500'
            )}>
              {m.active_cases}
            </span>
          </span>
          <span className="text-slate-600">·</span>
          <span>Clearance: <span className="text-amber-400 font-semibold">{m.clearance}</span></span>
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-600">
          <span className={clsx(
            'font-semibold',
            m.status === 'ON_DUTY' ? 'text-green-500' : 'text-slate-500'
          )}>
            {m.status.replace('_', ' ')}
          </span>
          <span>Last active {formatDistanceToNow(new Date(m.last_active), { addSuffix: true })}</span>
        </div>
      </div>
    </div>
  )
}

const chartData = TEAM.map(m => ({
  name: shortFirstName(m.name),
  cases: m.active_cases,
}))

export default function RIBTeamPage() {
  const { user } = useAuth()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  const filtered = TEAM.filter(m => statusFilter === 'ALL' || m.status === statusFilter)

  const totalOfficers      = TEAM.length
  const onDutyCount        = TEAM.filter(m => m.status === 'ON_DUTY').length
  const activeInvestigators = TEAM.filter(m => m.role === 'RIB_INVESTIGATOR' && m.status === 'ON_DUTY').length
  const totalActiveCases   = TEAM.reduce((sum, m) => sum + m.active_cases, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">RIB Team</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rib animate-pulse" />
          RIB Intel Unit
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Officers" value={totalOfficers} icon={Users} sub="Intelligence unit" />
        <StatCard label="On Duty" value={onDutyCount} icon={Shield} sub="Currently active" />
        <StatCard label="Active Investigators" value={activeInvestigators} icon={Briefcase} sub="On-duty investigators" />
        <StatCard label="Active Cases" value={totalActiveCases} icon={Activity} variant="warn" sub="Across all officers" />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={clsx(
              'text-[11px] font-semibold uppercase px-3 py-1 rounded-full border transition-colors',
              statusFilter === s
                ? 'bg-rib border-rib text-white'
                : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
            )}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500 bg-slate-800 px-2.5 py-1 rounded-full">
          {filtered.length} member{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Member grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map(m => <MemberCard key={m.id} m={m} />)}
        {filtered.length === 0 && (
          <div className="sm:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-500 text-sm">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No team members match the selected filter.
          </div>
        )}
      </div>

      {/* Workload chart */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-200">Team Workload — Active Cases</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#e2e8f0' }}
              cursor={{ fill: 'rgba(15,118,110,0.08)' }}
            />
            <Bar dataKey="cases" fill="#0F766E" radius={[4, 4, 0, 0]} name="Active Cases" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

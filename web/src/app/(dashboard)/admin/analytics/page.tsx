'use client'

import { useEffect, useState } from 'react'
import { adminPortalApi, type AdminAnalytics } from '@/lib/api'
import { BarChart3 } from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell, Tooltip as ReTooltip, Legend,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid,
} from 'recharts'

const INST_COLORS = ['#3b82f6', '#22c55e', '#e11d48', '#f97316', '#a855f7', '#64748b', '#f59e0b']
const SEV_COLORS  = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#64748b']

export default function AdminAnalyticsPage() {
  const [data,    setData]    = useState<AdminAnalytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminPortalApi.getAnalytics()
      .then(r => setData(r.data ?? null))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#64748b' }}>
        Loading analytics…
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
        Failed to load analytics data.
      </div>
    )
  }

  const card = (label: string, value: string | number, color: string) => (
    <div style={{
      background: '#0f172a', border: `1px solid ${color}33`,
      borderRadius: '10px', padding: '16px 20px',
      boxShadow: `0 0 16px ${color}18`,
    }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
    </div>
  )

  const chartBox = (title: string, children: React.ReactNode) => (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', marginBottom: '16px' }}>{title}</div>
      {children}
    </div>
  )

  const { summary, daily_logins, by_institution, by_role, by_incident_type, top_pages, daily_incidents, sessions_by_institution } = data

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <BarChart3 style={{ width: 22, height: 22, color: '#3b82f6' }} />
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>Analytics</h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>System-wide intelligence dashboard</p>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {card('Active Users',        summary.total_active_users,   '#3b82f6')}
        {card('Logins (24h)',         summary.total_logins_24h,     '#22c55e')}
        {card('Failed Logins (24h)', summary.failed_logins_24h,    '#f97316')}
        {card('Open IDS Incidents',  summary.unresolved_incidents, '#ef4444')}
      </div>

      {/* Row 1: Area chart — daily logins */}
      <div style={{ marginBottom: '20px' }}>
        {chartBox('Login Activity — Last 30 Days',
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={daily_logins} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="lgSuccess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="lgFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <ReTooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 11 }} />
              <Area type="monotone" dataKey="success" stroke="#22c55e" fill="url(#lgSuccess)" strokeWidth={2} name="Successful" />
              <Area type="monotone" dataKey="failed"  stroke="#ef4444" fill="url(#lgFailed)"  strokeWidth={2} name="Failed" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Row 2: two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

        {/* Pie — users by institution */}
        {chartBox('Active Users by Institution',
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={by_institution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {by_institution.map((_, idx) => (
                  <Cell key={idx} fill={INST_COLORS[idx % INST_COLORS.length]} />
                ))}
              </Pie>
              <ReTooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}

        {/* Bar — sessions by institution */}
        {chartBox('Live Sessions by Institution',
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sessions_by_institution} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <ReTooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 11 }} />
              <Bar dataKey="value" name="Sessions" radius={[4, 4, 0, 0]}>
                {sessions_by_institution.map((_, idx) => (
                  <Cell key={idx} fill={INST_COLORS[idx % INST_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Row 3: security incidents trend + by type */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

        {/* Line — daily incidents */}
        {chartBox('Security Incidents — Last 30 Days',
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={daily_incidents} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <ReTooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 11 }} />
              <Line type="monotone" dataKey="count" stroke="#ef4444" strokeWidth={2} dot={false} name="Incidents" />
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* Pie — by incident type */}
        {chartBox('Incident Types (Unresolved)',
          by_incident_type.length === 0
            ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#64748b', fontSize: 13 }}>No open incidents</div>
            : <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={by_incident_type} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                    {by_incident_type.map((_, idx) => <Cell key={idx} fill={SEV_COLORS[idx % SEV_COLORS.length]} />)}
                  </Pie>
                  <ReTooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 11 }} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                </PieChart>
              </ResponsiveContainer>
        )}
      </div>

      {/* Row 4: top pages + roles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Bar — top pages */}
        {chartBox('Top Pages — Last 7 Days',
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={top_pages.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} />
              <YAxis type="category" dataKey="path" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} width={80} />
              <ReTooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 11 }} />
              <Bar dataKey="visits" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Visits" />
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Pie — users by role */}
        {chartBox('Users by Role',
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={by_role} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                {by_role.map((_, idx) => <Cell key={idx} fill={INST_COLORS[idx % INST_COLORS.length]} />)}
              </Pie>
              <ReTooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 11 }} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 9, color: '#94a3b8' }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth, isVillageLeader } from '@/hooks/useAuth'
import { dashboardApi, Alert } from '@/lib/api'
import { C, INSTITUTION_COLOR, INSTITUTION_LABEL, RADIUS } from '@/lib/theme'

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f59e0b',
  MEDIUM:   '#3b82f6',
  LOW:      '#22c55e',
}

interface Stats {
  total_suspects: number
  alerts_today: number
  critical_alerts: number
  active_cases: number
}

export default function DashboardScreen() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [stats, setStats]     = useState<Stats | null>(null)
  const [alerts, setAlerts]   = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const accent = user ? (INSTITUTION_COLOR[user.institution] ?? C.rnp) : C.rnp
  const vl     = isVillageLeader(user?.role)

  async function load() {
    try {
      const [sRes, aRes] = await Promise.all([
        dashboardApi.getStats(),
        dashboardApi.getRecentAlerts(5),
      ])
      setStats(sRes.data)
      setAlerts(aRes.data?.alerts ?? [])
    } catch { /* ignore */ }
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const institutionLabel = user ? (INSTITUTION_LABEL[user.institution] ?? user.institution) : ''

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={[s.badge, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
          <Text style={[s.badgeText, { color: accent }]}>{institutionLabel}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={s.logoutBtn}>
          <Text style={s.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.greeting}>Good day, {user?.full_name?.split(' ')[0]}</Text>
      <Text style={s.sub}>{user?.badge_number} · {user?.role?.replace(/_/g, ' ')}</Text>

      {loading ? (
        <ActivityIndicator color={accent} style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* Stats grid — not shown for village leaders */}
          {!vl && stats && (
            <View style={s.grid}>
              <StatCard label="Total Suspects" value={stats.total_suspects} color={C.text} />
              <StatCard label="Alerts Today"   value={stats.alerts_today}   color={C.warning} />
              <StatCard label="Critical"        value={stats.critical_alerts} color={C.danger} />
              <StatCard label="Active Cases"    value={stats.active_cases}   color={accent} />
            </View>
          )}

          {/* Village leader simplified stats */}
          {vl && stats && (
            <View style={s.grid}>
              <StatCard label="Alerts Today" value={stats.alerts_today}   color={C.warning} />
              <StatCard label="Critical"     value={stats.critical_alerts} color={C.danger} />
            </View>
          )}

          {/* Quick actions */}
          <Text style={s.sectionTitle}>Quick Actions</Text>
          <View style={s.actions}>
            <ActionBtn label="NID Check"   emoji="🔍" onPress={() => router.push('/(app)/nid')}    color={accent} />
            <ActionBtn label={vl ? 'Report' : 'Intel Report'} emoji={vl ? '📋' : '📡'} onPress={() => router.push('/(app)/report')} color={accent} />
            <ActionBtn label="SOS"          emoji="🚨" onPress={() => router.push('/(app)/sos')}    color={C.danger} />
          </View>

          {/* Recent alerts */}
          {alerts.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Recent Alerts</Text>
              {alerts.map(a => (
                <View key={a.id} style={[s.alertCard, { borderLeftColor: SEVERITY_COLOR[a.severity] ?? C.muted }]}>
                  <View style={s.alertRow}>
                    <View style={[s.severityDot, { backgroundColor: SEVERITY_COLOR[a.severity] ?? C.muted }]} />
                    <Text style={s.alertTitle} numberOfLines={1}>{a.title}</Text>
                  </View>
                  <Text style={s.alertMsg} numberOfLines={2}>{a.message}</Text>
                </View>
              ))}
            </>
          )}

          {alerts.length === 0 && (
            <View style={s.empty}>
              <Text style={s.emptyText}>No unread alerts</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={sc.card}>
      <Text style={[sc.value, { color }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  )
}

function ActionBtn({ label, emoji, onPress, color }: { label: string; emoji: string; onPress: () => void; color: string }) {
  return (
    <TouchableOpacity style={[ab.btn, { borderColor: color + '55' }]} onPress={onPress}>
      <Text style={ab.emoji}>{emoji}</Text>
      <Text style={[ab.label, { color }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 40 },

  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  badge:       { paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1 },
  badgeText:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  logoutBtn:   { padding: 4 },
  logoutText:  { color: C.muted, fontSize: 13 },

  greeting: { color: C.text, fontSize: 24, fontWeight: '700', marginBottom: 2 },
  sub:      { color: C.muted, fontSize: 13, marginBottom: 24 },

  grid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },

  sectionTitle: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 },

  actions:  { flexDirection: 'row', gap: 10, marginBottom: 24 },

  alertCard: {
    backgroundColor: C.surface, borderRadius: RADIUS.md,
    padding: 14, marginBottom: 10,
    borderLeftWidth: 3, borderWidth: 1, borderColor: C.border,
  },
  alertRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  alertTitle:  { color: C.text, fontSize: 14, fontWeight: '600', flex: 1 },
  alertMsg:    { color: C.muted, fontSize: 13 },

  empty:     { alignItems: 'center', paddingVertical: 30 },
  emptyText: { color: C.muted, fontSize: 14 },
})

const sc = StyleSheet.create({
  card:  {
    flex: 1, minWidth: '45%', backgroundColor: C.surface,
    borderRadius: RADIUS.md, padding: 16,
    borderWidth: 1, borderColor: C.border, alignItems: 'center',
  },
  value: { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  label: { color: C.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', textAlign: 'center' },
})

const ab = StyleSheet.create({
  btn:   {
    flex: 1, backgroundColor: C.surface, borderRadius: RADIUS.md,
    padding: 16, alignItems: 'center', borderWidth: 1,
  },
  emoji: { fontSize: 22, marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
})

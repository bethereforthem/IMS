/**
 * Live GPS Tracking Status Screen
 *
 * Shows the agent their current tracking session:
 *  - Active / Paused indicator with pulsing animation
 *  - Current coordinates refreshed every 5 seconds
 *  - Local movement history trail
 *  - Pause / Resume / Close session controls
 *  - Offline queue status (pending reports)
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Animated, Easing, Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/hooks/useAuth'
import { trackingApi } from '@/lib/api'
import { getCurrentCoords, Coords, coordsLabel } from '@/lib/location'
import { stopTracking, startTracking, getLocalHistory, PingPoint } from '@/lib/tracking'
import {
  getTrackingSession, clearTrackingSession, getQueue, QueuedReport,
  saveTrackingSession,
} from '@/lib/offlineStore'
import { fieldReportApi } from '@/lib/api'
import { C, RADIUS, INSTITUTION_COLOR } from '@/lib/theme'

const REFRESH_INTERVAL = 5_000

export default function TrackingScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const accent = user ? (INSTITUTION_COLOR[user.institution] ?? C.niss) : C.niss

  const [session, setSession]           = useState<{ session_id: string; report_title: string; started_at: string } | null>(null)
  const [sessionStatus, setSessStatus]  = useState<'ACTIVE' | 'PAUSED' | 'CLOSED' | null>(null)
  const [currentCoords, setCoords]      = useState<Coords | null>(null)
  const [history, setHistory]           = useState<PingPoint[]>([])
  const [queue, setQueue]               = useState<QueuedReport[]>([])
  const [loading, setLoading]           = useState(true)
  const [actionLoading, setActLoading]  = useState(false)
  const [syncStatus, setSyncStatus]     = useState<string | null>(null)

  // Pulse animation for active tracking dot
  const pulse = useRef(new Animated.Value(1)).current
  const pulseAnim = useRef<Animated.CompositeAnimation | null>(null)

  const startPulse = useCallback(() => {
    pulseAnim.current?.stop()
    pulseAnim.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    )
    pulseAnim.current.start()
  }, [pulse])

  const stopPulse = useCallback(() => {
    pulseAnim.current?.stop()
    pulse.setValue(1)
  }, [pulse])

  // Load saved session and offline queue.
  // If no local session exists, query the server to recover a session that was
  // created while the app was offline or after a commander-initiated reopen.
  useEffect(() => {
    async function init() {
      setLoading(true)
      let saved = await getTrackingSession()

      if (!saved) {
        try {
          const res = await trackingApi.getMyActiveSession()
          const srv = res.data?.session
          if (srv) {
            const restored: typeof saved = {
              session_id:      srv.session_id,
              field_report_id: srv.field_report_id,
              report_title:    srv.report_title ?? 'Reopened investigation',
              started_at:      srv.started_at,
            }
            await saveTrackingSession(restored)
            saved = restored
            // If server says ACTIVE, restart the foreground tracking so pings resume
            if (srv.status === 'ACTIVE') {
              await startTracking(srv.session_id)
            }
          }
        } catch {
          // Server unreachable — continue with no session
        }
      }

      setSession(saved)
      if (saved) {
        setSessStatus('ACTIVE')
        startPulse()
      }
      const q = await getQueue()
      setQueue(q)
      const hist = await getLocalHistory()
      setHistory(hist.slice(-50))
      setLoading(false)
    }
    init()
  }, [startPulse])

  // Refresh current GPS position periodically
  useEffect(() => {
    if (!session || sessionStatus === 'CLOSED') return
    getCurrentCoords().then(setCoords)
    const id = setInterval(() => getCurrentCoords().then(setCoords), REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [session, sessionStatus])

  // Refresh movement history
  useEffect(() => {
    if (!session) return
    const id = setInterval(async () => {
      const hist = await getLocalHistory()
      setHistory(hist.slice(-50))
    }, 15_000)
    return () => clearInterval(id)
  }, [session])

  // Sync offline queue
  useEffect(() => {
    if (queue.length === 0) return

    async function syncQueue() {
      setSyncStatus('Syncing offline reports…')
      let synced = 0
      for (const report of queue) {
        try {
          const res = await fieldReportApi.submit(report)
          if (res.data?.id) {
            const { default: offlineStore } = await import('@/lib/offlineStore')
            await offlineStore.removeFromQueue(report.offline_id)
            synced++

            // Auto-start tracking if no session yet
            if (res.data.tracking_session_id && !session) {
              await startTracking(res.data.tracking_session_id)
              await saveTrackingSession({
                session_id: res.data.tracking_session_id,
                field_report_id: res.data.id,
                report_title: report.title,
                started_at: new Date().toISOString(),
              })
              setSession({ session_id: res.data.tracking_session_id, report_title: report.title, started_at: new Date().toISOString() })
              setSessStatus('ACTIVE')
              startPulse()
            }
          }
        } catch { /* still offline, skip */ }
      }
      const remaining = await getQueue()
      setQueue(remaining)
      setSyncStatus(synced > 0 ? `${synced} report(s) synced` : null)
    }

    syncQueue()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Session actions ────────────────────────────────────────────────────────

  async function handlePause() {
    if (!session) return
    setActLoading(true)
    try {
      await trackingApi.sessionAction(session.session_id, 'pause')
      await stopTracking()
      setSessStatus('PAUSED')
      stopPulse()
    } catch {
      Alert.alert('Error', 'Could not pause session.')
    } finally { setActLoading(false) }
  }

  async function handleResume() {
    if (!session) return
    setActLoading(true)
    try {
      await trackingApi.sessionAction(session.session_id, 'resume')
      await startTracking(session.session_id)
      setSessStatus('ACTIVE')
      startPulse()
    } catch {
      Alert.alert('Error', 'Could not resume session.')
    } finally { setActLoading(false) }
  }

  async function handleClose() {
    if (!session) return
    Alert.alert(
      'Close Investigation',
      'This will permanently stop tracking and mark the investigation as closed. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Investigation',
          style: 'destructive',
          onPress: async () => {
            setActLoading(true)
            try {
              await trackingApi.sessionAction(session.session_id, 'close')
              await stopTracking()
              await clearTrackingSession()
              setSessStatus('CLOSED')
              stopPulse()
              setSession(null)
            } catch {
              Alert.alert('Error', 'Could not close session.')
            } finally { setActLoading(false) }
          },
        },
      ]
    )
  }

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.centred}>
        <ActivityIndicator color={accent} size="large" />
      </View>
    )
  }

  if (!session || sessionStatus === 'CLOSED') {
    return (
      <View style={s.centred}>
        <Text style={s.emptyIcon}>📡</Text>
        <Text style={s.emptyTitle}>No Active Session</Text>
        <Text style={s.emptyDesc}>
          Submit a field incident report to automatically start GPS tracking.
        </Text>
        <TouchableOpacity
          style={[s.actionBtn, { backgroundColor: accent, marginTop: 24 }]}
          onPress={() => router.push('/(app)/incident')}
        >
          <Text style={s.actionBtnText}>Submit Incident</Text>
        </TouchableOpacity>
        {queue.length > 0 && (
          <View style={s.queueBanner}>
            <Text style={s.queueBannerText}>
              📦 {queue.length} offline report(s) pending sync
            </Text>
          </View>
        )}
      </View>
    )
  }

  const isActive = sessionStatus === 'ACTIVE'
  const isPaused = sessionStatus === 'PAUSED'

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      {/* Header */}
      <Text style={s.screenTitle}>GPS Tracking</Text>
      <Text style={s.screenSub}>{user?.full_name} · {user?.badge_number}</Text>

      {/* Status card */}
      <View style={[s.statusCard, { borderColor: isActive ? C.success : isPaused ? C.warning : C.border }]}>
        <View style={s.statusRow}>
          <Animated.View style={[s.statusDot, {
            backgroundColor: isActive ? C.success : isPaused ? C.warning : C.muted,
            transform: [{ scale: isActive ? pulse : 1 }],
          }]} />
          <Text style={[s.statusLabel, {
            color: isActive ? C.success : isPaused ? C.warning : C.muted
          }]}>
            {isActive ? 'TRACKING ACTIVE' : isPaused ? 'TRACKING PAUSED' : 'CLOSED'}
          </Text>
        </View>

        <Text style={s.reportTitle} numberOfLines={2}>{session.report_title}</Text>

        <View style={s.metaRow}>
          <Text style={s.metaItem}>
            Started: {new Date(session.started_at).toLocaleString('en-RW', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
            })}
          </Text>
        </View>

        {/* Current coordinates */}
        <View style={s.coordsBox}>
          <Text style={s.coordsLabel}>Current Position</Text>
          <Text style={s.coordsValue}>
            {currentCoords ? coordsLabel(currentCoords) : 'Acquiring…'}
          </Text>
        </View>
      </View>

      {/* Controls */}
      <View style={s.controlsRow}>
        {isActive && (
          <TouchableOpacity
            style={[s.controlBtn, { backgroundColor: C.warnBg, borderColor: C.warning }]}
            onPress={handlePause}
            disabled={actionLoading}
          >
            {actionLoading
              ? <ActivityIndicator color={C.warning} size="small" />
              : <Text style={[s.controlBtnText, { color: C.warning }]}>⏸ Pause</Text>
            }
          </TouchableOpacity>
        )}
        {isPaused && (
          <TouchableOpacity
            style={[s.controlBtn, { backgroundColor: C.okBg, borderColor: C.success }]}
            onPress={handleResume}
            disabled={actionLoading}
          >
            {actionLoading
              ? <ActivityIndicator color={C.success} size="small" />
              : <Text style={[s.controlBtnText, { color: C.success }]}>▶ Resume</Text>
            }
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.controlBtn, { backgroundColor: C.dangerBg, borderColor: C.danger }]}
          onPress={handleClose}
          disabled={actionLoading}
        >
          <Text style={[s.controlBtnText, { color: C.danger }]}>✕ Close Investigation</Text>
        </TouchableOpacity>
      </View>

      {/* Offline queue banner */}
      {queue.length > 0 && (
        <View style={s.queueBanner}>
          <Text style={s.queueBannerText}>
            📦 {queue.length} offline report(s) pending sync
          </Text>
        </View>
      )}

      {syncStatus && (
        <Text style={s.syncStatus}>{syncStatus}</Text>
      )}

      {/* Movement history */}
      {history.length > 0 && (
        <>
          <Text style={s.sectionTitle}>Movement History (last {history.length} pings)</Text>
          <View style={s.historyList}>
            {history.slice().reverse().slice(0, 20).map((p, idx) => (
              <View key={idx} style={s.historyItem}>
                <View style={s.historyLine}>
                  <View style={s.historyDot} />
                  <Text style={s.historyCoords}>{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</Text>
                </View>
                <Text style={s.historyTime}>
                  {new Date(p.ts).toLocaleTimeString('en-RW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  {p.accuracy_m != null ? `  ±${p.accuracy_m}m` : ''}
                  {p.speed_ms != null ? `  ${(p.speed_ms * 3.6).toFixed(1)} km/h` : ''}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={s.securityNote}>
        🔒 Location data encrypted in transit · Classification: TOP SECRET
      </Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 50 },

  centred: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', padding: 32 },

  screenTitle: { color: C.text, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  screenSub:   { color: C.muted, fontSize: 12, marginBottom: 20 },

  // Status card
  statusCard: {
    backgroundColor: C.surface, borderRadius: RADIUS.lg,
    borderWidth: 1.5, padding: 20, marginBottom: 16,
  },
  statusRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  statusDot:  { width: 12, height: 12, borderRadius: 6 },
  statusLabel:{ fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  reportTitle:{ color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  metaRow:    { flexDirection: 'row', marginBottom: 14 },
  metaItem:   { color: C.muted, fontSize: 12 },
  coordsBox:  {
    backgroundColor: C.bg, borderRadius: RADIUS.md,
    padding: 12, borderWidth: 1, borderColor: C.border,
  },
  coordsLabel:{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  coordsValue:{ color: C.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },

  // Controls
  controlsRow: { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  controlBtn:  {
    flex: 1, minWidth: '45%', paddingVertical: 12, alignItems: 'center',
    borderRadius: RADIUS.md, borderWidth: 1.5,
  },
  controlBtnText: { fontWeight: '700', fontSize: 13 },

  // Queue / sync
  queueBanner: {
    backgroundColor: '#1c1917', borderRadius: RADIUS.md,
    padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#78716c',
    alignItems: 'center',
  },
  queueBannerText: { color: '#a8a29e', fontSize: 13 },
  syncStatus:      { color: C.success, fontSize: 12, textAlign: 'center', marginBottom: 12 },

  // Section
  sectionTitle: {
    color: C.muted, fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },

  // History
  historyList: {
    backgroundColor: C.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 16,
  },
  historyItem: { borderBottomWidth: 1, borderBottomColor: C.border, padding: 12 },
  historyLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  historyDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: C.niss },
  historyCoords:{ color: C.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  historyTime:  { color: C.muted, fontSize: 11 },

  // Empty state
  emptyIcon:  { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: C.text, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyDesc:  { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },

  // Action buttons
  actionBtn:     { borderRadius: RADIUS.md, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  securityNote: { color: C.faint, fontSize: 11, textAlign: 'center', marginTop: 8 },
})

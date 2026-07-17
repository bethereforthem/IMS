import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, Easing, ScrollView,
} from 'react-native'
import { useAuth, isVillageLeader } from '@/hooks/useAuth'
import { sosApi } from '@/lib/api'
import { getCurrentCoords, Coords, coordsLabel } from '@/lib/location'
import { C, RADIUS } from '@/lib/theme'

// How long the user must hold the button before the confirmation dialog appears
const HOLD_DURATION_MS = 2000

type Phase = 'idle' | 'holding' | 'confirming' | 'sending' | 'sent'

export default function SOSScreen() {
  const { user } = useAuth()
  const vl = isVillageLeader(user?.role)

  const [coords, setCoords] = useState<Coords | null>(null)
  const [phase, setPhase]   = useState<Phase>('idle')
  const [error, setError]   = useState('')

  // Tracks whether the hold animation ran to completion.
  // A ref (not state) so cancelHold can read it synchronously without stale closure.
  const holdDone = useRef(false)

  // Progress 0→1 while the button is held
  const holdProgress = useRef(new Animated.Value(0)).current
  const holdAnim     = useRef<Animated.CompositeAnimation | null>(null)

  // Idle pulse for the button
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    getCurrentCoords().then(setCoords)
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start()
  }, [pulse])

  // ── Hold-to-confirm logic ──────────────────────────────────────────────────

  function startHold() {
    if (phase !== 'idle') return
    holdDone.current = false
    setPhase('holding')
    holdProgress.setValue(0)
    holdAnim.current = Animated.timing(holdProgress, {
      toValue:         1,
      duration:        HOLD_DURATION_MS,
      useNativeDriver: false,
      easing:          Easing.linear,
    })
    holdAnim.current.start(({ finished }) => {
      if (finished) {
        holdDone.current = true   // mark BEFORE state update to win the race
        setPhase('confirming')
      }
    })
  }

  function cancelHold() {
    // If the animation already completed, the phase is now (or shortly will be)
    // 'confirming'. Do not reset it — the user needs to see the confirmation.
    if (holdDone.current) return
    holdAnim.current?.stop()
    holdProgress.setValue(0)
    setPhase('idle')
  }

  // ── Send SOS ──────────────────────────────────────────────────────────────

  const handleSOS = useCallback(async () => {
    setError('')
    setPhase('sending')
    try {
      await sosApi.send(
        coords?.lat ?? null,
        coords?.lng ?? null,
        undefined,
        undefined,
      )
      setPhase('sent')
    } catch (e: unknown) {
      // Server returns { error: '...' }; fall back to a generic message
      const axiosData = (e as { response?: { data?: { error?: string; message?: string } } })?.response?.data
      const msg = axiosData?.error ?? axiosData?.message ?? 'SOS failed to send. Check connection and try again.'
      setError(msg)
      setPhase('confirming')
    }
  }, [coords])

  // ── Progress bar width ────────────────────────────────────────────────────

  const progressWidth = holdProgress.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
  })

  // ── Sent screen ───────────────────────────────────────────────────────────

  if (phase === 'sent') {
    return (
      <View style={s.sentWrap}>
        <Text style={s.sentIcon}>📡</Text>
        <Text style={s.sentTitle}>SOS SENT</Text>
        <Text style={s.sentDesc}>
          {vl
            ? 'Village security emergency alert dispatched to RNP Command.'
            : 'Emergency alert dispatched. All institutions have been notified.'}
        </Text>
        {coords && <Text style={s.sentCoords}>📍 {coordsLabel(coords)}</Text>}
        <Text style={s.sentInstructions}>
          Stay in a safe position. Backup is being dispatched.
        </Text>
      </View>
    )
  }

  // ── Confirmation / Sending overlay ────────────────────────────────────────

  if (phase === 'confirming' || phase === 'sending') {
    return (
      <View style={s.confirmWrap}>
        <View style={s.confirmCard}>
          <Text style={s.confirmTitle}>🚨 CONFIRM EMERGENCY SOS</Text>

          <View style={s.confirmIdentity}>
            <Text style={s.confirmName}>{user?.full_name}</Text>
            <Text style={s.confirmBadge}>{user?.badge_number} · {user?.institution}</Text>
            <Text style={s.confirmGps}>
              {coords ? `📍 ${coordsLabel(coords)}` : '📍 Acquiring GPS…'}
            </Text>
          </View>

          <Text style={s.confirmWarning}>
            {vl
              ? 'This will dispatch a CRITICAL alert to RNP Command with your GPS location.'
              : 'This will alert ALL command centers. Only use when your life is in danger.'}
          </Text>

          {!!error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>⚠️ {error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.confirmBtn, phase === 'sending' && s.disabledBtn]}
            onPress={handleSOS}
            disabled={phase === 'sending'}
            activeOpacity={0.85}
          >
            {phase === 'sending'
              ? <ActivityIndicator color="#fff" size="large" />
              : <Text style={s.confirmBtnText}>{error ? 'RETRY SOS' : 'SEND SOS NOW'}</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={s.cancelConfirmBtn}
            onPress={() => { setPhase('idle'); setError(''); holdDone.current = false }}
            disabled={phase === 'sending'}
          >
            <Text style={s.cancelConfirmText}>Cancel — I am safe</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Main screen ───────────────────────────────────────────────────────────

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <Text style={s.title}>Emergency SOS</Text>
      <Text style={s.sub}>
        {vl
          ? 'Send an emergency alert to RNP Command for immediate security intervention.'
          : 'Send a distress signal to all command centers.'}
      </Text>

      {/* GPS status */}
      <View style={s.gpsRow}>
        <View style={[s.gpsDot, { backgroundColor: coords ? C.success : C.warning }]} />
        <Text style={s.gpsText}>
          {coords ? `Location ready: ${coordsLabel(coords)}` : 'Acquiring GPS location…'}
        </Text>
      </View>

      {/* Warning */}
      <View style={s.warnBox}>
        <Text style={s.warnTitle}>⚠️ Emergency Use Only</Text>
        <Text style={s.warnText}>
          {vl
            ? 'This will broadcast a CRITICAL alert to RNP Command with your GPS location. Use only for genuine security emergencies.'
            : 'This will broadcast a CRITICAL alert to all command centers with your identity and GPS location. Use only when your life is in danger.'}
        </Text>
      </View>

      {/* Hold-to-activate button */}
      <View style={s.btnWrap}>
        <Animated.View style={{ transform: [{ scale: phase === 'idle' ? pulse : 1 }] }}>
          <TouchableOpacity
            style={[s.sosBtn, phase === 'holding' && s.sosBtnHolding]}
            onPressIn={startHold}
            onPressOut={cancelHold}
            activeOpacity={1}
          >
            <Text style={s.sosBtnIcon}>🚨</Text>
            <Text style={s.sosBtnText}>
              {phase === 'holding' ? 'HOLD…' : 'HOLD TO SOS'}
            </Text>
            <Text style={s.sosBtnSub}>
              {phase === 'holding' ? 'Release to cancel' : 'Hold 2 seconds to activate'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Progress bar */}
        <View style={s.progressTrack}>
          <Animated.View style={[s.progressFill, { width: progressWidth }]} />
        </View>
        <Text style={s.holdHint}>
          {phase === 'holding'
            ? 'Keep holding…'
            : 'Hold the button for 2 seconds to confirm SOS'}
        </Text>
      </View>

      {/* Identity confirmation */}
      <View style={s.identityBox}>
        <Text style={s.identityLabel}>Alert will include:</Text>
        <Text style={s.identityItem}>• Name: {user?.full_name}</Text>
        <Text style={s.identityItem}>• Badge: {user?.badge_number}</Text>
        <Text style={s.identityItem}>• Institution: {user?.institution}</Text>
        <Text style={s.identityItem}>• GPS: {coords ? coordsLabel(coords) : 'Acquiring…'}</Text>
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 60 },

  // ── Sent state ─────────────────────────────────────────────────────────────
  sentWrap: {
    flex: 1, backgroundColor: C.bg,
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  sentIcon:         { fontSize: 64, marginBottom: 16 },
  sentTitle:        { color: C.danger, fontSize: 32, fontWeight: '800', marginBottom: 8 },
  sentDesc:         { color: C.text, fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 12 },
  sentCoords:       { color: C.muted, fontSize: 12, marginBottom: 12 },
  sentInstructions: { color: C.warning, fontSize: 14, textAlign: 'center', fontWeight: '600' },

  // ── Confirm overlay ─────────────────────────────────────────────────────────
  confirmWrap: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center', padding: 20,
  },
  confirmCard: {
    backgroundColor: '#0f0a0a', borderRadius: RADIUS.lg,
    borderWidth: 2, borderColor: '#ef4444',
    padding: 24,
    shadowColor: '#ef4444', shadowOpacity: 0.5, shadowRadius: 24, elevation: 16,
    gap: 14,
  },
  confirmTitle: {
    color: '#ef4444', fontSize: 20, fontWeight: '900',
    textAlign: 'center', letterSpacing: 1,
  },
  confirmIdentity: {
    backgroundColor: '#1a0a0a', borderRadius: RADIUS.md,
    padding: 12, alignItems: 'center', gap: 2,
  },
  confirmName:    { color: '#fff', fontSize: 16, fontWeight: '700' },
  confirmBadge:   { color: '#fca5a5', fontSize: 12 },
  confirmGps:     { color: '#94a3b8', fontSize: 11, marginTop: 4 },
  confirmWarning: { color: '#fbbf24', fontSize: 13, lineHeight: 20, textAlign: 'center' },

  errorBox: {
    backgroundColor: '#450a0a', borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: '#7f1d1d',
    padding: 12,
  },
  errorText: { color: '#fca5a5', fontSize: 13, textAlign: 'center' },

  confirmBtn: {
    backgroundColor: '#dc2626', borderRadius: RADIUS.md,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: '#ef4444', shadowOpacity: 0.6, shadowRadius: 8, elevation: 8,
  },
  disabledBtn:      { opacity: 0.6 },
  confirmBtnText:   { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  cancelConfirmBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelConfirmText:{ color: '#64748b', fontSize: 14, fontWeight: '600' },

  // ── Main screen ─────────────────────────────────────────────────────────────
  title: { color: C.text, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  sub:   { color: C.muted, fontSize: 13, marginBottom: 20 },

  gpsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
    backgroundColor: C.surface, borderRadius: RADIUS.md,
    padding: 12, borderWidth: 1, borderColor: C.border,
  },
  gpsDot:  { width: 8, height: 8, borderRadius: 4 },
  gpsText: { color: C.muted, fontSize: 12, flex: 1 },

  warnBox: {
    backgroundColor: '#451a03', borderRadius: RADIUS.md,
    padding: 16, marginBottom: 32,
    borderWidth: 1, borderColor: '#92400e',
  },
  warnTitle: { color: C.warning, fontSize: 14, fontWeight: '700', marginBottom: 6 },
  warnText:  { color: '#fbbf24', fontSize: 13, lineHeight: 20 },

  btnWrap: { alignItems: 'center', marginBottom: 32, gap: 14 },
  sosBtn: {
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: C.sos,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: C.sos, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 24, elevation: 16,
  },
  sosBtnHolding: {
    backgroundColor: '#dc2626',
    shadowOpacity: 1,
    shadowRadius: 40,
    elevation: 24,
  },
  sosBtnIcon: { fontSize: 36, marginBottom: 4 },
  sosBtnText: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  sosBtnSub:  { color: '#fca5a5', fontSize: 11, fontWeight: '600', marginTop: 2 },

  progressTrack: {
    width: 220, height: 6,
    backgroundColor: '#450a0a',
    borderRadius: 3, overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ef4444',
    borderRadius: 3,
  },
  holdHint: { color: C.muted, fontSize: 11, textAlign: 'center', maxWidth: 240 },

  // ── Identity box ────────────────────────────────────────────────────────────
  identityBox: {
    backgroundColor: C.surface, borderRadius: RADIUS.md,
    padding: 16, borderWidth: 1, borderColor: C.border,
  },
  identityLabel: {
    color: C.muted, fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5,
  },
  identityItem: { color: C.textMid, fontSize: 13, lineHeight: 22 },
})

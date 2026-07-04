import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, Easing, ScrollView,
} from 'react-native'
import { useAuth, isVillageLeader } from '@/hooks/useAuth'
import { sosApi } from '@/lib/api'
import { getCurrentCoords, Coords, coordsLabel } from '@/lib/location'
import { C, RADIUS, INSTITUTION_COLOR } from '@/lib/theme'

export default function SOSScreen() {
  const { user } = useAuth()
  const vl = isVillageLeader(user?.role)
  const accent = user ? (INSTITUTION_COLOR[user.institution] ?? C.rnp) : C.rnp

  const [coords, setCoords]     = useState<Coords | null>(null)
  const [notes, setNotes]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [sent, setSent]         = useState(false)
  const [error, setError]       = useState('')

  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    getCurrentCoords().then(setCoords)
    // Pulse animation on SOS button
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start()
  }, [])

  async function handleSOS() {
    setError('')
    setLoading(true)
    try {
      await sosApi.send(coords?.lat, coords?.lng, undefined, notes.trim() || undefined)
      setSent(true)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'SOS failed to send. Try again immediately.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
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

      {/* Warning box */}
      <View style={s.warnBox}>
        <Text style={s.warnTitle}>⚠️ Emergency Use Only</Text>
        <Text style={s.warnText}>
          {vl
            ? 'This will broadcast a CRITICAL alert to RNP Command with your GPS location. Use only for genuine security emergencies.'
            : 'This will broadcast a CRITICAL alert to all command centers with your identity and GPS location. Use only when your life is in danger.'}
        </Text>
      </View>

      {/* Big SOS Button */}
      <View style={s.btnWrap}>
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <TouchableOpacity
            style={s.sosBtn}
            onPress={handleSOS}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="large" />
              : (
                <>
                  <Text style={s.sosBtnIcon}>🚨</Text>
                  <Text style={s.sosBtnText}>SEND SOS</Text>
                  <Text style={s.sosBtnSub}>
                    {vl ? 'Village Emergency' : 'Agent in Danger'}
                  </Text>
                </>
              )
            }
          </TouchableOpacity>
        </Animated.View>
      </View>

      {!!error && (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={handleSOS} disabled={loading}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

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
  content: { padding: 20, paddingBottom: 60, alignItems: 'stretch' },

  sentWrap: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', padding: 32 },
  sentIcon: { fontSize: 64, marginBottom: 16 },
  sentTitle:{ color: C.danger, fontSize: 32, fontWeight: '800', marginBottom: 8 },
  sentDesc: { color: C.text, fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 12 },
  sentCoords: { color: C.muted, fontSize: 12, marginBottom: 12 },
  sentInstructions: { color: C.warning, fontSize: 14, textAlign: 'center', fontWeight: '600' },

  title: { color: C.text, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  sub:   { color: C.muted, fontSize: 13, marginBottom: 20 },

  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
    backgroundColor: C.surface, borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: C.border },
  gpsDot: { width: 8, height: 8, borderRadius: 4 },
  gpsText:{ color: C.muted, fontSize: 12 },

  warnBox: {
    backgroundColor: '#451a03', borderRadius: RADIUS.md,
    padding: 16, marginBottom: 32,
    borderWidth: 1, borderColor: '#92400e',
  },
  warnTitle: { color: C.warning, fontSize: 14, fontWeight: '700', marginBottom: 6 },
  warnText:  { color: '#fbbf24', fontSize: 13, lineHeight: 20 },

  btnWrap: { alignItems: 'center', marginBottom: 32 },
  sosBtn:  {
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: C.sos,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: C.sos, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 24, elevation: 16,
  },
  sosBtnIcon: { fontSize: 36, marginBottom: 4 },
  sosBtnText: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: 1 },
  sosBtnSub:  { color: '#fca5a5', fontSize: 12, fontWeight: '600', marginTop: 2 },

  errorBox: {
    backgroundColor: '#7f1d1d', borderRadius: RADIUS.md, padding: 16, marginBottom: 16,
    alignItems: 'center',
  },
  errorText: { color: '#fca5a5', fontSize: 14, marginBottom: 12, textAlign: 'center' },
  retryBtn:  { backgroundColor: C.danger, borderRadius: RADIUS.md, paddingHorizontal: 24, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700' },

  identityBox: {
    backgroundColor: C.surface, borderRadius: RADIUS.md,
    padding: 16, borderWidth: 1, borderColor: C.border,
  },
  identityLabel: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 },
  identityItem:  { color: C.textMid, fontSize: 13, lineHeight: 22 },
})

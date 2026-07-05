/**
 * NISS Field Incident Report Screen
 *
 * Officers submit a structured incident report that:
 *  1. Captures title, category, description, priority, date/time, notes, GPS
 *  2. Optionally attaches images / videos
 *  3. Submits directly to the centralized DB (creates alert + intel event)
 *  4. Auto-starts live GPS tracking session
 *  5. Falls back to offline queue when network is unavailable
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Image,
  Platform, Modal, Pressable,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as Crypto from 'expo-crypto'
import { useRouter } from 'expo-router'
import { useAuth } from '@/hooks/useAuth'
import { fieldReportApi } from '@/lib/api'
import { getCurrentCoords, Coords, coordsLabel } from '@/lib/location'
import { startTracking } from '@/lib/tracking'
import { enqueue, saveTrackingSession, getTrackingSession } from '@/lib/offlineStore'
import { C, RADIUS, INSTITUTION_COLOR } from '@/lib/theme'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Terrorism / Extremism',
  'Armed Robbery',
  'Assassination Threat',
  'Smuggling / Trafficking',
  'Cybercrime / Espionage',
  'Border Violation',
  'Suspicious Activity',
  'Illegal Weapons',
  'Drug Operation',
  'Organized Crime',
  'Political Threat',
  'Other',
]

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
type Priority = typeof PRIORITIES[number]

const PRIORITY_COLOR: Record<Priority, string> = {
  LOW:      '#22c55e',
  MEDIUM:   '#3b82f6',
  HIGH:     '#f59e0b',
  CRITICAL: '#ef4444',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function IncidentScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const accent = user ? (INSTITUTION_COLOR[user.institution] ?? C.niss) : C.niss

  // Form state
  const [title, setTitle]           = useState('')
  const [category, setCategory]     = useState(CATEGORIES[6])
  const [description, setDesc]      = useState('')
  const [priority, setPriority]     = useState<Priority>('HIGH')
  const [incidentDate, setIncDate]  = useState(new Date().toISOString().slice(0, 16))
  const [notes, setNotes]           = useState('')
  const [locDesc, setLocDesc]       = useState('')
  const [mediaUris, setMediaUris]   = useState<string[]>([])

  // GPS
  const [coords, setCoords]         = useState<Coords | null>(null)
  const [gpsLoading, setGpsLoading] = useState(true)

  // UI state
  const [loading, setLoading]         = useState(false)
  const [submitted, setSubmitted]     = useState(false)
  const [error, setError]             = useState('')
  const [offline, setOffline]         = useState(false)
  const [showCatPicker, setCatPicker] = useState(false)
  const [trackingStarted, setTracking]= useState(false)
  const [existingSession, setExistingSession] = useState<{ session_id: string; report_title: string } | null>(null)

  const submittedDataRef = useRef<{ session_id: string | null; report_id: string | null; alert_id: string | null }>({
    session_id: null, report_id: null, alert_id: null,
  })

  // Load GPS & check for existing tracking session
  useEffect(() => {
    getCurrentCoords().then(c => { setCoords(c); setGpsLoading(false) })
    getTrackingSession().then(s => {
      if (s) setExistingSession(s)
    })
  }, [])

  // ── Media picker ──────────────────────────────────────────────────────────

  const pickMedia = useCallback(async (type: 'image' | 'video') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow media access to attach files.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === 'image'
        ? ImagePicker.MediaTypeOptions.Images
        : ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
      allowsMultipleSelection: false,
    })
    if (!result.canceled && result.assets.length > 0) {
      setMediaUris(prev => [...prev, result.assets[0].uri])
    }
  }, [])

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow camera access to capture photos.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 })
    if (!result.canceled && result.assets.length > 0) {
      setMediaUris(prev => [...prev, result.assets[0].uri])
    }
  }, [])

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setError('')

    if (!title.trim())       { setError('Report title is required.'); return }
    if (!description.trim()) { setError('Description is required.'); return }

    setLoading(true)

    const offlineId = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${user?.user_id}-${title}-${Date.now()}`
    ).then(h => h.slice(0, 32))

    const payload = {
      offline_id:           offlineId,
      title:                title.trim(),
      category,
      description:          description.trim(),
      priority,
      incident_date:        new Date(incidentDate).toISOString(),
      notes:                notes.trim() || undefined,
      location_lat:         coords?.lat ?? null,
      location_lng:         coords?.lng ?? null,
      location_description: locDesc.trim() || undefined,
      media_urls:           mediaUris,
    }

    try {
      const res = await fieldReportApi.submit(payload)
      const { id, alert_id, tracking_session_id } = res.data

      submittedDataRef.current = { session_id: tracking_session_id, report_id: id, alert_id }

      // Auto-start GPS tracking
      if (tracking_session_id) {
        const started = await startTracking(tracking_session_id)
        setTracking(started)
        if (started) {
          await saveTrackingSession({
            session_id: tracking_session_id,
            field_report_id: id,
            report_title: title.trim(),
            started_at: new Date().toISOString(),
          })
        }
      }

      setOffline(false)
      setSubmitted(true)
    } catch {
      // Network failure → queue locally
      try {
        await enqueue({ ...payload, queued_at: new Date().toISOString() })
        setOffline(true)
        setSubmitted(true)
      } catch {
        setError('Submission failed and could not be saved offline. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }, [title, description, category, priority, incidentDate, notes, locDesc, coords, mediaUris, user])

  // ── Reset ──────────────────────────────────────────────────────────────────

  function reset() {
    setTitle(''); setDesc(''); setPriority('HIGH')
    setNotes(''); setLocDesc(''); setMediaUris([])
    setIncDate(new Date().toISOString().slice(0, 16))
    setCategory(CATEGORIES[6])
    setSubmitted(false); setOffline(false); setError('')
    submittedDataRef.current = { session_id: null, report_id: null, alert_id: null }
    setTracking(false)
    getCurrentCoords().then(setCoords)
  }

  // ── Success view ───────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <View style={s.successWrap}>
        <Text style={s.successIcon}>{offline ? '📦' : '📡'}</Text>
        <Text style={[s.successTitle, offline && { color: C.warning }]}>
          {offline ? 'Saved Offline' : 'Report Transmitted'}
        </Text>
        <Text style={s.successDesc}>
          {offline
            ? 'Network unavailable — report saved locally and will sync automatically when connectivity returns.'
            : 'Incident report sent to command. A real-time alert has been raised on the commander\'s map.'}
        </Text>

        {!offline && trackingStarted && (
          <View style={s.trackingBadge}>
            <View style={s.trackingDot} />
            <Text style={s.trackingBadgeText}>Live GPS Tracking — ACTIVE</Text>
          </View>
        )}

        {coords && (
          <Text style={s.successCoords}>📍 {coordsLabel(coords)}</Text>
        )}

        <View style={s.successActions}>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: accent, flex: 1 }]}
            onPress={reset}
          >
            <Text style={s.btnText}>New Report</Text>
          </TouchableOpacity>
          {submittedDataRef.current.session_id && (
            <TouchableOpacity
              style={[s.btn, { backgroundColor: C.surface, borderWidth: 1, borderColor: accent, flex: 1 }]}
              onPress={() => router.push('/(app)/tracking')}
            >
              <Text style={[s.btnText, { color: accent }]}>View Tracking</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  // ── Category picker modal ──────────────────────────────────────────────────

  const CategoryModal = () => (
    <Modal visible={showCatPicker} transparent animationType="slide">
      <Pressable style={s.modalOverlay} onPress={() => setCatPicker(false)}>
        <View style={s.modalSheet}>
          <Text style={s.modalTitle}>Select Category</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[s.modalOption, category === cat && { backgroundColor: accent + '22' }]}
                onPress={() => { setCategory(cat); setCatPicker(false) }}
              >
                <Text style={[s.modalOptionText, category === cat && { color: accent }]}>
                  {cat}
                </Text>
                {category === cat && <Text style={{ color: accent }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  )

  // ── Main form ──────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <CategoryModal />
      <ScrollView
        style={s.root}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={s.header}>
          <View style={[s.headerBadge, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
            <Text style={[s.headerBadgeText, { color: accent }]}>CLASSIFIED REPORT</Text>
          </View>
        </View>

        <Text style={s.title}>Field Incident Report</Text>
        <Text style={s.sub}>
          {user?.full_name} · {user?.badge_number} · {user?.institution}
        </Text>

        {/* Existing tracking session warning */}
        {existingSession && (
          <TouchableOpacity
            style={s.trackingWarnBox}
            onPress={() => router.push('/(app)/tracking')}
          >
            <View style={s.trackingDot} />
            <View style={{ flex: 1 }}>
              <Text style={s.trackingWarnTitle}>Tracking Active</Text>
              <Text style={s.trackingWarnSub} numberOfLines={1}>
                {existingSession.report_title}
              </Text>
            </View>
            <Text style={{ color: accent, fontSize: 12 }}>View →</Text>
          </TouchableOpacity>
        )}

        {/* GPS status */}
        <View style={s.gpsRow}>
          {gpsLoading
            ? <ActivityIndicator size="small" color={C.warning} />
            : <View style={[s.gpsDot, { backgroundColor: coords ? C.success : C.danger }]} />
          }
          <Text style={s.gpsText}>
            {gpsLoading
              ? 'Acquiring GPS…'
              : coords
                ? `GPS locked: ${coordsLabel(coords)}`
                : 'GPS unavailable — report will be submitted without coordinates'}
          </Text>
        </View>

        {/* ─ Incident Title ─ */}
        <Text style={s.label}>Incident Title *</Text>
        <TextInput
          style={s.input}
          placeholder="Brief, clear title"
          placeholderTextColor={C.muted}
          value={title}
          onChangeText={setTitle}
          maxLength={120}
        />

        {/* ─ Category ─ */}
        <Text style={s.label}>Category *</Text>
        <TouchableOpacity style={[s.input, s.selectRow]} onPress={() => setCatPicker(true)}>
          <Text style={[s.selectText, { color: C.text }]}>{category}</Text>
          <Text style={{ color: C.muted }}>▼</Text>
        </TouchableOpacity>

        {/* ─ Priority ─ */}
        <Text style={s.label}>Priority *</Text>
        <View style={s.priorityRow}>
          {PRIORITIES.map(p => (
            <TouchableOpacity
              key={p}
              style={[
                s.prioChip,
                priority === p && { backgroundColor: PRIORITY_COLOR[p], borderColor: PRIORITY_COLOR[p] },
              ]}
              onPress={() => setPriority(p)}
            >
              <Text style={[s.prioText, priority === p && { color: '#fff' }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─ Date/Time ─ */}
        <Text style={s.label}>Incident Date / Time *</Text>
        <TextInput
          style={s.input}
          value={incidentDate}
          onChangeText={setIncDate}
          placeholder="YYYY-MM-DDTHH:MM"
          placeholderTextColor={C.muted}
          keyboardType={Platform.OS === 'ios' ? 'default' : 'default'}
        />

        {/* ─ Description ─ */}
        <Text style={s.label}>Description *</Text>
        <TextInput
          style={[s.input, s.textarea]}
          placeholder="Detailed account of the incident — who, what, where, when, how…"
          placeholderTextColor={C.muted}
          value={description}
          onChangeText={setDesc}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />

        {/* ─ Location description ─ */}
        <Text style={s.label}>Location Description</Text>
        <TextInput
          style={s.input}
          placeholder="Sector, cell, landmark…"
          placeholderTextColor={C.muted}
          value={locDesc}
          onChangeText={setLocDesc}
        />

        {/* ─ Notes ─ */}
        <Text style={s.label}>Additional Notes</Text>
        <TextInput
          style={[s.input, s.textarea, { height: 80 }]}
          placeholder="Operational context, sources, follow-up actions needed…"
          placeholderTextColor={C.muted}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* ─ Media ─ */}
        <Text style={s.label}>Attachments (optional)</Text>
        <View style={s.mediaRow}>
          <TouchableOpacity style={s.mediaBtn} onPress={takePhoto}>
            <Text style={s.mediaBtnIcon}>📷</Text>
            <Text style={s.mediaBtnText}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.mediaBtn} onPress={() => pickMedia('image')}>
            <Text style={s.mediaBtnIcon}>🖼️</Text>
            <Text style={s.mediaBtnText}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.mediaBtn} onPress={() => pickMedia('video')}>
            <Text style={s.mediaBtnIcon}>🎥</Text>
            <Text style={s.mediaBtnText}>Video</Text>
          </TouchableOpacity>
        </View>

        {mediaUris.length > 0 && (
          <ScrollView horizontal style={s.mediaPreviewScroll} showsHorizontalScrollIndicator={false}>
            {mediaUris.map((uri, idx) => (
              <View key={idx} style={s.mediaThumbWrap}>
                <Image source={{ uri }} style={s.mediaThumb} />
                <TouchableOpacity
                  style={s.mediaRemoveBtn}
                  onPress={() => setMediaUris(prev => prev.filter((_, i) => i !== idx))}
                >
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* ─ Tracking notice ─ */}
        <View style={s.trackingNotice}>
          <Text style={s.trackingNoticeIcon}>📡</Text>
          <Text style={s.trackingNoticeText}>
            Submitting this report will automatically activate live GPS tracking.
            Tracking continues until the investigation is officially closed.
          </Text>
        </View>

        {/* ─ Error ─ */}
        {!!error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {/* ─ Submit ─ */}
        <TouchableOpacity
          style={[s.btn, { backgroundColor: accent }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Transmit Incident Report</Text>
          }
        </TouchableOpacity>

        <Text style={s.securityNote}>
          🔒 End-to-end encrypted · Classification: SECRET
        </Text>
      </ScrollView>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 50 },

  header:          { flexDirection: 'row', marginBottom: 12 },
  headerBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1 },
  headerBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  title: { color: C.text, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  sub:   { color: C.muted, fontSize: 12, marginBottom: 20 },

  // GPS row
  gpsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20,
    backgroundColor: C.surface, borderRadius: RADIUS.md,
    padding: 12, borderWidth: 1, borderColor: C.border,
  },
  gpsDot: { width: 8, height: 8, borderRadius: 4 },
  gpsText:{ color: C.muted, fontSize: 12, flex: 1 },

  // Existing tracking warning
  trackingWarnBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16,
    backgroundColor: '#1e1b4b', borderRadius: RADIUS.md, padding: 12,
    borderWidth: 1, borderColor: '#4338ca',
  },
  trackingDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: '#818cf8' },
  trackingWarnTitle: { color: '#a5b4fc', fontSize: 12, fontWeight: '700' },
  trackingWarnSub:   { color: '#6366f1', fontSize: 11 },

  // Form fields
  label: {
    color: C.muted, fontSize: 11, fontWeight: '600',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.md, padding: 14, color: C.text,
    fontSize: 14, marginBottom: 16,
  },
  textarea: { height: 130, textAlignVertical: 'top' },

  selectRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectText: { fontSize: 14 },

  // Priority chips
  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  prioChip:    {
    flex: 1, alignItems: 'center', paddingVertical: 9,
    borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.surface,
  },
  prioText: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  // Media
  mediaRow:         { flexDirection: 'row', gap: 8, marginBottom: 12 },
  mediaBtn:         {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    backgroundColor: C.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: C.border,
  },
  mediaBtnIcon:     { fontSize: 22, marginBottom: 4 },
  mediaBtnText:     { color: C.muted, fontSize: 11, fontWeight: '600' },
  mediaPreviewScroll:{ marginBottom: 16 },
  mediaThumbWrap:   { position: 'relative', marginRight: 10 },
  mediaThumb:       { width: 72, height: 72, borderRadius: RADIUS.sm },
  mediaRemoveBtn:   {
    position: 'absolute', top: -6, right: -6,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center',
  },

  // Tracking notice
  trackingNotice: {
    flexDirection: 'row', gap: 10, padding: 14,
    backgroundColor: '#1c1917', borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: '#44403c', marginBottom: 16,
  },
  trackingNoticeIcon: { fontSize: 16 },
  trackingNoticeText: { color: '#a8a29e', fontSize: 12, lineHeight: 18, flex: 1 },

  // Error
  errorBox:  { backgroundColor: '#7f1d1d', borderRadius: RADIUS.sm, padding: 12, marginBottom: 12 },
  errorText: { color: '#fca5a5', fontSize: 13 },

  // Buttons
  btn:     { borderRadius: RADIUS.md, padding: 15, alignItems: 'center', marginBottom: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  securityNote: { color: C.faint, fontSize: 11, textAlign: 'center', marginTop: 4 },

  // Category modal
  modalOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.surface, borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl, padding: 20,
  },
  modalTitle:      { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 16 },
  modalOption:     {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalOptionText: { color: C.textMid, fontSize: 14 },

  // Success
  successWrap:    { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', padding: 32 },
  successIcon:    { fontSize: 60, marginBottom: 16 },
  successTitle:   { color: C.text, fontSize: 24, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  successDesc:    { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  successCoords:  { color: C.muted, fontSize: 12, marginBottom: 24 },
  successActions: { flexDirection: 'row', gap: 10, width: '100%' },

  trackingBadge:     {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1e1b4b', borderRadius: RADIUS.full,
    paddingHorizontal: 16, paddingVertical: 8, marginBottom: 16,
  },
  trackingBadgeText: { color: '#a5b4fc', fontSize: 12, fontWeight: '700' },
})

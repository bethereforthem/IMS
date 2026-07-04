import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native'
import { useAuth, isVillageLeader } from '@/hooks/useAuth'
import { intelApi, patrolApi } from '@/lib/api'
import { getCurrentCoords, Coords, coordsLabel } from '@/lib/location'
import { C, RADIUS, INSTITUTION_COLOR } from '@/lib/theme'

const INSECURITY_TYPES = [
  'Theft / Robbery',
  'Assault / Violence',
  'Suspicious Movement',
  'Drug Activity',
  'Illegal Weapons',
  'Gang Activity',
  'Property Crime',
  'Other Security Threat',
]

const INTEL_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

export default function ReportScreen() {
  const { user } = useAuth()
  const vl = isVillageLeader(user?.role)
  const accent = user ? (INSTITUTION_COLOR[user.institution] ?? C.rnp) : C.rnp

  const [coords, setCoords]     = useState<Coords | null>(null)
  const [loading, setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError]       = useState('')

  // Village leader fields
  const [personName, setPersonName]     = useState('')
  const [insecType, setInsecType]       = useState(INSECURITY_TYPES[0])
  const [locDesc, setLocDesc]           = useState('')
  const [description, setDescription]  = useState('')

  // Officer fields
  const [title, setTitle]       = useState('')
  const [priority, setPriority] = useState('MEDIUM')

  useEffect(() => {
    getCurrentCoords().then(setCoords)
  }, [])

  async function handleSubmit() {
    setError('')
    if (!description.trim()) { setError('Description is required.'); return }
    if (!vl && !title.trim()) { setError('Title is required.'); return }
    setLoading(true)
    try {
      if (vl) {
        await patrolApi.submitReport({
          person_name: personName.trim() || undefined,
          description: description.trim(),
          insecurity_type: insecType,
          location_lat: coords?.lat,
          location_lng: coords?.lng,
          location_description: locDesc.trim() || undefined,
        })
      } else {
        await intelApi.submitReport({
          title: title.trim(),
          priority,
          description: description.trim(),
          location_lat: coords?.lat,
          location_lng: coords?.lng,
          location_description: locDesc.trim() || undefined,
        })
      }
      setSubmitted(true)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Submission failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setPersonName(''); setInsecType(INSECURITY_TYPES[0]); setLocDesc('')
    setDescription(''); setTitle(''); setPriority('MEDIUM'); setSubmitted(false); setError('')
  }

  if (submitted) {
    return (
      <View style={s.successWrap}>
        <Text style={s.successIcon}>{vl ? '✅' : '📡'}</Text>
        <Text style={s.successTitle}>{vl ? 'Report Submitted' : 'Intel Report Sent'}</Text>
        <Text style={s.successDesc}>
          {vl
            ? 'Your community report has been received by RNP Command.'
            : 'Your intelligence report has been logged and shared with command.'}
        </Text>
        {coords && (
          <Text style={s.successCoords}>📍 {coordsLabel(coords)}</Text>
        )}
        <TouchableOpacity style={[s.btn, { backgroundColor: accent }]} onPress={reset}>
          <Text style={s.btnText}>Submit Another</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>{vl ? 'Community Report' : 'Intelligence Report'}</Text>
      <Text style={s.sub}>
        {vl
          ? 'Report persons causing insecurity in your community.'
          : 'Submit field intelligence for command review.'}
      </Text>

      {/* GPS */}
      <View style={s.gpsRow}>
        <View style={[s.gpsDot, { backgroundColor: coords ? C.success : C.warning }]} />
        <Text style={s.gpsText}>
          {coords ? `GPS attached: ${coordsLabel(coords)}` : 'Acquiring GPS…'}
        </Text>
      </View>

      {/* Village Leader form */}
      {vl && (
        <>
          <Text style={s.label}>Person Name (optional)</Text>
          <TextInput style={s.input} placeholder="Full name" placeholderTextColor={C.muted}
            value={personName} onChangeText={setPersonName} />

          <Text style={s.label}>Insecurity Type</Text>
          <View style={s.typeGrid}>
            {INSECURITY_TYPES.map(t => (
              <TouchableOpacity
                key={t}
                style={[s.typeChip, insecType === t && { backgroundColor: accent, borderColor: accent }]}
                onPress={() => setInsecType(t)}
              >
                <Text style={[s.typeChipText, insecType === t && { color: '#fff' }]} numberOfLines={1}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Officer form */}
      {!vl && (
        <>
          <Text style={s.label}>Report Title</Text>
          <TextInput style={s.input} placeholder="Brief title" placeholderTextColor={C.muted}
            value={title} onChangeText={setTitle} />

          <Text style={s.label}>Priority</Text>
          <View style={s.priorityRow}>
            {INTEL_PRIORITIES.map(p => {
              const clr = p === 'CRITICAL' ? C.danger : p === 'HIGH' ? C.warning : p === 'MEDIUM' ? accent : C.muted
              return (
                <TouchableOpacity
                  key={p}
                  style={[s.prioChip, priority === p && { backgroundColor: clr, borderColor: clr }]}
                  onPress={() => setPriority(p)}
                >
                  <Text style={[s.prioText, priority === p && { color: '#fff' }]}>{p}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </>
      )}

      <Text style={s.label}>Location Description (optional)</Text>
      <TextInput style={s.input} placeholder="Sector, cell, landmark…" placeholderTextColor={C.muted}
        value={locDesc} onChangeText={setLocDesc} />

      <Text style={s.label}>Description *</Text>
      <TextInput
        style={[s.input, s.textarea]}
        placeholder={vl ? 'Describe the insecurity situation…' : 'Describe your intelligence observation…'}
        placeholderTextColor={C.muted}
        value={description} onChangeText={setDescription}
        multiline numberOfLines={5} textAlignVertical="top"
      />

      {!!error && (
        <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>
      )}

      <TouchableOpacity style={[s.btn, { backgroundColor: accent }]} onPress={handleSubmit} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.btnText}>{vl ? 'Submit Report' : 'Submit Intel'}</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 40 },

  successWrap: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', padding: 32 },
  successIcon: { fontSize: 56, marginBottom: 16 },
  successTitle: { color: C.text, fontSize: 22, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  successDesc: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 12 },
  successCoords: { color: C.muted, fontSize: 12, marginBottom: 32 },

  title: { color: C.text, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  sub:   { color: C.muted, fontSize: 13, marginBottom: 20 },

  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20,
    backgroundColor: C.surface, borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: C.border },
  gpsDot: { width: 8, height: 8, borderRadius: 4 },
  gpsText:{ color: C.muted, fontSize: 12 },

  label: { color: C.muted, fontSize: 11, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.md, padding: 14, color: C.text,
    fontSize: 14, marginBottom: 16,
  },
  textarea: { height: 120, textAlignVertical: 'top' },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface,
  },
  typeChipText: { color: C.muted, fontSize: 12, fontWeight: '600' },

  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  prioChip: {
    flex: 1, alignItems: 'center', paddingVertical: 8,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  prioText: { color: C.muted, fontSize: 11, fontWeight: '700' },

  errorBox:  { backgroundColor: '#7f1d1d', borderRadius: RADIUS.sm, padding: 12, marginBottom: 12 },
  errorText: { color: '#fca5a5', fontSize: 13 },

  btn:    { borderRadius: RADIUS.md, padding: 15, alignItems: 'center' },
  btnText:{ color: '#fff', fontSize: 16, fontWeight: '700' },
})

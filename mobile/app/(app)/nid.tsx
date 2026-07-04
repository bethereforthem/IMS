import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native'
import { useAuth, isVillageLeader } from '@/hooks/useAuth'
import { nidApi } from '@/lib/api'
import { getCurrentCoords, Coords, coordsLabel } from '@/lib/location'
import { C, RADIUS, INSTITUTION_COLOR } from '@/lib/theme'

const THREAT_COLOR = (n: number) => n >= 4 ? C.danger : n >= 3 ? C.warning : C.success

type VillageResult = { found: boolean; classification?: { status: string; threat_level: number; owning_institution: string } }
type OfficerResult = { found: boolean; suspect?: { id: string; full_name: string; ims_reference: string; status: string; threat_level: number; owning_institution: string; nationality: string } }

export default function NIDScreen() {
  const { user } = useAuth()
  const vl = isVillageLeader(user?.role)
  const accent = user ? (INSTITUTION_COLOR[user.institution] ?? C.rnp) : C.rnp

  const [nid, setNid]         = useState('')
  const [coords, setCoords]   = useState<Coords | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<VillageResult | OfficerResult | null>(null)
  const [error, setError]     = useState('')

  useEffect(() => {
    getCurrentCoords().then(setCoords)
  }, [])

  async function handleCheck() {
    const clean = nid.replace(/\s/g, '')
    if (!clean) { setError('Enter a National ID number.'); return }
    setError('')
    setResult(null)
    setLoading(true)
    try {
      if (vl) {
        const res = await nidApi.villageCheck(clean, coords?.lat, coords?.lng)
        setResult(res.data)
      } else {
        const res = await nidApi.officerCheck(clean, coords?.lat, coords?.lng)
        setResult(res.data)
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'NID check failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  function reset() { setNid(''); setResult(null); setError('') }

  const vilRes   = vl ? (result as VillageResult | null) : null
  const offRes   = !vl ? (result as OfficerResult | null) : null

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>NID Check</Text>
      <Text style={s.sub}>
        {vl
          ? 'Check if a person has a criminal record.'
          : 'Search the suspect database by National ID.'}
      </Text>

      {/* GPS status */}
      <View style={s.gpsRow}>
        <View style={[s.gpsDot, { backgroundColor: coords ? C.success : C.warning }]} />
        <Text style={s.gpsText}>
          {coords ? `GPS: ${coordsLabel(coords)}` : 'Acquiring GPS…'}
        </Text>
      </View>

      {/* Input */}
      <Text style={s.label}>National ID Number</Text>
      <TextInput
        style={s.input}
        placeholder="Enter NID"
        placeholderTextColor={C.muted}
        value={nid}
        onChangeText={setNid}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="default"
      />

      {!!error && (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      <TouchableOpacity style={[s.btn, { backgroundColor: accent }]} onPress={handleCheck} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.btnText}>Check NID</Text>
        }
      </TouchableOpacity>

      {/* Results */}
      {result !== null && (
        <View style={s.resultWrap}>
          {/* CLEAN */}
          {!vilRes?.found && !offRes?.found && (
            <View style={[s.resultCard, { borderColor: C.success }]}>
              <Text style={s.resultIcon}>✅</Text>
              <Text style={[s.resultHeadline, { color: C.success }]}>No Record Found</Text>
              <Text style={s.resultDesc}>This person is not in the IMS suspect database.</Text>
              <TouchableOpacity style={s.resetBtn} onPress={reset}>
                <Text style={s.resetText}>Check Another</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* VILLAGE LEADER — criminal found */}
          {vl && vilRes?.found && vilRes.classification && (
            <View style={[s.resultCard, { borderColor: C.danger }]}>
              <Text style={s.resultIcon}>🚨</Text>
              <Text style={[s.resultHeadline, { color: C.danger }]}>Criminal Record Found</Text>
              <View style={s.classGrid}>
                <ClassRow label="Status" value={vilRes.classification.status} />
                <ClassRow
                  label="Threat Level"
                  value={`Level ${vilRes.classification.threat_level}`}
                  valueColor={THREAT_COLOR(vilRes.classification.threat_level)}
                />
                <ClassRow label="Owning Institution" value={vilRes.classification.owning_institution} />
              </View>
              <View style={s.dispatchNote}>
                <Text style={s.dispatchText}>📡 CRITICAL alert dispatched to RNP Command</Text>
              </View>
              <TouchableOpacity style={s.resetBtn} onPress={reset}>
                <Text style={s.resetText}>Check Another</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* OFFICER — suspect found */}
          {!vl && offRes?.found && offRes.suspect && (
            <View style={[s.resultCard, { borderColor: C.danger }]}>
              <Text style={s.resultIcon}>🔴</Text>
              <Text style={[s.resultHeadline, { color: C.danger }]}>Suspect Identified</Text>
              <View style={s.classGrid}>
                <ClassRow label="Name"             value={offRes.suspect.full_name} />
                <ClassRow label="IMS Reference"    value={offRes.suspect.ims_reference} />
                <ClassRow label="Status"           value={offRes.suspect.status} />
                <ClassRow
                  label="Threat Level"
                  value={`Level ${offRes.suspect.threat_level}`}
                  valueColor={THREAT_COLOR(offRes.suspect.threat_level)}
                />
                <ClassRow label="Owning Institution" value={offRes.suspect.owning_institution} />
                <ClassRow label="Nationality"      value={offRes.suspect.nationality ?? '—'} />
              </View>
              <View style={s.dispatchNote}>
                <Text style={s.dispatchText}>📡 Alert dispatched to command</Text>
              </View>
              <TouchableOpacity style={s.resetBtn} onPress={reset}>
                <Text style={s.resetText}>Check Another</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  )
}

function ClassRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={cr.row}>
      <Text style={cr.label}>{label}</Text>
      <Text style={[cr.value, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 40 },

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
    fontSize: 15, marginBottom: 12,
  },

  errorBox:  { backgroundColor: '#7f1d1d', borderRadius: RADIUS.sm, padding: 12, marginBottom: 12 },
  errorText: { color: '#fca5a5', fontSize: 13 },

  btn:    { borderRadius: RADIUS.md, padding: 15, alignItems: 'center', marginBottom: 24 },
  btnText:{ color: '#fff', fontSize: 16, fontWeight: '700' },

  resultWrap: {},
  resultCard: {
    backgroundColor: C.surface, borderRadius: RADIUS.lg,
    padding: 20, borderWidth: 2,
  },
  resultIcon:     { fontSize: 32, textAlign: 'center', marginBottom: 8 },
  resultHeadline: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  resultDesc:     { color: C.muted, textAlign: 'center', marginBottom: 16 },

  classGrid: { gap: 10, marginBottom: 16 },

  dispatchNote: {
    backgroundColor: '#1e3a5f', borderRadius: RADIUS.sm, padding: 12, marginBottom: 16,
  },
  dispatchText: { color: '#93c5fd', fontSize: 12, textAlign: 'center' },

  resetBtn:  { alignItems: 'center', padding: 8 },
  resetText: { color: C.muted, fontSize: 13 },
})

const cr = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: C.border, paddingVertical: 8 },
  label: { color: C.muted, fontSize: 13 },
  value: { color: C.text, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 8 },
})

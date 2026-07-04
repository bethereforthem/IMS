import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, StyleSheet,
} from 'react-native'
import { useAuth } from '@/hooks/useAuth'
import { C, RADIUS } from '@/lib/theme'

export default function LoginScreen() {
  const { login } = useAuth()
  const [badge, setBadge]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleLogin() {
    if (!badge.trim() || !password.trim()) {
      setError('Badge number and password are required.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await login(badge.trim(), password)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })
        ?.response?.data?.message
      setError(msg ?? 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo area */}
        <View style={s.logoWrap}>
          <View style={s.logoBox}>
            <Text style={s.logoText}>IMS</Text>
          </View>
          <Text style={s.appName}>Intelligence Management{'\n'}System</Text>
          <Text style={s.appSub}>Rwanda</Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Sign In</Text>
          <Text style={s.cardSub}>Enter your badge number and password</Text>

          {!!error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <Text style={s.label}>Badge Number</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. RNP-001"
            placeholderTextColor={C.muted}
            value={badge}
            onChangeText={setBadge}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <Text style={s.label}>Password</Text>
          <TextInput
            style={s.input}
            placeholder="••••••••••"
            placeholderTextColor={C.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCorrect={false}
          />

          <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnText}>Sign In</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={s.footer}>Authorised Personnel Only · Classified System</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: C.bg },
  scroll:   { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 40 },
  logoBox:  {
    width: 72, height: 72, borderRadius: 16,
    backgroundColor: C.rnp,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  logoText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  appName:  { color: C.text, fontSize: 18, fontWeight: '700', textAlign: 'center', lineHeight: 26 },
  appSub:   { color: C.muted, fontSize: 13, marginTop: 2 },

  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    padding: 24,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardTitle: { color: C.text, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  cardSub:   { color: C.muted, fontSize: 13, marginBottom: 20 },

  errorBox:  { backgroundColor: '#7f1d1d', borderRadius: RADIUS.sm, padding: 12, marginBottom: 16 },
  errorText: { color: '#fca5a5', fontSize: 13 },

  label: { color: C.muted, fontSize: 11, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.md, padding: 14, color: C.text,
    fontSize: 15, marginBottom: 16,
  },

  btn: {
    backgroundColor: C.rnp, borderRadius: RADIUS.md,
    padding: 15, alignItems: 'center', marginTop: 4,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  footer: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 32 },
})

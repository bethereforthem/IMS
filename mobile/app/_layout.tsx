import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { View, ActivityIndicator } from 'react-native'
import { C } from '@/lib/theme'

function RootGuard() {
  const { user, loading } = useAuth()
  const segments = useSegments()
  const router   = useRouter()

  useEffect(() => {
    if (loading) return
    const inApp = segments[0] === '(app)'
    if (!user && inApp) {
      router.replace('/login')
    } else if (user && !inApp) {
      router.replace('/(app)/')
    }
  }, [user, loading, segments, router])

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={C.rnp} size="large" />
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(app)" />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" backgroundColor={C.bg} />
      <RootGuard />
    </AuthProvider>
  )
}

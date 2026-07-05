import { Tabs } from 'expo-router'
import { View, Text, StyleSheet } from 'react-native'
import { useAuth, isVillageLeader } from '@/hooks/useAuth'
import { C, INSTITUTION_COLOR, RADIUS } from '@/lib/theme'

function TabIcon({ label, emoji, color, focused }: { label: string; emoji: string; color: string; focused: boolean }) {
  return (
    <View style={[ti.wrap, focused && { backgroundColor: color + '22' }]}>
      <Text style={ti.emoji}>{emoji}</Text>
      <Text style={[ti.label, { color: focused ? color : C.muted }]}>{label}</Text>
    </View>
  )
}

const ti = StyleSheet.create({
  wrap:  { alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: RADIUS.md, minWidth: 56 },
  emoji: { fontSize: 20 },
  label: { fontSize: 10, marginTop: 2, fontWeight: '600' },
})

export default function AppLayout() {
  const { user } = useAuth()
  const accent = user ? (INSTITUTION_COLOR[user.institution] ?? C.rnp) : C.rnp
  const vl = isVillageLeader(user?.role)
  // NISS / RDF / RNP officers get the full Incident tab
  const isNissAgent = !vl && ['NISS_OFFICER', 'NISS_DIRECTOR', 'RDF_BORDER_OFFICER',
    'RDF_COMMANDER', 'RNP_PATROL', 'RNP_DETECTIVE', 'RNP_COMMANDER'].includes(user?.role ?? '')

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: 70,
          paddingBottom: 8,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Home" emoji="🏠" color={accent} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="nid"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="NID" emoji="🔍" color={accent} focused={focused} />
          ),
        }}
      />
      {/* Incident reporting tab — field agents only */}
      <Tabs.Screen
        name="incident"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Incident" emoji="🚨" color={accent} focused={focused} />
          ),
          tabBarItemStyle: isNissAgent ? {} : { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label={vl ? 'Report' : 'Intel'} emoji={vl ? '📋' : '📡'} color={accent} focused={focused} />
          ),
          tabBarItemStyle: isNissAgent ? { display: 'none' } : {},
        }}
      />
      {/* Live tracking tab */}
      <Tabs.Screen
        name="tracking"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Tracking" emoji="📡" color={C.niss} focused={focused} />
          ),
          tabBarItemStyle: isNissAgent ? {} : { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="sos"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="SOS" emoji="🔴" color={C.danger} focused={focused} />
          ),
        }}
      />
    </Tabs>
  )
}

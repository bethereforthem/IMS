import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi } from '@/lib/api'
import { saveSession, getSavedUser, clearSession } from '@/lib/storage'

export interface AuthUser {
  user_id: string
  badge_number: string
  full_name: string
  role: string
  institution: string
  clearance_level: string
}

interface AuthCtx {
  user: AuthUser | null
  loading: boolean
  login: (badge: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Restore session on app start
  useEffect(() => {
    getSavedUser().then(saved => {
      if (saved) setUser(saved as unknown as AuthUser)
    }).finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (badge: string, password: string) => {
    const { data } = await authApi.login(badge, password)
    const authUser = data.user as unknown as AuthUser
    await saveSession(data.access_token, data.user)
    setUser(authUser)
  }, [])

  const logout = useCallback(async () => {
    await clearSession()
    setUser(null)
  }, [])

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

// Role helpers
export const isOfficer = (role?: string) =>
  !!role && !['VILLAGE_LEADER'].includes(role)

export const isVillageLeader = (role?: string) => role === 'VILLAGE_LEADER'

export const canSubmitIntel = (role?: string) =>
  !!role && ['RNP_PATROL', 'RNP_DETECTIVE', 'RNP_COMMANDER', 'RDF_BORDER_OFFICER',
    'RDF_COMMANDER', 'NISS_OFFICER', 'NISS_DIRECTOR'].includes(role)

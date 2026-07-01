'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import Cookies from 'js-cookie'
import { authApi } from '@/lib/api'
import type { AuthUser, Institution, UserRole } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthState {
  user: AuthUser | null
  loading: boolean
  /** Called by login page after verifyOtp succeeds — sets cookies and user state */
  login: (access_token: string, refresh_token: string, userPayload: AuthUser) => void
  logout: () => Promise<void>
}

// ─── JWT decode helper ────────────────────────────────────────────────────────

function parseJwt(token: string): AuthUser | null {
  try {
    const payload = token.split('.')[1]
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return decoded as AuthUser
  } catch {
    return null
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

export const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: () => {},
  logout: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

// ─── State provider hook ──────────────────────────────────────────────────────

export function useAuthState(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Hydrate from cookie on mount
  useEffect(() => {
    const token = Cookies.get('ims_access_token')
    if (token) {
      const parsed = parseJwt(token)
      if (parsed && parsed.exp * 1000 > Date.now()) {
        setUser(parsed)
      } else {
        Cookies.remove('ims_access_token')
      }
    }
    setLoading(false)
  }, [])

  /**
   * Sets JWT cookies and updates user state.
   * The two-step credential+OTP flow is handled entirely by the login page;
   * this function is only called once OTP verification succeeds.
   */
  const login = useCallback(
    (access_token: string, refresh_token: string, userPayload: AuthUser) => {
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
      Cookies.set('ims_access_token', access_token, {
        secure: isHttps,
        sameSite: 'lax',
        expires: 1,
      })
      Cookies.set('ims_refresh_token', refresh_token, {
        secure: isHttps,
        sameSite: 'lax',
        expires: 7,
      })
      setUser(userPayload)
    },
    []
  )

  const logout = useCallback(async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    Cookies.remove('ims_access_token')
    Cookies.remove('ims_refresh_token')
    setUser(null)
    window.location.href = '/login'
  }, [])

  return { user, loading, login, logout }
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

export function institutionColor(institution: Institution): string {
  const map: Record<Institution, string> = {
    NISS:   'niss',
    RNP:    'rnp',
    RIB:    'rib',
    RDF:    'rdf',
    RCS:    'rcs',
    IRONDO: 'patrol',
    DASSO:  'patrol',
    SYSTEM: 'brand',
  }
  return map[institution] ?? 'brand'
}

export function dashboardRoute(role: UserRole): string {
  if (role.startsWith('NISS') || role === 'SIEM_ANALYST') return '/niss'
  if (role.startsWith('RNP') || role === 'SYSTEM_ADMIN') return '/rnp'
  if (role.startsWith('RIB')) return '/rib'
  if (role.startsWith('RDF')) return '/rdf'
  if (role.startsWith('RCS')) return '/rcs'
  if (role === 'IRONDO_PATROL' || role === 'DASSO_OFFICER') return '/patrol'
  return '/login'
}

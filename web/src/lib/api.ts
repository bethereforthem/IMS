import axios, { AxiosInstance, AxiosError } from 'axios'
import Cookies from 'js-cookie'
import type {
  TokenResponse, Suspect, IntelligenceEvent,
  Alert, CameraNode, DashboardStats, Case, SiemEvent, LocationRecord
} from '@/types'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1'

function createClient(): AxiosInstance {
  const client = axios.create({ baseURL: BASE_URL, timeout: 15000 })

  client.interceptors.request.use(cfg => {
    const token = Cookies.get('ims_access_token')
    if (token) cfg.headers.Authorization = `Bearer ${token}`
    return cfg
  })

  client.interceptors.response.use(
    r => r,
    async (err: AxiosError) => {
      const original = err.config as typeof err.config & { _retry?: boolean }
      if (err.response?.status === 401 && !original._retry) {
        original._retry = true
        const refresh = Cookies.get('ims_refresh_token')
        if (refresh) {
          try {
            const { data } = await axios.post<TokenResponse>(
              `${BASE_URL}/auth/refresh`,
              { refresh_token: refresh }
            )
            Cookies.set('ims_access_token', data.access_token, { secure: true, sameSite: 'strict' })
            Cookies.set('ims_refresh_token', data.refresh_token, { secure: true, sameSite: 'strict' })
            if (original.headers) original.headers.Authorization = `Bearer ${data.access_token}`
            return client(original)
          } catch {
            Cookies.remove('ims_access_token')
            Cookies.remove('ims_refresh_token')
            window.location.href = '/login'
          }
        }
      }
      return Promise.reject(err)
    }
  )
  return client
}

export const api = createClient()

// ─── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (badge_number: string, password: string) =>
    api.post<TokenResponse>('/auth/login', { badge_number, password }),

  logout: () => api.post('/auth/logout'),

  refresh: (refresh_token: string) =>
    api.post<TokenResponse>('/auth/refresh', { refresh_token }),
}

// ─── Dashboard stats (institution-scoped via RLS) ────────────────────────────

export const statsApi = {
  getDashboard: () => api.get<DashboardStats>('/dashboard/stats'),
  getRecentAlerts: (limit = 10) =>
    api.get<{ alerts: Alert[]; total: number }>(`/alerts?limit=${limit}&is_read=false`)
      .then(r => ({ ...r, data: r.data?.alerts ?? [] as Alert[] })),
  getRecentEvents: (limit = 20) =>
    api.get<{ events: IntelligenceEvent[]; total: number }>(`/intelligence/events?limit=${limit}`)
      .then(r => ({ ...r, data: r.data?.events ?? [] as IntelligenceEvent[] })),
}

// ─── Suspects ────────────────────────────────────────────────────────────────

export const suspectsApi = {
  list: (params?: { status?: string; limit?: number; offset?: number }) =>
    api.get<{ suspects: Suspect[]; total: number }>('/suspects', { params }),
  get: (id: string) => api.get<Suspect>(`/suspects/${id}`),
  getWanted: () =>
    api.get<{ suspects: Suspect[]; total: number }>('/suspects?status=WANTED&limit=50')
      .then(r => ({ ...r, data: r.data?.suspects ?? [] as Suspect[] })),
}

// ─── Intelligence events ─────────────────────────────────────────────────────

export const intelligenceApi = {
  listEvents: (params?: { source_tag?: string; limit?: number }) =>
    api.get<{ events: IntelligenceEvent[]; total: number }>('/intelligence/events', { params }),
  getEvent: (id: string) => api.get<IntelligenceEvent>(`/intelligence/events/${id}`),
  acknowledgeAlert: (alertId: string) => api.patch(`/alerts/${alertId}/read`),
}

// ─── Location (TOP SECRET — role-gated by RLS on server) ─────────────────────

export const locationApi = {
  getSuspectMovement: (suspectId: string, justification: string) =>
    api.get<LocationRecord[]>(`/location/suspect/${suspectId}?justification=${encodeURIComponent(justification)}`),
  getRecentLocations: () =>
    api.get<{ records: LocationRecord[]; total: number }>('/location/recent')
      .then(r => ({ ...r, data: r.data?.records ?? [] as LocationRecord[] })),
}

// ─── Camera nodes ─────────────────────────────────────────────────────────────

export const cameraApi = {
  list: () =>
    api.get<{ cameras: CameraNode[]; total: number }>('/infrastructure/cameras')
      .then(r => ({ ...r, data: r.data?.cameras ?? [] as CameraNode[] })),
  getStatus: (nodeId: string) => api.get<CameraNode>(`/infrastructure/cameras/${nodeId}`),
}

// ─── Cases ───────────────────────────────────────────────────────────────────

export const casesApi = {
  list: (params?: { status?: string; limit?: number }) =>
    api.get<{ cases: Case[]; total: number }>('/cases', { params }),
}

// ─── SIEM (NISS/SIEM_ANALYST only — blocked by RLS otherwise) ────────────────

export const siemApi = {
  getEvents: (limit = 50) =>
    api.get<{ events: SiemEvent[]; total: number }>(`/siem/events?limit=${limit}`)
      .then(r => ({ ...r, data: r.data?.events ?? [] as SiemEvent[] })),
  review: (eventId: string, notes: string) =>
    api.patch(`/siem/events/${eventId}/review`, { notes }),
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export const alertsApi = {
  list: (params?: { severity?: string; is_read?: boolean; requires_action?: boolean; limit?: number }) =>
    api.get<{ alerts: Alert[]; total: number }>('/alerts', { params }),
  markRead: (alertId: string) => api.patch(`/alerts/${alertId}/read`),
}

// ─── Warrants ─────────────────────────────────────────────────────────────────

export const warrantsApi = {
  list: (params?: { active?: boolean; priority?: string; limit?: number }) =>
    api.get<{ warrants: Record<string, unknown>[]; total: number }>('/warrants', { params }),
}

// ─── Corrections ──────────────────────────────────────────────────────────────

export const correctionsApi = {
  list: (params?: { custody_status?: string; limit?: number }) =>
    api.get<{ records: Record<string, unknown>[]; total: number }>('/corrections', { params }),
}

// ─── International partners ───────────────────────────────────────────────────

export const partnersApi = {
  list: () =>
    api.get<{ partners: Record<string, unknown>[] }>('/partners'),
}

// ─── Audit log ───────────────────────────────────────────────────────────────

export const auditApi = {
  list: (params?: { limit?: number; actor_id?: string; action?: string }) =>
    api.get<{ entries: Record<string, unknown>[]; total: number }>('/audit', { params }),
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminApi = {
  emergencyLockdown: (secondDirectorId: string, reason: string) =>
    api.post('/admin/emergency-lockdown', { second_director_id: secondDirectorId, reason }),
  revokeAccess: (targetUserId: string, reason: string) =>
    api.post('/admin/revoke-access', { target_user_id: targetUserId, reason }),
}

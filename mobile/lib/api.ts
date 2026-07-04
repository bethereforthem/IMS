import axios from 'axios'
import { getToken, clearSession } from './storage'

// Set this to your deployed Next.js URL or local dev IP.
// For local dev: http://YOUR_MACHINE_IP:3000/api/v1
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'

const client = axios.create({ baseURL: BASE_URL, timeout: 15000 })

client.interceptors.request.use(async cfg => {
  const token = await getToken()
  if (token && cfg.headers) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

client.interceptors.response.use(
  r => r,
  async err => {
    if (err.response?.status === 401) {
      await clearSession()
    }
    return Promise.reject(err)
  }
)

// ─── Auth ───────────────────────────────────────────────────────────────────

export const authApi = {
  login: (badge_number: string, password: string) =>
    client.post<{
      access_token: string
      user: Record<string, unknown>
    }>('/auth/login', { badge_number, password }),
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

export const dashboardApi = {
  getStats: () =>
    client.get<{
      total_suspects: number
      alerts_today: number
      critical_alerts: number
      active_cases: number
    }>('/dashboard/stats'),

  getRecentAlerts: (limit = 5) =>
    client.get<{ alerts: Alert[]; total: number }>(
      `/alerts?limit=${limit}&is_read=false`
    ),
}

// ─── NID Check ──────────────────────────────────────────────────────────────

export const nidApi = {
  // Village Leader — result only (classification, no name)
  villageCheck: (nid: string, lat?: number, lng?: number, desc?: string) =>
    client.post<{
      found: boolean
      classification?: { status: string; threat_level: number; owning_institution: string }
    }>('/patrol/check', {
      nid,
      location_lat: lat ?? null,
      location_lng: lng ?? null,
      location_description: desc ?? null,
    }),

  // Officers (RNP, RDF, NISS) — full suspect profile
  officerCheck: (nid: string, lat?: number, lng?: number, desc?: string) =>
    client.post<{
      found: boolean
      suspect?: {
        id: string
        full_name: string
        ims_reference: string
        status: string
        threat_level: number
        owning_institution: string
        nationality: string
      }
    }>('/patrol/officer-check', {
      nid,
      location_lat: lat ?? null,
      location_lng: lng ?? null,
      location_description: desc ?? null,
    }),
}

// ─── Intelligence Report (officers) ─────────────────────────────────────────

export const intelApi = {
  submitReport: (payload: {
    title: string
    priority: string
    description: string
    location_lat?: number | null
    location_lng?: number | null
    location_description?: string
  }) =>
    client.post('/intelligence/events', {
      source_tag: 'OFFICER_REPORT',
      criminal_record_found: false,
      notes: JSON.stringify({
        title: payload.title,
        priority: payload.priority,
        description: payload.description,
      }),
      location_lat: payload.location_lat ?? null,
      location_lng: payload.location_lng ?? null,
      location_description: payload.location_description ?? null,
    }),

  getMyReports: (officerId: string, limit = 10) =>
    client.get<{ events: unknown[]; total: number }>(
      `/intelligence/events?officer_id=${officerId}&limit=${limit}`
    ),
}

// ─── Village Report ──────────────────────────────────────────────────────────

export const patrolApi = {
  submitReport: (payload: {
    person_name?: string
    description: string
    insecurity_type: string
    location_lat?: number | null
    location_lng?: number | null
    location_description?: string
  }) => client.post('/patrol/report', payload),
}

// ─── SOS ────────────────────────────────────────────────────────────────────

export const sosApi = {
  send: (lat?: number | null, lng?: number | null, location_description?: string, notes?: string) =>
    client.post<{ sent: boolean; alert_id: string }>('/alerts/sos', {
      location_lat: lat ?? null,
      location_lng: lng ?? null,
      location_description: location_description ?? null,
      notes: notes ?? null,
    }),
}

// Re-export the raw client for one-off calls
export { client }

// ─── Local types ─────────────────────────────────────────────────────────────

export interface Alert {
  id: string
  title: string
  message: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  is_read: boolean
  requires_action: boolean
  created_at: string
  source_tag: string
}

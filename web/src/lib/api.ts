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
  list: (params?: { status?: string; limit?: number; offset?: number; name?: string }) =>
    api.get<{ suspects: Suspect[]; total: number }>('/suspects', { params }),
  get: (id: string) => api.get<Suspect>(`/suspects/${id}`),
  getWanted: () =>
    api.get<{ suspects: Suspect[]; total: number }>('/suspects?status=WANTED&limit=50')
      .then(r => ({ ...r, data: r.data?.suspects ?? [] as Suspect[] })),
  create: (data: {
    first_name: string
    last_name: string
    owning_institution: string
    status?: string
    threat_level?: number
    nationality?: string
    clearance_level?: string
    date_of_birth?: string
    notes?: string
    known_associates?: string[]
    distinguishing_marks?: string
  }) => api.post<Suspect>('/suspects', data),
}

// ─── Intelligence events ─────────────────────────────────────────────────────

export const intelligenceApi = {
  listEvents: (params?: { source_tag?: string; limit?: number; officer_id?: string }) =>
    api.get<{ events: IntelligenceEvent[]; total: number }>('/intelligence/events', { params }),
  getEvent: (id: string) => api.get<IntelligenceEvent>(`/intelligence/events/${id}`),
  acknowledgeAlert: (alertId: string) => api.patch(`/alerts/${alertId}/read`),
  getVillageEvents: (limit = 30) =>
    api.get<{ events: IntelligenceEvent[]; total: number }>(
      `/intelligence/events?institution=VILLAGE_LEADER&criminal_record_found=true&limit=${limit}`
    ).then(r => ({ ...r, data: r.data?.events ?? [] as IntelligenceEvent[] })),

  getAlertEvents: (windowHours = 24, limit = 100) => {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()
    return api.get<{ events: IntelligenceEvent[]; total: number }>(
      `/intelligence/events?alert_generated=true&has_location=true&since=${encodeURIComponent(since)}&limit=${limit}`
    ).then(r => ({ ...r, data: r.data?.events ?? [] as IntelligenceEvent[] }))
  },
}

// ─── Patrol (Village Leader) ──────────────────────────────────────────────────

export const patrolApi = {
  checkNid: (nid: string, location?: { lat: number; lng: number; description?: string }) =>
    api.post<{
      found: boolean
      classification?: { status: string; threat_level: number; owning_institution: string }
    }>('/patrol/check', {
      nid,
      location_lat: location?.lat ?? null,
      location_lng: location?.lng ?? null,
      location_description: location?.description ?? null,
    }),

  myReports: (limit = 50) =>
    api.get<{ events: IntelligenceEvent[]; total: number }>('/patrol/report', { params: { limit } }),

  submitReport: (data: {
    person_name?: string
    person?: Record<string, string>
    description: string
    insecurity_type: string
    location_lat?: number | null
    location_lng?: number | null
    location_description?: string
    file_urls?: string[]
  }) => api.post<{ suspect_id?: string | null; matched_existing_record?: boolean } & Record<string, unknown>>('/patrol/report', data),
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
  get: (id: string) =>
    api.get<Case & {
      category?: string
      summary?: string
      incident_date?: string
      location_name?: string
      suspects?: Array<{
        id: string
        full_name: string
        ims_reference: string
        status: string
        threat_level?: string
        role?: string
        added_at?: string
      }>
    }>(`/cases/${id}`),
  create: (data: {
    title: string
    lead_institution: string
    category?: string
    status?: string
    clearance_level?: string
    summary?: string
    incident_date?: string
    location_name?: string
  }) => api.post<Case>('/cases', data),
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
  share: (alertId: string, body: { target_institution: string; instructions: string }) =>
    api.post<{ shared_alert_id: string; target: string }>(`/alerts/${alertId}/share`, body),
}

// ─── Warrants ─────────────────────────────────────────────────────────────────

export const warrantsApi = {
  list: (params?: { active?: boolean; priority?: string; limit?: number }) =>
    api.get<{ warrants: Record<string, unknown>[]; total: number }>('/warrants', { params }),
  create: (data: {
    suspect_id: string
    charges: string
    warrant_type?: string
    issued_by_court?: string
    case_reference?: string
    expires_at?: string
    priority?: string
    notes?: string
  }) => api.post<Record<string, unknown>>('/warrants', data),
}

// ─── Corrections ──────────────────────────────────────────────────────────────

export const correctionsApi = {
  list: (params?: { custody_status?: string; limit?: number }) =>
    api.get<{ records: Record<string, unknown>[]; total: number }>('/corrections', { params }),
  get: (id: string) =>
    api.get<Record<string, unknown>>(`/corrections/${id}`),
  create: (data: Record<string, unknown>) =>
    api.post<Record<string, unknown>>('/corrections', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<Record<string, unknown>>(`/corrections/${id}`, data),
}

// ─── International partners ───────────────────────────────────────────────────

export const partnersApi = {
  list: () =>
    api.get<{ partners: Record<string, unknown>[] }>('/partners'),
}

// ─── Audit log ───────────────────────────────────────────────────────────────

export const auditApi = {
  list: (params?: {
    page?: number; limit?: number
    actor_id?: string; actor_name?: string; actor_badge?: string
    action?: string; event_type?: string
    target_type?: string; target_id?: string
    institution?: string; from?: string; to?: string
  }) =>
    api.get<{ entries: Record<string, unknown>[]; total: number; action_counts: Record<string, number> }>(
      '/audit', { params }
    ),
}

// ─── Team roster ──────────────────────────────────────────────────────────────

export interface TeamMember {
  id: string
  badge_number: string
  full_name: string
  role: string
  institution: string
  clearance_level: string
  active: boolean
  last_login_at: string | null
  active_cases: number
}

export const teamApi = {
  list: (institution?: string) =>
    api.get<{ institution: string; members: TeamMember[]; total_open_cases: number }>(
      '/team', { params: institution ? { institution } : undefined }
    ),
}

// ─── Admin Portal ─────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string
  badge_number: string
  full_name: string
  role: string
  clearance_level: string
  institution: string
  active: boolean
  locked: boolean
  mfa_failures: number
  last_login_at: string | null
  created_at: string
}

export interface AdminSession {
  id: string
  user_id: string
  full_name: string | null
  badge_number: string | null
  institution: string | null
  role: string | null
  ip_address: string | null
  device_type: string | null
  browser: string | null
  os: string | null
  country_name: string | null
  country_code: string | null
  city: string | null
  is_vpn: boolean
  is_proxy: boolean
  current_page: string | null
  created_at: string
  last_active_at: string | null
  expires_at: string
  revoked: boolean
}

export interface SecurityIncident {
  id: string
  incident_type: string
  severity: 'MEDIUM' | 'HIGH' | 'CRITICAL'
  badge_number: string | null
  full_name: string | null
  institution: string | null
  ip_address: string | null
  country_code: string | null
  country_name: string | null
  city: string | null
  description: string
  auto_blocked: boolean
  resolved: boolean
  resolved_at: string | null
  resolution_notes: string | null
  created_at: string
  alert_id: string | null
}

export interface SystemControl {
  key: string
  value: string
  description: string | null
  set_at: string
}

export interface AdminAnalytics {
  summary: {
    total_active_users: number
    total_logins_24h: number
    failed_logins_24h: number
    unresolved_incidents: number
  }
  daily_logins: Array<{ date: string; success: number; failed: number }>
  by_institution: Array<{ name: string; value: number }>
  by_role: Array<{ name: string; value: number }>
  by_incident_type: Array<{ name: string; value: number }>
  top_pages: Array<{ path: string; visits: number }>
  daily_incidents: Array<{ date: string; count: number }>
  sessions_by_institution: Array<{ name: string; value: number }>
  hourly_heatmap: Array<{ day: string; hour: number; value: number }>
}

export const adminPortalApi = {
  // Users
  listUsers: () =>
    api.get<{ users: AdminUser[] }>('/admin/users'),
  getUser: (id: string) =>
    api.get<{
      user: AdminUser
      sessions: AdminSession[]
      login_attempts: Array<{ id: string; success: boolean; ip_address: string | null; device_type: string | null; browser: string | null; os: string | null; country_name: string | null; city: string | null; failure_reason: string | null; attempted_at: string }>
      page_visits: Array<{ id: string; page_path: string; page_title: string | null; entered_at: string; left_at: string | null; duration_seconds: number | null }>
    }>(`/admin/users/${id}`),
  updateUser: (id: string, data: { active?: boolean; locked?: boolean }) =>
    api.patch<{ updated: boolean }>(`/admin/users/${id}`, data),
  changeRole: (id: string, role: string) =>
    api.patch<{ updated: boolean; role: string }>(`/admin/users/${id}/permissions`, { role }),
  resetCredentials: (id: string, new_password: string) =>
    api.post<{ reset: boolean }>(`/admin/users/${id}/reset`, { new_password }),

  // Sessions
  getSessions: (params?: { institution?: string; limit?: number }) =>
    api.get<{ sessions: AdminSession[]; count: number }>('/admin/sessions', { params }),

  // Security incidents
  getIncidents: (resolved = false, limit = 50) =>
    api.get<{ incidents: SecurityIncident[]; count: number }>(`/admin/security?resolved=${resolved}&limit=${limit}`),
  resolveIncident: (id: string, resolution_notes?: string) =>
    api.post<{ resolved: boolean }>(`/admin/security/${id}/resolve`, { resolution_notes }),

  // System controls
  getControls: () =>
    api.get<{ controls: SystemControl[]; state: Record<string, unknown> }>('/admin/controls'),
  applyControl: (action: string, target?: string, value?: unknown) =>
    api.post<{ applied: boolean; action: string; target?: string }>('/admin/controls', { action, target, value }),

  // Analytics
  getAnalytics: () =>
    api.get<AdminAnalytics>('/admin/analytics'),

  // System health
  getHealth: () =>
    api.get<{
      status: 'OPERATIONAL' | 'DEGRADED' | 'LOCKED' | 'ALERT'
      db_healthy: boolean
      db_latency_ms: number
      system_locked: boolean
      active_sessions: number
      total_active_users: number
      total_locked_users: number
      logins_24h: number
      failed_24h: number
      open_incidents: { CRITICAL: number; HIGH: number; MEDIUM: number; total: number }
      service_statuses: { key: string; label: string; enabled: boolean }[]
      locked_institutions: { inst: string; locked_at: string }[]
      last_login: { attempted_at: string; badge_number: string; full_name: string; institution: string } | null
      last_audit: { event_timestamp: string; event_type: string; actor_name: string; actor_institution: string } | null
      checked_at: string
      response_time_ms: number
    }>('/admin/health'),

  // Page visit tracking
  trackPageEnter: (page_path: string, page_title?: string) =>
    api.post<{ recorded: boolean; visit_id: string | null }>('/admin/page-visits', { event: 'enter', page_path, page_title }),
  trackPageLeave: (page_path: string, visit_id: string) =>
    api.post<{ recorded: boolean }>('/admin/page-visits', { event: 'leave', page_path, visit_id }),

  // Single-session termination (lighter than revoke-access which locks the account)
  revokeSession: (sessionId: string) =>
    api.delete<{ revoked: boolean; session_id: string }>(`/admin/sessions/${sessionId}`),
}

// ─── AI Intelligence ──────────────────────────────────────────────────────────

export interface AIPrediction {
  id: string
  run_id: string
  rank: number
  center_lat: number
  center_lng: number
  radius_km: number
  district: string | null
  province: string | null
  confidence_score: number
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  dominant_categories: string[]
  peak_hours: number[]
  peak_days: string[]
  trend_direction: 'INCREASING' | 'STABLE' | 'DECREASING'
  incident_count_90d: number
  incident_count_30d: number
  incident_count_7d: number
  severity_score: number
  explanation: string
  patrol_recommendation: string | null
  preventive_actions: string[]
  data_points_used: number
  institution: string | null
  valid_until: string
  created_at: string
}

export interface AIInsight {
  id: string
  run_id: string
  institution: string | null
  insight_type:
    | 'TREND_SUMMARY' | 'ANOMALY_ALERT' | 'SEASONAL_PATTERN' | 'PATROL_STRATEGY' | 'RISK_OVERVIEW'
    | 'WHO_ANALYSIS' | 'WHEN_ANALYSIS' | 'WHERE_ANALYSIS' | 'HOW_ANALYSIS' | 'CRIME_PREDICTIONS'
  title: string
  content: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  created_at: string
  expires_at: string
}

export interface AIPredictionRun {
  id: string
  institution: string | null
  total_incidents_analyzed: number
  time_window_days: number
  completed_at: string | null
  created_at: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
}

export interface AIAnalysisResult {
  cached: boolean
  run_id: string
  predictions: AIPrediction[]
  insights: AIInsight[]
  stats?: {
    incidents_analyzed: number
    clusters_found: number
    temporal_pattern: string
    top_category: string | null
    feedback_accuracy: number
  }
}

export const aiIntelligenceApi = {
  analyze: (forceRefresh = false) =>
    api.post<AIAnalysisResult>('/ai-intelligence/analyze', { force_refresh: forceRefresh }),

  getPredictions: (runId?: string) =>
    api.get<{
      run: AIPredictionRun | null
      predictions: AIPrediction[]
      insights: AIInsight[]
      has_data: boolean
      analysis_in_progress: boolean
      message?: string
    }>('/ai-intelligence/predictions' + (runId ? `?run_id=${runId}` : '')),

  submitFeedback: (data: {
    prediction_id: string
    accurate: boolean
    accuracy_rating?: number
    notes?: string
    actual_event_id?: string
  }) => api.post<{ recorded: boolean; accurate: boolean }>('/ai-intelligence/feedback', data),
}

// Legacy stub kept for backward compat
export const adminApi = {
  emergencyLockdown: (secondDirectorId: string, reason: string) =>
    api.post('/admin/emergency-lockdown', { second_director_id: secondDirectorId, reason }),
  revokeAccess: (targetUserId: string, reason: string) =>
    api.post('/admin/revoke-access', { target_user_id: targetUserId, reason }),
}

// ─── Field Reports ────────────────────────────────────────────────────────────

export interface WebFieldReport {
  id: string
  agent_id: string
  agent_name?: string
  agent_badge?: string
  agent_institution?: string
  agent_role?: string
  title: string
  category: string
  description: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  incident_date: string
  notes?: string
  location_lat?: number | null
  location_lng?: number | null
  location_description?: string
  assigned_to?: string[]
  status: string
  alert_id?: string
  intelligence_event_id?: string
  tracking_session_id?: string
  media_urls?: string[]
  created_at: string
  tracking_session?: {
    id: string; status: string; started_at: string; total_pings: number
  } | null
}

export const fieldReportsApi = {
  list: (params?: { status?: string; priority?: string; limit?: number }) =>
    api.get<{ reports: WebFieldReport[]; total: number }>('/field-reports', { params }),
  get: (id: string) =>
    api.get<WebFieldReport>(`/field-reports/${id}`),
  assign: (id: string, assigned_to: string[], status?: string) =>
    api.patch<{ id: string; status: string; assigned_to: string[] }>(
      `/field-reports/${id}/assign`,
      { assigned_to, status }
    ),
}

// ─── SOS Emergency ───────────────────────────────────────────────────────────

export const sosApi = {
  trigger: (data: {
    location_lat?: number | null
    location_lng?: number | null
    location_description?: string
    notes?: string
  }) =>
    api.post<{
      sent: boolean
      alert_id: string
      field_report_id: string | null
      tracking_session_id: string | null
    }>('/alerts/sos', data),

  acknowledge: (alert_id: string, notes?: string) =>
    api.post<{ acknowledged: boolean; alert_id: string }>(
      '/alerts/sos/acknowledge',
      { alert_id, notes }
    ),

  sendPing: (data: {
    session_id: string
    lat: number
    lng: number
    accuracy_m?: number
    heading?: number
  }) => api.post<{ recorded: boolean }>('/agent-tracking/ping', data),

  cancelTracking: (session_id: string) =>
    api.patch(`/agent-tracking/sessions/${session_id}`, { action: 'close' }),

  getActive: (limit = 20) =>
    api.get<{ alerts: Alert[]; total: number }>(
      `/alerts?severity=CRITICAL&is_read=false&requires_action=true&limit=${limit}`
    ),
}

// ─── Commander Rescue Emergency ───────────────────────────────────────────────

export const commanderRescueApi = {
  trigger: (data: {
    location_lat?: number | null
    location_lng?: number | null
    location_description?: string
    notes?: string
  }) =>
    api.post<{
      sent: boolean
      alert_id: string
      field_report_id: string | null
      tracking_session_id: string | null
      rescue_teams: string[]
    }>('/commander-rescue', data),

  acknowledge: (alert_id: string, notes?: string) =>
    api.post<{ acknowledged: boolean; alert_id: string; acknowledged_by: string }>(
      '/commander-rescue/acknowledge',
      { alert_id, notes }
    ),

  resolve: (alert_id: string, tracking_session_id?: string | null, notes?: string) =>
    api.post<{ resolved: boolean; alert_id: string; tracking_closed: boolean }>(
      '/commander-rescue/resolve',
      { alert_id, tracking_session_id, notes }
    ),

  sendPing: (data: {
    session_id: string
    lat: number
    lng: number
    accuracy_m?: number
    heading?: number
  }) => api.post<{ recorded: boolean }>('/agent-tracking/ping', data),

  cancelTracking: (session_id: string) =>
    api.patch(`/agent-tracking/sessions/${session_id}`, { action: 'close' }),

  getActive: (limit = 20) =>
    api.get<{ alerts: Alert[]; total: number }>(
      `/commander-rescue?limit=${limit}`
    ),
}

// ─── Agent Tracking (commander view) ─────────────────────────────────────────

export interface ActiveAgent {
  session_id: string
  session_status: 'ACTIVE' | 'PAUSED'
  started_at: string
  total_pings: number
  field_report_id?: string
  agent_id?: string
  agent_name?: string
  agent_badge?: string
  agent_institution?: string
  agent_role?: string
  last_lat?: number | null
  last_lng?: number | null
  last_heading?: number | null
  last_ping_at?: string | null
  report_title?: string | null
  report_priority?: string | null
  report_category?: string | null
  // Availability monitoring
  availability_status: 'ONLINE' | 'OFFLINE' | 'GPS_DISABLED'
  offline_reason?: 'PHONE_OFF' | 'NO_NETWORK' | 'GPS_DISABLED' | 'APP_TERMINATED' | 'TIMEOUT' | null
  offline_since?: string | null
  last_heartbeat_at?: string | null
}

export const agentTrackingApi = {
  getActiveAgents: () =>
    api.get<{ agents: ActiveAgent[]; total: number; offline_count: number }>('/agent-tracking/agents'),
  getPings: (sessionId: string, limit = 500) =>
    api.get<{ pings: Array<{ lat: number; lng: number; pinged_at: string }>; total: number }>(
      `/agent-tracking/sessions/${sessionId}?limit=${limit}`
    ),
  sessionAction: (sessionId: string, action: 'pause' | 'resume' | 'close') =>
    api.patch(`/agent-tracking/sessions/${sessionId}`, { action }),
}

// ─── Agent Availability / Heartbeat ──────────────────────────────────────────

export const heartbeatApi = {
  alive: (data?: { location_lat?: number | null; location_lng?: number | null }) =>
    api.post<{ alive: boolean; was_offline: boolean }>(
      '/agent-tracking/heartbeat',
      data ?? {}
    ),
  reportOffline: (reason: string, location_lat?: number | null, location_lng?: number | null) =>
    api.post<{ recorded: boolean; new_alert: boolean; alert_id?: string | null }>(
      '/agent-tracking/offline',
      { reason, location_lat, location_lng }
    ),
}

// ─── Border Identity Verification ────────────────────────────────────────────

export interface BorderVerifyPayload {
  doc_type: 'NATIONAL_ID' | 'PASSPORT' | 'REFUGEE_CARD' | 'DRIVERS_LICENSE' | 'OTHER'
  doc_number?: string | null
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  date_of_birth?: string | null
  nationality?: string | null
  gender?: string | null
  expiry_date?: string | null
  issuing_country?: string | null
  issuing_authority?: string | null
  mrz_line1?: string | null
  mrz_line2?: string | null
  raw_ocr_text?: string | null
  scan_method?: 'OCR_AUTO' | 'OCR_ASSISTED' | 'MANUAL' | 'QR_CODE'
  ocr_confidence?: number | null
  scan_failed?: boolean
  scan_failure_reason?: string | null
  border_post?: string | null
  location_lat?: number | null
  location_lng?: number | null
  device_type?: string | null
  device_info?: string | null
  notes?: string | null
}

export interface BorderVerifyResult {
  verification_id: string
  verification_status: 'CLEAN' | 'FLAGGED' | 'EXPIRED_DOC' | 'SCAN_FAILED' | 'MANUAL_REVIEW'
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  doc_expired: boolean
  suspect_match: boolean
  warrant_match: boolean
  watchlist_match: boolean
  interpol_match: boolean
  alert_id: string | null
  suspect: {
    id: string; ims_reference: string; first_name: string; last_name: string
    status: string; threat_level: number; date_of_birth: string | null
    nationality: string | null; passport_number: string | null
    active_warrants: { id: string; warrant_type: string; charges: string; issued_at: string }[]
  } | null
  verified_at: string
}

export interface BorderVerification {
  id: string
  doc_type: string
  doc_number: string | null
  full_name: string | null
  nationality: string | null
  expiry_date: string | null
  scan_method: string
  scan_failed: boolean
  verification_status: string
  risk_level: string
  suspect_match: boolean
  warrant_match: boolean
  watchlist_match: boolean
  interpol_match: boolean
  border_post: string | null
  badge_number: string
  device_type: string | null
  verified_at: string
}

export const borderVerifyApi = {
  verify: (payload: BorderVerifyPayload) =>
    api.post<BorderVerifyResult>('/border/verify', payload),

  listVerifications: (params?: {
    page?: number; limit?: number; status?: string
    doc_type?: string; mine?: boolean; from?: string; to?: string
  }) => api.get<{
    verifications: BorderVerification[]
    total: number; page: number; limit: number; pages: number
  }>('/border/verifications', { params }),
}

// ─── Policy Agreement ─────────────────────────────────────────────────────────

export interface PolicyDocument {
  id: string
  policy_type: 'TERMS_OF_SERVICE' | 'PRIVACY_POLICY' | 'SECURITY_POLICY' | 'LOCATION_SHARING_POLICY'
  version: number
  title: string
  summary: string
  content: string
  is_active: boolean
  effective_date: string
  created_by: string | null
  created_by_name: string | null
  created_at: string
  acceptance_count?: number
}

export interface PolicyAcceptance {
  id: string
  full_name: string | null
  badge_number: string | null
  institution: string | null
  role: string | null
  accepted_at: string
  ip_address: string | null
  device_info: string | null
  gps_lat: number | null
  gps_lng: number | null
}

export const policyApi = {
  getPending: () =>
    api.get<{
      pending: PolicyDocument[]
      all_accepted: boolean
      total_policies: number
      accepted_count: number
    }>('/policies/pending'),

  accept: (policy_ids: string[]) =>
    api.post<{ accepted: number; policy_types: string[] }>('/policies/accept', { policy_ids }),
}

export const adminPolicyApi = {
  list: () =>
    api.get<{ policies: PolicyDocument[]; total: number }>('/admin/policies'),

  create: (data: {
    policy_type: string
    title: string
    summary: string
    content: string
    effective_date?: string
  }) => api.post<{ policy: PolicyDocument }>('/admin/policies', data),

  update: (id: string, data: {
    title?: string
    summary?: string
    content?: string
    effective_date?: string
  }) => api.patch<{ policy: PolicyDocument }>(`/admin/policies/${id}`, data),

  get: (id: string) =>
    api.get<{ policy: PolicyDocument; acceptances: PolicyAcceptance[]; acceptance_count: number }>(
      `/admin/policies/${id}`
    ),
}

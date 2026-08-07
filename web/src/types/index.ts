export type Institution =
  | 'NISS' | 'RNP' | 'RIB' | 'RDF' | 'RCS' | 'VILLAGE_LEADER' | 'SYSTEM'

export type UserRole =
  | 'NISS_DIRECTOR' | 'NISS_OFFICER' | 'SIEM_ANALYST'
  | 'RNP_COMMANDER' | 'RNP_DETECTIVE' | 'RNP_PATROL'
  | 'RIB_INVESTIGATOR' | 'RIB_ANALYST'
  | 'RDF_COMMANDER' | 'RDF_BORDER_OFFICER'
  | 'RCS_SUPERINTENDENT' | 'RCS_OFFICER'
  | 'VILLAGE_LEADER'
  | 'SYSTEM_ADMIN'

export type ClearanceLevel = 'TOP_SECRET' | 'SECRET' | 'CONFIDENTIAL' | 'UNCLASSIFIED'

export type SourceTag =
  | 'CCTV_NODE' | 'FACE_SCAN' | 'NID_SCAN' | 'NID_MANUAL'
  | 'INTERPOL_FEED' | 'PARTNER_QUERY' | 'OFFICER_REPORT' | 'SYSTEM_ALERT'

export type SuspectStatus =
  | 'WANTED' | 'ACTIVE' | 'IN_CUSTODY' | 'ARRESTED'
  | 'CONVICTED' | 'RELEASED' | 'DECEASED' | 'INTERPOL_FLAGGED' | 'CLEARED'

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface AuthUser {
  id: string
  badge_number: string
  full_name: string
  institution: Institution
  role: UserRole
  clearance_level: ClearanceLevel
  session_id: string
  exp: number
  has_accepted_policies?: boolean
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
  user: AuthUser
}

export interface Suspect {
  id: string
  ims_reference: string
  full_name: string
  /** First alias only — kept for existing callers; prefer `aliases`. */
  alias?: string
  /** Every recorded alias, straight from the `suspects.aliases` text[] column. */
  aliases?: string[]
  status: SuspectStatus
  /** Nullable in the database — not every suspect has been scored. */
  threat_level: number | null
  nationality: string
  date_of_birth?: string
  physical_description?: string
  known_associates?: string[]
  institution_classification: Institution
  clearance_required: ClearanceLevel
  created_at: string
  updated_at: string
}

export interface IntelligenceEvent {
  id: string
  source_tag: SourceTag
  suspect_id?: string
  suspect_name?: string
  suspect_status?: string
  suspect_threat_level?: number
  suspect_ims_reference?: string
  institution?: string
  ims_reference?: string
  reporting_officer_id?: string
  camera_node_id?: string
  confidence_score?: number
  criminal_record_found: boolean
  alert_generated: boolean
  location_lat?: number
  location_lng?: number
  location_description?: string
  notes?: string
  created_at: string
}

export interface Alert {
  id: string
  severity: AlertSeverity
  title: string
  message: string
  source_tag: SourceTag
  suspect_id?: string
  suspect_name?: string
  event_id?: string
  is_read: boolean
  read_by?: string | null
  read_at?: string | null
  requires_action: boolean
  target_institutions?: string[] | null
  created_at: string
}

export interface CameraNode {
  id: string
  node_identifier: string
  location_name: string
  institution: Institution
  is_active: boolean
  last_heartbeat?: string
  latitude?: number
  longitude?: number
}

export interface DashboardStats {
  total_suspects: number
  wanted_count: number
  in_custody_count: number
  active_warrants: number
  alerts_today: number
  critical_alerts: number
  events_today: number
  camera_nodes_online: number
  camera_nodes_total: number
}

// ─── RCS / custody ───────────────────────────────────────────────────────────

export interface FacilityStats {
  facility_name: string
  total: number
  in_custody: number
  pre_trial: number
  sentenced: number
}

/** Aggregates over the whole corrections_records table — GET /corrections/stats */
export interface CustodyStats {
  total: number
  in_custody: number
  pre_trial: number
  sentenced: number
  released: number
  transferred: number
  escaped: number
  deceased: number
  high_threat: number
  reviews_due: number
  reviews_overdue: number
  admissions_recent: number
  releases_recent: number
  recent_window_days: number
  review_window_days: number
  avg_sentence_years: number | null
  by_status: Record<string, number>
  by_threat: Record<string, number>
  by_facility: FacilityStats[]
  monthly: { month: string; intake: number; releases: number }[]
}

export type CustodyEventType =
  | 'INTAKE' | 'RELEASE' | 'REVIEW' | 'INCIDENT' | 'TRANSFER' | 'RECORD_UPDATE'

export interface CustodyEvent {
  id: string
  event_type: CustodyEventType
  occurred_at: string
  description: string
  status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE'
  correction_id: string | null
  inmate_name: string | null
  ims_reference: string | null
  facility: string | null
  cell_block: string | null
  custody_status: string | null
  officer_name: string | null
  officer_badge: string | null
  officer_institution: string | null
}

export interface Case {
  id: string
  case_reference: string
  title: string
  status: string
  classification: ClearanceLevel
  lead_institution: Institution
  created_at: string
}

export interface SiemEvent {
  id: string
  rule_name: string
  severity: AlertSeverity
  description: string
  auto_action?: string
  reviewed: boolean
  created_at: string
}

export interface LocationRecord {
  id: string
  suspect_id: string
  suspect_name: string
  ims_reference: string
  latitude: number
  longitude: number
  location_description?: string
  source_tag: SourceTag
  recorded_at: string
}

export type IncidentPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type IncidentStatus   = 'OPEN' | 'ASSIGNED' | 'INVESTIGATING' | 'CLOSED' | 'PAUSED'

export interface FieldReport {
  id: string
  agent_id: string
  agent_name?: string
  agent_badge?: string
  agent_institution?: string
  agent_role?: string
  title: string
  category: string
  description: string
  priority: IncidentPriority
  incident_date: string
  notes?: string
  location_lat?: number | null
  location_lng?: number | null
  location_description?: string
  assigned_to?: string[]
  status: IncidentStatus
  alert_id?: string
  intelligence_event_id?: string
  tracking_session_id?: string
  media_urls?: string[]
  created_at: string
  updated_at: string
  tracking_session?: {
    id: string
    status: 'ACTIVE' | 'PAUSED' | 'CLOSED'
    started_at: string
    total_pings: number
  } | null
}

export interface AgentTrackingSession {
  id: string
  agent_id: string
  field_report_id?: string
  status: 'ACTIVE' | 'PAUSED' | 'CLOSED'
  started_at: string
  paused_at?: string
  closed_at?: string
  total_pings: number
}

export interface AgentLocationPing {
  lat: number
  lng: number
  accuracy_m?: number
  heading?: number
  speed_ms?: number
  pinged_at: string
}

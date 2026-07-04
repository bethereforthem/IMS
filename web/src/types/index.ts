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
  | 'CONVICTED' | 'RELEASED' | 'DECEASED' | 'INTERPOL_FLAGGED'

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
  alias?: string
  status: SuspectStatus
  threat_level: number
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

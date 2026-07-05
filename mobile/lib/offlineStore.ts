/**
 * Offline queue for field reports.
 * Stores pending reports in AsyncStorage when the device has no network.
 * The sync loop in the incident screen calls flushQueue() on reconnect.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const QUEUE_KEY = 'ims_offline_report_queue'

export interface QueuedReport {
  offline_id: string          // client-generated UUID used for server-side dedup
  title: string
  category: string
  description: string
  priority: string
  incident_date: string
  notes?: string
  location_lat?: number | null
  location_lng?: number | null
  location_description?: string
  media_urls?: string[]
  queued_at: string
}

export async function enqueue(report: QueuedReport): Promise<void> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY)
  const queue: QueuedReport[] = raw ? JSON.parse(raw) : []
  queue.push(report)
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

export async function getQueue(): Promise<QueuedReport[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY)
  return raw ? JSON.parse(raw) : []
}

export async function removeFromQueue(offline_id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY)
  const queue: QueuedReport[] = raw ? JSON.parse(raw) : []
  const updated = queue.filter(r => r.offline_id !== offline_id)
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated))
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY)
}

// ── Tracking session persistence ──────────────────────────────────────────────
// Store the active session_id so tracking survives app restarts.

const SESSION_KEY = 'ims_active_tracking_session'

export interface StoredSession {
  session_id: string
  field_report_id: string
  report_title: string
  started_at: string
}

export async function saveTrackingSession(s: StoredSession): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s))
}

export async function getTrackingSession(): Promise<StoredSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY)
  return raw ? JSON.parse(raw) : null
}

export async function clearTrackingSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY)
}

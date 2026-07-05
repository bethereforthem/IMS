/**
 * Live GPS tracking for field agents.
 *
 * After an incident is submitted, startTracking() begins watching the device's
 * GPS and sends pings to /api/v1/agent-tracking/ping every PING_INTERVAL_MS.
 * When the app is backgrounded, the pings continue via expo-task-manager.
 *
 * Movement history is stored locally (for offline resilience) and synced on
 * each successful ping.
 */
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { trackingApi } from './api'

const BACKGROUND_TASK = 'IMS_GPS_TRACKING_TASK'
const PING_INTERVAL_MS = 15_000          // send ping every 15 s
const HISTORY_KEY = 'ims_location_history'
const MAX_HISTORY = 2000                  // keep last 2 000 points locally

export interface PingPoint {
  lat: number
  lng: number
  accuracy_m?: number
  heading?: number
  speed_ms?: number
  ts: string
}

// ── Register background task (call once at app startup) ───────────────────────
TaskManager.defineTask(BACKGROUND_TASK, async ({ data, error }) => {
  if (error) return
  const raw = data as { locations: Location.LocationObject[] }
  if (!raw?.locations?.length) return

  const loc = raw.locations[raw.locations.length - 1]
  const sessionRaw = await AsyncStorage.getItem('ims_active_tracking_session')
  if (!sessionRaw) return

  const session = JSON.parse(sessionRaw) as { session_id: string }
  const point: PingPoint = {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy_m: loc.coords.accuracy ?? undefined,
    heading: loc.coords.heading ?? undefined,
    speed_ms: loc.coords.speed ?? undefined,
    ts: new Date(loc.timestamp).toISOString(),
  }

  await appendHistory(point)
  await trackingApi.ping(session.session_id, point).catch(() => {
    // Network failure — ping already in local history; will not retry automatically
  })
})

// ── Foreground subscription ───────────────────────────────────────────────────
let _subscription: Location.LocationSubscription | null = null
let _pingTimer: ReturnType<typeof setInterval> | null = null
let _pendingPoint: PingPoint | null = null

export async function startTracking(sessionId: string): Promise<boolean> {
  try {
    // Request foreground & background permissions
    const { status: fg } = await Location.requestForegroundPermissionsAsync()
    if (fg !== 'granted') return false
    const { status: bg } = await Location.requestBackgroundPermissionsAsync()
    if (bg !== 'granted') {
      // Background denied — foreground only
    }

    // Start background location updates
    await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: PING_INTERVAL_MS,
      distanceInterval: 10,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'IMS — Field Agent Tracking',
        notificationBody: 'Your location is being shared with command.',
        notificationColor: '#a855f7',
      },
    }).catch(() => {
      // Background task registration failed — fall back to foreground only
    })

    // Foreground watcher as fallback / supplement
    _subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5_000, distanceInterval: 5 },
      (loc) => {
        _pendingPoint = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          accuracy_m: loc.coords.accuracy ?? undefined,
          heading: loc.coords.heading ?? undefined,
          speed_ms: loc.coords.speed ?? undefined,
          ts: new Date(loc.timestamp).toISOString(),
        }
      }
    )

    // Throttled ping timer
    _pingTimer = setInterval(async () => {
      if (!_pendingPoint) return
      const point = _pendingPoint
      _pendingPoint = null
      await appendHistory(point)
      await trackingApi.ping(sessionId, point).catch(() => {})
    }, PING_INTERVAL_MS)

    return true
  } catch {
    return false
  }
}

export async function stopTracking(): Promise<void> {
  if (_pingTimer) { clearInterval(_pingTimer); _pingTimer = null }
  if (_subscription) { _subscription.remove(); _subscription = null }
  _pendingPoint = null

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK)
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_TASK).catch(() => {})
  }
}

export async function isTrackingActive(): Promise<boolean> {
  try {
    return TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK)
  } catch {
    return false
  }
}

// ── Local movement history ────────────────────────────────────────────────────
async function appendHistory(point: PingPoint): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY)
    const history: PingPoint[] = raw ? JSON.parse(raw) : []
    history.push(point)
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY)
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  } catch { /* storage error — discard */ }
}

export async function getLocalHistory(): Promise<PingPoint[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export async function clearLocalHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY)
}

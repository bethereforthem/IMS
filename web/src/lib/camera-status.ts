/**
 * camera-status.ts — deriving a camera node's real state.
 *
 * The dashboards used to render `is_active ? 'ONLINE' : 'OFFLINE'`. But
 * `camera_nodes.is_active` is an administrative enable flag set when the node is
 * commissioned — it says nothing about whether the node is currently reachable.
 * Liveness lives in `last_heartbeat`.
 *
 * With the seeded estate that gap is stark: eight nodes carry `is_active = true`
 * while their most recent heartbeat is over a month old, and every one of them
 * was drawn as "ONLINE · Transmitting" behind a pulsing green dot.
 */
import type { CameraNode } from '@/types'

/**
 * How long a node may go without a heartbeat before it is treated as
 * unreachable. Seeded nodes beat roughly once a minute, so fifteen minutes is
 * many missed intervals rather than one late one.
 */
export const HEARTBEAT_STALE_MS = 15 * 60 * 1000

export type CameraStatus = 'ONLINE' | 'STALE' | 'DISABLED' | 'NEVER_SEEN'

export interface CameraStatusInfo {
  status: CameraStatus
  /** Short label for a badge. */
  label: string
  /** Why the node is in this state, for a tooltip or detail line. */
  detail: string
  /** True only when the node is enabled *and* currently beating. */
  live: boolean
}

export function cameraStatus(
  camera: Pick<CameraNode, 'is_active' | 'last_heartbeat'>,
  now: number = Date.now(),
): CameraStatusInfo {
  if (!camera.is_active) {
    return {
      status: 'DISABLED',
      label: 'DISABLED',
      detail: 'Node is administratively disabled.',
      live: false,
    }
  }

  if (!camera.last_heartbeat) {
    return {
      status: 'NEVER_SEEN',
      label: 'NO SIGNAL',
      detail: 'Node is enabled but has never reported a heartbeat.',
      live: false,
    }
  }

  const beat = new Date(camera.last_heartbeat).getTime()
  if (Number.isNaN(beat)) {
    return {
      status: 'NEVER_SEEN',
      label: 'NO SIGNAL',
      detail: 'Node reported an unreadable heartbeat timestamp.',
      live: false,
    }
  }

  if (now - beat > HEARTBEAT_STALE_MS) {
    return {
      status: 'STALE',
      label: 'NO SIGNAL',
      detail: 'Node is enabled but has stopped sending heartbeats.',
      live: false,
    }
  }

  return {
    status: 'ONLINE',
    label: 'ONLINE',
    detail: 'Node is transmitting.',
    live: true,
  }
}

'use client'

export type MapSoundType = 'criminal' | 'sos' | 'suspect' | 'offline' | 'commander' | 'intrusion'

// Higher number = more critical — intrusion is highest (security breach)
const PRIORITY: Record<MapSoundType, number> = {
  intrusion: 10, commander: 5, sos: 4, criminal: 3, suspect: 2, offline: 1,
}

// Gap between pattern repetitions (ms)
const REPEAT_GAP: Record<MapSoundType, number> = {
  intrusion: 300, commander: 600, sos: 1500, criminal: 700, suspect: 1200, offline: 1500,
}

// ── Singleton AudioContext ─────────────────────────────────────────────────
let _ctx: AudioContext | null = null

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!_ctx) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _ctx = new (window.AudioContext ?? (window as any).webkitAudioContext)()
    } catch { return null }
  }
  if (_ctx.state === 'suspended') _ctx.resume().catch(() => {})
  return _ctx
}

// ── Pattern playback — returns scheduled duration in ms ───────────────────
function playSingle(type: MapSoundType): number {
  const ac = audioCtx()
  if (!ac) return 0
  const t0 = ac.currentTime

  if (type === 'intrusion') {
    // Fire-alarm klaxon: rapid alternating sawtooth 960Hz/800Hz, 3 pairs
    // Highest priority — security breach, immediately distinct from commander klaxon
    let t = t0
    for (let pair = 0; pair < 3; pair++) {
      for (const freq of [960, 800]) {
        const o = ac.createOscillator(), g = ac.createGain()
        o.connect(g); g.connect(ac.destination)
        o.type = 'sawtooth'
        o.frequency.value = freq
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.45, t + 0.015)
        g.gain.linearRampToValueAtTime(0.42, t + 0.165)
        g.gain.linearRampToValueAtTime(0, t + 0.18)
        o.start(t); o.stop(t + 0.19)
        t += 0.19
      }
      t += 0.04
    }
    return Math.ceil((t - t0) * 1000) + 40
  }

  if (type === 'commander') {
    // High-authority klaxon: alternating sawtooth 1400 Hz / 900 Hz, 4 rapid pairs
    // Immediately distinguishable from SOS Morse — loud authority alert
    let t = t0
    for (let pair = 0; pair < 4; pair++) {
      for (const freq of [1400, 900]) {
        const o = ac.createOscillator(), g = ac.createGain()
        o.connect(g); g.connect(ac.destination)
        o.type = 'sawtooth'
        o.frequency.value = freq
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.38, t + 0.02)
        g.gain.linearRampToValueAtTime(0, t + 0.13)
        o.start(t); o.stop(t + 0.15)
        t += 0.16
      }
      t += 0.06 // brief inter-pair gap
    }
    return Math.ceil((t - t0) * 1000) + 50
  }

  if (type === 'criminal') {
    // 3 rapid high-pitched square beeps — urgent alarm
    for (let i = 0; i < 3; i++) {
      const o = ac.createOscillator(), g = ac.createGain()
      o.connect(g); g.connect(ac.destination)
      o.type = 'square'; o.frequency.value = 880
      const t = t0 + i * 0.18
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.35, t + 0.02)
      g.gain.linearRampToValueAtTime(0, t + 0.12)
      o.start(t); o.stop(t + 0.14)
    }
    return 560
  }

  if (type === 'sos') {
    // Morse SOS: · · · — — — · · ·
    const dot = 0.10, dash = 0.22, gap = 0.12, wg = 0.28
    const seq: [number, number][] = [
      [dot, gap], [dot, gap], [dot, wg],
      [dash, gap], [dash, gap], [dash, wg],
      [dot, gap], [dot, gap], [dot, 0],
    ]
    let t = t0
    for (const [dur, pause] of seq) {
      const o = ac.createOscillator(), g = ac.createGain()
      o.connect(g); g.connect(ac.destination)
      o.type = 'sine'; o.frequency.value = 660
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.45, t + 0.01)
      g.gain.linearRampToValueAtTime(0, t + dur - 0.01)
      o.start(t); o.stop(t + dur)
      t += dur + pause
    }
    return 2600
  }

  if (type === 'suspect') {
    // Double medium tone — alert
    for (let i = 0; i < 2; i++) {
      const o = ac.createOscillator(), g = ac.createGain()
      o.connect(g); g.connect(ac.destination)
      o.type = 'sine'; o.frequency.value = 600
      const t = t0 + i * 0.28
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.28, t + 0.02)
      g.gain.linearRampToValueAtTime(0, t + 0.22)
      o.start(t); o.stop(t + 0.24)
    }
    return 580
  }

  // offline — descending triangle tone
  const o = ac.createOscillator(), g = ac.createGain()
  o.connect(g); g.connect(ac.destination)
  o.type = 'triangle'
  o.frequency.setValueAtTime(420, t0)
  o.frequency.linearRampToValueAtTime(200, t0 + 0.55)
  g.gain.setValueAtTime(0.28, t0)
  g.gain.linearRampToValueAtTime(0, t0 + 0.55)
  o.start(t0); o.stop(t0 + 0.6)
  return 600
}

// ── AlarmManager ───────────────────────────────────────────────────────────
class AlarmManager {
  private readonly alerts = new Map<string, MapSoundType>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private currentType: MapSoundType | null = null
  private muted = false

  /**
   * Register a threat alert. Resets silence flag.
   * If incoming priority is higher than what is currently looping, preempts immediately.
   */
  register(id: string, type: MapSoundType): void {
    this.alerts.set(id, type)
    this.muted = false
    this.maybePreempt(type)
    this.emit()
  }

  /**
   * Remove a specific alert. Next-highest priority resumes automatically.
   */
  drop(id: string): void {
    this.alerts.delete(id)
    if (this.alerts.size === 0) {
      if (this.timer) { clearTimeout(this.timer); this.timer = null }
      this.currentType = null
    }
    this.emit()
  }

  /**
   * Silence beeping. The loop restarts automatically when the next alert is registered.
   */
  silence(): void {
    this.muted = true
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    this.currentType = null
    this.emit()
  }

  get isBeeping(): boolean { return !this.muted && this.alerts.size > 0 }
  get topType(): MapSoundType | null { return this.highest() }

  private highest(): MapSoundType | null {
    let best: MapSoundType | null = null, pri = 0
    for (const t of this.alerts.values()) {
      if (PRIORITY[t] > pri) { pri = PRIORITY[t]; best = t }
    }
    return best
  }

  private maybePreempt(incoming: MapSoundType): void {
    // Don't interrupt a higher or equal priority pattern mid-cycle
    if (
      this.timer &&
      this.currentType &&
      PRIORITY[incoming] <= PRIORITY[this.currentType]
    ) return

    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (!this.muted) this.tick()
  }

  private tick(): void {
    if (this.muted || this.alerts.size === 0) return
    const type = this.highest()
    if (!type) return
    this.currentType = type
    const dur = playSingle(type)
    this.timer = setTimeout(() => {
      this.timer = null
      this.currentType = null
      this.tick()          // loop forever until silenced or no alerts remain
    }, dur + REPEAT_GAP[type])
  }

  private emit(): void {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('ims-alarm', {
      detail: { active: this.isBeeping, type: this.topType },
    }))
  }
}

export const alarmManager = new AlarmManager()

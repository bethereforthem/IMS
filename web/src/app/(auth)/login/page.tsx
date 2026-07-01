'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, dashboardRoute } from '@/hooks/useAuth'
import { authApi } from '@/lib/api'
import { Eye, EyeOff, Fingerprint } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

function parseJwt(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch { return null }
}

// ── Animated canvas background (cyber network + matrix) ──────────────────────

function CyberCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // ── Node network ──
    type Node = { x: number; y: number; vx: number; vy: number; r: number; pulse: number }
    const nodes: Node[] = Array.from({ length: 60 }, () => ({
      x:     Math.random() * canvas.width,
      y:     Math.random() * canvas.height,
      vx:    (Math.random() - 0.5) * 0.4,
      vy:    (Math.random() - 0.5) * 0.4,
      r:     Math.random() * 2 + 1,
      pulse: Math.random() * Math.PI * 2,
    }))

    // ── Matrix rain ──
    const fontSize = 12
    const cols = Math.floor(canvas.width / fontSize)
    const drops: number[] = Array(cols).fill(0).map(() => Math.random() * -100)
    const matChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$&%アイウエオカキクケコ'

    // ── Radar sweep ──
    let radarAngle = 0

    // ── Hex grid ──
    function drawHex(cx: number, cy: number, size: number, alpha: number) {
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6
        const px = cx + size * Math.cos(angle)
        const py = cy + size * Math.sin(angle)
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.strokeStyle = `rgba(34,197,94,${alpha})`
      ctx.lineWidth = 0.4
      ctx.stroke()
    }

    let frame = 0

    const draw = () => {
      frame++
      const w = canvas.width
      const h = canvas.height

      // Background fade
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fillRect(0, 0, w, h)

      // ── Hex grid (static, very faint) ──
      if (frame === 1) {
        const hexSize = 38
        const hexW = hexSize * 2
        const hexH = Math.sqrt(3) * hexSize
        for (let row = -1; row < h / hexH + 2; row++) {
          for (let col = -1; col < w / hexW + 2; col++) {
            const cx = col * hexW * 0.75
            const cy = row * hexH + (col % 2 === 0 ? 0 : hexH / 2)
            drawHex(cx, cy, hexSize, 0.06)
          }
        }
      }

      // ── Matrix rain ──
      ctx.font = `${fontSize}px monospace`
      for (let i = 0; i < cols; i++) {
        const char = matChars[Math.floor(Math.random() * matChars.length)]
        const y    = drops[i] * fontSize
        // Leading char: bright white
        ctx.fillStyle = `rgba(200,255,220,${Math.random() * 0.6 + 0.2})`
        ctx.fillText(char, i * fontSize, y)
        // Trail chars handled by fade
        if (y > h && Math.random() > 0.978) drops[i] = 0
        drops[i] += 0.5
      }

      // ── Node network ──
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy; n.pulse += 0.03
        if (n.x < 0 || n.x > w) n.vx *= -1
        if (n.y < 0 || n.y > h) n.vy *= -1
      })

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx   = nodes[i].x - nodes[j].x
          const dy   = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 160) {
            const alpha = (1 - dist / 160) * 0.3
            ctx.strokeStyle = `rgba(34,197,94,${alpha})`
            ctx.lineWidth   = 0.6
            ctx.beginPath()
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.stroke()
          }
        }
      }

      // Draw nodes
      nodes.forEach(n => {
        const glow = Math.sin(n.pulse) * 0.5 + 0.5
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r + glow * 1.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(34,197,94,${0.4 + glow * 0.4})`
        ctx.fill()
      })

      // ── Radar sweep (top-right corner) ──
      radarAngle = (radarAngle + 0.012) % (Math.PI * 2)
      const rx = w * 0.82, ry = h * 0.22, rr = Math.min(w, h) * 0.14
      // Radar circle
      ctx.strokeStyle = 'rgba(34,197,94,0.12)'
      ctx.lineWidth   = 1
      ;[0.33, 0.66, 1].forEach(s => {
        ctx.beginPath()
        ctx.arc(rx, ry, rr * s, 0, Math.PI * 2)
        ctx.stroke()
      })
      // Cross hairs
      ctx.strokeStyle = 'rgba(34,197,94,0.08)'
      ctx.beginPath(); ctx.moveTo(rx - rr, ry); ctx.lineTo(rx + rr, ry); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(rx, ry - rr); ctx.lineTo(rx, ry + rr); ctx.stroke()
      // Sweep gradient
      const sweep = ctx.createConicalGradient
        ? null
        : null
      void sweep
      ctx.save()
      ctx.translate(rx, ry)
      ctx.rotate(radarAngle)
      const grad = ctx.createLinearGradient(0, 0, rr, 0)
      grad.addColorStop(0, 'rgba(34,197,94,0.5)')
      grad.addColorStop(1, 'rgba(34,197,94,0)')
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, rr, -0.4, 0)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.restore()
      // Blip
      const bx = rx + Math.cos(radarAngle * 0.7 + 1.2) * rr * 0.55
      const by = ry + Math.sin(radarAngle * 0.7 + 1.2) * rr * 0.55
      ctx.beginPath()
      ctx.arc(bx, by, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(34,197,94,0.9)'
      ctx.fill()

      // ── Scan line overlay ──
      const scanY = (frame * 2) % h
      const scanGrad = ctx.createLinearGradient(0, scanY - 60, 0, scanY + 2)
      scanGrad.addColorStop(0, 'rgba(34,197,94,0)')
      scanGrad.addColorStop(1, 'rgba(34,197,94,0.04)')
      ctx.fillStyle = scanGrad
      ctx.fillRect(0, scanY - 60, w, 62)

      // Horizontal scan lines (CRT effect)
      ctx.fillStyle = 'rgba(0,0,0,0.03)'
      for (let y = 0; y < h; y += 3) {
        ctx.fillRect(0, y, w, 1)
      }
    }

    const id = setInterval(draw, 33)
    return () => { clearInterval(id); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" />
}

// ── Intro splash ──────────────────────────────────────────────────────────────

const BOOT_LINES = [
  'Initializing secure enclave…',
  'Loading biometric modules…',
  'Establishing encrypted channel…',
  'Verifying system integrity…',
  'Mounting classified database…',
  'Authentication gateway ready.',
]

function IntroSplash({ onDone }: { onDone: () => void }) {
  const DURATION        = 5000
  const [progress, setProgress]   = useState(0)
  const [logLines, setLogLines]   = useState<string[]>([])
  const [titleIn,  setTitleIn]    = useState(false)
  const [exiting,  setExiting]    = useState(false)

  useEffect(() => {
    const t0 = setTimeout(() => setTitleIn(true), 200)

    // Boot log lines
    const lineTimers: ReturnType<typeof setTimeout>[] = []
    BOOT_LINES.forEach((line, i) => {
      lineTimers.push(setTimeout(() => {
        setLogLines(prev => [...prev, line])
      }, 400 + i * 680))
    })

    // Progress bar
    const start = Date.now()
    const ticker = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / DURATION) * 100)
      setProgress(pct)
      if (pct >= 100) {
        clearInterval(ticker)
        setExiting(true)
        setTimeout(onDone, 600)
      }
    }, 32)

    return () => {
      clearTimeout(t0)
      lineTimers.forEach(clearTimeout)
      clearInterval(ticker)
    }
  }, [onDone])

  return (
    <div className={clsx(
      'fixed inset-0 z-20 flex flex-col items-center justify-center transition-all duration-700',
      exiting ? 'opacity-0 scale-105' : 'opacity-100 scale-100'
    )}>
      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.75) 70%, rgba(0,0,0,0.97) 100%)' }}
      />

      {/* Corner HUD brackets */}
      {['top-5 left-5 border-t-2 border-l-2','top-5 right-5 border-t-2 border-r-2',
        'bottom-5 left-5 border-b-2 border-l-2','bottom-5 right-5 border-b-2 border-r-2',
      ].map((cls, i) => (
        <div key={i} className={`absolute w-12 h-12 border-green-500/60 ${cls}`} />
      ))}

      {/* Top status bar */}
      <div className="absolute top-8 left-0 right-0 flex items-center justify-between px-14 text-[9px] font-mono text-green-800 tracking-widest uppercase">
        <span>IMS SECURE TERMINAL</span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          ENCRYPTED
        </span>
        <span>SESSION: INIT</span>
      </div>

      {/* Centre content */}
      <div className={clsx(
        'relative z-10 flex flex-col items-center text-center px-6 transition-all duration-700',
        titleIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      )}>
        {/* Overline */}
        <p className="text-green-600 text-[10px] font-bold tracking-[0.55em] uppercase mb-5">
          ◆ Republic of Rwanda — Classified ◆
        </p>

        {/* Main wordmark */}
        <div style={{ textShadow: '0 0 60px rgba(34,197,94,0.45), 0 0 120px rgba(34,197,94,0.15)' }}>
          <h1
            className="text-white font-black uppercase leading-none"
            style={{
              fontSize: 'clamp(5rem, 18vw, 13rem)',
              fontFamily: '"Arial Black", "Arial Bold", Impact, sans-serif',
              letterSpacing: '-0.02em',
            }}
          >
            IMS
          </h1>
        </div>

        <p className="text-slate-300 font-semibold tracking-[0.35em] uppercase mt-2 mb-3"
          style={{ fontSize: 'clamp(0.65rem, 1.5vw, 1rem)' }}>
          Rwanda Intelligence Management System
        </p>

        <div className="flex items-center gap-3 mb-10">
          <div className="h-px w-16 bg-green-900" />
          <p className="text-green-700 text-[9px] tracking-[0.4em] uppercase font-mono">
            Confidential · Law Enforcement Use Only
          </p>
          <div className="h-px w-16 bg-green-900" />
        </div>

        {/* Progress area */}
        <div className="w-72 md:w-[440px]">
          {/* Boot log */}
          <div className="mb-4 h-28 overflow-hidden text-left">
            {logLines.map((line, i) => (
              <p key={i} className="text-[10px] font-mono text-green-700/80 leading-relaxed">
                <span className="text-green-500/60 mr-2">›</span>{line}
              </p>
            ))}
            {logLines.length < BOOT_LINES.length && (
              <span className="inline-block w-2 h-3 bg-green-500 animate-pulse ml-4" />
            )}
          </div>

          {/* Bar */}
          <div className="flex justify-between text-[9px] font-mono text-slate-600 mb-1.5 tracking-widest">
            <span>SYSTEM LOAD</span>
            <span className="text-green-600">{Math.round(progress)}%</span>
          </div>
          <div className="h-0.5 bg-slate-900 w-full overflow-hidden">
            <div
              className="h-full transition-none"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #166534, #22c55e, #bbf7d0)',
                boxShadow: '0 0 12px #22c55e, 0 0 24px rgba(34,197,94,0.4)',
              }}
            />
          </div>

          {/* Segment dots */}
          <div className="flex gap-1.5 mt-2.5 justify-center">
            {Array.from({ length: 12 }).map((_, i) => {
              const active = (progress / 100) >= (i / 12)
              return (
                <div key={i} className="h-0.5 flex-1 transition-all duration-300"
                  style={{
                    background: active ? '#22c55e' : '#1a2e1a',
                    boxShadow: active ? '0 0 4px #22c55e' : 'none',
                  }}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Bottom status */}
      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-between px-14 text-[9px] font-mono text-green-900 tracking-widest uppercase">
        <span>RWANDA NATIONAL SECURITY</span>
        <span>AES-256 · TLS 1.3</span>
        <span>© {new Date().getFullYear()} OPCOM DIVISION</span>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { login } = useAuth()
  const router    = useRouter()

  const [showLogin, setShowLogin] = useState(false)
  const [formIn,    setFormIn]    = useState(false)
  const [badge,     setBadge]     = useState('')
  const [password,  setPassword]  = useState('')
  const [showPass,  setShowPass]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  const handleDone = useCallback(() => {
    setShowLogin(true)
    setTimeout(() => setFormIn(true), 80)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!badge.trim() || !password) { setError('Badge number and password are required'); return }
    setLoading(true)
    try {
      const { data } = await authApi.login(badge.trim().toUpperCase(), password)
      const payload  = parseJwt(data.access_token)
      if (!payload) throw new Error('Invalid token')
      login(data.access_token, data.refresh_token, payload as Parameters<typeof login>[2])
      toast.success(`Access granted — ${String(payload.full_name)}`)
      router.push(dashboardRoute(String(payload.role) as Parameters<typeof dashboardRoute>[0]))
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Authentication failed — invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black overflow-hidden relative flex items-center justify-center">

      {/* ── Video background ── */}
      <video
        className="fixed inset-0 w-full h-full object-cover"
        style={{ opacity: 0.28, zIndex: 1 }}
        autoPlay muted loop playsInline
        poster="/bg-poster.jpg"
      >
        <source src="/bg.mp4" type="video/mp4" />
        <source src="/bg.webm" type="video/webm" />
      </video>

      {/* ── Canvas animation layer ── */}
      <div className="fixed inset-0" style={{ zIndex: 2 }}>
        <CyberCanvas />
      </div>

      {/* ── Dark overlay ── */}
      <div className="fixed inset-0 bg-black/55" style={{ zIndex: 3 }} />

      {/* ── Intro splash ── */}
      {!showLogin && (
        <div style={{ zIndex: 10 }} className="fixed inset-0">
          <IntroSplash onDone={handleDone} />
        </div>
      )}

      {/* ── Login form ── */}
      {showLogin && (
        <div
          style={{ zIndex: 10 }}
          className={clsx(
            'relative w-full max-w-[420px] px-5 transition-all duration-700',
            formIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          )}
        >
          <div
            className="border border-green-900/40 bg-black/80 backdrop-blur-md p-8"
            style={{ boxShadow: '0 0 60px rgba(34,197,94,0.06), 0 0 0 1px rgba(34,197,94,0.08)' }}
          >
            {/* Corner accents */}
            {['-top-px -left-px border-t border-l','-top-px -right-px border-t border-r',
              '-bottom-px -left-px border-b border-l','-bottom-px -right-px border-b border-r',
            ].map((cls, i) => (
              <div key={i} className={`absolute w-4 h-4 border-green-500 ${cls}`} />
            ))}

            {/* Header */}
            <div className="text-center mb-7">
              <p className="text-green-600 text-[9px] font-mono font-bold tracking-[0.45em] uppercase mb-3">
                ◆ Secure Access Terminal ◆
              </p>
              <h1
                className="text-white font-black uppercase leading-none"
                style={{
                  fontSize: '2.6rem',
                  fontFamily: '"Arial Black", Impact, sans-serif',
                  textShadow: '0 0 24px rgba(34,197,94,0.35)',
                  letterSpacing: '-0.01em',
                }}
              >
                IMS
              </h1>
              <p className="text-slate-500 text-[9px] tracking-[0.3em] uppercase mt-1.5 font-mono">
                Rwanda Intelligence Management System
              </p>
              <div className="mt-3.5 inline-flex items-center gap-2 border border-red-900/50 bg-red-950/20 px-3.5 py-1">
                <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                <p className="text-[8px] font-bold tracking-[0.3em] text-red-500 uppercase font-mono">
                  Restricted · Authorized Personnel Only
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-[0.35em] text-green-600 mb-1.5 font-mono">
                  ▸ Badge Number
                </label>
                <input
                  type="text"
                  value={badge}
                  onChange={e => setBadge(e.target.value)}
                  placeholder="e.g. NISS-DIR-001"
                  className="w-full bg-black/70 border border-slate-800 text-white text-sm font-mono tracking-wider px-4 py-3 placeholder-slate-700 focus:outline-none focus:border-green-700 transition-colors"
                  autoComplete="username"
                  autoFocus
                  spellCheck={false}
                />
                <p className="text-[9px] text-slate-700 mt-1 font-mono tracking-wider">FORMAT: INST-ROLE-NNN</p>
              </div>

              <div>
                <label className="block text-[9px] font-bold uppercase tracking-[0.35em] text-green-600 mb-1.5 font-mono">
                  ▸ Password
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter secure password"
                    className="w-full bg-black/70 border border-slate-800 text-white text-sm px-4 py-3 pr-11 placeholder-slate-700 focus:outline-none focus:border-green-700 transition-colors"
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-700 hover:text-green-500 transition-colors"
                    tabIndex={-1}>
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="border border-red-900/50 bg-red-950/20 px-4 py-2.5 flex gap-2 items-start">
                  <span className="text-red-500 text-xs shrink-0 mt-0.5">⚠</span>
                  <p className="text-red-400 text-[11px] font-mono">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={clsx(
                  'w-full py-3.5 text-sm font-black uppercase tracking-[0.25em] transition-all flex items-center justify-center gap-2.5 mt-2',
                  loading
                    ? 'bg-green-950/60 text-green-800 cursor-not-allowed border border-green-900/40'
                    : 'bg-green-600 hover:bg-green-500 text-black border border-green-500 active:scale-[0.99]'
                )}
                style={loading ? {} : { boxShadow: '0 0 24px rgba(34,197,94,0.35)' }}
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-green-900 border-t-green-500 animate-spin" />
                    <span className="font-mono text-xs tracking-widest">Authenticating…</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="h-4 w-4" />
                    Authenticate
                  </>
                )}
              </button>
            </form>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-slate-900/80 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                <p className="text-[8px] text-slate-700 font-mono tracking-widest">SYSTEM ONLINE</p>
              </div>
              <p className="text-[8px] text-slate-800 font-mono tracking-wider">AES-256 · TLS 1.3</p>
              <LiveClock />
            </div>
          </div>

          <p className="text-center text-[8px] text-slate-800 font-mono mt-3 tracking-widest uppercase">
            All access is logged and cryptographically audited · Law No. 60/2018
          </p>
        </div>
      )}
    </div>
  )
}

function LiveClock() {
  const [t, setT] = useState('')
  useEffect(() => {
    const tick = () => setT(new Date().toLocaleTimeString('en-RW', { hour12: false }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return <p className="text-[8px] text-slate-800 font-mono tracking-wider">{t} CAT</p>
}

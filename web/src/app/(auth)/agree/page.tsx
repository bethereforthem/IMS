'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { policyApi, type PolicyDocument } from '@/lib/api'
import { Shield, CheckCircle2, FileText, Lock, MapPin, AlertTriangle, ChevronDown, Loader2 } from 'lucide-react'
import clsx from 'clsx'

// ── Simple Markdown renderer (no external deps) ───────────────────────────────

function renderMarkdown(md: string): string {
  return md
    // H1
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-white mt-6 mb-3 border-b border-slate-700 pb-2">$1</h1>')
    // H2
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold text-slate-200 mt-5 mb-2">$1</h2>')
    // H3
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-slate-300 mt-4 mb-1">$1</h3>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-slate-800 text-amber-400 px-1 rounded text-xs font-mono">$1</code>')
    // Bullet list items
    .replace(/^- (.+)$/gm, '<li class="flex gap-2 text-slate-300 text-sm leading-relaxed"><span class="text-slate-500 mt-1 shrink-0">•</span><span>$1</span></li>')
    // Numbered list items
    .replace(/^\d+\. (.+)$/gm, '<li class="text-slate-300 text-sm leading-relaxed ml-4 list-decimal">$1</li>')
    // Blank lines → paragraph breaks
    .replace(/\n{2,}/g, '</p><p class="text-slate-300 text-sm leading-relaxed my-2">')
    .replace(/\n/g, '<br />')
    // Wrap non-tagged lines in paragraphs
    .replace(/^(?!<[h|l|p])(.+)$/gm, '<p class="text-slate-300 text-sm leading-relaxed my-1">$1</p>')
}

// ── Policy type config ────────────────────────────────────────────────────────

type PolicyType = 'TERMS_OF_SERVICE' | 'PRIVACY_POLICY' | 'SECURITY_POLICY' | 'LOCATION_SHARING_POLICY'

const POLICY_CONFIG: Record<PolicyType, { label: string; icon: React.ElementType; color: string }> = {
  TERMS_OF_SERVICE:       { label: 'Terms of Service',     icon: FileText,     color: 'text-blue-400'   },
  PRIVACY_POLICY:         { label: 'Privacy Policy',       icon: Shield,       color: 'text-violet-400' },
  SECURITY_POLICY:        { label: 'Security Policy',      icon: Lock,         color: 'text-amber-400'  },
  LOCATION_SHARING_POLICY:{ label: 'Location Sharing',     icon: MapPin,       color: 'text-green-400'  },
}

const TYPE_ORDER: PolicyType[] = [
  'TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'SECURITY_POLICY', 'LOCATION_SHARING_POLICY'
]

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AgreePage() {
  const { user, loading: authLoading, logout } = useAuth()
  const router      = useRouter()
  const searchParams = useSearchParams()
  const nextPath    = searchParams.get('next') ?? '/'

  const [policies, setPolicies]     = useState<PolicyDocument[]>([])
  const [loadState, setLoadState]   = useState<'loading' | 'ready' | 'error'>('loading')
  const [activeTab, setActiveTab]   = useState<PolicyType>('TERMS_OF_SERVICE')
  const [scrolled, setScrolled]     = useState<Record<string, boolean>>({})
  const [checked, setChecked]       = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Load pending policies ──────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !user) return

    policyApi.getPending()
      .then(res => {
        if (res.data.all_accepted) {
          // Nothing pending — go straight to dashboard
          router.replace(decodeURIComponent(nextPath))
          return
        }
        // Sort by canonical order
        const sorted = res.data.pending.sort((a, b) =>
          TYPE_ORDER.indexOf(a.policy_type as PolicyType) -
          TYPE_ORDER.indexOf(b.policy_type as PolicyType)
        )
        setPolicies(sorted)
        if (sorted.length > 0) setActiveTab(sorted[0].policy_type as PolicyType)
        setLoadState('ready')
      })
      .catch(() => setLoadState('error'))
  }, [authLoading, user, nextPath, router])

  // ── Scroll detection ───────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 60
    if (nearBottom && !scrolled[activeTab]) {
      setScrolled(prev => ({ ...prev, [activeTab]: true }))
    }
  }, [activeTab, scrolled])

  // Reset scroll state when switching tabs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [activeTab])

  // ── Derived state ──────────────────────────────────────────────────────────
  const allScrolled = policies.every(p => scrolled[p.policy_type])
  const allChecked  = policies.every(p => checked[p.policy_type])
  const canSubmit   = allScrolled && allChecked && !submitting

  // ── Accept ─────────────────────────────────────────────────────────────────
  const handleAccept = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await policyApi.accept(policies.map(p => p.id))
      router.replace(decodeURIComponent(nextPath))
    } catch {
      setSubmitError('Failed to record your acceptance. Please try again.')
      setSubmitting(false)
    }
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!user) {
    router.replace('/login')
    return null
  }

  if (loadState === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto" />
          <p className="text-white font-semibold">Failed to load policies</p>
          <p className="text-slate-400 text-sm">Please refresh the page or contact your system administrator.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const activePolicy = policies.find(p => p.policy_type === activeTab)

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-white uppercase tracking-wider">RCIMS</p>
            <p className="text-[11px] text-slate-500">Rwanda Intelligence Management System</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-white font-medium">{user.full_name}</p>
            <p className="text-[11px] text-slate-500">{user.badge_number}</p>
          </div>
          <button
            onClick={() => logout()}
            className="text-xs text-slate-500 hover:text-slate-300 transition"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 py-8 gap-6">

        {/* Title block */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white">Review & Accept Policies</h1>
          <p className="text-slate-400 text-sm max-w-xl mx-auto">
            Before accessing the system, you must read and accept all {policies.length} policy documents below.
            Scroll to the bottom of each policy to unlock the acceptance checkbox.
          </p>
        </div>

        {/* Progress indicators */}
        <div className="flex gap-2 flex-wrap justify-center">
          {policies.map(p => {
            const cfg  = POLICY_CONFIG[p.policy_type as PolicyType]
            const Icon = cfg.icon
            const isScrolled = scrolled[p.policy_type]
            const isChecked  = checked[p.policy_type]
            return (
              <div
                key={p.policy_type}
                className={clsx(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                  isChecked
                    ? 'bg-green-950/60 border-green-800 text-green-400'
                    : isScrolled
                    ? 'bg-amber-950/40 border-amber-800/50 text-amber-400'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400'
                )}
              >
                {isChecked
                  ? <CheckCircle2 className="h-3 w-3" />
                  : <Icon className="h-3 w-3" />
                }
                {cfg.label}
              </div>
            )
          })}
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 border-b border-slate-800 overflow-x-auto shrink-0">
          {policies.map((p, i) => {
            const cfg    = POLICY_CONFIG[p.policy_type as PolicyType]
            const Icon   = cfg.icon
            const active = activeTab === p.policy_type
            const done   = checked[p.policy_type]
            return (
              <button
                key={p.policy_type}
                onClick={() => setActiveTab(p.policy_type as PolicyType)}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                  active
                    ? 'border-brand-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                )}
              >
                <span className={clsx(
                  'flex items-center justify-center h-5 w-5 rounded-full text-xs font-bold shrink-0',
                  done ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'
                )}>
                  {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
                </span>
                <Icon className={clsx('h-3.5 w-3.5', cfg.color)} />
                <span className="hidden sm:inline">{cfg.label}</span>
              </button>
            )
          })}
        </div>

        {/* Policy content */}
        {activePolicy && (
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            {/* Policy header */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-white">{activePolicy.title}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Version {activePolicy.version} · Effective {activePolicy.effective_date}
                  </p>
                  <p className="text-sm text-slate-400 mt-2 leading-relaxed">{activePolicy.summary}</p>
                </div>
                <div className="shrink-0 hidden sm:block">
                  {(() => {
                    const cfg = POLICY_CONFIG[activePolicy.policy_type as PolicyType]
                    const Icon = cfg.icon
                    return <Icon className={clsx('h-6 w-6', cfg.color)} />
                  })()}
                </div>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="relative flex-1 min-h-0">
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="h-[380px] overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/50 p-6 scroll-smooth"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 transparent' }}
              >
                <div
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(activePolicy.content) }}
                  className="policy-content"
                />
                <div className="h-8" />
              </div>

              {/* Scroll hint overlay — fades out once scrolled to bottom */}
              {!scrolled[activePolicy.policy_type] && (
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-950 to-transparent rounded-b-xl pointer-events-none flex items-end justify-center pb-2">
                  <div className="flex items-center gap-1 text-xs text-slate-500 animate-bounce">
                    <ChevronDown className="h-3 w-3" />
                    Scroll to read
                  </div>
                </div>
              )}
            </div>

            {/* Checkbox */}
            <div className={clsx(
              'rounded-xl border p-4 transition-all',
              scrolled[activePolicy.policy_type]
                ? 'bg-slate-900 border-slate-700'
                : 'bg-slate-900/40 border-slate-800 opacity-50 pointer-events-none'
            )}>
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className={clsx(
                  'mt-0.5 h-5 w-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors',
                  checked[activePolicy.policy_type]
                    ? 'bg-green-600 border-green-600'
                    : 'border-slate-600 group-hover:border-slate-400 bg-transparent'
                )}>
                  {checked[activePolicy.policy_type] && (
                    <CheckCircle2 className="h-3 w-3 text-white" />
                  )}
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked[activePolicy.policy_type] ?? false}
                  onChange={e => setChecked(prev => ({ ...prev, [activePolicy.policy_type]: e.target.checked }))}
                  disabled={!scrolled[activePolicy.policy_type]}
                />
                <div>
                  <p className="text-sm text-white font-medium">
                    I have read and understand the {POLICY_CONFIG[activePolicy.policy_type as PolicyType].label}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    I acknowledge that this policy governs my use of RCIMS as an authorized officer of {user.institution}.
                  </p>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Final acceptance section */}
        <div className={clsx(
          'rounded-xl border p-5 transition-all',
          allChecked && allScrolled
            ? 'bg-green-950/30 border-green-800/60'
            : 'bg-slate-900/50 border-slate-800'
        )}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">
                {allChecked && allScrolled
                  ? 'Ready to accept all policies'
                  : `${Object.values(checked).filter(Boolean).length} of ${policies.length} policies acknowledged`}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {allChecked && allScrolled
                  ? 'Your acceptance will be recorded with your badge number, IP address, device, and GPS location for audit purposes.'
                  : 'Read and acknowledge all policies above to proceed.'}
              </p>
              {submitError && (
                <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {submitError}
                </p>
              )}
            </div>
            <button
              onClick={handleAccept}
              disabled={!canSubmit}
              className={clsx(
                'shrink-0 flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all',
                canSubmit
                  ? 'bg-green-700 hover:bg-green-600 text-white shadow-lg shadow-green-900/30'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              )}
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Accepting...</>
                : <><CheckCircle2 className="h-4 w-4" /> I Accept All Policies</>
              }
            </button>
          </div>

          {/* Mini checklist summary */}
          {policies.length > 1 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {policies.map(p => {
                const cfg  = POLICY_CONFIG[p.policy_type as PolicyType]
                const Icon = cfg.icon
                return (
                  <div
                    key={p.policy_type}
                    className={clsx(
                      'flex items-center gap-2 text-xs rounded-lg px-3 py-1.5',
                      checked[p.policy_type]
                        ? 'bg-green-950/40 text-green-400'
                        : 'bg-slate-800/50 text-slate-500'
                    )}
                  >
                    {checked[p.policy_type]
                      ? <CheckCircle2 className="h-3 w-3 shrink-0" />
                      : <Icon className="h-3 w-3 shrink-0" />
                    }
                    {cfg.label}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </main>
    </div>
  )
}

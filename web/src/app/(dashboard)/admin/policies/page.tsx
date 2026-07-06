'use client'
import { useState, useEffect, useCallback } from 'react'
import { adminPolicyApi, type PolicyDocument } from '@/lib/api'
import {
  FileText, Shield, Lock, MapPin, Plus, Edit3, CheckCircle2,
  ChevronDown, ChevronRight, Users, AlertTriangle, Loader2, X, Save
} from 'lucide-react'
import clsx from 'clsx'

// ── Config ────────────────────────────────────────────────────────────────────

type PolicyType = 'TERMS_OF_SERVICE' | 'PRIVACY_POLICY' | 'SECURITY_POLICY' | 'LOCATION_SHARING_POLICY'

const TYPE_CONFIG: Record<PolicyType, { label: string; icon: React.ElementType; color: string }> = {
  TERMS_OF_SERVICE:        { label: 'Terms of Service',  icon: FileText, color: 'text-blue-400'   },
  PRIVACY_POLICY:          { label: 'Privacy Policy',    icon: Shield,   color: 'text-violet-400' },
  SECURITY_POLICY:         { label: 'Security Policy',   icon: Lock,     color: 'text-amber-400'  },
  LOCATION_SHARING_POLICY: { label: 'Location Sharing',  icon: MapPin,   color: 'text-green-400'  },
}

const POLICY_TYPES: PolicyType[] = [
  'TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'SECURITY_POLICY', 'LOCATION_SHARING_POLICY'
]

// ── Policy editor modal ───────────────────────────────────────────────────────

interface EditorProps {
  mode:         'create' | 'edit'
  policyType?:  PolicyType
  existing?:    PolicyDocument
  onClose:      () => void
  onSaved:      () => void
}

function PolicyEditor({ mode, policyType, existing, onClose, onSaved }: EditorProps) {
  const [form, setForm] = useState({
    policy_type:    policyType ?? existing?.policy_type ?? 'TERMS_OF_SERVICE',
    title:          existing?.title ?? '',
    summary:        existing?.summary ?? '',
    content:        existing?.content ?? '',
    effective_date: existing?.effective_date ?? new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving]   = useState(false)
  const [error,  setError]    = useState('')
  const [tab,    setTab]      = useState<'edit' | 'preview'>('edit')

  const handleSave = async () => {
    if (!form.title.trim() || !form.summary.trim() || !form.content.trim()) {
      setError('Title, summary, and content are required')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (mode === 'create') {
        await adminPolicyApi.create(form)
      } else if (existing) {
        await adminPolicyApi.update(existing.id, {
          title:          form.title,
          summary:        form.summary,
          content:        form.content,
          effective_date: form.effective_date,
        })
      }
      onSaved()
      onClose()
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">
              {mode === 'create' ? 'Create New Policy Version' : 'Edit Policy'}
            </h2>
            {mode === 'create' && (
              <p className="text-xs text-amber-400 mt-0.5">
                Creating a new version will require all users to re-accept this policy.
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {mode === 'create' && (
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Policy Type</label>
              <select
                value={form.policy_type}
                onChange={e => setForm(f => ({ ...f, policy_type: e.target.value as PolicyType }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {POLICY_TYPES.map(t => (
                  <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Title</label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Terms of Service — Rwanda Intelligence Management System"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Summary <span className="text-slate-600">(shown in the tab header on the agreement page)</span></label>
            <textarea
              value={form.summary}
              onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              rows={2}
              placeholder="One or two sentence plain-text summary..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Effective Date</label>
            <input
              type="date"
              value={form.effective_date}
              onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <label className="text-xs text-slate-400">Content</label>
              <div className="flex gap-1 ml-auto">
                <button
                  onClick={() => setTab('edit')}
                  className={clsx('px-2 py-0.5 text-xs rounded', tab === 'edit' ? 'bg-brand-700 text-white' : 'text-slate-400 hover:text-white')}
                >
                  Markdown
                </button>
                <button
                  onClick={() => setTab('preview')}
                  className={clsx('px-2 py-0.5 text-xs rounded', tab === 'preview' ? 'bg-brand-700 text-white' : 'text-slate-400 hover:text-white')}
                >
                  Preview
                </button>
              </div>
            </div>

            {tab === 'edit' ? (
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={16}
                placeholder="# Policy Title&#10;&#10;## Section 1&#10;&#10;Policy content in Markdown..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y font-mono"
              />
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 h-64 overflow-y-auto text-sm text-slate-300 prose prose-invert">
                {form.content
                  ? <div dangerouslySetInnerHTML={{
                      __html: form.content
                        .replace(/^# (.+)$/gm, '<h1 style="font-size:1.1rem;font-weight:700;color:white;margin:1rem 0 0.5rem">$1</h1>')
                        .replace(/^## (.+)$/gm, '<h2 style="font-size:0.95rem;font-weight:600;color:#cbd5e1;margin:0.75rem 0 0.25rem">$1</h2>')
                        .replace(/\*\*(.+?)\*\*/g, '<strong style="color:white">$1</strong>')
                        .replace(/^- (.+)$/gm, '<li style="margin-left:1rem;list-style:disc;color:#94a3b8">$1</li>')
                        .replace(/\n{2,}/g, '<br/><br/>')
                        .replace(/\n/g, '<br/>')
                    }} />
                  : <p className="text-slate-500 italic">Start typing policy content to preview it here.</p>
                }
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-brand-700 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {mode === 'create' ? 'Publish New Version' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Policy card ───────────────────────────────────────────────────────────────

interface PolicyCardProps {
  policies: PolicyDocument[]
  type: PolicyType
  onEdit: (p: PolicyDocument) => void
  onCreate: (type: PolicyType) => void
}

function PolicyTypeCard({ policies, type, onEdit, onCreate }: PolicyCardProps) {
  const cfg     = TYPE_CONFIG[type]
  const Icon    = cfg.icon
  const active  = policies.find(p => p.is_active)
  const history = policies.filter(p => !p.is_active).slice(0, 5)
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
        <div className={clsx('h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center', cfg.color)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{cfg.label}</p>
          {active && (
            <p className="text-xs text-slate-400">
              v{active.version} · Effective {active.effective_date}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {active && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full">
              <Users className="h-3 w-3" />
              {active.acceptance_count ?? 0} accepted
            </div>
          )}
          <span className={clsx(
            'text-xs px-2 py-0.5 rounded-full font-medium',
            active ? 'bg-green-950 text-green-400' : 'bg-slate-800 text-slate-500'
          )}>
            {active ? 'Active' : 'No Active Version'}
          </span>
        </div>
      </div>

      {/* Active version */}
      {active ? (
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate">{active.title}</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">{active.summary}</p>
            </div>
            <button
              onClick={() => onEdit(active)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 hover:text-white transition"
            >
              <Edit3 className="h-3 w-3" />
              Edit
            </button>
          </div>
        </div>
      ) : (
        <div className="px-5 py-4 flex items-center gap-2 text-sm text-slate-500">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          No active policy version. Users will not be prompted to accept this policy type.
        </div>
      )}

      {/* Actions footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-slate-950/30">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition"
          disabled={history.length === 0}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {history.length} older version{history.length !== 1 ? 's' : ''}
        </button>
        <button
          onClick={() => onCreate(type)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-800/60 hover:bg-brand-700/80 text-brand-300 rounded-lg text-xs font-medium transition"
        >
          <Plus className="h-3 w-3" />
          New Version
        </button>
      </div>

      {/* Version history */}
      {expanded && history.length > 0 && (
        <div className="border-t border-slate-800 divide-y divide-slate-800">
          {history.map(p => (
            <div key={p.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-xs text-slate-400">
                  v{p.version} · {p.effective_date}
                  <span className="ml-2 text-slate-600">— {p.acceptance_count ?? 0} acceptances</span>
                </p>
                <p className="text-xs text-slate-500 truncate max-w-sm">{p.title}</p>
              </div>
              <span className="text-[10px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">
                Superseded
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPoliciesPage() {
  const [policies,   setPolicies]   = useState<PolicyDocument[]>([])
  const [loadState,  setLoadState]  = useState<'loading' | 'ready' | 'error'>('loading')
  const [editor,     setEditor]     = useState<{ mode: 'create' | 'edit'; type?: PolicyType; policy?: PolicyDocument } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await adminPolicyApi.list()
      setPolicies(res.data.policies)
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const groupedByType = POLICY_TYPES.reduce<Record<PolicyType, PolicyDocument[]>>((acc, type) => {
    acc[type] = policies.filter(p => p.policy_type === type).sort((a, b) => b.version - a.version)
    return acc
  }, {} as Record<PolicyType, PolicyDocument[]>)

  const activeCount    = policies.filter(p => p.is_active).length
  const totalAccepted  = policies.reduce((sum, p) => sum + (p.acceptance_count ?? 0), 0)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Policy Management</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Manage Terms of Service, Privacy, Security, and Location Sharing policies.
            Publishing a new version requires all users to re-accept.
          </p>
        </div>
        <button
          onClick={() => setEditor({ mode: 'create' })}
          className="flex items-center gap-2 px-4 py-2 bg-brand-700 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition"
        >
          <Plus className="h-4 w-4" />
          New Policy Version
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Active Policies', value: activeCount, of: POLICY_TYPES.length, icon: CheckCircle2, color: 'text-green-400' },
          { label: 'Total Versions', value: policies.length, icon: FileText, color: 'text-blue-400' },
          { label: 'Total Acceptances', value: totalAccepted, icon: Users, color: 'text-violet-400' },
          {
            label: 'Pending Users',
            value: '—',
            icon: AlertTriangle,
            color: 'text-amber-400',
            note: 'check audit log'
          },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <s.icon className={clsx('h-4 w-4 mb-2', s.color)} />
            <p className="text-xl font-bold text-white">
              {s.value}
              {'of' in s ? <span className="text-slate-500 text-sm font-normal"> / {s.of}</span> : null}
            </p>
            <p className="text-xs text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Loading / Error */}
      {loadState === 'loading' && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      )}

      {loadState === 'error' && (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <p className="text-sm">Failed to load policies.</p>
          <button onClick={load} className="text-xs text-brand-400 hover:underline">Retry</button>
        </div>
      )}

      {/* Policy cards */}
      {loadState === 'ready' && (
        <div className="space-y-4">
          {POLICY_TYPES.map(type => (
            <PolicyTypeCard
              key={type}
              type={type}
              policies={groupedByType[type]}
              onEdit={p => setEditor({ mode: 'edit', type, policy: p })}
              onCreate={t => setEditor({ mode: 'create', type: t })}
            />
          ))}
        </div>
      )}

      {/* Editor modal */}
      {editor && (
        <PolicyEditor
          mode={editor.mode}
          policyType={editor.type}
          existing={editor.policy}
          onClose={() => setEditor(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

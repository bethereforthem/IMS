'use client'
import { useState } from 'react'
import { X, UserPlus, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { suspectsApi } from '@/lib/api'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

const INPUT = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none'
const SELECT = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none'

export function AddSuspectModal({ onClose, onSuccess }: Props) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    status: 'ACTIVE',
    threat_level: '3',
    nationality: 'RWA',
    clearance_level: 'CONFIDENTIAL',
    owning_institution: user?.institution ?? 'NISS',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.first_name.trim() || !form.last_name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await suspectsApi.create({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        status: form.status,
        threat_level: parseInt(form.threat_level),
        nationality: form.nationality.trim().toUpperCase() || 'RWA',
        clearance_level: form.clearance_level,
        owning_institution: form.owning_institution,
        notes: form.notes.trim() || undefined,
      })
      onSuccess()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message ?? 'Failed to add suspect.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-violet-400" />
            <h2 className="text-sm font-bold text-white">Add Suspect</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">First Name *</label>
              <input value={form.first_name} onChange={e => set('first_name', e.target.value)}
                className={INPUT} placeholder="First name" required />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Last Name *</label>
              <input value={form.last_name} onChange={e => set('last_name', e.target.value)}
                className={INPUT} placeholder="Last name" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={SELECT}>
                {['ACTIVE', 'WANTED', 'ARRESTED', 'IN_CUSTODY', 'INTERPOL_FLAGGED'].map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Threat Level</label>
              <select value={form.threat_level} onChange={e => set('threat_level', e.target.value)} className={SELECT}>
                <option value="1">1 — Minimal</option>
                <option value="2">2 — Low</option>
                <option value="3">3 — Medium</option>
                <option value="4">4 — High</option>
                <option value="5">5 — Critical</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Clearance Level</label>
              <select value={form.clearance_level} onChange={e => set('clearance_level', e.target.value)} className={SELECT}>
                {['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'].map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nationality (ISO 3)</label>
              <input value={form.nationality} onChange={e => set('nationality', e.target.value)}
                maxLength={3} className={INPUT} placeholder="RWA" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Owning Institution</label>
            <select value={form.owning_institution} onChange={e => set('owning_institution', e.target.value)} className={SELECT}>
              {['NISS', 'RNP', 'RIB', 'RDF', 'RCS'].map(i => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Intelligence Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={3} className={`${INPUT} resize-none`} placeholder="Known activities, associates, description..." />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50 transition">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Suspect
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

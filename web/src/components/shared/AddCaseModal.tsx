'use client'
import { useState } from 'react'
import { X, FolderPlus, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { casesApi } from '@/lib/api'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

const INPUT = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none'
const SELECT = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none'

export function AddCaseModal({ onClose, onSuccess }: Props) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    title: '',
    category: 'OTHER',
    status: 'OPEN',
    clearance_level: 'CONFIDENTIAL',
    lead_institution: user?.institution ?? 'RIB',
    summary: '',
    incident_date: '',
    location_name: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await casesApi.create({
        title: form.title.trim(),
        category: form.category,
        status: form.status,
        clearance_level: form.clearance_level,
        lead_institution: form.lead_institution,
        summary: form.summary.trim() || undefined,
        incident_date: form.incident_date || undefined,
        location_name: form.location_name.trim() || undefined,
      })
      onSuccess()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message ?? 'Failed to create case.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-teal-400" />
            <h2 className="text-sm font-bold text-white">Open New Case</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Case Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              className={INPUT} placeholder="e.g. Kigali CBD Armed Robbery Series" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} className={SELECT}>
                {['ARMED_ROBBERY', 'FRAUD', 'DRUG_TRAFFICKING', 'HOMICIDE', 'CORRUPTION',
                  'HUMAN_TRAFFICKING', 'CYBERCRIME', 'TERRORISM', 'BORDER_VIOLATION', 'OTHER'].map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={SELECT}>
                <option value="OPEN">OPEN</option>
                <option value="UNDER_INVESTIGATION">UNDER INVESTIGATION</option>
                <option value="PROSECUTION">PROSECUTION</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Lead Institution</label>
              <select value={form.lead_institution} onChange={e => set('lead_institution', e.target.value)} className={SELECT}>
                {['NISS', 'RNP', 'RIB', 'RDF', 'RCS'].map(i => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Clearance Level</label>
              <select value={form.clearance_level} onChange={e => set('clearance_level', e.target.value)} className={SELECT}>
                {['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'].map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Incident Date</label>
              <input type="date" value={form.incident_date} onChange={e => set('incident_date', e.target.value)}
                className={INPUT} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Location</label>
              <input value={form.location_name} onChange={e => set('location_name', e.target.value)}
                className={INPUT} placeholder="e.g. Nyabugogo, Kigali" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Summary</label>
            <textarea value={form.summary} onChange={e => set('summary', e.target.value)}
              rows={3} className={`${INPUT} resize-none`} placeholder="Case summary and initial intelligence..." />
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
              className="flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50 transition">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Open Case
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

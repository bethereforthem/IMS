'use client'
import { useState, useRef } from 'react'
import { X, Shield, Loader2, Search } from 'lucide-react'
import { correctionsApi, suspectsApi } from '@/lib/api'
import type { Suspect } from '@/types'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

const INPUT = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none'
const SELECT = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none'

export function AddCorrectionModal({ onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    facility_name: '',
    cell_block: '',
    custody_status: 'PRE_TRIAL',
    intake_date: new Date().toISOString().split('T')[0],
    sentence_years: '',
    court_name: '',
    offense_description: '',
    next_review: '',
    threat_level: '3',
  })
  const [suspect, setSuspect] = useState<Suspect | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Suspect[]>([])
  const [searching, setSearching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleSearchChange(val: string) {
    setSearch(val)
    setSuspect(null)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (val.trim().length < 2) { setSearchResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await suspectsApi.list({ name: val.trim(), limit: 5 })
        setSearchResults(r.data?.suspects ?? [])
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 400)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!suspect || !form.facility_name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await correctionsApi.create({
        suspect_id: suspect.id,
        facility_name: form.facility_name.trim(),
        cell_block: form.cell_block.trim() || undefined,
        custody_status: form.custody_status,
        intake_date: form.intake_date || undefined,
        sentence_years: form.sentence_years ? parseInt(form.sentence_years) : undefined,
        court_name: form.court_name.trim() || undefined,
        offense_description: form.offense_description.trim() || undefined,
        next_review: form.next_review || undefined,
        threat_level: parseInt(form.threat_level),
      })
      onSuccess()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message ?? 'Failed to create custody record.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 sticky top-0 bg-slate-900">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Intake — New Inmate</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Suspect search */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Suspect (IMS Record) *</label>
            {suspect ? (
              <div className="flex items-center justify-between rounded-lg border border-amber-700 bg-amber-950/20 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-white">{suspect.full_name}</p>
                  <p className="text-[10px] text-slate-400">{suspect.ims_reference} · {suspect.status}</p>
                </div>
                <button type="button" onClick={() => { setSuspect(null); setSearch('') }}
                  className="text-slate-500 hover:text-slate-300">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input value={search} onChange={e => handleSearchChange(e.target.value)}
                  className={`${INPUT} pl-9`} placeholder="Search by name in IMS..." />
                {(searchResults.length > 0 || searching) && (
                  <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg border border-slate-700 bg-slate-800 shadow-xl overflow-hidden">
                    {searching && <p className="text-xs text-slate-400 px-3 py-2">Searching...</p>}
                    {searchResults.map(s => (
                      <button key={s.id} type="button"
                        onClick={() => { setSuspect(s); setSearch(''); setSearchResults([]) }}
                        className="w-full text-left px-3 py-2.5 hover:bg-slate-700 transition border-b border-slate-700/50 last:border-0">
                        <p className="text-sm text-white font-medium">{s.full_name}</p>
                        <p className="text-[10px] text-slate-400">{s.ims_reference} · {s.status}</p>
                      </button>
                    ))}
                    {!searching && searchResults.length === 0 && (
                      <p className="text-xs text-slate-500 px-3 py-2">No suspects found</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Facility *</label>
              <select value={form.facility_name} onChange={e => set('facility_name', e.target.value)} className={SELECT} required>
                <option value="">Select facility...</option>
                <option value="Mageragere">Mageragere Prison</option>
                <option value="Nyarugenge">Nyarugenge Prison</option>
                <option value="Mpanga">Mpanga Central Prison</option>
                <option value="Nyagatare">Nyagatare Prison</option>
                <option value="Rwamagana">Rwamagana Prison</option>
                <option value="Huye">Huye Prison</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Cell Block</label>
              <input value={form.cell_block} onChange={e => set('cell_block', e.target.value)}
                className={INPUT} placeholder="e.g. B-3" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Custody Status</label>
              <select value={form.custody_status} onChange={e => set('custody_status', e.target.value)} className={SELECT}>
                <option value="PRE_TRIAL">PRE TRIAL</option>
                <option value="SENTENCED">SENTENCED</option>
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
              <label className="block text-xs text-slate-400 mb-1">Intake Date</label>
              <input type="date" value={form.intake_date} onChange={e => set('intake_date', e.target.value)}
                className={INPUT} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Next Review Date</label>
              <input type="date" value={form.next_review} onChange={e => set('next_review', e.target.value)}
                className={INPUT} />
            </div>
          </div>

          {form.custody_status === 'SENTENCED' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Sentence (years)</label>
                <input type="number" min="1" max="99" value={form.sentence_years}
                  onChange={e => set('sentence_years', e.target.value)}
                  className={INPUT} placeholder="e.g. 15" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Court Name</label>
                <input value={form.court_name} onChange={e => set('court_name', e.target.value)}
                  className={INPUT} placeholder="e.g. Kigali High Court" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-400 mb-1">Offense Description</label>
            <textarea value={form.offense_description} onChange={e => set('offense_description', e.target.value)}
              rows={2} className={`${INPUT} resize-none`} placeholder="Brief description of offense..." />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !suspect || !form.facility_name}
              className="flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 transition">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Record Intake
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

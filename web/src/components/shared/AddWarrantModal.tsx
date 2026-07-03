'use client'
import { useState, useRef } from 'react'
import { X, FileText, Loader2, Search } from 'lucide-react'
import { warrantsApi, suspectsApi } from '@/lib/api'
import type { Suspect } from '@/types'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

const INPUT = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none'
const SELECT = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none'

export function AddWarrantModal({ onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    charges: '',
    warrant_type: 'ARREST',
    priority: 'HIGH',
    issued_by_court: '',
    case_reference: '',
    expires_at: '',
    notes: '',
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
    if (!suspect || !form.charges.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await warrantsApi.create({
        suspect_id: suspect.id,
        charges: form.charges.trim(),
        warrant_type: form.warrant_type,
        priority: form.priority,
        issued_by_court: form.issued_by_court.trim() || undefined,
        case_reference: form.case_reference.trim() || undefined,
        expires_at: form.expires_at || undefined,
        notes: form.notes.trim() || undefined,
      })
      onSuccess()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message ?? 'Failed to issue warrant.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-400" />
            <h2 className="text-sm font-bold text-white">Issue Arrest Warrant</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Suspect search */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Suspect *</label>
            {suspect ? (
              <div className="flex items-center justify-between rounded-lg border border-blue-700 bg-blue-950/20 px-3 py-2">
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
                  className={`${INPUT} pl-9`} placeholder="Search suspect by name..." />
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

          <div>
            <label className="block text-xs text-slate-400 mb-1">Charges *</label>
            <input value={form.charges} onChange={e => set('charges', e.target.value)}
              className={INPUT} placeholder="e.g. Armed Robbery, Drug Trafficking" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Warrant Type</label>
              <select value={form.warrant_type} onChange={e => set('warrant_type', e.target.value)} className={SELECT}>
                <option value="ARREST">ARREST</option>
                <option value="SEARCH">SEARCH</option>
                <option value="EXTRADITION">EXTRADITION</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Priority</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} className={SELECT}>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Issuing Court</label>
              <input value={form.issued_by_court} onChange={e => set('issued_by_court', e.target.value)}
                className={INPUT} placeholder="e.g. Kigali High Court" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Expiry Date</label>
              <input type="date" value={form.expires_at} onChange={e => set('expires_at', e.target.value)}
                className={INPUT} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Case Reference</label>
            <input value={form.case_reference} onChange={e => set('case_reference', e.target.value)}
              className={INPUT} placeholder="e.g. RWA-RNP-2026-00041" />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} className={`${INPUT} resize-none`} placeholder="Additional notes..." />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !suspect}
              className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Issue Warrant
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

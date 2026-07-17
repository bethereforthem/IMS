'use client'
import { useState, useRef } from 'react'
import { X, Shield, Loader2, Search, User, Building2, Gavel } from 'lucide-react'
import { correctionsApi, suspectsApi } from '@/lib/api'
import type { Suspect } from '@/types'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

const INPUT = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none'
const SELECT = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none'
const LABEL = 'block text-xs text-slate-400 mb-1'

type Tab = 'personal' | 'custody' | 'court'

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: 'personal', label: 'Personal Info', icon: User },
  { id: 'custody',  label: 'Custody & Facility', icon: Building2 },
  { id: 'court',    label: 'Court Conclusion', icon: Gavel },
]

export function AddCorrectionModal({ onClose, onSuccess }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('personal')

  const [form, setForm] = useState({
    // Personal
    full_name: '',
    father_name: '',
    mother_name: '',
    sex: '',
    date_of_birth: '',
    place_of_birth: '',
    nationality: '',
    national_id: '',
    party_status: '',
    marital_status: '',
    profession: '',
    education_level: '',
    children_count: '',
    health_status: '',
    properties_owned: '',
    residential_address: '',
    domicile_address: '',
    phone_number: '',
    email: '',
    alternative_contact: '',
    passport_photo_url: '',
    // Custody
    facility_name: '',
    cell_block: '',
    custody_status: 'PRE_TRIAL',
    intake_date: new Date().toISOString().split('T')[0],
    next_review: '',
    threat_level: '3',
    // Court
    court_name: '',
    presiding_judge: '',
    verdict_date: '',
    sentence_type: '',
    sentence_years: '',
    offense_description: '',
    court_conclusion: '',
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

  function selectSuspect(s: Suspect) {
    setSuspect(s)
    setSearch('')
    setSearchResults([])
    setForm(prev => ({
      ...prev,
      full_name: s.full_name ?? prev.full_name,
      nationality: s.nationality ?? prev.nationality,
      date_of_birth: s.date_of_birth ? s.date_of_birth.split('T')[0] : prev.date_of_birth,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!suspect || !form.facility_name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await correctionsApi.create({
        suspect_id: suspect.id,
        // Custody
        facility_name: form.facility_name.trim(),
        cell_block: form.cell_block.trim() || undefined,
        custody_status: form.custody_status,
        intake_date: form.intake_date || undefined,
        next_review: form.next_review || undefined,
        threat_level: parseInt(form.threat_level),
        // Personal
        father_name: form.father_name.trim() || undefined,
        mother_name: form.mother_name.trim() || undefined,
        sex: form.sex || undefined,
        place_of_birth: form.place_of_birth.trim() || undefined,
        nationality: form.nationality.trim() || undefined,
        national_id: form.national_id.trim() || undefined,
        party_status: form.party_status.trim() || undefined,
        marital_status: form.marital_status || undefined,
        profession: form.profession.trim() || undefined,
        education_level: form.education_level || undefined,
        children_count: form.children_count ? parseInt(form.children_count) : undefined,
        health_status: form.health_status.trim() || undefined,
        properties_owned: form.properties_owned.trim() || undefined,
        residential_address: form.residential_address.trim() || undefined,
        domicile_address: form.domicile_address.trim() || undefined,
        phone_number: form.phone_number.trim() || undefined,
        email: form.email.trim() || undefined,
        alternative_contact: form.alternative_contact.trim() || undefined,
        passport_photo_url: form.passport_photo_url.trim() || undefined,
        // Court
        court_name: form.court_name.trim() || undefined,
        presiding_judge: form.presiding_judge.trim() || undefined,
        verdict_date: form.verdict_date || undefined,
        sentence_type: form.sentence_type || undefined,
        sentence_years: form.sentence_years ? parseInt(form.sentence_years) : undefined,
        offense_description: form.offense_description.trim() || undefined,
        court_conclusion: form.court_conclusion.trim() || undefined,
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
      <div className="w-full max-w-3xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Intake — New Inmate</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* IMS Link — always visible */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-800 shrink-0">
          <label className={LABEL}>IMS Suspect Record *</label>
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
                      onClick={() => selectSuspect(s)}
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

        {/* Tabs */}
        <div className="flex border-b border-slate-800 shrink-0">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-5 py-3 text-xs font-medium transition border-b-2 ${
                  activeTab === tab.id
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}>
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">

            {/* ── PERSONAL INFO ─────────────────────────────────────── */}
            {activeTab === 'personal' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Full Name</label>
                    <input value={form.full_name} onChange={e => set('full_name', e.target.value)}
                      className={INPUT} placeholder="As on national ID" />
                  </div>
                  <div>
                    <label className={LABEL}>Party Status</label>
                    <select value={form.party_status} onChange={e => set('party_status', e.target.value)} className={SELECT}>
                      <option value="">Select...</option>
                      <option value="Principal Accused">Principal Accused</option>
                      <option value="Co-Accused">Co-Accused</option>
                      <option value="Defendant">Defendant</option>
                      <option value="Accused">Accused</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Father's Name</label>
                    <input value={form.father_name} onChange={e => set('father_name', e.target.value)}
                      className={INPUT} placeholder="Father's full name" />
                  </div>
                  <div>
                    <label className={LABEL}>Mother's Name</label>
                    <input value={form.mother_name} onChange={e => set('mother_name', e.target.value)}
                      className={INPUT} placeholder="Mother's full name" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={LABEL}>Date of Birth</label>
                    <input type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)}
                      className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>Sex</label>
                    <select value={form.sex} onChange={e => set('sex', e.target.value)} className={SELECT}>
                      <option value="">Select...</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Place of Birth</label>
                    <input value={form.place_of_birth} onChange={e => set('place_of_birth', e.target.value)}
                      className={INPUT} placeholder="District / Country" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Nationality</label>
                    <input value={form.nationality} onChange={e => set('nationality', e.target.value)}
                      className={INPUT} placeholder="e.g. Rwandan" />
                  </div>
                  <div>
                    <label className={LABEL}>National ID / Passport Number</label>
                    <input value={form.national_id} onChange={e => set('national_id', e.target.value)}
                      className={INPUT} placeholder="ID or Passport number" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Marital Status</label>
                    <select value={form.marital_status} onChange={e => set('marital_status', e.target.value)} className={SELECT}>
                      <option value="">Select...</option>
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                      <option value="Divorced">Divorced</option>
                      <option value="Widowed">Widowed</option>
                      <option value="Separated">Separated</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Number of Children</label>
                    <input type="number" min="0" value={form.children_count}
                      onChange={e => set('children_count', e.target.value)}
                      className={INPUT} placeholder="0" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Profession / Occupation</label>
                    <input value={form.profession} onChange={e => set('profession', e.target.value)}
                      className={INPUT} placeholder="e.g. Teacher, Farmer" />
                  </div>
                  <div>
                    <label className={LABEL}>Education Level</label>
                    <select value={form.education_level} onChange={e => set('education_level', e.target.value)} className={SELECT}>
                      <option value="">Select...</option>
                      <option value="None">None</option>
                      <option value="Primary">Primary</option>
                      <option value="Secondary (O-Level)">Secondary (O-Level)</option>
                      <option value="Secondary (A-Level)">Secondary (A-Level)</option>
                      <option value="Technical / Vocational">Technical / Vocational</option>
                      <option value="Bachelor's Degree">Bachelor's Degree</option>
                      <option value="Master's Degree">Master's Degree</option>
                      <option value="Doctorate">Doctorate</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={LABEL}>Residential Address</label>
                  <input value={form.residential_address} onChange={e => set('residential_address', e.target.value)}
                    className={INPUT} placeholder="Current residential address" />
                </div>

                <div>
                  <label className={LABEL}>Domicile Address</label>
                  <input value={form.domicile_address} onChange={e => set('domicile_address', e.target.value)}
                    className={INPUT} placeholder="Permanent / home village address" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Telephone Number</label>
                    <input value={form.phone_number} onChange={e => set('phone_number', e.target.value)}
                      className={INPUT} placeholder="+250 7XX XXX XXX" />
                  </div>
                  <div>
                    <label className={LABEL}>Email Address</label>
                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                      className={INPUT} placeholder="email@example.com" />
                  </div>
                </div>

                <div>
                  <label className={LABEL}>Alternative Contact Information</label>
                  <textarea value={form.alternative_contact} onChange={e => set('alternative_contact', e.target.value)}
                    rows={2} className={`${INPUT} resize-none`}
                    placeholder="Name, relationship, phone number of emergency contact..." />
                </div>

                <div>
                  <label className={LABEL}>Properties / Assets</label>
                  <textarea value={form.properties_owned} onChange={e => set('properties_owned', e.target.value)}
                    rows={2} className={`${INPUT} resize-none`}
                    placeholder="Land, vehicles, bank accounts, businesses..." />
                </div>

                <div>
                  <label className={LABEL}>Health Status</label>
                  <textarea value={form.health_status} onChange={e => set('health_status', e.target.value)}
                    rows={2} className={`${INPUT} resize-none`}
                    placeholder="Known medical conditions, disabilities, medications..." />
                </div>

                <div>
                  <label className={LABEL}>Passport Photo URL</label>
                  <input value={form.passport_photo_url} onChange={e => set('passport_photo_url', e.target.value)}
                    className={INPUT} placeholder="https://... (paste URL of uploaded photo)" />
                </div>
              </>
            )}

            {/* ── CUSTODY DETAILS ───────────────────────────────────── */}
            {activeTab === 'custody' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Facility *</label>
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
                    <label className={LABEL}>Cell Block</label>
                    <input value={form.cell_block} onChange={e => set('cell_block', e.target.value)}
                      className={INPUT} placeholder="e.g. B-3" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Custody Status</label>
                    <select value={form.custody_status} onChange={e => set('custody_status', e.target.value)} className={SELECT}>
                      <option value="PRE_TRIAL">PRE TRIAL</option>
                      <option value="SENTENCED">SENTENCED</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Threat Level</label>
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
                    <label className={LABEL}>Intake Date</label>
                    <input type="date" value={form.intake_date} onChange={e => set('intake_date', e.target.value)}
                      className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>Next Review Date</label>
                    <input type="date" value={form.next_review} onChange={e => set('next_review', e.target.value)}
                      className={INPUT} />
                  </div>
                </div>
              </>
            )}

            {/* ── COURT CONCLUSION ──────────────────────────────────── */}
            {activeTab === 'court' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Court Name</label>
                    <input value={form.court_name} onChange={e => set('court_name', e.target.value)}
                      className={INPUT} placeholder="e.g. Kigali High Court" />
                  </div>
                  <div>
                    <label className={LABEL}>Presiding Judge</label>
                    <input value={form.presiding_judge} onChange={e => set('presiding_judge', e.target.value)}
                      className={INPUT} placeholder="Full name of judge" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Verdict Date</label>
                    <input type="date" value={form.verdict_date} onChange={e => set('verdict_date', e.target.value)}
                      className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>Sentence Type</label>
                    <select value={form.sentence_type} onChange={e => set('sentence_type', e.target.value)} className={SELECT}>
                      <option value="">Select...</option>
                      <option value="Imprisonment">Imprisonment</option>
                      <option value="Life Imprisonment">Life Imprisonment</option>
                      <option value="Community Service">Community Service</option>
                      <option value="Fine">Fine</option>
                      <option value="Suspended Sentence">Suspended Sentence</option>
                      <option value="Pre-Trial Detention">Pre-Trial Detention</option>
                    </select>
                  </div>
                </div>

                {(form.sentence_type === 'Imprisonment' || form.sentence_type === 'Suspended Sentence') && (
                  <div>
                    <label className={LABEL}>Sentence Duration (years)</label>
                    <input type="number" min="1" max="99" value={form.sentence_years}
                      onChange={e => set('sentence_years', e.target.value)}
                      className={INPUT} placeholder="e.g. 15" />
                  </div>
                )}

                <div>
                  <label className={LABEL}>Offense Description</label>
                  <textarea value={form.offense_description} onChange={e => set('offense_description', e.target.value)}
                    rows={3} className={`${INPUT} resize-none`}
                    placeholder="Charges and offenses the prisoner was tried for..." />
                </div>

                <div>
                  <label className={LABEL}>Court Conclusion / Judgment Summary</label>
                  <textarea value={form.court_conclusion} onChange={e => set('court_conclusion', e.target.value)}
                    rows={4} className={`${INPUT} resize-none`}
                    placeholder="Summary of court's findings and final judgment..." />
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-800 px-5 py-4 shrink-0">
            {error && (
              <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2 mb-3">{error}</p>
            )}

            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {TABS.map((tab, i) => (
                  <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                    className={`w-2 h-2 rounded-full transition-colors ${activeTab === tab.id ? 'bg-amber-400' : 'bg-slate-700 hover:bg-slate-600'}`}
                    title={`Tab ${i + 1}: ${tab.label}`}
                  />
                ))}
              </div>

              <div className="flex gap-3">
                {activeTab !== 'personal' && (
                  <button type="button"
                    onClick={() => setActiveTab(activeTab === 'court' ? 'custody' : 'personal')}
                    className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">
                    Back
                  </button>
                )}
                {activeTab !== 'court' ? (
                  <button type="button"
                    onClick={() => setActiveTab(activeTab === 'personal' ? 'custody' : 'court')}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition">
                    Next
                  </button>
                ) : null}
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
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

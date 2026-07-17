'use client'
import { useState, useEffect } from 'react'
import { X, Shield, Loader2, User, Building2, Gavel, Users, Plus, Trash2 } from 'lucide-react'
import { correctionsApi } from '@/lib/api'
import { format } from 'date-fns'

interface VisitorEntry {
  id: string
  visitor_name: string
  relationship: string
  national_id: string
  phone: string
  visit_date: string
  visit_purpose: string
  duration_minutes: string
  officer_on_duty: string
  notes: string
}

interface Props {
  correctionId: string
  onClose: () => void
  onSuccess?: () => void
}

type Tab = 'personal' | 'custody' | 'court' | 'visitors'

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: 'personal',  label: 'Personal Info',      icon: User },
  { id: 'custody',   label: 'Custody & Facility',  icon: Building2 },
  { id: 'court',     label: 'Court Conclusion',    icon: Gavel },
  { id: 'visitors',  label: 'Visitor Log',         icon: Users },
]

const INPUT = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none'
const SELECT = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none'
const LABEL = 'block text-xs text-slate-400 mb-1'
const VINPUT = 'w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none'

function newVisitor(): VisitorEntry {
  return {
    id: crypto.randomUUID(),
    visitor_name: '',
    relationship: '',
    national_id: '',
    phone: '',
    visit_date: new Date().toISOString().split('T')[0],
    visit_purpose: '',
    duration_minutes: '30',
    officer_on_duty: '',
    notes: '',
  }
}

export function InmateDetailModal({ correctionId, onClose, onSuccess }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('personal')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showAddVisitor, setShowAddVisitor] = useState(false)
  const [newVisitorForm, setNewVisitorForm] = useState<VisitorEntry>(newVisitor())

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
    custody_status: '',
    intake_date: '',
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
    // Meta
    ims_reference: '',
    suspect_status: '',
  })

  const [visitors, setVisitors] = useState<VisitorEntry[]>([])

  useEffect(() => {
    correctionsApi.get(correctionId).then(r => {
      const d = r.data as Record<string, unknown>
      const suspects = d.suspects as Record<string, unknown> | null
      setForm({
        full_name: String(suspects?.full_name ?? d.full_name ?? ''),
        father_name: String(d.father_name ?? ''),
        mother_name: String(d.mother_name ?? ''),
        sex: String(d.sex ?? ''),
        date_of_birth: d.date_of_birth ? String(d.date_of_birth).split('T')[0] : '',
        place_of_birth: String(d.place_of_birth ?? ''),
        nationality: String(d.nationality ?? suspects?.nationality ?? ''),
        national_id: String(d.national_id ?? ''),
        party_status: String(d.party_status ?? ''),
        marital_status: String(d.marital_status ?? ''),
        profession: String(d.profession ?? ''),
        education_level: String(d.education_level ?? ''),
        children_count: d.children_count != null ? String(d.children_count) : '',
        health_status: String(d.health_status ?? ''),
        properties_owned: String(d.properties_owned ?? ''),
        residential_address: String(d.residential_address ?? ''),
        domicile_address: String(d.domicile_address ?? ''),
        phone_number: String(d.phone_number ?? ''),
        email: String(d.email ?? ''),
        alternative_contact: String(d.alternative_contact ?? ''),
        passport_photo_url: String(d.passport_photo_url ?? ''),
        facility_name: String(d.facility_name ?? ''),
        cell_block: String(d.cell_block ?? ''),
        custody_status: String(d.custody_status ?? ''),
        intake_date: d.intake_date ? String(d.intake_date).split('T')[0] : '',
        next_review: d.next_review ? String(d.next_review).split('T')[0] : '',
        threat_level: d.threat_level != null ? String(d.threat_level) : '3',
        court_name: String(d.court_name ?? ''),
        presiding_judge: String(d.presiding_judge ?? ''),
        verdict_date: d.verdict_date ? String(d.verdict_date).split('T')[0] : '',
        sentence_type: String(d.sentence_type ?? ''),
        sentence_years: d.sentence_years != null ? String(d.sentence_years) : '',
        offense_description: String(d.offense_description ?? ''),
        court_conclusion: String(d.court_conclusion ?? ''),
        ims_reference: String(suspects?.ims_reference ?? d.ims_reference ?? ''),
        suspect_status: String(suspects?.status ?? d.suspect_status ?? ''),
      })
      const vl = d.visitor_log
      if (Array.isArray(vl)) {
        setVisitors(vl.map((v: Record<string, unknown>) => ({
          id: String(v.id ?? crypto.randomUUID()),
          visitor_name: String(v.visitor_name ?? ''),
          relationship: String(v.relationship ?? ''),
          national_id: String(v.national_id ?? ''),
          phone: String(v.phone ?? ''),
          visit_date: String(v.visit_date ?? ''),
          visit_purpose: String(v.visit_purpose ?? ''),
          duration_minutes: String(v.duration_minutes ?? '30'),
          officer_on_duty: String(v.officer_on_duty ?? ''),
          notes: String(v.notes ?? ''),
        })))
      }
    }).catch(() => {
      setError('Failed to load inmate record.')
    }).finally(() => setLoading(false))
  }, [correctionId])

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function setV(field: keyof VisitorEntry, value: string) {
    setNewVisitorForm(prev => ({ ...prev, [field]: value }))
  }

  function addVisitor() {
    if (!newVisitorForm.visitor_name.trim() || !newVisitorForm.visit_date) return
    setVisitors(prev => [...prev, { ...newVisitorForm, id: crypto.randomUUID() }])
    setNewVisitorForm(newVisitor())
    setShowAddVisitor(false)
  }

  function removeVisitor(id: string) {
    setVisitors(prev => prev.filter(v => v.id !== id))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await correctionsApi.update(correctionId, {
        father_name: form.father_name || undefined,
        mother_name: form.mother_name || undefined,
        sex: form.sex || undefined,
        place_of_birth: form.place_of_birth || undefined,
        nationality: form.nationality || undefined,
        national_id: form.national_id || undefined,
        party_status: form.party_status || undefined,
        marital_status: form.marital_status || undefined,
        profession: form.profession || undefined,
        education_level: form.education_level || undefined,
        children_count: form.children_count ? parseInt(form.children_count) : undefined,
        health_status: form.health_status || undefined,
        properties_owned: form.properties_owned || undefined,
        residential_address: form.residential_address || undefined,
        domicile_address: form.domicile_address || undefined,
        phone_number: form.phone_number || undefined,
        email: form.email || undefined,
        alternative_contact: form.alternative_contact || undefined,
        passport_photo_url: form.passport_photo_url || undefined,
        facility_name: form.facility_name || undefined,
        cell_block: form.cell_block || undefined,
        custody_status: form.custody_status || undefined,
        intake_date: form.intake_date || undefined,
        next_review: form.next_review || undefined,
        threat_level: parseInt(form.threat_level),
        court_name: form.court_name || undefined,
        presiding_judge: form.presiding_judge || undefined,
        verdict_date: form.verdict_date || undefined,
        sentence_type: form.sentence_type || undefined,
        sentence_years: form.sentence_years ? parseInt(form.sentence_years) : undefined,
        offense_description: form.offense_description || undefined,
        court_conclusion: form.court_conclusion || undefined,
        visitor_log: visitors,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      onSuccess?.()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message ?? 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold text-white">
                {loading ? 'Loading…' : form.full_name || 'Inmate Record'}
              </h2>
              {!loading && form.ims_reference && (
                <p className="text-[10px] font-mono text-amber-400/70 mt-0.5">
                  {form.ims_reference} · {form.suspect_status}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 shrink-0 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap transition border-b-2 ${
                  activeTab === tab.id
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}>
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.id === 'visitors' && visitors.length > 0 && (
                  <span className="ml-1 rounded-full bg-amber-800 text-amber-200 text-[9px] px-1.5 py-0.5 font-bold">
                    {visitors.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 text-amber-400 animate-spin" />
            </div>
          ) : (
            <div className="p-5 space-y-4">

              {/* ── PERSONAL INFO ─────────────────────────────────────────── */}
              {activeTab === 'personal' && (
                <>
                  {form.passport_photo_url && (
                    <div className="flex justify-center mb-2">
                      <img src={form.passport_photo_url} alt="Passport photo"
                        className="h-28 w-24 object-cover rounded-lg border border-slate-700" />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL}>Full Name</label>
                      <input value={form.full_name} onChange={e => set('full_name', e.target.value)}
                        className={INPUT} />
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
                      <input value={form.father_name} onChange={e => set('father_name', e.target.value)} className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Mother's Name</label>
                      <input value={form.mother_name} onChange={e => set('mother_name', e.target.value)} className={INPUT} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={LABEL}>Date of Birth</label>
                      <input type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} className={INPUT} />
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
                      <input value={form.place_of_birth} onChange={e => set('place_of_birth', e.target.value)} className={INPUT} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL}>Nationality</label>
                      <input value={form.nationality} onChange={e => set('nationality', e.target.value)} className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>National ID / Passport Number</label>
                      <input value={form.national_id} onChange={e => set('national_id', e.target.value)} className={INPUT} />
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
                        onChange={e => set('children_count', e.target.value)} className={INPUT} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL}>Profession / Occupation</label>
                      <input value={form.profession} onChange={e => set('profession', e.target.value)} className={INPUT} />
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
                    <input value={form.residential_address} onChange={e => set('residential_address', e.target.value)} className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>Domicile Address</label>
                    <input value={form.domicile_address} onChange={e => set('domicile_address', e.target.value)} className={INPUT} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL}>Telephone Number</label>
                      <input value={form.phone_number} onChange={e => set('phone_number', e.target.value)} className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Email Address</label>
                      <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={INPUT} />
                    </div>
                  </div>

                  <div>
                    <label className={LABEL}>Alternative Contact Information</label>
                    <textarea value={form.alternative_contact} onChange={e => set('alternative_contact', e.target.value)}
                      rows={2} className={`${INPUT} resize-none`} />
                  </div>

                  <div>
                    <label className={LABEL}>Properties / Assets</label>
                    <textarea value={form.properties_owned} onChange={e => set('properties_owned', e.target.value)}
                      rows={2} className={`${INPUT} resize-none`} />
                  </div>

                  <div>
                    <label className={LABEL}>Health Status</label>
                    <textarea value={form.health_status} onChange={e => set('health_status', e.target.value)}
                      rows={2} className={`${INPUT} resize-none`} />
                  </div>

                  <div>
                    <label className={LABEL}>Passport Photo URL</label>
                    <input value={form.passport_photo_url} onChange={e => set('passport_photo_url', e.target.value)}
                      className={INPUT} placeholder="https://..." />
                  </div>
                </>
              )}

              {/* ── CUSTODY DETAILS ──────────────────────────────────────── */}
              {activeTab === 'custody' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL}>Facility</label>
                      <select value={form.facility_name} onChange={e => set('facility_name', e.target.value)} className={SELECT}>
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
                        <option value="RELEASED">RELEASED</option>
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
                      <input type="date" value={form.intake_date} onChange={e => set('intake_date', e.target.value)} className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Next Review Date</label>
                      <input type="date" value={form.next_review} onChange={e => set('next_review', e.target.value)} className={INPUT} />
                    </div>
                  </div>
                </>
              )}

              {/* ── COURT CONCLUSION ─────────────────────────────────────── */}
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
                      <input type="date" value={form.verdict_date} onChange={e => set('verdict_date', e.target.value)} className={INPUT} />
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
                        onChange={e => set('sentence_years', e.target.value)} className={INPUT} />
                    </div>
                  )}

                  <div>
                    <label className={LABEL}>Offense Description</label>
                    <textarea value={form.offense_description} onChange={e => set('offense_description', e.target.value)}
                      rows={3} className={`${INPUT} resize-none`} />
                  </div>

                  <div>
                    <label className={LABEL}>Court Conclusion / Judgment Summary</label>
                    <textarea value={form.court_conclusion} onChange={e => set('court_conclusion', e.target.value)}
                      rows={5} className={`${INPUT} resize-none`} />
                  </div>
                </>
              )}

              {/* ── VISITOR LOG ──────────────────────────────────────────── */}
              {activeTab === 'visitors' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">
                      {visitors.length === 0
                        ? 'No visitors recorded yet.'
                        : `${visitors.length} visitor ${visitors.length === 1 ? 'entry' : 'entries'} on record.`}
                    </p>
                    <button type="button" onClick={() => setShowAddVisitor(true)}
                      className="flex items-center gap-1.5 rounded-lg bg-amber-800 hover:bg-amber-700 px-3 py-1.5 text-xs font-medium text-white transition">
                      <Plus className="h-3.5 w-3.5" />
                      Add Visitor
                    </button>
                  </div>

                  {/* Add visitor form */}
                  {showAddVisitor && (
                    <div className="rounded-xl border border-amber-800/40 bg-amber-950/10 p-4 space-y-3">
                      <p className="text-xs font-semibold text-amber-400">New Visitor Entry</p>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={LABEL}>Visitor Full Name *</label>
                          <input value={newVisitorForm.visitor_name}
                            onChange={e => setV('visitor_name', e.target.value)}
                            className={VINPUT} placeholder="Visitor's name" />
                        </div>
                        <div>
                          <label className={LABEL}>Relationship to Prisoner</label>
                          <input value={newVisitorForm.relationship}
                            onChange={e => setV('relationship', e.target.value)}
                            className={VINPUT} placeholder="e.g. Spouse, Parent, Lawyer" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={LABEL}>Visitor National ID</label>
                          <input value={newVisitorForm.national_id}
                            onChange={e => setV('national_id', e.target.value)}
                            className={VINPUT} placeholder="ID number" />
                        </div>
                        <div>
                          <label className={LABEL}>Phone Number</label>
                          <input value={newVisitorForm.phone}
                            onChange={e => setV('phone', e.target.value)}
                            className={VINPUT} placeholder="+250 7XX XXX XXX" />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className={LABEL}>Visit Date *</label>
                          <input type="date" value={newVisitorForm.visit_date}
                            onChange={e => setV('visit_date', e.target.value)}
                            className={VINPUT} />
                        </div>
                        <div>
                          <label className={LABEL}>Duration (minutes)</label>
                          <input type="number" min="5" value={newVisitorForm.duration_minutes}
                            onChange={e => setV('duration_minutes', e.target.value)}
                            className={VINPUT} />
                        </div>
                        <div>
                          <label className={LABEL}>Officer on Duty</label>
                          <input value={newVisitorForm.officer_on_duty}
                            onChange={e => setV('officer_on_duty', e.target.value)}
                            className={VINPUT} placeholder="Officer name / badge" />
                        </div>
                      </div>

                      <div>
                        <label className={LABEL}>Purpose of Visit</label>
                        <input value={newVisitorForm.visit_purpose}
                          onChange={e => setV('visit_purpose', e.target.value)}
                          className={VINPUT} placeholder="e.g. Family visit, Legal consultation" />
                      </div>

                      <div>
                        <label className={LABEL}>Notes</label>
                        <textarea value={newVisitorForm.notes}
                          onChange={e => setV('notes', e.target.value)}
                          rows={2} className={`${VINPUT} resize-none`}
                          placeholder="Observations, items brought in, etc." />
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button type="button" onClick={() => setShowAddVisitor(false)}
                          className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition">
                          Cancel
                        </button>
                        <button type="button" onClick={addVisitor}
                          disabled={!newVisitorForm.visitor_name.trim() || !newVisitorForm.visit_date}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-700 text-white hover:bg-amber-600 disabled:opacity-50 transition">
                          Add to Log
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Visitor table */}
                  {visitors.length > 0 && (
                    <div className="rounded-xl border border-slate-800 overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[10px] uppercase text-slate-500 border-b border-slate-800 bg-slate-800/50">
                            <th className="px-3 py-2 font-semibold">Visitor</th>
                            <th className="px-3 py-2 font-semibold">Relationship</th>
                            <th className="px-3 py-2 font-semibold">Date</th>
                            <th className="px-3 py-2 font-semibold">Duration</th>
                            <th className="px-3 py-2 font-semibold">Purpose</th>
                            <th className="px-3 py-2 font-semibold">Officer</th>
                            <th className="px-3 py-2 font-semibold w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {visitors.map(v => (
                            <tr key={v.id} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20 group">
                              <td className="px-3 py-2.5">
                                <p className="text-white font-medium">{v.visitor_name}</p>
                                {v.national_id && <p className="text-[10px] text-slate-500">{v.national_id}</p>}
                                {v.phone && <p className="text-[10px] text-slate-500">{v.phone}</p>}
                              </td>
                              <td className="px-3 py-2.5 text-slate-300">{v.relationship || '—'}</td>
                              <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                                {v.visit_date ? format(new Date(v.visit_date), 'dd MMM yyyy') : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-slate-400">
                                {v.duration_minutes ? `${v.duration_minutes} min` : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-slate-300 max-w-[140px] truncate" title={v.visit_purpose}>
                                {v.visit_purpose || '—'}
                              </td>
                              <td className="px-3 py-2.5 text-slate-400">{v.officer_on_duty || '—'}</td>
                              <td className="px-3 py-2.5">
                                <button type="button" onClick={() => removeVisitor(v.id)}
                                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-600">
                    Changes to the visitor log are saved when you click Save Changes.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 px-5 py-4 shrink-0">
          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2 mb-3">{error}</p>
          )}
          {saved && (
            <p className="text-xs text-green-400 bg-green-950/30 border border-green-900 rounded-lg px-3 py-2 mb-3">
              Changes saved successfully.
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">
              Close
            </button>
            <button type="button" onClick={handleSave} disabled={saving || loading}
              className="flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 transition">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

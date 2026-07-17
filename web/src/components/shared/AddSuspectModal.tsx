'use client'
import { useState } from 'react'
import { X, UserPlus, Loader2, CheckCircle2, AlertCircle, Plus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { suspectsApi } from '@/lib/api'

export interface SuspectPrefill {
  caseReference: string
  caseTitle: string
  clearance_level: string
  owning_institution: string
  category?: string
  location?: string
}

interface Props {
  onClose: () => void
  onSuccess: () => void
  prefill?: SuspectPrefill
}

const INPUT = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/20'
const SELECT = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/20'
const LABEL = 'block text-xs text-slate-400 mb-1'
const SECTION = 'bg-slate-800/40 rounded-xl border border-slate-700/50 p-4 space-y-3'
const SECTION_TITLE = 'text-xs font-semibold text-slate-300 uppercase tracking-wider pb-2 border-b border-slate-700/50 mb-1'

function buildEmptyForm(prefill?: SuspectPrefill, user?: { institution?: string }) {
  return {
    first_name: '',
    last_name: '',
    party_status: 'SUSPECT',
    father_name: '',
    mother_name: '',
    date_of_birth: '',
    sex: '',
    place_of_birth: '',
    residential_address: prefill?.location ?? '',
    domicile_address: '',
    telephone: '',
    email: '',
    national_id: '',
    nationality: 'RWA',
    marital_status: '',
    profession: '',
    properties: '',
    health_status: '',
    education_level: '',
    num_children: '',
    alt_contact: '',
    status: 'ACTIVE',
    threat_level: '3',
    clearance_level: prefill?.clearance_level ?? 'CONFIDENTIAL',
    owning_institution: prefill?.owning_institution ?? user?.institution ?? 'RIB',
    notes: '',
  }
}

function buildNotesPayload(form: ReturnType<typeof buildEmptyForm>, prefill?: SuspectPrefill): string {
  const parts: string[] = []

  if (form.notes.trim()) parts.push(form.notes.trim())

  const extended = [
    form.party_status   && `Party Status: ${form.party_status}`,
    form.father_name    && `Father's Name: ${form.father_name}`,
    form.mother_name    && `Mother's Name: ${form.mother_name}`,
    form.sex            && `Sex: ${form.sex}`,
    form.place_of_birth && `Place of Birth: ${form.place_of_birth}`,
    form.residential_address && `Residential Address: ${form.residential_address}`,
    form.domicile_address    && `Domicile Address: ${form.domicile_address}`,
    form.telephone      && `Telephone: ${form.telephone}`,
    form.email          && `Email: ${form.email}`,
    form.national_id    && `National ID/Passport: ${form.national_id}`,
    form.marital_status && `Marital Status: ${form.marital_status}`,
    form.profession     && `Profession: ${form.profession}`,
    form.properties     && `Properties: ${form.properties}`,
    form.health_status  && `Health Status: ${form.health_status}`,
    form.education_level && `Education Level: ${form.education_level}`,
    form.num_children   && `Number of Children: ${form.num_children}`,
    form.alt_contact    && `Alternative Contact: ${form.alt_contact}`,
    prefill             && `Related Case: ${prefill.caseReference} — ${prefill.caseTitle}`,
  ].filter(Boolean) as string[]

  if (extended.length) parts.push('--- Extended Profile ---\n' + extended.join('\n'))

  return parts.join('\n\n')
}

export function AddSuspectModal({ onClose, onSuccess, prefill }: Props) {
  const { user } = useAuth()
  const [form, setForm] = useState(() => buildEmptyForm(prefill, user ?? undefined))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [addedCount, setAddedCount] = useState(0)

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function doSubmit(): Promise<boolean> {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First name and last name are required.')
      return false
    }
    setSubmitting(true)
    setError(null)
    try {
      await suspectsApi.create({
        first_name: form.first_name.trim(),
        last_name:  form.last_name.trim(),
        status:     form.status,
        threat_level: parseInt(form.threat_level, 10),
        nationality:  form.nationality.trim().toUpperCase() || 'RWA',
        clearance_level:    form.clearance_level,
        owning_institution: form.owning_institution,
        date_of_birth: form.date_of_birth || undefined,
        notes: buildNotesPayload(form, prefill) || undefined,
      })
      return true
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message ?? 'Failed to add suspect.')
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ok = await doSubmit()
    if (ok) onSuccess()
  }

  async function handleAddAnother(e: React.MouseEvent) {
    e.preventDefault()
    const ok = await doSubmit()
    if (ok) {
      setAddedCount(c => c + 1)
      setForm(buildEmptyForm(prefill, user ?? undefined))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <UserPlus className="h-5 w-5 text-violet-400" />
            <h2 className="text-sm font-bold text-white">Add Suspect</h2>
            {addedCount > 0 && (
              <span className="text-xs bg-violet-900/60 text-violet-300 px-2 py-0.5 rounded-full font-medium">
                {addedCount} saved
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Case pre-fill banner */}
          {prefill && (
            <div className="mx-6 mt-4 flex items-start gap-3 rounded-lg border border-teal-800/60 bg-teal-950/40 p-3">
              <CheckCircle2 className="h-4 w-4 text-teal-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-teal-300">
                  Auto-filled from Case <span className="font-mono">{prefill.caseReference}</span>
                </p>
                <p className="text-xs text-teal-400 mt-0.5 truncate">
                  {prefill.caseTitle}
                  {prefill.category ? ` · ${prefill.category.replace(/_/g, ' ')}` : ''}
                </p>
                <p className="text-[11px] text-teal-500 mt-1">
                  Review and confirm suspect details below. You can edit any field before saving.
                </p>
              </div>
            </div>
          )}

          <form id="suspect-form" onSubmit={handleSubmit} className="p-6 space-y-5">

            {/* ── I. Personal Information ── */}
            <div className={SECTION}>
              <p className={SECTION_TITLE}>Personal Information</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>First Name *</label>
                  <input value={form.first_name} onChange={e => set('first_name', e.target.value)}
                    className={INPUT} placeholder="First name" required />
                </div>
                <div>
                  <label className={LABEL}>Last Name *</label>
                  <input value={form.last_name} onChange={e => set('last_name', e.target.value)}
                    className={INPUT} placeholder="Last name" required />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={LABEL}>Party Status</label>
                  <select value={form.party_status} onChange={e => set('party_status', e.target.value)} className={SELECT}>
                    {['SUSPECT', 'ACCUSED', 'DEFENDANT', 'CONVICT'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Date of Birth</label>
                  <input type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)}
                    className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Sex</label>
                  <select value={form.sex} onChange={e => set('sex', e.target.value)} className={SELECT}>
                    <option value="">— Select —</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Father&apos;s Name</label>
                  <input value={form.father_name} onChange={e => set('father_name', e.target.value)}
                    className={INPUT} placeholder="Father's full name" />
                </div>
                <div>
                  <label className={LABEL}>Mother&apos;s Name</label>
                  <input value={form.mother_name} onChange={e => set('mother_name', e.target.value)}
                    className={INPUT} placeholder="Mother's full name" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Place of Birth</label>
                  <input value={form.place_of_birth} onChange={e => set('place_of_birth', e.target.value)}
                    className={INPUT} placeholder="District, Province" />
                </div>
                <div>
                  <label className={LABEL}>Nationality (ISO 3)</label>
                  <input value={form.nationality} onChange={e => set('nationality', e.target.value)}
                    maxLength={3} className={INPUT} placeholder="RWA" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Marital Status</label>
                  <select value={form.marital_status} onChange={e => set('marital_status', e.target.value)} className={SELECT}>
                    <option value="">— Select —</option>
                    {['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED'].map(s => (
                      <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Number of Children</label>
                  <input type="number" min="0" value={form.num_children}
                    onChange={e => set('num_children', e.target.value)}
                    className={INPUT} placeholder="0" />
                </div>
              </div>
            </div>

            {/* ── II. Contact & Address ── */}
            <div className={SECTION}>
              <p className={SECTION_TITLE}>Contact &amp; Address Information</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Telephone Number</label>
                  <input type="tel" value={form.telephone} onChange={e => set('telephone', e.target.value)}
                    className={INPUT} placeholder="+250 7XX XXX XXX" />
                </div>
                <div>
                  <label className={LABEL}>Email Address</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                    className={INPUT} placeholder="email@example.com" />
                </div>
              </div>

              <div>
                <label className={LABEL}>Residential Address</label>
                <input value={form.residential_address} onChange={e => set('residential_address', e.target.value)}
                  className={INPUT} placeholder="Village, Cell, Sector, District, Province" />
              </div>

              <div>
                <label className={LABEL}>Domicile Address</label>
                <input value={form.domicile_address} onChange={e => set('domicile_address', e.target.value)}
                  className={INPUT} placeholder="If different from residential address" />
              </div>

              <div>
                <label className={LABEL}>Alternative Contact Information</label>
                <input value={form.alt_contact} onChange={e => set('alt_contact', e.target.value)}
                  className={INPUT} placeholder="Next of kin, emergency contact, etc." />
              </div>
            </div>

            {/* ── III. Identity & Background ── */}
            <div className={SECTION}>
              <p className={SECTION_TITLE}>Identity &amp; Background</p>

              <div>
                <label className={LABEL}>National ID / Passport Number</label>
                <input value={form.national_id} onChange={e => set('national_id', e.target.value)}
                  className={INPUT} placeholder="1XXXXXXXXXXXXXXXXX" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Profession</label>
                  <input value={form.profession} onChange={e => set('profession', e.target.value)}
                    className={INPUT} placeholder="Occupation / employer" />
                </div>
                <div>
                  <label className={LABEL}>Education Level</label>
                  <select value={form.education_level} onChange={e => set('education_level', e.target.value)} className={SELECT}>
                    <option value="">— Select —</option>
                    {['NONE', 'PRIMARY', 'SECONDARY', 'TVET', 'UNDERGRADUATE', 'POSTGRADUATE', 'PHD'].map(lvl => (
                      <option key={lvl} value={lvl}>
                        {lvl.charAt(0) + lvl.slice(1).toLowerCase().replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={LABEL}>Health Status</label>
                <input value={form.health_status} onChange={e => set('health_status', e.target.value)}
                  className={INPUT} placeholder="Known medical conditions, disabilities, etc." />
              </div>

              <div>
                <label className={LABEL}>Properties</label>
                <input value={form.properties} onChange={e => set('properties', e.target.value)}
                  className={INPUT} placeholder="Vehicles, land, buildings, other assets" />
              </div>
            </div>

            {/* ── IV. Investigation Classification ── */}
            <div className={SECTION}>
              <p className={SECTION_TITLE}>Investigation Classification</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Suspect Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value)} className={SELECT}>
                    {['ACTIVE', 'WANTED', 'ARRESTED', 'IN_CUSTODY', 'INTERPOL_FLAGGED'].map(s => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
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
                  <label className={LABEL}>Clearance Level</label>
                  <select value={form.clearance_level} onChange={e => set('clearance_level', e.target.value)} className={SELECT}>
                    {['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'].map(c => (
                      <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Owning Institution</label>
                  <select value={form.owning_institution} onChange={e => set('owning_institution', e.target.value)} className={SELECT}>
                    {['NISS', 'RNP', 'RIB', 'RDF', 'RCS'].map(i => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ── V. Intelligence Notes ── */}
            <div className={SECTION}>
              <p className={SECTION_TITLE}>Intelligence Notes</p>
              <div>
                <label className={LABEL}>Additional Notes</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                  rows={4} className={`${INPUT} resize-none`}
                  placeholder="Known activities, associates, criminal history, physical description..." />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </form>
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-slate-800 px-6 py-4 flex items-center justify-between gap-3 shrink-0 bg-slate-900/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition"
          >
            {addedCount > 0 ? `Done (${addedCount} suspect${addedCount > 1 ? 's' : ''} added)` : 'Cancel'}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddAnother}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-lg border border-violet-700/50 bg-violet-950/30 px-4 py-2 text-sm font-semibold text-violet-300 hover:bg-violet-900/40 disabled:opacity-50 transition"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <Plus className="h-3.5 w-3.5" />
              Add Another Suspect
            </button>

            <button
              type="submit"
              form="suspect-form"
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50 transition"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <UserPlus className="h-4 w-4" />
              Add Suspect
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

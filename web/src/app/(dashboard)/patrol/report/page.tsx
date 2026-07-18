'use client'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { patrolApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import {
  UserX, MapPin, Upload, CheckCircle, Loader2, Shield, X, FileVideo, FileImage,
  User, AlertTriangle, Link2,
} from 'lucide-react'
import clsx from 'clsx'

const INSECURITY_TYPES = [
  { value: 'THEFT',               label: 'Theft / Robbery' },
  { value: 'ASSAULT',             label: 'Assault / Physical Violence' },
  { value: 'SUSPICIOUS_ACTIVITY', label: 'Suspicious Activity' },
  { value: 'DRUG_DEALING',        label: 'Drug Dealing' },
  { value: 'DOMESTIC_VIOLENCE',   label: 'Domestic Violence' },
  { value: 'THREATS',             label: 'Threats / Intimidation' },
  { value: 'PROPERTY_DAMAGE',     label: 'Property Damage / Vandalism' },
  { value: 'OTHER',               label: 'Other Insecurity' },
]

const SEX_OPTIONS       = ['Male', 'Female']
const MARITAL_OPTIONS   = ['Single', 'Married', 'Divorced', 'Widowed']
const EDUCATION_OPTIONS = [
  'None', 'Primary', 'Secondary (O-Level)', 'Secondary (A-Level)',
  'Vocational / TVET', 'Bachelor', 'Masters', 'PhD',
]

// Field order is mandated by the Village Leader reporting format
const PROFILE_FIELDS: {
  key: string
  label: string
  required?: boolean
  type?: 'date' | 'select' | 'number' | 'textarea'
  options?: string[]
  placeholder?: string
}[] = [
  { key: 'full_name',               label: 'Full Name', required: true, placeholder: 'Names as on the National ID' },
  { key: 'party_status',            label: 'Party Status', placeholder: 'e.g. Member of political party X / None' },
  { key: 'father_name',             label: "Father's Name" },
  { key: 'mother_name',             label: "Mother's Name" },
  { key: 'date_of_birth',           label: 'Date of Birth', type: 'date' },
  { key: 'sex',                     label: 'Sex', type: 'select', options: SEX_OPTIONS },
  { key: 'place_of_birth',          label: 'Place of Birth', placeholder: 'District / Sector / Cell / Village' },
  { key: 'residential_address',     label: 'Residential Address', placeholder: 'Where the person currently lives' },
  { key: 'domicile_address',        label: 'Domicile Address', placeholder: 'Permanent / family home address' },
  { key: 'telephone',               label: 'Telephone Number', placeholder: '07XX XXX XXX' },
  { key: 'email',                   label: 'Email', placeholder: 'example@mail.com' },
  { key: 'national_id_or_passport', label: 'National ID / Passport Number', placeholder: '16-digit NID or passport number' },
  { key: 'nationality',             label: 'Nationality', placeholder: 'e.g. Rwandan' },
  { key: 'marital_status',          label: 'Marital Status', type: 'select', options: MARITAL_OPTIONS },
  { key: 'profession',              label: 'Profession', placeholder: 'e.g. Farmer, Trader, Driver' },
  { key: 'properties',              label: 'Properties', type: 'textarea', placeholder: 'Known properties (land, houses, vehicles, businesses…)' },
  { key: 'health_status',           label: 'Health Status', placeholder: 'e.g. Healthy, chronic illness, disability' },
  { key: 'education_level',         label: 'Education Level', type: 'select', options: EDUCATION_OPTIONS },
  { key: 'number_of_children',      label: 'Number of Children', type: 'number', placeholder: '0' },
  { key: 'alternative_contact',     label: 'Alternative Contact Information', placeholder: 'Next of kin / relative name and phone' },
]

const EMPTY_PROFILE = Object.fromEntries(PROFILE_FIELDS.map(f => [f.key, ''])) as Record<string, string>

interface StagedFile {
  file: File
  id: string
  uploading: boolean
  url: string | null
  error: boolean
}

export default function PatrolReportPage() {
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile]                 = useState<Record<string, string>>({ ...EMPTY_PROFILE })
  const [insecurityType, setInsecurityType]   = useState('')
  const [locationDesc, setLocationDesc]       = useState('')
  const [description, setDescription]         = useState('')
  const [stagedFiles, setStagedFiles]         = useState<StagedFile[]>([])
  const [coords, setCoords]                   = useState<{ lat: number; lng: number } | null>(null)
  const [gpsReady, setGpsReady]               = useState(false)
  const [submitting, setSubmitting]           = useState(false)
  const [success, setSuccess]                 = useState(false)
  const [matchedRecord, setMatchedRecord]     = useState(false)
  const [formError, setFormError]             = useState('')

  function setField(key: string, value: string) {
    setProfile(prev => ({ ...prev, [key]: value }))
  }

  // Auto-request GPS on mount
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsReady(true)
      },
      () => {},
      { timeout: 10000, maximumAge: 60000 }
    )
  }, [])

  async function uploadToSupabase(staged: StagedFile): Promise<string | null> {
    const ext  = staged.file.name.split('.').pop() ?? 'bin'
    const path = `exhibits/${Date.now()}-${staged.id}.${ext}`
    // Requires 'patrol-exhibits' bucket in Supabase Storage with INSERT policy for authenticated users
    const { error } = await supabase.storage.from('patrol-exhibits').upload(path, staged.file)
    if (error) return null
    const { data } = supabase.storage.from('patrol-exhibits').getPublicUrl(path)
    return data.publicUrl
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const newStaged: StagedFile[] = files.map(f => ({
      file: f,
      id: Math.random().toString(36).slice(2),
      uploading: false,
      url: null,
      error: false,
    }))
    setStagedFiles(prev => [...prev, ...newStaged])
    // Reset input so same file can be picked again if removed
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeFile(id: string) {
    setStagedFiles(prev => prev.filter(f => f.id !== id))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    if (!profile.full_name.trim()) { setFormError("Please provide the person's full name."); return }
    if (!insecurityType) { setFormError('Please select what the person is suspected for.'); return }
    if (!description.trim()) { setFormError('Please describe what the person does that can harm society.'); return }

    setSubmitting(true)

    // Upload any staged files
    const updatedFiles = [...stagedFiles]
    for (let i = 0; i < updatedFiles.length; i++) {
      updatedFiles[i] = { ...updatedFiles[i], uploading: true }
      setStagedFiles([...updatedFiles])
      const url = await uploadToSupabase(updatedFiles[i])
      updatedFiles[i] = { ...updatedFiles[i], uploading: false, url, error: !url }
      setStagedFiles([...updatedFiles])
    }

    const fileUrls = updatedFiles.filter(f => f.url).map(f => f.url as string)

    const trimmedProfile = Object.fromEntries(
      Object.entries(profile).map(([k, v]) => [k, v.trim()])
    ) as Record<string, string>

    try {
      const res = await patrolApi.submitReport({
        person_name: trimmedProfile.full_name,
        person: trimmedProfile,
        description: description.trim(),
        insecurity_type: insecurityType,
        location_lat: coords?.lat ?? null,
        location_lng: coords?.lng ?? null,
        location_description: locationDesc.trim() || undefined,
        file_urls: fileUrls,
      })
      setMatchedRecord(!!res.data?.matched_existing_record)
      setSuccess(true)
    } catch {
      setFormError('Failed to submit report. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">Report Person</h1>
          <p className="text-sm text-slate-400 mt-0.5">Village Leader · {user?.full_name}</p>
        </div>
        <div className="rounded-xl border border-green-800/40 bg-green-950/10 p-8 text-center space-y-4 max-w-md">
          <CheckCircle className="h-12 w-12 text-green-400 mx-auto" />
          <div>
            <p className="text-base font-bold text-green-400">Report Submitted Successfully</p>
            <p className="text-sm text-green-300/60 mt-2">
              Your report has been received and an alert has been sent to RNP Command for review.
              The person has been linked to the national registry so all institutions can see this
              report during any investigation.
            </p>
          </div>
          {matchedRecord && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-800/40 bg-amber-950/10 px-3 py-2.5 text-left">
              <Link2 className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300/80">
                This person already has records in the intelligence system. Your report has been
                attached to their existing file and flagged to investigators.
              </p>
            </div>
          )}
          <button
            onClick={() => {
              setSuccess(false)
              setMatchedRecord(false)
              setProfile({ ...EMPTY_PROFILE })
              setInsecurityType(''); setLocationDesc('')
              setDescription(''); setStagedFiles([])
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded-lg transition-colors"
          >
            Submit Another Report
          </button>
        </div>
      </div>
    )
  }

  const inputCls = 'w-full bg-slate-800 border border-slate-700 focus:border-patrol/50 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Report Person</h1>
          <p className="text-sm text-slate-400 mt-0.5">Village Leader · {user?.full_name}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
            <div className="h-1.5 w-1.5 rounded-full bg-patrol animate-pulse" />
            Village Leader
          </div>
          <div className={clsx('flex items-center gap-1.5 text-[10px] font-mono', gpsReady ? 'text-green-400' : 'text-slate-500')}>
            <MapPin className="h-3 w-3" />
            {gpsReady ? `GPS locked (${coords?.lat.toFixed(4)}, ${coords?.lng.toFixed(4)})` : 'Acquiring GPS…'}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">

        {/* ── Section 1: Person Information (mandated format) ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-patrol" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wide">Person Information</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PROFILE_FIELDS.map(f => (
              <div key={f.key} className={clsx(f.type === 'textarea' && 'sm:col-span-2')}>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                  {f.label}
                  {f.required
                    ? <span className="text-red-400"> *</span>
                    : <span className="text-slate-600"> (if known)</span>}
                </label>
                {f.type === 'select' ? (
                  <select
                    value={profile[f.key]}
                    onChange={e => setField(f.key, e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Select…</option>
                    {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea
                    value={profile[f.key]}
                    onChange={e => setField(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    rows={2}
                    className={clsx(inputCls, 'resize-none')}
                  />
                ) : (
                  <input
                    type={f.type ?? 'text'}
                    min={f.type === 'number' ? 0 : undefined}
                    value={profile[f.key]}
                    onChange={e => setField(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className={inputCls}
                  />
                )}
              </div>
            ))}
          </div>

          <p className="text-[10px] text-slate-500 leading-relaxed">
            Provide as much information as you know. The National ID number is stored securely
            (hashed) and used to link this report to the person&apos;s records in all institutions.
          </p>
        </div>

        {/* ── Section 2: Suspected Activity ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wide">Suspected Activity</h2>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
              What the Person Is Suspected For <span className="text-red-400">*</span>
            </label>
            <select
              value={insecurityType}
              onChange={e => setInsecurityType(e.target.value)}
              className={inputCls}
            >
              <option value="">Select type…</option>
              {INSECURITY_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
              What They Do Wrong in the Community <span className="text-red-400">*</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe what this person does in the community that can harm society — behaviour, pattern, or incidents. Include times, frequency, and witnesses if known."
              rows={5}
              className={clsx(inputCls, 'resize-none')}
            />
            <p className="text-[10px] text-slate-500 mt-1">{description.length} characters</p>
          </div>
        </div>

        {/* ── Section 3: Location ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wide">Location</h2>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
              Location Description
            </label>
            <input
              value={locationDesc}
              onChange={e => setLocationDesc(e.target.value)}
              placeholder="e.g. Near Kimironko market, Sector X, Cell Y"
              className={inputCls}
            />
            {gpsReady && (
              <p className="text-[10px] text-green-500/70 mt-1 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                GPS coordinates captured automatically
              </p>
            )}
          </div>
        </div>

        {/* ── Section 4: Exhibits ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wide">
              Exhibits <span className="text-slate-600 normal-case font-normal">(optional — images or video)</span>
            </h2>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-700 hover:border-patrol/50 bg-slate-800/50 hover:bg-slate-800 rounded-lg py-4 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Click to attach images or video files
          </button>

          {/* Staged file list */}
          {stagedFiles.length > 0 && (
            <div className="mt-3 space-y-2">
              {stagedFiles.map(sf => {
                const isImage = sf.file.type.startsWith('image/')
                return (
                  <div key={sf.id} className={clsx(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
                    sf.error ? 'border-red-800/40 bg-red-950/10' : 'border-slate-800 bg-slate-900'
                  )}>
                    {isImage
                      ? <FileImage className="h-4 w-4 text-blue-400 shrink-0" />
                      : <FileVideo className="h-4 w-4 text-purple-400 shrink-0" />
                    }
                    <span className="flex-1 truncate text-slate-300">{sf.file.name}</span>
                    <span className="text-slate-500 shrink-0">
                      {(sf.file.size / 1024).toFixed(0)} KB
                    </span>
                    {sf.uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-patrol shrink-0" />}
                    {sf.url && <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0" />}
                    {sf.error && <span className="text-red-400 shrink-0">Failed</span>}
                    {!sf.uploading && (
                      <button
                        type="button"
                        onClick={() => removeFile(sf.id)}
                        className="text-slate-500 hover:text-red-400 transition-colors shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-[10px] text-slate-600">
            Exhibits are stored securely and accessible only to authorised RNP officers.
          </p>
        </div>

        {formError && (
          <div className="rounded-lg border border-red-800/40 bg-red-950/10 px-3 py-2 text-xs text-red-400">
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-patrol hover:bg-patrol/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {submitting
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting Report…</>
            : <><UserX className="h-4 w-4" /> Submit Insecurity Report</>
          }
        </button>

        {/* Disclaimer */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-500 leading-relaxed">
              This report will be forwarded to RNP Command, logged in the national intelligence system,
              and permanently linked to the person&apos;s file across all institutions.
              False reports are a criminal offence under Rwandan law. Only report genuine insecurity concerns.
            </p>
          </div>
        </div>
      </form>
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { casesApi, api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import {
  ChevronDown, ChevronUp, Plus, Trash2, FileText,
  Download, Save, Send, Printer, ArrowLeft, Loader2,
  Users, Shield, MapPin, Package, BookOpen,
  CheckCircle2, Eye, RefreshCw, X, User, Clock, FileUp,
  AlertCircle,
} from 'lucide-react'
import clsx from 'clsx'
import { format } from 'date-fns'

// ─── Types ─────────────────────────────────────────────────────────────────────

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

interface PersonEntry {
  id: string
  full_name: string; party_status: string; father_name: string; mother_name: string
  date_of_birth: string; sex: string; place_of_birth: string; country: string
  province: string; district: string; sector: string; cell: string; village: string
  residential_address: string; domicile_address: string; telephone: string
  email: string; national_id: string; nationality: string; marital_status: string
  profession: string; properties: string; health_status: string
  education_level: string; num_children: string; alt_contact: string
  photo?: string  // base64 data URL — passport-style photo
}

const mkPerson = (overrides: Partial<PersonEntry> = {}): PersonEntry => ({
  id: uid(), full_name: '', party_status: 'SUSPECT', father_name: '', mother_name: '',
  date_of_birth: '', sex: '', place_of_birth: '', country: 'Rwanda',
  province: '', district: '', sector: '', cell: '', village: '',
  residential_address: '', domicile_address: '', telephone: '', email: '',
  national_id: '', nationality: 'RWA', marital_status: '', profession: '',
  properties: '', health_status: '', education_level: '', num_children: '',
  alt_contact: '', photo: '', ...overrides,
})

interface HistoryEntry {
  id: string; case_category: string; sub_category: string; case_type: string
  crime: string; article: string; suspect_name: string; offender_type: string
}
const mkHistory = (): HistoryEntry => ({
  id: uid(), case_category: '', sub_category: '', case_type: '',
  crime: '', article: '', suspect_name: '', offender_type: '',
})

interface CrimeInfo {
  date_of_crime: string; time_of_crime: string; province: string; district: string
  sector: string; cell: string; village: string; exact_scene: string
  gps_lat: string; gps_lng: string
}

interface ExhibitEntry {
  id: string; number: string; name: string; description: string; quantity: string
  condition: string; storage_location: string; file_name: string
}
const mkExhibit = (n: number): ExhibitEntry => ({
  id: uid(), number: `EXH-${String(n).padStart(3, '0')}`,
  name: '', description: '', quantity: '1', condition: '', storage_location: '', file_name: '',
})

interface InvestigatorEntry {
  id: string; name: string; rank: string; institution: string; role: string
  telephone: string; email: string
}
const mkInvestigator = (o: Partial<InvestigatorEntry> = {}): InvestigatorEntry => ({
  id: uid(), name: '', rank: '', institution: '', role: '', telephone: '', email: '', ...o,
})

const DOC_TYPES = [
  'Seizure Report',
  'Scene Observation Report',
  'Expert Report',
  'Response Statement',
  'Supplementary Seizure Report',
  'Supplementary Scene Observation Report',
  'Opening Report',
  'Initial Opening Report',
  'Closing Report',
  "Complainant's Statement",
  'Witness Statement',
  "Suspect's Statement",
]

interface DocEntry { file_name: string; upload_date: string }

interface ReportState {
  victims: PersonEntry[]
  suspects: PersonEntry[]
  witnesses: PersonEntry[]
  criminal_history: HistoryEntry[]
  crime_info: CrimeInfo
  exhibits: ExhibitEntry[]
  investigators: InvestigatorEntry[]
  crime_summary: string
  charge_summary: string
  investigation_findings: string
  documents: Record<string, DocEntry>
}

const PROVINCES = [
  'Kigali City', 'Northern Province', 'Southern Province',
  'Eastern Province', 'Western Province',
]

// ─── Style constants ────────────────────────────────────────────────────────────

const INP = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/20'
const SEL = INP + ' cursor-pointer'
const LBL = 'block text-[11px] font-medium text-slate-400 mb-1 uppercase tracking-wide'
const G2 = 'grid grid-cols-1 sm:grid-cols-2 gap-3'
const G3 = 'grid grid-cols-1 sm:grid-cols-3 gap-3'

// ─── SectionCard ────────────────────────────────────────────────────────────────

function SectionCard({
  anchor, icon: Icon, color, title, badge, children, defaultOpen = true,
}: {
  anchor: string; icon: React.ElementType; color: string; title: string
  badge?: number; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div id={anchor} className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Icon className={clsx('h-4 w-4 shrink-0', color)} />
          <span className="text-sm font-bold text-white">{title}</span>
          {badge !== undefined && (
            <span className="text-xs font-medium bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-slate-500 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-slate-800 px-5 pb-5 pt-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── PersonForm ─────────────────────────────────────────────────────────────────

function PersonForm({
  index, person, label, partyOptions, onUpdate, onRemove, canRemove,
}: {
  index: number; person: PersonEntry; label: string; partyOptions: string[]
  onUpdate: (p: PersonEntry) => void; onRemove: () => void; canRemove: boolean
}) {
  const [open, setOpen] = useState(true)
  const s = (f: keyof PersonEntry, v: string) => onUpdate({ ...person, [f]: v })

  return (
    <div className="border border-slate-700/60 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 flex-1 text-left min-w-0">
          <span className="text-xs font-semibold text-slate-200 truncate">
            {person.full_name.trim() || `${label} ${index + 1}`}
          </span>
          {person.party_status && (
            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 shrink-0">
              {person.party_status}
            </span>
          )}
          {open
            ? <ChevronUp className="h-3.5 w-3.5 text-slate-500 ml-auto shrink-0" />
            : <ChevronDown className="h-3.5 w-3.5 text-slate-500 ml-auto shrink-0" />}
        </button>
        {canRemove && (
          <button type="button" onClick={onRemove}
            className="ml-3 text-slate-500 hover:text-red-400 transition shrink-0">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="px-4 pb-4 pt-3 space-y-3 bg-slate-900/30">

          {/* Photo + Full Name + Party Status */}
          <div className="flex items-start gap-4">
            {/* Passport-style photo box */}
            <div className="shrink-0">
              {person.photo ? (
                <div className="relative">
                  <img src={person.photo} alt="Profile photo"
                    className="h-24 w-[74px] rounded-lg border border-slate-600 object-cover shadow" />
                  <button type="button" onClick={() => s('photo', '')}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-600 flex items-center justify-center shadow">
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-24 w-[74px] cursor-pointer rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/60 hover:border-teal-500 hover:bg-teal-950/20 transition gap-1.5 select-none">
                  <User className="h-7 w-7 text-slate-500" />
                  <span className="text-[9px] text-slate-500 text-center px-1 leading-tight">Add<br/>Photo</span>
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = ev => s('photo', ev.target?.result as string)
                      reader.readAsDataURL(file)
                    }} />
                </label>
              )}
            </div>
            {/* Full Name + Party Status */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LBL}>Full Name *</label>
                <input value={person.full_name} onChange={e => s('full_name', e.target.value)}
                  className={INP} placeholder="Full legal name" />
              </div>
              <div>
                <label className={LBL}>Party Status</label>
                <select value={person.party_status} onChange={e => s('party_status', e.target.value)} className={SEL}>
                  {partyOptions.map(o => <option key={o} value={o}>{o.replace(/_/g,' ')}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className={G2}>
            <div>
              <label className={LBL}>Father&apos;s Name</label>
              <input value={person.father_name} onChange={e => s('father_name', e.target.value)}
                className={INP} placeholder="Father's full name" />
            </div>
            <div>
              <label className={LBL}>Mother&apos;s Name</label>
              <input value={person.mother_name} onChange={e => s('mother_name', e.target.value)}
                className={INP} placeholder="Mother's full name" />
            </div>
          </div>

          <div className={G3}>
            <div>
              <label className={LBL}>Date of Birth</label>
              <input type="date" value={person.date_of_birth}
                onChange={e => s('date_of_birth', e.target.value)} className={INP} />
            </div>
            <div>
              <label className={LBL}>Sex</label>
              <select value={person.sex} onChange={e => s('sex', e.target.value)} className={SEL}>
                <option value="">— Select —</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </div>
            <div>
              <label className={LBL}>Place of Birth</label>
              <input value={person.place_of_birth} onChange={e => s('place_of_birth', e.target.value)}
                className={INP} placeholder="City / District" />
            </div>
          </div>

          <div className={G2}>
            <div>
              <label className={LBL}>Country</label>
              <input value={person.country} onChange={e => s('country', e.target.value)}
                className={INP} placeholder="Rwanda" />
            </div>
            <div>
              <label className={LBL}>Province</label>
              <select value={person.province} onChange={e => s('province', e.target.value)} className={SEL}>
                <option value="">— Select —</option>
                {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className={G3}>
            <div>
              <label className={LBL}>District</label>
              <input value={person.district} onChange={e => s('district', e.target.value)}
                className={INP} placeholder="District" />
            </div>
            <div>
              <label className={LBL}>Sector</label>
              <input value={person.sector} onChange={e => s('sector', e.target.value)}
                className={INP} placeholder="Sector" />
            </div>
            <div>
              <label className={LBL}>Cell</label>
              <input value={person.cell} onChange={e => s('cell', e.target.value)}
                className={INP} placeholder="Cell" />
            </div>
          </div>

          <div>
            <label className={LBL}>Village</label>
            <input value={person.village} onChange={e => s('village', e.target.value)}
              className={INP} placeholder="Village name" />
          </div>

          <div>
            <label className={LBL}>Residential Address</label>
            <input value={person.residential_address} onChange={e => s('residential_address', e.target.value)}
              className={INP} placeholder="Full residential address" />
          </div>

          <div>
            <label className={LBL}>Domicile Address</label>
            <input value={person.domicile_address} onChange={e => s('domicile_address', e.target.value)}
              className={INP} placeholder="If different from residential address" />
          </div>

          <div className={G2}>
            <div>
              <label className={LBL}>Telephone Number</label>
              <input type="tel" value={person.telephone} onChange={e => s('telephone', e.target.value)}
                className={INP} placeholder="+250 7XX XXX XXX" />
            </div>
            <div>
              <label className={LBL}>Email Address</label>
              <input type="email" value={person.email} onChange={e => s('email', e.target.value)}
                className={INP} placeholder="email@example.com" />
            </div>
          </div>

          <div className={G2}>
            <div>
              <label className={LBL}>National ID / Passport No.</label>
              <input value={person.national_id} onChange={e => s('national_id', e.target.value)}
                className={INP} placeholder="1XXXXXXXXXXXXXXXXX" />
            </div>
            <div>
              <label className={LBL}>Nationality (ISO 3)</label>
              <input value={person.nationality} onChange={e => s('nationality', e.target.value)}
                maxLength={3} className={INP} placeholder="RWA" />
            </div>
          </div>

          <div className={G3}>
            <div>
              <label className={LBL}>Marital Status</label>
              <select value={person.marital_status} onChange={e => s('marital_status', e.target.value)} className={SEL}>
                <option value="">— Select —</option>
                {['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED'].map(v => (
                  <option key={v} value={v}>{v.charAt(0) + v.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LBL}>Profession</label>
              <input value={person.profession} onChange={e => s('profession', e.target.value)}
                className={INP} placeholder="Occupation" />
            </div>
            <div>
              <label className={LBL}>Education Level</label>
              <select value={person.education_level} onChange={e => s('education_level', e.target.value)} className={SEL}>
                <option value="">— Select —</option>
                {['NONE', 'PRIMARY', 'SECONDARY', 'TVET', 'UNDERGRADUATE', 'POSTGRADUATE', 'PHD'].map(v => (
                  <option key={v} value={v}>{v.charAt(0) + v.slice(1).toLowerCase().replace('_', ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={G2}>
            <div>
              <label className={LBL}>Health Status</label>
              <input value={person.health_status} onChange={e => s('health_status', e.target.value)}
                className={INP} placeholder="Known conditions / disabilities" />
            </div>
            <div>
              <label className={LBL}>Properties</label>
              <input value={person.properties} onChange={e => s('properties', e.target.value)}
                className={INP} placeholder="Vehicles, land, buildings" />
            </div>
          </div>

          <div className={G2}>
            <div>
              <label className={LBL}>Number of Children</label>
              <input type="number" min="0" value={person.num_children}
                onChange={e => s('num_children', e.target.value)} className={INP} placeholder="0" />
            </div>
            <div>
              <label className={LBL}>Alternative Contact Information</label>
              <input value={person.alt_contact} onChange={e => s('alt_contact', e.target.value)}
                className={INP} placeholder="Next of kin / emergency contact" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ExhibitCard ────────────────────────────────────────────────────────────────

function ExhibitCard({
  exhibit, index, onUpdate, onRemove, canRemove,
}: {
  exhibit: ExhibitEntry; index: number
  onUpdate: (e: ExhibitEntry) => void; onRemove: () => void; canRemove: boolean
}) {
  const s = (f: keyof ExhibitEntry, v: string) => onUpdate({ ...exhibit, [f]: v })
  return (
    <div className="border border-slate-700/60 rounded-xl px-4 py-4 space-y-3 bg-slate-900/30 relative">
      {canRemove && (
        <button type="button" onClick={onRemove}
          className="absolute top-3 right-3 text-slate-500 hover:text-red-400 transition">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      <p className="text-xs font-semibold text-slate-300">Exhibit {index + 1}</p>

      <div className={G3}>
        <div>
          <label className={LBL}>Exhibit Number</label>
          <input value={exhibit.number} onChange={e => s('number', e.target.value)} className={INP} />
        </div>
        <div>
          <label className={LBL}>Exhibit Name</label>
          <input value={exhibit.name} onChange={e => s('name', e.target.value)}
            className={INP} placeholder="Name of exhibit" />
        </div>
        <div>
          <label className={LBL}>Quantity</label>
          <input value={exhibit.quantity} onChange={e => s('quantity', e.target.value)}
            className={INP} placeholder="1" />
        </div>
      </div>

      <div>
        <label className={LBL}>Description</label>
        <textarea value={exhibit.description} onChange={e => s('description', e.target.value)}
          rows={2} className={INP + ' resize-none'} placeholder="Detailed description of the exhibit" />
      </div>

      <div className={G2}>
        <div>
          <label className={LBL}>Condition</label>
          <select value={exhibit.condition} onChange={e => s('condition', e.target.value)} className={SEL}>
            <option value="">— Select —</option>
            {['GOOD', 'FAIR', 'POOR', 'DAMAGED', 'DESTROYED'].map(c => (
              <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LBL}>Storage Location</label>
          <input value={exhibit.storage_location} onChange={e => s('storage_location', e.target.value)}
            className={INP} placeholder="Evidence room / locker no." />
        </div>
      </div>

      <div>
        <label className={LBL}>Attached Photograph / File</label>
        <div className="flex items-center gap-2">
          <label className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-xs cursor-pointer transition',
            exhibit.file_name
              ? 'border-teal-700/60 text-teal-400'
              : 'border-slate-600 text-slate-400 hover:border-teal-600 hover:text-teal-400'
          )}>
            <FileUp className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-[200px]">{exhibit.file_name || 'Choose file…'}</span>
            <input type="file" className="hidden"
              onChange={e => s('file_name', e.target.files?.[0]?.name ?? '')} />
          </label>
          {exhibit.file_name && (
            <button type="button" onClick={() => s('file_name', '')}
              className="text-slate-500 hover:text-red-400 transition">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── InvestigatorCard ───────────────────────────────────────────────────────────

function InvestigatorCard({
  inv, index, onUpdate, onRemove, canRemove,
}: {
  inv: InvestigatorEntry; index: number
  onUpdate: (e: InvestigatorEntry) => void; onRemove: () => void; canRemove: boolean
}) {
  const s = (f: keyof InvestigatorEntry, v: string) => onUpdate({ ...inv, [f]: v })
  return (
    <div className="border border-slate-700/60 rounded-xl px-4 py-4 space-y-3 bg-slate-900/30 relative">
      {canRemove && (
        <button type="button" onClick={onRemove}
          className="absolute top-3 right-3 text-slate-500 hover:text-red-400 transition">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      <p className="text-xs font-semibold text-slate-300">
        {inv.name.trim() || `Investigator / Expert ${index + 1}`}
      </p>

      <div className={G3}>
        <div>
          <label className={LBL}>Full Name *</label>
          <input value={inv.name} onChange={e => s('name', e.target.value)}
            className={INP} placeholder="Name" />
        </div>
        <div>
          <label className={LBL}>Rank / Title</label>
          <input value={inv.rank} onChange={e => s('rank', e.target.value)}
            className={INP} placeholder="Inspector, Detective, Expert…" />
        </div>
        <div>
          <label className={LBL}>Institution</label>
          <select value={inv.institution} onChange={e => s('institution', e.target.value)} className={SEL}>
            <option value="">— Select —</option>
            {['RIB', 'RNP', 'RDF', 'NISS', 'RCS', 'DPP', 'JUDICIARY', 'NATIONAL_FORENSICS', 'OTHER'].map(i => (
              <option key={i} value={i}>{i.replace(/_/g,' ')}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={G3}>
        <div>
          <label className={LBL}>Role in Investigation</label>
          <input value={inv.role} onChange={e => s('role', e.target.value)}
            className={INP} placeholder="Lead Investigator, Expert…" />
        </div>
        <div>
          <label className={LBL}>Telephone Number</label>
          <input type="tel" value={inv.telephone} onChange={e => s('telephone', e.target.value)}
            className={INP} placeholder="+250 7XX XXX XXX" />
        </div>
        <div>
          <label className={LBL}>Email Address</label>
          <input type="email" value={inv.email} onChange={e => s('email', e.target.value)}
            className={INP} placeholder="email@example.com" />
        </div>
      </div>
    </div>
  )
}

// ─── AddBtn ─────────────────────────────────────────────────────────────────────

function AddBtn({ onClick, label, color }: { onClick: () => void; label: string; color: string }) {
  return (
    <button type="button" onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-2 border transition mt-2',
        color,
      )}>
      <Plus className="h-4 w-4" /> {label}
    </button>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────────

export default function InvestigationReportPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const { user } = useAuth()
  const STORAGE_KEY = `ims_report_${id}`

  const [caseData, setCaseData]   = useState<Record<string, string> | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState<string | null>(null)
  const [submitDone, setSubmitDone] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)

  // ── Report state (persisted to localStorage) ────────────────────────────────

  const [report, setReport] = useState<ReportState>(() => {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(`ims_report_${id}`)
      if (raw) {
        try { return JSON.parse(raw) as ReportState } catch { /* noop */ }
      }
    }
    return {
      victims: [mkPerson({ party_status: 'VICTIM' })],
      suspects: [mkPerson({ party_status: 'SUSPECT' })],
      witnesses: [],
      criminal_history: [],
      crime_info: { date_of_crime: '', time_of_crime: '', province: '', district: '', sector: '', cell: '', village: '', exact_scene: '', gps_lat: '', gps_lng: '' },
      exhibits: [mkExhibit(1)],
      investigators: [mkInvestigator()],
      crime_summary: '',
      charge_summary: '',
      investigation_findings: '',
      documents: {},
    }
  })

  // ── Load case data + existing report ───────────────────────────────────────

  useEffect(() => {
    if (!id) return

    Promise.all([
      casesApi.get(id),
      api.get(`/cases/${id}/report`).then(r => r.data).catch(() => null),
    ]).then(([caseRes, reportRes]) => {
      const c = caseRes.data as unknown as Record<string, string>
      setCaseData(c)

      const dbReport = (reportRes?.report_data ?? null) as ReportState | null
      const localRaw = localStorage.getItem(STORAGE_KEY)

      if (dbReport && dbReport.victims) {
        // DB report takes priority over localStorage
        setReport(dbReport)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dbReport))
      } else if (localRaw) {
        try { setReport(JSON.parse(localRaw) as ReportState) } catch { /* noop */ }
      } else {
        // No existing report — pre-fill from case data
        setReport(prev => ({
          ...prev,
          crime_info: {
            ...prev.crime_info,
            date_of_crime: c.incident_date ? c.incident_date.substring(0, 10) : '',
            exact_scene: c.location_name ?? '',
          },
          crime_summary: c.summary ?? '',
          investigators: [mkInvestigator({
            name: user?.full_name ?? '',
            institution: c.lead_institution ?? user?.institution ?? 'RIB',
            role: 'Lead Investigator',
          })],
        }))
      }
    }).catch(() => {}).finally(() => setPageLoading(false))
  }, [id, user, STORAGE_KEY])

  // ── Auto-save to localStorage (debounced 800ms) ─────────────────────────────

  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(report))
    }, 800)
    return () => clearTimeout(t)
  }, [report, STORAGE_KEY])

  // ── Signature upload ─────────────────────────────────────────────────────────

  function handleSignatureUpload(file: File) {
    const reader = new FileReader()
    reader.onload = e => setSignatureDataUrl(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  // ── PDF Export ───────────────────────────────────────────────────────────────

  async function handlePrint() {
    const { generateInvestigationPdf } = await import('@/lib/report-pdf')
    await generateInvestigationPdf({
      caseInfo: {
        title: caseData?.title ?? 'Investigation Report',
        caseRef: caseData?.case_reference ?? (id as string),
        clearance: ((caseData?.clearance_level ?? caseData?.classification ?? 'CONFIDENTIAL') as string).replace(/_/g, ' '),
        category: (caseData?.category ?? '') as string,
        status: (caseData?.status ?? '') as string,
        lead_institution: (caseData?.lead_institution ?? '') as string,
        incident_date: (caseData?.incident_date ?? '') as string,
        location_name: (caseData?.location_name ?? '') as string,
        summary: (caseData?.summary ?? '') as string,
      },
      report,
      investigator: {
        full_name: user?.full_name ?? '',
        role: user?.role ?? '',
        badge_number: user?.badge_number ?? '',
        institution: user?.institution ?? '',
      },
      signatureDataUrl,
    })
  }

  // ── Update helpers ──────────────────────────────────────────────────────────

  const upd = useCallback(<K extends keyof ReportState>(key: K, val: ReportState[K]) => {
    setReport(prev => ({ ...prev, [key]: val }))
  }, [])

  function addPerson(key: 'victims' | 'suspects' | 'witnesses', status: string) {
    upd(key, [...report[key], mkPerson({ party_status: status })])
  }
  function setPerson(key: 'victims' | 'suspects' | 'witnesses', p: PersonEntry) {
    upd(key, report[key].map(x => x.id === p.id ? p : x))
  }
  function delPerson(key: 'victims' | 'suspects' | 'witnesses', id: string) {
    upd(key, report[key].filter(x => x.id !== id))
  }

  // ── Manual save ─────────────────────────────────────────────────────────────

  async function saveDraft() {
    setSaving(true)
    setSubmitError(null)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(report))
    try {
      await api.put(`/cases/${id}/report`, { report_data: report, status: 'DRAFT' })
      setSaveMsg('Draft saved')
    } catch {
      setSaveMsg('Saved locally')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 3000)
    }
  }

  async function handleSubmit() {
    setSaving(true)
    setSubmitError(null)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(report))
    try {
      await api.put(`/cases/${id}/report`, { report_data: report, status: 'SUBMITTED' })
      setSubmitDone(true)
      setSaveMsg('Investigation submitted')
      setTimeout(() => setSaveMsg(null), 4000)
    } catch {
      setSubmitError('Failed to submit. Report saved locally.')
    } finally {
      setSaving(false)
    }
  }

  // ── Completion % ────────────────────────────────────────────────────────────

  const completion = (() => {
    const checks = [
      report.victims.some(v => v.full_name.trim()),
      report.suspects.some(s => s.full_name.trim()),
      !!report.crime_info.date_of_crime,
      !!report.crime_info.exact_scene,
      !!report.crime_summary.trim(),
      !!report.charge_summary.trim(),
      !!report.investigation_findings.trim(),
      report.investigators.some(i => i.name.trim()),
    ]
    return Math.round((checks.filter(Boolean).length / checks.length) * 100)
  })()

  const NAV_SECTIONS = [
    { id: 'sec-victims',   label: 'Victims' },
    { id: 'sec-suspects',  label: 'Suspects' },
    { id: 'sec-witnesses', label: 'Witnesses' },
    { id: 'sec-history',   label: 'Crim. History' },
    { id: 'sec-crime',     label: 'Crime Info' },
    { id: 'sec-exhibits',  label: 'Exhibits' },
    { id: 'sec-invests',   label: 'Investigators' },
    { id: 'sec-summaries', label: 'Summaries' },
    { id: 'sec-docs',      label: 'Documents' },
  ]

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
      </div>
    )
  }

  const caseRef = caseData?.case_reference ?? id

  return (
    <div className="space-y-5 pb-20">

      {/* ── Print-only header ── */}
      <div className="print-header">
        <div className="text-center border-b-2 border-black pb-4 mb-6">
          <p className="text-xs font-bold uppercase tracking-widest">Republic of Rwanda</p>
          <p className="text-xs uppercase tracking-wider">Rwanda Investigation Bureau</p>
          <h1 className="text-2xl font-bold mt-2 uppercase">Investigation Report</h1>
          <p className="text-sm font-mono mt-1">{caseRef}</p>
          <p className="text-sm font-semibold mt-0.5">{caseData?.title}</p>
          <p className="text-xs text-gray-600 mt-1">Classification: {caseData?.clearance_level ?? caseData?.classification}</p>
        </div>
      </div>

      {/* ── Top action bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition shrink-0">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="h-4 w-px bg-slate-700 shrink-0" />
          {caseData && (
            <div className="min-w-0">
              <span className="font-mono text-teal-400 text-sm font-bold">{caseRef}</span>
              <span className="text-slate-400 text-sm ml-2 truncate hidden sm:inline">{caseData.title}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {saveMsg && (
            <span className="text-xs text-teal-400 flex items-center gap-1 shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5" /> {saveMsg}
            </span>
          )}
          <button onClick={saveDraft} disabled={saving}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Draft
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg border border-teal-700/50 bg-teal-900/20 px-3 py-1.5 text-xs font-semibold text-teal-300 hover:bg-teal-900/40 transition">
            <Printer className="h-3.5 w-3.5" /> Download PDF
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || submitDone}
            className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-600 disabled:opacity-50 transition">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {submitDone ? 'Submitted ✓' : 'Submit Investigation'}
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {submitError && (
        <div className="no-print flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/30 px-4 py-2.5 text-xs text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {submitError}
          <button onClick={() => setSubmitError(null)} className="ml-auto text-red-500 hover:text-red-300"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* ── Progress bar ── */}
      <div className="no-print">
        <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
          <span className="font-medium">Report Completion</span>
          <span className={clsx('font-bold', completion >= 80 ? 'text-teal-400' : completion >= 50 ? 'text-amber-400' : 'text-slate-400')}>
            {completion}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-800">
          <div
            className={clsx('h-2 rounded-full transition-all duration-500',
              completion >= 80 ? 'bg-teal-500' : completion >= 50 ? 'bg-amber-500' : 'bg-slate-600')}
            style={{ width: `${completion}%` }}
          />
        </div>
      </div>

      {/* ── Section navigation ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-print">
        {NAV_SECTIONS.map(s => (
          <a key={s.id} href={`#${s.id}`}
            className="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition whitespace-nowrap">
            {s.label}
          </a>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          I. VICTIMS
      ══════════════════════════════════════════════════════════════════════════ */}
      <SectionCard anchor="sec-victims" icon={Users} color="text-teal-400"
        title="I. Victim(s)" badge={report.victims.length}>
        <div className="space-y-3">
          {report.victims.map((v, i) => (
            <PersonForm key={v.id} index={i} person={v} label="Victim"
              partyOptions={['VICTIM', 'COMPLAINANT', 'INJURED PARTY']}
              onUpdate={p => setPerson('victims', p)}
              onRemove={() => delPerson('victims', v.id)}
              canRemove={report.victims.length > 0} />
          ))}
        </div>
        <AddBtn onClick={() => addPerson('victims', 'VICTIM')} label="Add Another Victim"
          color="text-teal-400 border-teal-700/50 hover:bg-teal-900/20" />
      </SectionCard>

      {/* ══════════════════════════════════════════════════════════════════════════
          II. SUSPECTS
      ══════════════════════════════════════════════════════════════════════════ */}
      <SectionCard anchor="sec-suspects" icon={Shield} color="text-violet-400"
        title="II. Suspect(s)" badge={report.suspects.length}>
        <div className="space-y-3">
          {report.suspects.map((s, i) => (
            <PersonForm key={s.id} index={i} person={s} label="Suspect"
              partyOptions={['SUSPECT', 'ACCUSED', 'DEFENDANT', 'CONVICT']}
              onUpdate={p => setPerson('suspects', p)}
              onRemove={() => delPerson('suspects', s.id)}
              canRemove={true} />
          ))}
        </div>
        <AddBtn onClick={() => addPerson('suspects', 'SUSPECT')} label="Add Another Suspect"
          color="text-violet-400 border-violet-700/50 hover:bg-violet-900/20" />
      </SectionCard>

      {/* ══════════════════════════════════════════════════════════════════════════
          III. WITNESSES
      ══════════════════════════════════════════════════════════════════════════ */}
      <SectionCard anchor="sec-witnesses" icon={User} color="text-blue-400"
        title="III. Witness(es)" badge={report.witnesses.length} defaultOpen={false}>
        {report.witnesses.length === 0 && (
          <p className="text-sm text-slate-500 py-3 text-center">No witnesses recorded yet.</p>
        )}
        <div className="space-y-3">
          {report.witnesses.map((w, i) => (
            <PersonForm key={w.id} index={i} person={w} label="Witness"
              partyOptions={['WITNESS', 'EXPERT WITNESS', 'EYE WITNESS', 'CHARACTER WITNESS']}
              onUpdate={p => setPerson('witnesses', p)}
              onRemove={() => delPerson('witnesses', w.id)}
              canRemove={true} />
          ))}
        </div>
        <AddBtn onClick={() => addPerson('witnesses', 'WITNESS')} label="Add Another Witness"
          color="text-blue-400 border-blue-700/50 hover:bg-blue-900/20" />
      </SectionCard>

      {/* ══════════════════════════════════════════════════════════════════════════
          IV. SUSPECT CRIMINAL HISTORY
      ══════════════════════════════════════════════════════════════════════════ */}
      <SectionCard anchor="sec-history" icon={Clock} color="text-amber-400"
        title="IV. Suspect Criminal History" badge={report.criminal_history.length} defaultOpen={false}>
        {report.criminal_history.length === 0 && (
          <p className="text-sm text-slate-500 py-3 text-center">No criminal history records added.</p>
        )}
        {report.criminal_history.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/60">
                  {['Case Category','Sub Category','Case Type','Crime','Article','Suspect Name','Offender Type',''].map(h => (
                    <th key={h} className="py-2 px-2 text-left font-medium text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.criminal_history.map(h => (
                  <tr key={h.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                    {(['case_category','sub_category','case_type','crime','article','suspect_name','offender_type'] as (keyof HistoryEntry)[]).map(f => (
                      <td key={f} className="py-1 px-1">
                        <input
                          value={h[f] as string}
                          onChange={e => upd('criminal_history', report.criminal_history.map(x => x.id === h.id ? { ...x, [f]: e.target.value } : x))}
                          className="w-full min-w-[80px] rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                          placeholder={String(f).replace(/_/g,' ')} />
                      </td>
                    ))}
                    <td className="py-1 px-2">
                      <button type="button"
                        onClick={() => upd('criminal_history', report.criminal_history.filter(x => x.id !== h.id))}
                        className="text-slate-500 hover:text-red-400 transition">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AddBtn
          onClick={() => upd('criminal_history', [...report.criminal_history, mkHistory()])}
          label="Add History Record"
          color="text-amber-400 border-amber-700/50 hover:bg-amber-900/20" />
      </SectionCard>

      {/* ══════════════════════════════════════════════════════════════════════════
          V. CRIME INFORMATION
      ══════════════════════════════════════════════════════════════════════════ */}
      <SectionCard anchor="sec-crime" icon={MapPin} color="text-red-400" title="V. Crime Information">
        <div className="space-y-3">
          <div className={G3}>
            <div>
              <label className={LBL}>Date of Crime</label>
              <input type="date" value={report.crime_info.date_of_crime}
                onChange={e => upd('crime_info', { ...report.crime_info, date_of_crime: e.target.value })} className={INP} />
            </div>
            <div>
              <label className={LBL}>Time of Crime</label>
              <input type="time" value={report.crime_info.time_of_crime}
                onChange={e => upd('crime_info', { ...report.crime_info, time_of_crime: e.target.value })} className={INP} />
            </div>
            <div>
              <label className={LBL}>Province</label>
              <select value={report.crime_info.province}
                onChange={e => upd('crime_info', { ...report.crime_info, province: e.target.value })} className={SEL}>
                <option value="">— Select —</option>
                {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className={G3}>
            <div>
              <label className={LBL}>District</label>
              <input value={report.crime_info.district}
                onChange={e => upd('crime_info', { ...report.crime_info, district: e.target.value })}
                className={INP} placeholder="District" />
            </div>
            <div>
              <label className={LBL}>Sector</label>
              <input value={report.crime_info.sector}
                onChange={e => upd('crime_info', { ...report.crime_info, sector: e.target.value })}
                className={INP} placeholder="Sector" />
            </div>
            <div>
              <label className={LBL}>Cell</label>
              <input value={report.crime_info.cell}
                onChange={e => upd('crime_info', { ...report.crime_info, cell: e.target.value })}
                className={INP} placeholder="Cell" />
            </div>
          </div>

          <div className={G2}>
            <div>
              <label className={LBL}>Village</label>
              <input value={report.crime_info.village}
                onChange={e => upd('crime_info', { ...report.crime_info, village: e.target.value })}
                className={INP} placeholder="Village" />
            </div>
            <div>
              <label className={LBL}>GPS Coordinates (optional)</label>
              <div className="flex gap-2">
                <input value={report.crime_info.gps_lat}
                  onChange={e => upd('crime_info', { ...report.crime_info, gps_lat: e.target.value })}
                  className={INP} placeholder="Lat" />
                <input value={report.crime_info.gps_lng}
                  onChange={e => upd('crime_info', { ...report.crime_info, gps_lng: e.target.value })}
                  className={INP} placeholder="Lng" />
              </div>
            </div>
          </div>

          <div>
            <label className={LBL}>Exact Crime Scene</label>
            <textarea value={report.crime_info.exact_scene}
              onChange={e => upd('crime_info', { ...report.crime_info, exact_scene: e.target.value })}
              rows={3} className={INP + ' resize-none'}
              placeholder="Precise description of the crime scene location and surroundings…" />
          </div>
        </div>
      </SectionCard>

      {/* ══════════════════════════════════════════════════════════════════════════
          VI. EXHIBITS
      ══════════════════════════════════════════════════════════════════════════ */}
      <SectionCard anchor="sec-exhibits" icon={Package} color="text-orange-400"
        title="VI. Exhibits" badge={report.exhibits.length} defaultOpen={false}>
        <div className="space-y-3">
          {report.exhibits.map((ex, i) => (
            <ExhibitCard key={ex.id} exhibit={ex} index={i}
              onUpdate={u => upd('exhibits', report.exhibits.map(x => x.id === ex.id ? u : x))}
              onRemove={() => upd('exhibits', report.exhibits.filter(x => x.id !== ex.id))}
              canRemove={report.exhibits.length > 1} />
          ))}
        </div>
        <AddBtn
          onClick={() => upd('exhibits', [...report.exhibits, mkExhibit(report.exhibits.length + 1)])}
          label="Add Exhibit"
          color="text-orange-400 border-orange-700/50 hover:bg-orange-900/20" />
      </SectionCard>

      {/* ══════════════════════════════════════════════════════════════════════════
          VII. INVESTIGATORS / EXPERTS
      ══════════════════════════════════════════════════════════════════════════ */}
      <SectionCard anchor="sec-invests" icon={Users} color="text-slate-400"
        title="VII. Investigators / Experts" badge={report.investigators.length}>
        <div className="space-y-3">
          {report.investigators.map((inv, i) => (
            <InvestigatorCard key={inv.id} inv={inv} index={i}
              onUpdate={u => upd('investigators', report.investigators.map(x => x.id === inv.id ? u : x))}
              onRemove={() => upd('investigators', report.investigators.filter(x => x.id !== inv.id))}
              canRemove={report.investigators.length > 1} />
          ))}
        </div>
        <AddBtn
          onClick={() => upd('investigators', [...report.investigators, mkInvestigator()])}
          label="Add Investigator / Expert"
          color="text-slate-400 border-slate-600 hover:bg-slate-800" />
      </SectionCard>

      {/* ══════════════════════════════════════════════════════════════════════════
          VIII-X. SUMMARIES & FINDINGS
      ══════════════════════════════════════════════════════════════════════════ */}
      <SectionCard anchor="sec-summaries" icon={BookOpen} color="text-teal-400"
        title="VIII–X. Summaries & Investigation Findings">
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-bold text-slate-200">VIII. Crime Summary</label>
              <span className="text-[11px] text-slate-500">{report.crime_summary.length} chars</span>
            </div>
            <p className="text-xs text-slate-500 mb-2">Describe in detail how the crime was committed.</p>
            <textarea value={report.crime_summary}
              onChange={e => upd('crime_summary', e.target.value)}
              rows={8} className={INP + ' resize-y min-h-[160px]'}
              placeholder="Provide a comprehensive narrative of how the crime was committed. Include the sequence of events, methods used, weapons or tools involved, time, and any other relevant circumstances that led to or surrounded the criminal act…" />
          </div>

          <div className="border-t border-slate-800 pt-5">
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-bold text-slate-200">IX. Charge Summary</label>
              <span className="text-[11px] text-slate-500">{report.charge_summary.length} chars</span>
            </div>
            <p className="text-xs text-slate-500 mb-2">Summarize charges against the suspect(s).</p>
            <textarea value={report.charge_summary}
              onChange={e => upd('charge_summary', e.target.value)}
              rows={6} className={INP + ' resize-y min-h-[120px]'}
              placeholder="List and describe all charges brought against each suspect. Reference applicable articles of law, penal code provisions, and legal basis for prosecution…" />
          </div>

          <div className="border-t border-slate-800 pt-5">
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-bold text-slate-200">X. Investigation Findings</label>
              <span className="text-[11px] text-slate-500">{report.investigation_findings.length} chars</span>
            </div>
            <p className="text-xs text-slate-500 mb-2">Conclusions reached by investigators and intelligence analysis.</p>
            <textarea value={report.investigation_findings}
              onChange={e => upd('investigation_findings', e.target.value)}
              rows={8} className={INP + ' resize-y min-h-[160px]'}
              placeholder="Summarize the key findings from the investigation. Include evidence gathered, forensic analysis, intelligence assessments, witness corroborations, and final investigative conclusions with recommended next steps…" />
          </div>
        </div>
      </SectionCard>

      {/* ══════════════════════════════════════════════════════════════════════════
          XI. INVESTIGATION DOCUMENTS
      ══════════════════════════════════════════════════════════════════════════ */}
      <SectionCard anchor="sec-docs" icon={FileText} color="text-slate-400"
        title="XI. Investigation Documents" defaultOpen={false}>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="py-2.5 px-3 text-left text-xs font-medium text-slate-400 w-8">#</th>
                <th className="py-2.5 px-3 text-left text-xs font-medium text-slate-400">Document Type</th>
                <th className="py-2.5 px-3 text-left text-xs font-medium text-slate-400">Upload File</th>
                <th className="py-2.5 px-3 text-left text-xs font-medium text-slate-400">Date Uploaded</th>
                <th className="py-2.5 px-3 text-left text-xs font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {DOC_TYPES.map((name, idx) => {
                const entry = report.documents[name]
                const hasFile = !!entry?.file_name
                const handleUpload = (file: File | null, mode: 'add' | 'replace') => {
                  if (!file) return
                  upd('documents', {
                    ...report.documents,
                    [name]: { file_name: file.name, upload_date: new Date().toISOString().slice(0, 10) },
                  })
                }
                return (
                  <tr key={name} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                    <td className="py-2.5 px-3 text-xs text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-200 font-medium">{name}</td>
                    <td className="py-2.5 px-3">
                      {!hasFile ? (
                        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer hover:text-teal-400 transition">
                          <FileUp className="h-3.5 w-3.5" /> Upload
                          <input type="file" className="hidden"
                            onChange={e => handleUpload(e.target.files?.[0] ?? null, 'add')} />
                        </label>
                      ) : (
                        <span className="text-xs text-teal-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          <span className="truncate max-w-[150px]">{entry.file_name}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-400">{entry?.upload_date || '—'}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        {hasFile && (
                          <>
                            <button type="button" title="View"
                              className="text-slate-500 hover:text-teal-400 transition">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" title="Download"
                              className="text-slate-500 hover:text-blue-400 transition">
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            <label title="Replace" className="text-slate-500 hover:text-amber-400 transition cursor-pointer">
                              <RefreshCw className="h-3.5 w-3.5" />
                              <input type="file" className="hidden"
                                onChange={e => handleUpload(e.target.files?.[0] ?? null, 'replace')} />
                            </label>
                            <button type="button" title="Delete"
                              onClick={() => {
                                const d = { ...report.documents }
                                delete d[name]
                                upd('documents', d)
                              }}
                              className="text-slate-500 hover:text-red-400 transition">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Investigator Profile Footer ── */}
      <div className="rounded-xl border border-teal-900/40 bg-teal-950/10 p-5">
        <h3 className="text-sm font-bold text-white mb-4">Investigator Profile — Report Footer</h3>
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs flex-1">
            <div><span className="text-slate-500">Investigator Name:</span> <span className="text-slate-200 font-semibold ml-1">{user?.full_name ?? '—'}</span></div>
            <div><span className="text-slate-500">Rank:</span> <span className="text-slate-200 font-semibold ml-1">{user?.role?.replace(/_/g,' ') ?? '—'}</span></div>
            <div><span className="text-slate-500">Badge Number:</span> <span className="text-slate-200 font-mono ml-1">{user?.badge_number ?? '—'}</span></div>
            <div><span className="text-slate-500">Institution:</span> <span className="text-slate-200 font-semibold ml-1">{user?.institution ?? '—'}</span></div>
            <div><span className="text-slate-500">Report Date:</span> <span className="text-slate-200 ml-1">{format(new Date(), 'dd MMM yyyy')}</span></div>
            <div><span className="text-slate-500">Time:</span> <span className="text-slate-200 ml-1">{format(new Date(), 'HH:mm')}</span></div>
          </div>

          <div className="text-center shrink-0">
            <p className="text-[11px] text-slate-500 mb-2 uppercase tracking-wide">Digital Signature</p>
            {signatureDataUrl ? (
              <div className="relative">
                <img src={signatureDataUrl} alt="Signature" className="h-20 w-48 object-contain rounded-lg border border-teal-700 bg-slate-800/40" />
                <button onClick={() => setSignatureDataUrl(null)}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-500">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-20 w-48 rounded-lg border border-dashed border-slate-600 bg-slate-800/40 cursor-pointer hover:border-teal-600 hover:bg-teal-900/10 transition">
                <FileUp className="h-4 w-4 text-slate-500 mb-1" />
                <span className="text-xs text-slate-500">Upload Signature</span>
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleSignatureUpload(f) }} />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom action bar ── */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4 no-print">
        <span className="text-xs text-slate-500">
          {saveMsg
            ? <span className="text-teal-400 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> {saveMsg}</span>
            : `Auto-saved · ${completion}% complete`}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={saveDraft} disabled={saving}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Draft
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg border border-teal-700/50 bg-teal-900/20 px-4 py-2 text-sm font-semibold text-teal-300 hover:bg-teal-900/40 transition">
            <Printer className="h-4 w-4" /> Download PDF
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || submitDone}
            className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50 transition">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {submitDone ? 'Submitted ✓' : 'Submit Investigation'}
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { patrolApi } from '@/lib/api'
import {
  CheckCircle, XCircle, Scan, CreditCard, Shield, MapPin,
  AlertTriangle, Loader2, Radio,
} from 'lucide-react'
import clsx from 'clsx'

type Tab = 'NID' | 'FACE'
type GpsStatus = 'idle' | 'requesting' | 'ready' | 'denied'

const THREAT_COLORS: Record<number, string> = {
  1: 'text-yellow-400', 2: 'text-yellow-400', 3: 'text-yellow-400',
  4: 'text-orange-400', 5: 'text-orange-400', 6: 'text-orange-400',
  7: 'text-red-400',    8: 'text-red-400',    9: 'text-red-400', 10: 'text-red-500',
}

const STATUS_LABEL: Record<string, string> = {
  WANTED:    'WANTED',
  ARRESTED:  'UNDER ARREST',
  CONVICTED: 'CONVICTED',
  MISSING:   'MISSING — SUSPECT',
}

export default function PatrolCheckPage() {
  const { user } = useAuth()

  const [tab, setTab] = useState<Tab>('NID')

  // GPS state
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  // NID check state
  const [nid, setNid] = useState('')
  const [nidError, setNidError] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{
    found: boolean
    classification?: { status: string; threat_level: number; owning_institution: string }
  } | null>(null)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Face scan state
  const [scanning, setScanning] = useState(false)
  const [faceResult, setFaceResult] = useState<{ found: boolean; confidence: number } | null>(null)

  useEffect(() => {
    return () => { if (clearTimer.current) clearTimeout(clearTimer.current) }
  }, [])

  // Auto-request GPS on mount
  useEffect(() => {
    if (!navigator.geolocation) return
    setGpsStatus('requesting')
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsStatus('ready')
      },
      () => setGpsStatus('denied'),
      { timeout: 10000, maximumAge: 60000 }
    )
  }, [])

  async function handleNidVerify() {
    setNidError('')
    setResult(null)
    if (clearTimer.current) clearTimeout(clearTimer.current)

    if (!/^\d{16}$/.test(nid)) {
      setNidError('NID must be exactly 16 digits.')
      return
    }

    setChecking(true)
    try {
      const resp = await patrolApi.checkNid(nid, coords
        ? { lat: coords.lat, lng: coords.lng, description: undefined }
        : undefined
      )
      setResult(resp.data)
      clearTimer.current = setTimeout(() => setResult(null), 12000)
    } catch {
      setNidError('Check failed — network error. Try again.')
    } finally {
      setChecking(false)
    }
  }

  function handleFaceScan() {
    setFaceResult(null)
    setScanning(true)
    setTimeout(() => {
      setScanning(false)
      const found = Math.random() > 0.5
      setFaceResult({ found, confidence: found ? 0.85 + Math.random() * 0.14 : 0.30 + Math.random() * 0.30 })
    }, 2000)
  }

  function resetTab(t: Tab) {
    setTab(t)
    setResult(null)
    setFaceResult(null)
    setNidError('')
    setNid('')
    if (clearTimer.current) clearTimeout(clearTimer.current)
  }

  const gpsLabel = gpsStatus === 'ready'
    ? `GPS locked (${coords?.lat.toFixed(4)}, ${coords?.lng.toFixed(4)})`
    : gpsStatus === 'requesting' ? 'Acquiring GPS…'
    : gpsStatus === 'denied'    ? 'GPS unavailable'
    : 'GPS not started'

  const gpsColor = gpsStatus === 'ready' ? 'text-green-400' : gpsStatus === 'denied' ? 'text-red-400' : 'text-yellow-400'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Identity Verification</h1>
          <p className="text-sm text-slate-400 mt-0.5">Village Leader · {user?.full_name}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
            <div className="h-1.5 w-1.5 rounded-full bg-patrol animate-pulse" />
            Village Leader
          </div>
          <div className={clsx('flex items-center gap-1.5 text-[10px] font-mono', gpsColor)}>
            <MapPin className="h-3 w-3" />
            {gpsLabel}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800 pb-0">
        {(['NID', 'FACE'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => resetTab(t)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t
                ? 'border-patrol text-patrol'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            )}
          >
            {t === 'NID' ? <CreditCard className="h-4 w-4" /> : <Scan className="h-4 w-4" />}
            {t === 'NID' ? 'NID Check' : 'Face Scan'}
          </button>
        ))}
      </div>

      {/* ── NID Check Tab ── */}
      {tab === 'NID' && (
        <div className="space-y-4 max-w-md">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                National ID Number
              </label>
              <input
                value={nid}
                onChange={e => {
                  setNid(e.target.value.replace(/\D/g, '').slice(0, 16))
                  setNidError('')
                  setResult(null)
                }}
                onKeyDown={e => e.key === 'Enter' && !checking && handleNidVerify()}
                placeholder="Enter 16-digit NID"
                inputMode="numeric"
                maxLength={16}
                className={clsx(
                  'w-full bg-slate-800 border rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors font-mono tracking-widest',
                  nidError ? 'border-red-700 focus:border-red-500' : 'border-slate-700 focus:border-patrol/50'
                )}
              />
              {nidError && <p className="text-xs text-red-400 mt-1.5">{nidError}</p>}
              <p className="text-[10px] text-slate-500 mt-1">{nid.length}/16 digits</p>
            </div>
            <button
              onClick={handleNidVerify}
              disabled={nid.length === 0 || checking}
              className="w-full bg-patrol hover:bg-patrol/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {checking
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</>
                : 'Verify NID'
              }
            </button>
          </div>

          {/* ── FOUND result ── */}
          {result?.found && (
            <div className="rounded-xl border border-red-700/70 bg-red-950/20 p-5 space-y-4">
              {/* Alert header */}
              <div className="flex items-start gap-3">
                <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-400 tracking-wide">CRIMINAL RECORD FOUND</p>
                  <p className="text-xs text-red-300/70 mt-0.5">
                    Do not reveal this result to the subject. Await police instructions.
                  </p>
                </div>
              </div>

              {/* Classification */}
              {result.classification && (
                <div className="border-t border-red-900/40 pt-4 space-y-3">
                  <p className="text-[10px] uppercase text-red-400/60 font-semibold tracking-widest">Criminal Classification</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-slate-900/60 px-3 py-2">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Status</p>
                      <p className="text-xs font-bold text-red-400">
                        {STATUS_LABEL[result.classification.status] ?? result.classification.status}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-900/60 px-3 py-2">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Threat Level</p>
                      <p className={clsx(
                        'text-xs font-bold font-mono',
                        THREAT_COLORS[result.classification.threat_level] ?? 'text-slate-300'
                      )}>
                        {result.classification.threat_level ?? '—'}/10
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-900/60 px-3 py-2">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Owning Institution</p>
                    <p className="text-xs font-semibold text-slate-300">{result.classification.owning_institution}</p>
                  </div>
                </div>
              )}

              {/* Alert sent confirmation */}
              <div className="flex items-center gap-2 rounded-lg bg-amber-950/30 border border-amber-800/30 px-3 py-2">
                <Radio className="h-3.5 w-3.5 text-amber-400 animate-pulse shrink-0" />
                <p className="text-[11px] text-amber-300 font-medium">
                  CRITICAL alert dispatched to RNP Command automatically
                </p>
              </div>

              <p className="text-[10px] text-red-500/50 text-right">Result auto-clears in 12 seconds</p>
            </div>
          )}

          {/* ── CLEAN result ── */}
          {result && !result.found && (
            <div className="rounded-xl border border-green-800/40 bg-green-950/10 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-green-400">No Record Found — Data Discarded</p>
                  <p className="text-xs text-green-300/60 mt-1">
                    This person has no criminal record. Data has been discarded immediately per privacy law.
                  </p>
                  <p className="text-[10px] text-green-500/40 mt-2">Result auto-clears in 12 seconds</p>
                </div>
              </div>
            </div>
          )}

          {/* Privacy notice */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Results for citizens without criminal records are immediately discarded. No identity data is stored.
                Law No. 058/2021 — identity data may only be retained when a criminal record match is confirmed.
                {gpsStatus === 'ready' && ' GPS location is automatically shared with RNP when a record is found.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Face Scan Tab ── */}
      {tab === 'FACE' && (
        <div className="space-y-4 max-w-md">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
            <div className="relative mx-auto aspect-video max-w-[400px] rounded-xl bg-slate-950 border border-slate-700 overflow-hidden flex items-center justify-center">
              <div className={clsx(
                'absolute inset-0 rounded-xl border-2 transition-colors',
                scanning ? 'border-patrol animate-pulse' : 'border-slate-700'
              )} />
              <div className="absolute top-3 left-3 h-6 w-6 border-t-2 border-l-2 border-patrol/60 rounded-tl" />
              <div className="absolute top-3 right-3 h-6 w-6 border-t-2 border-r-2 border-patrol/60 rounded-tr" />
              <div className="absolute bottom-3 left-3 h-6 w-6 border-b-2 border-l-2 border-patrol/60 rounded-bl" />
              <div className="absolute bottom-3 right-3 h-6 w-6 border-b-2 border-r-2 border-patrol/60 rounded-br" />
              <div className="text-center z-10 space-y-3 px-4">
                <Scan className={clsx('h-10 w-10 mx-auto', scanning ? 'text-patrol animate-pulse' : 'text-slate-600')} />
                <p className="text-xs text-slate-400">Point camera at subject&apos;s face</p>
                {scanning && (
                  <div className="flex items-center justify-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-patrol animate-bounce [animation-delay:0ms]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-patrol animate-bounce [animation-delay:150ms]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-patrol animate-bounce [animation-delay:300ms]" />
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleFaceScan}
              disabled={scanning}
              className="w-full bg-patrol hover:bg-patrol/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Scan className="h-4 w-4" />
              {scanning ? 'Scanning…' : 'Scan Face'}
            </button>
          </div>

          {faceResult && (
            <div className={clsx(
              'rounded-xl border p-5',
              faceResult.found ? 'border-red-700/60 bg-red-950/20' : 'border-green-800/40 bg-green-950/10'
            )}>
              <div className="flex items-start gap-3">
                {faceResult.found
                  ? <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                  : <CheckCircle className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                }
                <div>
                  <p className={clsx('text-sm font-bold', faceResult.found ? 'text-red-400' : 'text-green-400')}>
                    {faceResult.found ? 'Record Found' : 'No Record Found'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Confidence: <span className="text-white font-mono font-medium">{(faceResult.confidence * 100).toFixed(1)}%</span>
                  </p>
                  <p className={clsx('text-xs mt-1', faceResult.found ? 'text-red-300/70' : 'text-green-300/60')}>
                    {faceResult.found
                      ? 'Alert dispatched to RNP Command. Await instructions.'
                      : 'No match found. Scan data discarded per privacy law.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-amber-800/30 bg-amber-950/10 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-500/80 leading-relaxed">
                Face scan requires DIV biometric hardware integration. The scan above is a simulator only —
                in production, biometric data is processed on-device and never transmitted without a positive match.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

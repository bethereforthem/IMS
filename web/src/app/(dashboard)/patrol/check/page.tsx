'use client'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { CheckCircle, XCircle, Scan, CreditCard, Shield } from 'lucide-react'
import clsx from 'clsx'

type Tab = 'NID' | 'FACE'

const WANTED_NIDS = ['1199780012345001', '1198800056789005', '1199560001234010']

export default function PatrolCheckPage() {
  const { user } = useAuth()
  const roleLabel = user?.role === 'IRONDO_PATROL' ? 'Irondo Patrol' : 'Dasso Officer'

  const [tab, setTab] = useState<Tab>('NID')

  // NID Check state
  const [nid, setNid] = useState('')
  const [nidError, setNidError] = useState('')
  const [nidResult, setNidResult] = useState<'FOUND' | 'CLEAN' | null>(null)
  const nidTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Face Scan state
  const [scanning, setScanning] = useState(false)
  const [faceResult, setFaceResult] = useState<{ found: boolean; confidence: number } | null>(null)

  useEffect(() => {
    return () => {
      if (nidTimerRef.current) clearTimeout(nidTimerRef.current)
    }
  }, [])

  function handleNidVerify() {
    setNidError('')
    setNidResult(null)
    if (nidTimerRef.current) clearTimeout(nidTimerRef.current)

    if (!/^\d{16}$/.test(nid)) {
      setNidError('NID must be exactly 16 digits.')
      return
    }
    const found = WANTED_NIDS.includes(nid)
    setNidResult(found ? 'FOUND' : 'CLEAN')
    nidTimerRef.current = setTimeout(() => {
      setNidResult(null)
    }, 10000)
  }

  function handleFaceScan() {
    setFaceResult(null)
    setScanning(true)
    setTimeout(() => {
      setScanning(false)
      const found = Math.random() > 0.5
      const confidence = found
        ? 0.85 + Math.random() * 0.14
        : 0.30 + Math.random() * 0.30
      setFaceResult({ found, confidence })
    }, 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Identity Verification</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {roleLabel} · {user?.full_name}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-patrol animate-pulse" />
          {roleLabel}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800 pb-0">
        {(['NID', 'FACE'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setNidResult(null); setFaceResult(null); setNidError('') }}
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

      {/* NID Check Tab */}
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
                  setNidResult(null)
                }}
                placeholder="Enter 16-digit NID number"
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
              disabled={nid.length === 0}
              className="w-full bg-patrol hover:bg-patrol/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
            >
              Verify NID
            </button>
          </div>

          {/* NID Result */}
          {nidResult === 'FOUND' && (
            <div className="rounded-xl border border-red-700/60 bg-red-950/20 p-5">
              <div className="flex items-start gap-3">
                <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-400">CRIMINAL RECORD FOUND — Alert Sent</p>
                  <p className="text-xs text-red-300/70 mt-1">
                    A record was found for this NID. An alert has been dispatched to RNP Command.
                    Do not reveal the result to the subject. Await instructions.
                  </p>
                  <p className="text-[10px] text-red-500/60 mt-2">Result auto-clears in 10 seconds</p>
                </div>
              </div>
            </div>
          )}
          {nidResult === 'CLEAN' && (
            <div className="rounded-xl border border-green-800/40 bg-green-950/10 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-green-400">No Record Found — Data Discarded</p>
                  <p className="text-xs text-green-300/60 mt-1">
                    No criminal record matched this NID. Data has been discarded immediately per privacy law.
                  </p>
                  <p className="text-[10px] text-green-500/50 mt-2">Result auto-clears in 10 seconds</p>
                </div>
              </div>
            </div>
          )}

          {/* Privacy Notice */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Results for clean citizens are immediately discarded. No data stored.
                Law No. 058/2021 — citizen identity data may only be retained if a criminal record match is confirmed.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Face Scan Tab */}
      {tab === 'FACE' && (
        <div className="space-y-4 max-w-md">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
            {/* Viewfinder */}
            <div className="relative mx-auto aspect-video max-w-[400px] rounded-xl bg-slate-950 border border-slate-700 overflow-hidden flex items-center justify-center">
              {/* Scanning border overlay */}
              <div className={clsx(
                'absolute inset-0 rounded-xl border-2 transition-colors',
                scanning ? 'border-patrol animate-pulse' : 'border-slate-700'
              )} />
              {/* Corner brackets */}
              <div className="absolute top-3 left-3 h-6 w-6 border-t-2 border-l-2 border-patrol/60 rounded-tl" />
              <div className="absolute top-3 right-3 h-6 w-6 border-t-2 border-r-2 border-patrol/60 rounded-tr" />
              <div className="absolute bottom-3 left-3 h-6 w-6 border-b-2 border-l-2 border-patrol/60 rounded-bl" />
              <div className="absolute bottom-3 right-3 h-6 w-6 border-b-2 border-r-2 border-patrol/60 rounded-br" />
              {/* Content */}
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
                {scanning && <p className="text-[10px] text-patrol">Scanning…</p>}
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

          {/* Face Result */}
          {faceResult && (
            <div className={clsx(
              'rounded-xl border p-5',
              faceResult.found
                ? 'border-red-700/60 bg-red-950/20'
                : 'border-green-800/40 bg-green-950/10'
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
                    Confidence: <span className="text-white font-mono font-medium">
                      {(faceResult.confidence * 100).toFixed(1)}%
                    </span>
                  </p>
                  <p className={clsx('text-xs mt-1', faceResult.found ? 'text-red-300/70' : 'text-green-300/60')}>
                    {faceResult.found
                      ? 'Alert dispatched to RNP Command. Await instructions.'
                      : 'No match found. Scan data discarded per privacy law.'
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Face scan requires DIV app in production — this is a simulator.
              In production, biometric data is processed on-device and never transmitted without a positive match.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

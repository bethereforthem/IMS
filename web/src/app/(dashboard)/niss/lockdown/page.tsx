'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { adminApi } from '@/lib/api'
import { Lock, AlertTriangle, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

interface Cosigner {
  id: string
  full_name: string
  badge_number: string | null
}

export default function EmergencyLockdown() {
  const { user } = useAuth()
  const [secondDirectorId, setSecondDirectorId] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cosigners, setCosigners] = useState<Cosigner[]>([])
  const [cosignersLoading, setCosignersLoading] = useState(true)
  const [cosignersError, setCosignersError] = useState<string | null>(null)

  const isDirector = user?.role === 'NISS_DIRECTOR'

  // The co-signing director is read from the user directory — never typed in
  // by hand, and never taken from seed data.
  useEffect(() => {
    if (!isDirector) { setCosignersLoading(false); return }
    let alive = true
    adminApi.getLockdownCosigners()
      .then(r => {
        if (!alive) return
        setCosigners(r.data?.directors ?? [])
        setCosignersError(null)
      })
      .catch((err: unknown) => {
        if (!alive) return
        const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        setCosignersError(detail ?? 'Could not load the director directory.')
      })
      .finally(() => { if (alive) setCosignersLoading(false) })
    return () => { alive = false }
  }, [isDirector])

  const handleLockdown = async () => {
    if (!reason || !secondDirectorId) {
      toast.error('Both fields are required')
      return
    }
    setLoading(true)
    try {
      await adminApi.emergencyLockdown(secondDirectorId, reason)
      toast.success('Emergency lockdown activated. All non-NISS sessions revoked.')
      setConfirmed(false)
      setReason('')
      setSecondDirectorId('')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Lockdown failed')
    } finally {
      setLoading(false)
    }
  }

  if (!isDirector) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <Shield className="h-12 w-12 text-slate-600 mb-4" />
        <h2 className="text-lg font-bold text-slate-300">Access Denied</h2>
        <p className="text-sm text-slate-500 mt-2">Emergency Lockdown requires NISS_DIRECTOR role.</p>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Emergency Lockdown</h1>
        <p className="text-sm text-slate-400 mt-1">
          Revokes all active sessions except NISS. Requires dual director authorization.
        </p>
      </div>

      <div className="rounded-xl border border-red-900 bg-red-950/30 p-6 space-y-5">
        <div className="flex items-center gap-3 text-red-400">
          <AlertTriangle className="h-6 w-6 shrink-0" />
          <p className="text-sm font-semibold">
            This action immediately terminates all active sessions for RNP, RIB, RDF, RCS, and Village Leader users.
            It cannot be undone except by re-authenticating.
          </p>
        </div>

        <div>
          <label htmlFor="cosigner" className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
            Co-signing NISS Director
          </label>
          <select
            id="cosigner"
            value={secondDirectorId}
            onChange={e => setSecondDirectorId(e.target.value)}
            disabled={cosignersLoading || cosigners.length === 0}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-red-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">
              {cosignersLoading
                ? 'Loading directors…'
                : cosigners.length === 0
                  ? 'No other director available'
                  : 'Select co-signing director'}
            </option>
            {cosigners.map(d => (
              <option key={d.id} value={d.id}>
                {d.full_name}{d.badge_number ? ` · ${d.badge_number}` : ''}
              </option>
            ))}
          </select>
          {cosignersError ? (
            <p className="text-[11px] text-red-400 mt-1">{cosignersError}</p>
          ) : (
            <p className="text-[11px] text-slate-500 mt-1">
              {cosignersLoading
                ? 'Reading the directory…'
                : cosigners.length === 0
                  ? 'Lockdown needs a second active NISS director on the system.'
                  : `${cosigners.length} director${cosigners.length === 1 ? '' : 's'} available to co-sign.`}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
            Reason for Lockdown
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="State the operational reason for emergency lockdown..."
            rows={3}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-red-500 focus:outline-none resize-none"
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
            className="h-4 w-4 accent-red-500"
          />
          <span className="text-sm text-slate-300">
            I, <strong>{user?.full_name}</strong> ({user?.badge_number}), authorize emergency system lockdown.
          </span>
        </label>

        <button
          onClick={handleLockdown}
          disabled={!confirmed || !reason || !secondDirectorId || loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-700 py-3 text-sm font-bold text-white transition hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Lock className="h-4 w-4" />
          {loading ? 'Activating Lockdown…' : 'ACTIVATE EMERGENCY LOCKDOWN'}
        </button>
      </div>
    </div>
  )
}

'use client'
import { Clock, LogOut, ShieldAlert } from 'lucide-react'

interface Props {
  secondsLeft: number
  onKeepAlive: () => void
  onLogout: () => void
}

export function IdleWarning({ secondsLeft, onKeepAlive, onLogout }: Props) {
  const pct = (secondsLeft / 30) * 100

  // Colour shifts red as time runs out
  const urgent = secondsLeft <= 10

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Panel */}
      <div className="relative w-full max-w-sm mx-4 border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Top accent bar */}
        <div
          className="h-1 transition-all duration-1000"
          style={{
            width: `${pct}%`,
            background: urgent
              ? 'linear-gradient(90deg,#7f1d1d,#ef4444)'
              : 'linear-gradient(90deg,#166534,#22c55e)',
          }}
        />

        <div className="p-6">
          {/* Icon + title */}
          <div className="flex items-start gap-4 mb-5">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${
              urgent ? 'border-red-800 bg-red-950/60' : 'border-amber-800 bg-amber-950/40'
            }`}>
              <ShieldAlert className={`h-5 w-5 ${urgent ? 'text-red-400' : 'text-amber-400'}`} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Session Expiring</h2>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                Your session will expire due to inactivity. Any unsaved work may be lost.
              </p>
            </div>
          </div>

          {/* Countdown ring */}
          <div className="flex flex-col items-center py-4">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="42" fill="none" stroke="#1e293b" strokeWidth="6" />
                <circle
                  cx="48" cy="48" r="42" fill="none"
                  stroke={urgent ? '#ef4444' : '#22c55e'}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - pct / 100)}`}
                  style={{ transition: 'stroke-dashoffset 1s linear, stroke 1s' }}
                />
              </svg>
              <div className="text-center">
                <p className={`text-3xl font-black tabular-nums ${urgent ? 'text-red-400' : 'text-white'}`}>
                  {secondsLeft}
                </p>
                <p className="text-[9px] text-slate-500 uppercase tracking-widest font-mono">sec</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2 font-mono tracking-wider">
              <Clock className="inline h-3 w-3 mr-1 -mt-0.5" />
              Signing out in {secondsLeft} second{secondsLeft !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-2">
            <button
              onClick={onKeepAlive}
              className="flex-1 py-2.5 text-sm font-bold text-black bg-green-500 hover:bg-green-400 transition-colors"
            >
              Stay Logged In
            </button>
            <button
              onClick={onLogout}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-400 border border-slate-700 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

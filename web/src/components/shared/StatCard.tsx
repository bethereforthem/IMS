import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'

interface Props {
  label: string
  value: string | number
  icon: LucideIcon
  variant?: 'default' | 'danger' | 'warn' | 'ok'
  sub?: string
}

const variantMap = {
  default: 'border-slate-700 bg-slate-800/60',
  danger:  'border-red-900 bg-red-950/40',
  warn:    'border-amber-900 bg-amber-950/40',
  ok:      'border-green-900 bg-green-950/40',
}
const iconMap = {
  default: 'text-slate-400',
  danger:  'text-red-400',
  warn:    'text-amber-400',
  ok:      'text-green-400',
}

export function StatCard({ label, value, icon: Icon, variant = 'default', sub }: Props) {
  return (
    <div className={clsx('rounded-xl border p-5 flex items-start gap-4', variantMap[variant])}>
      <div className={clsx('mt-0.5 shrink-0', iconMap[variant])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
        <p className="text-xs font-medium text-slate-400 mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

'use client'

interface StatsCardProps {
  icon: string
  label: string
  value: string | number
  subtitle?: string
}

export default function StatsCard({ icon, label, value, subtitle }: StatsCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 transition-shadow duration-200 hover:shadow-sm">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-muted">{label}</p>
          <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">
            {typeof value === 'number' ? value.toLocaleString('he-IL') : value}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
          )}
        </div>
        <span
          className="ms-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xl"
          role="img"
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
    </div>
  )
}

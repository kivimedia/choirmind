'use client'

type ProgressSize = 'sm' | 'md' | 'lg'
type ProgressStatus = 'fragile' | 'shaky' | 'developing' | 'solid' | 'locked'

interface ProgressBarProps {
  /** Progress value from 0 to 100 */
  value: number
  showLabel?: boolean
  className?: string
  size?: ProgressSize
  /** Override the automatic color with a specific status */
  status?: ProgressStatus
}

const sizeClasses: Record<ProgressSize, string> = {
  sm: 'h-1.5',
  md: 'h-3',
  lg: 'h-5',
}

const statusColorClasses: Record<ProgressStatus, string> = {
  fragile: 'bg-status-fragile',
  shaky: 'bg-status-shaky',
  developing: 'bg-status-developing',
  solid: 'bg-status-solid',
  locked: 'bg-status-locked',
}

function getAutoStatus(value: number): ProgressStatus {
  if (value < 20) return 'fragile'
  if (value < 40) return 'shaky'
  if (value < 60) return 'developing'
  if (value < 80) return 'solid'
  return 'locked'
}

export default function ProgressBar({
  value,
  showLabel = false,
  className = '',
  size = 'md',
  status,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const resolvedStatus = status ?? getAutoStatus(clamped)

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        dir="rtl"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className={[
          'relative w-full overflow-hidden rounded-full bg-border/40',
          sizeClasses[size],
        ].join(' ')}
      >
        <div
          className={[
            'absolute inset-block-0 inset-inline-start-0 rounded-full transition-all duration-500 ease-out',
            sizeClasses[size],
            statusColorClasses[resolvedStatus],
          ].join(' ')}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="min-w-[3ch] text-end text-sm font-medium text-text-muted tabular-nums">
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  )
}

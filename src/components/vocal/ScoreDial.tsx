'use client'

interface ScoreDialProps {
  score: number // 0-100
  label?: string
  size?: 'sm' | 'md' | 'lg'
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-status-solid'
  if (score >= 60) return 'text-status-developing'
  if (score >= 40) return 'text-status-shaky'
  return 'text-status-fragile'
}

const SIZES = {
  sm: { container: 'h-20 w-20', text: 'text-lg', radius: 32, stroke: 6 },
  md: { container: 'h-28 w-28', text: 'text-2xl', radius: 46, stroke: 8 },
  lg: { container: 'h-36 w-36', text: 'text-3xl', radius: 54, stroke: 10 },
}

export default function ScoreDial({ score, label, size = 'md' }: ScoreDialProps) {
  const cfg = SIZES[size]
  const circumference = 2 * Math.PI * cfg.radius
  const dashOffset = circumference - (circumference * Math.min(100, Math.max(0, score))) / 100
  const viewBox = `0 0 ${(cfg.radius + cfg.stroke) * 2} ${(cfg.radius + cfg.stroke) * 2}`
  const center = cfg.radius + cfg.stroke

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`relative ${cfg.container}`}>
        <svg className="h-full w-full -rotate-90" viewBox={viewBox} aria-hidden="true">
          <circle
            cx={center}
            cy={center}
            r={cfg.radius}
            fill="none"
            stroke="currentColor"
            className="text-border/40"
            strokeWidth={cfg.stroke}
          />
          <circle
            cx={center}
            cy={center}
            r={cfg.radius}
            fill="none"
            stroke="currentColor"
            className={`${scoreColor(score)} transition-all duration-700 ease-out`}
            strokeWidth={cfg.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`${cfg.text} font-bold text-foreground tabular-nums`} dir="ltr">
            {Math.round(score)}
          </span>
        </div>
      </div>
      {label && (
        <span className="text-xs text-text-muted">{label}</span>
      )}
    </div>
  )
}

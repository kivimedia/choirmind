'use client'

interface ScoreBreakdownProps {
  pitchScore: number
  timingScore: number
  dynamicsScore: number
}

function barColor(score: number): string {
  if (score >= 80) return 'bg-status-solid'
  if (score >= 60) return 'bg-status-developing'
  if (score >= 40) return 'bg-status-shaky'
  return 'bg-status-fragile'
}

function ScoreBar({ label, score, weight }: { label: string; score: number; weight: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{weight}</span>
          <span className="text-sm font-bold text-foreground tabular-nums" dir="ltr">
            {Math.round(score)}
          </span>
        </div>
      </div>
      <div className="h-2.5 w-full rounded-full bg-border/40 overflow-hidden" dir="rtl">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor(score)}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </div>
  )
}

export default function ScoreBreakdown({ pitchScore, timingScore, dynamicsScore }: ScoreBreakdownProps) {
  return (
    <div className="space-y-3">
      <ScoreBar label={'גובה הצליל'} score={pitchScore} weight="50%" />
      <ScoreBar label={'תזמון'} score={timingScore} weight="30%" />
      <ScoreBar label={'דינמיקה'} score={dynamicsScore} weight="20%" />
    </div>
  )
}

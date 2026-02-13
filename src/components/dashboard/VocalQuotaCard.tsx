'use client'

interface VocalQuotaCardProps {
  secondsUsed: number
  secondsLimit: number
}

interface LastVocalScoreProps {
  songTitle: string
  voicePart: string
  score: number
  previousScore: number | null
}

export function VocalQuotaCard({ secondsUsed, secondsLimit }: VocalQuotaCardProps) {
  const remaining = Math.max(0, secondsLimit - secondsUsed)
  const minutes = Math.floor(remaining / 60)
  const isLow = remaining < 300 // 5 minutes

  return (
    <div className={[
      'rounded-lg border p-3',
      isLow
        ? 'border-status-fragile/30 bg-status-fragile/5'
        : 'border-border bg-surface',
    ].join(' ')}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{'🎤'}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {'ניתוח קולי'}
          </p>
          <p className="text-xs text-text-muted">
            {minutes > 0
              ? `${minutes} דקות חינמיות נותרו`
              : 'הזמן החינמי נגמר'
            }
          </p>
        </div>
      </div>
      {/* Usage bar */}
      <div className="mt-2 h-1.5 w-full rounded-full bg-border/40 overflow-hidden" dir="rtl">
        <div
          className={[
            'h-full rounded-full transition-all duration-500',
            isLow ? 'bg-status-fragile' : 'bg-primary',
          ].join(' ')}
          style={{
            width: `${Math.min(100, Math.round((secondsUsed / secondsLimit) * 100))}%`,
          }}
        />
      </div>
    </div>
  )
}

export function LastVocalScore({ songTitle, score, previousScore }: LastVocalScoreProps) {
  const trend = previousScore !== null ? score - previousScore : null

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {'ציון אחרון: '}{songTitle}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-bold text-primary tabular-nums" dir="ltr">
              {score}
            </span>
            {trend !== null && (
              <span
                className={[
                  'text-sm font-semibold tabular-nums',
                  trend > 0 ? 'text-status-solid' : trend < 0 ? 'text-status-fragile' : 'text-text-muted',
                ].join(' ')}
                dir="ltr"
              >
                {trend > 0 ? `+${trend}` : trend === 0 ? '±0' : `${trend}`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

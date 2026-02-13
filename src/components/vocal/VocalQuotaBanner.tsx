'use client'

interface VocalQuotaBannerProps {
  secondsUsed: number
  secondsLimit: number
}

export default function VocalQuotaBanner({ secondsUsed, secondsLimit }: VocalQuotaBannerProps) {
  const remaining = Math.max(0, secondsLimit - secondsUsed)
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const isLow = remaining < 300
  const isExhausted = remaining === 0

  if (isExhausted) {
    return (
      <div className="rounded-lg border border-status-fragile/30 bg-status-fragile/5 p-3 text-center">
        <p className="text-sm font-medium text-status-fragile">
          {'הזמן החינמי לניתוח קולי נגמר'}
        </p>
        <p className="text-xs text-text-muted mt-1">
          {'שדרגו למנוי כדי להמשיך'}
        </p>
      </div>
    )
  }

  return (
    <div
      className={[
        'rounded-lg border p-3 text-center',
        isLow
          ? 'border-status-shaky/30 bg-status-shaky/5'
          : 'border-border bg-surface',
      ].join(' ')}
    >
      <p className="text-sm text-text-muted">
        {'זמן חינמי נותר:'}
      </p>
      <p className={`text-lg font-bold tabular-nums ${isLow ? 'text-status-shaky' : 'text-foreground'}`} dir="ltr">
        {minutes}:{seconds.toString().padStart(2, '0')}
      </p>
    </div>
  )
}

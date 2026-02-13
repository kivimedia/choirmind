'use client'

interface VocalQuotaBannerProps {
  secondsUsed: number
  secondsLimit: number
}

export default function VocalQuotaBanner({ secondsUsed, secondsLimit }: VocalQuotaBannerProps) {
  const remaining = Math.max(0, secondsLimit - secondsUsed)
  const minutes = Math.ceil(remaining / 60)
  const isLow = remaining < 300
  const isExhausted = remaining === 0

  if (isExhausted) {
    return (
      <span className="text-xs text-status-fragile">
        {'ניתוח קולי חינמי נגמר'}
      </span>
    )
  }

  return (
    <span className={`text-xs tabular-nums ${isLow ? 'text-status-shaky' : 'text-text-muted'}`}>
      {minutes} {'דק׳ ניתוח קולי חינמי'}
    </span>
  )
}

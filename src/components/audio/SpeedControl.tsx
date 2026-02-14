'use client'

interface SpeedControlProps {
  rate: number
  onRateChange: (rate: number) => void
}

const STEP = 0.05
const MIN_RATE = 0.5
const MAX_RATE = 2

export default function SpeedControl({ rate, onRateChange }: SpeedControlProps) {
  const canDecrease = rate > MIN_RATE
  const canIncrease = rate < MAX_RATE

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={!canDecrease}
        onClick={() => onRateChange(Math.max(MIN_RATE, +(rate - STEP).toFixed(2)))}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-sm font-bold text-text-muted transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Slower"
      >
        -
      </button>
      <span className="min-w-[3rem] text-center text-xs font-semibold text-foreground tabular-nums">
        {rate.toFixed(2)}x
      </span>
      <button
        type="button"
        disabled={!canIncrease}
        onClick={() => onRateChange(Math.min(MAX_RATE, +(rate + STEP).toFixed(2)))}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-sm font-bold text-text-muted transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Faster"
      >
        +
      </button>
    </div>
  )
}

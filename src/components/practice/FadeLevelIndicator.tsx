'use client'

import { getFadeLevelLabel, MIN_FADE_LEVEL, MAX_FADE_LEVEL } from '@/lib/fade-engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FadeLevelIndicatorProps {
  /** Current fade level (0-5). */
  level: number
  /** Song title to display. */
  songTitle: string
  /** Chunk label (e.g., "בית 1", "פזמון"). */
  chunkLabel: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEVEL_COUNT = MAX_FADE_LEVEL - MIN_FADE_LEVEL + 1 // 6 levels (0..5)

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FadeLevelIndicator({
  level,
  songTitle,
  chunkLabel,
}: FadeLevelIndicatorProps) {
  const clampedLevel = Math.max(MIN_FADE_LEVEL, Math.min(MAX_FADE_LEVEL, level))

  return (
    <div dir="rtl" className="w-full text-start">
      {/* Song and chunk info */}
      <div className="mb-3">
        <h2 className="text-lg font-bold text-foreground truncate">
          {songTitle}
        </h2>
        <p className="text-sm text-text-muted">{chunkLabel}</p>
      </div>

      {/* Step indicator dots */}
      <div className="flex items-center gap-2 mb-2">
        {Array.from({ length: LEVEL_COUNT }, (_, i) => {
          const isActive = i === clampedLevel
          const isPast = i < clampedLevel

          return (
            <div
              key={i}
              className={[
                'flex-shrink-0 rounded-full transition-all duration-300',
                isActive
                  ? 'w-4 h-4 bg-primary ring-2 ring-primary-light ring-offset-2 ring-offset-surface'
                  : isPast
                    ? 'w-3 h-3 bg-primary-light'
                    : 'w-3 h-3 bg-border',
              ].join(' ')}
              aria-label={`רמה ${i}: ${getFadeLevelLabel(i)}`}
              aria-current={isActive ? 'step' : undefined}
            />
          )
        })}
      </div>

      {/* Current level label */}
      <p className="text-sm font-medium text-primary">
        <span className="text-text-muted">רמה {clampedLevel}:</span>{' '}
        {getFadeLevelLabel(clampedLevel)}
      </p>
    </div>
  )
}

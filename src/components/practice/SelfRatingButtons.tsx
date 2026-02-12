'use client'

import { useCallback } from 'react'
import type { SelfRatingLabel } from '@/lib/fade-engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SelfRatingButtonsProps {
  onRate: (rating: SelfRatingLabel) => void
  disabled?: boolean
}

// ---------------------------------------------------------------------------
// Button config
// ---------------------------------------------------------------------------

interface RatingOption {
  rating: SelfRatingLabel
  label: string
  bgClass: string
  hoverBgClass: string
  activeBgClass: string
  ringClass: string
}

const RATING_OPTIONS: RatingOption[] = [
  {
    rating: 'nailed_it',
    label: '\u202Bשלטתי בזה\u202C',
    bgClass: 'bg-status-solid',
    hoverBgClass: 'hover:bg-status-solid/90',
    activeBgClass: 'active:bg-status-solid/80',
    ringClass: 'focus-visible:ring-status-solid/50',
  },
  {
    rating: 'almost',
    label: '\u202Bכמעט\u202C',
    bgClass: 'bg-amber-500',
    hoverBgClass: 'hover:bg-amber-600',
    activeBgClass: 'active:bg-amber-700',
    ringClass: 'focus-visible:ring-amber-500/50',
  },
  {
    rating: 'struggling',
    label: '\u202Bמתקשה\u202C',
    bgClass: 'bg-danger',
    hoverBgClass: 'hover:bg-danger/90',
    activeBgClass: 'active:bg-danger/80',
    ringClass: 'focus-visible:ring-danger/50',
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SelfRatingButtons({
  onRate,
  disabled = false,
}: SelfRatingButtonsProps) {
  const handleRate = useCallback(
    (rating: SelfRatingLabel) => {
      if (!disabled) {
        onRate(rating)
      }
    },
    [onRate, disabled],
  )

  return (
    <div
      dir="rtl"
      className="flex flex-col gap-3 sm:flex-row sm:gap-4 w-full"
    >
      {RATING_OPTIONS.map((option) => (
        <button
          key={option.rating}
          type="button"
          disabled={disabled}
          onClick={() => handleRate(option.rating)}
          className={[
            'flex-1 rounded-xl px-4 py-4 text-lg font-semibold text-white',
            'min-h-[48px]',
            'transition-colors duration-150 ease-in-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            option.bgClass,
            option.hoverBgClass,
            option.activeBgClass,
            option.ringClass,
          ].join(' ')}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

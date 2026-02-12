'use client'

import type { VoicePart } from '@/lib/audio/types'

const VOICE_PART_LABELS: Record<string, { he: string; en: string }> = {
  soprano:  { he: 'סופרן', en: 'Soprano' },
  mezzo:    { he: 'מצו', en: 'Mezzo' },
  alto:     { he: 'אלט', en: 'Alto' },
  tenor:    { he: 'טנור', en: 'Tenor' },
  baritone: { he: 'בריטון', en: 'Baritone' },
  bass:     { he: 'בס', en: 'Bass' },
  mix:      { he: 'מיקס', en: 'Mix' },
  playback: { he: 'פלייבק', en: 'Playback' },
  full:     { he: 'מלא', en: 'Full' },
}

/** Display order for voice parts in the selector. */
const DISPLAY_ORDER: VoicePart[] = [
  'soprano', 'mezzo', 'alto', 'tenor', 'baritone', 'bass', 'mix', 'playback', 'full',
]

interface VoicePartSelectorProps {
  availableParts: VoicePart[]
  selectedPart: VoicePart | null
  onSelect: (part: VoicePart) => void
  locale?: string
}

export default function VoicePartSelector({
  availableParts,
  selectedPart,
  onSelect,
  locale = 'he',
}: VoicePartSelectorProps) {
  if (availableParts.length <= 1) return null

  const orderedParts = DISPLAY_ORDER.filter((p) => availableParts.includes(p))

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
      {orderedParts.map((part) => {
        const isSelected = selectedPart === part
        const label = VOICE_PART_LABELS[part]?.[locale === 'he' ? 'he' : 'en'] ?? part
        return (
          <button
            key={part}
            type="button"
            onClick={() => onSelect(part)}
            className={[
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap',
              isSelected
                ? 'bg-primary text-white'
                : 'bg-surface border border-border text-text-muted hover:border-primary/50 hover:text-foreground',
            ].join(' ')}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

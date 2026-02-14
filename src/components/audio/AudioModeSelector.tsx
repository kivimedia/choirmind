'use client'

export type AudioMode = 'full_mix' | 'vocals_only' | 'music_only'

interface AudioModeSelectorProps {
  available: { fullMix: boolean; vocalsOnly: boolean; musicOnly: boolean }
  selected: AudioMode
  onChange: (mode: AudioMode) => void
  className?: string
}

const MODES: { key: AudioMode; label: string; availKey: keyof AudioModeSelectorProps['available']; icon: string }[] = [
  { key: 'full_mix', label: 'שיר מלא', availKey: 'fullMix', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3' },
  { key: 'vocals_only', label: 'קול בלבד', availKey: 'vocalsOnly', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
  { key: 'music_only', label: 'מוזיקה בלבד', availKey: 'musicOnly', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z' },
]

export default function AudioModeSelector({ available, selected, onChange, className }: AudioModeSelectorProps) {
  return (
    <div className={`flex items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-1 ${className ?? ''}`}>
      {MODES.map(({ key, label, availKey, icon }) => {
        const isAvailable = available[availKey]
        const isActive = selected === key
        return (
          <button
            key={key}
            type="button"
            disabled={!isAvailable}
            onClick={() => onChange(key)}
            className={[
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors text-xs font-medium whitespace-nowrap',
              isActive
                ? 'bg-primary text-white'
                : isAvailable
                  ? 'text-text-muted hover:bg-surface-hover'
                  : 'text-text-muted/40 cursor-not-allowed',
            ].join(' ')}
            title={!isAvailable ? `${label} לא זמין` : label}
          >
            <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
            {label}
          </button>
        )
      })}
    </div>
  )
}

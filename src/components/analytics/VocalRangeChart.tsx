'use client'

import Card from '@/components/ui/Card'

interface VocalRangeChartProps {
  pitchRange: { min: number; max: number } | null
}

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function hzToNote(hz: number): string {
  if (hz <= 0) return '—'
  const midi = 12 * Math.log2(hz / 440) + 69
  const note = noteNames[Math.round(midi) % 12]
  const octave = Math.floor(Math.round(midi) / 12) - 1
  return `${note}${octave}`
}

export default function VocalRangeChart({ pitchRange }: VocalRangeChartProps) {
  if (!pitchRange) {
    return (
      <Card
        header={
          <h3 className="text-sm font-semibold text-foreground">טווח קולי</h3>
        }
      >
        <p className="py-4 text-center text-sm text-text-muted">
          אין נתוני טווח קולי — צריך יותר תרגול
        </p>
      </Card>
    )
  }

  const minNote = hzToNote(pitchRange.min)
  const maxNote = hzToNote(pitchRange.max)

  // Normalize range to a visual bar (typical vocal range: 80Hz - 1000Hz)
  const rangeMin = 80
  const rangeMax = 1000
  const leftPct = Math.max(0, ((pitchRange.min - rangeMin) / (rangeMax - rangeMin)) * 100)
  const rightPct = Math.min(100, ((pitchRange.max - rangeMin) / (rangeMax - rangeMin)) * 100)
  const width = Math.max(5, rightPct - leftPct)

  return (
    <Card
      header={
        <h3 className="text-sm font-semibold text-foreground">טווח קולי</h3>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-mono text-foreground" dir="ltr">{minNote}</span>
          <span className="text-text-muted">—</span>
          <span className="font-mono text-foreground" dir="ltr">{maxNote}</span>
        </div>

        {/* Visual range bar */}
        <div className="relative h-4 rounded-full bg-border/20">
          <div
            className="absolute top-0 h-full rounded-full bg-gradient-to-l from-primary to-secondary"
            style={{ left: `${leftPct}%`, width: `${width}%` }}
          />
        </div>

        <div className="flex justify-between text-[10px] text-text-muted" dir="ltr">
          <span>C2</span>
          <span>C3</span>
          <span>C4</span>
          <span>C5</span>
          <span>C6</span>
        </div>
      </div>
    </Card>
  )
}

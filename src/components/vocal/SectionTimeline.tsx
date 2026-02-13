'use client'

interface SectionScore {
  label: string
  score: number
  startMs: number
  endMs: number
}

interface SectionTimelineProps {
  sections: SectionScore[]
  totalDurationMs: number
}

function sectionColor(score: number): string {
  if (score >= 80) return 'bg-status-solid'
  if (score >= 60) return 'bg-status-developing'
  if (score >= 40) return 'bg-status-shaky'
  return 'bg-status-fragile'
}

export default function SectionTimeline({ sections, totalDurationMs }: SectionTimelineProps) {
  if (sections.length === 0 || totalDurationMs === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">
        {'ציון לפי קטע'}
      </h3>
      {/* Timeline bar */}
      <div className="flex h-6 w-full rounded-full overflow-hidden gap-0.5" dir="rtl">
        {sections.map((section, i) => {
          const width = ((section.endMs - section.startMs) / totalDurationMs) * 100
          return (
            <div
              key={i}
              className={`${sectionColor(section.score)} transition-all relative group`}
              style={{ width: `${Math.max(2, width)}%` }}
              title={`${section.label}: ${Math.round(section.score)}`}
            >
              {/* Tooltip on hover */}
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                <div className="rounded bg-foreground px-2 py-1 text-[10px] text-surface whitespace-nowrap">
                  {section.label}: {Math.round(section.score)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {sections.map((section, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={`h-2.5 w-2.5 rounded-sm ${sectionColor(section.score)}`} />
            <span className="text-[11px] text-text-muted">
              {section.label} ({Math.round(section.score)})
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

'use client'

interface Chunk {
  id: string
  label: string
  status: string
}

interface ChunkStatusGridProps {
  chunks: Chunk[]
}

const statusColorMap: Record<string, string> = {
  fragile: 'bg-status-fragile',
  shaky: 'bg-status-shaky',
  developing: 'bg-status-developing',
  solid: 'bg-status-solid',
  locked_in: 'bg-status-locked',
  locked: 'bg-status-locked',
}

const statusLabelMap: Record<string, string> = {
  fragile: '\u05E9\u05D1\u05E8\u05D9\u05E8\u05D9',
  shaky: '\u05E8\u05D5\u05E2\u05D3',
  developing: '\u05DE\u05EA\u05E4\u05EA\u05D7',
  solid: '\u05D9\u05E6\u05D9\u05D1',
  locked_in: '\u05E0\u05E2\u05D5\u05DC',
  locked: '\u05E0\u05E2\u05D5\u05DC',
}

export default function ChunkStatusGrid({ chunks }: ChunkStatusGridProps) {
  if (chunks.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        {'\u05D0\u05D9\u05DF \u05E7\u05D8\u05E2\u05D9\u05DD'}
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {chunks.map((chunk) => {
        const colorClass = statusColorMap[chunk.status] || 'bg-border'
        const statusLabel = statusLabelMap[chunk.status] || chunk.status

        return (
          <div
            key={chunk.id}
            title={`${chunk.label} \u2014 ${statusLabel}`}
            className={[
              'h-5 w-5 rounded-sm transition-transform duration-150',
              'hover:scale-125 cursor-default',
              colorClass,
            ].join(' ')}
            role="img"
            aria-label={`${chunk.label}: ${statusLabel}`}
          />
        )
      })}
    </div>
  )
}

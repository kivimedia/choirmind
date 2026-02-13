'use client'

import Link from 'next/link'
import Badge from '@/components/ui/Badge'

interface WeakChunk {
  chunkId: string
  songTitle: string
  chunkLabel: string
  memoryStrength: number
  status: string
}

interface WeakestChunksProps {
  chunks: WeakChunk[]
}

function statusVariant(status: string) {
  const map: Record<string, 'fragile' | 'shaky' | 'developing' | 'solid' | 'locked'> = {
    fragile: 'fragile',
    shaky: 'shaky',
    developing: 'developing',
    solid: 'solid',
    locked_in: 'locked',
  }
  return map[status] ?? 'default' as 'fragile'
}

export default function WeakestChunks({ chunks }: WeakestChunksProps) {
  if (chunks.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">
        {'קטעים לחיזוק'}
      </h3>
      <div className="space-y-1.5">
        {chunks.map((chunk) => (
          <Link
            key={chunk.chunkId}
            href="/practice"
            className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary-light"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {chunk.chunkLabel}
              </p>
              <p className="truncate text-xs text-text-muted">
                {chunk.songTitle}
              </p>
            </div>
            <Badge variant={statusVariant(chunk.status)}>
              {Math.round(chunk.memoryStrength * 100)}%
            </Badge>
          </Link>
        ))}
      </div>
    </div>
  )
}

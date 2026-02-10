'use client'

import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import ProgressBar from '@/components/ui/ProgressBar'
import ChunkStatusGrid from './ChunkStatusGrid'

interface ChunkData {
  id: string
  label: string
  status: string
}

interface SongData {
  id: string
  title: string
  composer?: string | null
  chunks: ChunkData[]
}

interface SongReadinessCardProps {
  song: SongData
  targetDate?: string
}

function calculateSolidPercent(chunks: ChunkData[]): number {
  if (chunks.length === 0) return 0
  const solidCount = chunks.filter(
    (c) => c.status === 'solid' || c.status === 'locked_in' || c.status === 'locked'
  ).length
  return Math.round((solidCount / chunks.length) * 100)
}

export default function SongReadinessCard({ song, targetDate }: SongReadinessCardProps) {
  const router = useRouter()
  const readinessPercent = calculateSolidPercent(song.chunks)

  return (
    <Card
      hoverable
      onClick={() => router.push(`/songs/${song.id}`)}
      className="group"
    >
      <div className="space-y-3">
        {/* Header row: title + target date */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors truncate">
              {song.title}
            </h3>
            {song.composer && (
              <p className="mt-0.5 text-sm text-text-muted truncate">
                {song.composer}
              </p>
            )}
          </div>
          {targetDate && (
            <Badge variant="primary" className="shrink-0">
              {new Date(targetDate).toLocaleDateString('he-IL', {
                day: 'numeric',
                month: 'short',
              })}
            </Badge>
          )}
        </div>

        {/* Chunk status grid */}
        <ChunkStatusGrid chunks={song.chunks} />

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <ProgressBar value={readinessPercent} showLabel size="sm" />
        </div>
      </div>
    </Card>
  )
}

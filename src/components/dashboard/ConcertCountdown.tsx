'use client'

import Link from 'next/link'
import ProgressBar from '@/components/ui/ProgressBar'

interface ConcertData {
  songId: string
  title: string
  targetDate: string
  readinessPercent: number
}

interface ConcertCountdownProps {
  concerts: ConcertData[]
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const now = new Date()
  const diff = target.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function urgencyColor(readiness: number): string {
  if (readiness >= 80) return 'text-status-solid'
  if (readiness >= 50) return 'text-status-developing'
  return 'text-status-fragile'
}

export default function ConcertCountdown({ concerts }: ConcertCountdownProps) {
  if (concerts.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">
        {'הופעות קרבות'}
      </h3>
      <div className="space-y-2">
        {concerts.map((concert) => {
          const days = daysUntil(concert.targetDate)
          return (
            <Link
              key={concert.songId}
              href={`/songs/${concert.songId}`}
              className="block rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary-light"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground truncate">
                  {concert.title}
                </span>
                <span className={`text-xs font-semibold shrink-0 ms-2 ${urgencyColor(concert.readinessPercent)}`}>
                  {'עוד'} {days} {'ימים'}
                </span>
              </div>
              <ProgressBar value={concert.readinessPercent} showLabel size="sm" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}

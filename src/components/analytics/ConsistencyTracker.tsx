'use client'

import Card from '@/components/ui/Card'

interface ConsistencyTrackerProps {
  consistency: number | null
  improvementRate: number | null
  totalSessions: number
}

export default function ConsistencyTracker({
  consistency,
  improvementRate,
  totalSessions,
}: ConsistencyTrackerProps) {
  return (
    <Card
      header={
        <h3 className="text-sm font-semibold text-foreground">עקביות וקצב שיפור</h3>
      }
    >
      {totalSessions < 3 ? (
        <p className="py-4 text-center text-sm text-text-muted">
          צריך לפחות 3 סשנים לניתוח — תרגלו עוד!
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {/* Consistency score */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {consistency ?? '—'}
            </span>
            <span className="text-xs text-text-muted">עקביות</span>
            <p className="text-[10px] text-text-muted text-center">
              {consistency !== null && consistency >= 80
                ? 'ביצועים יציבים מאוד'
                : consistency !== null && consistency >= 60
                  ? 'יציבות סבירה'
                  : 'תנודתיות גבוהה בביצועים'}
            </p>
          </div>

          {/* Improvement rate */}
          <div className="flex flex-col items-center gap-1">
            <span className={`text-2xl font-bold tabular-nums ${
              improvementRate !== null && improvementRate > 0
                ? 'text-success'
                : improvementRate !== null && improvementRate < 0
                  ? 'text-danger'
                  : 'text-foreground'
            }`}>
              {improvementRate !== null
                ? `${improvementRate > 0 ? '+' : ''}${improvementRate}`
                : '—'}
            </span>
            <span className="text-xs text-text-muted">קצב שיפור</span>
            <p className="text-[10px] text-text-muted text-center">
              {improvementRate !== null && improvementRate > 1
                ? 'שיפור משמעותי!'
                : improvementRate !== null && improvementRate > 0
                  ? 'שיפור הדרגתי'
                  : improvementRate !== null && improvementRate < 0
                    ? 'ירידה — שווה לתרגל יותר'
                    : 'יציב'}
            </p>
          </div>
        </div>
      )}
    </Card>
  )
}

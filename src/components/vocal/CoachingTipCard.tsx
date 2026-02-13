'use client'

interface CoachingTipCardProps {
  tips: string[]
}

export default function CoachingTipCard({ tips }: CoachingTipCardProps) {
  if (tips.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">
        {'טיפים לשיפור'}
      </h3>
      <div className="space-y-2">
        {tips.map((tip, i) => (
          <div
            key={i}
            className="rounded-lg border border-primary/20 bg-primary/5 p-3"
          >
            <div className="flex gap-2">
              <span className="text-primary shrink-0 mt-0.5">{'💡'}</span>
              <p className="text-sm text-foreground leading-relaxed">{tip}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

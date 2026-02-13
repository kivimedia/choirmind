'use client'

interface Achievement {
  achievement: string
  unlockedAt: string
}

interface Milestone {
  achievement: string
  progress: number
  target: number
}

interface AchievementProgressProps {
  recentAchievements: Achievement[]
  nextMilestone: Milestone | null
}

const ACHIEVEMENT_LABELS: Record<string, string> = {
  first_practice: 'תרגול ראשון',
  streak_3: 'רצף 3 ימים',
  streak_7: 'רצף שבוע',
  streak_14: 'רצף שבועיים',
  streak_30: 'רצף חודש',
  streak_60: 'רצף חודשיים',
  streak_100: 'רצף 100 ימים',
}

function getLabel(key: string): string {
  return ACHIEVEMENT_LABELS[key] ?? key
}

export default function AchievementProgress({
  recentAchievements,
  nextMilestone,
}: AchievementProgressProps) {
  if (recentAchievements.length === 0 && !nextMilestone) return null

  return (
    <div className="space-y-3">
      {recentAchievements.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1">
            {'הישג אחרון'}
          </h3>
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 p-2.5">
            <span className="text-xl">{'🏆'}</span>
            <span className="text-sm font-medium text-foreground">
              {getLabel(recentAchievements[0].achievement)}
            </span>
          </div>
        </div>
      )}

      {nextMilestone && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1">
            {'היעד הבא'}
          </h3>
          <div className="rounded-lg border border-border bg-surface p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm text-foreground">
                {getLabel(nextMilestone.achievement)}
              </span>
              <span className="text-xs text-text-muted tabular-nums" dir="ltr">
                {nextMilestone.progress}/{nextMilestone.target}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-border/40 overflow-hidden" dir="rtl">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.round((nextMilestone.progress / nextMilestone.target) * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

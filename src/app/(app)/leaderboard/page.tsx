'use client'

import { useChoirStore } from '@/stores/useChoirStore'
import Leaderboard from '@/components/dashboard/Leaderboard'
import Card from '@/components/ui/Card'

export default function LeaderboardPage() {
  const { activeChoirId } = useChoirStore()

  if (!activeChoirId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">טבלת דירוג</h1>
        <Card>
          <p className="py-8 text-center text-text-muted">יש לבחור מקהלה כדי לראות את טבלת הדירוג</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">טבלת דירוג</h1>
      <Leaderboard choirId={activeChoirId} />
    </div>
  )
}

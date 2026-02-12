'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GameSelectorProps {
  chunkStatus: string
  songTitle: string
  onSelectGame: (game: string) => void
}

interface GameCard {
  id: string
  emoji: string
  name: string
  description: string
  /** Minimum status level at which this game is unlocked */
  minStatus: string
}

// ---------------------------------------------------------------------------
// Game definitions
// ---------------------------------------------------------------------------

const GAMES: GameCard[] = [
  {
    id: 'word-scramble',
    emoji: '\uD83D\uDD00', // 🔀
    name: 'סדר מילים',
    description: 'סדרו את המילים בסדר הנכון',
    minStatus: 'shaky',
  },
  {
    id: 'fill-the-blank',
    emoji: '\u270F\uFE0F', // ✏️
    name: 'מילה חסרה',
    description: 'השלימו את המילה החסרה',
    minStatus: 'shaky',
  },
  {
    id: 'finish-the-line',
    emoji: '\uD83D\uDCDD', // 📝
    name: 'סיום שורה',
    description: 'השלימו את השורה מזיכרון',
    minStatus: 'developing',
  },
]

// ---------------------------------------------------------------------------
// Status hierarchy
// ---------------------------------------------------------------------------

const STATUS_ORDER: string[] = [
  'fragile',
  'shaky',
  'developing',
  'solid',
  'locked_in',
]

function statusAtLeast(current: string, minimum: string): boolean {
  const currentIdx = STATUS_ORDER.indexOf(current)
  const minIdx = STATUS_ORDER.indexOf(minimum)
  if (currentIdx === -1 || minIdx === -1) return false
  return currentIdx >= minIdx
}

function statusToBadgeVariant(
  status: string,
): 'fragile' | 'shaky' | 'developing' | 'solid' | 'locked' {
  switch (status) {
    case 'fragile':
      return 'fragile'
    case 'shaky':
      return 'shaky'
    case 'developing':
      return 'developing'
    case 'solid':
      return 'solid'
    case 'locked_in':
      return 'locked'
    default:
      return 'fragile'
  }
}

const STATUS_LABELS: Record<string, string> = {
  fragile: 'שביר',
  shaky: 'רופף',
  developing: 'מתפתח',
  solid: 'מוצק',
  locked_in: 'נעול בזיכרון',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GameSelector({
  chunkStatus,
  songTitle,
  onSelectGame,
}: GameSelectorProps) {
  const [forceUnlock, setForceUnlock] = useState(false)
  const allLocked = chunkStatus === 'fragile' && !forceUnlock

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">משחקי שינון</h2>
          <p className="text-sm text-text-muted">{songTitle}</p>
        </div>
        <Badge variant={statusToBadgeVariant(chunkStatus)}>
          {STATUS_LABELS[chunkStatus] ?? chunkStatus}
        </Badge>
      </div>

      {/* All locked message */}
      {allLocked && (
        <div className="rounded-xl border border-border bg-background p-5 text-center">
          <div className="mb-2 text-3xl" aria-hidden="true">
            &#128274;
          </div>
          <p className="text-base font-medium text-foreground">
            התקדמו בדעיכה כדי לפתוח משחקים
          </p>
          <p className="mt-1 text-sm text-text-muted">
            תרגלו קודם עם הדעיכה כדי לחזק את הזיכרון, ואז המשחקים ייפתחו
          </p>
          <button
            type="button"
            onClick={() => setForceUnlock(true)}
            className="mt-3 text-sm text-primary hover:underline"
          >
            פתח בכל זאת
          </button>
        </div>
      )}

      {/* Warning when force-unlocked */}
      {forceUnlock && chunkStatus === 'fragile' && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm text-foreground">
          המשחקים יעילים יותר אחרי תרגול ראשוני עם הדעיכה. מומלץ קודם לתרגל!
        </div>
      )}

      {/* Game cards grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {GAMES.map((game) => {
          const isUnlocked = forceUnlock || statusAtLeast(chunkStatus, game.minStatus)

          return (
            <Card
              key={game.id}
              hoverable={isUnlocked}
              onClick={isUnlocked ? () => onSelectGame(game.id) : undefined}
              className={
                isUnlocked
                  ? ''
                  : 'opacity-50 cursor-not-allowed'
              }
            >
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <span className="text-4xl" aria-hidden="true">
                  {isUnlocked ? game.emoji : '\uD83D\uDD12'}
                </span>
                <h3
                  className={[
                    'text-lg font-bold',
                    isUnlocked ? 'text-foreground' : 'text-text-muted',
                  ].join(' ')}
                >
                  {game.name}
                </h3>
                <p className="text-sm text-text-muted">
                  {isUnlocked
                    ? game.description
                    : `נדרש: ${STATUS_LABELS[game.minStatus] ?? game.minStatus}`}
                </p>
                {!isUnlocked && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setForceUnlock(true)
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    פתח בכל זאת
                  </button>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

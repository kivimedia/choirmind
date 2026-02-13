'use client'

import Link from 'next/link'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

type UserState = 'no_choir' | 'no_assignments' | 'never_practiced' | 'has_due' | 'caught_up'

interface HeroCTAProps {
  userState: UserState
  dueChunksCount: number
  estimatedMinutes: number
  songsCount: number
}

export default function HeroCTA({
  userState,
  dueChunksCount,
  estimatedMinutes,
  songsCount,
}: HeroCTAProps) {
  return (
    <Card className="border-primary/20 bg-gradient-to-bl from-primary/5 to-transparent">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {userState === 'no_choir' && (
          <div>
            <p className="text-lg font-semibold text-foreground">
              {'הצטרפו למקהלה שלכם'}
            </p>
            <p className="mt-1 text-sm text-text-muted">
              {'הכניסו קוד הזמנה כדי להתחיל'}
            </p>
          </div>
        )}

        {userState === 'no_assignments' && (
          <div>
            <p className="text-lg font-semibold text-foreground">
              {'אין שיעורי בית עדיין'}
            </p>
            <p className="mt-1 text-sm text-text-muted">
              {'המנצח טרם שיבץ שירים — בינתיים אפשר לתרגל לבד'}
            </p>
          </div>
        )}

        {userState === 'never_practiced' && (
          <div>
            <p className="text-lg font-semibold text-foreground">
              {'יש לכם'} {songsCount} {'שירים ללמוד'}
            </p>
            <p className="mt-1 text-sm text-text-muted">
              {'התחילו את התרגול הראשון שלכם!'}
            </p>
          </div>
        )}

        {userState === 'has_due' && (
          <div>
            <p className="text-2xl font-bold text-primary tabular-nums">
              {dueChunksCount}{' '}
              <span className="text-base font-normal text-text-muted">
                {'קטעים לחזרה'}
              </span>
            </p>
            <p className="mt-1 text-sm text-text-muted">
              ~{estimatedMinutes} {'דקות'}
            </p>
          </div>
        )}

        {userState === 'caught_up' && (
          <div>
            <p className="text-lg font-semibold text-foreground">
              {'הכל מעודכן!'}
            </p>
            <p className="mt-1 text-sm text-text-muted">
              {'החזרה הבאה מחר — כל הכבוד!'}
            </p>
          </div>
        )}

        <div className="shrink-0">
          {userState === 'no_choir' && (
            <Link href="/join">
              <Button variant="primary" size="lg">
                {'הצטרפו למקהלה'}
              </Button>
            </Link>
          )}
          {userState === 'no_assignments' && (
            <Link href="/songs">
              <Button variant="outline" size="md">
                {'עיינו בשירים'}
              </Button>
            </Link>
          )}
          {userState === 'never_practiced' && (
            <Link href="/practice">
              <Button variant="primary" size="lg">
                {'התחילו תרגול'}
              </Button>
            </Link>
          )}
          {userState === 'has_due' && (
            <Link href="/practice">
              <Button variant="primary" size="lg">
                {'התחל תרגול'}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </Card>
  )
}

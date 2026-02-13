'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import ScoreDial from '@/components/vocal/ScoreDial'

interface VocalSession {
  id: string
  songTitle: string
  voicePart: string
  overallScore: number
  pitchScore: number
  timingScore: number
  dynamicsScore: number
  createdAt: string
}

const VOICE_PART_HE: Record<string, string> = {
  soprano: 'סופרן',
  mezzo: 'מצו',
  alto: 'אלט',
  tenor: 'טנור',
  baritone: 'בריטון',
  bass: 'בס',
}

export default function VocalHistoryPage() {
  const [sessions, setSessions] = useState<VocalSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch('/api/vocal-analysis/sessions?limit=50')
        if (res.ok) {
          const data = await res.json()
          setSessions(data.sessions ?? [])
        }
      } catch {
        // Graceful fallback
      } finally {
        setLoading(false)
      }
    }
    fetchSessions()
  }, [])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-lg bg-border/40" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-border/30" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {'היסטוריית תרגול קולי'}
        </h1>
        <p className="mt-1 text-text-muted">
          {'כל ההקלטות והציונים שלכם'}
        </p>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <span className="text-4xl block mb-3">{'🎤'}</span>
            <p className="text-foreground font-medium">
              {'עדיין לא ביצעתם תרגול קולי'}
            </p>
            <p className="text-sm text-text-muted mt-1">
              {'היכנסו לשיר והתחילו הקלטה'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <Link key={s.id} href={`/vocal-practice/sessions/${s.id}`}>
              <Card hoverable className="mb-3">
                <div className="flex items-center gap-4">
                  <ScoreDial score={s.overallScore} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">
                      {s.songTitle}
                    </p>
                    <p className="text-xs text-text-muted">
                      {VOICE_PART_HE[s.voicePart] ?? s.voicePart}
                      {' · '}
                      {new Date(s.createdAt).toLocaleDateString('he-IL', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-[11px] text-text-muted">
                        {'גובה'} {Math.round(s.pitchScore)}
                      </span>
                      <span className="text-[11px] text-text-muted">
                        {'תזמון'} {Math.round(s.timingScore)}
                      </span>
                      <span className="text-[11px] text-text-muted">
                        {'דינמיקה'} {Math.round(s.dynamicsScore)}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

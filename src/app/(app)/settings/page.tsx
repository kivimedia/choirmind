'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

interface Choir {
  id: string
  name: string
  inviteCode: string
}

export default function SettingsPage() {
  const [choirs, setChoirs] = useState<Choir[]>([])
  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinMessage, setJoinMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchChoirs() {
      try {
        const res = await fetch('/api/choir')
        if (res.ok) {
          const data = await res.json()
          setChoirs(data.choirs || [])
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchChoirs()
  }, [])

  async function handleJoinChoir() {
    if (!inviteCode.trim()) return
    setJoining(true)
    setJoinMessage(null)
    try {
      const res = await fetch('/api/choir/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setJoinMessage({ type: 'success', text: `הצטרפת למקהלה "${data.choir.name}"!` })
        setInviteCode('')
        setChoirs((prev) => [...prev, data.choir])
      } else {
        setJoinMessage({ type: 'error', text: data.error || 'שגיאה בהצטרפות' })
      }
    } catch {
      setJoinMessage({ type: 'error', text: 'שגיאה בהצטרפות' })
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-foreground">הגדרות</h1>

      {/* Current choirs */}
      <Card className="!p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">המקהלות שלי</h2>
        {choirs.length === 0 ? (
          <p className="text-sm text-text-muted">לא חבר/ה במקהלה עדיין.</p>
        ) : (
          <div className="space-y-3">
            {choirs.map((choir) => (
              <div key={choir.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <span className="font-medium text-foreground">{choir.name}</span>
                <span className="text-xs text-text-muted font-mono">{choir.inviteCode}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Join choir */}
      <Card className="!p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">הצטרפות למקהלה</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Input
              label="קוד הצטרפות"
              placeholder="TZLILI"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              dir="ltr"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleJoinChoir()
              }}
            />
          </div>
          <Button variant="primary" loading={joining} onClick={handleJoinChoir}>
            הצטרפות
          </Button>
        </div>
        {joinMessage && (
          <div className={`mt-3 rounded-lg px-4 py-3 text-sm ${
            joinMessage.type === 'success'
              ? 'border border-secondary/30 bg-secondary/5 text-secondary'
              : 'border border-danger/30 bg-danger/5 text-danger'
          }`}>
            {joinMessage.text}
          </div>
        )}
      </Card>
    </div>
  )
}

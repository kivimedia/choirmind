'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'

interface UserProfile {
  id: string
  name: string | null
  email: string
  voicePart: string | null
  locale: string
  xp: number
  currentStreak: number
  longestStreak: number
  role: string
}

const VOICE_PARTS = [
  { value: '', label: 'לא נבחר' },
  { value: 'soprano', label: 'סופרן' },
  { value: 'mezzo', label: 'מצו-סופרן' },
  { value: 'alto', label: 'אלט' },
  { value: 'tenor', label: 'טנור' },
  { value: 'baritone', label: 'בריטון' },
  { value: 'bass', label: 'בס' },
]

export default function ProfilePage() {
  const { data: session } = useSession()
  const t = useTranslations('common')

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [name, setName] = useState('')
  const [voicePart, setVoicePart] = useState('')

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/user/profile')
        if (!res.ok) return
        const data = await res.json()
        setProfile(data.user)
        setName(data.user.name || '')
        setVoicePart(data.user.voicePart || '')
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, voicePart: voicePart || null }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch {
      // ignore
    } finally {
      setSaving(false)
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
      <h1 className="text-2xl font-bold text-foreground">פרופיל</h1>

      <Card className="!p-6 space-y-5">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-2xl font-bold text-primary">
            {(profile?.name || session?.user?.email || '?').charAt(0).toUpperCase()}
          </span>
          <div>
            <p className="font-semibold text-foreground">{profile?.name || 'ללא שם'}</p>
            <p className="text-sm text-text-muted">{profile?.email}</p>
          </div>
        </div>

        <hr className="border-border" />

        {/* Edit fields */}
        <Input
          label="שם"
          value={name}
          onChange={(e) => setName(e.target.value)}
          dir="auto"
        />

        <Select
          label="קול"
          value={voicePart}
          onChange={(e) => setVoicePart(e.target.value)}
          options={VOICE_PARTS}
        />

        <div className="pt-2" />

        <Button
          variant="primary"
          className="w-full"
          loading={saving}
          onClick={handleSave}
        >
          {saved ? 'נשמר!' : t('save')}
        </Button>
      </Card>

      {/* Stats */}
      {profile && (
        <Card className="!p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">סטטיסטיקות</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-primary">{profile.xp}</div>
              <div className="text-xs text-text-muted">XP</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-accent">{profile.currentStreak}</div>
              <div className="text-xs text-text-muted">רצף נוכחי</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-secondary">{profile.longestStreak}</div>
              <div className="text-xs text-text-muted">רצף שיא</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

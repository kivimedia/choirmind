'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

interface Choir {
  id: string
  name: string
  inviteCode: string
}

export default function SettingsPage() {
  const t = useTranslations('auth')
  const tCommon = useTranslations('common')

  const [choirs, setChoirs] = useState<Choir[]>([])
  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinMessage, setJoinMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  // Password state
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setFetchError(false)
        const [choirRes, profileRes] = await Promise.all([
          fetch('/api/choir'),
          fetch('/api/user/profile'),
        ])
        if (choirRes.ok) {
          const data = await choirRes.json()
          setChoirs(data.choirs || [])
        } else {
          setFetchError(true)
        }
        if (profileRes.ok) {
          const data = await profileRes.json()
          setHasPassword(data.user?.hasPassword ?? false)
        }
      } catch {
        setFetchError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
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

  async function handleSetPassword() {
    if (newPassword !== confirmNewPassword) {
      setPasswordMessage({ type: 'error', text: t('passwordMismatch') })
      return
    }
    setPasswordLoading(true)
    setPasswordMessage(null)
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(hasPassword ? { currentPassword } : {}),
          newPassword,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setPasswordMessage({
          type: 'success',
          text: hasPassword ? t('passwordChanged') : t('passwordSet'),
        })
        setHasPassword(true)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmNewPassword('')
      } else {
        const errorKey = data.error as string
        const translated = (() => {
          try { return t(errorKey) } catch { return null }
        })()
        setPasswordMessage({ type: 'error', text: translated || tCommon('error') })
      }
    } catch {
      setPasswordMessage({ type: 'error', text: tCommon('error') })
    } finally {
      setPasswordLoading(false)
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

      {fetchError && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-danger">שגיאה בטעינת נתונים</span>
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              setFetchError(false)
              fetch('/api/choir')
                .then((res) => {
                  if (res.ok) return res.json()
                  throw new Error('Failed')
                })
                .then((data) => setChoirs(data.choirs || []))
                .catch(() => setFetchError(true))
                .finally(() => setLoading(false))
            }}
            className="rounded-lg px-3 py-1 text-xs font-medium text-danger hover:bg-danger/10 transition-colors"
          >
            נסה שנית
          </button>
        </div>
      )}

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

      {/* Password management */}
      {hasPassword !== null && (
        <Card className="!p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            {hasPassword ? t('changePassword') : t('setPassword')}
          </h2>
          <div className="space-y-3">
            {hasPassword && (
              <Input
                label={t('currentPassword')}
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                dir="ltr"
              />
            )}
            <Input
              label={t('newPassword')}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              dir="ltr"
            />
            <Input
              label={t('confirmPassword')}
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              dir="ltr"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSetPassword()
              }}
            />
            <Button
              variant="primary"
              loading={passwordLoading}
              onClick={handleSetPassword}
            >
              {hasPassword ? t('changePassword') : t('setPassword')}
            </Button>
            {passwordMessage && (
              <div className={`rounded-lg px-4 py-3 text-sm ${
                passwordMessage.type === 'success'
                  ? 'border border-secondary/30 bg-secondary/5 text-secondary'
                  : 'border border-danger/30 bg-danger/5 text-danger'
              }`}>
                {passwordMessage.text}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Version info */}
      <div className="text-center text-xs text-text-muted">
        <span>ChoirMind v{process.env.NEXT_PUBLIC_BUILD_VERSION || 'dev'}</span>
        {process.env.NEXT_PUBLIC_BUILD_TIME && (
          <span className="ms-2">
            ({new Date(process.env.NEXT_PUBLIC_BUILD_TIME).toLocaleDateString('he-IL')})
          </span>
        )}
      </div>

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

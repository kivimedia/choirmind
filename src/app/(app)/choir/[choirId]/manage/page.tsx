'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'

interface ChoirData {
  id: string
  name: string
  inviteCode: string
  locale: string
  weekStart: string
  _count: { members: number; songs: number }
}

interface MemberData {
  id: string
  role: string
  joinedAt: string
  user: {
    id: string
    name: string | null
    email: string | null
    voicePart: string | null
  }
}

export default function ChoirManagePage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const t = useTranslations('choirManage')
  const tCommon = useTranslations('common')

  const choirId = params.choirId as string

  const [choir, setChoir] = useState<ChoirData | null>(null)
  const [members, setMembers] = useState<MemberData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Settings form
  const [name, setName] = useState('')
  const [locale, setLocale] = useState('')
  const [weekStart, setWeekStart] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  // Add member form
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState('member')
  const [addLoading, setAddLoading] = useState(false)

  // Modals
  const [removeModal, setRemoveModal] = useState<MemberData | null>(null)
  const [deleteModal, setDeleteModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [choirRes, membersRes] = await Promise.all([
        fetch(`/api/choir/${choirId}`),
        fetch(`/api/choir/${choirId}/members`),
      ])

      if (choirRes.ok) {
        const data = await choirRes.json()
        setChoir(data.choir)
        setName(data.choir.name)
        setLocale(data.choir.locale)
        setWeekStart(data.choir.weekStart)
      } else if (choirRes.status === 403) {
        setError('אין הרשאת גישה')
      }

      if (membersRes.ok) {
        const data = await membersRes.json()
        setMembers(data.members ?? [])
      }
    } catch {
      setError('שגיאה בטעינת נתונים')
    } finally {
      setLoading(false)
    }
  }, [choirId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleSaveSettings() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/choir/${choirId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, locale, weekStart }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      const data = await res.json()
      setChoir((prev) => prev ? { ...prev, ...data.choir } : prev)
      setSuccess(t('saved'))
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyInviteCode() {
    if (!choir) return
    try {
      await navigator.clipboard.writeText(choir.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  async function handleAddMember() {
    if (!addEmail.trim()) return
    setAddLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/choir/${choirId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail.trim(), role: addRole }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      const data = await res.json()
      setMembers((prev) => [...prev, data.member])
      setAddEmail('')
      setAddRole('member')
      setSuccess('החבר/ה נוספ/ה בהצלחה')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setAddLoading(false)
    }
  }

  async function handleUpdateRole(memberId: string, role: string) {
    setError(null)
    try {
      const res = await fetch(`/api/choir/${choirId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, role }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      const data = await res.json()
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: data.member.role } : m))
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    }
  }

  async function handleRemoveMember() {
    if (!removeModal) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/choir/${choirId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: removeModal.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      setMembers((prev) => prev.filter((m) => m.id !== removeModal.id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setActionLoading(false)
      setRemoveModal(null)
    }
  }

  async function handleDeleteChoir() {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/choir/${choirId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      router.push('/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setActionLoading(false)
      setDeleteModal(false)
    }
  }

  const voicePartLabels: Record<string, string> = {
    soprano: 'סופרן',
    mezzo: 'מצו',
    alto: 'אלט',
    tenor: 'טנור',
    baritone: 'בריטון',
    bass: 'בס',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error && !choir) {
    return (
      <div className="py-12 text-center">
        <p className="text-danger mb-4">{error}</p>
        <Button variant="outline" onClick={() => router.back()}>
          {tCommon('back')}
        </Button>
      </div>
    )
  }

  const currentUserId = session?.user?.id

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
          {success}
        </div>
      )}

      {/* Section 1: Choir Settings */}
      <Card header={<h2 className="text-lg font-semibold text-foreground">{t('choirSettings')}</h2>}>
        <div className="space-y-4">
          <Input
            label={t('choirName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            dir="auto"
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              {t('inviteCode')}
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border border-border bg-surface-hover px-4 py-2.5 font-mono text-lg tracking-widest text-foreground">
                {choir?.inviteCode}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyInviteCode}
              >
                {copied ? t('copied') : 'העתק'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label={t('locale')}
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              options={[
                { value: 'he-IL', label: 'עברית' },
                { value: 'en-US', label: 'English' },
              ]}
            />
            <Select
              label={t('weekStart')}
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              options={[
                { value: 'sunday', label: t('sunday') },
                { value: 'monday', label: t('monday') },
              ]}
            />
          </div>

          <div className="flex justify-end">
            <Button variant="primary" loading={saving} onClick={handleSaveSettings}>
              {t('saveSettings')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Section 2: Add Member */}
      <Card header={<h2 className="text-lg font-semibold text-foreground">הוספת חבר/ה</h2>}>
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            הוסיפו חבר/ה למקהלה לפי כתובת מייל. המשתמש/ת חייב/ת להיות רשום/ה באפליקציה.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label="אימייל"
                type="email"
                placeholder="user@example.com"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="w-32">
              <Select
                label="תפקיד"
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                options={[
                  { value: 'member', label: t('member') },
                  { value: 'director', label: t('director') },
                ]}
              />
            </div>
            <Button
              variant="primary"
              size="md"
              loading={addLoading}
              onClick={handleAddMember}
            >
              הוספה
            </Button>
          </div>
        </div>
      </Card>

      {/* Section 3: Members */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{t('members')}</h2>
            <Badge variant="default">{members.length}</Badge>
          </div>
        }
      >
        {members.length === 0 ? (
          <p className="py-4 text-center text-text-muted">אין חברים</p>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-border text-sm text-text-muted">
                  <th className="px-5 py-2 text-start font-medium">שם</th>
                  <th className="px-3 py-2 text-start font-medium">קול</th>
                  <th className="px-3 py-2 text-start font-medium">{t('role')}</th>
                  <th className="px-5 py-2 text-start font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {members.map((member) => {
                  const isCurrentUser = member.user.id === currentUserId
                  return (
                    <tr key={member.id} className="hover:bg-surface-hover/50 transition-colors">
                      <td className="px-5 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {member.user.name || member.user.email || 'לא ידוע'}
                          </p>
                          {member.user.email && (
                            <p className="text-xs text-text-muted">{member.user.email}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-text-muted">
                        {member.user.voicePart
                          ? voicePartLabels[member.user.voicePart] || member.user.voicePart
                          : '\u2014'}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={member.role === 'director' ? 'primary' : 'default'}>
                          {member.role === 'director' ? t('director') : t('member')}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        {!isCurrentUser && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateRole(
                                  member.id,
                                  member.role === 'director' ? 'member' : 'director'
                                )
                              }
                              className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                            >
                              {member.role === 'director' ? t('demote') : t('promote')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemoveModal(member)}
                              className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10 transition-colors"
                            >
                              {t('removeMember')}
                            </button>
                          </div>
                        )}
                        {isCurrentUser && (
                          <span className="text-xs text-text-muted">את/ה</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Section 3: Danger Zone */}
      <Card
        header={<h2 className="text-lg font-semibold text-danger">{t('dangerZone')}</h2>}
        className="border-danger/30"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{t('deleteChoir')}</p>
            <p className="text-xs text-text-muted">פעולה זו לא ניתנת לביטול. כל השירים והנתונים יימחקו.</p>
          </div>
          <Button variant="danger" size="sm" onClick={() => setDeleteModal(true)}>
            {t('deleteChoir')}
          </Button>
        </div>
      </Card>

      {/* Remove member confirmation */}
      <Modal
        isOpen={!!removeModal}
        onClose={() => setRemoveModal(null)}
        title={t('removeMember')}
      >
        <div className="space-y-4">
          <p className="text-foreground">
            להסיר את {removeModal?.user.name || removeModal?.user.email || 'חבר'} מהמקהלה?
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setRemoveModal(null)}>
              {tCommon('cancel')}
            </Button>
            <Button variant="danger" loading={actionLoading} onClick={handleRemoveMember}>
              {t('removeMember')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete choir confirmation */}
      <Modal
        isOpen={deleteModal}
        onClose={() => setDeleteModal(false)}
        title={t('deleteChoir')}
      >
        <div className="space-y-4">
          <p className="text-foreground">{t('deleteConfirm')}</p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleteModal(false)}>
              {tCommon('cancel')}
            </Button>
            <Button variant="danger" loading={actionLoading} onClick={handleDeleteChoir}>
              {t('deleteChoir')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

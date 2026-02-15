'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'

interface EmailLog {
  id: string
  to: string
  from: string
  subject: string
  status: string
  resendId: string | null
  error: string | null
  provider: string
  context: string
  metadata: string | null
  createdAt: string
}

export default function AdminEmailLogsPage() {
  const { data: session } = useSession()
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const isAdmin = session?.user?.role === 'admin'

  const fetchLogs = useCallback(async (q: string, status: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('search', q)
      if (status) params.set('status', status)
      const res = await fetch(`/api/admin/email-logs?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) fetchLogs('', '')
  }, [isAdmin, fetchLogs])

  // Debounced search
  useEffect(() => {
    if (!isAdmin) return
    const timeout = setTimeout(() => fetchLogs(search, statusFilter), 300)
    return () => clearTimeout(timeout)
  }, [search, statusFilter, isAdmin, fetchLogs])

  function getMetadataUrl(metadata: string | null): string | null {
    if (!metadata) return null
    try {
      const parsed = JSON.parse(metadata)
      return parsed.url || null
    } catch {
      return null
    }
  }

  async function copyToClipboard(text: string, logId: string) {
    await navigator.clipboard.writeText(text)
    setCopiedId(logId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-4xl py-12 text-center">
        <p className="text-lg text-danger font-medium">אין לך הרשאה לצפות בדף זה</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">יומן אימיילים</h1>
        <p className="mt-1 text-text-muted">כל האימיילים שנשלחו מהמערכת</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="חיפוש לפי אימייל..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">כל הסטטוסים</option>
          <option value="sent">נשלח</option>
          <option value="failed">נכשל</option>
        </select>
      </div>

      {/* Logs */}
      <div className="space-y-3">
        {loading ? (
          <Card>
            <div className="animate-pulse space-y-3 py-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded bg-border/30" />
              ))}
            </div>
          </Card>
        ) : logs.length === 0 ? (
          <Card>
            <p className="py-8 text-center text-text-muted">לא נמצאו אימיילים</p>
          </Card>
        ) : (
          logs.map((log) => {
            const date = new Date(log.createdAt)
            const magicLink = getMetadataUrl(log.metadata)
            const isCopied = copiedId === log.id

            return (
              <Card key={log.id} className="!p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{log.to}</span>
                      <Badge variant={log.status === 'sent' ? 'primary' : 'default'}>
                        {log.status === 'sent' ? 'נשלח' : log.status === 'failed' ? 'נכשל' : log.status}
                      </Badge>
                      <Badge variant="default">{log.context}</Badge>
                    </div>
                    <p className="text-xs text-text-muted mt-1">
                      {date.toLocaleDateString('he-IL')}{' '}
                      {date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      {' · '}{log.subject}
                    </p>
                    {log.error && (
                      <p className="text-xs text-danger mt-1">{log.error}</p>
                    )}
                    {log.resendId && !log.error && (
                      <p className="text-xs text-text-muted mt-1 font-mono">{log.resendId}</p>
                    )}
                  </div>
                  {magicLink && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(magicLink, log.id)}
                      className="shrink-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover"
                    >
                      {isCopied ? 'הועתק!' : 'העתק קישור'}
                    </button>
                  )}
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

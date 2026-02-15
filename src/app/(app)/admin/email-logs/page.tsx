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
  createdAt: string
}

export default function AdminEmailLogsPage() {
  const { data: session } = useSession()
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)

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

      {/* Logs table */}
      <Card className="overflow-x-auto">
        {loading ? (
          <div className="animate-pulse space-y-3 py-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-border/30" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <p className="py-8 text-center text-text-muted">לא נמצאו אימיילים</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-text-muted">
                <th className="px-3 py-3 text-start font-medium">תאריך</th>
                <th className="px-3 py-3 text-start font-medium">נמען</th>
                <th className="px-3 py-3 text-start font-medium">נושא</th>
                <th className="px-3 py-3 text-start font-medium">סוג</th>
                <th className="px-3 py-3 text-start font-medium">סטטוס</th>
                <th className="px-3 py-3 text-start font-medium">פרטים</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const date = new Date(log.createdAt)
                return (
                  <tr key={log.id} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div>
                        <p className="text-foreground">
                          {date.toLocaleDateString('he-IL')}
                        </p>
                        <p className="text-xs text-text-muted">
                          {date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-foreground">{log.to}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-foreground">{log.subject}</span>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="default">{log.context}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={log.status === 'sent' ? 'primary' : 'default'}>
                        {log.status === 'sent' ? 'נשלח' : log.status === 'failed' ? 'נכשל' : log.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      {log.error ? (
                        <span className="text-xs text-danger">{log.error}</span>
                      ) : log.resendId ? (
                        <span className="text-xs text-text-muted font-mono">{log.resendId}</span>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

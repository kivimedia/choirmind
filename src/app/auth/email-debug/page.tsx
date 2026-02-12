'use client'

import { useState, useEffect } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'

interface EmailLogEntry {
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

export default function EmailDebugPage() {
  const [email, setEmail] = useState('ziv@dailycookie.co')
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [logs, setLogs] = useState<EmailLogEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  async function fetchLogs() {
    setLogsLoading(true)
    try {
      const res = await fetch('/api/email-log')
      const data = await res.json()
      setLogs(data.logs || [])
    } catch (err: any) {
      console.error('Failed to fetch logs:', err)
    } finally {
      setLogsLoading(false)
    }
  }

  async function sendTestEmail() {
    if (!email.trim()) return
    setLoading(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/email-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email }),
      })
      const data = await res.json()
      setTestResult(data)
      // Refresh logs after sending
      setTimeout(fetchLogs, 1000)
    } catch (err: any) {
      setTestResult({ error: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Email Debug</h1>
          <p className="text-sm text-text-muted mt-1">Test and monitor email delivery via Resend</p>
        </div>

        {/* Test Email */}
        <Card className="!p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Send Test Email</h2>
          <p className="text-sm text-text-muted mb-4">
            This sends a test email directly via Resend (bypasses NextAuth).
            If this works but magic links don&apos;t, the issue is in the NextAuth flow.
          </p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input
                label="To"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
                placeholder="your@email.com"
              />
            </div>
            <Button
              variant="primary"
              loading={loading}
              onClick={sendTestEmail}
            >
              Send Test
            </Button>
          </div>

          {testResult && (
            <div className={`mt-4 rounded-lg p-4 text-sm font-mono whitespace-pre-wrap ${
              testResult.success
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {JSON.stringify(testResult, null, 2)}
            </div>
          )}
        </Card>

        {/* Email Logs */}
        <Card className="!p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Email Logs</h2>
            <Button variant="ghost" size="sm" onClick={fetchLogs} loading={logsLoading}>
              Refresh
            </Button>
          </div>

          {logs.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">
              No email logs yet. Try sending a test email or logging in with magic link.
            </p>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`rounded-lg border p-4 text-sm ${
                    log.status === 'sent'
                      ? 'border-green-200 bg-green-50'
                      : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-semibold ${
                      log.status === 'sent' ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {log.status.toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div><strong>To:</strong> {log.to}</div>
                    <div><strong>From:</strong> {log.from}</div>
                    <div><strong>Subject:</strong> {log.subject}</div>
                    <div><strong>Context:</strong> {log.context}</div>
                    {log.resendId && <div className="col-span-2"><strong>Resend ID:</strong> {log.resendId}</div>}
                    {log.error && <div className="col-span-2 text-red-600"><strong>Error:</strong> {log.error}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Config Info */}
        <Card className="!p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Configuration Check</h2>
          <div className="space-y-2 text-sm font-mono">
            <div><strong>NEXTAUTH_URL:</strong> {process.env.NEXT_PUBLIC_NEXTAUTH_URL || '(check server logs)'}</div>
            <p className="text-text-muted !font-sans">
              Check the terminal running <code className="bg-gray-100 px-1.5 py-0.5 rounded">npm run dev</code> for detailed <code>[EMAIL]</code> and <code>[AUTH]</code> log messages.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

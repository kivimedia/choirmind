'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

export default function JoinChoirPage() {
  const params = useParams<{ code: string }>()
  const router = useRouter()
  const { data: session, status } = useSession()
  const code = params.code

  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    // If not authenticated, redirect to sign-in with callback back here
    if (status === 'unauthenticated') {
      signIn(undefined, { callbackUrl: `/join/${code}` })
      return
    }

    // If authenticated, auto-join
    if (status === 'authenticated' && !joining && !success && !error) {
      handleJoin()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  async function handleJoin() {
    setJoining(true)
    setError(null)
    try {
      const res = await fetch('/api/choir/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: code }),
      })
      const data = await res.json()

      if (res.status === 409) {
        // Already a member — just redirect
        setSuccess(data.error || 'כבר חבר/ה במקהלה!')
        setTimeout(() => router.push('/songs'), 1500)
        return
      }

      if (!res.ok) {
        setError(data.error || 'שגיאה בהצטרפות למקהלה')
        return
      }

      setSuccess(`הצטרפת למקהלה "${data.choir?.name}"!`)
      setTimeout(() => router.push('/songs'), 2000)
    } catch {
      setError('שגיאת רשת')
    } finally {
      setJoining(false)
    }
  }

  // Loading / redirecting to sign-in
  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-text-muted">מעביר להתחברות...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="!p-8 max-w-md w-full text-center space-y-4">
        <span className="text-4xl" aria-hidden="true">&#127925;</span>
        <h1 className="text-xl font-bold text-foreground">הצטרפות למקהלה</h1>

        {joining && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-text-muted">מצטרף/ת למקהלה...</p>
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-secondary/30 bg-secondary/5 px-4 py-3 text-secondary">
            {success}
          </div>
        )}

        {error && (
          <>
            <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
              {error}
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="primary" onClick={handleJoin} loading={joining}>
                נסה שוב
              </Button>
              <Button variant="outline" onClick={() => router.push('/')}>
                לדף הבית
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

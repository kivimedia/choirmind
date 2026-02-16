'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

function VerifyLinkInner() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id')
  // Legacy support: if callbackUrl is in the URL directly (old emails)
  const legacyCallbackUrl = searchParams.get('callbackUrl')
  const [clicked, setClicked] = useState(false)
  const [error, setError] = useState(false)

  if (!id && !legacyCallbackUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-lg">
          <p className="text-danger">קישור לא תקין</p>
          <a href="/auth/signin" className="mt-4 inline-block text-primary hover:underline">
            חזרה להתחברות
          </a>
        </div>
      </div>
    )
  }

  async function handleClick() {
    setClicked(true)
    setError(false)

    try {
      // Legacy path: callbackUrl directly in the URL (old emails before fix)
      if (legacyCallbackUrl) {
        window.location.href = legacyCallbackUrl
        return
      }

      // New path: resolve the opaque ID server-side
      const res = await fetch('/api/auth/resolve-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      if (!res.ok) {
        setClicked(false)
        setError(true)
        return
      }

      const data = await res.json()
      if (data.callbackUrl) {
        window.location.href = data.callbackUrl
      } else {
        setClicked(false)
        setError(true)
      }
    } catch {
      setClicked(false)
      setError(true)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-lg">
        <span className="text-5xl">🎵</span>
        <h1 className="mt-4 text-2xl font-bold text-primary">ChoirMind</h1>
        <p className="mt-2 text-sm text-text-muted">שינון שירים מבוסס מדע למקהלות</p>

        <div className="mt-8">
          {clicked ? (
            <div className="flex items-center justify-center gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-foreground">מתחבר...</span>
            </div>
          ) : (
            <>
              {error && (
                <p className="mb-4 text-sm text-danger">
                  הקישור אינו תקין או שפג תוקפו. נסו לבקש קישור חדש.
                </p>
              )}
              <p className="mb-4 text-foreground">לחצו על הכפתור כדי להתחבר:</p>
              <button
                type="button"
                onClick={handleClick}
                className="w-full rounded-xl bg-primary px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-primary/90"
              >
                התחברות ל-ChoirMind
              </button>
            </>
          )}
        </div>

        <p className="mt-6 text-xs text-text-muted">
          הקישור תקף ל-60 דקות
        </p>
      </div>
    </div>
  )
}

export default function VerifyLinkPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    }>
      <VerifyLinkInner />
    </Suspense>
  )
}

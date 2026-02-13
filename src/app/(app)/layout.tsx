'use client'

import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import Button from '@/components/ui/Button'
import ToastContainer from '@/components/ui/ToastContainer'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const t = useTranslations('nav')

  // Show loading state while checking session
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-text-muted">...</p>
        </div>
      </div>
    )
  }

  // Not authenticated — show login prompt
  if (status === 'unauthenticated' || !session) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
            <span className="mb-4 block text-5xl" aria-hidden="true">
              &#127925;
            </span>
            <h1 className="mb-2 text-2xl font-bold text-foreground">
              ChoirMind
            </h1>
            <p className="mb-6 text-text-muted">
              התחברו כדי להמשיך
            </p>
            <Link href="/auth/signin">
              <Button variant="primary" size="lg" className="w-full">
                {t('login')}
              </Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1">
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}

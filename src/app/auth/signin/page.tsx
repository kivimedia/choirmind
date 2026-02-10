'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Card from '@/components/ui/Card'

export default function SignInPage() {
  const t = useTranslations('auth')
  const tCommon = useTranslations('common')

  // Magic link state
  const [magicEmail, setMagicEmail] = useState('')
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [magicLoading, setMagicLoading] = useState(false)

  // Dev login state
  const [devEmail, setDevEmail] = useState('')
  const [devName, setDevName] = useState('')
  const [devLoading, setDevLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Google sign in
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleMagicLink() {
    if (!magicEmail.trim()) return
    setMagicLoading(true)
    setError(null)
    try {
      await signIn('email', {
        email: magicEmail,
        redirect: false,
      })
      setMagicLinkSent(true)
    } catch {
      setError(tCommon('error'))
    } finally {
      setMagicLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    setError(null)
    try {
      await signIn('google', { callbackUrl: '/' })
    } catch {
      setError(tCommon('error'))
      setGoogleLoading(false)
    }
  }

  async function handleDevLogin() {
    if (!devEmail.trim()) return
    setDevLoading(true)
    setError(null)
    try {
      const result = await signIn('credentials', {
        email: devEmail,
        name: devName || undefined,
        redirect: false,
      })
      if (result?.error) {
        setError(result.error)
      } else if (result?.ok) {
        window.location.href = '/'
      }
    } catch {
      setError(tCommon('error'))
    } finally {
      setDevLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Branding */}
        <div className="text-center">
          <span className="mb-3 block text-5xl" aria-hidden="true">
            &#127925;
          </span>
          <h1 className="text-3xl font-bold text-primary">ChoirMind</h1>
          <p className="mt-2 text-text-muted">
            שינון שירים מבוסס מדע למקהלות
          </p>
        </div>

        {/* Main sign-in card */}
        <Card className="!p-6">
          <div className="space-y-5">
            <h2 className="text-center text-xl font-semibold text-foreground">
              {t('signIn')}
            </h2>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            {/* Magic link sent success */}
            {magicLinkSent && (
              <div className="rounded-lg border border-secondary/30 bg-secondary/5 px-4 py-3 text-sm text-secondary">
                {t('magicLinkSent')}
              </div>
            )}

            {/* Email magic link */}
            {!magicLinkSent && (
              <div className="space-y-3">
                <Input
                  label={t('email')}
                  type="email"
                  placeholder="you@example.com"
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                  dir="ltr"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleMagicLink()
                  }}
                />
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  loading={magicLoading}
                  onClick={handleMagicLink}
                >
                  {t('magicLink')}
                </Button>
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center gap-3">
              <hr className="flex-1 border-border" />
              <span className="text-xs text-text-muted">או</span>
              <hr className="flex-1 border-border" />
            </div>

            {/* Google sign in */}
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              loading={googleLoading}
              onClick={handleGoogleSignIn}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>{t('googleSignIn')}</span>
            </Button>
          </div>
        </Card>

        {/* Dev login card */}
        {process.env.NODE_ENV !== 'production' && (
          <Card className="!p-6 border-warning/40">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-lg" aria-hidden="true">
                  &#128736;
                </span>
                <h3 className="text-sm font-semibold text-warning">
                  Dev Login
                </h3>
              </div>

              <Input
                label={t('email')}
                type="email"
                placeholder="test@choirmind.com"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                dir="ltr"
              />
              <Input
                label={t('name')}
                placeholder="Test User"
                value={devName}
                onChange={(e) => setDevName(e.target.value)}
                dir="auto"
              />
              <Button
                variant="secondary"
                size="md"
                className="w-full"
                loading={devLoading}
                onClick={handleDevLogin}
              >
                Dev Login
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

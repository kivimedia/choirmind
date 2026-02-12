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

  const [magicEmail, setMagicEmail] = useState('')
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [magicLoading, setMagicLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleMagicLink() {
    if (!magicEmail.trim()) return
    setMagicLoading(true)
    setError(null)
    try {
      const result = await signIn('email', {
        email: magicEmail,
        redirect: false,
        callbackUrl: '/',
      })
      if (result?.error) {
        setError(result.error)
      } else {
        setMagicLinkSent(true)
      }
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

            {/* Google sign in — hidden until OAuth credentials are configured */}
          </div>
        </Card>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Card from '@/components/ui/Card'

type Step = 'email' | 'login' | 'register' | 'passwordless' | 'magic-link-sent'

export default function SignInPage() {
  const t = useTranslations('auth')
  const tCommon = useTranslations('common')

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleContinue() {
    if (!email.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(tCommon('error'))
        return
      }
      if (data.exists) {
        if (data.hasPassword) {
          setStep('login')
        } else {
          setStep('passwordless')
        }
      } else {
        setStep('register')
      }
    } catch {
      setError(tCommon('error'))
    } finally {
      setLoading(false)
    }
  }

  async function handlePasswordLogin() {
    if (!password) return
    setLoading(true)
    setError(null)
    try {
      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
        callbackUrl: '/',
      })
      if (result?.error) {
        setError(t('invalidCredentials'))
      } else if (result?.url) {
        window.location.href = result.url
      }
    } catch {
      setError(tCommon('error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister() {
    if (!password) return
    if (password !== confirmPassword) {
      setError(t('passwordMismatch'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        // Map known error keys to translations
        const errorKey = data.error as string
        const translated = (() => {
          try { return t(errorKey) } catch { return null }
        })()
        setError(translated || t('registrationFailed'))
        return
      }
      // Auto sign-in after registration
      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
        callbackUrl: '/',
      })
      if (result?.url) {
        window.location.href = result.url
      }
    } catch {
      setError(tCommon('error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleMagicLink() {
    setLoading(true)
    setError(null)
    try {
      const result = await signIn('email', {
        email: email.trim(),
        redirect: false,
        callbackUrl: '/',
      })
      if (result?.error) {
        setError(result.error)
      } else {
        setStep('magic-link-sent')
      }
    } catch {
      setError(tCommon('error'))
    } finally {
      setLoading(false)
    }
  }

  function goBack() {
    setStep('email')
    setPassword('')
    setConfirmPassword('')
    setName('')
    setError(null)
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
              {step === 'register' ? t('signUp') : t('signIn')}
            </h2>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            {/* Magic link sent success */}
            {step === 'magic-link-sent' && (
              <div className="rounded-lg border border-secondary/30 bg-secondary/5 px-4 py-3 text-sm text-secondary">
                {t('magicLinkSent')}
              </div>
            )}

            {/* Step 1: Email */}
            {step === 'email' && (
              <div className="space-y-3">
                <Input
                  label={t('email')}
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleContinue()
                  }}
                />
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  loading={loading}
                  onClick={handleContinue}
                >
                  {t('continue')}
                </Button>
              </div>
            )}

            {/* Step 2a: Login (has password) */}
            {step === 'login' && (
              <div className="space-y-3">
                <div className="rounded-lg bg-surface-elevated px-3 py-2 text-sm text-text-muted" dir="ltr">
                  {email}
                </div>
                <Input
                  label={t('password')}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  dir="ltr"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handlePasswordLogin()
                  }}
                />
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  loading={loading}
                  onClick={handlePasswordLogin}
                >
                  {t('signInWithPassword')}
                </Button>
                <button
                  type="button"
                  onClick={handleMagicLink}
                  className="w-full text-center text-sm text-primary hover:underline"
                >
                  {t('useMagicLinkInstead')}
                </button>
                <button
                  type="button"
                  onClick={goBack}
                  className="w-full text-center text-sm text-text-muted hover:underline"
                >
                  {tCommon('back')}
                </button>
              </div>
            )}

            {/* Step 2b: Register (new user) */}
            {step === 'register' && (
              <div className="space-y-3">
                <div className="rounded-lg bg-surface-elevated px-3 py-2 text-sm text-text-muted" dir="ltr">
                  {email}
                </div>
                <Input
                  label={t('name')}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Input
                  label={t('password')}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  dir="ltr"
                />
                <Input
                  label={t('confirmPassword')}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  dir="ltr"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRegister()
                  }}
                />
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  loading={loading}
                  onClick={handleRegister}
                >
                  {t('createAccount')}
                </Button>
                <button
                  type="button"
                  onClick={handleMagicLink}
                  className="w-full text-center text-sm text-primary hover:underline"
                >
                  {t('useMagicLinkInstead')}
                </button>
                <button
                  type="button"
                  onClick={goBack}
                  className="w-full text-center text-sm text-text-muted hover:underline"
                >
                  {tCommon('back')}
                </button>
              </div>
            )}

            {/* Step 2c: Passwordless user (magic-link/OAuth, no password yet) */}
            {step === 'passwordless' && (
              <div className="space-y-3">
                <div className="rounded-lg bg-surface-elevated px-3 py-2 text-sm text-text-muted" dir="ltr">
                  {email}
                </div>
                <p className="text-sm text-text-muted">{t('noPasswordYet')}</p>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  loading={loading}
                  onClick={handleMagicLink}
                >
                  {t('sendMagicLink')}
                </Button>
                <button
                  type="button"
                  onClick={goBack}
                  className="w-full text-center text-sm text-text-muted hover:underline"
                >
                  {tCommon('back')}
                </button>
              </div>
            )}

            {/* Google sign in — hidden until OAuth credentials are configured */}
          </div>
        </Card>
      </div>
    </div>
  )
}

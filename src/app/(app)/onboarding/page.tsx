'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Card from '@/components/ui/Card'

// ── Fade-out tutorial demo ──────────────────────────────────────────

const DEMO_LINE = 'ירושלים של זהב'
const DEMO_WORDS = DEMO_LINE.split(' ')

function FadeOutDemo() {
  const [fadeLevel, setFadeLevel] = useState(0)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const t = useTranslations('onboarding')

  useEffect(() => {
    const timer = setInterval(() => {
      setFadeLevel((prev) => {
        if (prev >= 5) {
          clearInterval(timer)
          return 5
        }
        return prev + 1
      })
    }, 2000)
    return () => clearInterval(timer)
  }, [])

  function toggleReveal(index: number) {
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  function shouldHide(wordIndex: number, level: number): boolean {
    if (level === 0) return false
    if (level >= 5) return true
    // Progressive: hide more words as level increases
    const ratio = level / 5
    const hideCount = Math.ceil(DEMO_WORDS.length * ratio)
    // Hide from the middle outward for a natural feel
    const middleIndex = Math.floor(DEMO_WORDS.length / 2)
    const distances = DEMO_WORDS.map((_, i) => Math.abs(i - middleIndex))
    const sorted = [...distances].sort((a, b) => a - b)
    const threshold = sorted[hideCount - 1] ?? -1
    return distances[wordIndex] <= threshold
  }

  function resetDemo() {
    setFadeLevel(0)
    setRevealed(new Set())
    // Restart the auto-fade
    const timer = setInterval(() => {
      setFadeLevel((prev) => {
        if (prev >= 5) {
          clearInterval(timer)
          return 5
        }
        return prev + 1
      })
    }, 2000)
  }

  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-text-muted">{t('tutorialDesc')}</p>

      {/* Demo display */}
      <div className="rounded-xl border border-border bg-background px-6 py-8">
        <div className="flex flex-wrap justify-center gap-3 text-2xl font-semibold" dir="rtl">
          {DEMO_WORDS.map((word, index) => {
            const hidden = shouldHide(index, fadeLevel) && !revealed.has(index)
            return (
              <button
                key={index}
                type="button"
                onClick={() => {
                  if (shouldHide(index, fadeLevel)) toggleReveal(index)
                }}
                className={[
                  'word-fade-out rounded-lg px-2 py-1 transition-all',
                  hidden
                    ? 'word-hidden cursor-pointer'
                    : 'cursor-default text-foreground',
                  shouldHide(index, fadeLevel) && !hidden
                    ? 'bg-primary/10 text-primary'
                    : '',
                ].join(' ')}
              >
                {hidden ? (
                  <span className="word-placeholder inline-block min-w-[3ch]">
                    &nbsp;
                  </span>
                ) : (
                  word
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Fade level indicator */}
      <div className="flex items-center justify-center gap-2">
        {[0, 1, 2, 3, 4, 5].map((level) => (
          <span
            key={level}
            className={[
              'h-2 w-2 rounded-full transition-colors',
              fadeLevel >= level ? 'bg-primary' : 'bg-border',
            ].join(' ')}
          />
        ))}
      </div>

      <Button variant="ghost" size="sm" onClick={resetDemo}>
        &#128260; הפעלה מחדש
      </Button>
    </div>
  )
}

// ── Voice parts ─────────────────────────────────────────────────────

interface VoicePart {
  key: string
  label: string
  icon: string
}

// ── Onboarding component ────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const t = useTranslations('onboarding')
  const tAuth = useTranslations('auth')
  const tVoice = useTranslations('voiceParts')
  const tCommon = useTranslations('common')

  const [step, setStep] = useState(1)

  // Step 1: Choir
  const [choirMode, setChoirMode] = useState<'join' | 'create' | null>(null)
  const [inviteCode, setInviteCode] = useState('')
  const [choirName, setChoirName] = useState('')

  // Step 2: Voice part
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null)

  // State
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const voiceParts: VoicePart[] = [
    { key: 'soprano', label: tVoice('soprano'), icon: '&#127926;' },
    { key: 'mezzo', label: tVoice('mezzo'), icon: '&#127925;' },
    { key: 'alto', label: tVoice('alto'), icon: '&#127927;' },
    { key: 'tenor', label: tVoice('tenor'), icon: '&#127928;' },
    { key: 'baritone', label: tVoice('baritone'), icon: '&#127929;' },
    { key: 'bass', label: tVoice('bass'), icon: '&#127930;' },
  ]

  const totalSteps = 3

  function canProceed(): boolean {
    if (step === 1) {
      if (choirMode === 'join') return inviteCode.trim().length > 0
      if (choirMode === 'create') return choirName.trim().length > 0
      return false
    }
    if (step === 2) return selectedVoice !== null
    return true
  }

  async function handleNext() {
    if (step < totalSteps) {
      setStep((prev) => prev + 1)
      return
    }

    // Final step — save and redirect
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        voicePart: selectedVoice,
      }

      if (choirMode === 'join') {
        payload.inviteCode = inviteCode.trim()
      } else if (choirMode === 'create') {
        payload.choirName = choirName.trim()
      }

      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      router.push('/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tCommon('error'))
    } finally {
      setSaving(false)
    }
  }

  function handleBack() {
    if (step > 1) setStep((prev) => prev - 1)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          <span className="mb-3 block text-5xl" aria-hidden="true">
            &#127925;
          </span>
          <h1 className="text-2xl font-bold text-primary">{t('welcome')}</h1>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={[
                'h-2 rounded-full transition-all',
                s === step
                  ? 'w-8 bg-primary'
                  : s < step
                    ? 'w-2 bg-primary/50'
                    : 'w-2 bg-border',
              ].join(' ')}
            />
          ))}
        </div>

        {/* Step content */}
        <Card className="!p-6">
          {/* Step 1: Choir */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-center text-lg font-semibold text-foreground">
                {tAuth('joinChoir')} / {tAuth('createChoir')}
              </h2>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setChoirMode('join')}
                  className={[
                    'rounded-xl border-2 px-4 py-5 text-center transition-all',
                    choirMode === 'join'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary-light',
                  ].join(' ')}
                >
                  <span className="mb-2 block text-3xl" aria-hidden="true">
                    &#128101;
                  </span>
                  <span className="font-medium text-foreground">
                    {t('joinWithCode')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setChoirMode('create')}
                  className={[
                    'rounded-xl border-2 px-4 py-5 text-center transition-all',
                    choirMode === 'create'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary-light',
                  ].join(' ')}
                >
                  <span className="mb-2 block text-3xl" aria-hidden="true">
                    &#10024;
                  </span>
                  <span className="font-medium text-foreground">
                    {t('createNewChoir')}
                  </span>
                </button>
              </div>

              {choirMode === 'join' && (
                <Input
                  label={tAuth('inviteCode')}
                  placeholder="ABC-1234"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  dir="ltr"
                />
              )}

              {choirMode === 'create' && (
                <Input
                  label={t('choirName')}
                  placeholder="שם המקהלה שלכם..."
                  value={choirName}
                  onChange={(e) => setChoirName(e.target.value)}
                />
              )}
            </div>
          )}

          {/* Step 2: Voice part */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-center text-lg font-semibold text-foreground">
                {t('selectVoicePart')}
              </h2>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {voiceParts.map((part) => (
                  <button
                    key={part.key}
                    type="button"
                    onClick={() => setSelectedVoice(part.key)}
                    className={[
                      'rounded-xl border-2 px-3 py-4 text-center transition-all',
                      selectedVoice === part.key
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-border hover:border-primary-light',
                    ].join(' ')}
                  >
                    <span
                      className="mb-1 block text-2xl"
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: part.icon }}
                    />
                    <span className="text-sm font-medium text-foreground">
                      {part.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Tutorial */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-center text-lg font-semibold text-foreground">
                {t('tutorial')}
              </h2>
              <FadeOutDemo />
            </div>
          )}
        </Card>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between">
          {step > 1 ? (
            <Button variant="ghost" onClick={handleBack}>
              {tCommon('back')}
            </Button>
          ) : (
            <div />
          )}

          <Button
            variant="primary"
            size="lg"
            disabled={!canProceed()}
            loading={saving}
            onClick={handleNext}
          >
            {step === totalSteps ? t('getStarted') : tCommon('next')}
          </Button>
        </div>
      </div>
    </div>
  )
}

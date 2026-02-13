'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

interface QuotaInfo {
  freeSecondsUsed: number
  freeSecondsLimit: number
  freeSecondsRemaining: number
  subscriptionTier: string | null
  subscriptionExpiresAt: string | null
  isSubscribed: boolean
}

export default function PricingPage() {
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    fetch('/api/vocal-analysis/quota')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setQuota({ ...data, isSubscribed: !!data.subscriptionTier })
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleCheckout() {
    setCheckoutLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {
      // handled
    } finally {
      setCheckoutLoading(false)
    }
  }

  async function handlePortal() {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {
      // handled
    } finally {
      setPortalLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-border/40" />
        <div className="h-64 rounded-xl bg-border/30" />
      </div>
    )
  }

  const usedMin = Math.floor((quota?.freeSecondsUsed ?? 0) / 60)
  const limitMin = Math.floor((quota?.freeSecondsLimit ?? 3600) / 60)
  const remainMin = Math.floor((quota?.freeSecondsRemaining ?? 3600) / 60)

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">תוכניות ניתוח קולי</h1>
        <p className="mt-1 text-text-muted">שדרגו לניתוח קולי ללא הגבלה</p>
      </div>

      {/* Current usage */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">שימוש נוכחי</p>
            <p className="text-xs text-text-muted mt-1">
              {usedMin} מתוך {limitMin} דקות חינמיות ({remainMin} נותרו)
            </p>
          </div>
          {quota?.isSubscribed && (
            <Badge variant="primary">Premium</Badge>
          )}
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, (usedMin / limitMin) * 100)}%` }}
          />
        </div>
      </Card>

      {/* Plans */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Free */}
        <Card className="relative">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">חינם</h2>
              <p className="text-3xl font-bold text-foreground mt-2">
                ₪0<span className="text-sm font-normal text-text-muted">/חודש</span>
              </p>
            </div>
            <ul className="space-y-2 text-sm text-text-muted">
              <li className="flex gap-2"><span>✓</span> 60 דקות ניתוח קולי</li>
              <li className="flex gap-2"><span>✓</span> ציונים וטיפים</li>
              <li className="flex gap-2"><span>✓</span> שינון בלתי מוגבל</li>
              <li className="flex gap-2"><span>✓</span> משחקי זיכרון</li>
            </ul>
            <Button variant="outline" size="md" className="w-full" disabled>
              התוכנית הנוכחית
            </Button>
          </div>
        </Card>

        {/* Premium */}
        <Card className="relative ring-2 ring-primary/40">
          <Badge variant="primary" className="absolute -top-2 right-4">מומלץ</Badge>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Premium</h2>
              <p className="text-3xl font-bold text-foreground mt-2">
                ₪29<span className="text-sm font-normal text-text-muted">/חודש</span>
              </p>
            </div>
            <ul className="space-y-2 text-sm text-text-muted">
              <li className="flex gap-2"><span className="text-primary">✓</span> ניתוח קולי ללא הגבלה</li>
              <li className="flex gap-2"><span className="text-primary">✓</span> ציונים מתקדמים</li>
              <li className="flex gap-2"><span className="text-primary">✓</span> אנליטיקה מפורטת</li>
              <li className="flex gap-2"><span className="text-primary">✓</span> השוואת ביצועים</li>
            </ul>
            {quota?.isSubscribed ? (
              <Button
                variant="outline"
                size="md"
                className="w-full"
                loading={portalLoading}
                onClick={handlePortal}
              >
                ניהול מנוי
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                className="w-full"
                loading={checkoutLoading}
                onClick={handleCheckout}
              >
                שדרגו עכשיו
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

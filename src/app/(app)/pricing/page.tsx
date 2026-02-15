'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

interface QuotaInfo {
  freeSecondsUsed: number
  freeSecondsLimit: number
  purchasedSeconds: number
  totalAllowance: number
  totalRemaining: number
  plan: string | null
  monthlySecondsLimit: number
  hasChoirSubscription: boolean
  canTopUp: boolean
}

const PLANS: Array<{ id: string; name: string; minutes: number; price: string; priceNum: number; recommended?: boolean }> = [
  { id: 'starter', name: 'Starter', minutes: 30, price: '$10', priceNum: 10 },
  { id: 'pro', name: 'Pro', minutes: 150, price: '$30', priceNum: 30, recommended: true },
  { id: 'studio', name: 'Studio', minutes: 500, price: '$90', priceNum: 90 },
]

const TOPUPS = [
  { id: 'starter', minutes: 30, price: '$13' },
  { id: 'pro', minutes: 150, price: '$39' },
  { id: 'studio', minutes: 500, price: '$117' },
]

export default function PricingPage() {
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/vocal-analysis/quota')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setQuota(data) })
      .finally(() => setLoading(false))
  }, [])

  async function handleCheckout(type: 'subscribe' | 'topup', planId: string) {
    setActionLoading(`${type}-${planId}`)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, planId }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {
      // handled
    } finally {
      setActionLoading(null)
    }
  }

  async function handlePortal() {
    setActionLoading('portal')
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {
      // handled
    } finally {
      setActionLoading(null)
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
  const totalMin = Math.floor((quota?.totalAllowance ?? 1200) / 60)
  const remainMin = Math.floor((quota?.totalRemaining ?? 1200) / 60)

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">תוכניות ניתוח קולי</h1>
        <p className="mt-1 text-text-muted">דקות שלא נוצלו עוברות לחודש הבא</p>
      </div>

      {/* Current balance */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">יתרה נוכחית</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {remainMin} <span className="text-sm font-normal text-text-muted">דקות נותרו</span>
            </p>
            <p className="text-xs text-text-muted mt-1">
              {usedMin} מתוך {totalMin} דקות נוצלו
            </p>
          </div>
          <div className="flex gap-2">
            {quota?.plan && (
              <Badge variant="primary">{quota.plan.charAt(0).toUpperCase() + quota.plan.slice(1)}</Badge>
            )}
            {quota?.hasChoirSubscription && (
              <Badge variant="primary">Choir Unlimited</Badge>
            )}
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${totalMin > 0 ? Math.min(100, (usedMin / totalMin) * 100) : 0}%` }}
          />
        </div>
      </Card>

      {/* Subscription plans */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-4">מנויים חודשיים</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = quota?.plan === plan.id
            return (
              <Card key={plan.id} className={`relative overflow-visible ${plan.recommended ? 'ring-2 ring-primary/40' : ''}`}>
                {plan.recommended && (
                  <span className="absolute -top-3 right-4 z-10 inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    מומלץ
                  </span>
                )}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                    <p className="text-3xl font-bold text-foreground mt-2">
                      {plan.price}<span className="text-sm font-normal text-text-muted">/חודש</span>
                    </p>
                    <p className="text-sm text-text-muted mt-1">{plan.minutes} דקות לחודש</p>
                  </div>
                  <ul className="space-y-2 text-sm text-text-muted">
                    <li className="flex gap-2"><span className="text-primary">✓</span> דקות עוברות לחודש הבא</li>
                    <li className="flex gap-2"><span className="text-primary">✓</span> ציונים וטיפים</li>
                    <li className="flex gap-2"><span className="text-primary">✓</span> אנליטיקה מפורטת</li>
                  </ul>
                  {isCurrent ? (
                    <Button
                      variant="outline"
                      size="md"
                      className="w-full"
                      loading={actionLoading === 'portal'}
                      onClick={handlePortal}
                    >
                      ניהול מנוי
                    </Button>
                  ) : (
                    <Button
                      variant={plan.recommended ? 'primary' : 'outline'}
                      size="md"
                      className="w-full"
                      loading={actionLoading === `subscribe-${plan.id}`}
                      onClick={() => handleCheckout('subscribe', plan.id)}
                    >
                      {quota?.plan ? 'החלפת תוכנית' : 'הרשמה'}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Top-up section */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-2">טעינת דקות</h2>
        <p className="text-sm text-text-muted mb-4">רכישה חד-פעמית — הדקות מתווספות ליתרה הקיימת</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {TOPUPS.map((pack) => (
            <Card key={pack.id} className="flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground">{pack.minutes} דקות</p>
                <p className="text-sm text-text-muted">{pack.price}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                loading={actionLoading === `topup-${pack.id}`}
                onClick={() => handleCheckout('topup', pack.id)}
              >
                קנו עכשיו
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* Manage existing subscription */}
      {quota?.plan && (
        <div className="text-center">
          <button
            className="text-sm text-text-muted underline hover:text-foreground transition-colors"
            onClick={handlePortal}
          >
            ניהול מנוי ותשלומים
          </button>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

interface UpgradePromptProps {
  isOpen: boolean
  onClose: () => void
}

const PLANS = [
  { id: 'starter', name: 'Starter', minutes: 30, price: '$10/mo' },
  { id: 'pro', name: 'Pro', minutes: 150, price: '$30/mo' },
  { id: 'studio', name: 'Studio', minutes: 500, price: '$90/mo' },
] as const

export default function UpgradePrompt({ isOpen, onClose }: UpgradePromptProps) {
  const [loading, setLoading] = useState<string | null>(null)

  async function handleSubscribe(planId: string) {
    setLoading(planId)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'subscribe', planId }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {
      // handled
    } finally {
      setLoading(null)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="הוסיפו דקות ניתוח קולי">
      <div className="space-y-4">
        <p className="text-sm text-text-muted text-center">
          נגמר הזמן החינמי לניתוח קולי. בחרו תוכנית — דקות שלא נוצלו עוברות לחודש הבא!
        </p>
        <div className="space-y-2">
          {PLANS.map((plan) => (
            <button
              key={plan.id}
              className="w-full flex items-center justify-between rounded-xl border border-border p-3 hover:bg-surface-hover transition-colors"
              onClick={() => handleSubscribe(plan.id)}
              disabled={!!loading}
            >
              <div className="text-right">
                <p className="font-bold text-foreground">{plan.name}</p>
                <p className="text-xs text-text-muted">{plan.minutes} דקות/חודש</p>
              </div>
              <Button
                variant={plan.id === 'pro' ? 'primary' : 'outline'}
                size="sm"
                loading={loading === plan.id}
              >
                {plan.price}
              </Button>
            </button>
          ))}
        </div>
        <div className="text-center">
          <button
            className="text-sm text-text-muted underline hover:text-foreground"
            onClick={onClose}
          >
            אחר כך
          </button>
        </div>
      </div>
    </Modal>
  )
}

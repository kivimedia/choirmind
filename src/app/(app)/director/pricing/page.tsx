'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { useChoirStore } from '@/stores/useChoirStore'

export default function DirectorPricingPage() {
  const { activeChoirId } = useChoirStore()
  const [loading, setLoading] = useState(false)

  async function handleSubscribe() {
    if (!activeChoirId) return
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/choir-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choirId: activeChoirId }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      // error handled silently
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">מנוי מקהלה</h1>
      <p className="text-text-muted">
        שדרגו את המקהלה לגישה בלתי מוגבלת לניתוח קולי עבור כל החברים
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Free tier */}
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">חינמי</h3>
              <Badge variant="default">נוכחי</Badge>
            </div>
            <p className="text-3xl font-bold text-foreground">
              $0 <span className="text-sm font-normal text-text-muted">/ חודש</span>
            </p>
            <ul className="space-y-2 text-sm text-text-muted">
              <li>60 דקות ניתוח קולי לכל חבר</li>
              <li>שינון טקסט ללא הגבלה</li>
              <li>משחקי זיכרון</li>
              <li>לוח מוכנות בסיסי</li>
            </ul>
          </div>
        </Card>

        {/* Premium tier */}
        <Card className="ring-2 ring-primary/30">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">פרימיום</h3>
              <Badge variant="primary">מומלץ</Badge>
            </div>
            <p className="text-3xl font-bold text-foreground">
              $29 <span className="text-sm font-normal text-text-muted">/ חודש</span>
            </p>
            <ul className="space-y-2 text-sm text-text-muted">
              <li>ניתוח קולי ללא הגבלה לכל החברים</li>
              <li>שינון טקסט ללא הגבלה</li>
              <li>לוח מוכנות מתקדם</li>
              <li>אנליטיקות מנצח מפורטות</li>
              <li>עד 50 חברים</li>
            </ul>
            <Button
              variant="primary"
              className="w-full"
              onClick={handleSubscribe}
              disabled={loading || !activeChoirId}
            >
              {loading ? 'מעבד...' : 'שדרגו עכשיו'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

interface UpgradePromptProps {
  isOpen: boolean
  onClose: () => void
}

export default function UpgradePrompt({ isOpen, onClose }: UpgradePromptProps) {
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {
      // handled
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="שדרגו לניתוח ללא הגבלה">
      <div className="space-y-4 text-center">
        <span className="text-5xl block">🎤</span>
        <p className="text-foreground font-medium">
          נגמר הזמן החינמי לניתוח קולי
        </p>
        <p className="text-sm text-text-muted">
          שדרגו ל-Premium וקבלו ניתוח קולי ללא הגבלה, אנליטיקה מתקדמת והשוואת ביצועים
        </p>
        <div className="flex gap-3">
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            loading={loading}
            onClick={handleUpgrade}
          >
            ₪29/חודש — שדרגו עכשיו
          </Button>
          <Button variant="outline" size="lg" onClick={onClose}>
            אחר כך
          </Button>
        </div>
      </div>
    </Modal>
  )
}

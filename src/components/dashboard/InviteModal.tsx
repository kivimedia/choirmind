'use client'

import { useState, useCallback } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

interface InviteModalProps {
  isOpen: boolean
  onClose: () => void
  inviteCode: string
}

export default function InviteModal({ isOpen, onClose, inviteCode }: InviteModalProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select text for manual copy
      const el = document.getElementById('invite-code-display')
      if (el) {
        const range = document.createRange()
        range.selectNodeContents(el)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    }
  }, [inviteCode])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={'\u05D4\u05D6\u05DE\u05E0\u05EA \u05D7\u05D1\u05E8\u05D9\u05DD'}
    >
      <div className="space-y-5 text-center">
        <p className="text-sm text-text-muted">
          {'\u05E9\u05EA\u05E4\u05D5 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D3 \u05D4\u05D6\u05D4 \u05E2\u05DD \u05D7\u05D1\u05E8\u05D9 \u05D4\u05DE\u05E7\u05D4\u05DC\u05D4'}
        </p>

        {/* Large invite code display */}
        <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-6 py-5">
          <p
            id="invite-code-display"
            className="text-3xl font-bold tracking-[0.3em] text-primary select-all"
            dir="ltr"
          >
            {inviteCode}
          </p>
        </div>

        {/* Copy button */}
        <Button
          variant={copied ? 'secondary' : 'primary'}
          size="md"
          onClick={handleCopy}
          className="w-full"
        >
          {copied
            ? '\u2713 \u05D4\u05D5\u05E2\u05EA\u05E7!'
            : '\u05D4\u05E2\u05EA\u05E7 \u05E7\u05D5\u05D3'}
        </Button>

        <p className="text-xs text-text-muted">
          {'\u05D4\u05D7\u05D1\u05E8\u05D9\u05DD \u05D9\u05D5\u05DB\u05DC\u05D5 \u05DC\u05D4\u05E9\u05EA\u05DE\u05E9 \u05D1\u05E7\u05D5\u05D3 \u05D6\u05D4 \u05DB\u05D3\u05D9 \u05DC\u05D4\u05E6\u05D8\u05E8\u05E3 \u05DC\u05DE\u05E7\u05D4\u05DC\u05D4'}
        </p>
      </div>
    </Modal>
  )
}

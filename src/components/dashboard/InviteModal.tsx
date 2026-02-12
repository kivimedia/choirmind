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

  const inviteLink = typeof window !== 'undefined'
    ? `${window.location.origin}/join/${inviteCode}`
    : `/join/${inviteCode}`

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback: select text for manual copy
      const el = document.getElementById('invite-link-display')
      if (el) {
        const range = document.createRange()
        range.selectNodeContents(el)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    }
  }, [inviteLink])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="הזמנת חברים"
    >
      <div className="space-y-5 text-center">
        <p className="text-sm text-text-muted">
          שלחו את הקישור הזה לחברי המקהלה — הם יתחברו ויצטרפו אוטומטית
        </p>

        {/* Link display */}
        <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-4">
          <p
            id="invite-link-display"
            className="text-sm font-medium text-primary select-all break-all"
            dir="ltr"
          >
            {inviteLink}
          </p>
        </div>

        {/* Copy link button */}
        <Button
          variant={copied ? 'secondary' : 'primary'}
          size="md"
          onClick={handleCopyLink}
          className="w-full"
        >
          {copied ? '\u2713 הקישור הועתק!' : 'העתק קישור הזמנה'}
        </Button>

        {/* Code fallback note */}
        <div className="rounded-lg bg-surface-hover px-4 py-3">
          <p className="text-xs text-text-muted mb-1">קוד הצטרפות ידני:</p>
          <p className="text-lg font-bold tracking-[0.2em] text-foreground" dir="ltr">
            {inviteCode}
          </p>
        </div>
      </div>
    </Modal>
  )
}

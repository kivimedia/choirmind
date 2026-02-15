'use client'

import { type ReactNode, useEffect, useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
  /** Allow dragging the modal by its header + resizing from the bottom-right corner. */
  resizable?: boolean
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  className = '',
  resizable = false,
}: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown])

  // ── Drag state ──────────────────────────────────────────────
  const dialogRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })

  // Reset position when modal opens
  useEffect(() => {
    if (isOpen) setOffset({ x: 0, y: 0 })
  }, [isOpen])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!resizable) return
      // Only drag from the header area (not buttons)
      if ((e.target as HTMLElement).closest('button')) return
      dragging.current = true
      dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [resizable, offset],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    setOffset({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    })
  }, [])

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Dialog */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: resizable ? offset.y : 0, x: resizable ? offset.x : 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={dragging.current ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
            className={[
              'relative z-10 w-full max-w-lg mx-4 flex flex-col max-h-[90vh]',
              'rounded-2xl border border-border bg-surface shadow-xl',
              resizable ? 'resize overflow-hidden' : '',
              className,
            ].join(' ')}
          >
            {/* Header */}
            {title && (
              <div
                className={[
                  'flex items-center justify-between border-b border-border px-6 py-4',
                  resizable ? 'cursor-grab active:cursor-grabbing select-none' : '',
                ].join(' ')}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                <h2 className="text-lg font-semibold text-foreground text-start">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label="Close"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            )}

            {/* Close button when no title */}
            {!title && (
              <button
                type="button"
                onClick={onClose}
                className="absolute top-3 end-3 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                aria-label="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1 min-h-0">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

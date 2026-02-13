'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useNotificationStore, type NotificationType } from '@/stores/useNotificationStore'

const bgMap: Record<NotificationType, string> = {
  info: 'bg-surface border-primary/30',
  warning: 'bg-status-shaky/10 border-status-shaky/30',
  success: 'bg-status-solid/10 border-status-solid/30',
  achievement: 'bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/40',
}

const textMap: Record<NotificationType, string> = {
  info: 'text-foreground',
  warning: 'text-status-shaky',
  success: 'text-status-solid',
  achievement: 'text-foreground',
}

export default function ToastContainer() {
  const { notifications, dismissNotification } = useNotificationStore()

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 flex flex-col items-center gap-2 pointer-events-none sm:items-start sm:right-auto sm:left-4"
      dir="rtl"
    >
      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className={`pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm max-w-sm w-full ${bgMap[n.type]}`}
            role="alert"
          >
            {n.type === 'achievement' && n.icon && (
              <span className="text-2xl shrink-0">{n.icon}</span>
            )}
            {n.type === 'warning' && (
              <span className="text-lg shrink-0">⚠️</span>
            )}
            {n.type === 'success' && !n.icon && (
              <span className="text-lg shrink-0">✓</span>
            )}
            <p className={`text-sm font-medium flex-1 ${textMap[n.type]}`}>
              {n.message}
            </p>
            <button
              onClick={() => dismissNotification(n.id)}
              className="shrink-0 text-text-muted hover:text-foreground transition-colors"
              aria-label="סגור"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

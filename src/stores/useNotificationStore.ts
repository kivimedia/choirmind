import { create } from 'zustand'

export type NotificationType = 'info' | 'warning' | 'success' | 'achievement'

export interface Notification {
  id: string
  type: NotificationType
  message: string
  /** Achievement icon (emoji) — only for type "achievement" */
  icon?: string
  /** Auto-dismiss after ms (default 5000, 0 = manual) */
  duration?: number
}

interface NotificationStore {
  notifications: Notification[]
  addNotification: (n: Omit<Notification, 'id'>) => void
  dismissNotification: (id: string) => void
}

let nextId = 1

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],

  addNotification: (n) => {
    const id = `notif-${nextId++}`
    set((state) => ({
      notifications: [...state.notifications, { ...n, id }],
    }))

    // Auto-dismiss
    const duration = n.duration ?? (n.type === 'achievement' ? 6000 : 5000)
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((x) => x.id !== id),
        }))
      }, duration)
    }
  },

  dismissNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }))
  },
}))

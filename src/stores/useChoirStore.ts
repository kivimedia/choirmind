import { create } from 'zustand'

interface ChoirInfo {
  id: string
  name: string
  role: string
}

interface ChoirStore {
  activeChoirId: string | null
  choirs: ChoirInfo[]
  loaded: boolean
  setActiveChoirId: (id: string | null) => void
  setChoirs: (choirs: ChoirInfo[]) => void
  loadChoirs: () => Promise<void>
}

function getPersistedChoirId(): string | null {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem('choirmind:activeChoirId') : null
  } catch {
    return null
  }
}

export const useChoirStore = create<ChoirStore>((set, get) => ({
  activeChoirId: getPersistedChoirId(),
  choirs: [],
  loaded: false,

  setActiveChoirId: (id) => {
    set({ activeChoirId: id })
    try {
      if (id) {
        localStorage.setItem('choirmind:activeChoirId', id)
      } else {
        localStorage.removeItem('choirmind:activeChoirId')
      }
    } catch {
      // localStorage unavailable
    }
  },

  setChoirs: (choirs) => {
    set({ choirs })
  },

  loadChoirs: async () => {
    if (get().loaded) return
    try {
      const res = await fetch('/api/choir')
      if (!res.ok) return
      const data = await res.json()
      const choirs: ChoirInfo[] = (data.choirs ?? []).map((c: Record<string, unknown>) => ({
        id: c.id as string,
        name: c.name as string,
        role: c.role as string,
      }))
      set({ choirs, loaded: true })

      // Restore persisted selection or auto-select
      let saved: string | null = null
      try {
        saved = localStorage.getItem('choirmind:activeChoirId')
      } catch {
        // localStorage unavailable
      }

      if (saved && choirs.some((c) => c.id === saved)) {
        set({ activeChoirId: saved })
      } else if (choirs.length >= 2) {
        // Auto-select first choir for multi-choir users
        set({ activeChoirId: choirs[0].id })
        try { localStorage.setItem('choirmind:activeChoirId', choirs[0].id) } catch {}
      } else if (choirs.length === 1) {
        // Single choir: auto-select it
        set({ activeChoirId: choirs[0].id })
        try { localStorage.setItem('choirmind:activeChoirId', choirs[0].id) } catch {}
      }
      // 0 choirs: activeChoirId stays null
    } catch {
      // Network error — leave empty
    }
  },
}))

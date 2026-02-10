'use client'

import { type ReactNode } from 'react'

interface Tab {
  key: string
  label: string
  content: ReactNode
}

interface TabsProps {
  tabs: Tab[]
  activeTab: string
  onChange: (key: string) => void
}

export default function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  const activeContent = tabs.find((t) => t.key === activeTab)?.content

  return (
    <div>
      {/* Tab list */}
      <div
        role="tablist"
        className="flex border-b border-border"
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab
          return (
            <button
              key={tab.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.key}`}
              id={`tab-${tab.key}`}
              onClick={() => onChange(tab.key)}
              className={[
                'relative px-5 py-3 text-sm font-medium transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset',
                isActive
                  ? 'text-primary'
                  : 'text-text-muted hover:text-foreground hover:bg-surface-hover',
              ].join(' ')}
            >
              {tab.label}
              {/* Active indicator line */}
              {isActive && (
                <span className="absolute inset-inline-0 bottom-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      {/* Tab panel */}
      {activeContent && (
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          className="pt-4"
        >
          {activeContent}
        </div>
      )}
    </div>
  )
}

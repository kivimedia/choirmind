'use client'

import { type ReactNode } from 'react'

interface CardProps {
  className?: string
  children: ReactNode
  header?: ReactNode
  onClick?: () => void
  hoverable?: boolean
}

export default function Card({
  className = '',
  children,
  header,
  onClick,
  hoverable = false,
}: CardProps) {
  const interactive = hoverable || !!onClick

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      className={[
        'rounded-xl border border-border bg-surface',
        'transition-shadow duration-200 ease-in-out',
        interactive && 'cursor-pointer hover:shadow-md hover:border-primary-light',
        onClick && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {header && (
        <div className="border-b border-border px-5 py-4">
          {typeof header === 'string' ? (
            <h3 className="text-lg font-semibold text-foreground">{header}</h3>
          ) : (
            header
          )}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

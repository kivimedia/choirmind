'use client'

import { type ReactNode } from 'react'

type BadgeVariant =
  | 'default'
  | 'primary'
  | 'fragile'
  | 'shaky'
  | 'developing'
  | 'solid'
  | 'locked'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    'bg-border/40 text-foreground',
  primary:
    'bg-primary/15 text-primary-dark',
  fragile:
    'bg-status-fragile/15 text-status-fragile',
  shaky:
    'bg-status-shaky/15 text-status-shaky',
  developing:
    'bg-status-developing/20 text-yellow-700',
  solid:
    'bg-status-solid/15 text-status-solid',
  locked:
    'bg-status-locked/15 text-status-locked',
}

export default function Badge({
  variant = 'default',
  children,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5',
        'text-xs font-semibold leading-5',
        variantClasses[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}

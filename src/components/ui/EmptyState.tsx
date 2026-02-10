'use client'

import Button from './Button'

interface EmptyStateProps {
  /** An emoji string used as the visual icon */
  icon?: string
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && (
        <span className="mb-4 text-5xl leading-none" role="img" aria-hidden="true">
          {icon}
        </span>
      )}

      <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>

      {description && (
        <p className="max-w-sm text-sm text-text-muted mb-6">{description}</p>
      )}

      {actionLabel && onAction && (
        <Button variant="primary" size="md" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

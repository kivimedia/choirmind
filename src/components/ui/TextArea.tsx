'use client'

import { type TextareaHTMLAttributes, forwardRef, useId } from 'react'

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  rows?: number
}

const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, rows = 5, dir = 'rtl', className = '', id, ...rest }, ref) => {
    const generatedId = useId()
    const textareaId = id ?? generatedId
    const errorId = error ? `${textareaId}-error` : undefined

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-sm font-medium text-foreground text-start"
          >
            {label}
          </label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          dir={dir}
          rows={rows}
          aria-invalid={!!error}
          aria-describedby={errorId}
          className={[
            'w-full rounded-lg border bg-surface px-4 py-2.5',
            'text-foreground placeholder:text-text-muted',
            'leading-relaxed resize-y',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-offset-1',
            error
              ? 'border-danger focus:border-danger focus:ring-danger/30'
              : 'border-border hover:border-primary-light focus:border-primary focus:ring-primary/30',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-hover',
            className,
          ].join(' ')}
          {...rest}
        />

        {error && (
          <p id={errorId} className="text-sm text-danger text-start" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)

TextArea.displayName = 'TextArea'

export default TextArea

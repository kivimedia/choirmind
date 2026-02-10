'use client'

import { type InputHTMLAttributes, forwardRef, useId } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  dir?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, dir = 'auto', className = '', id, ...rest }, ref) => {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const errorId = error ? `${inputId}-error` : undefined
    const helperId = helperText ? `${inputId}-helper` : undefined

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-foreground text-start"
          >
            {label}
          </label>
        )}

        <input
          ref={ref}
          id={inputId}
          dir={dir}
          aria-invalid={!!error}
          aria-describedby={
            [errorId, helperId].filter(Boolean).join(' ') || undefined
          }
          className={[
            'w-full rounded-lg border bg-surface px-4 py-2.5',
            'text-foreground placeholder:text-text-muted',
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

        {helperText && !error && (
          <p id={helperId} className="text-sm text-text-muted text-start">
            {helperText}
          </p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'

export default Input

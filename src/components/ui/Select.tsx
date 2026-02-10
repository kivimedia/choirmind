'use client'

import { type SelectHTMLAttributes, forwardRef, useId } from 'react'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: SelectOption[]
  error?: string
  placeholder?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    { label, options, error, placeholder, className = '', id, ...rest },
    ref,
  ) => {
    const generatedId = useId()
    const selectId = id ?? generatedId
    const errorId = error ? `${selectId}-error` : undefined

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="text-sm font-medium text-foreground text-start"
          >
            {label}
          </label>
        )}

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            aria-invalid={!!error}
            aria-describedby={errorId}
            className={[
              'w-full appearance-none rounded-lg border bg-surface',
              'ps-4 pe-10 py-2.5',
              'text-foreground',
              'transition-colors duration-150',
              'focus:outline-none focus:ring-2 focus:ring-offset-1',
              error
                ? 'border-danger focus:border-danger focus:ring-danger/30'
                : 'border-border hover:border-primary-light focus:border-primary focus:ring-primary/30',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-hover',
              className,
            ].join(' ')}
            {...rest}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Chevron indicator */}
          <div className="pointer-events-none absolute inset-block-0 end-0 flex items-center pe-3">
            <svg
              className="h-4 w-4 text-text-muted"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>

        {error && (
          <p id={errorId} className="text-sm text-danger text-start" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)

Select.displayName = 'Select'

export default Select

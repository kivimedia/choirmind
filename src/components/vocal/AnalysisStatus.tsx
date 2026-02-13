'use client'

interface AnalysisStatusProps {
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  errorMessage?: string | null
}

const STAGES = [
  { key: 'upload', label: 'מעלה הקלטה' },
  { key: 'isolate', label: 'מבודד קול' },
  { key: 'analyze', label: 'מנתח ביצוע' },
  { key: 'score', label: 'מחשב ציון' },
  { key: 'tips', label: 'מכין טיפים' },
]

function Spinner() {
  return (
    <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export default function AnalysisStatus({ status, errorMessage }: AnalysisStatusProps) {
  if (status === 'FAILED') {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <span className="text-4xl">{'❌'}</span>
        <p className="text-lg font-semibold text-foreground">
          {'הניתוח נכשל'}
        </p>
        {errorMessage && (
          <p className="text-sm text-text-muted text-center max-w-sm">
            {errorMessage}
          </p>
        )}
      </div>
    )
  }

  if (status === 'COMPLETED') {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <span className="text-4xl">{'✅'}</span>
        <p className="text-lg font-semibold text-foreground">
          {'הניתוח הושלם!'}
        </p>
      </div>
    )
  }

  // PENDING or PROCESSING
  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <Spinner />
      <p className="text-lg font-semibold text-foreground">
        {'מנתח את ההקלטה שלכם...'}
      </p>
      <div className="w-full max-w-xs space-y-2">
        {STAGES.map((stage, i) => {
          const isActive = status === 'PROCESSING' && i <= 2
          return (
            <div key={stage.key} className="flex items-center gap-2">
              <div
                className={[
                  'h-2 w-2 rounded-full shrink-0',
                  isActive ? 'bg-primary animate-pulse' : 'bg-border/40',
                ].join(' ')}
              />
              <span
                className={[
                  'text-sm',
                  isActive ? 'text-foreground' : 'text-text-muted',
                ].join(' ')}
              >
                {stage.label}
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-text-muted">
        {'בדרך כלל לוקח 10-30 שניות'}
      </p>
    </div>
  )
}

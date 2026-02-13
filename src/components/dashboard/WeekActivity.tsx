'use client'

interface DayData {
  date: string
  practiced: boolean
}

interface WeekActivityProps {
  days: DayData[]
}

const DAY_NAMES_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

export default function WeekActivity({ days }: WeekActivityProps) {
  return (
    <div className="flex items-center gap-2">
      {days.map((day) => {
        const date = new Date(day.date)
        const dayName = DAY_NAMES_HE[date.getDay()]
        return (
          <div key={day.date} className="flex flex-col items-center gap-1">
            <div
              className={[
                'h-8 w-8 rounded-md transition-colors',
                day.practiced
                  ? 'bg-primary'
                  : 'bg-border/30',
              ].join(' ')}
              title={day.date}
            />
            <span className="text-[12px] text-text-muted">{dayName}</span>
          </div>
        )
      })}
    </div>
  )
}

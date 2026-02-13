'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface ScoreDataPoint {
  date: string
  overallScore: number
  pitchScore: number
  timingScore: number
  dynamicsScore: number
}

interface ScoreHistoryChartProps {
  data: ScoreDataPoint[]
}

export default function ScoreHistoryChart({ data }: ScoreHistoryChartProps) {
  if (data.length === 0) return null

  const chartData = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }),
  }))

  return (
    <div className="h-52 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" opacity={0.5} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--color-text-muted, #9ca3af)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: 'var(--color-text-muted, #9ca3af)' }}
            tickLine={false}
            axisLine={false}
            width={30}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid var(--color-border, #e5e7eb)',
              fontSize: '12px',
            }}
          />
          <Line type="monotone" dataKey="overallScore" name="כללי" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="pitchScore" name="גובה" stroke="#22c55e" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
          <Line type="monotone" dataKey="timingScore" name="תזמון" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
          <Line type="monotone" dataKey="dynamicsScore" name="דינמיקה" stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

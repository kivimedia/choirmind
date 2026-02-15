'use client'

import { useState, useEffect } from 'react'

interface MicSelectorProps {
  selectedDeviceId: string | null
  onSelect: (deviceId: string | null) => void
}

export default function MicSelector({ selectedDeviceId, onSelect }: MicSelectorProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function enumerate() {
      try {
        // Request mic permission first (needed to get device labels)
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(t => t.stop())

        const all = await navigator.mediaDevices.enumerateDevices()
        if (cancelled) return
        const mics = all.filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'communications')
        setDevices(mics)

        // Auto-select first if nothing selected
        if (!selectedDeviceId && mics.length > 0) {
          onSelect(mics[0].deviceId)
        }
      } catch {
        // Permission denied or no devices — leave empty
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    enumerate()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span>{'טוען מיקרופונים...'}</span>
      </div>
    )
  }

  if (devices.length === 0) return null

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-text-muted">{'🎤 מיקרופון'}</label>
      <select
        value={selectedDeviceId || ''}
        onChange={(e) => onSelect(e.target.value || null)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
      >
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
          </option>
        ))}
      </select>
    </div>
  )
}

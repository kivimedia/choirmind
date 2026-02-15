'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface MicSelectorProps {
  selectedDeviceId: string | null
  onSelect: (deviceId: string | null) => void
}

const STORAGE_KEY_ID = 'choirmind-mic-id'
const STORAGE_KEY_LABEL = 'choirmind-mic-label'

export default function MicSelector({ selectedDeviceId, onSelect }: MicSelectorProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [level, setLevel] = useState(0) // 0-1 volume level
  const [restoredDefault, setRestoredDefault] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  const testStreamRef = useRef<MediaStream | null>(null)
  const testCtxRef = useRef<AudioContext | null>(null)
  const testRAFRef = useRef<number>(0)
  const testTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

        // Restore saved mic or auto-select first
        if (mics.length > 0) {
          const savedId = localStorage.getItem(STORAGE_KEY_ID)
          const savedLabel = localStorage.getItem(STORAGE_KEY_LABEL)

          // Try matching by deviceId first, then fall back to label match
          // (browser device IDs can rotate across sessions, but labels are stable)
          let match = savedId ? mics.find(m => m.deviceId === savedId) : null
          if (!match && savedLabel) {
            match = mics.find(m => m.label === savedLabel)
          }

          if (match) {
            // Persist the (possibly updated) deviceId
            localStorage.setItem(STORAGE_KEY_ID, match.deviceId)
            onSelect(match.deviceId)
            setRestoredDefault(true)
          } else if (!selectedDeviceId) {
            onSelect(mics[0].deviceId)
          }
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

  // Clear "saved" toast timer on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const stopTest = useCallback(() => {
    if (testRAFRef.current) cancelAnimationFrame(testRAFRef.current)
    if (testTimerRef.current) clearTimeout(testTimerRef.current)
    testStreamRef.current?.getTracks().forEach(t => t.stop())
    testStreamRef.current = null
    if (testCtxRef.current?.state !== 'closed') {
      testCtxRef.current?.close()
    }
    testCtxRef.current = null
    setTesting(false)
    setLevel(0)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopTest() }
  }, [stopTest])

  const startTest = useCallback(async () => {
    // Stop any existing test first
    stopTest()

    try {
      const constraints: MediaTrackConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }
      if (selectedDeviceId) {
        constraints.deviceId = { exact: selectedDeviceId }
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints })
      testStreamRef.current = stream

      const ctx = new AudioContext()
      if (ctx.state === 'suspended') await ctx.resume()
      testCtxRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)

      // Route mic → speakers so user hears themselves
      source.connect(ctx.destination)

      // Analyser for volume level display
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const dataArr = new Uint8Array(analyser.frequencyBinCount)

      function tick() {
        analyser.getByteTimeDomainData(dataArr)
        // Compute RMS level (0-1)
        let sum = 0
        for (let i = 0; i < dataArr.length; i++) {
          const v = (dataArr[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / dataArr.length)
        setLevel(Math.min(1, rms * 3)) // amplify for visual
        testRAFRef.current = requestAnimationFrame(tick)
      }
      tick()

      setTesting(true)

      // Auto-stop after 8 seconds
      testTimerRef.current = setTimeout(() => {
        stopTest()
      }, 8000)
    } catch {
      stopTest()
    }
  }, [selectedDeviceId, stopTest])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span>{'טוען מיקרופונים...'}</span>
      </div>
    )
  }

  if (devices.length === 0) return null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-text-muted">{'🎤 מיקרופון'}</label>
        {restoredDefault && !justSaved && (
          <span className="text-[10px] text-primary/70 font-medium">{'ברירת מחדל'}</span>
        )}
        {justSaved && (
          <span className="text-[10px] text-status-solid font-medium animate-pulse">{'נשמר כברירת מחדל ✓'}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={selectedDeviceId || ''}
          onChange={(e) => {
            const id = e.target.value || null
            if (id) {
              localStorage.setItem(STORAGE_KEY_ID, id)
              // Also save label for cross-session matching
              const device = devices.find(d => d.deviceId === id)
              if (device?.label) {
                localStorage.setItem(STORAGE_KEY_LABEL, device.label)
              }
              // Show "saved" confirmation
              setJustSaved(true)
              setRestoredDefault(false)
              if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
              savedTimerRef.current = setTimeout(() => {
                setJustSaved(false)
                setRestoredDefault(true)
              }, 2500)
            }
            onSelect(id)
            if (testing) stopTest()
          }}
          disabled={testing}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
        >
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
        <button
          onClick={testing ? stopTest : startTest}
          className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
            testing
              ? 'bg-status-fragile/20 text-status-fragile border border-status-fragile/40 hover:bg-status-fragile/30'
              : 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20'
          }`}
        >
          {testing ? 'עצור' : 'בדוק'}
        </button>
      </div>

      {/* Volume level bar — shown while testing */}
      {testing && (
        <div className="space-y-1">
          <div className="h-2.5 w-full rounded-full bg-border/30 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-75"
              style={{
                width: `${Math.round(level * 100)}%`,
                backgroundColor: level > 0.6 ? 'var(--color-status-solid, #22c55e)'
                  : level > 0.2 ? 'var(--color-status-developing, #eab308)'
                  : 'var(--color-border, #d1d5db)',
              }}
            />
          </div>
          <p className="text-[10px] text-text-muted">
            {'דבר/י למיקרופון — אתה אמור/ה לשמוע את עצמך. ייעצר אוטומטית.'}
          </p>
        </div>
      )}
    </div>
  )
}

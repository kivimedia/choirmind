'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Button from '@/components/ui/Button'

interface SideBySidePlayerProps {
  referenceUrl?: string
  userRecordingUrl?: string
  referenceLabel?: string
  userLabel?: string
}

function useAudioPlayback(url?: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (!url) return
    const audio = new Audio(url)
    audioRef.current = audio

    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration))
    audio.addEventListener('timeupdate', () => setCurrentTime(audio.currentTime))
    audio.addEventListener('ended', () => setIsPlaying(false))

    return () => {
      audio.pause()
      audio.src = ''
    }
  }, [url])

  const toggle = useCallback(() => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
    }
  }, [])

  return { isPlaying, currentTime, duration, toggle, seek }
}

function formatSecs(s: number): string {
  const mins = Math.floor(s / 60)
  const secs = Math.floor(s % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function TrackRow({
  label,
  url,
}: {
  label: string
  url?: string
}) {
  const { isPlaying, currentTime, duration, toggle } = useAudioPlayback(url)

  if (!url) return null

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={toggle} disabled={!url}>
          {isPlaying ? '⏸' : '▶️'}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <div className="mt-1 h-1.5 w-full rounded-full bg-border/40 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[12px] text-text-muted tabular-nums" dir="ltr">
              {formatSecs(currentTime)}
            </span>
            <span className="text-[12px] text-text-muted tabular-nums" dir="ltr">
              {formatSecs(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SideBySidePlayer({
  referenceUrl,
  userRecordingUrl,
  referenceLabel = 'הפניה',
  userLabel = 'ההקלטה שלך',
}: SideBySidePlayerProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">
        {'השוואה'}
      </h3>
      <TrackRow label={referenceLabel} url={referenceUrl} />
      <TrackRow label={userLabel} url={userRecordingUrl} />
    </div>
  )
}

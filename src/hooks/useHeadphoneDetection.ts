'use client'

import { useState, useEffect } from 'react'

const HEADPHONE_KEYWORDS = [
  'headphone', 'earphone', 'bluetooth', 'airpod', 'earbud',
  'headset', 'earbuds', 'beats', 'buds', 'wireless',
  'אוזניות', // Hebrew
]

export interface HeadphoneDetectionResult {
  isHeadphones: boolean | null
  isDetecting: boolean
}

export function useHeadphoneDetection(): HeadphoneDetectionResult {
  const [isHeadphones, setIsHeadphones] = useState<boolean | null>(null)
  const [isDetecting, setIsDetecting] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function detect() {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          setIsHeadphones(null)
          setIsDetecting(false)
          return
        }

        const devices = await navigator.mediaDevices.enumerateDevices()
        const outputDevices = devices.filter((d) => d.kind === 'audiooutput')

        const found = outputDevices.some((device) => {
          const label = device.label.toLowerCase()
          return HEADPHONE_KEYWORDS.some((kw) => label.includes(kw))
        })

        if (!cancelled) {
          setIsHeadphones(found)
          setIsDetecting(false)
        }
      } catch {
        if (!cancelled) {
          setIsHeadphones(null)
          setIsDetecting(false)
        }
      }
    }

    detect()

    // Listen for device changes
    const handleChange = () => { detect() }
    navigator.mediaDevices?.addEventListener?.('devicechange', handleChange)

    return () => {
      cancelled = true
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleChange)
    }
  }, [])

  return { isHeadphones, isDetecting }
}

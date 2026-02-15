'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

export interface VocalRecorderState {
  isRecording: boolean
  isPaused: boolean
  durationMs: number
  analyserData: Uint8Array | null
  audioBlob: Blob | null
  error: string | null
  backingPlaying: boolean
}

export interface VocalRecorderActions {
  startRecording: () => Promise<void>
  stopRecording: () => void
  pauseRecording: () => void
  resumeRecording: () => void
  reset: () => void
}

export interface UseVocalRecorderOptions {
  backingTrackBuffer?: ArrayBuffer | null
  useHeadphones?: boolean
  deviceId?: string | null
}

export function useVocalRecorder(options?: UseVocalRecorderOptions): VocalRecorderState & VocalRecorderActions {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [durationMs, setDurationMs] = useState(0)
  const [analyserData, setAnalyserData] = useState<Uint8Array | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [backingPlaying, setBackingPlaying] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const backingSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const animFrameRef = useRef<number>(0)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      try { backingSourceRef.current?.stop() } catch {}
      backingSourceRef.current = null
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close()
      }
    }
  }, [])

  const updateAnalyser = useCallback(() => {
    if (!analyserRef.current) return
    const data = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteTimeDomainData(data)
    setAnalyserData(new Uint8Array(data))
    animFrameRef.current = requestAnimationFrame(updateAnalyser)
  }, [])

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      setAudioBlob(null)
      chunksRef.current = []

      // With headphones, disable ALL automatic audio processing —
      // echoCancellation fights the backing track, noiseSuppression
      // removes quiet passages, and autoGainControl causes sudden
      // volume drops/spikes that sound like distortion.
      const headphones = !!options?.useHeadphones
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: !headphones,
        noiseSuppression: !headphones,
        autoGainControl: false, // always off — causes volume pumping / distortion
      }
      if (options?.deviceId) {
        audioConstraints.deviceId = { exact: options.deviceId }
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      })

      // Set up AudioContext + AnalyserNode for waveform
      const audioContext = new AudioContext()
      // Resume AudioContext — required on iOS/mobile where it starts suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      audioContextRef.current = audioContext
      analyserRef.current = analyser

      // Play backing track through the SAME AudioContext to avoid iOS audio session conflict
      if (options?.backingTrackBuffer) {
        try {
          // Copy the buffer since decodeAudioData detaches it
          const bufferCopy = options.backingTrackBuffer.slice(0)
          const audioBuffer = await audioContext.decodeAudioData(bufferCopy)
          const backingSource = audioContext.createBufferSource()
          backingSource.buffer = audioBuffer
          backingSource.connect(audioContext.destination)
          backingSource.onended = () => {
            setBackingPlaying(false)
            backingSourceRef.current = null
          }
          backingSource.start(0)
          backingSourceRef.current = backingSource
          setBackingPlaying(true)
        } catch (err) {
          console.warn('[useVocalRecorder] Failed to play backing track:', err)
          setBackingPlaying(false)
        }
      }

      // Determine best supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setAudioBlob(blob)
        // Stop backing track
        try { backingSourceRef.current?.stop() } catch {}
        backingSourceRef.current = null
        setBackingPlaying(false)
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop())
        if (audioContextRef.current?.state !== 'closed') {
          audioContextRef.current?.close()
        }
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      }

      recorder.start(250) // Collect data every 250ms
      startTimeRef.current = Date.now()
      setIsRecording(true)
      setIsPaused(false)

      // Duration timer
      timerRef.current = setInterval(() => {
        setDurationMs(Date.now() - startTimeRef.current)
      }, 100)

      // Start analyser animation
      updateAnalyser()
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'יש לאשר גישה למיקרופון כדי להקליט'
          : 'שגיאה בהפעלת ההקלטה'
      setError(message)
    }
  }, [updateAnalyser, options?.backingTrackBuffer, options?.deviceId, options?.useHeadphones])

  const stopRecording = useCallback(() => {
    // Stop backing track
    try { backingSourceRef.current?.stop() } catch {}
    backingSourceRef.current = null
    setBackingPlaying(false)

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsRecording(false)
    setIsPaused(false)
  }, [])

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause()
      setIsPaused(true)
    }
  }, [])

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume()
      setIsPaused(false)
    }
  }, [])

  const reset = useCallback(() => {
    setAudioBlob(null)
    setDurationMs(0)
    setError(null)
    setAnalyserData(null)
    chunksRef.current = []
  }, [])

  return {
    isRecording,
    isPaused,
    durationMs,
    analyserData,
    audioBlob,
    error,
    backingPlaying,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    reset,
  }
}
